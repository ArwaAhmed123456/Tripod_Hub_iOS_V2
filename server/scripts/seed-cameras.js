/**
 * seed-cameras.js
 *
 * Seeds the 4 Dahua DH-IPC-HDW2649TM-S-T-PV-Black cameras mounted on the
 * site security tower, and regenerates the mediamtx.yml paths section.
 *
 * Tower camera inventory (confirmed from device screenshots):
 *   #1  IP 192.168.1.106  S/N BG0E666PAG8E0D1  — Tower Cam 1 (confirmed unique IP)
 *   #2  IP 192.168.1.100  S/N BG0E666PAG5AB1D  — Tower Cam 2 (needs unique IP assigned)
 *   #3  IP 192.168.1.100  S/N BG0E666PAG228A9  — Tower Cam 3 (needs unique IP assigned)
 *   #4  IP 192.168.1.100  S/N BG0E666PAG91803  — Tower Cam 4 (needs unique IP assigned)
 *
 * All 4 cameras are on the same tower/mast on site, connected to the same
 * PoE switch. Cameras 2–4 currently share 192.168.1.100 because they were
 * photographed during initial setup before static IPs were assigned.
 *
 * ACTION REQUIRED before go-live:
 *   Log into each camera's web UI (192.168.1.100) one at a time (disconnect
 *   the others), go to Network > TCP/IP, set Static mode, and assign:
 *     Tower Cam 2  → 192.168.1.101
 *     Tower Cam 3  → 192.168.1.102
 *     Tower Cam 4  → 192.168.1.103
 *   Then re-run this script to update DB + mediamtx.yml automatically.
 *
 * Password: admin (confirmed correct)
 *
 * Usage:
 *   node scripts/seed-cameras.js
 *   # Override password or site name:
 *   CAMERA_PASSWORD=newpass CAMERA_SITE_NAME="Totmonslow" node scripts/seed-cameras.js
 *
 * Idempotent — re-running updates existing records, never duplicates.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs        = require('fs');
const path      = require('path');
const mongoose  = require('mongoose');
const Camera    = require('../models/Camera');
const Site      = require('../models/Site');

// ─── Config ──────────────────────────────────────────────────────────────────
const CAMERA_PASSWORD = process.env.CAMERA_PASSWORD || 'admin'; // override in .env
const RTSP_PORT       = 554;
const HTTP_PORT       = 80;

// Site to attach cameras to.  We look for "Totmonslow" first (the real site
// from seed_data.json), then fall back to the first site in the DB.
const PREFERRED_SITE_NAME = process.env.CAMERA_SITE_NAME || 'Totmonslow';

// ─── Camera definitions ───────────────────────────────────────────────────────
// All 4 cameras are Dahua DH-IPC-HDW2649TM-S-T-PV-Black on the site tower.
// IPs for Tower Cams 2-4 are placeholders — assign real static IPs on the
// cameras first, then update the IPs below and re-run this script.
const CAMERAS = [
  {
    ip:         '192.168.1.106',        // Confirmed real IP from TCP/IP screenshot
    serial:     'BG0E666PAG8E0D1',
    name:       'Tower Camera 1',
    location:   'Security Tower — Cam 1',
    streamKey:  'cam_tower_1',
    ptz:        true,
  },
  {
    ip:         '192.168.1.100',        // ← Assign unique static IP, update here, re-run
    serial:     'BG0E666PAG5AB1D',
    name:       'Tower Camera 2',
    location:   'Security Tower — Cam 2',
    streamKey:  'cam_tower_2',
    ptz:        true,
  },
  {
    ip:         '192.168.1.100',        // ← Assign unique static IP, update here, re-run
    serial:     'BG0E666PAG228A9',
    name:       'Tower Camera 3',
    location:   'Security Tower — Cam 3',
    streamKey:  'cam_tower_3',
    ptz:        true,
  },
  {
    ip:         '192.168.1.100',        // ← Assign unique static IP, update here, re-run
    serial:     'BG0E666PAG91803',
    name:       'Tower Camera 4',
    location:   'Security Tower — Cam 4',
    streamKey:  'cam_tower_4',
    ptz:        true,
  },
];

// ─── Build RTSP / ONVIF URLs ──────────────────────────────────────────────────
function rtspMain(ip)    { return `rtsp://admin:${CAMERA_PASSWORD}@${ip}:${RTSP_PORT}/cam/realmonitor?channel=1&subtype=0`; }
function rtspSub(ip)     { return `rtsp://admin:${CAMERA_PASSWORD}@${ip}:${RTSP_PORT}/cam/realmonitor?channel=1&subtype=1`; }
function onvifUrl(ip)    { return `http://admin:${CAMERA_PASSWORD}@${ip}:${HTTP_PORT}/onvif/device_service`; }
function onvifHost(ip)   { return ip; }

// ─── MediaMTX YAML path block generator ──────────────────────────────────────
function buildMediamtxPaths(cameras) {
  let blocks = '';
  for (const cam of cameras) {
    blocks += `
  # ── ${cam.name} (S/N ${cam.serial}) ──────────────────────────────────────
  ${cam.streamKey}:
    source: rtsp://admin:${CAMERA_PASSWORD}@${cam.ip}:${RTSP_PORT}/cam/realmonitor?channel=1&subtype=0
    sourceOnDemand: yes
    sourceOnDemandStartTimeout: 12s
    sourceOnDemandCloseAfter: 30s

  ${cam.streamKey}_sub:
    source: rtsp://admin:${CAMERA_PASSWORD}@${cam.ip}:${RTSP_PORT}/cam/realmonitor?channel=1&subtype=1
    sourceOnDemand: yes
    sourceOnDemandStartTimeout: 12s
    sourceOnDemandCloseAfter: 30s
`;
  }
  return blocks;
}

// ─── Rewrite mediamtx.yml paths section ──────────────────────────────────────
function updateMediamtxYml(cameras) {
  const ymlPath = path.resolve(__dirname, '../mediamtx.yml');
  let yml = fs.readFileSync(ymlPath, 'utf8');

  const pathsSection = `paths:
${buildMediamtxPaths(cameras)}
  # ── Catch-all: accepts cameras that push RTSP directly to MediaMTX ─────────
  all_others:
    source: publisher
`;

  // Replace everything from "paths:" to end of file
  yml = yml.replace(/^paths:[\s\S]*$/m, pathsSection);
  fs.writeFileSync(ymlPath, yml, 'utf8');
  console.log('✓ mediamtx.yml paths section updated');
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  await mongoose.connect(process.env.MONGO_URI, { dbName: 'Tripod_SignIn_App' });
  console.log('MongoDB connected to Tripod_SignIn_App\n');

  // Find target site
  let site = await Site.findOne({ name: new RegExp(PREFERRED_SITE_NAME, 'i') }).lean();
  if (!site) {
    site = await Site.findOne().sort({ createdAt: 1 }).lean();
  }
  if (!site) {
    console.error('✗ No sites found in the database. Please create a site first.');
    process.exit(1);
  }
  console.log(`✓ Target site: "${site.name}" (${site._id})\n`);

  let created = 0, updated = 0;

  for (const cam of CAMERAS) {
    const doc = {
      siteId:            site._id,
      name:              cam.name,
      location:          cam.location,
      rtspUrl:           rtspMain(cam.ip),
      subStreamRtspUrl:  rtspSub(cam.ip),
      streamKey:         cam.streamKey,
      ptzSupported:      cam.ptz,
      onvifUrl:          onvifUrl(cam.ip),
      onvifHost:         onvifHost(cam.ip),
      status:            'online',
    };

    const existing = await Camera.findOne({ streamKey: cam.streamKey });
    if (existing) {
      await Camera.findByIdAndUpdate(existing._id, doc);
      console.log(`  ↻ Updated:  ${cam.name} (${cam.ip}, S/N ${cam.serial})`);
      updated++;
    } else {
      await Camera.create(doc);
      console.log(`  ✓ Created:  ${cam.name} (${cam.ip}, S/N ${cam.serial})`);
      created++;
    }
  }

  console.log(`\n✓ Done: ${created} created, ${updated} updated`);
  console.log('\nUpdating mediamtx.yml...');
  updateMediamtxYml(CAMERAS);

  await mongoose.disconnect();

  console.log('\n─────────────────────────────────────────────────────────');
  console.log('NEXT STEPS:');
  console.log('  1. Assign unique static IPs to Tower Cams 2, 3, 4:');
  console.log('     - Disconnect cams 3 & 4 from the PoE switch');
  console.log('     - Open 192.168.1.100 in browser → Network → TCP/IP');
  console.log('     - Set Static, assign 192.168.1.101, save & reboot');
  console.log('     - Repeat for cam 3 (→ .102) and cam 4 (→ .103)');
  console.log('  2. Edit the CAMERAS array IPs in this script to match');
  console.log('     the real IPs you assigned, then re-run:');
  console.log('       node scripts/seed-cameras.js');
  console.log('  3. Restart MediaMTX to pick up the updated mediamtx.yml.');
  console.log('  4. Open the Cameras page — all 4 tower feeds will appear');
  console.log('     with PTZ controls active on both desktop and iPhone.');
  console.log('─────────────────────────────────────────────────────────\n');
}

run().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
