// frontend/src/components/processing/ProcessingStatus.tsx
import React, { useState, useEffect } from 'react';
import {
  Box,
  SpaceBetween,
  ProgressBar,
  Alert,
  ColumnLayout,
  StatusIndicator,
  Container,
  Header
} from '@cloudscape-design/components';
import axios from 'axios';

interface ProcessingStatusProps {
  job: any;
  onComplete: (results: any) => void;
}

const ProcessingStatus: React.FC<ProcessingStatusProps> = ({ job, onComplete }) => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Initializing...');
  const [error, setError] = useState<string | null>(null);
  const [processingResults, setProcessingResults] = useState<any>(null);

  useEffect(() => {
    if (!job) return;

    const startProcessing = async () => {
      try {
        setStatus('Starting BDA processing...');
        setProgress(10);

        // 실제 처리 방법에 따라 다른 API 호출
        const endpoint = job.processingMethod === 'custom-output'
          ? '/api/processing/custom-output'
          : '/api/processing/standard-bedrock';

        const requestData: any = {
          s3Uri: job.s3Uri,
          enableSplitting: job.enableSplitting
        };

        if (job.processingMethod === 'standard-bedrock') {
          requestData.bedrockModel = job.selectedModel;
        }

        setStatus('Calling BDA API...');
        setProgress(30);

        // 실제 BDA API 호출
        const response = await axios.post(endpoint, requestData);

        if (response.data.success) {
          setStatus('Processing completed successfully!');
          setProgress(100);
          setProcessingResults(response.data);

          // 결과를 부모 컴포넌트로 전달
          setTimeout(() => {
            onComplete(response.data);
          }, 1000);
        } else {
          throw new Error(response.data.message || 'Processing failed');
        }

      } catch (error: any) {
        console.error('Processing error:', error);

        let errorMessage = 'Processing failed';
        if (error.response?.data?.message) {
          errorMessage = error.response.data.message;
        } else if (error.message) {
          errorMessage = error.message;
        }

        setError(errorMessage);
        setStatus('Processing failed');
      }
    };

    startProcessing();
  }, [job, onComplete]);

  if (!job) {
    return <Alert type="warning">No processing job found.</Alert>;
  }

  return (
    <Container header={<Header variant="h3">Processing Document</Header>}>
      <SpaceBetween direction="vertical" size="l">
        <Box variant="h4">Processing: {job.filename}</Box>

        {error ? (
          <Alert type="error">
            <Box variant="h5">Processing Error</Box>
            <Box>{error}</Box>
          </Alert>
        ) : (
          <>
            <ProgressBar
              value={progress}
              label={status}
              description={`Using ${job.processingMethod} method`}
            />

            <ColumnLayout columns={2}>
              <div>
                <Box variant="h5">Processing Method</Box>
                <Box>{job.processingMethod === 'custom-output' ? 'BDA Custom Output' : 'BDA Standard + Bedrock'}</Box>
                {job.selectedModel && (
                  <Box color="text-body-secondary">Model: {job.selectedModel}</Box>
                )}
              </div>
              <div>
                <Box variant="h5">Document Splitting</Box>
                <StatusIndicator type={job.enableSplitting ? "success" : "info"}>
                  {job.enableSplitting ? "Enabled" : "Disabled"}
                </StatusIndicator>
              </div>
            </ColumnLayout>

            {processingResults && (
              <Alert type="success">
                <Box variant="h5">Processing Complete!</Box>
                <Box>Job ID: {processingResults.jobId}</Box>
                <Box>Method: {processingResults.method}</Box>
                <Box>Processed at: {new Date(processingResults.processedAt).toLocaleString()}</Box>
              </Alert>
            )}
          </>
        )}
      </SpaceBetween>
    </Container>
  );
};

export default ProcessingStatus;