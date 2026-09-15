const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  actorEmail: { type: String, required: true },
  actorName: { type: String },
  actorRole: { type: String, required: true },
  action: {
    type: String,
    required: true,
    enum: [
      'create_account',
      'update_account',
      'delete_account',
      'change_role',
      'update_permissions',
      'edit_report',
      'delete_report',
      'edit_visit',
      'delete_visit',
      'edit_delivery',
      'delete_delivery',
      'create_camera',
      'update_camera',
      'delete_camera',
    ]
  },
  resourceType: {
    type: String,
    required: true,
    enum: ['account', 'permission', 'visit', 'delivery', 'camera', 'report', 'site']
  },
  resourceId: { type: String, required: true },
  siteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Site', default: null },
  description: { type: String },
  beforeState: { type: mongoose.Schema.Types.Mixed, default: null },
  afterState: { type: mongoose.Schema.Types.Mixed, default: null },
  ipAddress: { type: String },
  createdAt: { type: Date, default: Date.now }
});

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actorEmail: 1 });
auditLogSchema.index({ resourceType: 1, resourceId: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
