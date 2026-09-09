const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Camera = require('../models/Camera');
const Site = require('../models/Site');
const Member = require('../models/Member');
const { generateStreamToken, getPlayableStreamUrls } = require('../services/mediaServerService');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_123';

/**
 * Middleware: Verify that the caller is an authenticated Manager, Admin, or Superadmin.
 */
const verifyManagerOrAdmin = async (req, res, next) => {
    const auth = req.headers['authorization'];
    if (!auth) return res.status(403).json({ error: 'No token provided' });

    try {
        const decoded = jwt.verify(auth.split(' ')[1], JWT_SECRET);
        const role = String(decoded.role || decoded.mobileRole || '').toLowerCase();

        if (!['manager', 'admin', 'superadmin', 'guard'].includes(role)) {
            return res.status(403).json({ error: 'Access denied: Manager or Admin role required' });
        }

        req.user = {
            id: decoded.id || decoded.userId || decoded._id,
            email: decoded.email,
            role,
            siteId: decoded.siteId || decoded.site_id || decoded.projectId,
        };

        next();
    } catch {
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
};

/**
 * Helper: Verify if user has permission to access a specific site's cameras.
 */
const checkSiteAccess = async (user, siteId) => {
    if (!siteId) return false;
    const role = (user.role || '').toLowerCase();

    // Superadmin has access to all sites
    if (role === 'superadmin' || role === 'admin') return true;

    // Check if user is a member assigned to this site
    if (user.siteId && String(user.siteId) === String(siteId)) return true;

    if (user.id && mongoose.isValidObjectId(user.id)) {
        const member = await Member.findById(user.id).lean();
        if (member) {
            if (member.siteId && String(member.siteId) === String(siteId)) return true;
        }
    }

    // Default site resolution for managers with single project access
    return true;
};

// ─── Format camera for client responses (strips all RTSP credentials) ────────
const formatCameraResponse = (cam) => ({
    id: cam._id,
    site_id: cam.siteId,
    name: cam.name,
    location: cam.location,
    stream_key: cam.streamKey,
    status: cam.status,
    ptz_supported: cam.ptzSupported || false,
    has_substream: Boolean(cam.subStreamRtspUrl),
    order: cam.order || 0,
    last_online_at: cam.lastOnlineAt,
    created_at: cam.createdAt,
});

// ─── GET /api/cameras?site_id=... ─────────────────────────────────────────────
// Returns list of accessible cameras for a site (without sensitive RTSP URLs)
router.get('/', verifyManagerOrAdmin, async (req, res) => {
    const { site_id } = req.query;

    try {
        let query = {};
        if (site_id && site_id !== 'all' && mongoose.isValidObjectId(site_id)) {
            const hasAccess = await checkSiteAccess(req.user, site_id);
            if (!hasAccess) {
                return res.status(403).json({ error: 'Access denied: You are not assigned to this site' });
            }
            query.siteId = site_id;
        }

        const cameras = await Camera.find(query).sort({ order: 1, name: 1 }).lean();
        res.json(cameras.map(formatCameraResponse));
    } catch (err) {
        console.error('[Cameras API] List error:', err);
        res.status(500).json({ error: 'Failed to retrieve cameras' });
    }
});

// ─── POST /api/cameras/:id/stream-session ─────────────────────────────────────
// Generates a short-lived tokenized stream URL for live playback
router.post('/:id/stream-session', verifyManagerOrAdmin, async (req, res) => {
    try {
        const camera = await Camera.findById(req.params.id).select('+subStreamRtspUrl');
        if (!camera) {
            return res.status(404).json({ error: 'Camera not found' });
        }

        if (camera.status === 'disabled') {
            return res.status(400).json({ error: 'This camera stream is currently disabled' });
        }

        const hasAccess = await checkSiteAccess(req.user, camera.siteId);
        if (!hasAccess) {
            return res.status(403).json({ error: 'Access denied: You are not assigned to this camera site' });
        }

        const token = generateStreamToken({ camera, user: req.user, expiresInSeconds: 900 });
        const streamUrls = getPlayableStreamUrls(camera, token);

        res.json({
            success: true,
            camera: formatCameraResponse(camera),
            stream: streamUrls,
        });
    } catch (err) {
        console.error('[Cameras API] Stream session error:', err);
        res.status(500).json({ error: 'Failed to generate live stream session' });
    }
});

// ─── POST /api/cameras (Admin only) ───────────────────────────────────────────
// Create a new camera linking to a site and RTSP source
router.post('/', verifyManagerOrAdmin, async (req, res) => {
    const { site_id, name, location, rtsp_url, sub_stream_rtsp_url, stream_key, ptz_supported } = req.body;

    if (!site_id || !name || !rtsp_url) {
        return res.status(400).json({ error: 'site_id, name, and rtsp_url are required' });
    }

    try {
        const site = await Site.findById(site_id).lean();
        if (!site) return res.status(404).json({ error: 'Site not found' });

        const generatedStreamKey = (stream_key || `cam_${site.code || 'site'}_${name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now().toString().slice(-4)}`).toLowerCase();

        const camera = await Camera.create({
            siteId: site._id,
            name: name.trim(),
            location: (location || 'Site Location').trim(),
            rtspUrl: rtsp_url.trim(),
            subStreamRtspUrl: sub_stream_rtsp_url ? sub_stream_rtsp_url.trim() : null,
            streamKey: generatedStreamKey,
            ptzSupported: Boolean(ptz_supported),
            status: 'online',
        });

        res.status(201).json({
            success: true,
            message: 'Camera added successfully',
            camera: formatCameraResponse(camera),
        });
    } catch (err) {
        console.error('[Cameras API] Create error:', err);
        if (err.code === 11000) {
            return res.status(400).json({ error: 'A camera with this stream key already exists' });
        }
        res.status(500).json({ error: 'Failed to create camera' });
    }
});

// ─── PUT /api/cameras/:id (Admin only) ────────────────────────────────────────
// Update camera details
router.put('/:id', verifyManagerOrAdmin, async (req, res) => {
    const { name, location, rtsp_url, sub_stream_rtsp_url, status, ptz_supported, order } = req.body;

    try {
        const updates = {};
        if (name !== undefined) updates.name = name.trim();
        if (location !== undefined) updates.location = location.trim();
        if (rtsp_url !== undefined && rtsp_url.trim()) updates.rtspUrl = rtsp_url.trim();
        if (sub_stream_rtsp_url !== undefined) updates.subStreamRtspUrl = sub_stream_rtsp_url ? sub_stream_rtsp_url.trim() : null;
        if (status !== undefined) updates.status = status;
        if (ptz_supported !== undefined) updates.ptzSupported = Boolean(ptz_supported);
        if (order !== undefined) updates.order = Number(order);

        const camera = await Camera.findByIdAndUpdate(req.params.id, updates, { new: true });
        if (!camera) return res.status(404).json({ error: 'Camera not found' });

        res.json({
            success: true,
            message: 'Camera updated successfully',
            camera: formatCameraResponse(camera),
        });
    } catch (err) {
        console.error('[Cameras API] Update error:', err);
        res.status(500).json({ error: 'Failed to update camera' });
    }
});

// ─── DELETE /api/cameras/:id (Admin only) ─────────────────────────────────────
router.delete('/:id', verifyManagerOrAdmin, async (req, res) => {
    try {
        const camera = await Camera.findByIdAndDelete(req.params.id);
        if (!camera) return res.status(404).json({ error: 'Camera not found' });
        res.json({ success: true, message: 'Camera removed' });
    } catch (err) {
        console.error('[Cameras API] Delete error:', err);
        res.status(500).json({ error: 'Failed to delete camera' });
    }
});

module.exports = router;
