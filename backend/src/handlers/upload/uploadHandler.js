// backend/src/handlers/upload/uploadHandler.js
const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const config = require('../../config/config');
const logger = require('../../utils/logger');

const router = express.Router();
const s3Client = new S3Client({ region: config.aws.region });

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: config.processing.maxFileSize },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.pdf', '.png', '.jpg', '.jpeg', '.tiff'];

    if (allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, PNG, JPG, JPEG, and TIFF files are allowed.'));
    }
  }
});

router.post('/', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileId = uuidv4();
    const timestamp = Date.now();
    const ext = path.extname(req.file.originalname);
    const key = `uploads/${timestamp}-${fileId}${ext}`;

    logger.info(`Uploading file to S3: ${key}`);

    // 실제 S3 업로드
    const command = new PutObjectCommand({
      Bucket: config.aws.s3Bucket,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      Metadata: {
        originalName: req.file.originalname,
        uploadedAt: new Date().toISOString(),
        fileId: fileId,
        uploadedBy: 'hotb-demo'
      }
    });

    await s3Client.send(command);
    const s3Uri = `s3://${config.aws.s3Bucket}/${key}`;

    logger.info(`File uploaded successfully to S3: ${s3Uri}`);

    res.json({
      success: true,
      fileId,
      s3Uri,
      s3Key: key,
      originalName: req.file.originalname,
      size: req.file.size,
      uploadedAt: new Date().toISOString(),
      bucket: config.aws.s3Bucket
    });

  } catch (error) {
    logger.error('S3 upload error:', error);
    res.status(500).json({
      error: 'Upload failed',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Health check for upload service
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'upload-handler',
    s3Bucket: config.aws.s3Bucket,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;