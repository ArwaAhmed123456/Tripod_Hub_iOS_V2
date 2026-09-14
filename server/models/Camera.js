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
        // A Dahua P2P device has no LAN RTSP address until its DSS/Dahua
        // integration has been provisioned.  All normal cameras still require
        // an RTSP source.
        required: function () { return this.connectionType !== 'dss_p2p'; },
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
    // How this device is connected to Tripod Hub.  P2P records are retained in
    // the site inventory but cannot produce a browser stream until Dahua/DSS
    // issues an approved stream/API integration.
    connectionType: {
        type: String,
        enum: ['rtsp', 'dss_p2p'],
        default: 'rtsp',
    },
    integrationStatus: {
        type: String,
        enum: ['ready', 'awaiting_dss_api'],
        default: 'ready',
    },
    dssDeviceId: {
        type: String,
        default: null,
        trim: true,
    },
    deviceModel: {
        type: String,
        default: null,
        trim: true,
    },
    audioSupported: {
        type: Boolean,
        default: false,
    },
    lightSupported: {
        type: Boolean,
        default: false,
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
        select: false, // Never returned to clients — used server-side for PTZ CGI calls only
    },
    // Optional: human-readable ONVIF host (no credentials) shown in admin UI for reference
    onvifHost: {
        type: String,
        default: null,
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
