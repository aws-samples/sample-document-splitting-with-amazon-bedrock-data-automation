#!/bin/bash
# scripts/deploy-complete.sh

set -e

echo "🚀 Starting complete deployment..."

# AWS Region 확인 및 설정
AWS_REGION=$(aws configure get region || echo "")
if [ -z "$AWS_REGION" ]; then
    AWS_REGION=${AWS_DEFAULT_REGION:-us-east-1}
    echo "⚠️  No region configured, using default: $AWS_REGION"
else
    echo "🌍 Using configured AWS region: $AWS_REGION"
fi

# Step 1: 샘플 문서 업로드
echo "📄 Step 1: Uploading sample document..."
./scripts/upload-sample-document.sh

# 환경변수 설정 - eval 사용
eval $(./scripts/upload-sample-document.sh 2>/dev/null | grep "^export")

# Step 2: CloudFormation 배포
echo ""
echo "☁️  Step 2: Deploying CloudFormation..."
echo "   Region: $AWS_REGION"
echo "   Stack: document-splitting-complete"

aws cloudformation deploy \
    --template-file cloudformation-template.yaml \
    --stack-name document-splitting-complete \
    --parameter-overrides \
        S3BucketName=$S3_BUCKET \
        SampleDocumentS3URI=$SAMPLE_DOCUMENT_S3_URI \
    --capabilities CAPABILITY_NAMED_IAM \
    --region $AWS_REGION \
    --s3-bucket $S3_BUCKET

# Step 3: 결과 가져오기
echo ""
echo "📊 Step 3: Getting deployment results..."
SERVICE_URL=$(aws cloudformation describe-stacks \
    --stack-name document-splitting-complete \
    --region $AWS_REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`ServiceUrl`].OutputValue' \
    --output text)

SERVICE_ARN=$(aws cloudformation describe-stacks \
    --stack-name document-splitting-complete \
    --region $AWS_REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`ServiceArn`].OutputValue' \
    --output text)

BDA_PROJECT_ARN=$(aws cloudformation describe-stacks \
    --stack-name document-splitting-complete \
    --region $AWS_REGION \
    --query 'Stacks[0].Outputs[?OutputKey==`BDAProjectArn`].OutputValue' \
    --output text)

# 결과 확인
echo "🔍 Verifying outputs..."
echo "   SERVICE_URL: $SERVICE_URL"
echo "   SERVICE_ARN: $SERVICE_ARN" 
echo "   BDA_PROJECT_ARN: $BDA_PROJECT_ARN"

# ServiceArn이 비어있는지 확인
if [ -z "$SERVICE_ARN" ]; then
    echo "❌ SERVICE_ARN is empty. Checking CloudFormation outputs..."
    aws cloudformation describe-stacks \
        --stack-name document-splitting-complete \
        --region $AWS_REGION \
        --query 'Stacks[0].Outputs'
    exit 1
fi

# Step 4: App Runner 환경변수 업데이트 - 올바른 JSON 형식
echo ""
echo "🔄 Step 4: Updating App Runner with service URL..."

# 환경변수 JSON 파일 생성
cat > /tmp/app-runner-config.json << EOF
{
  "ImageRepository": {
    "ImageIdentifier": "public.ecr.aws/d0f8z5z3/document-splitting:latest",
    "ImageRepositoryType": "ECR_PUBLIC",
    "ImageConfiguration": {
      "Port": "8080",
      "RuntimeEnvironmentVariables": {
        "NODE_ENV": "production",
        "AWS_REGION": "$AWS_REGION",
        "S3_BUCKET": "$S3_BUCKET",
        "BDA_PROJECT_ARN": "$BDA_PROJECT_ARN",
        "SAMPLE_DOCUMENT_S3_URI": "$SAMPLE_DOCUMENT_S3_URI",
        "SERVICE_URL": "$SERVICE_URL",
        "FRONTEND_URL": "$SERVICE_URL",
        "LOG_LEVEL": "info",
        "LOG_TO_CONSOLE": "true"
      }
    }
  }
}
EOF

# App Runner 업데이트 실행
aws apprunner update-service \
    --service-arn "$SERVICE_ARN" \
    --source-configuration file:///tmp/app-runner-config.json \
    --region $AWS_REGION

# 임시 파일 정리
rm -f /tmp/app-runner-config.json

echo ""
echo "✅ Deployment completed!"
echo "🌐 Service URL: $SERVICE_URL"
echo "📄 Sample Document: $SAMPLE_DOCUMENT_S3_URI"
echo "🌍 Region: $AWS_REGION"
echo ""
echo "⏳ App Runner is updating with the correct CORS settings..."
echo "💡 Your sample document is now available in the application!"
echo "🕐 The service will be fully ready in about 2-3 minutes."