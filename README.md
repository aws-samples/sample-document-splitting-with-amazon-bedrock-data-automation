# Document Splitting with Amazon Bedrock Data Automation

This sample demonstrates how to automatically split and categorize large combined PDF documents using Amazon Bedrock Data Automation (BDA). The solution showcases two approaches with different cost and accuracy trade-offs.

## Overview

Many organizations deal with large combined PDF documents containing multiple document types. This sample provides a solution to:

- Automatically identify document boundaries within combined PDFs
- Categorize different document types (credit reports, loan applications, etc.)
- Flag missing required documents
- Reduce manual review time and improve accuracy

## How Document Splitting Works

Amazon Bedrock Data Automation (BDA) supports splitting documents when using projects with the Amazon Bedrock API. When enabled, splitting allows BDA to take a PDF containing multiple logical documents and split it into separate documents for processing.

### Document Splitting Process

Once splitting is complete, each segment of the split document is processed independently. This means an input document can contain different document types. For example, if you have a PDF containing 3 bank statements and one W2, splitting would attempt to divide it into 4 separate documents that would be processed individually.

### Capabilities and Limitations

- **Maximum file size**: Up to 3,000 pages per input document
- **Individual document limit**: Up to 20 pages per split document
- **Default setting**: Document splitting is disabled by default but can be enabled via API

## Solution Approaches

### Approach 1: BDA Standard + Bedrock
- Uses BDA Standard Output for document extraction ($0.010/page)
- Employs Foundation models for post-processing and classification
- Best for: High-volume processing with budget constraints

### Approach 2: BDA Custom Output + Document Splitting
- Uses BDA's custom blueprints with built-in classification ($0.040/page)
- **Document splitting**: Enabled with blueprint-specific processing
- Higher accuracy with dedicated document type blueprints
- Best for: Maximum accuracy requirements with dedicated budget

## Architecture

![Document Splitting Architecture](assets/architecture.svg)

## Prerequisites

- AWS Account with appropriate permissions
- Node.js 18+
- AWS CLI configured
- Docker (optional, for container deployment)

## Quick Start

The easiest way to get started is using our interactive setup script:

```bash
./scripts/interactive-setup.sh
```

This all-in-one script provides options to:
- Setup and deploy the application
- Run the demo locally
- Update configuration settings
- Clean up AWS resources

## Manual Setup

1. **Clone the repository**

```bash
git clone https://github.com/aws-samples/sample-document-splitting-with-amazon-bedrock-data-automation.git
cd sample-document-splitting-with-amazon-bedrock-data-automation
```

2. **Install dependencies**

```bash
npm run install:all
```

3. **Configure environment**

```bash
# create sample blueprints using ./scripts/interactive-setup.sh quick start.

cp backend/.env.example backend/.env
# Edit backend/.env with your AWS settings
```

4. **Start development servers**

```bash
npm run dev
```

This will start both the backend server (port 8080) and frontend development server (port 3000).

## Environment Configuration

Configure your environment by editing `backend/.env`:

```
# AWS Configuration
AWS_REGION=us-east-1
S3_BUCKET=document-splitting-demo
BDA_PROFILE_ARN=arn:aws:bedrock:us-east-1:123456789012:data-automation-profile/your-profile-id
BDA_PROJECT_ARN=arn:aws:bedrock:us-east-1:123456789012:data-automation-project/your-project-id

# Application Configuration
NODE_ENV=development
PORT=8080
FRONTEND_URL=http://localhost:3000

# Processing Configuration
MAX_FILE_SIZE=52428800
MAX_PAGES=200
PROCESSING_TIMEOUT=300000

# Logging
LOG_LEVEL=info

# Demo Mode (set to true for mock responses when AWS services not configured)
DEMO_MODE=true
```

## Project Structure

```
sample-document-splitting-with-amazon-bedrock-data-automation/
├── backend/                 # Node.js API server
│   ├── src/                 # Backend source code
│   │   ├── config/          # Configuration files
│   │   ├── handlers/        # Route handlers
│   │   ├── services/        # Business logic
│   │   ├── utils/           # Utilities
│   │   └── index.js         # Entry point
│   ├── .env                 # Environment variables (create from .env.example)
│   └── package.json         # Backend dependencies
├── frontend/                # React frontend
│   ├── public/              # Static assets
│   │   └── docs/            # Documentation
│   ├── src/                 # Frontend source code
│   │   ├── components/      # UI components
│   │   ├── pages/           # Application pages
│   │   └── App.tsx          # Main application component
│   └── package.json         # Frontend dependencies
├── samples/                 # Sample documents
│   └── documents/           # Sample PDF documents
├── scripts/                 # Utility scripts
│   ├── deploy-apprunner.sh  # Deploy to AWS App Runner
│   ├── deploy-complete.sh   # Complete deployment script
│   ├── interactive-setup.sh # All-in-one interactive setup and demo tool
│   ├── push_to_public_ecr.sh # Push Docker image to ECR Public
│   └── upload-sample-document.sh # Upload sample document to S3
├── cleanup-all.sh           # Clean up all AWS resources
├── cloudformation-template.yaml # CloudFormation template
├── Dockerfile               # Docker configuration
└── package.json             # Root package.json
```

## Deployment Options

### 1. Interactive Deployment (Recommended)

For a guided deployment experience:

```bash
./scripts/interactive-setup.sh
```

Choose "Setup & Deploy" from the main menu, then select your preferred deployment option.

### 2. Manual Deployment Options

#### CloudFormation Deployment

```bash
./scripts/deploy-complete.sh
```

#### App Runner Deployment

```bash
./scripts/deploy-apprunner.sh
```

#### Docker Deployment

```bash
docker build -t document-splitting:latest .
docker run -p 8080:8080 document-splitting:latest
```

## Document Types Supported

The system is configured to identify and process:

1. **Uniform Residential Loan Application (URLA)** - 9-page loan application document with detailed borrower information
2. **Homebuyer Certificates** - Certificates issued to participants who completed homebuyer education programs  
3. **Uniform Residential Appraisal Report (Form 1004)** - Property appraisal documents with contract prices and borrower details
4. **Bank Statements** - Financial statements with account information and transaction summaries
5. **Uniform Underwriting and Transmittal Summary (Form 1008)** - Multi-page mortgage underwriting forms
6. **Driver's License** - US driver's license documents (using AWS public blueprint)

These document types are defined through custom Amazon Bedrock Data Automation blueprints that specify the exact fields and data structures to extract from each document type.

## API Endpoints

### Document Processing
- `POST /api/upload` - Upload PDF documents
- `POST /api/processing/bda-standard` - Process with BDA Standard + Bedrock
- `POST /api/processing/bda-custom` - Process with BDA Custom Output
- `GET /api/processing/status/:jobId` - Check processing status

### Analysis
- `GET /api/analysis/costs` - Calculate processing costs
- `GET /api/analysis/comparison` - Compare processing methods
- `GET /api/analysis/documents/:jobId` - Get document analysis results

## Cleanup

To remove all AWS resources created by this sample:

```bash
./scripts/interactive-setup.sh
```

Choose "Cleanup Resources" from the main menu.

## Security

See [CONTRIBUTING](CONTRIBUTING) for more information.

## License

This library is licensed under the MIT-0 License. See the LICENSE file.