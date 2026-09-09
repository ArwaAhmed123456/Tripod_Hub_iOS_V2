const mongoose = require('mongoose');

const cameraSchema = new mongoose.Schema({
    siteId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Site',
        required: true,
        index: true,
    },
    name: {
        type: String,
        required: true,
        trim: true,
    },
    location: {
        type: String,
        default: 'Main Entrance',
        trim: true,
    },
    // RTSP URL with credentials - hidden by default from normal queries to prevent credential leaks
    rtspUrl: {
        type: String,
        required: true,
        select: false, // Never returned unless explicitly queried with .select('+rtspUrl')
    },
    // Optional sub-stream for mobile / low-bandwidth data saving
    subStreamRtspUrl: {
        type: String,
        default: null,
        select: false,
    },
    // Unique stream key for media server path (e.g. site_64f_gate_1)
    streamKey: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
    },
    status: {
        type: String,
        enum: ['online', 'offline', 'disabled'],
        default: 'online',
    },
    // Optional: restrict access to specific manager IDs. Empty array = all managers assigned to siteId
    assignedManagers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Member',
    }],
    ptzSupported: {
        type: Boolean,
        default: false,
    },
    onvifUrl: {
        type: String,
        default: null,
        select: false,
    },
    order: {
        type: Number,
        default: 0,
    },
    lastOnlineAt: {
        type: Date,
        default: Date.now,
    },
}, { timestamps: true });

cameraSchema.index({ siteId: 1, status: 1 });

module.exports = mongoose.model('Camera', cameraSchema);
