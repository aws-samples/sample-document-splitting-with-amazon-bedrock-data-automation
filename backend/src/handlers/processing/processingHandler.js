// backend/src/handlers/processing/processingHandler.js
const express = require('express');
const BDAService = require('../../services/bda/bdaService');
const logger = require('../../utils/logger');

const router = express.Router();
const bdaService = new BDAService();

// In-memory job storage (production에서는 Redis나 DynamoDB 사용 권장)
const jobs = new Map();

// Start async processing - returns job ID immediately
router.post('/start', async (req, res) => {
  try {
    const { s3Uri, bedrockModel = 'nova-lite', enableSplitting = true } = req.body;

    if (!s3Uri) {
      return res.status(400).json({
        success: false,
        error: 'S3 URI is required'
      });
    }

    // Generate unique job ID
    const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Initialize job status
    jobs.set(jobId, {
      jobId,
      status: 'starting',
      progress: 0,
      currentStep: 'Initializing processing...',
      startTime: Date.now(),
      s3Uri,
      bedrockModel,
      enableSplitting
    });

    logger.info(`Starting async BDA processing for job ${jobId}`);
    logger.info(`Input: ${s3Uri}, Bedrock Model: ${bedrockModel}`);

    // Start processing in background (no await)
    processDocumentAsync(jobId, s3Uri, bedrockModel, enableSplitting);

    // Return immediately with job ID
    res.json({
      success: true,
      jobId,
      status: 'starting',
      message: 'Processing started successfully'
    });

  } catch (error) {
    logger.error('Failed to start BDA processing:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start processing',
      message: error.message
    });
  }
});

// Background processing function
async function processDocumentAsync(jobId, s3Uri, bedrockModel, enableSplitting) {
  try {
    // Update status to processing
    updateJobStatus(jobId, {
      status: 'processing',
      progress: 20,
      currentStep: 'Starting BDA analysis...'
    });

    await new Promise(resolve => setTimeout(resolve, 2000)); // Give UI time to poll

    updateJobStatus(jobId, {
      progress: 40,
      currentStep: 'Processing with Amazon Bedrock Data Automation...'
    });

    // Actually process the document
    const results = await bdaService.processDocument(s3Uri, bedrockModel, enableSplitting);

    updateJobStatus(jobId, {
      progress: 90,
      currentStep: 'Finalizing results...'
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Mark as completed with results
    updateJobStatus(jobId, {
      status: 'completed',
      progress: 100,
      currentStep: 'Processing completed successfully!',
      results: {
        jobId: results.jobId,
        invocationArn: results.invocationArn,
        processingTimeMs: results.processingTimeMs,
        standardBedrock: results.standardBedrock,
        customOutput: results.customOutput,
        processedAt: new Date().toISOString()
      },
      completedAt: Date.now()
    });

    logger.info(`Job ${jobId} completed successfully`);

  } catch (error) {
    logger.error(`Job ${jobId} failed:`, error);

    updateJobStatus(jobId, {
      status: 'error',
      progress: 0,
      currentStep: 'Processing failed',
      error: error.message,
      failedAt: Date.now()
    });
  }
}

// Update job status helper
function updateJobStatus(jobId, updates) {
  const job = jobs.get(jobId);
  if (job) {
    jobs.set(jobId, { ...job, ...updates });
  }
}

// Get job status - for polling
router.get('/status/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const job = jobs.get(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found',
        jobId
      });
    }

    // Calculate elapsed time
    const elapsedTime = Date.now() - job.startTime;

    // Basic job info without results (keep response small)
    const response = {
      success: true,
      jobId: job.jobId,
      status: job.status,
      progress: job.progress,
      currentStep: job.currentStep,
      elapsedTime,
      startTime: job.startTime
    };

    // Add error info if failed
    if (job.status === 'error') {
      response.error = job.error;
      response.failedAt = job.failedAt;
    }

    // Add completion info if done
    if (job.status === 'completed') {
      response.completedAt = job.completedAt;
      response.hasResults = true;
    }

    res.json(response);

  } catch (error) {
    logger.error(`Status check error for job ${req.params.jobId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get job status',
      message: error.message
    });
  }
});

// Get job results - only when completed
router.get('/result/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const job = jobs.get(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found',
        jobId
      });
    }

    if (job.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Job not completed yet',
        jobId,
        currentStatus: job.status
      });
    }

    if (!job.results) {
      return res.status(500).json({
        success: false,
        error: 'Job completed but results not found',
        jobId
      });
    }

    res.json({
      success: true,
      ...job.results
    });

    // Clean up job after successful retrieval (optional)
    setTimeout(() => {
      jobs.delete(jobId);
      logger.info(`Cleaned up job ${jobId} from memory`);
    }, 60000); // Delete after 1 minute

  } catch (error) {
    logger.error(`Result retrieval error for job ${req.params.jobId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to get job results',
      message: error.message
    });
  }
});

// Cleanup endpoint for old jobs (optional)
router.delete('/cleanup', (req, res) => {
  try {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    let cleanedCount = 0;

    for (const [jobId, job] of jobs.entries()) {
      if (job.startTime < cutoffTime) {
        jobs.delete(jobId);
        cleanedCount++;
      }
    }

    res.json({
      success: true,
      message: `Cleaned up ${cleanedCount} old jobs`,
      remainingJobs: jobs.size
    });

  } catch (error) {
    logger.error('Cleanup error:', error);
    res.status(500).json({
      success: false,
      error: 'Cleanup failed',
      message: error.message
    });
  }
});

// Legacy endpoint for backward compatibility (redirects to new async flow)
router.post('/process', async (req, res) => {
  try {
    logger.info('Legacy /process endpoint called, redirecting to async flow');

    const { s3Uri, bedrockModel = 'nova-lite', enableSplitting = true } = req.body;

    if (!s3Uri) {
      return res.status(400).json({
        success: false,
        error: 'S3 URI is required'
      });
    }

    // Start async processing
    const jobResponse = await new Promise((resolve, reject) => {
      const mockReq = { body: req.body };
      const mockRes = {
        json: resolve,
        status: (code) => ({ json: reject })
      };

      // Call the start endpoint internally
      router.handle(Object.assign(mockReq, { method: 'POST', url: '/start' }), mockRes);
    });

    res.json({
      success: true,
      message: 'Processing started asynchronously',
      jobId: jobResponse.jobId,
      pollingInfo: {
        statusEndpoint: `/api/processing/status/${jobResponse.jobId}`,
        resultEndpoint: `/api/processing/result/${jobResponse.jobId}`,
        recommendedPollInterval: 5000 // 5 seconds
      }
    });

  } catch (error) {
    logger.error('Legacy process endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start processing',
      message: error.message
    });
  }
});

// Get supported models (unchanged)
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