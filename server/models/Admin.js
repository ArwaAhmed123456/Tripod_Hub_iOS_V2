const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    first_name: String,
    last_name: String,
    phone: String,
    organization: String,
    role: { type: String, enum: ['admin', 'superadmin'], default: 'admin' },
    site_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
    is_active: { type: Boolean, default: true },
    is_primary_superadmin: { type: Boolean, default: false },
    granular_permissions: {
        // null = use the normal role policy; true/false = explicit Super Admin override
        camera_access_override: { type: Boolean, default: null },
        allowed_sites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Project' }],
        allowed_cameras: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Camera' }],
        module_permissions: {
            can_view_cameras:   { type: Boolean, default: true },
            can_manage_cameras: { type: Boolean, default: false },
            can_edit_reports:   { type: Boolean, default: false },
            can_delete_reports: { type: Boolean, default: false },
            can_export_reports: { type: Boolean, default: true },
            can_approve_guards: { type: Boolean, default: true },
        }
    },
    reset_token: String,
    reset_expires: Date,
    created_at: { type: Date, default: Date.now }
});

// NOTE: No pre-save password hashing here.
// auth.js already calls bcrypt.hash() before saving, so hashing here would double-hash.

module.exports = mongoose.model('Admin', adminSchema);
