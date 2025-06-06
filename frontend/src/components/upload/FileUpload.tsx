// frontend/src/components/upload/FileUpload.tsx
import React, { useState, useRef, useEffect } from 'react';
import {
  FormField,
  Button,
  SpaceBetween,
  Alert,
  Box,
  ProgressBar,
  Icon,
  Container,
  Header,
  SegmentedControl,
  Badge,
  ColumnLayout
} from '@cloudscape-design/components';
import axios from 'axios';

interface FileUploadProps {
  onUploadComplete: (job: any) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onUploadComplete }) => {
  const [selectedMode, setSelectedMode] = useState('default'); // 'default' or 'upload'
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [config, setConfig] = useState<any>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 설정 로드
  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => setConfig(data))
      .catch(err => console.error('Failed to load config:', err));
  }, []);

  // 동적으로 기본 파일 정보 생성
  const defaultFile = {
    name: 'merged.pdf',
    s3Uri: config.sampleDocumentS3Uri || `s3://${config.s3Bucket}/samples/documents/merged.pdf`,
    bucket: config.s3Bucket || 'default-bucket',
    s3Key: 'samples/documents/merged.pdf',
    description: 'Pre-uploaded sample document containing multiple document types',
    estimatedPages: '22 pages',
    fileSize: '2.1 MB'
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setUploadError(null);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);

    const files = event.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        setSelectedFile(file);
        setUploadError(null);
      } else {
        setUploadError('Please select a PDF file');
      }
    }
  };

  const handlePreviewDocument = async () => {
    try {
      // 백엔드에서 presigned URL 가져오기
      const response = await fetch(`/api/preview?s3Uri=${encodeURIComponent(defaultFile.s3Uri)}`);
      const data = await response.json();

      if (data.success) {
        window.open(data.presignedUrl, '_blank');
      } else {
        setUploadError('Failed to generate preview URL');
      }
    } catch (error) {
      console.error('Preview failed:', error);
      setUploadError('Failed to preview document');
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setUploadProgress(0);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append('document', selectedFile);

      const response = await axios.post('/api/upload', formData, {
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(progress);
          }
        },
      });

      if (response.data.success) {
        const uploadResult = {
          id: response.data.fileId,
          filename: response.data.originalName,
          s3Uri: response.data.s3Uri,
          s3Key: response.data.s3Key,
          bucket: response.data.bucket,
          status: 'uploaded',
          uploadedAt: response.data.uploadedAt,
          fileSize: response.data.size
        };

        console.log('Upload successful:', uploadResult);
        onUploadComplete(uploadResult);
      } else {
        throw new Error(response.data.error || 'Upload failed');
      }

    } catch (error: any) {
      console.error('Upload failed:', error);

      let errorMessage = 'Upload failed';
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage = error.message;
      }

      setUploadError(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const handleUseDefaultFile = () => {
    const defaultFileResult = {
      id: 'default-merged-pdf',
      filename: defaultFile.name,
      s3Uri: defaultFile.s3Uri,
      s3Key: defaultFile.s3Key,
      bucket: defaultFile.bucket,
      status: 'ready',
      source: 'default'
    };

    console.log('Using default file:', defaultFileResult);
    onUploadComplete(defaultFileResult);
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  return (
    <Container header={<Header variant="h3">Select Document</Header>}>
      <SpaceBetween direction="vertical" size="l">
        {uploadError && (
          <Alert type="error" onDismiss={() => setUploadError(null)}>
            {uploadError}
          </Alert>
        )}

        {/* Mode Selection */}
        <FormField label="Choose document source">
          <SegmentedControl
            selectedId={selectedMode}
            onChange={({ detail }) => {
              setSelectedMode(detail.selectedId);
              setUploadError(null);
              setSelectedFile(null);
            }}
            options={[
              {
                text: "Use Sample Document",
                id: "default",
                iconName: "file"
              },
              {
                text: "Upload New File",
                id: "upload",
                iconName: "upload"
              }
            ]}
          />
        </FormField>

        {/* Default File Option */}
        {selectedMode === 'default' && (
          <Container>
            <SpaceBetween direction="vertical" size="m">
              <Box variant="h4">
                <SpaceBetween direction="horizontal" size="s">
                  <Icon name="file" />
                  Sample Document (6 merged documents)
                  <Badge color="green">Available</Badge>
                </SpaceBetween>
              </Box>

              <ColumnLayout columns={2} variant="text-grid">
                <SpaceBetween direction="vertical" size="xs">
                  <Box variant="awsui-key-label">File Name</Box>
                  <Box>{defaultFile.name}</Box>
                </SpaceBetween>
                <SpaceBetween direction="vertical" size="xs">
                  <Box variant="awsui-key-label">File Size</Box>
                  <Box>{defaultFile.fileSize}</Box>
                </SpaceBetween>
                <SpaceBetween direction="vertical" size="xs">
                  <Box variant="awsui-key-label">Pages</Box>
                  <Box>
                    <Badge color="blue">{defaultFile.estimatedPages}</Badge>
                  </Box>
                </SpaceBetween>
                <SpaceBetween direction="vertical" size="xs">
                  <Box variant="awsui-key-label">Content</Box>
                  <Box>Multiple document types</Box>
                </SpaceBetween>
              </ColumnLayout>

              <Box color="text-body-secondary">
                <strong>Description:</strong> {defaultFile.description}
              </Box>

              <Box color="text-body-secondary" fontSize="body-s">
                <strong>S3 URI:</strong> {defaultFile.s3Uri}
              </Box>

              <SpaceBetween direction="horizontal" size="s">
                <Button
                  variant="primary"
                  onClick={handleUseDefaultFile}
                  iconName="external"
                >
                  Use This Sample Document
                </Button>

                <Button
                  onClick={handlePreviewDocument}
                  iconName="view-full"
                >
                  Preview Document
                </Button>
              </SpaceBetween>
            </SpaceBetween>
          </Container>
        )}

        {/* Upload New File Option */}
        {selectedMode === 'upload' && (
          <SpaceBetween direction="vertical" size="m">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileSelect}
              disabled={uploading}
              style={{ display: 'none' }}
            />

            {/* Drag and drop area */}
            <Container>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={triggerFileSelect}
                style={{
                  border: `2px dashed ${dragOver ? '#0073bb' : '#d5dbdb'}`,
                  borderRadius: '8px',
                  padding: '40px 20px',
                  textAlign: 'center',
                  backgroundColor: dragOver ? '#f0f8ff' : '#fafafa',
                  cursor: uploading ? 'not-allowed' : 'pointer',
                  opacity: uploading ? 0.6 : 1,
                  transition: 'all 0.2s ease'
                }}
              >
                <SpaceBetween direction="vertical" size="m">
                  <Box textAlign="center">
                    <Icon
                      name={uploading ? "status-in-progress" : "upload"}
                      size="big"
                      variant={dragOver ? 'success' : 'normal'}
                    />
                  </Box>

                  <Box variant="h4" textAlign="center">
                    {uploading ? 'Uploading...' :
                      dragOver ? 'Drop your PDF here' :
                        'Drag and drop your PDF here'}
                  </Box>

                  <Box variant="p" textAlign="center" color="text-body-secondary">
                    {uploading ? 'Please wait...' : 'or click to browse files'}
                  </Box>

                  {!uploading && (
                    <Box textAlign="center">
                      <Button
                        variant="primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerFileSelect();
                        }}
                      >
                        <Icon name="folder-open" /> Choose File
                      </Button>
                    </Box>
                  )}
                </SpaceBetween>
              </div>
            </Container>

            {selectedFile && (
              <Container>
                <SpaceBetween direction="vertical" size="s">
                  <Box variant="h5">
                    <SpaceBetween direction="horizontal" size="s">
                      <Icon name="file" />
                      Selected File
                      <Badge color="blue">Ready to Upload</Badge>
                    </SpaceBetween>
                  </Box>

                  <ColumnLayout columns={2} variant="text-grid">
                    <SpaceBetween direction="vertical" size="xs">
                      <Box variant="awsui-key-label">File Name</Box>
                      <Box>{selectedFile.name}</Box>
                    </SpaceBetween>
                    <SpaceBetween direction="vertical" size="xs">
                      <Box variant="awsui-key-label">File Size</Box>
                      <Box>{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</Box>
                    </SpaceBetween>
                  </ColumnLayout>
                </SpaceBetween>
              </Container>
            )}

            {uploading && (
              <Container>
                <SpaceBetween direction="vertical" size="s">
                  <Box variant="h5">Upload Progress</Box>
                  <ProgressBar
                    value={uploadProgress}
                    label="Uploading to S3..."
                    description={`${uploadProgress}% complete`}
                  />
                </SpaceBetween>
              </Container>
            )}

            <SpaceBetween direction="horizontal" size="s">
              <Button
                variant="primary"
                disabled={!selectedFile || uploading}
                onClick={handleUpload}
                loading={uploading}
              >
                {uploading ? 'Uploading to S3...' : 'Upload to S3'}
              </Button>

              {selectedFile && !uploading && (
                <Button
                  onClick={() => {
                    setSelectedFile(null);
                    setUploadError(null);
                  }}
                >
                  Clear Selection
                </Button>
              )}
            </SpaceBetween>
          </SpaceBetween>
        )}
      </SpaceBetween>
    </Container>
  );
};

export default FileUpload;