// frontend/src/components/comparison/ComparisonProcessing.tsx - 호환성 유지하며 재디자인
import React, { useState, useEffect } from 'react';
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
    const [startTime] = useState(Date.now());
    const [elapsedTime, setElapsedTime] = useState(0);

    // Update elapsed time every second
    useEffect(() => {
        const interval = setInterval(() => {
            setElapsedTime(Date.now() - startTime);
        }, 1000);

        return () => clearInterval(interval);
    }, [startTime]);

    const formatElapsedTime = (): string => {
        const seconds = Math.floor(elapsedTime / 1000);
        return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    };

    useEffect(() => {
        if (!uploadedFile) return;

        const processDocument = async () => {
            try {
                setStatus('starting');
                setProgress(10);
                setCurrentStep('Preparing document for processing...');

                await new Promise(resolve => setTimeout(resolve, 1000));

                setProgress(30);
                setCurrentStep('Calling document processing service...');
                setStatus('processing');

                const response = await axios.post('/api/processing/process', {
                    s3Uri: uploadedFile.s3Uri,
                    bedrockModel: selectedModel,
                    enableSplitting: true
                }, {
                    timeout: 600000
                });

                setProgress(90);
                setCurrentStep('Finalizing results...');

                if (response.data.success) {
                    setProgress(100);
                    setCurrentStep('Processing completed successfully!');
                    setStatus('completed');

                    setTimeout(() => {
                        onComplete({
                            standardBedrock: response.data.standardBedrock,
                            customOutput: response.data.customOutput
                        });
                    }, 1000);
                } else {
                    throw new Error(response.data.message || 'Processing failed');
                }

            } catch (error: any) {
                setStatus('error');
                setProgress(0);
                const errorMsg = error.response?.data?.message || error.message || 'Processing failed';
                setError(errorMsg);
                setCurrentStep('Processing failed');
            }
        };

        processDocument();
    }, [uploadedFile, selectedModel, onComplete]);

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
                        description={`Using ${selectedModel} model • Elapsed: ${formatElapsedTime()}`}
                        status={status === 'error' ? 'error' : 'in-progress'}
                    />
                </Box>

                {status === 'processing' && (
                    <Alert type="info" header="Processing in Progress">
                        Both standard and custom processing methods are analyzing your document simultaneously.
                        This typically takes 1-3 minutes depending on document complexity.
                    </Alert>
                )}

                {status === 'completed' && (
                    <Alert type="success" header="Processing Complete">
                        Both processing methods have finished analyzing your document.
                        You'll be redirected to the results in a moment.
                    </Alert>
                )}

                {status === 'error' && error && (
                    <Alert type="error" header="Processing Failed">
                        <Box>{error}</Box>
                        <Box margin={{ top: 's' }} variant="small">
                            Please try again with a different document or contact support if the issue persists.
                        </Box>
                    </Alert>
                )}

            </SpaceBetween>
        </Container>
    );
};

export default ComparisonProcessing;