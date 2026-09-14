const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const router = express.Router();
const Member = require('../models/Member');
const Project = require('../models/Project');
const CheckCallShift = require('../models/CheckCallShift');
const CheckCall = require('../models/CheckCall');
const AuditLog = require('../models/AuditLog');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_123';
const Message = mongoose.models.Message || mongoose.model('Message', new mongoose.Schema({
  siteId: String, senderId: String, senderName: String, senderRole: String, receiverId: String,
  text: String, type: String, readBy: [String],
}, { timestamps: true }));

async function verify(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: 'No token' });
  try {
    const token = jwt.verify(auth.split(' ')[1], JWT_SECRET);
    let member = await Member.findById(token.id || token.userId).lean();
    if (!member) return res.status(403).json({ error: 'Account not found' });
    req.user = { id: String(member._id), role: String(member.mobileRole || member.role || '').toLowerCase(), siteId: String(member.siteId || token.project_id || token.site_id || ''), name: `${member.firstName || ''} ${member.lastName || ''}`.trim(), email: member.email || '', member };
    next();
  } catch { return res.status(401).json({ error: 'Unauthorized' }); }
}

const isManager = user => ['manager', 'admin', 'superadmin'].includes(user.role);
const isGuard = user => user.role === 'guard' || String(user.member.role || '').toLowerCase() === 'guard';
const at = (date, hours) => { const d = new Date(date); d.setHours(hours, 0, 0, 0); return d; };
const shiftTypeFor = now => (now.getHours() >= 7 && now.getHours() < 19 ? 'Day' : 'Night');

async function notifyMissed(call, status, explanation = '') {
  const shift = await CheckCallShift.findById(call.shiftId).lean();
  const managers = await Member.find({ siteId: call.siteId, isActive: { $ne: false }, mobileRole: { $in: ['manager', 'admin'] } }, 'firstName lastName email').lean();
  const recipients = managers.map(m => String(m._id));
  const message = `CHECK CALL ${status.toUpperCase()}: ${shift?.guardName || 'Guard'} at ${new Date(call.dueAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.${explanation ? ` ${explanation}` : ''}`;
  await Message.create({ siteId: String(call.siteId), senderId: 'system', senderName: 'Tripod Check Call', senderRole: 'system', text: message, type: 'alert', readBy: [], });
  call.alertedAt = new Date(); call.alertedUsers = recipients; await call.save();
  const io = router.app?.get('io'); if (io) io.to(`site:${call.siteId}`).emit('checkCallAlert', { callId: call._id, status, message });
  await AuditLog.create({ actorEmail: 'system@tripod.local', actorName: 'Tripod Check Call', actorRole: 'system', action: 'check_call_missed', resourceType: 'check_call', resourceId: String(call._id), siteId: call.siteId, description: message, afterState: { status, recipients } });
}

async function processDueCalls() {
  const now = new Date();
  const expired = await CheckCall.find({ status: 'pending', expiresAt: { $lte: now } });
  for (const call of expired) { call.status = 'missed'; await call.save(); await notifyMissed(call, 'missed', 'No response within the 5 minute response window.'); }
  const shifts = await CheckCallShift.find({ endedAt: null, nextCallAt: { $lte: now } });
  for (const shift of shifts) {
    const pending = await CheckCall.exists({ shiftId: shift._id, status: 'pending' });
    if (pending) continue;
    const dueAt = shift.nextCallAt;
    const expiresAt = new Date(dueAt.getTime() + shift.responseWindowMinutes * 60000);
    await CheckCall.create({ shiftId: shift._id, guardId: shift.guardId, siteId: shift.siteId, dueAt, expiresAt });
    shift.nextCallAt = new Date(now.getTime() + shift.intervalMinutes * 60000); await shift.save();
  }
}
router.processDueCalls = processDueCalls;

router.post('/shifts/start', verify, async (req, res) => {
  if (!isGuard(req.user)) return res.status(403).json({ error: 'Only guards can start a check-call shift' });
  const active = await CheckCallShift.findOne({ guardId: req.user.id, endedAt: null });
  if (active) return res.json({ success: true, shift: active, alreadyActive: true });
  const now = new Date(); const shiftType = req.body.shift_type === 'Night' ? 'Night' : (req.body.shift_type === 'Day' ? 'Day' : shiftTypeFor(now));
  const interval = Number(req.body.interval_minutes || 60);
  if (interval < 15 || interval > 180) return res.status(400).json({ error: 'Interval must be between 15 and 180 minutes' });
  const siteId = req.body.site_id || req.user.siteId;
  if (!siteId) return res.status(400).json({ error: 'Site is required' });
  const shift = await CheckCallShift.create({ guardId: req.user.id, siteId, guardName: req.user.name || req.user.email, officerIdNumber: req.body.officer_id_number || '', shiftType, startedAt: now, intervalMinutes: interval, responseWindowMinutes: 5, nextCallAt: new Date(now.getTime() + interval * 60000) });
  res.status(201).json({ success: true, shift });
});

router.post('/shifts/:id/end', verify, async (req, res) => {
  const shift = await CheckCallShift.findById(req.params.id); if (!shift) return res.status(404).json({ error: 'Shift not found' });
  if (String(shift.guardId) !== req.user.id && !isManager(req.user)) return res.status(403).json({ error: 'Access denied' });
  shift.endedAt = new Date(); await shift.save(); res.json({ success: true, shift });
});

router.get('/my', verify, async (req, res) => {
  await processDueCalls();
  const shift = await CheckCallShift.findOne({ guardId: req.user.id, endedAt: null }).sort({ startedAt: -1 }).lean();
  const calls = await CheckCall.find({ guardId: req.user.id }).sort({ dueAt: -1 }).limit(50).lean();
  const pending = calls.find(c => c.status === 'pending') || null;
  res.json({ shift, pending, calls });
});

router.post('/:id/respond', verify, async (req, res) => {
  const call = await CheckCall.findById(req.params.id); if (!call) return res.status(404).json({ error: 'Check call not found' });
  if (String(call.guardId) !== req.user.id) return res.status(403).json({ error: 'This check call belongs to another guard' });
  if (call.status !== 'pending') return res.status(400).json({ error: `Check call is already ${call.status}` });
  if (new Date() > call.expiresAt) { call.status = 'missed'; await call.save(); await notifyMissed(call, 'missed', 'Response arrived after the permitted window.'); return res.status(410).json({ error: 'The 5 minute response window expired' }); }
  const answer = String(req.body.answer || '').toLowerCase(); if (!['yes', 'no'].includes(answer)) return res.status(400).json({ error: 'Answer must be Yes or No' });
  call.status = answer; call.respondedAt = new Date(); call.explanation = req.body.explanation || ''; await call.save();
  if (answer === 'no') await notifyMissed(call, 'failed', call.explanation || 'Guard selected No. Follow-up is required.');
  await AuditLog.create({ actorId: req.user.id, actorEmail: req.user.email || 'guard@tripod.local', actorName: req.user.name, actorRole: req.user.role, action: 'check_call_response', resourceType: 'check_call', resourceId: String(call._id), siteId: call.siteId, description: `Guard answered ${answer.toUpperCase()} to check call`, afterState: { status: answer, respondedAt: call.respondedAt } });
  res.json({ success: true, call });
});

router.get('/report', verify, async (req, res) => {
  if (!isManager(req.user)) return res.status(403).json({ error: 'Manager or Admin access required' });
  const siteId = req.query.site_id || req.user.siteId; if (!siteId) return res.status(400).json({ error: 'site_id required' });
  const from = req.query.date_from ? new Date(`${req.query.date_from}T00:00:00`) : new Date(Date.now() - 86400000);
  const to = req.query.date_to ? new Date(`${req.query.date_to}T23:59:59.999`) : new Date();
  const shifts = await CheckCallShift.find({ siteId, startedAt: { $lte: to }, $or: [{ endedAt: null }, { endedAt: { $gte: from } }] }).sort({ startedAt: 1 }).lean();
  const calls = await CheckCall.find({ siteId, dueAt: { $gte: from, $lte: to } }).sort({ dueAt: 1 }).lean();
  const site = await Project.findById(siteId, 'name').lean();
  res.json({ siteName: site?.name || 'Site', dateFrom: from, dateTo: to, shifts, calls });
});

router.post('/:id/acknowledge', verify, async (req, res) => {
  if (!isManager(req.user)) return res.status(403).json({ error: 'Manager or Admin access required' });
  const call = await CheckCall.findById(req.params.id); if (!call) return res.status(404).json({ error: 'Check call not found' });
  call.acknowledgedAt = new Date(); call.acknowledgedBy = req.user.name || req.user.email; call.explanation = req.body.explanation || call.explanation; await call.save();
  res.json({ success: true, call });
});

module.exports = router;
