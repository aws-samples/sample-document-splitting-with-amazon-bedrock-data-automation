// frontend/src/components/results/ResultsView.tsx - PDF viewer 반응형 수정
import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { Document as PDFDocument, Page, pdfjs } from 'react-pdf';
import { Document, Job } from '../../types';

// PDF.js worker 설정
pdfjs.GlobalWorkerOptions.workerSrc = '/js/pdf.worker.min.mjs';

interface ResultsViewProps {
  job: Job;
  uploadedFile?: any;
}

const ResultsView: React.FC<ResultsViewProps> = ({ job, uploadedFile }) => {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [modalPageNumber, setModalPageNumber] = useState<number>(1);
  const [modalNumPages, setModalNumPages] = useState<number>(0);

  // PDF viewer 컨테이너 크기 관리
  const [viewerWidth, setViewerWidth] = useState<number>(500);
  const [modalViewerWidth, setModalViewerWidth] = useState<number>(600);
  const containerRef = useRef<HTMLDivElement>(null);
  const modalContainerRef = useRef<HTMLDivElement>(null);

  // 컨테이너 크기 측정
  const updateViewerSizes = useCallback(() => {
    if (containerRef.current) {
      const containerWidth = containerRef.current.offsetWidth;
      // 패딩과 여백을 고려해서 90% 사용
      const maxWidth = Math.min(containerWidth * 0.9, 800);
      setViewerWidth(Math.max(300, maxWidth)); // 최소 300px
    }

    if (modalContainerRef.current) {
      const modalWidth = modalContainerRef.current.offsetWidth;
      const maxModalWidth = Math.min(modalWidth * 0.85, 900);
      setModalViewerWidth(Math.max(400, maxModalWidth)); // 최소 400px
    }
  }, []);

  // 창 크기 변경 감지
  useEffect(() => {
    updateViewerSizes();

    const handleResize = () => {
      setTimeout(updateViewerSizes, 100); // 디바운스
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updateViewerSizes]);

  // PDF URL 가져오기
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

  const formatTime = (ms: any): string => {
    const num = safeNumber(ms);
    return num < 1000 ? `${Math.round(num)}ms` : `${(num / 1000).toFixed(1)}s`;
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

  // Method name 가져오기
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

  // PDF navigation - 안전한 상태 업데이트
  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    // 현재 페이지가 범위를 벗어나면 조정
    setPageNumber(prev => Math.min(prev, numPages));
  }, []);

  const goToPage = useCallback((page: number) => {
    setPageNumber(Math.max(1, Math.min(page, numPages)));
  }, [numPages]);

  const goToDocumentPage = useCallback((document: Document) => {
    const startPage = getDocumentStartPage(document);
    if (startPage > 0) {
      goToPage(startPage);
      setSelectedDocument(document);
    }
  }, [goToPage]);

  // Modal PDF navigation - 안전한 상태 관리
  const goToModalPage = useCallback((page: number) => {
    setModalPageNumber(Math.max(1, Math.min(page, modalNumPages)));
  }, [modalNumPages]);

  const onModalDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setModalNumPages(numPages);
    if (selectedDocument) {
      const startPage = getDocumentStartPage(selectedDocument);
      setModalPageNumber(Math.min(startPage, numPages));
    }
  }, [selectedDocument]);

  // Modal 열기 - 안전한 상태 초기화
  const handleViewDetails = useCallback((document: Document) => {
    setSelectedDocument(document);
    const startPage = getDocumentStartPage(document);
    setModalPageNumber(startPage);
    setModalNumPages(0); // 초기화
    setShowDetailModal(true);

    // 모달 크기 업데이트
    setTimeout(updateViewerSizes, 100);
  }, [updateViewerSizes]);

  // Modal 닫기
  const handleCloseModal = useCallback(() => {
    setShowDetailModal(false);
    setSelectedDocument(null);
    setModalPageNumber(1);
    setModalNumPages(0);
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

    return (
      <div ref={modalContainerRef}>
        <Tabs
          tabs={[
            {
              label: "Extracted Fields",
              id: "fields",
              content: (
                <Box>
                  {Object.keys(structuredData).length === 0 ? (
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
                            <div style={{ maxWidth: '400px', wordBreak: 'break-word' }}>
                              <Box>
                                {item.value.length > 200 ? (
                                  <>
                                    {item.value.substring(0, 200)}...
                                    <Box margin={{ top: 'xs' }}>
                                      <Button
                                        variant="link"
                                        onClick={() => navigator.clipboard.writeText(item.value)}
                                      >
                                        Copy full value
                                      </Button>
                                    </Box>
                                  </>
                                ) : (
                                  item.value
                                )}
                              </Box>
                            </div>
                          )
                        }
                      ]}
                      items={flattenObject(structuredData)}
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
                    <SpaceBetween direction="vertical" size="m">
                      <Box variant="h5">
                        {selectedDocument.type?.replace(/_/g, ' ').toUpperCase()} - Pages {selectedDocument.pageRange}
                      </Box>

                      <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        width: '100%'
                      }}>
                        <PDFDocument
                          file={pdfUrl}
                          onLoadSuccess={onModalDocumentLoadSuccess}
                          loading="Loading PDF..."
                          error="Failed to load PDF"
                        >
                          <Page
                            pageNumber={modalPageNumber}
                            width={modalViewerWidth}
                            renderTextLayer={false}
                            renderAnnotationLayer={false}
                          />
                        </PDFDocument>
                      </div>

                      {modalNumPages > 0 && (
                        <Box textAlign="center">
                          <SpaceBetween direction="horizontal" size="s" alignItems="center">
                            <Button
                              disabled={modalPageNumber <= 1}
                              onClick={() => goToModalPage(modalPageNumber - 1)}
                              iconName="angle-left"
                            >
                              Previous
                            </Button>

                            <Box variant="h5">
                              Page {modalPageNumber} of {modalNumPages}
                            </Box>

                            <Button
                              disabled={modalPageNumber >= modalNumPages}
                              onClick={() => goToModalPage(modalPageNumber + 1)}
                              iconName="angle-right"
                              iconAlign="right"
                            >
                              Next
                            </Button>
                          </SpaceBetween>

                          <Box margin={{ top: 's' }} variant="small" color="text-body-secondary">
                            This document spans pages {selectedDocument.pageRange}.
                          </Box>
                        </Box>
                      )}

                    </SpaceBetween>
                  ) : (
                    <Alert type="info" header="PDF Viewer Not Available">
                      <Box>Page range: {selectedDocument.pageRange}</Box>
                    </Alert>
                  )}
                </Box>
              )
            },
            ...(bedrockAnalysis ? [{
              label: "AI Analysis",
              id: "analysis",
              content: (
                <SpaceBetween direction="vertical" size="s">
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
        uploadedFile ? (
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
            <div ref={containerRef}>
              <SpaceBetween direction="vertical" size="m">

                <Box textAlign="center">
                  <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    width: '100%'
                  }}>
                    <PDFDocument
                      file={pdfUrl}
                      onLoadSuccess={onDocumentLoadSuccess}
                      loading="Loading PDF..."
                      error="Failed to load PDF"
                    >
                      <Page
                        pageNumber={pageNumber}
                        width={viewerWidth}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                      />
                    </PDFDocument>
                  </div>
                </Box>

                {numPages > 0 && (
                  <Box textAlign="center">
                    <SpaceBetween direction="horizontal" size="s" alignItems="center">
                      <Button
                        disabled={pageNumber <= 1}
                        onClick={() => goToPage(pageNumber - 1)}
                        iconName="angle-left"
                      >
                        Previous
                      </Button>

                      <Box variant="h4">
                        Page {pageNumber} of {numPages}
                      </Box>

                      <Button
                        disabled={pageNumber >= numPages}
                        onClick={() => goToPage(pageNumber + 1)}
                        iconName="angle-right"
                        iconAlign="right"
                      >
                        Next
                      </Button>
                    </SpaceBetween>
                  </Box>
                )}

              </SpaceBetween>
            </div>
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