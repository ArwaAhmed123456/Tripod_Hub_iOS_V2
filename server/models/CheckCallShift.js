const mongoose = require('mongoose');

const checkCallShiftSchema = new mongoose.Schema({
  guardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
  siteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  guardName: { type: String, required: true },
  officerIdNumber: { type: String, default: '' },
  shiftType: { type: String, enum: ['Day', 'Night'], required: true },
  startedAt: { type: Date, required: true },
  endedAt: { type: Date, default: null },
  intervalMinutes: { type: Number, default: 60, min: 15, max: 180 },
  responseWindowMinutes: { type: Number, default: 5, min: 1, max: 30 },
  nextCallAt: { type: Date, required: true, index: true },
}, { timestamps: true });

checkCallShiftSchema.index({ guardId: 1, endedAt: 1 });
module.exports = mongoose.model('CheckCallShift', checkCallShiftSchema);
