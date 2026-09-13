const mongoose = require('mongoose');

const deliverySchema = new mongoose.Schema({
  siteId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Site', required: true },
  recipient: { type: String, required: true },
  itemName: { type: String, default: '' },
  description: { type: String, default: '' },
  carRegistration: { type: String, default: '' },
  company: { type: String, default: '' },
  receivedAt: { type: Date, default: Date.now },
  sender:    { type: String, default: '' },
  carrier:   { type: String, default: '' },
  notes:     { type: String, default: '' },
  collected: { type: Boolean, default: false },
  collectedAt: { type: Date, default: null },
  // Optional delivery picture — stores relative URL e.g. /uploads/deliveries/abc123.jpg
  deliveryImageUrl: { type: String, default: null },
  // Canonical cargo report fields.  Legacy fields above remain populated for
  // backwards compatibility with existing screens and previously exported data.
  supplier: { type: String, default: '' },
  deliveryDocumentNumber: { type: String, default: '' },
  product: { type: String, default: '' },
  netWeight: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Delivery', deliverySchema);
