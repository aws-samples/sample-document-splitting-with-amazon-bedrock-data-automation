// frontend/src/components/results/ResultsView.tsx - Simple iframe PDF viewer
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  SpaceBetween,
  Table,
  Alert,
  Badge,
  ColumnLayout,
  Container,
  Header,
  TableProps,
  Button,
  Modal,
  Tabs
} from '@cloudscape-design/components';
import { Document, Job } from '../../types';

interface ResultsViewProps {
  job: Job;
  uploadedFile?: any;
}

const ResultsView: React.FC<ResultsViewProps> = ({ job, uploadedFile }) => {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [iframeKey, setIframeKey] = useState<number>(0);

  // Get PDF URL
  useEffect(() => {
    const getPresignedUrl = async () => {
      if (uploadedFile && uploadedFile.s3Uri) {
        try {
          const response = await fetch(`/api/preview?s3Uri=${encodeURIComponent(uploadedFile.s3Uri)}`);
          const data = await response.json();

          if (data.success && data.presignedUrl) {
            setPdfUrl(data.presignedUrl);
            setPdfError(null);
          } else {
            setPdfError(data.error || 'Failed to get PDF access');
          }
        } catch (error) {
          setPdfError('Network error while getting PDF access');
        }
      }
    };

    getPresignedUrl();
  }, [uploadedFile]);

  if (!job?.results) {
    return (
      <Alert type="warning" header="No Results Available">
        Processing results are not available for this job.
      </Alert>
    );
  }

  const processingResults = job.results.results;
  const documents: Document[] = Array.isArray(processingResults.documents) ? processingResults.documents : [];
  const method = job.method;

  // Helper functions
  const safeNumber = (value: any): number => {
    const num = Number(value);
    return isNaN(num) || !isFinite(num) ? 0 : num;
  };

  const formatCurrency = (value: any): string => {
    const num = safeNumber(value);
    return num === 0 ? 'Free' : `$${num.toFixed(4)}`;
  };

  const getConfidenceColor = (confidence: any): "blue" | "grey" | "red" => {
    const num = safeNumber(confidence);
    if (num >= 0.7) return 'blue';
    if (num >= 0.5) return 'grey';
    return 'red';
  };

  const getDocumentStartPage = (document: Document): number => {
    if (document.pageRange) {
      const pageMatch = document.pageRange.match(/(\d+)/);
      if (pageMatch) {
        return parseInt(pageMatch[1]);
      }
    }
    return 1;
  };

  const goToPage = (page: number) => {
    setCurrentPage(page);
    setIframeKey(prev => prev + 1); // Force iframe reload
  };

  const goToDocumentPage = (document: Document) => {
    const startPage = getDocumentStartPage(document);
    goToPage(startPage);
  };

  // Get method name
  const getMethodName = (): string => {
    if (method === 'custom-output') {
      return 'Custom Processing';
    }

    if (method === 'standard-bedrock') {
      let modelName = null;

      if ((job.results as any)?.bedrockModel) {
        modelName = (job.results as any).bedrockModel;
      }

      if (!modelName && documents.length > 0) {
        const firstDocWithModel = documents.find(doc => doc.bedrockAnalysis?.model);
        if (firstDocWithModel?.bedrockAnalysis?.model) {
          modelName = firstDocWithModel.bedrockAnalysis.model;
        }
      }

      if (modelName) {
        const modelDisplayName = formatModelName(modelName);
        return `Standard + ${modelDisplayName}`;
      }

      return 'Standard + AI Enhancement';
    }

    return 'Unknown Method';
  };

  const formatModelName = (modelName: string): string => {
    const modelMap: { [key: string]: string } = {
      'nova-lite': 'Nova Lite',
      'nova-pro': 'Nova Pro',
      'nova-micro': 'Nova Micro',
      'claude-3-7-sonnet': 'Claude 3.7 Sonnet',
      'claude-3-5-sonnet': 'Claude 3.5 Sonnet',
      'claude-3-haiku': 'Claude 3 Haiku',
      'anthropic.claude-3-7-sonnet-20250219-v1:0': 'Claude 3.7 Sonnet',
      'us.anthropic.claude-3-7-sonnet-20250219-v1:0': 'Claude 3.7 Sonnet',
      'us.amazon.nova-lite-v1:0': 'Nova Lite',
      'us.amazon.nova-pro-v1:0': 'Nova Pro',
      'us.amazon.nova-micro-v1:0': 'Nova Micro'
    };

    if (modelMap[modelName]) {
      return modelMap[modelName];
    }

    if (modelName.includes('claude')) {
      if (modelName.includes('3-7-sonnet')) return 'Claude 3.7 Sonnet';
      if (modelName.includes('3-5-sonnet')) return 'Claude 3.5 Sonnet';
      if (modelName.includes('3-haiku')) return 'Claude 3 Haiku';
      if (modelName.includes('sonnet')) return 'Claude Sonnet';
      return 'Claude';
    }

    if (modelName.includes('nova')) {
      if (modelName.includes('lite')) return 'Nova Lite';
      if (modelName.includes('pro')) return 'Nova Pro';
      if (modelName.includes('micro')) return 'Nova Micro';
      return 'Nova';
    }

    return modelName
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase())
      .replace(/V\d+:\d+$/, '')
      .trim();
  };

  const handleViewDetails = useCallback((document: Document) => {
    setSelectedDocument(document);
    setShowDetailModal(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setShowDetailModal(false);
    setSelectedDocument(null);
  }, []);

  // Flatten object for display
  const flattenObject = (obj: any, prefix = ''): Array<{ field: string, value: string }> => {
    const items: Array<{ field: string, value: string }> = [];

    for (const [key, value] of Object.entries(obj)) {
      const fieldName = prefix ? `${prefix}.${key}` : key;

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        items.push(...flattenObject(value, fieldName));
      } else {
        if (value !== null && value !== undefined && value !== '') {
          const formattedValue = typeof value === 'object' ?
            JSON.stringify(value, null, 2) : String(value);
          items.push({
            field: fieldName.replace(/_/g, ' ').toUpperCase(),
            value: formattedValue
          });
        }
      }
    }

    return items;
  };

  // Document detail modal content
  const renderDocumentDetail = () => {
    if (!selectedDocument) return null;

    const structuredData = selectedDocument.structuredData || {};
    const bedrockAnalysis = selectedDocument.bedrockAnalysis;
    
    // Check if Standard + AI method
    const isStandardBedrock = method === 'standard-bedrock';
    
    // Standard + AI method shows all fields
    const allFields = flattenObject(structuredData);
    
    // AI Analysis specific fields (moved to AI Analysis tab in Standard + AI)
    const aiAnalysisFields = ['PRIMARY IDENTIFIER', 'PAGE RANGE', 'KEY INDICATORS'];
    
    // Fields to show in Extracted Fields tab for Standard + AI (excluding AI Analysis fields)
    const extractedFields = isStandardBedrock ? 
      allFields.filter(item => !aiAnalysisFields.includes(item.field)) : 
      allFields;
    
    // Fields to show in AI Analysis tab (Standard + AI method only)
    const aiFields = isStandardBedrock ? 
      allFields.filter(item => aiAnalysisFields.includes(item.field)) : 
      [];

    return (
      <div>
        <Tabs
          tabs={[
            {
              label: "Extracted Fields",
              id: "fields",
              content: (
                <Box>
                  {extractedFields.length === 0 ? (
                    <Alert type="info">No structured data was extracted from this document.</Alert>
                  ) : (
                    <Table
                      columnDefinitions={[
                        {
                          id: "field",
                          header: "Field Name",
                          cell: (item: any) => <Box variant="code">{item.field}</Box>
                        },
                        {
                          id: "value",
                          header: "Extracted Value",
                          cell: (item: any) => (
                            <div style={{ maxWidth: '500px' }}>
                              {item.value.length > 100 ? (
                                <div style={{
                                  maxHeight: '120px',
                                  overflowY: 'auto',
                                  padding: '8px',
                                  backgroundColor: '#f8f9fa',
                                  border: '1px solid #e1e4e8',
                                  borderRadius: '4px',
                                  fontSize: '12px',
                                  fontFamily: 'monospace',
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-word'
                                }}>
                                  {item.value}
                                </div>
                              ) : (
                                <div style={{ wordBreak: 'break-word' }}>
                                  {item.value}
                                </div>
                              )}
                              {item.value.length > 100 && (
                                <Box margin={{ top: 'xs' }}>
                                  <Button
                                    variant="link"
                                    onClick={() => navigator.clipboard.writeText(item.value)}
                                  >
                                    Copy full value
                                  </Button>
                                </Box>
                              )}
                            </div>
                          )
                        }
                      ]}
                      items={extractedFields}
                      variant="embedded"
                    />
                  )}
                </Box>
              )
            },
            {
              label: "Document View",
              id: "page",
              content: (
                <Box textAlign="center">
                  {pdfUrl ? (
                    <Box>
                      <Box variant="h5" margin={{ bottom: 'm' }}>
                        {selectedDocument.type?.replace(/_/g, ' ').toUpperCase()} - Pages {selectedDocument.pageRange}
                      </Box>
                      <iframe
                        src={`${pdfUrl}#page=${getDocumentStartPage(selectedDocument)}`}
                        width="100%"
                        height="600px"
                        style={{ border: '1px solid #ccc', borderRadius: '4px' }}
                        title="PDF Document"
                      />
                    </Box>
                  ) : (
                    <Alert type="info" header="PDF Viewer Not Available">
                      <Box>Page range: {selectedDocument.pageRange}</Box>
                    </Alert>
                  )}
                </Box>
              )
            },
            ...(bedrockAnalysis || (isStandardBedrock && aiFields.length > 0) ? [{
              label: "AI Analysis",
              id: "analysis",
              content: (
                <SpaceBetween direction="vertical" size="s">
                  {bedrockAnalysis && (
                    <>
                      <ColumnLayout columns={2}>
                        <Box>
                          <Box variant="awsui-key-label">Model Used</Box>
                          <Box>{formatModelName(bedrockAnalysis.model || 'Unknown')}</Box>
                        </Box>
                        <Box>
                          <Box variant="awsui-key-label">Classification Result</Box>
                          <Box>{(bedrockAnalysis as any).classification || 'N/A'}</Box>
                        </Box>
                      </ColumnLayout>

                      {(bedrockAnalysis as any).confidence && (
                        <Box>
                          <Box variant="awsui-key-label">AI Confidence Score</Box>
                          <Box>{Math.round(safeNumber((bedrockAnalysis as any).confidence) * 100)}%</Box>
                        </Box>
                      )}

                      {(bedrockAnalysis as any).reasoning && (
                        <Box>
                          <Box variant="awsui-key-label">Analysis Reasoning</Box>
                          <div style={{
                            backgroundColor: '#f8f9fa',
                            padding: '12px',
                            borderRadius: '4px',
                            border: '1px solid #e1e4e8'
                          }}>
                            {(bedrockAnalysis as any).reasoning}
                          </div>
                        </Box>
                      )}
                    </>
                  )}
                  
                  {/* Show AI analysis fields for Standard + AI method */}
                  {isStandardBedrock && aiFields.length > 0 && (
                    <>
                      {bedrockAnalysis && <Box margin={{ top: 'l' }} />}
                      <Table
                        columnDefinitions={[
                          {
                            id: "field",
                            header: "Field Name",
                            cell: (item: any) => <Box variant="code">{item.field}</Box>
                          },
                          {
                            id: "value",
                            header: "Extracted Value",
                            cell: (item: any) => (
                              <div style={{ maxWidth: '500px' }}>
                                {item.value.length > 100 ? (
                                  <div style={{
                                    maxHeight: '120px',
                                    overflowY: 'auto',
                                    padding: '8px',
                                    backgroundColor: '#f8f9fa',
                                    border: '1px solid #e1e4e8',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    fontFamily: 'monospace',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word'
                                  }}>
                                    {item.value}
                                  </div>
                                ) : (
                                  <div style={{ wordBreak: 'break-word' }}>
                                    {item.value}
                                  </div>
                                )}
                                {item.value.length > 100 && (
                                  <Box margin={{ top: 'xs' }}>
                                    <Button
                                      variant="link"
                                      onClick={() => navigator.clipboard.writeText(item.value)}
                                    >
                                      Copy full value
                                    </Button>
                                  </Box>
                                )}
                              </div>
                            )
                          }
                        ]}
                        items={aiFields}
                        variant="embedded"
                        header={<Header variant="h3">AI Classification Results</Header>}
                      />
                    </>
                  )}
                </SpaceBetween>
              )
            }] : [])
          ]}
        />
      </div>
    );
  };

  // Table column definitions
  const columnDefinitions: TableProps.ColumnDefinition<Document>[] = [
    {
      id: "index",
      header: "#",
      cell: (item: Document, index?: number) => String((index || 0) + 1),
      width: 50
    },
    {
      id: "type",
      header: "Document Type",
      cell: (item: Document) => (
        <Box>
          <div style={{
            wordBreak: 'break-word',
            overflowWrap: 'anywhere',
            maxWidth: '200px'
          }}>
            <strong>{(item.type || 'Unknown').replace(/_/g, ' ').toUpperCase()}</strong>
          </div>
          <Box margin={{ top: 'xs' }}>
            <Badge color={getConfidenceColor(item.confidence)}>
              {Math.round(safeNumber(item.confidence) * 100)}% confidence
            </Badge>
          </Box>
        </Box>
      ),
      width: 200
    },
    {
      id: "pageRange",
      header: "Pages",
      cell: (item: Document) => (
        pdfUrl ? (
          <Button
            variant="link"
            onClick={() => goToDocumentPage(item)}
          >
            {item.pageRange || 'Unknown'}
          </Button>
        ) : (
          <span>{item.pageRange || 'Unknown'}</span>
        )
      ),
      width: 150
    },
    {
      id: "dataFields",
      header: "Fields",
      cell: (item: Document) => {
        const fieldCount = Object.keys(item.structuredData || {}).length;
        return fieldCount > 0 ? `${fieldCount} fields` : 'No data';
      },
      width: 80
    },
    {
      id: "actions",
      header: "Details",
      cell: (item: Document) => (
        <Button
          variant="link"
          onClick={() => handleViewDetails(item)}
        >
          Details
        </Button>
      ),
      width: 200
    }
  ];

  const methodName = getMethodName();
  const processingTimeMs = safeNumber(job.results.processingTimeMs);
  const totalCost = safeNumber(job.results.costs?.totalCost);

  return (
    <SpaceBetween direction="vertical" size="l">

      {/* Method Name Display */}
      <Container>
        <Box variant="h4">{methodName}</Box>
        <Box variant="small" color="text-body-secondary">
          Processing method used for document analysis
        </Box>
      </Container>

      {/* Summary Stats */}
      <ColumnLayout columns={4} variant="text-grid">
        <Box>
          <Box variant="awsui-key-label">Documents Found</Box>
          <Box variant="h4">{documents.length}</Box>
        </Box>
        <Box>
          <Box variant="awsui-key-label">Pages Processed</Box>
          <Box variant="h4">{safeNumber(processingResults.totalPages)}</Box>
        </Box>
        <Box>
          <Box variant="awsui-key-label">Total Cost</Box>
          <Box variant="h4">{formatCurrency(totalCost)}</Box>
        </Box>
      </ColumnLayout>

      {/* Main Content */}
      <ColumnLayout columns={pdfUrl ? 2 : 1}>

        {/* PDF Viewer */}
        {pdfUrl && !pdfError && (
          <Container header={<Header variant="h3">Document Viewer</Header>}>
            <iframe
              key={iframeKey}
              src={`${pdfUrl}#page=${currentPage}`}
              width="100%"
              height="600px"
              style={{ border: '1px solid #ccc', borderRadius: '4px' }}
              title="PDF Document"
            />
          </Container>
        )}

        {/* PDF Error Display */}
        {pdfError && (
          <Container header={<Header variant="h3">Document Viewer</Header>}>
            <Alert type="warning" header="PDF Viewer Unavailable">
              {pdfError}. Document analysis results are still available below.
            </Alert>
          </Container>
        )}

        {/* Results Table */}
        <Container header={<Header variant="h3">Identified Documents</Header>}>
          {documents.length === 0 ? (
            <Alert type="warning" header="No Documents Found">
              The processing method did not identify any documents in the uploaded file.
            </Alert>
          ) : (
            <Table<Document>
              columnDefinitions={columnDefinitions}
              items={documents}
              variant="embedded"
            />
          )}
        </Container>
      </ColumnLayout>

      {/* Document Detail Modal */}
      <Modal
        visible={showDetailModal}
        onDismiss={handleCloseModal}
        header={`Document Details: ${selectedDocument?.type?.replace(/_/g, ' ').toUpperCase() || 'Unknown'}`}
        size="max"
        footer={
          <Box float="right">
            <Button onClick={handleCloseModal}>Close</Button>
          </Box>
        }
      >
        {renderDocumentDetail()}
      </Modal>

    </SpaceBetween>
  );
};

export default ResultsView;