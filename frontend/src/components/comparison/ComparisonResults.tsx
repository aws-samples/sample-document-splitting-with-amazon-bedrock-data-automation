// frontend/src/components/comparison/ComparisonResults.tsx - 기존 호환성 유지하며 재디자인
import React from 'react';
import {
    Box,
    SpaceBetween,
    Table,
    Alert,
    ColumnLayout,
    Container,
    Header,
    TableProps,
    Tabs
} from '@cloudscape-design/components';
import { Document, Job } from '../../types';
import ResultsView from '../results/ResultsView';

interface ComparisonResultsProps {
    results: {
        standardBedrock: any;
        customOutput: any;
    } | null;
    uploadedFile?: any;
}

const ComparisonResults: React.FC<ComparisonResultsProps> = ({ results, uploadedFile }) => {
    console.log('ComparisonResults uploadedFile:', uploadedFile);
    // Handle loading state
    if (!results) {
        return (
            <Container header={<Header variant="h3">Processing Results</Header>}>
                <Alert type="info" header="Processing in Progress">
                    Your document is still being processed. Results will appear here once both methods complete their analysis.
                </Alert>
            </Container>
        );
    }

    // Handle no results
    if (!results.standardBedrock && !results.customOutput) {
        return (
            <Container header={<Header variant="h3">Processing Results</Header>}>
                <Alert type="warning" header="No Results Available">
                    Processing completed but no results were generated. Please try uploading a different document.
                </Alert>
            </Container>
        );
    }

    // Safe data extraction
    const standardDocs = results.standardBedrock?.documents || [];
    const customDocs = results.customOutput?.documents || [];
    const hasStandardResults = standardDocs.length > 0;
    const hasCustomResults = customDocs.length > 0;

    // Helper functions
    const safeNumber = (value: any): number => {
        const num = Number(value);
        return isNaN(num) || !isFinite(num) ? 0 : num;
    };

    const formatCurrency = (value: any): string => {
        const num = safeNumber(value);
        return num === 0 ? 'N/A' : `$${num.toFixed(4)}`;
    };

    const formatTime = (ms: any): string => {
        const num = safeNumber(ms);
        if (num <= 0) return 'N/A';
        return num < 1000 ? `${Math.round(num)}ms` : `${(num / 1000).toFixed(1)}s`;
    };

    // Quick comparison data
    const comparisonData = [
        {
            metric: "Documents Found",
            standard: hasStandardResults ? String(standardDocs.length) : 'No results',
            custom: hasCustomResults ? String(customDocs.length) : 'No results'
        },
        {
            metric: "Processing Status",
            standard: hasStandardResults ? 'Completed' : 'Failed',
            custom: hasCustomResults ? 'Completed' : 'Failed'
        },
        {
            metric: "Total Cost",
            standard: formatCurrency(results.standardBedrock?.costs?.totalCost),
            custom: formatCurrency(results.customOutput?.costs?.totalCost)
        }
    ];

    const comparisonColumns: TableProps.ColumnDefinition<any>[] = [
        {
            id: "metric",
            header: "Metric",
            cell: (item) => <strong>{item.metric}</strong>
        },
        {
            id: "standard",
            header: "Standard + AI",
            cell: (item) => item.standard
        },
        {
            id: "custom",
            header: "Custom Processing",
            cell: (item) => item.custom
        }
    ];

    return (
        <SpaceBetween direction="vertical" size="l">
            {/* 디버깅 정보 표시 */}
            {process.env.NODE_ENV === 'development' && (
                <Alert type="info" header="Debug Info">
                    <Box>uploadedFile: {uploadedFile ? 'Available' : 'Not available'}</Box>
                    <Box>s3Uri: {uploadedFile?.s3Uri || 'Not found'}</Box>
                </Alert>
            )}

            {/* Quick Comparison */}
            <Container header={<Header variant="h3">Processing Results Summary</Header>}>
                <Table
                    columnDefinitions={comparisonColumns}
                    items={comparisonData}
                    variant="borderless"
                />
            </Container>

            {/* Detailed Results */}
            <Container header={<Header variant="h3">Detailed Analysis Results</Header>}>
                <Tabs
                    tabs={[
                        {
                            label: `Standard + AI (${standardDocs.length})`,
                            id: "standard",
                            disabled: !hasStandardResults,
                            content: hasStandardResults ? (
                                <ResultsView
                                    job={{
                                        id: 'standard-bedrock',
                                        status: 'completed',
                                        method: 'standard-bedrock',
                                        results: {
                                            results: {
                                                documents: standardDocs,
                                                documentCount: standardDocs.length,
                                                totalPages: safeNumber(results.standardBedrock?.totalPages),
                                                tokenUsage: results.standardBedrock?.tokenUsage,
                                                metadata: results.standardBedrock?.metadata || {},
                                                fieldCount: results.standardBedrock?.fieldCount
                                            },
                                            processingType: 'standard-bedrock',
                                            enableSplitting: true,
                                            bedrockModel: results.standardBedrock?.bedrockModel,
                                            invocationArn: results.standardBedrock?.invocationArn || '',
                                            processingTimeMs: safeNumber(results.standardBedrock?.processingTimeMs),
                                            costs: results.standardBedrock?.costs || {
                                                totalCost: 0,
                                                bdaCost: 0,
                                                bedrockCost: 0,
                                                breakdown: []
                                            }
                                        },
                                        createdAt: new Date().toISOString(),
                                        updatedAt: new Date().toISOString()
                                    }}
                                    uploadedFile={uploadedFile}
                                />
                            ) : (
                                <Alert type="warning">
                                    Standard + AI processing did not produce any results.
                                </Alert>
                            )
                        },
                        {
                            label: `Custom Processing (${customDocs.length})`,
                            id: "custom",
                            disabled: !hasCustomResults,
                            content: hasCustomResults ? (
                                <ResultsView
                                    job={{
                                        id: 'custom-output',
                                        status: 'completed',
                                        method: 'custom-output',
                                        results: {
                                            results: {
                                                documents: customDocs,
                                                documentCount: customDocs.length,
                                                totalPages: safeNumber(results.customOutput?.totalPages),
                                                metadata: results.customOutput?.metadata || {},
                                                fieldCount: results.customOutput?.fieldCount
                                            },
                                            processingType: 'custom-output',
                                            enableSplitting: true,
                                            invocationArn: results.customOutput?.invocationArn || '',
                                            processingTimeMs: safeNumber(results.customOutput?.processingTimeMs),
                                            costs: results.customOutput?.costs || {
                                                totalCost: 0,
                                                bdaCost: 0,
                                                bedrockCost: 0,
                                                breakdown: []
                                            }
                                        },
                                        createdAt: new Date().toISOString(),
                                        updatedAt: new Date().toISOString()
                                    }}
                                    uploadedFile={uploadedFile}
                                />
                            ) : (
                                <Alert type="warning">
                                    Custom processing did not produce any results.
                                </Alert>
                            )
                        }
                    ]}
                />
            </Container>

            {/* Final Notes */}
            {(hasStandardResults || hasCustomResults) && (
                <Alert type="info" header="About These Results">
                    Results show document identification and data extraction from both processing methods.
                    Click between tabs to compare the results. Use "View Details" to see extracted data for each document.
                </Alert>
            )}

        </SpaceBetween>
    );
};

export default ComparisonResults;