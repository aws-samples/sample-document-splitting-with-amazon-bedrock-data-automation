#!/bin/bash
# scripts/interactive-setup.sh

set -e

# ANSI color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Welcome message
echo -e "${BLUE}┌──────────────────────────────────────────────────────────────────┐${NC}"
echo -e "${BLUE}│                                                                  │${NC}"
echo -e "${BLUE}│  ${GREEN}Document Splitting with Amazon Bedrock Data Automation${BLUE}          │${NC}"
echo -e "${BLUE}│  ${YELLOW}Interactive Setup & Demo Tool${BLUE}                                   │${NC}"
echo -e "${BLUE}│                                                                  │${NC}"
echo -e "${BLUE}└──────────────────────────────────────────────────────────────────┘${NC}"
echo ""

# Check AWS CLI
check_aws_cli() {
    echo -e "${BLUE}Checking AWS CLI configuration...${NC}"
    if ! aws sts get-caller-identity &> /dev/null; then
        echo -e "${RED}❌ AWS CLI not configured. Please run 'aws configure' first.${NC}"
        return 1
    else
        AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
        AWS_REGION=$(aws configure get region || echo "us-west-2")
        echo -e "${GREEN}✅ AWS CLI configured for account: ${AWS_ACCOUNT_ID} in region: ${AWS_REGION}${NC}"
        return 0
    fi
}

# Update environment file
update_env_file() {
    local key=$1
    local value=$2
    local file="backend/.env"
    
    # Check if key exists in file
    if grep -q "^${key}=" "$file"; then
        # Replace existing key
        sed -i.bak "s|^${key}=.*|${key}=${value}|g" "$file"
    else
        # Add new key
        echo "${key}=${value}" >> "$file"
    fi
    
    # Remove backup file
    rm -f "${file}.bak"
    
    echo -e "${GREEN}Updated ${key} to ${value}${NC}"
}

# Main menu
show_main_menu() {
    echo ""
    echo -e "${BLUE}Main Menu:${NC}"
    echo -e "  ${GREEN}1) Setup & Deploy${NC} - Configure and deploy the application"
    echo -e "  ${GREEN}2) Run Demo${NC} - Run the application locally"
    echo -e "  ${GREEN}3) Update Configuration${NC} - Modify application settings"
    echo -e "  ${GREEN}4) Cleanup Resources${NC} - Remove AWS resources"
    echo -e "  ${GREEN}5) Exit${NC}"
    echo ""
    
    read -p "Enter your choice (1-5): " MAIN_CHOICE
    
    case $MAIN_CHOICE in
        1) setup_menu ;;
        2) run_demo_menu ;;
        3) update_config_menu ;;
        4) cleanup_resources ;;
        5) 
            echo -e "\n${BLUE}Exiting.${NC}"
            exit 0 
            ;;
        *)
            echo -e "\n${RED}Invalid option. Please try again.${NC}"
            show_main_menu
            ;;
    esac
}

# Setup menu
setup_menu() {
    echo ""
    echo -e "${BLUE}Setup & Deploy Options:${NC}"
    echo -e "  ${GREEN}1) Quick setup${NC} - Deploy everything with default settings"
    echo -e "  ${GREEN}2) Custom setup${NC} - Configure each component individually"
    echo -e "  ${GREEN}3) Local development${NC} - Setup for local development only"
    echo -e "  ${GREEN}4) Back to main menu${NC}"
    echo ""
    
    read -p "Enter your choice (1-4): " SETUP_CHOICE
    
    case $SETUP_CHOICE in
        1)
            echo -e "\n${GREEN}Starting quick setup...${NC}"
            
            # Check AWS CLI
            check_aws_cli || { show_main_menu; return; }

            # Deploy CloudFormation stack
            echo -e "\n${BLUE}Deploying CloudFormation stack...${NC}"
            ./scripts/deploy-complete.sh
            
            echo -e "\n${GREEN}Setup completed!${NC}"
            read -p "Press Enter to continue..." input
            show_main_menu
            ;;
            
        2)
            echo -e "\n${GREEN}Starting custom setup...${NC}"
            
            # Check AWS CLI
            check_aws_cli || { show_main_menu; return; }
            
            # S3 bucket configuration
            echo -e "\n${BLUE}S3 Bucket Configuration${NC}"
            read -p "Enter S3 bucket name (leave empty for default): " CUSTOM_S3_BUCKET
            
            if [ -z "$CUSTOM_S3_BUCKET" ]; then
                S3_BUCKET="document-splitting-${AWS_ACCOUNT_ID}-${AWS_REGION}"
            else
                S3_BUCKET=$CUSTOM_S3_BUCKET
            fi
            
            echo -e "${BLUE}Creating S3 bucket: ${S3_BUCKET}${NC}"
            aws s3 mb s3://$S3_BUCKET 2>/dev/null || echo -e "${YELLOW}Bucket already exists or creation failed (might be normal)${NC}"
            
            # Region selection
            echo -e "\n${BLUE}Region Configuration${NC}"
            echo "Available regions for deployment:"
            echo "  1) us-east-1 (N. Virginia)"
            echo "  2) us-west-2 (Oregon)"
            read -p "Select deployment region (1-2): " REGION_CHOICE
            
            case $REGION_CHOICE in
                1) DEPLOY_REGION="us-east-1" ;;
                2) DEPLOY_REGION="us-west-2" ;;
                *) DEPLOY_REGION=$AWS_REGION ;;
            esac
            
            export AWS_DEFAULT_REGION=$DEPLOY_REGION
            echo -e "${GREEN}Using region: ${DEPLOY_REGION}${NC}"
            
            # Deployment options
            echo -e "\n${BLUE}Deployment Options${NC}"
            echo "  1) Deploy with CloudFormation"
            echo "  2) Build Docker image only"
            read -p "Select deployment option (1-2): " DEPLOY_CHOICE
            
            case $DEPLOY_CHOICE in
                1)
                    echo -e "\n${BLUE}Deploying with CloudFormation...${NC}"
                    export S3_BUCKET=$S3_BUCKET
                    ./scripts/upload-sample-document.sh
                    ./scripts/deploy-complete.sh
                    ;;
                2)
                    echo -e "\n${BLUE}Building Docker image...${NC}"
                    docker build -t ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/document-splitting:latest .
                    echo -e "${GREEN}Docker image built successfully. Run with:${NC}"
                    echo "docker run -p 8080:8080 -e S3_BUCKET=$S3_BUCKET ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/document-splitting:latest"
                    ;;
            esac
            
            echo -e "\n${GREEN}Setup completed!${NC}"
            read -p "Press Enter to continue..." input
            show_main_menu
            ;;
            
        3)
            echo -e "\n${GREEN}Setting up for local development...${NC}"
            
            # Install dependencies
            echo -e "\n${BLUE}Installing dependencies...${NC}"
            npm run install:all
            
            # Configure environment
            echo -e "\n${BLUE}Configuring environment...${NC}"
            if [ ! -f "backend/.env" ]; then
                cp backend/.env.example backend/.env
                echo -e "${GREEN}Created backend/.env from template${NC}"
            else
                echo -e "${YELLOW}backend/.env already exists, skipping...${NC}"
            fi
            
            echo -e "\n${BLUE}Would you like to upload a sample document to S3?${NC}"
            read -p "Upload sample document? (y/n): " UPLOAD_SAMPLE
            
            if [[ $UPLOAD_SAMPLE == "y" || $UPLOAD_SAMPLE == "Y" ]]; then
                # Check AWS CLI
                if check_aws_cli; then
                    ./scripts/upload-sample-document.sh
                else
                    echo -e "${YELLOW}Skipping sample document upload due to AWS CLI configuration issue.${NC}"
                fi
            fi
            
            echo -e "\n${GREEN}Local development setup complete!${NC}"
            echo -e "Start the development servers with: ${YELLOW}npm run dev${NC}"
            
            read -p "Press Enter to continue..." input
            show_main_menu
            ;;
            
        4)
            show_main_menu
            ;;
            
        *)
            echo -e "\n${RED}Invalid option. Please try again.${NC}"
            setup_menu
            ;;
    esac
}

# Run demo menu
run_demo_menu() {
    echo ""
    echo -e "${BLUE}Run Demo Options:${NC}"
    echo -e "  ${GREEN}1) Run full demo${NC} - Start both backend and frontend"
    echo -e "  ${GREEN}2) Run backend only${NC} - Start only the backend API server"
    echo -e "  ${GREEN}3) Run frontend only${NC} - Start only the frontend development server"
    echo -e "  ${GREEN}4) Run with sample document${NC} - Upload sample and run demo"
    echo -e "  ${GREEN}5) Back to main menu${NC}"
    echo ""
    
    read -p "Enter your choice (1-5): " DEMO_CHOICE
    
    case $DEMO_CHOICE in
        1)
            echo -e "\n${GREEN}Starting full demo...${NC}"
            echo -e "${BLUE}Backend will be available at: ${GREEN}http://localhost:8080${NC}"
            echo -e "${BLUE}Frontend will be available at: ${GREEN}http://localhost:3000${NC}"
            echo -e "${YELLOW}Press Ctrl+C to stop the demo${NC}\n"
            npm run dev
            
            # After demo is stopped with Ctrl+C
            echo -e "\n${GREEN}Demo stopped.${NC}"
            read -p "Press Enter to continue..." input
            show_main_menu
            ;;
            
        2)
            echo -e "\n${GREEN}Starting backend only...${NC}"
            echo -e "${BLUE}Backend will be available at: ${GREEN}http://localhost:8080${NC}"
            echo -e "${YELLOW}Press Ctrl+C to stop the server${NC}\n"
            npm run dev:backend
            
            # After server is stopped with Ctrl+C
            echo -e "\n${GREEN}Server stopped.${NC}"
            read -p "Press Enter to continue..." input
            show_main_menu
            ;;
            
        3)
            echo -e "\n${GREEN}Starting frontend only...${NC}"
            echo -e "${BLUE}Frontend will be available at: ${GREEN}http://localhost:3000${NC}"
            echo -e "${YELLOW}Note: Backend must be running separately for full functionality${NC}"
            echo -e "${YELLOW}Press Ctrl+C to stop the server${NC}\n"
            npm run dev:frontend
            
            # After server is stopped with Ctrl+C
            echo -e "\n${GREEN}Server stopped.${NC}"
            read -p "Press Enter to continue..." input
            show_main_menu
            ;;
            
        4)
            echo -e "\n${GREEN}Running demo with sample document...${NC}"
            
            # Check AWS CLI
            if ! check_aws_cli; then
                echo -e "${RED}Cannot upload sample document without AWS CLI configuration.${NC}"
                read -p "Press Enter to continue..." input
                run_demo_menu
                return
            fi
            
            # Upload sample document
            echo -e "\n${BLUE}Uploading sample document...${NC}"
            source <(./scripts/upload-sample-document.sh | grep "export")
            
            # Update .env with S3 bucket
            if [ -n "$S3_BUCKET" ]; then
                echo -e "\n${BLUE}Updating backend/.env with S3 bucket: ${S3_BUCKET}${NC}"
                if [ ! -f "backend/.env" ]; then
                    cp backend/.env.example backend/.env
                fi
                update_env_file "S3_BUCKET" "$S3_BUCKET"
            fi
            
            echo -e "\n${GREEN}Starting full demo...${NC}"
            echo -e "${BLUE}Backend will be available at: ${GREEN}http://localhost:8080${NC}"
            echo -e "${BLUE}Frontend will be available at: ${GREEN}http://localhost:3000${NC}"
            echo -e "${YELLOW}Press Ctrl+C to stop the demo${NC}\n"
            npm run dev
            
            # After demo is stopped with Ctrl+C
            echo -e "\n${GREEN}Demo stopped.${NC}"
            read -p "Press Enter to continue..." input
            show_main_menu
            ;;
            
        5)
            show_main_menu
            ;;
            
        *)
            echo -e "\n${RED}Invalid option. Please try again.${NC}"
            run_demo_menu
            ;;
    esac
}

# Update configuration menu
update_config_menu() {
    echo ""
    echo -e "${BLUE}Update Configuration:${NC}"
    
    # Check if backend/.env exists
    if [ ! -f "backend/.env" ]; then
        echo -e "${YELLOW}backend/.env not found. Creating from template...${NC}"
        cp backend/.env.example backend/.env
    fi
    
    # Load current values
    source backend/.env
    
    # Display current configuration
    echo -e "${BLUE}Current Configuration:${NC}"
    echo -e "  AWS Region: ${GREEN}${AWS_REGION:-us-east-1}${NC}"
    echo -e "  S3 Bucket: ${GREEN}${S3_BUCKET:-document-splitting-demo}${NC}"
    echo -e "  BDA Profile ARN: ${GREEN}${BDA_PROFILE_ARN:-Not configured}${NC}"
    echo -e "  BDA Project ARN: ${GREEN}${BDA_PROJECT_ARN:-Not configured}${NC}"
    echo -e "  Demo Mode: ${GREEN}${DEMO_MODE:-true}${NC}"
    echo ""
    
    # Configuration options
    echo -e "${BLUE}What would you like to update?${NC}"
    echo -e "  ${GREEN}1) AWS Region${NC}"
    echo -e "  ${GREEN}2) S3 Bucket${NC}"
    echo -e "  ${GREEN}3) BDA Profile ARN${NC}"
    echo -e "  ${GREEN}4) BDA Project ARN${NC}"
    echo -e "  ${GREEN}5) Toggle Demo Mode${NC}"
    echo -e "  ${GREEN}6) Update all settings${NC}"
    echo -e "  ${GREEN}7) Back to main menu${NC}"
    echo ""
    
    read -p "Enter your choice (1-7): " CONFIG_CHOICE
    
    case $CONFIG_CHOICE in
        1)
            echo -e "\n${BLUE}Update AWS Region${NC}"
            read -p "Enter AWS Region (current: ${AWS_REGION:-us-east-1}): " NEW_AWS_REGION
            if [ -n "$NEW_AWS_REGION" ]; then
                update_env_file "AWS_REGION" "$NEW_AWS_REGION"
            fi
            update_config_menu
            ;;
            
        2)
            echo -e "\n${BLUE}Update S3 Bucket${NC}"
            read -p "Enter S3 Bucket name (current: ${S3_BUCKET:-document-splitting-demo}): " NEW_S3_BUCKET
            if [ -n "$NEW_S3_BUCKET" ]; then
                update_env_file "S3_BUCKET" "$NEW_S3_BUCKET"
                
                # Ask if user wants to create the bucket
                read -p "Create this S3 bucket now? (y/n): " CREATE_BUCKET
                if [[ $CREATE_BUCKET == "y" || $CREATE_BUCKET == "Y" ]]; then
                    if check_aws_cli; then
                        echo -e "${BLUE}Creating S3 bucket: ${NEW_S3_BUCKET}${NC}"
                        aws s3 mb s3://$NEW_S3_BUCKET 2>/dev/null || echo -e "${YELLOW}Bucket already exists or creation failed${NC}"
                    else
                        echo -e "${RED}Cannot create bucket without AWS CLI configuration.${NC}"
                    fi
                fi
            fi
            update_config_menu
            ;;
            
        3)
            echo -e "\n${BLUE}Update BDA Profile ARN${NC}"
            read -p "Enter BDA Profile ARN: " NEW_BDA_PROFILE_ARN
            if [ -n "$NEW_BDA_PROFILE_ARN" ]; then
                update_env_file "BDA_PROFILE_ARN" "$NEW_BDA_PROFILE_ARN"
            fi
            update_config_menu
            ;;
            
        4)
            echo -e "\n${BLUE}Update BDA Project ARN${NC}"
            read -p "Enter BDA Project ARN: " NEW_BDA_PROJECT_ARN
            if [ -n "$NEW_BDA_PROJECT_ARN" ]; then
                update_env_file "BDA_PROJECT_ARN" "$NEW_BDA_PROJECT_ARN"
            fi
            update_config_menu
            ;;
            
        5)
            echo -e "\n${BLUE}Toggle Demo Mode${NC}"
            if [[ $DEMO_MODE == "true" ]]; then
                echo -e "${YELLOW}Demo Mode is currently enabled. Disabling...${NC}"
                update_env_file "DEMO_MODE" "false"
            else
                echo -e "${YELLOW}Demo Mode is currently disabled. Enabling...${NC}"
                update_env_file "DEMO_MODE" "true"
            fi
            update_config_menu
            ;;
            
        6)
            echo -e "\n${BLUE}Update all settings${NC}"
            
            read -p "Enter AWS Region (current: ${AWS_REGION:-us-east-1}): " NEW_AWS_REGION
            if [ -n "$NEW_AWS_REGION" ]; then
                update_env_file "AWS_REGION" "$NEW_AWS_REGION"
            fi
            
            read -p "Enter S3 Bucket name (current: ${S3_BUCKET:-document-splitting-demo}): " NEW_S3_BUCKET
            if [ -n "$NEW_S3_BUCKET" ]; then
                update_env_file "S3_BUCKET" "$NEW_S3_BUCKET"
                
                # Ask if user wants to create the bucket
                read -p "Create this S3 bucket now? (y/n): " CREATE_BUCKET
                if [[ $CREATE_BUCKET == "y" || $CREATE_BUCKET == "Y" ]]; then
                    if check_aws_cli; then
                        echo -e "${BLUE}Creating S3 bucket: ${NEW_S3_BUCKET}${NC}"
                        aws s3 mb s3://$NEW_S3_BUCKET 2>/dev/null || echo -e "${YELLOW}Bucket already exists or creation failed${NC}"
                    else
                        echo -e "${RED}Cannot create bucket without AWS CLI configuration.${NC}"
                    fi
                fi
            fi
            
            read -p "Enter BDA Profile ARN: " NEW_BDA_PROFILE_ARN
            if [ -n "$NEW_BDA_PROFILE_ARN" ]; then
                update_env_file "BDA_PROFILE_ARN" "$NEW_BDA_PROFILE_ARN"
            fi
            
            read -p "Enter BDA Project ARN: " NEW_BDA_PROJECT_ARN
            if [ -n "$NEW_BDA_PROJECT_ARN" ]; then
                update_env_file "BDA_PROJECT_ARN" "$NEW_BDA_PROJECT_ARN"
            fi
            
            read -p "Enable Demo Mode? (y/n): " DEMO_MODE_CHOICE
            if [[ $DEMO_MODE_CHOICE == "y" || $DEMO_MODE_CHOICE == "Y" ]]; then
                update_env_file "DEMO_MODE" "true"
            else
                update_env_file "DEMO_MODE" "false"
            fi
            
            update_config_menu
            ;;
            
        7)
            show_main_menu
            ;;
            
        *)
            echo -e "\n${RED}Invalid option. Please try again.${NC}"
            update_config_menu
            ;;
    esac
}

# Cleanup resources
cleanup_resources() {
    echo ""
    echo -e "${BLUE}Cleanup AWS Resources:${NC}"
    echo -e "${RED}⚠️  WARNING: This will delete ALL resources including:${NC}"
    echo -e "${RED}   - App Runner services in all regions${NC}"
    echo -e "${RED}   - CloudFormation stacks${NC}"
    echo -e "${RED}   - S3 buckets and all contents${NC}"
    echo -e "${RED}   - BDA Projects and Blueprints${NC}"
    echo -e "${RED}   - ECR repositories${NC}"
    echo -e "${RED}   - IAM roles${NC}"
    echo ""
    
    # Safety confirmation
    read -p "Are you sure you want to delete ALL resources? Type 'DELETE' to confirm: " confirm
    if [ "$confirm" != "DELETE" ]; then
        echo -e "${YELLOW}❌ Cleanup cancelled${NC}"
        show_main_menu
        return
    fi
    
    # Check AWS CLI
    if ! check_aws_cli; then
        echo -e "${RED}Cannot cleanup resources without AWS CLI configuration.${NC}"
        read -p "Press Enter to continue..." input
        show_main_menu
        return
    fi
    
    echo -e "\n${BLUE}Starting cleanup process...${NC}"
    ./scripts/cleanup-all.sh
    
    echo -e "\n${GREEN}Cleanup completed!${NC}"
    read -p "Press Enter to continue..." input
    show_main_menu
}

# Start the script
show_main_menu