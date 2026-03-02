const mongoose = require('mongoose');

const addressSchema = require('./addressSchema');
const { SHIPMENT_STATUSES, LEGACY_STATUS_MAP } = require('../constants/statusConstants');

const checkpointSchema = new mongoose.Schema({
  location: {
    type: addressSchema,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  estimatedArrival: {
    type: Date
  },
  reached: {
    type: Boolean,
    default: false
  },
  notes: String
});

// Accept both canonical and legacy statuses in the enum for backwards compatibility
const ALL_ACCEPTED_STATUSES = [...SHIPMENT_STATUSES, ...Object.keys(LEGACY_STATUS_MAP)];

const shipmentSchema = new mongoose.Schema({
  trackingNumber: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  origin: {
    type: addressSchema,
    required: true
  },
  destination: {
    type: addressSchema,
    required: true
  },
  checkpoints: [checkpointSchema],
  currentLocation: {
    type: addressSchema,
    required: true
  },
  status: {
    type: String,
    enum: ALL_ACCEPTED_STATUSES,
    default: 'draft',
    required: true
  },
  estimatedDelivery: {
    type: Date,
    required: true
  },
  history: [{
    location: addressSchema,
    status: {
      type: String,
      required: true
    },
    description: String,
    source: {
      type: String,
      enum: ['platform', 'carrier'],
      default: 'platform'
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  customer: {
    name: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true
    },
    phone: String,
    // Tax fields for Invoice
    vatNo: String,
    eori: String,
    taxId: String,
    traderType: { type: String, default: 'business' } // business or private
  },
  remarks: String, // Invoice Remarks
  reference: String, // Shipment Reference
  // Physical Parcels (Boxes)
  parcels: [{
    weight: { type: Number, required: true },
    dimensions: {
      length: Number,
      width: Number,
      height: Number
    },
    description: String,
    trackingReference: String
  }],
  // Customs Line Items (Content)
  items: [{
    description: String,
    quantity: {
      type: Number,
      min: 1,
      default: 1
    },
    weight: Number, // Net weight per item
    dimensions: {
      length: Number,
      width: Number,
      height: Number
    },
    declaredValue: {
      type: Number,
      default: 0
    },
    hsCode: String,
    sku: String,
    currency: { type: String, default: 'KWD' },
    countryOfOrigin: String
  }],
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Shipment must belong to a user']
  },
  organization: {
    type: mongoose.Schema.ObjectId,
    ref: 'Organization',
    index: true
  },
  assignedStaff: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    index: true
  },
  assignedDriver: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    index: true
  },
  labelUrl: String,
  awbUrl: String,
  invoiceUrl: String,
  dhlTrackingNumber: String,
  // Link back to the Pickup Request
  pickupRequest: {
    type: mongoose.Schema.ObjectId,
    ref: 'PickupRequest'
  },
  carrierCreatedAt: {
    type: Date
  },
  dhlConfirmed: {
    type: Boolean,
    default: false
  },
  dhlTrackingNumber: String, // Keep existing field

  price: Number,
  costPrice: Number, // Original DHL price before markup
  markup: {
    type: Number,
    default: 0 // Percentage markup applied
  },
  currency: {
    type: String,
    default: 'KWD'
  },
  incoterm: {
    type: String,
    enum: ['DAP', 'DDP'],
    default: 'DAP'
  },
  exportReason: {
    type: String,
    default: 'Sale'
  },
  hsCodeType: {
    type: String,
    enum: ['outbound', 'inbound', 'both'],
    default: 'outbound'
  },
  shipmentType: {
    type: String,
    enum: ['documents', 'package'],
    default: 'package'
  },
  packagingType: {
    type: String, // 'user', 'dhl_box', etc.
    default: 'user'
  },
  carrierCode: { type: String, default: 'DGR' }, // E.g., 'DGR', 'DHL'
  serviceCode: { type: String, default: 'P' }, // Carrier service code selected (e.g. 'P' for Express Worldwide)
  plannedDate: Date, // Scheduled date for shipping
  dangerousGoods: {
    contains: { type: Boolean, default: false },
    code: String, // UN Code
    description: String,
    hazardClass: String, // e.g. "3"
    packingGroup: String, // e.g. "II"
    properShippingName: String, // e.g. "Paint"
    declaration: String,
    serviceCode: String, // DHL Service Code (e.g. HC, HV)
    contentId: String, // DHL Content ID (e.g. 901, 967)
    customDescription: String, // Detailed description for payload
    dryIceWeight: Number // Net weight for UN1845
  },
  // Public tracking settings
  allowPublicLocationUpdate: {
    type: Boolean,
    default: false // When true, receivers can update destination via public link
  },
  allowPublicInfoUpdate: {
    type: Boolean,
    default: false // When true, receivers can update delivery notes/instructions
  },
  // Invoice & Custom Fields (DHL)
  gstPaid: { type: Boolean, default: false },
  payerOfVat: { type: String, enum: ['shipper', 'receiver'], default: 'receiver' },
  palletCount: { type: Number, default: 0 },
  packageMarks: String,
  receiverReference: String,
  senderContractNumber: { type: String, maxLength: 35 },
  receiverContractNumber: { type: String, maxLength: 35 },
  shipperAccount: String, // Optional override
  labelSettings: {
    format: { type: String, enum: ['pdf', 'zpl'], default: 'pdf' },
    signatureName: String,
    signatureTitle: String
  },
  // --- REFACTOR v2: Financial Safety ---
  pricingSnapshot: {
    carrierRate: Number, // Raw rate from carrier (Hidden from client)
    markup: Number,      // Calculated markup amount
    estimatedShipmentCost: Number, // Carrier rate + markup (without optional services)
    optionalServicesTotal: Number,
    optionalServices: [{
      serviceCode: String,
      serviceName: String,
      totalPrice: Number,
      currency: String
    }],
    totalPrice: Number,  // Final price to user (carrier + markup + optional services)
    currency: String,
    rateHash: String,    // Simple hash to detect changes
    expiresAt: Date,
    policySource: {
      type: String,
      enum: ['org_default', 'org_carrier', 'agent_default', 'agent_carrier', 'user_default', 'platform_default', 'system_fallback'],
      default: 'org_default'
    },
    rulesVersion: { type: String, default: 'v1' }
  },

  // --- REFACTOR v2: Idempotency & History ---
  bookingAttempts: [{
    attemptId: { type: String, required: true }, // UUID
    status: {
      type: String,
      enum: ['pending', 'succeeded', 'failed'],
      required: true
    },
    carrierShipmentId: String,
    error: String, // Sanitized error message
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  }],

  // --- REFACTOR v2: Document Storage Abstraction ---
  documents: [{
    type: { type: String, enum: ['label', 'waybill', 'invoice', 'customs'], required: true },
    format: { type: String, default: 'pdf' },
    url: String, // Signed URL or pseudo-url
    storageKey: String, // S3 Key or File Path
    mime: String,
    size: Number,
    createdAt: { type: Date, default: Date.now }
  }],

  paid: {
    type: Boolean,
    default: false,
    index: true
  },
  totalPaid: {
    type: Number,
    default: 0
  },
  remainingBalance: {
    type: Number,
    default: 0
  },
  financeHold: {
    status: {
      type: Boolean,
      default: false
    },
    reason: String,
    checkedAt: Date,
    availableCredit: Number,
    requiredAmount: Number
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// --- Virtuals ---
shipmentSchema.virtual('isFinanciallyLocked').get(function () {
  // If not booked at all (no dhlConfirmed or costPrice), it's open
  if (!this.dhlConfirmed) return false;

  // Statuses that are past the "Point of No Return" for editing
  // Even if booked, we allow edits in 'ready_for_pickup' and 'picked_up' via the new re-rating flow.
  // We LOCK only when it's moved further down the chain.
  const lockedStatuses = ['in_transit', 'out_for_delivery', 'delivered', 'cancelled'];
  return lockedStatuses.includes(this.status);
});


shipmentSchema.set('toJSON', { virtuals: true });
shipmentSchema.set('toObject', { virtuals: true });

// Optimization Indexes
shipmentSchema.index({ user: 1 });
shipmentSchema.index({ status: 1 });
shipmentSchema.index({ createdAt: -1 });
shipmentSchema.index({ 'customer.email': 1 });
shipmentSchema.index({ user: 1, createdAt: -1 });
shipmentSchema.index({ organization: 1, createdAt: -1 });
shipmentSchema.index({ paid: 1, createdAt: -1 });
shipmentSchema.index({ status: 1, createdAt: -1 });

// Helper function to calculate distance between two points using Haversine formula
function calculateDistance(point1, point2) {
  if (!point1 || !point2) return 0;
  // Placeholder - implementation in controller
  return 0;
}

function toRad(degrees) {
  return degrees * Math.PI / 180;
}

// --- Webhook Triggers ---
shipmentSchema.pre('save', function (next) {
  this.$locals.wasNew = this.isNew;
  this.$locals.statusChanged = this.isModified('status');
  next();
});

shipmentSchema.post('save', function (doc) {
  if (doc.organization) {
    // Fire-and-forget webhook dispatcher
    const WebhookDispatcher = require('../services/WebhookDispatcher');
    if (doc.$locals.wasNew) {
      WebhookDispatcher.dispatch('shipment.created', doc.organization, doc.toObject());
    } else if (doc.$locals.statusChanged) {
      WebhookDispatcher.dispatch('shipment.status_updated', doc.organization, doc.toObject());
    }
  }
});

const Shipment = mongoose.model('Shipment', shipmentSchema);

module.exports = Shipment;
