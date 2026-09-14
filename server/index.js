const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

dotenv.config();

const connectDB = require('./db');
connectDB().then(async () => {
  // Auto-seed default visitor groups for every existing site on startup
  try {
    const VisitorGroup = require('./models/VisitorGroup');
    const Site         = require('./models/Site');
    const defaults = [
      { name: 'Employees',       type: 'Repeat',   color: '#2b4594', sortOrder: 0 },
      { name: 'Visitors',        type: 'Standard', color: '#0891b2', sortOrder: 1 },
      { name: 'Contractors',     type: 'Standard', color: '#7c3aed', sortOrder: 2 },
      { name: 'Deliveries',      type: 'Delivery', color: '#d97706', sortOrder: 3 },
      { name: 'Security Guards', type: 'Standard', color: '#16a34a', sortOrder: 4 },
    ];
    const sites = await Site.find({}, '_id').lean();
    for (const site of sites) {
      for (const d of defaults) {
        const exists = await VisitorGroup.findOne({ siteId: site._id, name: d.name });
        if (!exists) {
          await VisitorGroup.create({ siteId: site._id, isActive: true,
            fieldsRequired: '["name"]', fieldsOptional: '[]', ...d });
        }
      }
    }
    console.log(`[startup] Visitor groups seeded for ${sites.length} site(s)`);
  } catch (e) { console.warn('[startup] Group seed skipped:', e.message); }
});

const app = express();
const PORT = process.env.PORT || 5000;

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP in dev to avoid blocking Vite
}));
app.use(cors()); // Cross-Origin Resource Sharing

// Rate Limiting (Prevent Brute Force) - Increased for high usage scenarios
const limiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files (React App)
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.get('/support', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'support.html'));
});

const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const logRoutes = require('./routes/logs');
const requestsRouter = require('./routes/requests');
const contactRoutes = require('./routes/contact');
const guardRoutes = require('./routes/guards');
const visitorGroupRoutes = require('./routes/visitorGroups');
const manifestRoutes = require('./routes/manifest');
const deliveriesRoutes = require('./routes/deliveries');
const visitsRoutes = require('./routes/visits');
const attendanceRoutes = require('./routes/attendance');
const preRegistrationsRoutes = require('./routes/preRegistrations');
const evacuationRoutes = require('./routes/evacuation');

app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/requests', requestsRouter);
app.use('/api/contact', contactRoutes);
app.use('/api/guards', guardRoutes);
app.use('/api/visitor-groups', visitorGroupRoutes);
app.use('/api/manifest', manifestRoutes);
app.use('/api/deliveries', deliveriesRoutes);
app.use('/api/visits', visitsRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/pre-registrations', preRegistrationsRoutes);
app.use('/api/evacuation', evacuationRoutes);
app.use('/api/posters', require('./routes/posters'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/cameras', require('./routes/cameras'));
const checkCallsRoutes = require('./routes/checkCalls');
app.use('/api/check-calls', checkCallsRoutes);
app.use('/api/superadmin', require('./routes/superAdmin'));

// Health check — always responds regardless of DB state
app.get('/api/health', (req, res) => {
  const dbState = require('mongoose').connection.readyState;
  // 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
  const states = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  res.json({
    status: 'ok',
    db: states[dbState] || 'unknown',
    mongo_uri_set: !!process.env.MONGO_URI,
    env: process.env.NODE_ENV || 'development',
    time: new Date().toISOString(),
  });
});

// Catch-all handler for React SPA (must be last)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Adjust for production
    methods: ["GET", "POST"]
  }
});

// Broadcast Socket.io to routes
app.set('io', io);

// A minute-level worker creates due calls and records timeouts. A hosted worker
// or push provider can call the same API later; the database remains the source of truth.
setInterval(() => checkCallsRoutes.processDueCalls().catch(err => console.error('[check-calls] scheduler:', err.message)), 60 * 1000);

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Guard/manager joins their site room for real-time messages
  socket.on('joinSite', (siteId) => {
    if (siteId) {
      socket.join(`site:${siteId}`);
      console.log(`Socket ${socket.id} joined site:${siteId}`);
    }
  });

  socket.on('leaveSite', (siteId) => {
    if (siteId) socket.leave(`site:${siteId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const manifestCache = require('./services/manifestCache');
const Site = require('./models/Site');

server.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  
  try {
    const sites = await Site.find().lean();
    for (const s of sites) {
      await manifestCache.seedFromDB(s.code);
    }
  } catch (err) {
    console.error('Failed to seed manifest cache:', err);
  }
});
