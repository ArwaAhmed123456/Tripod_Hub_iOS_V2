const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_123';
const MEDIA_SERVER_URL = (process.env.MEDIA_SERVER_URL || 'http://localhost:8889').replace(/\/$/, '');
const MEDIA_SERVER_HLS_URL = (process.env.MEDIA_SERVER_HLS_URL || process.env.MEDIA_SERVER_URL || 'http://localhost:8888').replace(/\/$/, '');

/**
 * Generate a short-lived token for accessing a specific camera stream.
 * Valid for 15 minutes by default.
 */
function generateStreamToken({ camera, user, expiresInSeconds = 900 }) {
    const payload = {
        sub: user.id || user._id || user.email,
        role: user.role,
        streamKey: camera.streamKey,
        siteId: String(camera.siteId),
        type: 'camera_stream_access'
    };

    return jwt.sign(payload, JWT_SECRET, { expiresIn: expiresInSeconds });
}

/**
 * Verify a stream access token.
 */
function verifyStreamToken(token, expectedStreamKey) {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.type !== 'camera_stream_access') return false;
        if (expectedStreamKey && decoded.streamKey !== expectedStreamKey) return false;
        return decoded;
    } catch {
        return false;
    }
}

/**
 * Construct secure stream URLs (WebRTC WHEP + HLS) for a camera.
 */
function getPlayableStreamUrls(camera, token) {
    const streamKey = camera.streamKey;
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';

    return {
        stream_key: streamKey,
        webrtc_whep_url: `${MEDIA_SERVER_URL}/${streamKey}/whep${tokenParam}`,
        hls_url: `${MEDIA_SERVER_HLS_URL}/${streamKey}/index.m3u8${tokenParam}`,
        low_res_hls_url: camera.subStreamRtspUrl
            ? `${MEDIA_SERVER_HLS_URL}/${streamKey}_sub/index.m3u8${tokenParam}`
            : null,
        expires_in: 900,
    };
}

module.exports = {
    generateStreamToken,
    verifyStreamToken,
    getPlayableStreamUrls,
};
