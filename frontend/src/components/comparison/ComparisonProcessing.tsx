// frontend/src/components/comparison/ComparisonProcessing.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
    Box,
    SpaceBetween,
    Alert,
    StatusIndicator,
    Container,
    Header,
    ProgressBar
} from '@cloudscape-design/components';
import axios from 'axios';

interface ComparisonProcessingProps {
    uploadedFile: any;
    selectedModel: string;
    onComplete: (results: { standardBedrock: any; customOutput: any }) => void;
}

const ComparisonProcessing: React.FC<ComparisonProcessingProps> = ({
    uploadedFile,
    selectedModel,
    onComplete
}) => {
    const [status, setStatus] = useState<'starting' | 'processing' | 'completed' | 'error'>('starting');
    const [progress, setProgress] = useState(0);
    const [currentStep, setCurrentStep] = useState('Initializing...');
    const [error, setError] = useState<string | null>(null);
    const [jobId, setJobId] = useState<string | null>(null);
    const [startTime] = useState(Date.now());
    const [elapsedTime, setElapsedTime] = useState(0);

    const pollingRef = useRef<NodeJS.Timeout | null>(null);
    const isComponentMounted = useRef(true);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            isComponentMounted.current = false;
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
            }
        };
    }, []);

    // Update elapsed time every second
    useEffect(() => {
        const interval = setInterval(() => {
            if (isComponentMounted.current) {
                setElapsedTime(Date.now() - startTime);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [startTime]);

    const formatElapsedTime = (): string => {
        const seconds = Math.floor(elapsedTime / 1000);
        return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    };

    // Start processing
    const startProcessing = async () => {
        try {
            setStatus('starting');
            setProgress(10);
            setCurrentStep('Starting document processing...');

            const response = await axios.post('/api/processing/start', {
                s3Uri: uploadedFile.s3Uri,
                bedrockModel: selectedModel,
                enableSplitting: true
            });

            if (response.data.success) {
                const newJobId = response.data.jobId;
                setJobId(newJobId);
                setProgress(20);
                setCurrentStep('Processing job started, monitoring progress...');

                // Start polling for status
                startPolling(newJobId);
            } else {
                throw new Error(response.data.message || 'Failed to start processing');
            }

        } catch (error: any) {
            setStatus('error');
            setProgress(0);
            const errorMsg = error.response?.data?.message || error.message || 'Failed to start processing';
            setError(errorMsg);
            setCurrentStep('Failed to start processing');
        }
    };

    // Poll for status updates
    const startPolling = (jobId: string) => {
        const pollInterval = 3000; // Poll every 3 seconds

        pollingRef.current = setInterval(async () => {
            try {
                const response = await axios.get(`/api/processing/status/${jobId}`);

                if (!isComponentMounted.current) return;

                if (response.data.success) {
                    const jobStatus = response.data;

                    setStatus(jobStatus.status);
                    setProgress(jobStatus.progress);
                    setCurrentStep(jobStatus.currentStep);

                    if (jobStatus.status === 'completed') {
                        // Stop polling and get results
                        if (pollingRef.current) {
                            clearInterval(pollingRef.current);
                            pollingRef.current = null;
                        }

                        await getResults(jobId);

                    } else if (jobStatus.status === 'error') {
                        // Stop polling on error
                        if (pollingRef.current) {
                            clearInterval(pollingRef.current);
                            pollingRef.current = null;
                        }

                        setError(jobStatus.error || 'Processing failed');
                        setCurrentStep('Processing failed');
                    }
                } else {
                    throw new Error('Failed to get job status');
                }

            } catch (error: any) {
                if (!isComponentMounted.current) return;

                console.error('Polling error:', error);

                // Stop polling on error
                if (pollingRef.current) {
                    clearInterval(pollingRef.current);
                    pollingRef.current = null;
                }

                setStatus('error');
                setError('Lost connection to processing service');
                setCurrentStep('Connection lost');
            }
        }, pollInterval);
    };

    // Get final results
    const getResults = async (jobId: string) => {
        try {
            setCurrentStep('Retrieving results...');
            setProgress(95);

            const response = await axios.get(`/api/processing/result/${jobId}`);

            if (response.data.success) {
                setProgress(100);
                setCurrentStep('Results retrieved successfully!');

                setTimeout(() => {
                    if (isComponentMounted.current) {
                        onComplete({
                            standardBedrock: response.data.standardBedrock,
                            customOutput: response.data.customOutput
                        });
                    }
                }, 1000);
            } else {
                throw new Error('Failed to retrieve results');
            }

        } catch (error: any) {
            setStatus('error');
            const errorMsg = error.response?.data?.message || error.message || 'Failed to retrieve results';
            setError(errorMsg);
            setCurrentStep('Failed to retrieve results');
        }
    };

    // Start processing when component mounts
    useEffect(() => {
        if (!uploadedFile) return;
        startProcessing();
    }, [uploadedFile, selectedModel]);

    const getStatusIcon = () => {
        switch (status) {
            case 'completed': return <StatusIndicator type="success">Completed</StatusIndicator>;
            case 'processing':
            case 'starting': return <StatusIndicator type="in-progress">Processing</StatusIndicator>;
            case 'error': return <StatusIndicator type="error">Failed</StatusIndicator>;
            default: return <StatusIndicator type="pending">Waiting</StatusIndicator>;
        }
    };

    if (!uploadedFile) {
        return (
            <Alert type="warning">
                No document provided for processing. Please upload a file first.
            </Alert>
        );
    }

    return (
        <Container
            header={
                <Header
                    variant="h3"
                    actions={getStatusIcon()}
                >
                    Processing: {uploadedFile.name || 'Document'}
                </Header>
            }
        >
            <SpaceBetween direction="vertical" size="l">

                <Box>
                    <ProgressBar
                        value={progress}
                        label={currentStep}
                        description={`Using ${selectedModel} model • Elapsed: ${formatElapsedTime()} ${jobId ? `• Job: ${jobId.substring(4, 16)}...` : ''}`}
                        status={status === 'error' ? 'error' : 'in-progress'}
                    />
                </Box>

                {status === 'starting' && (
                    <Alert type="info" header="Starting Processing">
                        Initializing document processing. Both standard and custom analysis methods will run simultaneously.
                    </Alert>
                )}

                {status === 'processing' && (
                    <Alert type="info" header="Processing in Progress">
                        Amazon Bedrock Data Automation is analyzing your document with both processing methods.
                        This typically takes 1-3 minutes depending on document complexity.
                        <Box margin={{ top: 's' }} variant="small">
                            Status updates are refreshed automatically every 3 seconds.
                        </Box>
                    </Alert>
                )}

                {status === 'completed' && (
                    <Alert type="success" header="Processing Complete">
                        Both processing methods have finished analyzing your document.
                        Retrieving results now...
                    </Alert>
                )}

                {status === 'error' && error && (
                    <Alert type="error" header="Processing Failed">
                        <Box>{error}</Box>
                        <Box margin={{ top: 's' }} variant="small">
                            Please try again with a different document or contact support if the issue persists.
                            {jobId && (
                                <Box margin={{ top: 'xs' }}>
                                    Job ID: {jobId}
                                </Box>
                            )}
                        </Box>
                    </Alert>
                )}

            </SpaceBetween>
        </Container>
    );
};

export default ComparisonProcessing;