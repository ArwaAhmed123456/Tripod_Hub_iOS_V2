const mongoose = require('mongoose');

const checkCallSchema = new mongoose.Schema({
  shiftId: { type: mongoose.Schema.Types.ObjectId, ref: 'CheckCallShift', required: true, index: true },
  guardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
  siteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  dueAt: { type: Date, required: true, index: true },
  expiresAt: { type: Date, required: true, index: true },
  respondedAt: { type: Date, default: null },
  status: { type: String, enum: ['pending', 'yes', 'no', 'missed'], default: 'pending', index: true },
  explanation: { type: String, default: '' },
  alertedAt: { type: Date, default: null },
  alertedUsers: [{ type: String }],
  acknowledgedAt: { type: Date, default: null },
  acknowledgedBy: { type: String, default: '' },
}, { timestamps: true });

checkCallSchema.index({ siteId: 1, dueAt: -1 });
module.exports = mongoose.model('CheckCall', checkCallSchema);
