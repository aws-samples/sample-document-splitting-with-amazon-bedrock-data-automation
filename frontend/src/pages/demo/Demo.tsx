// frontend/src/pages/demo/Demo.tsx - Updated for comparison
import React, { useState, useEffect } from 'react';
import {
  Container,
  Header,
  SpaceBetween,
  Tabs,
  Box,
  Alert,
  Select,
  FormField,
  Toggle,
  ColumnLayout,
  Cards,
  Badge
} from '@cloudscape-design/components';
import FileUpload from '../../components/upload/FileUpload';
import ComparisonProcessing from '../../components/comparison/ComparisonProcessing';
import ComparisonResults from '../../components/comparison/ComparisonResults';
import axios from 'axios';

interface ModelOption {
  label: string;
  value: string;
  description?: string;
}

const Demo: React.FC = () => {
  const [activeTab, setActiveTab] = useState("upload");
  const [uploadedFile, setUploadedFile] = useState<any>(null);
  const [selectedModel, setSelectedModel] = useState('nova-pro');
  const [comparisonResults, setComparisonResults] = useState<any>(null);
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([
    { label: 'Nova Pro - Advanced performance with higher accuracy', value: 'nova-pro' },
    { label: 'Nova Lite - Balanced performance and cost', value: 'nova-lite' },
    { label: 'Nova Micro - Fast and cost-effective', value: 'nova-micro' },
    { label: 'Claude 3.7 Sonnet - High accuracy, higher cost', value: 'claude-3-7-sonnet' }
  ]);
  const processingMethods = [
    {
      name: "Standard Processing + AI Enhancement",
      description: "Cost-effective approach using standard document processing enhanced with AI classification",
      features: ["Flexible AI model selection", "Good accuracy for most documents", "Optimized for high-volume processing"],
      bestFor: "Large-scale document processing with budget considerations",
      badge: "Cost Effective"
    },
    {
      name: "Custom Blueprint Processing",
      description: "Premium processing using specialized templates for maximum accuracy",
      features: ["Specialized document templates", "Highest accuracy available", "Automated field extraction"],
      bestFor: "Mission-critical documents requiring precise classification",
      badge: "Premium Accuracy"
    }
  ];

  useEffect(() => {
    // Load available models from backend
    axios.get('/api/processing/models')
      .then(response => {
        if (response.data.success && response.data.models) {
          const models = response.data.models.map((model: any) => ({
            label: `${model.name} - ${model.description}`,
            value: model.id,
            description: model.description
          }));
          setAvailableModels(models);
        }
      })
      .catch(error => {
        console.error('Failed to load models:', error);
      });
  }, []);

  return (
    <Container
      header={
        <Header variant="h1">
          Live Demo - Processing Method Comparison
        </Header>
      }
    >
      <SpaceBetween direction="vertical" size="l">
        <Tabs
          activeTabId={activeTab}
          onChange={({ detail }) => setActiveTab(detail.activeTabId)}
          tabs={[
            {
              label: "Configure & Upload",
              id: "upload",
              content: (
                <Box padding="l">
                  <SpaceBetween direction="vertical" size="l">
                    {/* Processing Methods Overview */}
                    <Container header={<Header variant="h2">Processing Methods Available</Header>}>
                      <Cards
                        cardDefinition={{
                          header: item => (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span>{item.name}</span>
                              <Badge color={item.badge === "Premium Accuracy" ? "blue" : "grey"}>
                                {item.badge}
                              </Badge>
                            </div>
                          ),
                          sections: [
                            {
                              id: "description",
                              content: item => <Box variant="p">{item.description}</Box>
                            },
                            {
                              id: "features",
                              header: "Key Features",
                              content: item => (
                                <Box>
                                  {item.features.map((feature: string, index: number) => (
                                    <Box key={index} variant="small">• {feature}</Box>
                                  ))}
                                </Box>
                              )
                            },
                            {
                              id: "bestFor",
                              header: "Best For",
                              content: item => <Box variant="small" color="text-body-secondary">{item.bestFor}</Box>
                            }
                          ]
                        }}
                        cardsPerRow={[{ cards: 1 }, { minWidth: 600, cards: 2 }]}
                        items={processingMethods}
                      />
                    </Container>



                    <FormField
                      label="Bedrock Model for Standard Processing"
                      description="Select the model for the BDA Standard + Bedrock approach"
                    >
                      <Select
                        selectedOption={
                          availableModels.find(model => model.value === selectedModel) ||
                          availableModels[0]
                        }
                        onChange={({ detail }) => {
                          if (detail.selectedOption?.value) {
                            setSelectedModel(detail.selectedOption.value);
                          }
                        }}
                        options={availableModels}
                        placeholder="Select a Bedrock model"
                      />
                    </FormField>

                    <FormField
                      label="Document Splitting"
                      description="Both methods will use automatic document splitting to identify individual documents within the combined PDF"
                    >
                      <Toggle
                        checked={true}
                        disabled={true}
                        onChange={() => { }}
                      >
                        Automatic document splitting enabled for both methods
                      </Toggle>
                    </FormField>

                    <FileUpload
                      onUploadComplete={(file) => {
                        setUploadedFile(file);
                        setActiveTab("processing");
                      }}
                    />
                  </SpaceBetween>
                </Box>
              )
            },
            {
              label: "Processing Comparison",
              id: "processing",
              content: (
                <Box padding="l">
                  <ComparisonProcessing
                    uploadedFile={uploadedFile}
                    selectedModel={selectedModel}
                    onComplete={(results) => {
                      setComparisonResults(results);
                      setActiveTab("results");
                    }}
                  />
                </Box>
              )
            },
            {
              label: "Comparison Results",
              id: "results",
              content: (
                <Box padding="l">
                  <ComparisonResults
                    results={comparisonResults}
                    uploadedFile={uploadedFile}  // 이 부분이 누락되어 있었음
                  />
                </Box>
              )
            }
          ]}
        />
      </SpaceBetween>
    </Container>
  );
};

export default Demo;