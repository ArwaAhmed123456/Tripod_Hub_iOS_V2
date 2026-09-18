const express  = require('express');
const router   = express.Router();
const jwt      = require('jsonwebtoken');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const Site     = require('../models/Site');
const Member   = require('../models/Member');
const Delivery = require('../models/Delivery');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_123';

const verifyToken = (req, res, next) => {
  const auth = req.headers['authorization'];
  if (!auth) return res.status(403).json({ error: 'No token provided' });
  try { req.user = jwt.verify(auth.split(' ')[1], JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Unauthorized' }); }
};

// ── Multer: store delivery pictures in uploads/deliveries/ ────────────────────
const deliveryStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'deliveries');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, `${Date.now()}${path.extname(file.originalname)}`),
});
const uploadDeliveryImage = multer({
  storage: deliveryStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max (client pre-compresses to ~1MB)
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image files are allowed'));
    cb(null, true);
  },
}).single('delivery_image');

// Fuzzy matching helpers
function levenshtein(a, b) {
  const m = []; for (let i=0;i<=b.length;i++) m[i]=[i]; for (let j=0;j<=a.length;j++) m[0][j]=j;
  for (let i=1;i<=b.length;i++) for (let j=1;j<=a.length;j++)
    m[i][j] = b[i-1]===a[j-1] ? m[i-1][j-1] : Math.min(m[i-1][j-1]+1, m[i][j-1]+1, m[i-1][j]+1);
  return m[b.length][a.length];
}
function matchScore(text, q) {
  const t=text.toLowerCase(), s=q.toLowerCase();
  if (t.includes(s)) return 100;
  const ws=t.split(/\s+/), qs=s.split(/\s+/);
  let total=0;
  for (const sw of qs) {
    let best=0;
    for (const w of ws) { const d=levenshtein(w,sw); const sc=Math.max(0,100-(d/Math.max(w.length,sw.length)*100)); if(sc>best) best=sc; }
    total+=best;
  }
  return total/qs.length;
}

function pickFirstValue(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    const str = String(value).trim();
    if (str) return str;
  }
  return '';
}

// ── GET /api/deliveries?site_id=xxx ─────────────────────────────────────────
router.get('/', verifyToken, async (req, res) => {
  try {
    const { site_id, date_from, date_to, search } = req.query;
    const filter = {};
    if (site_id && site_id !== 'all') filter.siteId = site_id;
    if (date_from || date_to) {
      filter.receivedAt = {};
      if (date_from) filter.receivedAt.$gte = new Date(`${date_from}T00:00:00`);
      if (date_to) filter.receivedAt.$lte = new Date(`${date_to}T23:59:59.999`);
    }
    if (search?.trim()) {
      const clean = String(search).trim().replace(/\s+/g, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (clean.length > 0) {
        const regexStr = clean.split('').map(char => `${char}[\\s\\-_.]*`).join('');
        const match = new RegExp(regexStr, 'i');
        filter.$or = [
          { recipient: match },
          { product: match },
          { itemName: match },
          { supplier: match },
          { company: match },
          { sender: match },
          { deliveryDocumentNumber: match },
          { carRegistration: match },
        ];
      }
    }
    const deliveries = await Delivery.find(filter)
      .select('-deliveryImageBase64')   // exclude large base64 blob from list — fetched individually when needed
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json(deliveries);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── POST /api/deliveries ─────────────────────────────────────────────────────
// Accepts multipart/form-data (with optional delivery_image) OR JSON (with optional delivery_image_base64)
router.post('/', verifyToken, (req, res) => {
  uploadDeliveryImage(req, res, async (uploadErr) => {
    if (uploadErr) return res.status(400).json({ error: uploadErr.message });

    const { site_id, recipient, sender, carrier, notes, item_name, description, car_registration, company, received_at,
      name, supplier, delivery_document_number, product, net_weight } = req.body;
    const deliveryName = pickFirstValue(name, recipient);
    const deliverySupplier = pickFirstValue(supplier, company, sender);
    const deliveryProduct = pickFirstValue(product, item_name);
    if (!deliveryName) return res.status(400).json({ error: 'name is required' });
    if (!deliveryProduct) return res.status(400).json({ error: 'product is required' });

    try {
      let siteId = site_id;
      if (!siteId) {
        const s = await Site.findOne().sort({ createdAt: 1 }).lean();
        siteId = s?._id;
      }
      if (!siteId) return res.status(400).json({ error: 'No site found' });

      const receivedAt = received_at ? new Date(received_at) : new Date();
      if (Number.isNaN(receivedAt.getTime())) return res.status(400).json({ error: 'Invalid delivery date or time' });

      let deliveryImageUrl = null;
      let deliveryImageBase64 = null;

      // Case 1: multer uploaded a file via multipart form
      if (req.file) {
        deliveryImageUrl = `/uploads/deliveries/${req.file.filename}`;
        try {
          const filePath = path.join(__dirname, '..', 'uploads', 'deliveries', req.file.filename);
          if (fs.existsSync(filePath)) {
            const buf = fs.readFileSync(filePath);
            const mime = req.file.mimetype || 'image/jpeg';
            deliveryImageBase64 = `data:${mime};base64,${buf.toString('base64')}`;
          }
        } catch (e) {
          console.warn('Error reading uploaded file to base64:', e.message);
        }
      }

      // Case 2: base64 image passed in JSON payload
      const base64Data = req.body.delivery_image_base64 || req.body.deliveryImageBase64;
      if (base64Data && typeof base64Data === 'string' && base64Data.startsWith('data:image')) {
        deliveryImageBase64 = base64Data;
        try {
          const match = base64Data.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
          if (match) {
            const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
            const rawBuffer = Buffer.from(match[2], 'base64');
            const dir = path.join(__dirname, '..', 'uploads', 'deliveries');
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            const fname = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
            fs.writeFileSync(path.join(dir, fname), rawBuffer);
            deliveryImageUrl = `/uploads/deliveries/${fname}`;
          }
        } catch (e) {
          console.warn('Error saving base64 image to disk:', e.message);
        }
      }

      const delivery = await Delivery.create({
        siteId,
        // Keep both representations in sync while clients transition to the
        // agreed Cargo form terminology.
        recipient: deliveryName,
        sender: pickFirstValue(sender, deliverySupplier), carrier: carrier || '', notes: notes || description || '',
        itemName: deliveryProduct, description: description || '',
        carRegistration: car_registration || '', company: pickFirstValue(company, deliverySupplier), receivedAt,
        deliveryImageUrl,
        deliveryImageBase64,
        supplier: deliverySupplier,
        deliveryDocumentNumber: delivery_document_number || '',
        product: deliveryProduct,
        netWeight: net_weight || '',
      });

      res.status(201).json({ success: true, delivery });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
  });
});

// ── GET /api/deliveries/:id ──────────────────────────────────────────────────
// Returns a single delivery including deliveryImageBase64 (excluded from list endpoint)
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const delivery = await Delivery.findById(req.params.id).lean();
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    res.json(delivery);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── POST /api/deliveries/:id/collect ────────────────────────────────────────
router.post('/:id/collect', verifyToken, async (req, res) => {
  try {
    const delivery = await Delivery.findByIdAndUpdate(
      req.params.id,
      { collected: true, collectedAt: new Date() },
      { new: true }
    );
    if (!delivery) return res.status(404).json({ error: 'Delivery not found' });
    res.json({ success: true, delivery });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// ── DELETE /api/deliveries/:id ───────────────────────────────────────────────
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const delivery = await Delivery.findById(req.params.id).lean();
    // Remove associated image file if it exists
    if (delivery?.deliveryImageUrl && !delivery.deliveryImageUrl.startsWith('data:')) {
      const filePath = path.join(__dirname, '..', delivery.deliveryImageUrl.replace(/^\//, ''));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await Delivery.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// ── POST /api/deliveries/ocr-match ──────────────────────────────────────────
router.post('/ocr-match', async (req, res) => {
  const { raw_text, project_code } = req.body;
  if (!raw_text || !project_code) return res.status(400).json({ error: 'raw_text and project_code required' });
  try {
    const site = await Site.findOne({ code: project_code.trim().toUpperCase() });
    if (!site) return res.status(404).json({ error: 'Project not found' });
    const members = await Member.find({ siteId: site._id }, 'firstName email role').lean();
    const matches = members.map(m => ({ id: m._id, name: m.firstName, email: m.email, role: m.role,
      score: Math.round(matchScore(raw_text, m.firstName)) }))
      .filter(m => m.score > 40).sort((a,b) => b.score-a.score).slice(0,3);
    res.json({ success: true, matches });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
