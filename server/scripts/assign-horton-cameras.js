/**
 * Assign the known Horton Solar Farm CCTV records to the existing company site.
 *
 * This is idempotent: it only updates camera site assignments and labels; it
 * never changes RTSP URLs, passwords, stream keys, or deletes any site/data.
 * Run: node scripts/assign-horton-cameras.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const Camera = require('../models/Camera');
const Site = require('../models/Site');

const TARGET_SITE_PATTERN = /horton\s+solar\s+farm/i;
const CAMERA_UPDATES = [
  { streamKey: 'cam_tower_1', name: 'Tower 15 Camera 1', location: 'Horton Solar Farm — Tower 15 — Camera 1' },
  { streamKey: 'cam_tower_2', name: 'Tower 15 Camera 2', location: 'Horton Solar Farm — Tower 15 — Camera 2' },
  { streamKey: 'cam_tower_3', name: 'Tower 15 Camera 3', location: 'Horton Solar Farm — Tower 15 — Camera 3' },
  { streamKey: 'cam_tower_4', name: 'Tower 15 Camera 4', location: 'Horton Solar Farm — Tower 15 — Camera 4' },
  { streamKey: 'cam_tg1003c_1', name: 'Tower 22 Camera 1', location: 'Horton Solar Farm — Tower TG1003C' },
];

async function run() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is missing from server/.env');
  await mongoose.connect(process.env.MONGO_URI, { dbName: 'Tripod_SignIn_App' });

  const matchingSites = await Site.find({ name: TARGET_SITE_PATTERN });
  if (matchingSites.length !== 1) {
    throw new Error(`Expected exactly one Horton Solar Farm site; found ${matchingSites.length}. No changes made.`);
  }
  const [site] = matchingSites;

  let changed = 0;
  for (const update of CAMERA_UPDATES) {
    const camera = await Camera.findOne({ streamKey: update.streamKey });
    if (!camera) {
      console.log(`Skipped ${update.streamKey}: no existing camera record.`);
      continue;
    }
    camera.siteId = site._id;
    camera.name = update.name;
    camera.location = update.location;
    await camera.save();
    changed += 1;
    console.log(`Assigned ${update.name} to ${site.name}.`);
  }

  console.log(`Completed: ${changed} camera record(s) assigned to ${site.name}.`);
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(`Camera assignment failed: ${error.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
