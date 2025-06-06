import React from 'react';
import {
  Container,
  Header,
  Table,
  Box,
  SpaceBetween,
  Alert,
  Cards,
  Badge,
  ProgressBar
} from '@cloudscape-design/components';

const CostAnalysis: React.FC = () => {
  // Anonymized cost data based on public AWS pricing
  const processingMethods = [
    {
      id: "standard-plus-ai",
      method: "Standard Processing + AI Enhancement",
      costPerPage: "$0.010-$0.015",
      processingTime: "45-120 seconds",
      description: "Standard document processing with AI model enhancement for improved accuracy",
      standard: true
    },
    {
      id: "custom-blueprint",
      method: "Custom Blueprint Processing",
      costPerPage: "$0.040-$0.050",
      processingTime: "45-120 seconds",
      description: "Dedicated custom processing templates optimized for specific document types",
      standard: false
    }
  ];

  // Generic volume assumptions for demonstration
  const volumeMetrics = [
    { label: "Monthly Documents", value: "300-500", description: "Typical enterprise volume" },
    { label: "Average Pages/Doc", value: "150-200", description: "Based on standard applications" },
    { label: "Annual Page Volume", value: "600K-700K", description: "Projected total processing" }
  ];

  return (
    <Container
      header={
        <Header
          variant="h1"
          description="Comparative analysis of document processing approaches and associated costs"
        >
          Document Processing Cost Analysis
        </Header>
      }
    >
      <SpaceBetween direction="vertical" size="l">

        {/* Disclaimer for legal compliance */}
        <Alert type="info">
          <strong>Pricing Disclaimer:</strong> Cost estimates based on publicly available AWS pricing as of Jun 2025.
          Actual costs may vary based on usage patterns, region, and specific configurations.
          Consult AWS pricing calculator for precise estimates.
        </Alert>

        {/* Processing method cards for better visibility */}
        <Box variant="h2">Processing Method Comparison</Box>

        <Cards
          ariaLabels={{
            itemSelectionLabel: (e, t) => `select ${t.method}`,
            selectionGroupLabel: "Processing method selection"
          }}
          cardDefinition={{
            header: item => (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{item.method}</span>
                {item.standard && <Badge color="blue">Cost Effective</Badge>}
                {!item.standard && <Badge color="green">High Performance</Badge>}
              </div>
            ),
            sections: [
              {
                id: "cost",
                header: "Cost Analysis",
                content: item => (
                  <div>
                    <div><strong>Per Page:</strong> {item.costPerPage}</div>
                  </div>
                )
              },
              {
                id: "description",
                header: "Description",
                content: item => item.description
              }
            ]
          }}
          cardsPerRow={[
            { cards: 1 },
            { minWidth: 500, cards: 2 }
          ]}
          items={processingMethods}
        />

        {/* Detailed cost breakdown with better formatting */}
        <Box variant="h3">Detailed Cost Structure</Box>

        <SpaceBetween direction="vertical" size="m">
          <Box variant="awsui-key-label">Standard Processing + AI Enhancement</Box>
          <div style={{ paddingLeft: '16px', backgroundColor: '#fafbfc', padding: '12px', borderRadius: '4px' }}>
            <div>• Base Processing: $0.010 per page</div>
            <div>• AI Model Usage: $0.000035-$0.0032 per 1K tokens (varies by model)</div>
            <div>• <strong>Best for:</strong> High-volume processing with flexible AI model selection</div>
            <div>• <strong>Use case:</strong> Cost-sensitive operations requiring good accuracy</div>
          </div>

          <Box variant="awsui-key-label">Custom Blueprint Processing</Box>
          <div style={{ paddingLeft: '16px', backgroundColor: '#fafbfc', padding: '12px', borderRadius: '4px' }}>
            <div>• Enhanced Processing: $0.040 per page (includes base processing)</div>
            <div>• Additional Custom Fields: $0.0005 per field per page (for fields beyond 30)</div>
            <div>• <strong>Best for:</strong> Maximum accuracy with specialized document types</div>
            <div>• <strong>Use case:</strong> Mission-critical processing requiring high precision</div>
          </div>
        </SpaceBetween>

        {/* Implementation considerations */}
        <Alert type="warning">
          <strong>Implementation Note:</strong> These estimates assume typical enterprise document processing volumes.
          Consider running a pilot program with a subset of documents to validate costs and performance
          before full-scale implementation.
        </Alert>

      </SpaceBetween>
    </Container>
  );
};

export default CostAnalysis;