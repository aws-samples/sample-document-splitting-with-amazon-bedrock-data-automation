// backend/src/handlers/processing/processingHandler.js
const express = require('express');
const BDAService = require('../../services/bda/bdaService');
const logger = require('../../utils/logger');

const router = express.Router();
const bdaService = new BDAService();

// Process document - returns both standard+bedrock and custom output
router.post('/process', async (req, res) => {
  try {
    const { s3Uri, bedrockModel = 'nova-lite', enableSplitting = true } = req.body;

    if (!s3Uri) {
      return res.status(400).json({
        success: false,
        error: 'S3 URI is required'
      });
    }

    logger.info(`Starting BDA processing with comparison`);
    logger.info(`Input: ${s3Uri}, Bedrock Model: ${bedrockModel}`);

    // Single BDA call returns both results
    const results = await bdaService.processDocument(s3Uri, bedrockModel, enableSplitting);

    res.json({
      success: true,
      jobId: results.jobId,
      invocationArn: results.invocationArn,
      processingTimeMs: results.processingTimeMs,
      standardBedrock: results.standardBedrock,
      customOutput: results.customOutput,
      processedAt: new Date().toISOString()
    });

  } catch (error) {
    logger.error('BDA processing error:', error);
    res.status(500).json({
      success: false,
      error: 'Processing failed',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get supported models
router.get('/models', (req, res) => {
  try {
    const models = [
      {
        id: 'claude-3-7-sonnet',
        name: 'Claude 3.7 Sonnet',
        description: 'High accuracy, higher cost'
      },
      { id: 'nova-pro', name: 'Nova Pro', description: 'Advanced performance with higher accuracy' },
      {
        id: 'nova-lite',
        name: 'Nova Lite',
        description: 'Balanced performance and cost'
      },
      {
        id: 'nova-micro',
        name: 'Nova Micro',
        description: 'Fast and cost-effective'
      }
    ];

    res.json({
      success: true,
      models
    });
  } catch (error) {
    logger.error('Models endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get models',
      message: error.message
    });
  }
});

module.exports = router;