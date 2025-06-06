// backend/src/config/config.js
require('dotenv').config();
const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');

let awsAccountId = null;

// AWS Account ID 가져오기
async function getAwsAccountId() {
  if (awsAccountId) return awsAccountId;

  try {
    const stsClient = new STSClient({ region: process.env.AWS_REGION || 'us-west-2' });
    const command = new GetCallerIdentityCommand({});
    const response = await stsClient.send(command);
    awsAccountId = response.Account;
    return awsAccountId;
  } catch (error) {
    console.error('Failed to get AWS Account ID:', error.message);
    return null;
  }
}

const config = {
  aws: {
    region: process.env.AWS_REGION || 'us-west-2',
    s3Bucket: process.env.S3_BUCKET || 'document-splitting-demo',
    // BDA Profile ARN은 고정된 형태
    getBdaProfileArn: async () => {
      if (process.env.BDA_PROFILE_ARN) {
        return process.env.BDA_PROFILE_ARN;
      }

      const accountId = await getAwsAccountId();
      // 현재 지역의 프로필 사용 (Cross-Region Inference가 처리)
      return `arn:aws:bedrock:${config.aws.region}:${accountId}:data-automation-profile/us.data-automation-v1`;
    },
    // BDA Project ARN은 환경 변수에서 가져오거나 사용자가 생성한 것 사용
    bdaProject: process.env.BDA_PROJECT_ARN,
  },
  processing: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024,
    allowedFormats: ['pdf', 'png', 'jpg', 'jpeg', 'tiff'],
    maxPages: parseInt(process.env.MAX_PAGES) || 200,
    timeoutMs: parseInt(process.env.PROCESSING_TIMEOUT) || 300000
  },
  costs: {
    bda: {
      standard: { document: 0.010 },
      custom: {
        document: 0.040,
        extra_field: 0.0005
      }
    },
    bedrock: {
      'nova-lite': { input: 0.00006, output: 0.00024 },
      'nova-micro': { input: 0.000035, output: 0.00014 },
      'nova-pro': { input: 0.0008, output: 0.0032 },
      'claude-3-7-sonnet': { input: 0.003, output: 0.015 }
    }
  },
  supportedModels: [
    { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', description: 'High accuracy, higher cost' },
    { id: 'nova-pro', name: 'Nova Pro', description: 'Advanced performance with higher accuracy' },
    { id: 'nova-lite', name: 'Nova Lite', description: 'Balanced performance and cost' },
    { id: 'nova-micro', name: 'Nova Micro', description: 'Fast and cost-effective' }
  ]
};

module.exports = config;