const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Camera = require('../models/Camera');
const Site = require('../models/Site');
const Admin = require('../models/Admin');
const Member = require('../models/Member');
const { generateStreamToken, getPlayableStreamUrls } = require('../services/mediaServerService');
const ptzService = require('../services/ptzService');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_123';

/**
 * Middleware: resolve the current account on every request.  The database is the
 * source of truth, which means Super Admin permission changes are immediate and
 * do not require a new login token.
 */
const verifyManagerOrAdmin = async (req, res, next) => {
    const auth = req.headers['authorization'];
    if (!auth) return res.status(403).json({ error: 'No token provided' });

    try {
        const decoded = jwt.verify(auth.split(' ')[1], JWT_SECRET);
        let record = await Admin.findById(decoded.id || decoded.userId || decoded._id).lean();
        let accountType = 'admin';
        if (!record) {
            record = await Member.findById(decoded.id || decoded.userId || decoded._id).lean();
            accountType = 'member';
        }
        if (!record || (record.is_active === false || record.isActive === false)) {
            return res.status(403).json({ error: 'Account is inactive or no longer exists' });
        }
        const role = String(accountType === 'admin' ? record.role : (record.mobileRole || record.role) || '').toLowerCase();
        const permissions = accountType === 'admin' ? record.granular_permissions : record.granularPermissions;
        const cameraOverride = accountType === 'admin'
            ? permissions?.camera_access_override
            : permissions?.cameraAccessOverride;
        const normalCameraRole = ['manager', 'admin', 'superadmin'].includes(role);
        if (!normalCameraRole && cameraOverride !== true) {
            return res.status(403).json({ error: 'Access denied: camera permission required' });
        }
        if (cameraOverride === false && role !== 'superadmin') {
            return res.status(403).json({ error: 'Access denied: camera permission has been revoked' });
        }

        req.user = {
            id: decoded.id || decoded.userId || decoded._id,
            email: decoded.email,
            role,
            siteId: decoded.siteId || decoded.site_id || decoded.projectId,
            accountType,
            record,
        };

        next();
    } catch {
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }
};

/**
 * Helper: Verify if user has permission to access a specific site.
 */
const checkSiteAccess = async (user, siteId) => {
    const role = (user.role || '').toLowerCase();
    if (role === 'superadmin') return true;

    const perms = await getUserPermissions(user);
    if (!perms) return false;
    if (perms.isSuperAdmin) return true;
    if (!perms.allowedSites || perms.allowedSites.length === 0) return true; // no restriction = all sites
    return perms.allowedSites.includes(String(siteId));
};

/**
 * Helper: Verify if user has permission to access a specific site's cameras or a specific camera.
 */
const getUserPermissions = async (user) => {
    if (!user.id) return null;
    const role = (user.role || '').toLowerCase();
    if (role === 'superadmin') return { isSuperAdmin: true };

    let record = await Admin.findById(user.id).lean();
    if (record) {
        return {
            allowedSites: record.granular_permissions?.allowed_sites?.map(String) || (record.site_id ? [String(record.site_id)] : []),
            allowedCameras: record.granular_permissions?.allowed_cameras?.map(String) || [],
            canViewCameras: record.granular_permissions?.camera_access_override !== false,
        };
    }

    record = await Member.findById(user.id).lean();
    if (record) {
        return {
            allowedSites: record.granularPermissions?.allowedSites?.map(String) || (record.siteId ? [String(record.siteId)] : []),
            allowedCameras: record.granularPermissions?.allowedCameras?.map(String) || [],
            canViewCameras: record.granularPermissions?.cameraAccessOverride !== false,
        };
    }

    return null;
};

// Used by the header to show the Cameras menu only to users who can actually
// use it. This deliberately resolves the account from the database each time.
router.get('/access', verifyManagerOrAdmin, async (req, res) => {
    const permissions = await getUserPermissions(req.user);
    res.json({ can_view_cameras: Boolean(permissions?.isSuperAdmin || permissions?.canViewCameras !== false) });
});

const canManageCameras = async (user) => {
    if (user.role === 'superadmin' || user.role === 'admin') return true;
    const perms = user.accountType === 'admin'
        ? user.record.granular_permissions
        : user.record.granularPermissions;
    return perms?.module_permissions?.can_manage_cameras === true || perms?.modulePermissions?.can_manage_cameras === true;
};

const checkCameraAccess = async (user, camera) => {
    const role = (user.role || '').toLowerCase();
    if (role === 'superadmin') return true;

    const perms = await getUserPermissions(user);
    if (!perms || perms.canViewCameras === false) return false;

    // If specific cameras are assigned, check if this camera is in the list
    if (perms.allowedCameras && perms.allowedCameras.length > 0) {
        return perms.allowedCameras.includes(String(camera._id));
    }

    // Otherwise check if camera's site is allowed
    if (perms.allowedSites && perms.allowedSites.length > 0) {
        return perms.allowedSites.includes(String(camera.siteId));
    }

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
    connection_type: cam.connectionType || 'rtsp',
    integration_status: cam.integrationStatus || 'ready',
    dss_device_id: cam.dssDeviceId || null,
    device_model: cam.deviceModel || null,
    audio_supported: Boolean(cam.audioSupported),
    light_supported: Boolean(cam.lightSupported),
    ptz_supported: cam.ptzSupported || false,
    // Let the UI know whether an ONVIF/CGI address is configured so it can
    // show PTZ controls confidently (the actual URL is never sent to the client).
    has_onvif: Boolean(cam.onvifUrl || cam.rtspUrl),
    onvif_host: cam.onvifHost || null,   // display-only, no credentials
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

        let cameras = await Camera.find(query).sort({ order: 1, name: 1 }).lean();
        if (req.user.role !== 'superadmin') {
            const filtered = [];
            for (const cam of cameras) {
                if (await checkCameraAccess(req.user, cam)) {
                    filtered.push(cam);
                }
            }
            cameras = filtered;
        }
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

        if (camera.integrationStatus === 'awaiting_dss_api' || camera.connectionType === 'dss_p2p') {
            return res.status(409).json({
                error: 'This Dahua P2P camera is registered for this site, but its DSS stream integration has not yet been issued. Ask the CCTV provider for the DSS API/stream-proxy endpoint or a local RTSP/ONVIF connection.'
            });
        }

        const hasAccess = await checkCameraAccess(req.user, camera);
        if (!hasAccess) {
            return res.status(403).json({ error: 'Access denied: You do not have permission to view this camera' });
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
    const { site_id, name, location, rtsp_url, sub_stream_rtsp_url, stream_key, ptz_supported, onvif_url, onvif_host,
        connection_type = 'rtsp', integration_status, dss_device_id, device_model, audio_supported, light_supported } = req.body;

    if (!site_id || !name || (connection_type !== 'dss_p2p' && !rtsp_url)) {
        return res.status(400).json({ error: 'site_id and name are required; rtsp_url is required unless this is a Dahua P2P integration record' });
    }

    try {
        if (!(await canManageCameras(req.user))) return res.status(403).json({ error: 'Access denied: manage camera permission required' });
        if (!(await checkSiteAccess(req.user, site_id))) return res.status(403).json({ error: 'Access denied: You are not assigned to this site' });
        const site = await Site.findById(site_id).lean();
        if (!site) return res.status(404).json({ error: 'Site not found' });

        const generatedStreamKey = (stream_key || `cam_${site.code || 'site'}_${name.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now().toString().slice(-4)}`).toLowerCase();

        const camera = await Camera.create({
            siteId: site._id,
            name: name.trim(),
            location: (location || 'Site Location').trim(),
            rtspUrl: rtsp_url ? rtsp_url.trim() : null,
            subStreamRtspUrl: sub_stream_rtsp_url ? sub_stream_rtsp_url.trim() : null,
            streamKey: generatedStreamKey,
            ptzSupported: Boolean(ptz_supported),
            onvifUrl: onvif_url ? onvif_url.trim() : null,
            onvifHost: onvif_host ? onvif_host.trim() : null,
            status: 'online',
            connectionType: connection_type,
            integrationStatus: integration_status || (connection_type === 'dss_p2p' ? 'awaiting_dss_api' : 'ready'),
            dssDeviceId: dss_device_id ? dss_device_id.trim() : null,
            deviceModel: device_model ? device_model.trim() : null,
            audioSupported: Boolean(audio_supported),
            lightSupported: Boolean(light_supported),
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
    const { name, location, rtsp_url, sub_stream_rtsp_url, status, ptz_supported, order, onvif_url, onvif_host,
        connection_type, integration_status, dss_device_id, device_model, audio_supported, light_supported } = req.body;

    try {
        if (!(await canManageCameras(req.user))) return res.status(403).json({ error: 'Access denied: manage camera permission required' });
        const existing = await Camera.findById(req.params.id);
        if (!existing) return res.status(404).json({ error: 'Camera not found' });
        if (!(await checkCameraAccess(req.user, existing))) return res.status(403).json({ error: 'Access denied: You are not assigned to this camera' });
        const updates = {};
        if (name !== undefined) updates.name = name.trim();
        if (location !== undefined) updates.location = location.trim();
        if (rtsp_url !== undefined && rtsp_url.trim()) updates.rtspUrl = rtsp_url.trim();
        if (sub_stream_rtsp_url !== undefined) updates.subStreamRtspUrl = sub_stream_rtsp_url ? sub_stream_rtsp_url.trim() : null;
        if (status !== undefined) updates.status = status;
        if (ptz_supported !== undefined) updates.ptzSupported = Boolean(ptz_supported);
        if (order !== undefined) updates.order = Number(order);
        if (onvif_url !== undefined) updates.onvifUrl = onvif_url ? onvif_url.trim() : null;
        if (onvif_host !== undefined) updates.onvifHost = onvif_host ? onvif_host.trim() : null;
        if (connection_type !== undefined) updates.connectionType = connection_type;
        if (integration_status !== undefined) updates.integrationStatus = integration_status;
        if (dss_device_id !== undefined) updates.dssDeviceId = dss_device_id ? dss_device_id.trim() : null;
        if (device_model !== undefined) updates.deviceModel = device_model ? device_model.trim() : null;
        if (audio_supported !== undefined) updates.audioSupported = Boolean(audio_supported);
        if (light_supported !== undefined) updates.lightSupported = Boolean(light_supported);

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
        if (!(await canManageCameras(req.user))) return res.status(403).json({ error: 'Access denied: manage camera permission required' });
        const existing = await Camera.findById(req.params.id);
        if (!existing) return res.status(404).json({ error: 'Camera not found' });
        if (!(await checkCameraAccess(req.user, existing))) return res.status(403).json({ error: 'Access denied: You are not assigned to this camera' });
        const camera = await Camera.findByIdAndDelete(req.params.id);
        if (!camera) return res.status(404).json({ error: 'Camera not found' });
        res.json({ success: true, message: 'Camera removed' });
    } catch (err) {
        console.error('[Cameras API] Delete error:', err);
        res.status(500).json({ error: 'Failed to delete camera' });
    }
});

// ─── POST /api/cameras/:id/ptz ────────────────────────────────────────────────
// Send a PTZ start command (continuous move until /ptz/stop is called).
// Body: { action: 'start'|'stop'|'preset', direction?: string, speed?: number, preset?: number, channel?: number }
//
// Permission: same as stream-session — Manager+ with camera access.
// Credentials NEVER leave the server — the client only sends direction/speed.
router.post('/:id/ptz', verifyManagerOrAdmin, async (req, res) => {
    try {
        const camera = await Camera.findById(req.params.id).select('+rtspUrl +onvifUrl');
        if (!camera) return res.status(404).json({ error: 'Camera not found' });

        if (!camera.ptzSupported) {
            return res.status(400).json({ error: 'This camera does not support PTZ control' });
        }

        const hasAccess = await checkCameraAccess(req.user, camera);
        if (!hasAccess) {
            return res.status(403).json({ error: 'Access denied: You do not have permission to control this camera' });
        }

        const { action = 'start', direction, speed = 5, preset, channel = 0 } = req.body;

        let result;

        switch (action) {
            case 'start': {
                if (!direction) return res.status(400).json({ error: 'direction is required for action=start' });
                result = await ptzService.start(camera, direction, speed, channel);
                break;
            }
            case 'stop': {
                result = await ptzService.stop(camera, direction || null, channel);
                break;
            }
            case 'goto_preset': {
                if (preset === undefined) return res.status(400).json({ error: 'preset is required for action=goto_preset' });
                result = await ptzService.gotoPreset(camera, preset, channel);
                break;
            }
            case 'set_preset': {
                // Only admins/superadmins may write new presets
                const role = (req.user.role || '').toLowerCase();
                if (!['admin', 'superadmin'].includes(role)) {
                    return res.status(403).json({ error: 'Only admins can save PTZ presets' });
                }
                if (preset === undefined) return res.status(400).json({ error: 'preset is required for action=set_preset' });
                result = await ptzService.setPreset(camera, preset, channel);
                break;
            }
            default:
                return res.status(400).json({ error: `Unknown PTZ action: ${action}` });
        }

        res.json({ success: true, action, direction: direction || null, result: String(result || 'OK') });
    } catch (err) {
        console.error('[Cameras API] PTZ error:', err.message);
        // Surface a friendly error — camera may be unreachable or reject auth
        const isNetworkErr = err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET';
        res.status(502).json({
            error: isNetworkErr
                ? 'Unable to reach camera for PTZ command. Check that the camera HTTP port (80) is accessible from the server.'
                : err.message || 'PTZ command failed',
        });
    }
});

// ─── GET /api/cameras/:id/ptz/capabilities ────────────────────────────────────
// Returns whether PTZ is supported + list of valid directions for UI rendering.
router.get('/:id/ptz/capabilities', verifyManagerOrAdmin, async (req, res) => {
    try {
        const camera = await Camera.findById(req.params.id);
        if (!camera) return res.status(404).json({ error: 'Camera not found' });

        const hasAccess = await checkCameraAccess(req.user, camera);
        if (!hasAccess) {
            return res.status(403).json({ error: 'Access denied' });
        }

        res.json({
            ptz_supported: camera.ptzSupported || false,
            directions: Object.keys(ptzService.DIRECTION_MAP),
            presets: [1, 2, 3, 4, 5, 6, 7, 8],   // Dahua IPC supports up to 255; show 8 in UI
        });
    } catch (err) {
        console.error('[Cameras API] PTZ capabilities error:', err);
        res.status(500).json({ error: 'Failed to get PTZ capabilities' });
    }
});

module.exports = router;
