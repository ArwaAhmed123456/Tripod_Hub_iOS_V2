/**
 * ptzService.js
 *
 * Dahua IPC HTTP CGI PTZ control helper.
 *
 * Dahua cameras expose a CGI API at:
 *   http://<ip>/cgi-bin/ptz.cgi?action=start&channel=0&code=<Direction>&arg1=0&arg2=<speed>&arg3=0
 *
 * This service proxies PTZ commands from the backend so:
 *  1. Camera credentials are NEVER sent to the browser.
 *  2. Permission checks happen server-side before any movement.
 *  3. Works identically whether the user is on a desktop browser or iPhone.
 *
 * Supported codes (Dahua CGI PTZ standard):
 *   Up / Down / Left / Right / LeftUp / LeftDown / RightUp / RightDown
 *   ZoomTele (zoom in) / ZoomWide (zoom out)
 *   FocusNear / FocusFar
 *   GotoPreset (arg1 = preset index)
 *   SetPreset   (arg1 = preset index)
 *   ClearPreset (arg1 = preset index)
 *   AutoFocus
 */

const axios = require('axios');

// Map our clean API names to Dahua CGI codes
const DIRECTION_MAP = {
    up: 'Up',
    down: 'Down',
    left: 'Left',
    right: 'Right',
    up_left: 'LeftUp',
    up_right: 'RightUp',
    down_left: 'LeftDown',
    down_right: 'RightDown',
    zoom_in: 'ZoomTele',
    zoom_out: 'ZoomWide',
    focus_near: 'FocusNear',
    focus_far: 'FocusFar',
    auto_focus: 'AutoFocus',
};

/**
 * Parse an RTSP or ONVIF URL into host + credentials.
 * Handles formats like:
 *   rtsp://admin:pass@192.168.1.100:554/stream1
 *   http://192.168.1.100:80
 *
 * Returns { host, port, username, password } or null on failure.
 */
function parseCredentials(url) {
    if (!url) return null;
    try {
        // Normalise: replace rtsp:// with http:// so URL can parse it
        const normalised = url.replace(/^rtsp:\/\//i, 'http://').replace(/^onvif:\/\//i, 'http://');
        const parsed = new URL(normalised);
        return {
            host: parsed.hostname,
            port: parsed.port || '80',
            username: parsed.username ? decodeURIComponent(parsed.username) : null,
            password: parsed.password ? decodeURIComponent(parsed.password) : null,
        };
    } catch {
        return null;
    }
}

/**
 * Build the Dahua HTTP CGI base URL for a camera.
 * Falls back to extracting host/credentials from rtspUrl if onvifUrl is not set.
 *
 * @param {{ onvifUrl?: string, rtspUrl?: string }} camera  Raw Mongoose doc (select:false fields must be fetched)
 * @returns {{ baseUrl: string, auth: { username:string, password:string } } | null}
 */
function buildCgiTarget(camera) {
    // Prefer onvifUrl (already an HTTP address), otherwise derive from RTSP URL
    const sourceUrl = camera.onvifUrl || camera.rtspUrl;
    if (!sourceUrl) return null;

    const creds = parseCredentials(sourceUrl);
    if (!creds) return null;

    // Dahua HTTP port is typically 80 (or whatever the camera's HTTP port is).
    // If we only have the RTSP URL (port 554), force port 80 for CGI calls.
    const httpPort = camera.onvifUrl ? creds.port : '80';

    return {
        baseUrl: `http://${creds.host}:${httpPort}`,
        auth: {
            username: creds.username || 'admin',
            password: creds.password || '',
        },
    };
}

/**
 * Send a continuous PTZ move command to the camera.
 * The camera will keep moving until a stop() or another start() is sent.
 *
 * @param {object} camera  Mongoose Camera doc (must include rtspUrl / onvifUrl)
 * @param {string} direction  One of the keys in DIRECTION_MAP
 * @param {number} [speed=5]  Speed 1–8
 * @param {number} [channel=0]  Camera channel index (0-indexed)
 */
async function start(camera, direction, speed = 5, channel = 0) {
    const cgiCode = DIRECTION_MAP[direction];
    if (!cgiCode) throw new Error(`Unknown PTZ direction: ${direction}`);

    const target = buildCgiTarget(camera);
    if (!target) throw new Error('Cannot derive camera HTTP address for PTZ control');

    const clampedSpeed = Math.min(8, Math.max(1, Number(speed)));

    const response = await axios.get(`${target.baseUrl}/cgi-bin/ptz.cgi`, {
        params: {
            action: 'start',
            channel,
            code: cgiCode,
            arg1: 0,
            arg2: clampedSpeed,
            arg3: 0,
        },
        auth: target.auth,
        timeout: 5000,
    });

    return response.data;
}

/**
 * Stop all PTZ movement on a channel.
 */
async function stop(camera, direction, channel = 0) {
    const cgiCode = direction ? (DIRECTION_MAP[direction] || 'Up') : 'Up';
    const target = buildCgiTarget(camera);
    if (!target) throw new Error('Cannot derive camera HTTP address for PTZ control');

    const response = await axios.get(`${target.baseUrl}/cgi-bin/ptz.cgi`, {
        params: {
            action: 'stop',
            channel,
            code: cgiCode,
            arg1: 0,
            arg2: 0,
            arg3: 0,
        },
        auth: target.auth,
        timeout: 5000,
    });

    return response.data;
}

/**
 * Jump to a saved camera preset position.
 *
 * @param {object} camera
 * @param {number} presetIndex  Preset number (1-indexed on most Dahua cams)
 * @param {number} [channel=0]
 */
async function gotoPreset(camera, presetIndex, channel = 0) {
    const target = buildCgiTarget(camera);
    if (!target) throw new Error('Cannot derive camera HTTP address for PTZ control');

    const response = await axios.get(`${target.baseUrl}/cgi-bin/ptz.cgi`, {
        params: {
            action: 'start',
            channel,
            code: 'GotoPreset',
            arg1: Number(presetIndex),
            arg2: 0,
            arg3: 0,
        },
        auth: target.auth,
        timeout: 5000,
    });

    return response.data;
}

/**
 * Save the current camera position as a preset.
 */
async function setPreset(camera, presetIndex, channel = 0) {
    const target = buildCgiTarget(camera);
    if (!target) throw new Error('Cannot derive camera HTTP address for PTZ control');

    const response = await axios.get(`${target.baseUrl}/cgi-bin/ptz.cgi`, {
        params: {
            action: 'start',
            channel,
            code: 'SetPreset',
            arg1: Number(presetIndex),
            arg2: 0,
            arg3: 0,
        },
        auth: target.auth,
        timeout: 5000,
    });

    return response.data;
}

module.exports = { start, stop, gotoPreset, setPreset, DIRECTION_MAP };
