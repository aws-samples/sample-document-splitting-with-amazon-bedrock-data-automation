// frontend/src/types/index.ts - Updated with missing fields
export interface BedrockAnalysis {
    model: string;
    processingTime: number;
    keyIndicators?: string[];
}

export interface Document {
    id: string;
    type: string;
    confidence: number;
    text: string;
    pageCount: number;
    pageRange: string;
    filename?: string;
    segmentIndex?: number; // Added missing field
    structuredData?: Record<string, any>;
    bedrockAnalysis?: BedrockAnalysis;
    documentClass?: string; // Added missing field
}

export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
}

export interface CostBreakdown {
    service: string;
    description: string;
    cost: number;
}

export interface Costs {
    bdaCost: number;
    bedrockCost: number;
    totalCost: number;
    breakdown: CostBreakdown[];
}

export interface ProcessingResults {
    documents: Document[];
    metadata: Record<string, any>;
    totalPages: number;
    documentCount: number;
    fieldCount?: number;
    tokenUsage?: TokenUsage;
}

export interface JobResults {
    results: ProcessingResults;
    processingType: string;
    enableSplitting: boolean;
    bedrockModel?: string;
    invocationArn: string;
    processingTimeMs: number;
    costs: Costs;
}

export interface Job {
    id: string;
    status: string;
    method: string;
    results?: JobResults;
    error?: string;
    createdAt: string;
    updatedAt: string;
}

// Additional interfaces for comparison results
export interface ComparisonResults {
    standardBedrock: JobResults;
    customOutput: JobResults;
    jobId: string;
    invocationArn: string;
    processingTimeMs: number;
}