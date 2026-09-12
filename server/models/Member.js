const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
  firstName:          { type: String, required: true },
  lastName:           { type: String },
  email:              { type: String },
  password:           { type: String },
  phone:              { type: String },
  // role = what they do on site: Employee | Visitor | Guard | Manager | Delivery
  role:               { type: String, default: 'Employee' },
  // mobileRole = what tab/view they see in the companion app
  mobileRole:         { type: String, enum: ['employee','guard','manager','admin'], default: 'employee' },
  // approvalStatus is mainly for guards created via mobile signup flow
  approvalStatus:     { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved' },
  approvedAt:         { type: Date },
  approvedBy:         { type: mongoose.Schema.Types.ObjectId, ref: 'Member' },
  status:             { type: String, enum: ['Current','Upcoming','Archived'], default: 'Current' },
  startDate:          { type: Date },
  endDate:            { type: Date },
  // siteId references Project model (the main site/project)
  siteId:             { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  siteName:           { type: String }, // cached site name for fast lookups
  visitorGroupId:     { type: mongoose.Schema.Types.ObjectId, ref: 'VisitorGroup' },
  company:            { type: String, default: '' },
  isActive:           { type: Boolean, default: true },
  granularPermissions: {
    // null = use the normal role policy; true/false = explicit Super Admin override
    cameraAccessOverride: { type: Boolean, default: null },
    allowedSites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Project' }],
    allowedCameras: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Camera' }],
    modulePermissions: {
      can_view_cameras:   { type: Boolean, default: true },
      can_manage_cameras: { type: Boolean, default: false },
      can_edit_reports:   { type: Boolean, default: false },
      can_delete_reports: { type: Boolean, default: false },
      can_export_reports: { type: Boolean, default: true },
      can_approve_guards: { type: Boolean, default: true },
    }
  },
  permissions:        { type: String },  // JSON string
  mobilePaired:       { type: Boolean, default: false },
  mobileDeviceId:     { type: String },
  mobilePairedAt:     { type: Date },
  mobileTokenHash:    { type: String },
  mobileTokenExpiry:  { type: Date },
  reset_token:        { type: String },
  reset_expires:      { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Member', memberSchema);
