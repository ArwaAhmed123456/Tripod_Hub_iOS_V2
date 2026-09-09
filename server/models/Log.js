const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
    // ── Core (existing fields) ──────────────────────────────────────
    project_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    name:      { type: String, required: true, trim: true },
    trade:     { type: String, trim: true },
    employee_company_name: { type: String, default: null, trim: true },
    car_reg:   { type: String, trim: true },
    user_type: { type: String, default: 'Employee' },
    time_in:   { type: String, required: true },
    time_out:  { type: String, index: true },
    hours:     { type: Number },
    reason:    { type: String },
    image_url: { type: String },
    date:      { type: String, required: true, index: true },
    created_at:{ type: Date, default: Date.now },

    // ── Visitor Group (Module 1) ─────────────────────────────────────
    visitor_group: { type: String },                   // "Employee" | "Visitor" | "Delivery" | "Contractor"
    group_id: {                                         // reference to VisitorGroup config
        type: mongoose.Schema.Types.ObjectId,
        ref: 'VisitorGroup'
    },

    // ── Automation flags (Module 4) ──────────────────────────────────
    host_notified: { type: Boolean, default: false },   // notification was fired
    badge_printed: { type: Boolean, default: false },   // badge was sent to printer

    // ── OCR / Delivery sub-system (Module 3) ─────────────────────────
    parcel_ref:   { type: String },                     // barcode / tracking number extracted by OCR
    ocr_raw_text: { type: String },                     // full raw OCR output (audit trail)
    matched_by:   {                                     // how the recipient was matched
        type: String,
        enum: ['ocr_auto', 'manual', null],
        default: null
    }
});

// Compound indexes for performance
logSchema.index({ project_id: 1, time_out: 1, date: -1 });
logSchema.index({ project_id: 1, visitor_group: 1, date: -1 });

module.exports = mongoose.model('Log', logSchema);
