/**
 * seed-cameras-tower22.js
 *
 * Seeds Tower 22 — Horton Field site and its cameras.
 *
 * Tower details (confirmed from screenshots):
 *   Tower ID : TG1003C
 *   Site     : Horton Field
 *   Access URL (local proxy): https://127.0.0.1:18132/?rtspport=18136&tcpport=18124&...
 *
 * Camera — Dahua DH-IPC-HDW3549H-AS-PV-G:
 *   S/N          : AD0D8D1PAG1A567
 *   IP           : 192.168.1.103  (confirmed in TCP/IP screenshot)
 *   MAC          : d4:43:0e:f3:6c:76
 *   Mode         : DHCP (currently on 192.168.1.103 — recommend switching to Static)
 *   RTSP Port    : 554
 *   HTTP Port    : 80
 *   TCP Port     : 37777
 *   Main stream  : H.265, 2880×1620, 20 FPS, ~3072 Kbps CBR
 *   Sub stream   : H.265, 704×576 (D1), 512 Kbps CBR, 20 FPS
 *   ONVIF        : v24.12 (V3.1.0.2313712)
 *   Password     : admin
 *
 * NOTE: This camera is currently on DHCP. Its IP (192.168.1.103) may change
 * after a reboot. Recommend setting it to Static in Network → TCP/IP.
 *
 * Note on IP conflict: Tower 15 has cam_tower_4 also provisioned at
 * 192.168.1.103 (placeholder). Once Tower 15 cam 4 is assigned its real
 * unique IP, update seed-cameras.js accordingly.
 *
 * Usage:
 *   node scripts/seed-cameras-tower22.js
 *   CAMERA_PASSWORD=newpass node scripts/seed-cameras-tower22.js
 *
 * Idempotent — safe to re-run; updates existing records.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs       = require('fs');
const path     = require('path');
const mongoose = require('mongoose');
const Camera   = require('../models/Camera');
const Site     = require('../models/Site');

// Keep camera credentials out of source control.
const CAMERA_PASSWORD = process.env.CAMERA_PASSWORD;
const RTSP_PORT       = 554;
const HTTP_PORT       = 80;

// Tower ID is TG1003C, but it belongs to the existing Horton Solar Farm site;
// it must not create a separate "Horton Field" company/site.
const TARGET_SITE_NAME = process.env.CAMERA_SITE_NAME || 'IB Vogt - Horton Solar Farm';

// ─── Tower 22 cameras ─────────────────────────────────────────────────────────
// Only 1 camera confirmed from screenshots. Add more entries here as details
// arrive for additional cameras on this tower.
const CAMERAS = [
  {
    ip:        '192.168.1.103',
    serial:    'AD0D8D1PAG1A567',
    mac:       'd4:43:0e:f3:6c:76',
    model:     'DH-IPC-HDW3549H-AS-PV-G',
    name:      'Tower 22 Camera 1',
    location:  'Horton Solar Farm — Tower TG1003C',
    streamKey: 'cam_tg1003c_1',
    ptz:       true,
    note:      'DHCP mode — recommend setting static IP to avoid address changes',
  },
  // Future cameras on this tower — add here when details received:
  // { ip: '192.168.1.xxx', serial: '...', name: 'Tower 22 Camera 2', ... },
];

// ─── URL builders ─────────────────────────────────────────────────────────────
const rtspMain  = (ip) => `rtsp://admin:${CAMERA_PASSWORD}@${ip}:${RTSP_PORT}/cam/realmonitor?channel=1&subtype=0`;
const rtspSub   = (ip) => `rtsp://admin:${CAMERA_PASSWORD}@${ip}:${RTSP_PORT}/cam/realmonitor?channel=1&subtype=1`;
const onvifUrl  = (ip) => `http://admin:${CAMERA_PASSWORD}@${ip}:${HTTP_PORT}/onvif/device_service`;

// ─── Append Tower 22 paths to mediamtx.yml ────────────────────────────────────
// Does NOT touch existing Tower 15 path entries — only appends new ones,
// or replaces existing cam_tg1003c_* blocks if re-running.
function updateMediamtxYml(cameras) {
  const ymlPath = path.resolve(__dirname, '../mediamtx.yml');
  let yml = fs.readFileSync(ymlPath, 'utf8');

  for (const cam of cameras) {
    const mainKey = cam.streamKey;
    const subKey  = `${cam.streamKey}_sub`;

    const mainBlock = `
  # ── ${cam.name} (S/N ${cam.serial}, ${cam.model}) ────────────────────────
  # Tower TG1003C — Horton Solar Farm  |  IP ${cam.ip}  |  MAC ${cam.mac}
  # ${cam.note}
  ${mainKey}:
    source: ${rtspMain(cam.ip)}
    sourceOnDemand: yes
    sourceOnDemandStartTimeout: 12s
    sourceOnDemandCloseAfter: 30s

  ${subKey}:
    source: ${rtspSub(cam.ip)}
    sourceOnDemand: yes
    sourceOnDemandStartTimeout: 12s
    sourceOnDemandCloseAfter: 30s
`;

    // If the key already exists, replace that block; otherwise insert before catch-all
    const existingPattern = new RegExp(
      `\\s*#[^\n]*${mainKey}[^\n]*\\n(?:\\s*#[^\n]*\\n)*\\s+${mainKey}:[\\s\\S]*?sourceOnDemandCloseAfter:[^\n]+\\n\\n\\s+${subKey}:[\\s\\S]*?sourceOnDemandCloseAfter:[^\n]+`,
      'g'
    );

    if (existingPattern.test(yml)) {
      yml = yml.replace(existingPattern, mainBlock.trimEnd());
      console.log(`  ↻ Replaced mediamtx paths: ${mainKey} + ${subKey}`);
    } else {
      // Insert before the catch-all block
      yml = yml.replace(
        /(\s+# ── Catch-all)/,
        `${mainBlock}\n$1`
      );
      console.log(`  ✓ Appended mediamtx paths: ${mainKey} + ${subKey}`);
    }
  }

  fs.writeFileSync(ymlPath, yml, 'utf8');
  console.log('✓ mediamtx.yml updated');
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function run() {
  if (!CAMERA_PASSWORD) throw new Error('CAMERA_PASSWORD must be set before seeding cameras');
  await mongoose.connect(process.env.MONGO_URI, { dbName: 'Tripod_SignIn_App' });
  console.log('MongoDB connected to Tripod_SignIn_App\n');

  const site = await Site.findOne({ name: new RegExp(`^${TARGET_SITE_NAME}$`, 'i') });
  if (!site) throw new Error(`Site "${TARGET_SITE_NAME}" was not found. Cameras were not changed.`);
  console.log(`✓ Target site: "${site.name}" (${site._id})`);

  // ── Upsert cameras ────────────────────────────────────────────────────────
  let created = 0, updated = 0;

  for (const cam of CAMERAS) {
    const doc = {
      siteId:           site._id,
      name:             cam.name,
      location:         cam.location,
      rtspUrl:          rtspMain(cam.ip),
      subStreamRtspUrl: rtspSub(cam.ip),
      streamKey:        cam.streamKey,
      ptzSupported:     cam.ptz,
      onvifUrl:         onvifUrl(cam.ip),
      onvifHost:        cam.ip,
      status:           'online',
    };

    const existing = await Camera.findOne({ streamKey: cam.streamKey });
    if (existing) {
      await Camera.findByIdAndUpdate(existing._id, doc);
      console.log(`  ↻ Updated: ${cam.name} (${cam.ip}, S/N ${cam.serial})`);
      updated++;
    } else {
      await Camera.create(doc);
      console.log(`  ✓ Created: ${cam.name} (${cam.ip}, S/N ${cam.serial})`);
      created++;
    }
  }

  console.log(`\n✓ Cameras: ${created} created, ${updated} updated`);

  console.log('\nUpdating mediamtx.yml...');
  updateMediamtxYml(CAMERAS);

  await mongoose.disconnect();

  console.log('\n─────────────────────────────────────────────────────────────');
  console.log('Tower 22 (TG1003C — Horton Field) seeded successfully.');
  console.log('');
  console.log('ACTION REQUIRED:');
  console.log('  1. Camera 1 is on DHCP (192.168.1.103). Set it to Static:');
  console.log('     Open http://192.168.1.103 → Network → TCP/IP → Static');
  console.log('     Keep 192.168.1.103 as the static address, click Apply.');
  console.log('');
  console.log('  2. NOTE: Tower 15 cam_tower_4 is also provisioned at');
  console.log('     192.168.1.103 (placeholder). Once Tower 15\'s cam 4');
  console.log('     gets its real IP, re-run seed-cameras.js to fix it.');
  console.log('');
  console.log('  3. Restart MediaMTX to load the new stream paths.');
  console.log('');
  console.log('  4. If more cameras exist on Tower 22, add their details');
  console.log('     to the CAMERAS array in seed-cameras-tower22.js and');
  console.log('     re-run this script.');
  console.log('─────────────────────────────────────────────────────────────\n');
}

run().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
