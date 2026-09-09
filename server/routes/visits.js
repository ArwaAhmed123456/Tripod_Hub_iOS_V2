const express     = require('express');
const router      = express.Router();
const jwt         = require('jsonwebtoken');
const mongoose    = require('mongoose');
const ActivityLog = require('../models/ActivityLog');
const Site        = require('../models/Site');
const Member      = require('../models/Member');
const { addWorker } = require('../services/manifestCache');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_123';

const verifyAdmin = (req, res, next) => {
  const auth = req.headers['authorization'];
  if (!auth) return res.status(403).json({ error: 'No token provided' });
  try {
    const d = jwt.verify(auth.split(' ')[1], JWT_SECRET);
    const role = String(d.role || '').toLowerCase();
    if (!['admin', 'superadmin', 'guard', 'manager'].includes(role))
      return res.status(403).json({ error: 'Access denied' });
    req.user = { ...d, role };
    next();
  } catch { res.status(401).json({ error: 'Unauthorized' }); }
};

const verifyStrictAdmin = (req, res, next) => {
  const auth = req.headers['authorization'];
  if (!auth) return res.status(403).json({ error: 'No token provided' });
  try {
    const d = jwt.verify(auth.split(' ')[1], JWT_SECRET);
    if (!['admin', 'superadmin'].includes(d.role))
      return res.status(403).json({ error: 'Admin access required' });
    req.user = d;
    next();
  } catch { res.status(401).json({ error: 'Unauthorized' }); }
};

const fmt = (l, siteNameMap = {}) => {
  const signInIso = l.date && l.timeIn ? `${l.date}T${l.timeIn}:00` : (l.checkIn ? new Date(l.checkIn).toISOString().slice(0, 19) : null);
  const signOutIso = l.date && l.timeOut ? `${l.date}T${l.timeOut}:00` : (l.checkOut ? new Date(l.checkOut).toISOString().slice(0, 19) : null);

  return {
    id:          l._id,
    name:        l.name,
    group:       l.userType,
    site:        siteNameMap[String(l.siteId)] || l.siteName || null,
    site_id:     l.siteId,
    sign_in_time:  signInIso,
    sign_out_time: signOutIso,
    duration:    l.hours ? `${l.hours}h` : null,
    trade:       l.trade,
    employee_company_name: l.employeeCompanyName || l.employee_company_name || null,
    car_reg:     l.carReg,
    reason:      l.reason,
    image_url:   l.imageUrl,
    member_id:   l.memberId,
    created_at:  l.createdAt,
    date:        l.date,
    time_in:     l.timeIn,
    time_out:    l.timeOut,
    pre_registered:     l.preRegistered    || false,
    checked_in_by_guard: l.checkedInByGuard || false,
    checked_in_by:       l.checkedInBy      || '',
  };
};


const nowStr = () => {
  const n = new Date();
  return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
};

const savePhoto = (base64Data) => {
  try {
    if (!base64Data || !base64Data.startsWith('data:image')) return null;
    if (!base64Data.match(/^data:image\/(jpeg|jpg|png|webp);base64,/)) return null;
    return base64Data;
  } catch { return null; }
};

// Resolve siteId string → ObjectId. Returns null for "all sites" or no id.
const resolveFirst = async (siteId) => {
  if (!siteId || siteId === 'all') {
    const s = await Site.findOne().sort({ createdAt: 1 }).lean();
    return s ? new mongoose.Types.ObjectId(s._id) : null;
  }
  if (mongoose.isValidObjectId(siteId)) {
    return new mongoose.Types.ObjectId(siteId);
  }
  return null;
};

// Build siteId→name map (avoids N+1 queries)
const buildSiteMap = async (logs) => {
  const ids = [...new Set(logs.map(l => String(l.siteId)).filter(Boolean))];
  if (!ids.length) return {};
  const projects = await Site.find({ _id: { $in: ids } }).lean();
  return Object.fromEntries(projects.map(p => [String(p._id), p.name]));
};

// "still on site" — timeOut absent, null, or empty string
const onSiteFilter = { $or: [{ timeOut: { $exists: false } }, { timeOut: null }, { timeOut: '' }] };

// ─── PUBLIC sign-in (no auth) — QR visitor check-in ─────────────────────────
router.post('/public', async (req, res) => {
  const { site_id, name, group, trade, employee_company_name, car_reg, reason, photo_base64 } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    let site = null;
    if (site_id) { try { site = await Site.findById(site_id).lean(); } catch (_) {} }
    if (!site) site = await Site.findOne().lean();
    if (!site) return res.status(400).json({ error: 'No sites configured. Contact your administrator.' });

    const now     = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const imageUrl = photo_base64 ? savePhoto(photo_base64) : null;
    const userType = group || 'Visitor';
    const empCompany = (String(userType).toLowerCase().includes('employee') && employee_company_name) ? employee_company_name.trim() : null;

    const log = await ActivityLog.create({
      siteId: site._id, name: name.trim(),
      userType,
      employeeCompanyName: empCompany,
      trade: trade || '', carReg: car_reg || '', reason: reason || '',
      date: dateStr, timeIn: nowStr(), checkIn: now, imageUrl,
    });

    const io = req.app.get('io');
    if (io) io.emit('newAttendance', { name: name.trim(), date: dateStr });
    try { addWorker(site.code, log); } catch {}

    res.status(201).json({ success: true, visit: { id: log._id, name: log.name } });
  } catch (err) {
    console.error('Public sign-in error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PUBLIC sign-out (no auth) ────────────────────────────────────────────────
router.post('/public/:id/sign-out', async (req, res) => {
  try {
    const log = await ActivityLog.findById(req.params.id);
    if (!log) return res.status(404).json({ error: 'Visit not found' });
    const now = new Date();
    let hours = null;
    if (log.timeIn && log.date) {
      const start = new Date(`${log.date}T${log.timeIn}`);
      let ms = now - start;
      if (ms < 0) ms += 86400000;
      hours = parseFloat((ms / 3600000).toFixed(2));
    }
    log.timeOut = nowStr(); log.checkOut = now; log.hours = hours;
    await log.save();
    res.json({ success: true });
  } catch (err) {
    console.error('Public sign-out error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/visits/stats ────────────────────────────────────────────────────
router.get('/stats', verifyAdmin, async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  try {
    const sid = await resolveFirst(req.query.site_id);
    const base = { date: today, ...onSiteFilter };
    if (sid) base.siteId = sid;

    const totalIn = await ActivityLog.countDocuments(base);

    const groupAgg = await ActivityLog.aggregate([
      { $match: base },
      { $group: { _id: '$userType', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const groupCounts = groupAgg.map(g => ({ group: g._id || 'Unknown', count: g.count }));
    res.json({ totalIn, groupCounts });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── GET /api/visits ──────────────────────────────────────────────────────────
router.get('/', verifyAdmin, async (req, res) => {
  const { site_id, date_from, date_to, status, group, search } = req.query;
  try {
    const sid    = await resolveFirst(site_id);
    const filter = {};
    if (sid) filter.siteId = sid;

    if (date_from || date_to) {
      filter.date = {};
      if (date_from) filter.date.$gte = date_from;
      if (date_to)   filter.date.$lte = date_to;
    }

    if (status === 'In')  Object.assign(filter, onSiteFilter);
    if (status === 'Out') filter.timeOut = { $exists: true, $nin: [null, ''] };

    if (group && group !== 'All') filter.userType = group;
    if (search) {
      const clean = String(search).trim().replace(/\s+/g, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (clean.length > 0) {
        const regexStr = clean.split('').map(char => `${char}[\\s\\-_.]*`).join('');
        const match = new RegExp(regexStr, 'i');
        filter.$or = [
          { name: match },
          { trade: match },
          { userType: match },
        ];
      }
    }

    const logs    = await ActivityLog.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    const siteMap = await buildSiteMap(logs);
    res.json(logs.map(l => fmt(l, siteMap)));
  } catch (err) {
    console.error('Get visits error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/visits ─────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { site_id, member_id, name, group, trade, employee_company_name, car_reg, company_name, reason, notes } = req.body;
  if (!name && !member_id) return res.status(400).json({ error: 'name or member_id is required' });
  try {
    const sid = await resolveFirst(site_id);
    if (!sid) return res.status(400).json({ error: 'No site found' });

    const now     = new Date();
    const dateStr = now.toISOString().split('T')[0];
    let displayName = name;
    if (!displayName && member_id) {
      const m = await Member.findById(member_id).lean();
      if (m) displayName = `${m.firstName} ${m.lastName || ''}`.trim();
    }
    const userType = group || 'Visitor';
    const empCompany = (String(userType).toLowerCase().includes('employee') && employee_company_name) ? employee_company_name.trim() : null;

    const log = await ActivityLog.create({
      siteId: sid, memberId: member_id || null, name: displayName,
      userType, employeeCompanyName: empCompany, trade: company_name || trade || '', carReg: car_reg || '',
      reason: reason || notes || '', date: dateStr, timeIn: nowStr(), checkIn: now,
    });

    const io = req.app.get('io');
    if (io) io.emit('newAttendance', { name: displayName, date: dateStr });
    try { const site = await Site.findById(sid).lean(); if (site?.code) addWorker(site.code, log); } catch {}

    const siteMap = await buildSiteMap([log]);
    res.status(201).json({ success: true, visit: fmt(log, siteMap) });
  } catch (err) {
    console.error('Create visit error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── POST /api/visits/:id/sign-out ────────────────────────────────────────────
router.post('/:id/sign-out', async (req, res) => {
  try {
    const log = await ActivityLog.findById(req.params.id);
    if (!log) return res.status(404).json({ error: 'Visit not found' });
    const now = new Date();
    let hours = null;
    if (log.timeIn && log.date) {
      const start = new Date(`${log.date}T${log.timeIn}`);
      let ms = now - start;
      if (ms < 0) ms += 86400000;
      hours = parseFloat((ms / 3600000).toFixed(2));
    }
    log.timeOut = nowStr(); log.checkOut = now; log.hours = hours;
    await log.save();
    const siteMap = await buildSiteMap([log]);
    res.json({ success: true, visit: fmt(log, siteMap) });
  } catch (err) {
    console.error('Sign-out error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─── PUT /api/visits/:id (Edit visit) ─────────────────────────────────────────
router.put('/:id', verifyAdmin, async (req, res) => {
  const {
    name,
    group,
    userType,
    site_id,
    siteId,
    trade,
    car_reg,
    carReg,
    reason,
    notes,
    date,
    time_in,
    timeIn,
    sign_in_time,
    time_out,
    timeOut,
    sign_out_time,
  } = req.body;

  try {
    const log = await ActivityLog.findById(req.params.id);
    if (!log) return res.status(404).json({ error: 'Visit not found' });

    if (name !== undefined) log.name = String(name).trim();
    if (group !== undefined || userType !== undefined) {
      log.userType = group || userType || log.userType || 'Visitor';
    }
    if (trade !== undefined) log.trade = trade;
    if (car_reg !== undefined || carReg !== undefined) {
      log.carReg = car_reg !== undefined ? car_reg : carReg;
    }
    if (reason !== undefined || notes !== undefined) {
      log.reason = reason !== undefined ? reason : notes;
    }

    if (site_id || siteId) {
      const resolvedSid = await resolveFirst(site_id || siteId);
      if (resolvedSid) log.siteId = resolvedSid;
    }

    if (date !== undefined && date) log.date = String(date).trim();

    // Helper to normalize time to "HH:MM" without timezone offset
    const extractHHMM = (val) => {
      if (!val || val === '--' || val === 'null' || val === 'undefined') return null;
      val = String(val).trim();
      if (val.includes('T')) {
        const afterT = val.split('T')[1];
        if (afterT) return afterT.slice(0, 5);
      }
      return val.slice(0, 5);
    };

    const newTimeInRaw = time_in !== undefined ? time_in : (timeIn !== undefined ? timeIn : sign_in_time);
    if (newTimeInRaw !== undefined) {
      const parsedIn = extractHHMM(newTimeInRaw);
      if (parsedIn) {
        log.timeIn = parsedIn;
        if (log.date) {
          log.checkIn = new Date(`${log.date}T${log.timeIn}:00`);
        }
      }
    }

    const newTimeOutRaw = time_out !== undefined ? time_out : (timeOut !== undefined ? timeOut : sign_out_time);
    if (newTimeOutRaw !== undefined) {
      const parsedOut = extractHHMM(newTimeOutRaw);
      if (!parsedOut) {
        log.timeOut = null;
        log.checkOut = null;
        log.hours = null;
        log.duration = null;
      } else {
        log.timeOut = parsedOut;
        if (log.date) {
          log.checkOut = new Date(`${log.date}T${log.timeOut}:00`);
        }
      }
    }

    // Recalculate hours & duration if timeOut is present
    if (log.timeIn && log.timeOut && log.date) {
      const start = new Date(`${log.date}T${log.timeIn}`);
      const end = new Date(`${log.date}T${log.timeOut}`);
      let diffMs = end - start;
      if (diffMs < 0) diffMs += 86400000;
      if (diffMs === 0) diffMs = 86400000;
      log.hours = parseFloat((diffMs / 3600000).toFixed(2)) || 0;
      log.duration = log.hours;
    } else {
      log.hours = null;
      log.duration = null;
    }

    await log.save();
    const siteMap = await buildSiteMap([log]);
    res.json({ success: true, visit: fmt(log, siteMap) });
  } catch (err) {
    console.error('Update visit error:', err);
    res.status(500).json({ error: 'Server error updating visit' });
  }
});

// ─── DELETE /api/visits/:id ───────────────────────────────────────────────────
router.delete('/:id', verifyStrictAdmin, async (req, res) => {
  try {
    await ActivityLog.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
