/**
 * Registers the Dahua P2P camera TG018A in the Rayleigh Farm inventory.
 *
 * This is deliberately NOT an RTSP configuration: DSS shows no device or
 * channel IP for this P2P camera.  It gives the correct site managers access
 * to the inventory record while clearly holding live playback until an
 * approved DSS API/stream-proxy or local RTSP/ONVIF source is supplied.
 *
 * Run: node scripts/register-rayleigh-tg018a.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const Camera = require('../models/Camera');
const Site = require('../models/Site');

async function run() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is missing from server/.env');
  await mongoose.connect(process.env.MONGO_URI, { dbName: 'Tripod_SignIn_App' });

  const sites = await Site.find({ name: /rayleigh\s+solar\s+farm/i });
  if (sites.length !== 1) {
    throw new Error(`Expected exactly one Rayleigh Solar Farm site; found ${sites.length}. No changes made.`);
  }
  const [site] = sites;
  const camera = await Camera.findOneAndUpdate(
    { streamKey: 'dss_rayleigh_tg018a' },
    {
      siteId: site._id,
      name: 'TG018A',
      location: 'Rayleigh Solar Farm — TG018A',
      streamKey: 'dss_rayleigh_tg018a',
      connectionType: 'dss_p2p',
      integrationStatus: 'awaiting_dss_api',
      dssDeviceId: 'TG018A',
      deviceModel: 'DH-IPC-HFW3849T1-AS-PV',
      audioSupported: true,
      lightSupported: true,
      ptzSupported: false,
      status: 'offline',
      rtspUrl: null,
      subStreamRtspUrl: null,
      onvifUrl: null,
      onvifHost: null,
      order: 1,
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );

  console.log(`Registered ${camera.name} for ${site.name}.`);
  console.log('Live playback remains pending until DSS API/stream-proxy or local RTSP/ONVIF details are provided.');
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(`Camera registration failed: ${error.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
