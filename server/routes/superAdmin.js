const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const Admin = require('../models/Admin');
const Member = require('../models/Member');
const AuditLog = require('../models/AuditLog');
const ActivityLog = require('../models/ActivityLog');
const Delivery = require('../models/Delivery');
const Site = require('../models/Site');
const Camera = require('../models/Camera');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_123';

/**
 * Middleware: Enforces that the caller is an active Super Admin.
 */
const verifySuperAdmin = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    // Look up in Admin collection
    const admin = await Admin.findById(decoded.id || decoded.userId);
    if (!admin || admin.role !== 'superadmin') {
      return res.status(403).json({ error: 'Access denied: Super Admin role required' });
    }

    if (admin.is_active === false) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    req.user = {
      id: admin._id,
      email: admin.email,
      name: `${admin.first_name || ''} ${admin.last_name || ''}`.trim() || admin.email,
      role: 'superadmin',
      isPrimarySuperAdmin: admin.is_primary_superadmin || false,
    };

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Helper: Record audit trail entry
const logAudit = async ({
  actor,
  action,
  resourceType,
  resourceId,
  siteId = null,
  description = '',
  beforeState = null,
  afterState = null,
  req = null,
}) => {
  try {
    const ipAddress = req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '') : '';
    await AuditLog.create({
      actorId: actor.id,
      actorEmail: actor.email,
      actorName: actor.name,
      actorRole: actor.role,
      action,
      resourceType,
      resourceId: String(resourceId),
      siteId,
      description,
      beforeState,
      afterState,
      ipAddress,
    });
  } catch (err) {
    console.error('[AuditLog] Failed to record audit log:', err.message);
  }
};

// ─── 1. GET /api/superadmin/accounts ──────────────────────────────────────────
// Returns unified list of all accounts across the entire system
router.get('/accounts', verifySuperAdmin, async (req, res) => {
  try {
    const [admins, members, sites] = await Promise.all([
      Admin.find({}, '-password -reset_token -reset_expires').populate('site_id', 'name code').lean(),
      Member.find({}, '-password -reset_token -reset_expires').populate('siteId', 'name code').lean(),
      Site.find({}, 'name code').lean(),
    ]);

    const siteMap = {};
    sites.forEach((s) => { siteMap[String(s._id)] = s.name; });

    const normalizedAdmins = admins.map((a) => ({
      id: String(a._id),
      accountType: 'portal',
      isPortal: true,
      name: `${a.first_name || ''} ${a.last_name || ''}`.trim() || a.email.split('@')[0],
      first_name: a.first_name || '',
      last_name: a.last_name || '',
      email: a.email,
      phone: a.phone || '',
      role: a.role, // 'admin' | 'superadmin'
      mobileRole: a.role,
      organization: a.organization || '',
      site_id: a.site_id?._id || a.site_id || null,
      siteName: a.site_id?.name || siteMap[String(a.site_id)] || 'All Sites (Global)',
      company: a.organization || '',
      status: a.is_active === false ? 'inactive' : 'active',
      isActive: a.is_active !== false,
      isPrimarySuperAdmin: Boolean(a.is_primary_superadmin),
      granularPermissions: a.granular_permissions || {
        allowed_sites: [],
        allowed_cameras: [],
        module_permissions: {
          can_view_cameras: true,
          can_manage_cameras: a.role === 'superadmin',
          can_edit_reports: a.role === 'superadmin',
          can_delete_reports: a.role === 'superadmin',
          can_export_reports: true,
          can_approve_guards: true,
        },
      },
      cameraAccessOverride: a.granular_permissions?.camera_access_override ?? null,
      createdAt: a.created_at || a.createdAt,
    }));

    const normalizedMembers = members.map((m) => {
      const mobRole = String(m.mobileRole || m.role || 'employee').toLowerCase();
      return {
        id: String(m._id),
        accountType: 'mobile',
        isPortal: false,
        name: `${m.firstName || ''} ${m.lastName || ''}`.trim() || m.email?.split('@')[0] || 'Member',
        first_name: m.firstName || '',
        last_name: m.lastName || '',
        email: m.email || '',
        phone: m.phone || '',
        role: mobRole, // 'guard' | 'manager' | 'employee' | 'admin'
        mobileRole: mobRole,
        site_id: m.siteId?._id || m.siteId || null,
        siteName: m.siteId?.name || siteMap[String(m.siteId)] || m.siteName || 'Not assigned',
        company: m.company || '',
        status: m.isActive === false ? 'inactive' : (m.status || 'current').toLowerCase(),
        isActive: m.isActive !== false,
        isPrimarySuperAdmin: false,
        granularPermissions: m.granularPermissions || {
          allowedSites: m.siteId ? [m.siteId] : [],
          allowedCameras: [],
          modulePermissions: {
            can_view_cameras: ['manager', 'admin'].includes(mobRole),
            can_manage_cameras: false,
            can_edit_reports: false,
            can_delete_reports: false,
            can_export_reports: ['manager', 'admin'].includes(mobRole),
            can_approve_guards: ['manager', 'admin'].includes(mobRole),
          },
        },
        cameraAccessOverride: m.granularPermissions?.cameraAccessOverride ?? null,
        approvalStatus: m.approvalStatus || 'approved',
        mobilePaired: m.mobilePaired || false,
        createdAt: m.createdAt,
      };
    });

    res.json({
      success: true,
      accounts: [...normalizedAdmins, ...normalizedMembers],
    });
  } catch (err) {
    console.error('[SuperAdmin API] List accounts error:', err);
    res.status(500).json({ error: 'Failed to retrieve accounts' });
  }
});

// ─── 2. POST /api/superadmin/accounts ─────────────────────────────────────────
// Create an account of ANY role with initial fields and granular permissions
router.post('/accounts', verifySuperAdmin, async (req, res) => {
  const {
    account_type, // 'portal' | 'mobile'
    role, // 'superadmin' | 'admin' | 'manager' | 'guard' | 'employee'
    first_name,
    last_name,
    email,
    phone,
    password,
    company,
    organization,
    site_id,
    granular_permissions,
  } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedRole = String(role || 'employee').toLowerCase();

  try {
    // Check uniqueness across Admin and Member collections
    const [existingAdmin, existingMember] = await Promise.all([
      Admin.findOne({ email: normalizedEmail }),
      Member.findOne({ email: normalizedEmail }),
    ]);

    if (existingAdmin || existingMember) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const isPortalAccount = ['superadmin', 'admin'].includes(normalizedRole) || account_type === 'portal';

    let createdAccount = null;

    if (isPortalAccount) {
      createdAccount = await Admin.create({
        email: normalizedEmail,
        password: hashedPassword,
        first_name: first_name?.trim() || '',
        last_name: last_name?.trim() || '',
        phone: phone?.trim() || '',
        organization: organization || company || '',
        role: normalizedRole === 'superadmin' ? 'superadmin' : 'admin',
        site_id: site_id || null,
        is_active: true,
        is_primary_superadmin: false,
        granular_permissions: granular_permissions || {
          allowed_sites: site_id ? [site_id] : [],
          allowed_cameras: [],
          module_permissions: {
            can_view_cameras: true,
            can_manage_cameras: normalizedRole === 'superadmin',
            can_edit_reports: normalizedRole === 'superadmin',
            can_delete_reports: normalizedRole === 'superadmin',
            can_export_reports: true,
            can_approve_guards: true,
          },
        },
      });
    } else {
      createdAccount = await Member.create({
        firstName: first_name?.trim() || normalizedEmail.split('@')[0],
        lastName: last_name?.trim() || '',
        email: normalizedEmail,
        phone: phone?.trim() || '',
        password: hashedPassword,
        company: company || organization || '',
        role: normalizedRole.charAt(0).toUpperCase() + normalizedRole.slice(1),
        mobileRole: ['guard', 'manager', 'admin', 'employee'].includes(normalizedRole) ? normalizedRole : 'employee',
        siteId: site_id || null,
        status: 'Current',
        approvalStatus: 'approved',
        isActive: true,
        granularPermissions: granular_permissions || {
          allowedSites: site_id ? [site_id] : [],
          allowedCameras: [],
          modulePermissions: {
            can_view_cameras: ['manager', 'admin'].includes(normalizedRole),
            can_manage_cameras: false,
            can_edit_reports: false,
            can_delete_reports: false,
            can_export_reports: ['manager', 'admin'].includes(normalizedRole),
            can_approve_guards: ['manager', 'admin'].includes(normalizedRole),
          },
        },
      });
    }

    await logAudit({
      actor: req.user,
      action: 'create_account',
      resourceType: 'account',
      resourceId: createdAccount._id,
      siteId: site_id || null,
      description: `Created ${normalizedRole} account for ${normalizedEmail}`,
      afterState: { email: normalizedEmail, role: normalizedRole, site_id },
      req,
    });

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      account: {
        id: createdAccount._id,
        email: normalizedEmail,
        role: normalizedRole,
      },
    });
  } catch (err) {
    console.error('[SuperAdmin API] Create account error:', err);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

// ─── 3. PUT /api/superadmin/accounts/:id ──────────────────────────────────────
// Super Admin can edit EVERY field of any account
router.put('/accounts/:id', verifySuperAdmin, async (req, res) => {
  const { id } = req.params;
  const {
    first_name,
    last_name,
    email,
    phone,
    role,
    company,
    organization,
    site_id,
    is_active,
    password,
  } = req.body;

  try {
    let target = await Admin.findById(id);
    let isPortal = true;

    if (!target) {
      target = await Member.findById(id);
      isPortal = false;
    }

    if (!target) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Safeguard: Do not allow deactivating primary superadmin
    if (target.is_primary_superadmin && is_active === false) {
      return res.status(400).json({ error: 'Cannot deactivate the primary Super Admin account' });
    }

    // Safeguard: Do not allow self-deactivation
    if (String(target._id) === String(req.user.id) && is_active === false) {
      return res.status(400).json({ error: 'You cannot deactivate your own Super Admin account' });
    }

    const beforeState = target.toObject();
    const normalizedRole = role ? String(role).toLowerCase() : null;

    if (isPortal) {
      if (first_name !== undefined) target.first_name = first_name.trim();
      if (last_name !== undefined) target.last_name = last_name.trim();
      if (email !== undefined) target.email = email.toLowerCase().trim();
      if (phone !== undefined) target.phone = phone.trim();
      if (organization !== undefined) target.organization = organization.trim();
      if (company !== undefined) target.organization = company.trim();
      if (site_id !== undefined) target.site_id = site_id || null;
      if (is_active !== undefined) target.is_active = Boolean(is_active);

      if (normalizedRole) {
        // Only allow switching between 'admin' and 'superadmin' directly on Admin document
        if (['admin', 'superadmin'].includes(normalizedRole)) {
          target.role = normalizedRole;
        }
      }

      if (password && password.trim().length >= 8) {
        target.password = await bcrypt.hash(password.trim(), 10);
      }

      await target.save();
    } else {
      if (first_name !== undefined) target.firstName = first_name.trim();
      if (last_name !== undefined) target.lastName = last_name.trim();
      if (email !== undefined) target.email = email.toLowerCase().trim();
      if (phone !== undefined) target.phone = phone.trim();
      if (company !== undefined) target.company = company.trim();
      if (site_id !== undefined) target.siteId = site_id || null;
      if (is_active !== undefined) target.isActive = Boolean(is_active);

      if (normalizedRole) {
        target.role = normalizedRole.charAt(0).toUpperCase() + normalizedRole.slice(1);
        target.mobileRole = normalizedRole;
      }

      if (password && password.trim().length >= 8) {
        target.password = await bcrypt.hash(password.trim(), 10);
      }

      await target.save();
    }

    const afterState = target.toObject();

    await logAudit({
      actor: req.user,
      action: 'update_account',
      resourceType: 'account',
      resourceId: id,
      siteId: site_id || target.site_id || target.siteId || null,
      description: `Updated account details for ${target.email}`,
      beforeState: {
        email: beforeState.email,
        role: beforeState.role,
        is_active: beforeState.is_active ?? beforeState.isActive,
      },
      afterState: {
        email: afterState.email,
        role: afterState.role,
        is_active: afterState.is_active ?? afterState.isActive,
      },
      req,
    });

    res.json({
      success: true,
      message: 'Account updated successfully',
      account: { id: target._id, email: target.email },
    });
  } catch (err) {
    console.error('[SuperAdmin API] Update account error:', err);
    res.status(500).json({ error: 'Failed to update account' });
  }
});

// ─── 4. DELETE /api/superadmin/accounts/:id ───────────────────────────────────
router.delete('/accounts/:id', verifySuperAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    let target = await Admin.findById(id);
    let isPortal = true;

    if (!target) {
      target = await Member.findById(id);
      isPortal = false;
    }

    if (!target) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Safeguards
    if (target.is_primary_superadmin) {
      return res.status(400).json({ error: 'Cannot delete the primary Super Admin account' });
    }

    if (String(target._id) === String(req.user.id)) {
      return res.status(400).json({ error: 'You cannot delete your own Super Admin account' });
    }

    const deletedEmail = target.email;
    const deletedRole = target.role;

    if (isPortal) {
      await Admin.findByIdAndDelete(id);
    } else {
      await Member.findByIdAndDelete(id);
    }

    await logAudit({
      actor: req.user,
      action: 'delete_account',
      resourceType: 'account',
      resourceId: id,
      description: `Deleted ${deletedRole} account (${deletedEmail})`,
      beforeState: { email: deletedEmail, role: deletedRole },
      req,
    });

    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (err) {
    console.error('[SuperAdmin API] Delete account error:', err);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// ─── 5. PUT /api/superadmin/accounts/:id/permissions ──────────────────────────
// Granular permission assignment (cameras, sites, modules)
router.put('/accounts/:id/permissions', verifySuperAdmin, async (req, res) => {
  const { id } = req.params;
  const { allowed_sites, allowed_cameras, module_permissions } = req.body;

  try {
    let target = await Admin.findById(id);
    let isPortal = true;

    if (!target) {
      target = await Member.findById(id);
      isPortal = false;
    }

    if (!target) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const beforePerms = isPortal
      ? target.granular_permissions
      : target.granularPermissions;

    const newPermissions = {
      allowed_sites: allowed_sites || [],
      allowed_cameras: allowed_cameras || [],
      module_permissions: module_permissions || {},
    };

    if (isPortal) {
      target.granular_permissions = {
        ...newPermissions,
        // An explicit setting is different from the role default. It lets a
        // Super Admin grant a worker access or revoke a manager's access.
        camera_access_override: typeof module_permissions?.can_view_cameras === 'boolean'
          ? module_permissions.can_view_cameras
          : null,
      };
      await target.save();
    } else {
      target.granularPermissions = {
        allowedSites: allowed_sites || [],
        allowedCameras: allowed_cameras || [],
        modulePermissions: module_permissions || {},
        cameraAccessOverride: typeof module_permissions?.can_view_cameras === 'boolean'
          ? module_permissions.can_view_cameras
          : null,
      };
      await target.save();
    }

    await logAudit({
      actor: req.user,
      action: 'update_permissions',
      resourceType: 'permission',
      resourceId: id,
      description: `Updated granular access permissions for ${target.email}`,
      beforeState: beforePerms,
      afterState: newPermissions,
      req,
    });

    res.json({
      success: true,
      message: 'Permissions updated successfully',
      permissions: newPermissions,
    });
  } catch (err) {
    console.error('[SuperAdmin API] Permissions error:', err);
    res.status(500).json({ error: 'Failed to update permissions' });
  }
});

// ─── 6. GET /api/superadmin/audit-logs ────────────────────────────────────────
// Retrieve audit trail entries with filtering
router.get('/audit-logs', verifySuperAdmin, async (req, res) => {
  const { search, resource_type, action, limit = 100 } = req.query;

  try {
    const filter = {};
    if (resource_type) filter.resourceType = resource_type;
    if (action) filter.action = action;
    if (search) {
      const regex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { actorEmail: regex },
        { actorName: regex },
        { description: regex },
        { resourceId: regex },
      ];
    }

    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .lean();

    res.json({
      success: true,
      count: logs.length,
      logs,
    });
  } catch (err) {
    console.error('[SuperAdmin API] Audit logs error:', err);
    res.status(500).json({ error: 'Failed to retrieve audit logs' });
  }
});

// ─── 7. PUT /api/superadmin/reports/:type/:id ──────────────────────────────────
// Full content edit rights for Super Admin on visits or deliveries
router.put('/reports/:type/:id', verifySuperAdmin, async (req, res) => {
  const { type, id } = req.params;

  try {
    if (type === 'visit') {
      const visit = await ActivityLog.findById(id);
      if (!visit) return res.status(404).json({ error: 'Visit record not found' });

      const before = visit.toObject();
      const updates = req.body;

      if (updates.name !== undefined) visit.name = updates.name.trim();
      if (updates.trade !== undefined) visit.trade = updates.trade.trim();
      if (updates.employeeCompanyName !== undefined) visit.employeeCompanyName = updates.employeeCompanyName?.trim() || null;
      if (updates.carReg !== undefined) visit.carReg = updates.carReg.trim();
      if (updates.reason !== undefined) visit.reason = updates.reason.trim();
      if (updates.date !== undefined) visit.date = updates.date;
      if (updates.timeIn !== undefined) visit.timeIn = updates.timeIn;
      if (updates.timeOut !== undefined) visit.timeOut = updates.timeOut;
      if (updates.userType !== undefined) visit.userType = updates.userType;

      await visit.save();

      await logAudit({
        actor: req.user,
        action: 'edit_visit',
        resourceType: 'visit',
        resourceId: id,
        siteId: visit.siteId,
        description: `Super Admin edited visit log for ${visit.name}`,
        beforeState: before,
        afterState: visit.toObject(),
        req,
      });

      return res.json({ success: true, message: 'Visit record updated', visit });
    }

    if (type === 'delivery') {
      const delivery = await Delivery.findById(id);
      if (!delivery) return res.status(404).json({ error: 'Delivery record not found' });

      const before = delivery.toObject();
      const updates = req.body;

      if (updates.recipient !== undefined) delivery.recipient = updates.recipient.trim();
      if (updates.itemName !== undefined) delivery.itemName = updates.itemName.trim();
      if (updates.sender !== undefined) delivery.sender = updates.sender.trim();
      if (updates.carrier !== undefined) delivery.carrier = updates.carrier.trim();
      if (updates.company !== undefined) delivery.company = updates.company.trim();
      if (updates.carRegistration !== undefined) delivery.carRegistration = updates.carRegistration.trim();
      if (updates.notes !== undefined) delivery.notes = updates.notes.trim();
      if (updates.description !== undefined) delivery.description = updates.description.trim();
      if (updates.collected !== undefined) delivery.collected = Boolean(updates.collected);
      if (updates.collectedAt !== undefined) delivery.collectedAt = updates.collectedAt ? new Date(updates.collectedAt) : null;

      await delivery.save();

      await logAudit({
        actor: req.user,
        action: 'edit_delivery',
        resourceType: 'delivery',
        resourceId: id,
        siteId: delivery.siteId,
        description: `Super Admin edited delivery record for ${delivery.recipient || delivery.itemName}`,
        beforeState: before,
        afterState: delivery.toObject(),
        req,
      });

      return res.json({ success: true, message: 'Delivery record updated', delivery });
    }

    return res.status(400).json({ error: 'Unsupported report type' });
  } catch (err) {
    console.error('[SuperAdmin API] Edit report error:', err);
    res.status(500).json({ error: 'Failed to edit report record' });
  }
});

// ─── 8. DELETE /api/superadmin/reports/:type/:id ───────────────────────────────
router.delete('/reports/:type/:id', verifySuperAdmin, async (req, res) => {
  const { type, id } = req.params;

  try {
    if (type === 'visit') {
      const visit = await ActivityLog.findByIdAndDelete(id);
      if (!visit) return res.status(404).json({ error: 'Visit record not found' });

      await logAudit({
        actor: req.user,
        action: 'delete_visit',
        resourceType: 'visit',
        resourceId: id,
        siteId: visit.siteId,
        description: `Super Admin deleted visit log for ${visit.name}`,
        beforeState: visit.toObject(),
        req,
      });

      return res.json({ success: true, message: 'Visit record deleted' });
    }

    if (type === 'delivery') {
      const delivery = await Delivery.findByIdAndDelete(id);
      if (!delivery) return res.status(404).json({ error: 'Delivery record not found' });

      await logAudit({
        actor: req.user,
        action: 'delete_delivery',
        resourceType: 'delivery',
        resourceId: id,
        siteId: delivery.siteId,
        description: `Super Admin deleted delivery record for ${delivery.recipient || delivery.itemName}`,
        beforeState: delivery.toObject(),
        req,
      });

      return res.json({ success: true, message: 'Delivery record deleted' });
    }

    return res.status(400).json({ error: 'Unsupported report type' });
  } catch (err) {
    console.error('[SuperAdmin API] Delete report error:', err);
    res.status(500).json({ error: 'Failed to delete report record' });
  }
});

module.exports = router;
