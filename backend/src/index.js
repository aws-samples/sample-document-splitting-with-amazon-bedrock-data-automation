// backend/src/index.js - Main application entry point
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const config = require('./config/config');
const logger = require('./utils/logger');

// Route imports
const uploadRoutes = require('./handlers/upload/uploadHandler');
const processingRoutes = require('./handlers/processing/processingHandler');
const analysisRoutes = require('./handlers/analysis/analysisHandler');

const app = express();

// Trust proxy (important for App Runner/Load Balancer)
app.set('trust proxy', 1);

// Security middleware with CSP adjustments for React
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://*.amazonaws.com"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  } : false, // Disable CSP in development
}));

// backend/src/index.js - CORS 설정을 더 간단하게
app.use(cors({
  origin: (origin, callback) => {
    // 개발 환경에서는 localhost 허용
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    // origin이 없는 경우 (same-origin 요청) 허용
    if (!origin) return callback(null, true);

    // App Runner 도메인인지 확인
    if (origin.includes('awsapprunner.com')) {
      return callback(null, true);
    }

    // 명시적으로 설정된 URL들
    const allowedOrigins = [
      'http://localhost:3000',
      process.env.FRONTEND_URL,
      process.env.SERVICE_URL
    ].filter(Boolean);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000, // More lenient in development
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/api/', limiter);

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`, {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      userAgent: req.get('User-Agent')
    });
  });
  next();
});

// Health check endpoint (before API routes)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

app.get('/api/config', (req, res) => {
  res.json({
    s3Bucket: process.env.S3_BUCKET,
    sampleDocumentS3Uri: process.env.SAMPLE_DOCUMENT_S3_URI,
    awsRegion: process.env.AWS_REGION
  });
});

// Legacy health check (for backward compatibility)
app.get('/health', (req, res) => {
  res.redirect('/api/health');
});

app.get('/api/preview', async (req, res) => {
  try {
    const { s3Uri } = req.query;

    if (!s3Uri) {
      return res.status(400).json({ error: 'S3 URI is required' });
    }

    // S3 URI 파싱
    const uriMatch = s3Uri.match(/s3:\/\/([^\/]+)\/(.+)/);
    if (!uriMatch) {
      return res.status(400).json({ error: 'Invalid S3 URI format' });
    }

    const [, bucket, key] = uriMatch;

    const {
      getSignedUrl,
    } = require('@aws-sdk/s3-request-presigner');

    const {
      GetObjectCommand,
      S3,
    } = require('@aws-sdk/client-s3');

    const s3 = new S3();

    const presignedUrl = await getSignedUrl(s3, new GetObjectCommand({
      Bucket: bucket,
      Key: key,

      // PDF를 다운로드 대신 브라우저에서 열기
      ResponseContentDisposition: 'inline',

      ResponseContentType: 'application/pdf',
    }), {
      expiresIn: 900,
    });

    res.json({
      success: true,
      presignedUrl
    });
  } catch (error) {
    logger.error('Preview generation failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate preview URL'
    });
  }
});

// API Routes
app.use('/api/upload', uploadRoutes);
app.use('/api/processing', processingRoutes);
app.use('/api/analysis', analysisRoutes);

// Serve static files from React build in production
if (process.env.NODE_ENV === 'production') {
  const buildPath = path.join(__dirname, '../public');

  // Serve static files
  app.use(express.static(buildPath, {
    maxAge: '1d', // Cache static files for 1 day
    etag: true,
    lastModified: true
  }));

  // Handle React routing - send all non-API requests to React app
  app.get('*', (req, res, next) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith('/api/')) {
      return next();
    }

    const indexPath = path.join(buildPath, 'index.html');
    res.sendFile(indexPath, (err) => {
      if (err) {
        logger.error('Error serving index.html:', err);
        res.status(500).send('Error loading application');
      }
    });
  });
}

// API 404 handler (must come after static file serving)
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found',
    path: req.path,
    method: req.method
  });
});

// Global error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    body: req.body
  });

  // Don't leak error details in production
  const errorResponse = {
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  };

  if (process.env.NODE_ENV === 'development') {
    errorResponse.message = error.message;
    errorResponse.stack = error.stack;
  }

  res.status(500).json(errorResponse);
});

// Final 404 handler for non-API routes in development
if (process.env.NODE_ENV !== 'production') {
  app.use('*', (req, res) => {
    res.status(404).json({
      error: 'Route not found',
      message: 'This route does not exist. In production, non-API routes will serve the React app.'
    });
  });
}

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  logger.info(`🚀 Document Splitting with Amazon Bedrock Data Automation Backend running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Health check: http://localhost:${PORT}/api/health`);

  if (process.env.NODE_ENV === 'production') {
    logger.info('📁 Serving React frontend from /public');
  } else {
    logger.info('🔧 Development mode - frontend should run separately on port 3000');
  }
});

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
  logger.info(`${signal} received, shutting down gracefully`);

  server.close((err) => {
    if (err) {
      logger.error('Error during server close:', err);
      process.exit(1);
    }

    logger.info('Server closed successfully');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

module.exports = app;