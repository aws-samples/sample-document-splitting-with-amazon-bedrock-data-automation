#!/bin/bash
# scripts/upload-sample-document.sh

set -e

# Configuration
SAMPLE_FILE="samples/documents/merged.pdf"
S3_BUCKET="${S3_BUCKET:-}"
S3_KEY="samples/documents/merged.pdf"

echo "Uploading sample document to S3..."

# S3 bucket 확인/생성
if [ -z "$S3_BUCKET" ]; then
    AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    AWS_REGION=$(aws configure get region || echo "us-west-2")
    S3_BUCKET="document-splitting-${AWS_ACCOUNT_ID}-${AWS_REGION}"
    echo "Using auto-generated bucket: $S3_BUCKET"
fi

# 로컬 파일 확인
if [ ! -f "$SAMPLE_FILE" ]; then
    echo "Sample file not found: $SAMPLE_FILE"
    echo "Please ensure the file exists or create a sample PDF"
    exit 1
fi

# S3 bucket 생성 (이미 있으면 에러 무시)
echo "Creating S3 bucket if needed..."
aws s3 mb s3://$S3_BUCKET 2>/dev/null || echo "Bucket already exists or creation failed (might be normal)"

# CORS 설정 파일 생성
echo "Creating CORS configuration..."
cat > /tmp/cors-config.json << 'EOF'
{
  "CORSRules": [
    {
      "AllowedHeaders": [
        "*"
      ],
      "AllowedMethods": [
        "GET",
        "HEAD"
      ],
      "AllowedOrigins": [
        "*"
      ],
      "ExposeHeaders": [
        "ETag",
        "Content-Length",
        "Content-Type"
      ],
      "MaxAgeSeconds": 3600
    }
  ]
}
EOF

# CORS 설정 적용
echo "Applying CORS configuration to bucket..."
aws s3api put-bucket-cors \
    --bucket $S3_BUCKET \
    --cors-configuration file:///tmp/cors-config.json

# 파일 업로드
echo "Uploading $SAMPLE_FILE to s3://$S3_BUCKET/$S3_KEY"
aws s3 cp "$SAMPLE_FILE" "s3://$S3_BUCKET/$S3_KEY" \
    --content-type "application/pdf" \
    --metadata "purpose=sample-document,uploaded-by=deployment-script"

# 결과 확인
FILE_SIZE=$(aws s3api head-object --bucket $S3_BUCKET --key $S3_KEY --query ContentLength --output text)
READABLE_SIZE=$(echo "scale=1; $FILE_SIZE / 1024 / 1024" | bc -l)

echo "Upload completed!"
echo "Details:"
echo "   S3 URI: s3://$S3_BUCKET/$S3_KEY"
echo "   File Size: ${READABLE_SIZE} MB"
echo "   Bucket: $S3_BUCKET"
echo "   Key: $S3_KEY"

# 환경변수 출력 (다른 스크립트에서 사용 가능)
echo ""
echo "Environment variables for CloudFormation:"
echo "export S3_BUCKET=$S3_BUCKET"
echo "export SAMPLE_DOCUMENT_S3_URI=s3://$S3_BUCKET/$S3_KEY"

# 임시 파일 정리
rm -f /tmp/cors-config.json