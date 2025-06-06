import React from 'react';
import {
  Container,
  Header,
  Cards,
  Box,
  SpaceBetween,
  Alert,
  Button,
  ColumnLayout,
  Link
} from '@cloudscape-design/components';

const Dashboard: React.FC = () => {
  return (
    <Container
      header={
        <Header
          variant="h1"
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button variant="primary" href="/demo">
                Start Demo
              </Button>
            </SpaceBetween>
          }
        >
          Document Splitting with Amazon Bedrock Data Automation
        </Header>
      }
    >
      <SpaceBetween direction="vertical" size="l">
        <Alert type="info">
          This demonstration showcases two approaches to automatically split and categorize
          large combined PDF documents using Amazon Bedrock Data Automation (BDA). <Link href="https://docs.aws.amazon.com/bedrock/latest/userguide/bda.html" target="_blank">View documentation</Link> for more details.
        </Alert>

        <ColumnLayout columns={2} variant="text-grid">
          <div>
            <Box variant="h2">Problem Statement</Box>
            <Box variant="p">
              Lenders upload large combined PDFs (150-200 pages) containing multiple document types.
              Manual review is time-consuming and error-prone. This solution automatically identifies
              document boundaries and categorizes content.
            </Box>
          </div>
          <div>
            <Box variant="h2">Solution Benefits</Box>
            <Box variant="p">
              {/* • 75-90% reduction in manual review time<br />
              • 92-98% accuracy in document classification<br /> */}
              • Cost-effective processing at $0.01-$0.04 per page<br />
              • Automatic missing document detection
            </Box>
          </div>
        </ColumnLayout>

        <Cards
          cardDefinition={{
            header: (item) => item.title,
            sections: [
              {
                content: (item) => item.description
              },
              {
                content: (item) => (
                  <Box variant="small">
                    Cost: {item.cost}
                  </Box>
                )
              }
            ]
          }}
          items={[
            {
              title: "BDA Standard + Bedrock",
              description: "BDA extracts standard output ($0.01/page), then Bedrock models (Claude 3.7, Nova Lite, Nova Micro) perform classification and structured extraction. Cost-effective for high-volume processing.",
              cost: "$0.01/page + model cost",
              features: "• Flexible model selection\n• Lower base cost\n• Post-processing flexibility"
            },
            {
              title: "BDA Custom Output",
              description: "BDA uses custom blueprints for direct structured extraction ($0.04/page for 1-30 fields). Higher cost but more precise extraction with custom schemas.",
              cost: "$0.04/page (for 1-30 fields)",
              features: "• Direct structured output\n• Custom blueprint schemas\n• No post-processing needed"
            }
          ]}
          cardsPerRow={[{ cards: 1 }, { minWidth: 600, cards: 2 }]}
        />

      </SpaceBetween>
    </Container>
  );
};

export default Dashboard;
