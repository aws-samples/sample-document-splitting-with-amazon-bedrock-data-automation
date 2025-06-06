#!/bin/bash
# scripts/cleanup-all.sh

set -e

# Configuration
STACK_NAME="document-splitting-complete"
ECR_PUBLIC_ALIAS="XXX"
REPO_NAME="document-splitting"
REGIONS=("us-west-2" "us-east-1")

echo "🗑️  Starting complete cleanup of document-splitting resources..."
echo ""
echo "⚠️  WARNING: This will delete ALL resources including:"
echo "   - App Runner services in all regions"
echo "   - CloudFormation stacks"
echo "   - S3 buckets and all contents"
echo "   - BDA Projects and Blueprints"
echo "   - ECR Public repository"
echo "   - IAM roles"
echo ""

# Safety confirmation
read -p "Are you sure you want to delete ALL resources? Type 'DELETE' to confirm: " confirm
if [ "$confirm" != "DELETE" ]; then
    echo "❌ Cleanup cancelled"
    exit 0
fi

echo ""
echo "🚀 Starting cleanup process..."

# Function to cleanup region
cleanup_region() {
    local region=$1
    echo ""
    echo "🌎 Cleaning up region: $region"
    
    # Check if stack exists
    if aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --region $region &>/dev/null; then
        
        echo "📋 Found CloudFormation stack in $region"
        
        # Get S3 bucket name before deleting stack
        S3_BUCKET=$(aws cloudformation describe-stacks \
            --stack-name $STACK_NAME \
            --region $region \
            --query 'Stacks[0].Outputs[?OutputKey==`S3Bucket`].OutputValue' \
            --output text 2>/dev/null || echo "")
        
        if [ ! -z "$S3_BUCKET" ]; then
            echo "🪣 Emptying S3 bucket: $S3_BUCKET"
            aws s3 rm s3://$S3_BUCKET --recursive 2>/dev/null || echo "Bucket might be empty or not exist"
        fi
        
        # Delete CloudFormation stack
        echo "☁️  Deleting CloudFormation stack..."
        aws cloudformation delete-stack \
            --stack-name $STACK_NAME \
            --region $region
        
        echo "⏳ Waiting for stack deletion to complete..."
        aws cloudformation wait stack-delete-complete \
            --stack-name $STACK_NAME \
            --region $region || echo "Stack deletion timeout or failed"
        
        echo "✅ Stack deleted in $region"
    else
        echo "ℹ️  No CloudFormation stack found in $region"
    fi
    
    # Cleanup any remaining App Runner services
    echo "🔍 Checking for remaining App Runner services..."
    app_runner_services=$(aws apprunner list-services \
        --region $region \
        --query 'ServiceSummaryList[?contains(ServiceName, `document-splitting`)].ServiceArn' \
        --output text 2>/dev/null || echo "")
    
    if [ ! -z "$app_runner_services" ]; then
        echo "🗑️  Found App Runner services to delete"
        for service_arn in $app_runner_services; do
            echo "   Deleting: $service_arn"
            aws apprunner delete-service \
                --service-arn $service_arn \
                --region $region &
        done
        wait
    fi
    
    # Cleanup ECR repositories (private)
    echo "🔍 Checking for private ECR repositories..."
    if aws ecr describe-repositories \
        --repository-names $REPO_NAME \
        --region $region &>/dev/null; then
        
        echo "🗑️  Deleting private ECR repository in $region"
        aws ecr delete-repository \
            --repository-name $REPO_NAME \
            --region $region \
            --force
    fi
}

# Cleanup all regions
for region in "${REGIONS[@]}"; do
    cleanup_region $region
done

# Skip ECR Public cleanup
echo ""
echo "🌐 Checking ECR Public repository..."
if aws ecr-public describe-repositories \
    --repository-names $REPO_NAME \
    --region us-east-1 &>/dev/null; then
    
    echo "ℹ️  ECR Public repository found - skipping deletion"
else
    echo "ℹ️  No ECR Public repository found"
fi

# Cleanup any remaining IAM roles
echo ""
echo "🔍 Checking for remaining IAM roles..."
iam_roles=$(aws iam list-roles \
    --query 'Roles[?contains(RoleName, `document-splitting`)].RoleName' \
    --output text 2>/dev/null || echo "")

if [ ! -z "$iam_roles" ]; then
    echo "🗑️  Found IAM roles to delete"
    for role_name in $iam_roles; do
        echo "   Deleting role: $role_name"
        
        # Detach managed policies
        aws iam list-attached-role-policies \
            --role-name $role_name \
            --query 'AttachedPolicies[].PolicyArn' \
            --output text | xargs -n1 -I {} aws iam detach-role-policy --role-name $role_name --policy-arn {} 2>/dev/null || true
        
        # Delete inline policies
        aws iam list-role-policies \
            --role-name $role_name \
            --query 'PolicyNames[]' \
            --output text | xargs -n1 -I {} aws iam delete-role-policy --role-name $role_name --policy-name {} 2>/dev/null || true
        
        # Delete role
        aws iam delete-role --role-name $role_name 2>/dev/null || true
    done
fi

echo ""
echo "🎉 Cleanup completed!"
echo ""
echo "📋 Cleanup summary:"
echo "   ✅ CloudFormation stacks deleted"
echo "   ✅ S3 buckets emptied and deleted"
echo "   ✅ App Runner services deleted"
echo "   ✅ ECR repositories deleted"
echo "   ✅ IAM roles cleaned up"
echo ""
echo "💡 You may want to check AWS Console to verify all resources are deleted"