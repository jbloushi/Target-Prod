const mongoose = require('mongoose');

const receiverSchema = new mongoose.Schema({
    // Who saved this receiver
    ownerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // Mobile is the unique key for lookup
    phone: {
        type: String,
        required: [true, 'Phone number is required'],
        index: true
    },
    phoneCountryCode: {
        type: String,
        default: '+965'
    },

    // Contact details
    company: String,
    contactPerson: {
        type: String,
        required: [true, 'Contact person name is required']
    },

    // Address
    streetLines: [String],
    city: String,
    postalCode: String,
    countryCode: {
        type: String,
        default: 'KW'
    },

    // Additional contact info
    email: String,
    additionalEmails: [String],
    additionalPhones: [String],

    // Metadata
    notes: String,
    lastUsed: Date
}, {
    timestamps: true
});

// Compound index: each user can have one receiver per phone
receiverSchema.index({ ownerId: 1, phone: 1 }, { unique: true });

const Receiver = mongoose.model('Receiver', receiverSchema);

module.exports = Receiver;
