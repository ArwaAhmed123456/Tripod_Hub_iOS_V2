const ActivityLog = require('../models/ActivityLog');
const Site = require('../models/Site');
const cache = new Map();

function _getOrCreate(code) {
  if (!cache.has(code)) cache.set(code, { workers: [], lastUpdated: null, seeded: false });
  return cache.get(code);
}
const fmt = (l) => ({ ...l._doc || l, _id: l._id||l.id, id: (l._id||l.id)?.toString(),
  time_in: l.timeIn, time_out: l.timeOut, user_type: l.userType, employee_company_name: l.employeeCompanyName || l.employee_company_name || null, car_reg: l.carReg, image_url: l.imageUrl });

async function seedFromDB(projectCode) {
  try {
    const code = projectCode.trim().toUpperCase();
    const site = await Site.findOne({ code });
    if (!site) return null;
    const today = new Date().toISOString().split('T')[0];
    const workers = await ActivityLog.find({ siteId: site._id, timeOut: null, date: today }).lean();
    const entry = _getOrCreate(code);
    entry.workers = workers.map(fmt); entry.lastUpdated = new Date(); entry.seeded = true;
    return entry;
  } catch (err) { console.error('[ManifestCache] seed error:', err); return null; }
}
async function getManifest(projectCode) {
  const code = projectCode.trim().toUpperCase();
  const entry = cache.get(code);
  if (!entry || !entry.seeded) return seedFromDB(code);
  return entry;
}
function addWorker(projectCode, log) {
  const code = projectCode.trim().toUpperCase();
  const entry = _getOrCreate(code);
  const id = (log._id||log.id)?.toString();
  if (!entry.workers.some(w => (w._id||w.id)?.toString() === id)) entry.workers.push(fmt(log));
  entry.lastUpdated = new Date();
}
function removeWorker(projectCode, logId) {
  const code = projectCode.trim().toUpperCase();
  const entry = cache.get(code);
  if (!entry) return;
  entry.workers = entry.workers.filter(w => (w._id||w.id)?.toString() !== logId?.toString());
  entry.lastUpdated = new Date();
}
async function restoreWorker(projectCode, logId) {
  const code = projectCode.trim().toUpperCase();
  const entry = _getOrCreate(code);
  const log = await ActivityLog.findById(logId).lean();
  if (!log) return;
  if (!entry.workers.some(w => (w._id||w.id)?.toString() === logId?.toString())) {
    entry.workers.push(fmt(log)); entry.lastUpdated = new Date();
  }
}
function invalidate(projectCode) { cache.delete(projectCode.trim().toUpperCase()); }
function stats() {
  const r = {};
  for (const [code, e] of cache.entries()) r[code] = { worker_count: e.workers.length, last_updated: e.lastUpdated, seeded: e.seeded };
  return r;
}
module.exports = { seedFromDB, getManifest, addWorker, removeWorker, restoreWorker, invalidate, stats };
