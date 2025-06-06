#!/bin/bash
# scripts/push-to-ecr-public.sh

# Configuration
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
PRIVATE_ECR_REGION="us-west-2"
PRIVATE_IMAGE="${AWS_ACCOUNT_ID}.dkr.ecr.${PRIVATE_ECR_REGION}.amazonaws.com/document-splitting:latest"

# Create repository if needed
aws ecr-public create-repository --repository-name document-splitting --region us-east-1 2>/dev/null || true

# Your ECR Public alias
ECR_PUBLIC_ALIAS="d0f8z5z3"
PUBLIC_IMAGE="public.ecr.aws/${ECR_PUBLIC_ALIAS}/document-splitting:latest"

echo "🚀 Pushing to ECR Public..."

# Login and push to ECR Public
aws ecr-public get-login-password --region us-east-1 | \
    docker login --username AWS --password-stdin public.ecr.aws

docker tag $PRIVATE_IMAGE $PUBLIC_IMAGE
docker push $PUBLIC_IMAGE

echo "✅ Pushed to: ${PUBLIC_IMAGE}"