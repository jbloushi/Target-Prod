const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
    organization: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        index: true
    },
    name: {
        type: String,
        required: [true, 'Please provide a name']
    },
    email: {
        type: String,
        required: [true, 'Please provide an email'],
        unique: true,
        lowercase: true,
        match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
    },
    phone: {
        type: String,
        unique: true,
        sparse: true
    },
    role: {
        type: String,
        enum: ['client', 'staff', 'admin', 'driver', 'accounting', 'manager', 'org_manager', 'org_agent'],
        default: 'client'
    },
    password: {
        type: String,
        required: [true, 'Please provide a password'],
        minlength: 8,
        select: false
    },
    otp: {
        code: String,
        expiresAt: Date
    },
    // [DEPRECATED] Moved to Organization
    // 3PL Profit Engine
    // 3PL Profit Engine
    markup: {
        type: {
            type: String,
            enum: ['PERCENTAGE', 'FLAT', 'COMBINED', 'FORMULA'],
            default: 'PERCENTAGE'
        },
        // Legacy single value for PERC/FLAT
        value: {
            type: Number,
            default: 15
        },
        // Explicit values for COMBINED support
        percentageValue: {
            type: Number,
            default: 0
        },
        flatValue: {
            type: Number,
            default: 0
        },
        formula: {
            type: String,
            default: null
        }
    },

    // Carrier Configuration
    carrierConfig: {
        preferredCarrier: {
            type: String,
            enum: ['DGR', 'DHL', 'FEDEX', 'UPS', 'MOCK'],
            default: 'DGR'
        },
        // Trade / Tax IDs
        taxId: { type: String, trim: true }, // General Tax ID
        eori: { type: String, trim: true },  // EORI Number (EU)
        vatNo: { type: String, trim: true }, // VAT Number
        traderType: {
            type: String,
            enum: ['business', 'private', 'charity'],
            default: 'business'
        },
        defaultReference: { type: String, trim: true } // Default Shipper Reference pattern
    },



    // Organization Agent Policy (MVP foundation)
    agentPolicy: {
        allowedCarriers: [{
            type: String,
            enum: ['DGR', 'DHL', 'FEDEX', 'UPS', 'MOCK']
        }],
        defaultCarrier: {
            type: String,
            enum: ['DGR', 'DHL', 'FEDEX', 'UPS', 'MOCK']
        },
        markupOverride: {
            type: {
                type: String,
                enum: ['PERCENTAGE', 'FLAT', 'COMBINED', 'FORMULA']
            },
            percentageValue: Number,
            flatValue: Number,
            formula: String
        },
        markupByCarrier: {
            DGR: {
                type: { type: String, enum: ['PERCENTAGE', 'FLAT', 'COMBINED'] },
                percentageValue: Number,
                flatValue: Number
            },
            DHL: {
                type: { type: String, enum: ['PERCENTAGE', 'FLAT', 'COMBINED'] },
                percentageValue: Number,
                flatValue: Number
            },
            FEDEX: {
                type: { type: String, enum: ['PERCENTAGE', 'FLAT', 'COMBINED'] },
                percentageValue: Number,
                flatValue: Number
            },
            UPS: {
                type: { type: String, enum: ['PERCENTAGE', 'FLAT', 'COMBINED'] },
                percentageValue: Number,
                flatValue: Number
            },
            MOCK: {
                type: { type: String, enum: ['PERCENTAGE', 'FLAT', 'COMBINED'] },
                percentageValue: Number,
                flatValue: Number
            }
        }
    },

    // Saved Addresses (for Sender selection)
    addresses: [{
        label: {
            type: String,
            default: 'Default'  // "Home", "Office", "Warehouse"
        },
        isDefault: {
            type: Boolean,
            default: false
        },
        company: String,
        contactPerson: String,
        streetLines: [String],
        buildingName: String,
        unitNumber: String,
        area: String,
        landmark: String,
        city: String,
        postalCode: String,
        countryCode: {
            type: String,
            default: 'KW'  // Kuwait default
        },
        phone: String,
        phoneCountryCode: {
            type: String,
            default: '+965'
        },
        email: String,
        additionalEmails: [String],
        additionalPhones: [String],

        // Compliance & Trade Fields
        vatNumber: String,
        eoriNumber: String,
        taxId: String,
        traderType: {
            type: String,
            enum: ['business', 'private', 'charity'],
            default: 'business'
        },
        reference: String
    }],

    apiKeyHash: {
        type: String,
        select: false
    },
    apiKeyLast4: {
        type: String
    },
    // [DEPRECATED] Moved to Organization
    balance: {
        type: Number,
        default: 0
    },
    // [DEPRECATED] Moved to Organization
    creditLimit: {
        type: Number,
        default: 0
    },
    active: {
        type: Boolean,
        default: true,
        select: false
    }
}, {
    timestamps: true
});

// Indexes for performance
userSchema.index({ organization: 1, role: 1 });
userSchema.index({ role: 1 });

// Hash password before saving
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

// Instance method to check password
userSchema.methods.correctPassword = async function (candidatePassword, userPassword) {
    return await bcrypt.compare(candidatePassword, userPassword);
};

userSchema.methods.generateApiKey = function () {
    const rawBytes = crypto.randomBytes(32).toString('hex');
    const fullKey = `${this._id.toString()}.${rawBytes}`;

    // Hash the full key using bcrypt
    this.apiKeyHash = bcrypt.hashSync(fullKey, 12);
    this.apiKeyLast4 = rawBytes.slice(-4);

    return fullKey; // Return once to the controller
};

const auditPlugin = require('../plugins/audit.plugin');
userSchema.plugin(auditPlugin);

const User = mongoose.model('User', userSchema);

module.exports = User;
