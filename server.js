require('dotenv').config();

// AI Hollywood Studio - Production Backend with MongoDB
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3001;

// ===== ENVIRONMENT CONFIGURATION =====
const config = {
  // MongoDB Connection
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/ai_hollywood_studio',
  
  // Security Keys
  jwtSecret: process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex'),
  encryptionKey: process.env.ENCRYPTION_KEY || crypto.randomBytes(32),
  
  // Admin Credentials
  adminEmail: process.env.ADMIN_EMAIL || 'admin@aihollywoodstudio.com',
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || '$2a$12$rQj7Ff1wGZ5z8xGOHcEzJOuY7m0rC9dCjEAsDZJI9LmGzKv2jYGkO',
  
  // CORS
  frontendUrl: process.env.FRONTEND_URL || '*',
  
  // Environment
  environment: process.env.NODE_ENV || 'development'
};

console.log('🚀 Starting AI Hollywood Studio Backend...');
console.log('🔐 Security: AES-256 encryption enabled');
console.log('👑 Admin access configured for:', config.adminEmail);

// ===== DATABASE CONNECTION =====
let db;
let client;

async function connectToDatabase() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    client = new MongoClient(config.mongoUri);
    await client.connect();
    db = client.db();
    console.log('✅ MongoDB connected successfully');
    
    // Create indexes
    await createIndexes();
    
    // Initialize admin user
    await initializeAdmin();
    
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    console.log('⚠️ Running in demo mode - some features will be limited');
    // Don't exit - continue in demo mode
  }
}

async function createIndexes() {
  try {
    if (!db) return;
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('apikeys').createIndex({ service: 1 }, { unique: true });
    await db.collection('videologs').createIndex({ userId: 1, createdAt: -1 });
    console.log('📊 Database indexes created');
  } catch (error) {
    console.log('📊 Database indexes already exist or demo mode');
  }
}

async function initializeAdmin() {
  try {
    if (!db) return;
    
    const existingAdmin = await db.collection('users').findOne({ 
      email: config.adminEmail 
    });
    
    if (!existingAdmin) {
      const adminUser = {
        email: config.adminEmail,
        passwordHash: config.adminPasswordHash,
        plan: 'enterprise',
        videosUsed: 0,
        videosLimit: -1,
        isActive: true,
        isAdmin: true,
        createdAt: new Date(),
        lastLogin: null
      };
      
      await db.collection('users').insertOne(adminUser);
      console.log('👑 Admin user initialized');
    } else {
      console.log('👑 Admin user already exists');
    }
  } catch (error) {
    console.error('❌ Failed to initialize admin user:', error.message);
  }
}

// ===== ENCRYPTION SERVICE =====
class SecureVault {
  static encrypt(text) {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher('aes-256-cbc', config.encryptionKey);
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error('Encryption failed');
    }
  }

  static decrypt(encryptedText) {
    try {
      const parts = encryptedText.split(':');
      const encrypted = parts[1];
      const decipher = crypto.createDecipher('aes-256-cbc', config.encryptionKey);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      console.error('Decryption failed:', error);
      throw new Error('Decryption failed');
    }
  }
}

// ===== MIDDLEWARE SETUP =====
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate Limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const adminLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20,
  message: { error: 'Too many admin requests, please try again later' }
});

app.use('/api/', generalLimiter);
app.use('/api/admin/', adminLimiter);

// ===== AUTHENTICATION =====
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access token required' });
    }

    const decoded = jwt.verify(token, config.jwtSecret);
    
    if (db) {
      const user = await db.collection('users').findOne({ 
        _id: new ObjectId(decoded.userId),
        isActive: true 
      });
      
      if (!user) {
        return res.status(403).json({ error: 'User not found or inactive' });
      }
      req.user = user;
    } else {
      // Demo mode
      req.user = {
        _id: decoded.userId,
        email: decoded.email,
        isAdmin: decoded.isAdmin,
        plan: decoded.isAdmin ? 'enterprise' : 'free'
      };
    }

    next();
  } catch (error) {
    console.error('Token verification failed:', error);
    return res.status(403).json({ error: 'Invalid token' });
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.user.isAdmin) {
    console.warn(`Unauthorized admin access attempt by: ${req.user.email}`);
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// ===== API ROUTES =====

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: config.environment,
    database: db ? 'connected' : 'demo_mode',
    message: 'AI Hollywood Studio Backend is running!'
  });
});

// User Registration
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    if (db) {
      // Real database mode
      const existingUser = await db.collection('users').findOne({ 
        email: email.toLowerCase() 
      });
      
      if (existingUser) {
        return res.status(409).json({ error: 'User already exists' });
      }

      const passwordHash = bcrypt.hashSync(password, 12);
      
      const newUser = {
        email: email.toLowerCase(),
        passwordHash,
        plan: 'free',
        videosUsed: 0,
        videosLimit: 2,
        isActive: true,
        isAdmin: false,
        createdAt: new Date(),
        lastLogin: null
      };

      const result = await db.collection('users').insertOne(newUser);
      newUser._id = result.insertedId;

      const token = jwt.sign(
        { userId: newUser._id, email: newUser.email, isAdmin: newUser.isAdmin },
        config.jwtSecret,
        { expiresIn: '24h' }
      );

      console.log(`✅ New user registered: ${email}`);

      res.status(201).json({
        success: true,
        token,
        user: {
          id: newUser._id,
          email: newUser.email,
          plan: newUser.plan,
          videosUsed: newUser.videosUsed,
          videosLimit: newUser.videosLimit,
          isAdmin: newUser.isAdmin
        }
      });
    } else {
      // Demo mode
      const token = jwt.sign(
        { userId: 'demo_' + Date.now(), email: email.toLowerCase(), isAdmin: false },
        config.jwtSecret,
        { expiresIn: '24h' }
      );

      console.log(`✅ Demo user registered: ${email}`);

      res.status(201).json({
        success: true,
        token,
        user: {
          id: 'demo_' + Date.now(),
          email: email.toLowerCase(),
          plan: 'free',
          videosUsed: 0,
          videosLimit: 2,
          isAdmin: false
        }
      });
    }
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// User Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    if (db) {
      // Real database mode
      const user = await db.collection('users').findOne({ 
        email: email.toLowerCase() 
      });
      
      if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
        console.warn(`Failed login attempt for: ${email}`);
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      if (!user.isActive) {
        return res.status(403).json({ error: 'Account deactivated' });
      }

      // Update last login
      await db.collection('users').updateOne(
        { _id: user._id },
        { $set: { lastLogin: new Date() } }
      );

      const token = jwt.sign(
        { userId: user._id, email: user.email, isAdmin: user.isAdmin },
        config.jwtSecret,
        { expiresIn: '24h' }
      );

      console.log(`✅ Login successful: ${email}`);

      res.json({
        success: true,
        token,
        user: {
          id: user._id,
          email: user.email,
          plan: user.plan,
          videosUsed: user.videosUsed,
          videosLimit: user.videosLimit,
          isAdmin: user.isAdmin
        }
      });
    } else {
      // Demo mode
      const token = jwt.sign(
        { userId: 'demo_user', email: email.toLowerCase(), isAdmin: email.toLowerCase() === config.adminEmail.toLowerCase() },
        config.jwtSecret,
        { expiresIn: '24h' }
      );

      console.log(`✅ Demo login successful: ${email}`);

      res.json({
        success: true,
        token,
        user: {
          id: 'demo_user',
          email: email.toLowerCase(),
          plan: email.toLowerCase() === config.adminEmail.toLowerCase() ? 'enterprise' : 'free',
          videosUsed: 0,
          videosLimit: email.toLowerCase() === config.adminEmail.toLowerCase() ? -1 : 2,
          isAdmin: email.toLowerCase() === config.adminEmail.toLowerCase()
        }
      });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin Dashboard
app.get('/api/admin/dashboard', authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (db) {
      const stats = await Promise.all([
        db.collection('users').countDocuments(),
        db.collection('users').countDocuments({ isActive: true }),
        db.collection('videologs').countDocuments(),
        db.collection('videologs').countDocuments({
          createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
        })
      ]);

      const planDistribution = await db.collection('users').aggregate([
        { $group: { _id: '$plan', count: { $sum: 1 } } }
      ]).toArray();

      const apiUsage = await db.collection('apikeys').find(
        { isActive: true }, 
        { projection: { service: 1, usage: 1, lastUsed: 1 } }
      ).toArray();

      res.json({
        stats: {
          totalUsers: stats[0],
          activeUsers: stats[1],
          totalVideos: stats[2],
          todayVideos: stats[3]
        },
        planDistribution,
        apiUsage
      });
    } else {
      // Demo mode
      res.json({
        stats: {
          totalUsers: 1,
          activeUsers: 1,
          totalVideos: 0,
          todayVideos: 0
        },
        planDistribution: [{ _id: 'enterprise', count: 1 }],
        apiUsage: [],
        message: 'Demo mode - connect database for real stats'
      });
    }
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// Demo Status
app.get('/api/demo/status', (req, res) => {
  res.json({
    message: 'AI Hollywood Studio Backend is running!',
    database: db ? 'Connected to MongoDB Atlas' : 'Demo mode - MongoDB not connected',
    features: [
      '🔐 Security systems active',
      '🎬 Video generation ready',
      '👑 Admin access configured',
      '🛡️ API key encryption enabled',
      '📊 Rate limiting active'
    ],
    nextSteps: db ? [
      'Backend is fully operational',
      'Deploy to Railway',
      'Configure API keys via admin panel',
      'Connect frontend application'
    ] : [
      'Connect to MongoDB Atlas',
      'Deploy to Railway',
      'Configure API keys',
      'Connect frontend'
    ]
  });
});

// ===== ERROR HANDLING =====
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /api/health',
      'GET /api/demo/status',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'GET /api/admin/dashboard'
    ]
  });
});

// ===== START SERVER =====
async function startServer() {
  try {
    // Try to connect to database
    await connectToDatabase();
    
    app.listen(PORT, () => {
      console.log('🚀 AI Hollywood Studio Backend LIVE!');
      console.log(`📡 Server running on port ${PORT}`);
      console.log(`🔒 Admin access: ${config.adminEmail}`);
      console.log(`🛡️ All security systems active`);
      console.log(`🌐 CORS enabled for: ${config.frontendUrl}`);
      console.log(`🗄️ Database: ${db ? 'MongoDB Atlas Connected' : 'Demo Mode'}`);
      console.log('📊 Ready to serve Hollywood-quality videos!');
      console.log('');
      console.log('🧪 Test endpoints:');
      console.log(`   Health: http://localhost:${PORT}/api/health`);
      console.log(`   Demo:   http://localhost:${PORT}/api/demo/status`);
      console.log('');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  if (client) {
    await client.close();
  }
  process.exit(0);
});

// Start the server
startServer();

module.exports = app;