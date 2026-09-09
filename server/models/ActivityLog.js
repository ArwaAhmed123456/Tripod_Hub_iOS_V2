const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  siteId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Site' },
  memberId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Member' },
  name:      { type: String },
  userType:  { type: String, default: 'Visitor' },
  trade:     { type: String, default: '' },
  employeeCompanyName: { type: String, default: null },
  carReg:    { type: String, default: '' },
  reason:    { type: String, default: '' },
  imageUrl:  { type: String },
  date:      { type: String },   // "YYYY-MM-DD"
  timeIn:    { type: String },   // "HH:MM"
  timeOut:   { type: String },
  checkIn:   { type: Date },
  checkOut:  { type: Date },
  hours:     { type: Number },
  duration:  { type: Number },
  preRegistered:    { type: Boolean, default: false },
  checkedInByGuard: { type: Boolean, default: false },
  checkedInBy:      { type: String },
}, { timestamps: true });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
