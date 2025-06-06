import React from 'react';
import { Link } from 'react-router-dom';

const Documentation: React.FC = () => {
  return (
    <div className="documentation-component">
      <h2>Documentation</h2>
      <p>
        Access our comprehensive documentation to learn more about the Document Splitting with Amazon Bedrock Data Automation.
      </p>
      <div className="documentation-links">
        <a href="/docs/index.html" target="_blank" rel="noopener noreferrer">
          Documentation Home
        </a>
        <a href="/docs/architecture.html" target="_blank" rel="noopener noreferrer">
          Architecture
        </a>
        <a href="/docs/api-reference.html" target="_blank" rel="noopener noreferrer">
          API Reference
        </a>
        <a href="/docs/deployment.html" target="_blank" rel="noopener noreferrer">
          Deployment Guide
        </a>
        <a href="/docs/troubleshooting.html" target="_blank" rel="noopener noreferrer">
          Troubleshooting
        </a>
      </div>
      <div className="documentation-note">
        <p>
          <strong>Note:</strong> The documentation opens in a new tab and provides detailed information
          about the application's architecture, API endpoints, deployment process, and troubleshooting tips.
        </p>
      </div>
    </div>
  );
};

export default Documentation;