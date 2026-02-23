const mongoose = require('mongoose');
const addressSchema = require('./addressSchema');

/**
 * Organization: Root entity for grouping users, addresses, and financials.
 */
const organizationSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Organization name is required'],
        trim: true,
        index: true
    },

    // Type of Organization
    type: {
        type: String,
        enum: ['BUSINESS', 'INDIVIDUAL', 'GOVERNMENT', 'client', 'partner', 'internal'],
        default: 'BUSINESS'
    },

    taxId: {
        type: String,
        trim: true
    },

    // Financials (Centralized)
    balance: {
        type: Number,
        default: 0
    },
    creditLimit: {
        type: Number,
        default: 0
    },
    unappliedBalance: {
        type: Number,
        default: 0
    },
    currency: {
        type: String,
        default: 'KWD'
    },



    allowedCarriers: [{
        type: String,
        enum: ['DGR', 'DHL', 'FEDEX', 'UPS', 'MOCK']
    }],
    defaultCarrier: {
        type: String,
        enum: ['DGR', 'DHL', 'FEDEX', 'UPS', 'MOCK'],
        default: 'DGR'
    },

    // Resources
    members: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],

    // Shared Address Book
    addresses: [addressSchema],

    // Settings & Configuration

    // 3PL Markup Engine
    // Determines the final price shown to client members
    markup: {
        type: {
            type: String,
            enum: ['PERCENTAGE', 'FLAT', 'COMBINED'],
            default: 'PERCENTAGE'
        },
        percentageValue: {
            type: Number,
            default: 15 // e.g., 15%
        },
        flatValue: {
            type: Number,
            default: 0 // e.g., 2.000 KD
        },
        byCarrier: {
            DGR: {
                type: { type: String, enum: ['PERCENTAGE', 'FLAT', 'COMBINED'] },
                percentageValue: { type: Number },
                flatValue: { type: Number }
            },
            DHL: {
                type: { type: String, enum: ['PERCENTAGE', 'FLAT', 'COMBINED'] },
                percentageValue: { type: Number },
                flatValue: { type: Number }
            },
            FEDEX: {
                type: { type: String, enum: ['PERCENTAGE', 'FLAT', 'COMBINED'] },
                percentageValue: { type: Number },
                flatValue: { type: Number }
            },
            UPS: {
                type: { type: String, enum: ['PERCENTAGE', 'FLAT', 'COMBINED'] },
                percentageValue: { type: Number },
                flatValue: { type: Number }
            },
            MOCK: {
                type: { type: String, enum: ['PERCENTAGE', 'FLAT', 'COMBINED'] },
                percentageValue: { type: Number },
                flatValue: { type: Number }
            }
        }
    },

    active: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Indexes

/**
 * Helper to Calculate Final Price based on Markup
 * @param {number} basePrice - The raw cost from carrier/system
 * @returns {number} Final price for the client
 */
organizationSchema.methods.calculatePrice = function (basePrice) {
    let finalPrice = basePrice;

    if (this.markup.type === 'PERCENTAGE' || this.markup.type === 'COMBINED') {
        finalPrice += basePrice * (this.markup.percentageValue / 100);
    }

    if (this.markup.type === 'FLAT' || this.markup.type === 'COMBINED') {
        finalPrice += this.markup.flatValue;
    }

};

const auditPlugin = require('../plugins/audit.plugin');
organizationSchema.plugin(auditPlugin);

const Organization = mongoose.model('Organization', organizationSchema);

module.exports = Organization;
