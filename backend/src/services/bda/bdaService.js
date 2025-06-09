// backend/src/services/bda/bdaService.js - InvokeModel 통일 버전
const {
  BedrockDataAutomationClient,
  CreateBlueprintCommand,
  DeleteBlueprintCommand
} = require('@aws-sdk/client-bedrock-data-automation');

const {
  BedrockDataAutomationRuntimeClient,
  InvokeDataAutomationAsyncCommand,
  GetDataAutomationStatusCommand
} = require('@aws-sdk/client-bedrock-data-automation-runtime');

const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const config = require('../../config/config');
const logger = require('../../utils/logger');

class BDAService {
  constructor() {
    this.bdaClient = new BedrockDataAutomationClient({ region: config.aws.region });
    this.bdaRuntimeClient = new BedrockDataAutomationRuntimeClient({ region: config.aws.region });
    this.s3Client = new S3Client({ region: config.aws.region });
    this.bedrockClient = new BedrockRuntimeClient({ region: config.aws.region });
    this.bdaProfileArn = null;
  }

  async getBdaProfileArn() {
    if (!this.bdaProfileArn) {
      this.bdaProfileArn = await config.aws.getBdaProfileArn();
      logger.info(`Using BDA Profile ARN: ${this.bdaProfileArn}`);
    }
    return this.bdaProfileArn;
  }

  /**
   * Main entry point: Process document with parallel BDA calls
   */
  async processDocument(s3Uri, bedrockModel = 'nova-lite', enableSplitting = true) {
    const startTime = Date.now();

    try {
      logger.info(`Starting parallel BDA processing for ${s3Uri} with Bedrock model: ${bedrockModel}`);

      const bdaProfileArn = await this.getBdaProfileArn();
      const outputUri = `s3://${config.aws.s3Bucket}/output`;
      const timestamp = Date.now();

      // Start both BDA calls in parallel
      const [standardResult, customResult] = await Promise.all([
        this.processStandardWithGenerativeFields(s3Uri, `${outputUri}/standard-${timestamp}`, bdaProfileArn, bedrockModel, enableSplitting),
        this.processCustomOutput(s3Uri, `${outputUri}/custom-${timestamp}`, bdaProfileArn)
      ]);

      const finalResults = {
        jobId: `parallel-${timestamp}`,
        invocationArn: `${standardResult.invocationArn}+${customResult.invocationArn}`,
        processingTimeMs: Date.now() - startTime,
        standardBedrock: {
          ...standardResult,
          processingType: 'standard-xml-bedrock',
          bedrockModel,
          costs: this.calculateStandardGenerativeCosts(
            standardResult.totalPages,
            bedrockModel,
            standardResult.tokenUsage
          )
        },
        customOutput: {
          ...customResult,
          processingType: 'custom-output',
          costs: this.calculateCustomOutputCosts(customResult.totalPages, customResult.fieldCount)
        }
      };

      // Save results to S3
      await this.saveResultsToS3(outputUri, finalResults, finalResults.jobId);

      return finalResults;

    } catch (error) {
      logger.error(`BDA processing error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process with standard output + generative fields + XML structure for Bedrock
   */
  async processStandardWithGenerativeFields(s3Uri, outputUri, bdaProfileArn, bedrockModel, enableSplitting) {
    try {
      logger.info('Starting STANDARD OUTPUT with XML-structured pages + Bedrock classification');

      const standardParams = {
        inputConfiguration: { s3Uri },
        outputConfiguration: { s3Uri: outputUri },
        dataAutomationProfileArn: bdaProfileArn,
        dataAutomationConfiguration: {
          dataAutomationProjectArn: `arn:aws:bedrock:${config.aws.region}:aws:data-automation-project/public-default`,
          stage: 'LIVE'
        },
        overrideConfiguration: {
          document: {
            extraction: {
              granularity: {
                types: ["DOCUMENT", "PAGE", "ELEMENT"]
              },
              boundingBox: {
                state: "ENABLED"
              }
            },
            generativeField: {
              state: "ENABLED"
            },
            outputFormat: {
              textFormat: {
                types: ["MARKDOWN"]
              }
            },
            splitter: enableSplitting ? {
              state: "ENABLED"
            } : {
              state: "DISABLED"
            }
          }
        }
      };

      logger.info('Standard BDA with XML Structure Parameters:', JSON.stringify(standardParams, null, 2));

      const standardCommand = new InvokeDataAutomationAsyncCommand(standardParams);
      const standardResponse = await this.bdaRuntimeClient.send(standardCommand);

      logger.info(`Standard BDA invocation started: ${standardResponse.invocationArn}`);

      const standardResult = await this.waitForCompletion(standardResponse.invocationArn);

      if (standardResult.status === 'Success') {
        const standardJobMetadata = await this.findJobMetadata(outputUri, standardResponse.invocationArn);
        const standardResults = await this.processStandardWithXMLStructure(standardJobMetadata);

        const enhancedResults = await this.enhanceWithBedrockUsingXMLStructure(standardResults, bedrockModel);

        return {
          ...enhancedResults,
          invocationArn: standardResponse.invocationArn,
          metadata: standardJobMetadata
        };
      } else {
        throw new Error(`Standard BDA processing failed: ${standardResult.status}`);
      }

    } catch (error) {
      logger.error(`Standard + XML Structure processing error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process custom output (unchanged)
   */
  async processCustomOutput(s3Uri, outputUri, bdaProfileArn) {
    try {
      logger.info('Starting CUSTOM OUTPUT BDA call (with custom project)');

      const customParams = {
        inputConfiguration: { s3Uri },
        outputConfiguration: { s3Uri: outputUri },
        dataAutomationProfileArn: bdaProfileArn
      };

      if (config.aws.bdaProject) {
        customParams.dataAutomationConfiguration = {
          dataAutomationProjectArn: config.aws.bdaProject,
          stage: 'LIVE'
        };
      }

      logger.info('Custom BDA Parameters:', JSON.stringify(customParams, null, 2));

      const customCommand = new InvokeDataAutomationAsyncCommand(customParams);
      const customResponse = await this.bdaRuntimeClient.send(customCommand);

      logger.info(`Custom BDA invocation started: ${customResponse.invocationArn}`);

      const customResult = await this.waitForCompletion(customResponse.invocationArn);

      if (customResult.status === 'Success') {
        const customJobMetadata = await this.findJobMetadata(outputUri, customResponse.invocationArn);
        const customResults = await this.processCustomResults(customJobMetadata);

        return {
          ...customResults,
          invocationArn: customResponse.invocationArn,
          metadata: customJobMetadata
        };
      } else {
        throw new Error(`Custom BDA processing failed: ${customResult.status}`);
      }

    } catch (error) {
      logger.error(`Custom BDA processing error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process standard results with XML structure for page-level analysis
   */
  async processStandardWithXMLStructure(jobMetadata) {
    try {
      logger.info('Processing standard BDA results with XML-structured pages');

      const results = {
        documents: [],
        metadata: jobMetadata,
        totalPages: 0,
        documentCount: 0
      };

      const outputMetadata = jobMetadata.output_metadata?.[0];
      if (!outputMetadata?.segment_metadata) {
        logger.warn('No segment metadata found');
        return results;
      }

      const segments = outputMetadata.segment_metadata;
      logger.info(`Processing ${segments.length} segments for XML structure analysis`);

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        try {
          if (segment.standard_output_path) {
            const standardOutput = await this.getS3Content(segment.standard_output_path);

            const pageDocuments = this.createStructuredDocumentsFromPages(standardOutput, segment, i);
            results.documents.push(...pageDocuments);
            results.totalPages += pageDocuments.reduce((sum, doc) => sum + (doc.pageCount || 1), 0);
          }
        } catch (error) {
          logger.warn(`Failed to process segment ${i}: ${error.message}`);
        }
      }

      results.documentCount = results.documents.length;
      logger.info(`Created ${results.documentCount} XML-structured documents from ${results.totalPages} total pages`);
      return results;
    } catch (error) {
      logger.error(`Error processing XML-structured results: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create structured documents from pages with XML formatting for LLM
   */
  createStructuredDocumentsFromPages(standardOutput, segment, segmentIndex) {
    const documents = [];

    const documentSummary = standardOutput.document?.summary || null;
    const documentDescription = standardOutput.document?.description || null;
    const documentStats = standardOutput.document?.statistics || {};

    if (!standardOutput.pages || standardOutput.pages.length === 0) {
      logger.warn('No pages found in standard output');
      return [];
    }

    logger.info(`Processing ${standardOutput.pages.length} pages - Summary: ${!!documentSummary}, Description: ${!!documentDescription}`);

    const pageGroups = this.groupPagesByContent(standardOutput.pages);

    pageGroups.forEach((group, groupIndex) => {
      const document = {
        id: `segment-${segmentIndex}-doc-${groupIndex}`,
        type: 'unknown',
        confidence: 0,
        text: '', // Will store structured XML
        pageCount: group.pages.length,
        pageRange: this.formatPageRange(group.pages),
        segmentIndex,
        documentGroup: groupIndex,
        bdaSummary: documentSummary,
        bdaDescription: documentDescription,
        bdaGenerativeFields: {
          summary: documentSummary,
          description: documentDescription,
          statistics: documentStats,
          structuredForLLM: true,
          documentLevel: standardOutput.document || {}
        }
      };

      // Create structured XML for LLM analysis
      document.text = this.createStructuredXMLForLLM(
        group.pages,
        documentSummary,
        documentDescription,
        documentStats,
        group.groupReason
      );

      logger.info(`Document ${groupIndex}: Pages ${document.pageRange}, Reason: ${group.groupReason}, XML length: ${document.text.length}`);

      documents.push(document);
    });

    return documents;
  }

  /**
   * Group pages by content patterns to identify logical documents
   */
  groupPagesByContent(pages) {
    const groups = [];
    let currentGroup = { pages: [], groupReason: '' };

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const markdown = page.representation?.markdown || '';

      const pageAnalysis = this.analyzePage(page, markdown, i);
      const shouldStartNewGroup = this.shouldStartNewGroup(pageAnalysis, currentGroup, i);

      if (shouldStartNewGroup && currentGroup.pages.length > 0) {
        groups.push(currentGroup);
        currentGroup = { pages: [], groupReason: pageAnalysis.documentType };
      }

      currentGroup.pages.push({
        ...page,
        analysis: pageAnalysis
      });

      if (!currentGroup.groupReason && pageAnalysis.documentType !== 'continuation') {
        currentGroup.groupReason = pageAnalysis.documentType;
      }
    }

    if (currentGroup.pages.length > 0) {
      groups.push(currentGroup);
    }

    logger.info(`Grouped ${pages.length} pages into ${groups.length} logical documents`);
    return groups;
  }

  /**
   * Analyze individual page content to identify document type
   */
  analyzePage(page, markdown, pageIndex) {
    const pageNumber = page.page_index + 1;
    const wordCount = page.statistics?.word_count || 0;

    const indicators = {
      bankStatement: /bank.*statement|account.*statement|royal bank|balance|paid in|paid out|statement.*period/i.test(markdown),
      loanApplication: /uniform.*residential.*loan|loan.*application|borrower.*information|mortgage.*loan/i.test(markdown),
      appraisalReport: /uniform.*residential.*appraisal|appraisal.*report|property.*address.*city.*state|file.*#/i.test(markdown),
      transmittalSummary: /uniform.*underwriting.*transmittal|transmittal.*summary|form.*1008|underwriting.*information/i.test(markdown),
      creditReport: /credit.*report|credit.*score|fico.*score|experian|equifax|transunion/i.test(markdown),
      driversLicense: /driver.*license|drivers.*license|state.*id|license.*number/i.test(markdown),
      w2Form: /form.*w-?2|wage.*tax.*statement|employer.*identification/i.test(markdown),
      payStub: /pay.*stub|earnings.*statement|gross.*pay|net.*pay/i.test(markdown),
      instructions: /instructions|directions|how.*to.*complete|printing.*instructions/i.test(markdown)
    };

    let documentType = 'continuation';
    for (const [type, matches] of Object.entries(indicators)) {
      if (matches) {
        documentType = type;
        break;
      }
    }

    const isLikelyPageOne = markdown.includes('Page 1') ||
      page.detected_page_number === 1 ||
      (wordCount > 100 && pageIndex > 0);

    return {
      pageNumber,
      documentType,
      wordCount,
      isLikelyPageOne,
      hasSubstantiveContent: wordCount > 50,
      title: this.extractPageTitle(markdown)
    };
  }

  /**
   * Extract title from page markdown
   */
  extractPageTitle(markdown) {
    const lines = markdown.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('# ') && trimmed.length > 2) {
        return trimmed.substring(2).trim();
      }
    }
    return '';
  }

  /**
   * Determine if should start new document group
   */
  shouldStartNewGroup(pageAnalysis, currentGroup, pageIndex) {
    if (pageIndex === 0) return true;

    if (pageAnalysis.documentType !== 'continuation' &&
      pageAnalysis.documentType !== 'instructions' &&
      pageAnalysis.hasSubstantiveContent) {
      return true;
    }

    if (pageAnalysis.isLikelyPageOne &&
      currentGroup.pages.length > 0 &&
      pageAnalysis.hasSubstantiveContent) {
      return true;
    }

    return false;
  }

  /**
   * Create structured XML for LLM analysis
   */
  createStructuredXMLForLLM(pages, documentSummary, documentDescription, documentStats, groupReason) {
    const xmlParts = [
      '<document_analysis>',
      '<document_context>',
      `<summary>${documentSummary || 'No document summary available'}</summary>`,
      `<description>${documentDescription || 'No document description available'}</description>`,
      `<statistics>Tables: ${documentStats.table_count || 0}, Figures: ${documentStats.figure_count || 0}, Elements: ${documentStats.element_count || 0}</statistics>`,
      `<group_reason>${groupReason || 'Content-based grouping'}</group_reason>`,
      '</document_context>',
      '',
      '<pages>'
    ];

    pages.forEach(page => {
      const pageNum = page.page_index + 1;
      const title = page.analysis?.title || `Page ${pageNum}`;
      const docType = page.analysis?.documentType || 'unknown';
      const markdown = page.representation?.markdown || '';

      xmlParts.push(`<page number="${pageNum}" type="${docType}" title="${this.escapeXML(title)}">`);
      xmlParts.push(this.escapeXML(markdown));
      xmlParts.push('</page>');
      xmlParts.push('');
    });

    xmlParts.push('</pages>');
    xmlParts.push('</document_analysis>');

    return xmlParts.join('\n');
  }

  /**
   * Escape XML special characters
   */
  escapeXML(str) {
    return str.replace(/[<>&'"]/g, function (c) {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case "'": return '&apos;';
        case '"': return '&quot;';
        default: return c;
      }
    });
  }

  /**
   * Format page range for display
   */
  formatPageRange(pages) {
    if (pages.length === 1) {
      return `${pages[0].page_index + 1}`;
    }
    const start = pages[0].page_index + 1;
    const end = pages[pages.length - 1].page_index + 1;
    return `${start}-${end}`;
  }

  /**
   * Enhanced Bedrock processing for multi-document splitting
   */
  async enhanceWithBedrockUsingXMLStructure(standardResults, modelId) {
    try {
      logger.info(`Enhancing with Bedrock for multi-document splitting using model: ${modelId}`);

      const allDocuments = [];
      let totalTokenUsage = { inputTokens: 0, outputTokens: 0 };

      for (const doc of standardResults.documents) {
        // Send the large document to LLM for splitting
        const prompt = this.buildXMLStructureClassificationPrompt(doc.text, doc.pageRange);
        const modelResponse = await this.callBedrockModel(modelId, prompt);

        // Parse the multi-document response
        const splitDocuments = this.parseMultiDocumentResponse(modelResponse, doc, modelId);
        allDocuments.push(...splitDocuments);

        totalTokenUsage.inputTokens += modelResponse.usage.inputTokens;
        totalTokenUsage.outputTokens += modelResponse.usage.outputTokens;
      }

      return {
        ...standardResults,
        documents: allDocuments,
        tokenUsage: totalTokenUsage,
        totalPages: allDocuments.reduce((sum, doc) => sum + (doc.pageCount || 1), 0),
        documentCount: allDocuments.length
      };
    } catch (error) {
      logger.error(`Bedrock multi-document enhancement error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Parse multi-document response from Bedrock
   */
  parseMultiDocumentResponse(modelResponse, originalDoc, modelId) {
    try {
      const extractedData = modelResponse.extractedData;

      if (!extractedData.documents || !Array.isArray(extractedData.documents)) {
        logger.warn('No documents array found in Bedrock response, falling back to single document');
        return [{
          ...originalDoc,
          type: modelResponse.classification || 'other (default fallback)',
          confidence: modelResponse.confidence || 0.5,
          bedrockAnalysis: {
            model: modelId,
            keyIndicators: modelResponse.keyIndicators || [],
            splitDetected: false,
            error: 'No documents array in response'
          }
        }];
      }

      const documents = extractedData.documents;
      logger.info(`Bedrock found ${documents.length} documents in ${originalDoc.pageRange}`);

      const splitDocuments = documents.map((docData, index) => {
        const pageStart = docData.page_start || 1;
        const pageEnd = docData.page_end || pageStart;
        const pageCount = pageEnd - pageStart + 1;
        const pageRange = pageStart === pageEnd ? `${pageStart}` : `${pageStart}-${pageEnd}`;

        // Extract text for this specific page range from original XML
        const documentText = this.extractTextFromPageRange(originalDoc.text, pageStart, pageEnd);

        return {
          id: `${originalDoc.id}-split-${index + 1}`,
          type: docData.type || 'other',
          confidence: docData.confidence || 0.5,
          text: documentText,
          pageCount: pageCount,
          pageRange: pageRange,
          segmentIndex: originalDoc.segmentIndex,
          documentGroup: index,
          structuredData: {
            primary_identifier: docData.primary_identifier || '',
            page_range: docData.page_range || pageRange,
            key_indicators: docData.key_indicators || []
          },
          bedrockAnalysis: {
            model: modelId,
            keyIndicators: docData.key_indicators || [],
            splitDetected: true,
            originalDocument: originalDoc.id,
            pageStart: pageStart,
            pageEnd: pageEnd,
            primaryIdentifier: docData.primary_identifier
          }
        };
      });

      // Log the split results
      splitDocuments.forEach((doc, idx) => {
        logger.info(`Split document ${idx + 1}: ${doc.type} - Pages ${doc.pageRange} (confidence: ${(doc.confidence * 100).toFixed(1)}%)`);
      });

      return splitDocuments;

    } catch (error) {
      logger.error(`Error parsing multi-document response: ${error.message}`);
      // Return original document as fallback
      return [{
        ...originalDoc,
        type: 'other',
        confidence: 0.3,
        bedrockAnalysis: {
          model: modelId,
          error: 'Failed to parse multi-document response',
          splitDetected: false
        }
      }];
    }
  }

  /**
   * Extract specific page range text from XML content
   */
  extractTextFromPageRange(xmlContent, pageStart, pageEnd) {
    try {
      // Extract pages within the specified range from XML
      const pageRegex = /<page number="(\d+)"[^>]*>([\s\S]*?)<\/page>/g;
      const extractedPages = [];
      let match;

      while ((match = pageRegex.exec(xmlContent)) !== null) {
        const pageNum = parseInt(match[1]);
        if (pageNum >= pageStart && pageNum <= pageEnd) {
          extractedPages.push({
            pageNumber: pageNum,
            content: match[2].trim()
          });
        }
      }

      // Sort by page number and combine
      extractedPages.sort((a, b) => a.pageNumber - b.pageNumber);

      if (extractedPages.length === 0) {
        logger.warn(`No pages found in range ${pageStart}-${pageEnd}`);
        return `No content found for pages ${pageStart}-${pageEnd}`;
      }

      // Create focused XML for just these pages
      const focusedXml = [
        `<document_segment pages="${pageStart}-${pageEnd}">`,
        ...extractedPages.map(page =>
          `<page number="${page.pageNumber}">\n${page.content}\n</page>`
        ),
        '</document_segment>'
      ].join('\n');

      return focusedXml;

    } catch (error) {
      logger.error(`Error extracting page range ${pageStart}-${pageEnd}: ${error.message}`);
      return `Error extracting pages ${pageStart}-${pageEnd}`;
    }
  }

  /**
   * Call Bedrock model using InvokeModel API only
   */
  async callBedrockModel(modelId, prompt) {
    const startTime = Date.now();

    try {
      logger.info(`Calling ${modelId} with InvokeModel API`);

      let modelArn, requestBody;

      switch (modelId) {
        case 'nova-pro':
          modelArn = 'us.amazon.nova-pro-v1:0';
          requestBody = {
            messages: [{
              role: "user",
              content: [{
                text: prompt
              }]
            }],
            inferenceConfig: { maxTokens: 1500, temperature: 0.1 }
          };
          break;

        case 'nova-lite':
          modelArn = 'us.amazon.nova-lite-v1:0';
          requestBody = {
            messages: [{
              role: "user",
              content: [{
                text: prompt
              }]
            }],
            inferenceConfig: { maxTokens: 1500, temperature: 0.1 }
          };
          break;

        case 'nova-micro':
          modelArn = 'us.amazon.nova-micro-v1:0';
          requestBody = {
            messages: [{
              role: "user",
              content: [{
                text: prompt
              }]
            }],
            inferenceConfig: { maxTokens: 1500, temperature: 0.1 }
          };
          break;

        case 'claude-3-7-sonnet':
          modelArn = 'us.anthropic.claude-3-7-sonnet-20250219-v1:0';
          requestBody = {
            anthropic_version: "bedrock-2023-05-31",
            max_tokens: 1500,
            temperature: 0.1,
            messages: [{
              role: "user",
              content: prompt
            }]
          };
          break;

        default:
          throw new Error(`Unsupported model: ${modelId}`);
      }

      const command = new InvokeModelCommand({
        modelId: modelArn,
        body: JSON.stringify(requestBody)
      });

      const response = await this.bedrockClient.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));

      logger.info(`=== ${modelId} Response Debug ===`);
      logger.info(`ResponseBody type: ${typeof responseBody}`);
      logger.info(`ResponseBody keys: ${Object.keys(responseBody)}`);

      let content, usage;
      if (modelId === 'claude-3-7-sonnet') {
        content = responseBody.content[0].text;

        // Claude usage 처리
        if (responseBody.usage) {
          logger.info(`Claude usage keys: ${Object.keys(responseBody.usage)}`);
          logger.info(`Claude input_tokens: ${responseBody.usage.input_tokens}`);
          logger.info(`Claude output_tokens: ${responseBody.usage.output_tokens}`);
        }

        usage = {
          inputTokens: responseBody.usage.input_tokens || 0,
          outputTokens: responseBody.usage.output_tokens || 0,
          cacheCreationInputTokens: responseBody.usage.cache_creation_input_tokens || 0,
          cacheReadInputTokens: responseBody.usage.cache_read_input_tokens || 0
        };
      } else {
        content = responseBody.output?.message?.content?.[0]?.text || responseBody.output?.text || '';

        // Nova usage 처리
        logger.info(`Nova usage exists: ${!!responseBody.usage}`);
        if (responseBody.usage) {
          logger.info(`Nova usage keys: ${Object.keys(responseBody.usage)}`);
          logger.info(`Nova inputTokens: ${responseBody.usage.inputTokens}`);
          logger.info(`Nova outputTokens: ${responseBody.usage.outputTokens}`);
        }

        usage = {
          inputTokens: responseBody.usage?.inputTokens || 0,
          outputTokens: responseBody.usage?.outputTokens || 0
        };
      }

      // Parse the JSON response
      const classification = this.extractJsonFromResponse(content);

      return {
        classification: classification.documents?.[0]?.type || 'unknown',
        confidence: classification.analysis_confidence || 0,
        extractedData: classification,
        keyIndicators: classification.documents?.[0]?.key_indicators || [],
        processingTime: Date.now() - startTime,
        usage: {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens
        },
        structuredOutput: false,
        invokeModelUsed: true
      };

    } catch (error) {
      logger.error(`InvokeModel error for ${modelId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Enhanced JSON parsing for multi-document responses with robust error handling
   */
  extractJsonFromResponse(content) {
    let cleanedContent = content.trim();

    // Multiple cleaning strategies
    const cleaningPatterns = [
      /^```json\s*/gm,
      /^```\s*/gm,
      /\s*```$/gm,
      /^`+/gm,
      /`+$/gm,
      /^Here's the analysis:/gm,
      /^Based on the analysis:/gm,
      /^The documents are:/gm
    ];

    cleaningPatterns.forEach(pattern => {
      cleanedContent = cleanedContent.replace(pattern, '');
    });

    // Try multiple JSON extraction strategies
    const extractionStrategies = [
      // Strategy 1: Find complete JSON object/array
      () => {
        const jsonMatch = cleanedContent.match(/\{[\s\S]*\}/);
        return jsonMatch ? jsonMatch[0] : null;
      },

      // Strategy 2: Find JSON array specifically
      () => {
        const arrayMatch = cleanedContent.match(/\[[\s\S]*\]/);
        return arrayMatch ? arrayMatch[0] : null;
      },

      // Strategy 3: Extract between specific markers
      () => {
        const markers = [
          /```json\s*([\s\S]*?)\s*```/,
          /```\s*([\s\S]*?)\s*```/,
          /"documents"\s*:\s*\[([\s\S]*?)\]/
        ];
        for (const marker of markers) {
          const match = cleanedContent.match(marker);
          if (match) {
            return match[1] ? `{"documents":[${match[1]}]}` : match[0];
          }
        }
        return null;
      },

      // Strategy 4: Try to repair common JSON issues
      () => {
        let repaired = cleanedContent
          .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
          .replace(/([{,]\s*)(\w+):/g, '$1"$2":') // Quote unquoted keys
          .replace(/:\s*'([^']*)'/g, ': "$1"') // Convert single quotes to double
          .replace(/\\n/g, '\\\\n') // Escape newlines properly
          .replace(/\n/g, ' ') // Replace actual newlines with spaces
          .replace(/\s+/g, ' '); // Normalize whitespace

        return repaired;
      }
    ];

    let parsed = null;
    let lastError = null;

    // Try each extraction strategy
    for (let i = 0; i < extractionStrategies.length; i++) {
      try {
        const extracted = extractionStrategies[i]();
        if (!extracted) continue;

        logger.info(`Trying extraction strategy ${i + 1}`);
        parsed = JSON.parse(extracted);
        logger.info(`Successfully parsed JSON with strategy ${i + 1}`);
        break;

      } catch (error) {
        lastError = error;
        logger.warn(`Strategy ${i + 1} failed: ${error.message}`);
        continue;
      }
    }

    // If all strategies failed, try manual parsing
    if (!parsed) {
      logger.warn('All JSON strategies failed, attempting manual parsing');
      parsed = this.attemptManualParsing(cleanedContent);
    }

    if (!parsed) {
      logger.error(`All parsing strategies failed. Last error: ${lastError?.message}`);
      logger.error(`Original content (first 1000 chars): ${content.substring(0, 1000)}`);
      throw new Error(`Failed to parse JSON: ${lastError?.message}`);
    }

    // Validate and normalize the parsed result
    return this.validateAndNormalizeResponse(parsed);
  }

  /**
   * Attempt manual parsing for malformed JSON
   */
  attemptManualParsing(content) {
    try {
      // Look for document type patterns manually
      const documentPatterns = [
        /"type"\s*:\s*"([^"]+)"/g,
        /"page_start"\s*:\s*(\d+)/g,
        /"page_end"\s*:\s*(\d+)/g,
        /"confidence"\s*:\s*([\d.]+)/g
      ];

      const documents = [];
      const lines = content.split('\n');
      let currentDoc = {};

      for (const line of lines) {
        const trimmed = line.trim();

        // Try to extract key-value pairs
        const typeMatch = trimmed.match(/"type"\s*:\s*"([^"]+)"/);
        if (typeMatch) {
          if (Object.keys(currentDoc).length > 0) {
            documents.push(currentDoc);
          }
          currentDoc = { type: typeMatch[1] };
          continue;
        }

        const pageStartMatch = trimmed.match(/"page_start"\s*:\s*(\d+)/);
        if (pageStartMatch) {
          currentDoc.page_start = parseInt(pageStartMatch[1]);
          continue;
        }

        const pageEndMatch = trimmed.match(/"page_end"\s*:\s*(\d+)/);
        if (pageEndMatch) {
          currentDoc.page_end = parseInt(pageEndMatch[1]);
          continue;
        }

        const confidenceMatch = trimmed.match(/"confidence"\s*:\s*([\d.]+)/);
        if (confidenceMatch) {
          currentDoc.confidence = parseFloat(confidenceMatch[1]);
          continue;
        }
      }

      if (Object.keys(currentDoc).length > 0) {
        documents.push(currentDoc);
      }

      if (documents.length > 0) {
        logger.info(`Manual parsing extracted ${documents.length} documents`);
        return {
          documents: documents,
          total_documents_found: documents.length,
          analysis_confidence: 0.7, // Lower confidence for manual parsing
          parsing_method: 'manual'
        };
      }

      return null;

    } catch (error) {
      logger.error(`Manual parsing failed: ${error.message}`);
      return null;
    }
  }

  /**
   * Validate and normalize the parsed response
   */
  validateAndNormalizeResponse(parsed) {
    // Type mapping for common variations
    const typeMapping = {
      'bankStatement': 'bank_statement',
      'loanApplication': 'loan_application',
      'driversLicense': 'us_driver_license',
      'homebuyerCert': 'homebuyer_cert',
      'form1008': 'form_1008',
      'form1004': 'form_1004',
      'uniform_residential_loan_application': 'loan_application',
      'uniform_underwriting_transmittal_summary': 'form_1008',
      'uniform_residential_appraisal_report': 'form_1004'
    };

    // Handle different response structures
    if (parsed.documents && Array.isArray(parsed.documents)) {
      // Multi-document response - validate each document
      const validatedDocuments = parsed.documents.map((doc, index) => {
        // Map type names
        let docType = doc.type || 'unknown';
        if (typeMapping[docType]) {
          docType = typeMapping[docType];
        }

        // Generate default confidence if not provided
        const confidence = doc.confidence !== undefined ?
          Math.min(Math.max(doc.confidence, 0), 1) :
          0.8; // Default confidence instead of hardcoded

        return {
          type: docType,
          confidence: confidence,
          page_start: doc.page_start || (index + 1),
          page_end: doc.page_end || doc.page_start || (index + 1),
          page_range: doc.page_range || `${doc.page_start || (index + 1)}`,
          key_indicators: Array.isArray(doc.key_indicators) ? doc.key_indicators :
            [`${docType} document`], // Generate basic indicators if missing
          primary_identifier: doc.primary_identifier ||
            `${docType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())} Document`
        };
      });

      logger.info(`Validated multi-document response with ${validatedDocuments.length} documents`);
      return {
        documents: validatedDocuments,
        total_documents_found: validatedDocuments.length,
        analysis_confidence: parsed.analysis_confidence || 0.8
      };

    } else {
      // Fallback: try to extract any useful information
      logger.warn('Unknown response structure, attempting fallback parsing');

      return {
        documents: [{
          type: 'unknown',
          confidence: 0.3,
          page_start: 1,
          page_end: 1,
          page_range: '1',
          key_indicators: [],
          primary_identifier: 'Fallback Document'
        }],
        total_documents_found: 1,
        analysis_confidence: 0.3,
        parsing_notes: 'Fallback parsing used due to unrecognized response structure'
      };
    }
  }

  /**
   * Build enhanced prompt for document classification
   */
  buildXMLStructureClassificationPrompt(xmlContent, pageRange) {
    return `You are a document analysis expert. Analyze this XML content containing multiple pages and identify ALL separate documents within it.

CRITICAL REQUIREMENTS:
- Pages must NOT overlap between documents (each page belongs to exactly ONE document)
- Page ranges must be continuous and sequential within each document
- Every page in the XML must be assigned to a document (complete coverage)
- If uncertain about document boundaries, keep related pages together rather than splitting

DOCUMENT TYPE IDENTIFICATION GUIDE:

form_1008: Uniform Underwriting and Transmittal Summary
- Headers: "Uniform Underwriting and Transmittal Summary"
- Form numbers: "Form 1077", "Form 1008", "Freddie Mac Form 1077", "Fannie Mae Form 1008"
- Sections: Roman numerals I, II, III, IV (Borrower Info, Mortgage Info, Underwriting Info, Seller Info)
- Typical pages: 2-3 pages

bank_statement: Bank account statements  
- Headers: Bank names (RBS, Chase, Wells Fargo, etc.), "Statement", "Account Statement"
- Content: Transaction tables, account numbers, balances, dates, "Paid In", "Paid Out"
- Identifiers: IBAN, Sort Code, account holder names, statement periods
- Typical pages: 1-3 pages per statement

form_1004: Uniform Residential Appraisal Report (URAR)
- Headers: "Uniform Residential Appraisal Report"
- Form numbers: "Form 70", "Form 1004", "Freddie Mac Form 70", "Fannie Mae Form 1004"
- Content: Property appraisal, comparable sales, appraiser certification
- Typical pages: 6-7 pages

loan_application: Uniform Residential Loan Application
- Headers: "Uniform Residential Loan Application" 
- Form numbers: "Form 65", "Form 1003", "Freddie Mac Form 65", "Fannie Mae Form 1003"
- Content: 9 sections covering borrower info, financial details, demographics, military service
- Typical pages: 9 pages

us_driver_license: US Driver's License
- Headers: State names + "Driver License" or "Driver's License"
- Content: License numbers, photos, personal information, vehicle classifications
- Typical pages: 1-2 pages (front/back)

homebuyer_cert: Homebuyer Education Certificate
- Headers: "Certificate of Achievement", "Homebuyer Education Program"
- Content: MGIC or similar organization, completion certificates, education topics
- Typical pages: 1 page

other: Any document not matching above categories

ANALYSIS PROCESS:
1. Scan each page sequentially from 1 to total pages
2. Identify document start points by finding new headers/form numbers
3. Determine document end points before next document begins
4. Assign confidence based on clarity of identifying markers
5. Ensure all pages are covered with no gaps or overlaps

CONFIDENCE SCORING:
- 0.9-1.0: Clear form numbers/headers, definitive identification
- 0.7-0.8: Strong indicators present, minor ambiguity
- 0.5-0.6: Some identifying features, moderate uncertainty  
- 0.3-0.4: Weak indicators, significant uncertainty
- 0.0-0.2: Very unclear, mostly guessing

XML CONTENT TO ANALYZE:
${xmlContent}

IMPORTANT: Respond with this EXACT JSON structure:
{
  "documents": [
    {
      "type": "form_1008",
      "confidence": 0.95,
      "page_start": 1,
      "page_end": 3,
      "page_range": "1-3",
      "key_indicators": ["Uniform Underwriting and Transmittal Summary", "Form 1008", "Section I", "Borrower Information"],
      "primary_identifier": "Uniform Underwriting and Transmittal Summary"
    },
    {
      "type": "bank_statement", 
      "confidence": 0.92,
      "page_start": 4,
      "page_end": 4,
      "page_range": "4",
      "key_indicators": ["RBS Statement", "Account Number", "Transaction History"],
      "primary_identifier": "RBS Bank Statement"
    }
  ],
  "total_documents_found": 2,
  "analysis_confidence": 0.93,
  "validation": {
    "all_pages_covered": true,
    "no_overlaps": true,
    "sequential_ranges": true
  }
}

VALIDATION REQUIREMENTS:
- ✓ Every page number from 1 to [total] is assigned to exactly one document
- ✓ Page ranges are continuous (no gaps like 1-3, 5-7)
- ✓ No page appears in multiple documents  
- ✓ Document types match actual content found
- ✓ Confidence scores reflect certainty of identification

Use only these document types: form_1008, bank_statement, form_1004, loan_application, us_driver_license, homebuyer_cert, other`;
  }

  /**
   * Process custom results
   */
  async processCustomResults(jobMetadata) {
    try {
      logger.info('Processing custom BDA results');

      const results = {
        documents: [],
        metadata: jobMetadata,
        totalPages: 0,
        documentCount: 0,
        fieldCount: 0
      };

      const outputMetadata = jobMetadata.output_metadata?.[0];
      if (!outputMetadata?.segment_metadata) {
        logger.warn('No segment metadata found');
        return results;
      }

      const segments = outputMetadata.segment_metadata;
      logger.info(`Processing ${segments.length} segments for custom output`);

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        try {
          logger.info(`Segment ${i}: custom_output_status=${segment.custom_output_status}, has_path=${!!segment.custom_output_path}`);

          if (segment.custom_output_path && segment.custom_output_status === 'MATCH') {
            const customOutput = await this.getS3Content(segment.custom_output_path);

            // 디버깅: customOutput 구조 로그
            logger.info(`CustomOutput ${i} structure: matched_blueprint=${!!customOutput.matched_blueprint}, split_document=${!!customOutput.split_document}, document_class=${!!customOutput.document_class}`);
            if (customOutput.split_document?.page_indices) {
              logger.info(`CustomOutput ${i} page_indices: [${customOutput.split_document.page_indices.join(', ')}]`);
            }

            const document = this.processCustomDocument(customOutput, segment, i);
            if (document) {
              results.documents.push(document);
              results.totalPages += document.pageCount || 1;
              results.fieldCount = Math.max(results.fieldCount,
                Object.keys(document.structuredData || {}).length);
            }
          } else {
            logger.info(`Segment ${i}: Skipped - status=${segment.custom_output_status}`);
          }
        } catch (error) {
          logger.warn(`Failed to process custom segment ${i}: ${error.message}`);
        }
      }

      results.documentCount = results.documents.length;
      logger.info(`Processed ${results.documentCount} custom documents with ${results.totalPages} total pages`);

      // 페이지 분포 로그
      results.documents.forEach((doc, idx) => {
        logger.info(`Custom doc ${idx}: ${doc.type} - Pages ${doc.pageRange} (${doc.pageCount} pages)`);
      });

      return results;
    } catch (error) {
      logger.error(`Error processing custom results: ${error.message}`);
      throw error;
    }
  }

  processCustomDocument(customOutput, segment, segmentIndex) {
    const document = {
      id: `segment-${segmentIndex}`,
      type: 'unknown',
      confidence: 0.9,
      text: '',
      structuredData: {},
      pageCount: 1,
      pageRange: '1',
      segmentIndex
    };

    // Extract structured data
    if (customOutput.inference_result) {
      document.structuredData = customOutput.inference_result;
    }

    // Extract document type from matched blueprint
    if (customOutput.matched_blueprint) {
      const blueprint = customOutput.matched_blueprint;
      document.type = blueprint.name || blueprint.blueprint_name || blueprint.blueprintName || 'unknown';
      document.confidence = blueprint.confidence || 0.9;
    }

    // Also use document_class if available for additional context
    if (customOutput.document_class?.type) {
      document.documentClass = customOutput.document_class.type;
    }

    // Extract text
    if (customOutput.document?.representation) {
      document.text = customOutput.document.representation.text ||
        customOutput.document.representation.markdown ||
        customOutput.document.representation.html || '';
    }

    // FIX: split_document는 customOutput 안에 있음
    if (customOutput.split_document?.page_indices) {
      const pageIndices = customOutput.split_document.page_indices;
      document.pageCount = pageIndices.length;
      document.pageRange = pageIndices.length === 1 ?
        `${pageIndices[0] + 1}` :
        `${pageIndices[0] + 1}-${pageIndices[pageIndices.length - 1] + 1}`;

      // 추가 정보 저장
      document.actualPageIndices = pageIndices;
    } else {
      // Fallback: segment에서 페이지 정보 찾기
      if (segment.split_document?.page_indices) {
        const pageIndices = segment.split_document.page_indices;
        document.pageCount = pageIndices.length;
        document.pageRange = pageIndices.length === 1 ?
          `${pageIndices[0] + 1}` :
          `${pageIndices[0] + 1}-${pageIndices[pageIndices.length - 1] + 1}`;
        document.actualPageIndices = pageIndices;
      }
    }

    logger.info(`Custom document ${segmentIndex}: Type=${document.type} (${document.documentClass || 'no class'}), Pages=${document.pageRange} (${document.pageCount} pages), Confidence=${(document.confidence * 100).toFixed(1)}%`);

    return document;
  }

  // Utility methods
  async findJobMetadata(outputUri, invocationArn) {
    try {
      const { bucket, key } = this.parseS3Uri(outputUri);

      const listCommand = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: key.endsWith('/') ? key : key + '/',
        Delimiter: '/'
      });

      const listResponse = await this.s3Client.send(listCommand);
      logger.info(`Found ${listResponse.CommonPrefixes?.length || 0} subdirectories in output location`);

      if (listResponse.CommonPrefixes) {
        for (const prefix of listResponse.CommonPrefixes) {
          try {
            const metadataUri = `s3://${bucket}/${prefix.Prefix}job_metadata.json`;
            logger.info(`Trying metadata at: ${metadataUri}`);
            const metadata = await this.getS3Content(metadataUri);
            logger.info(`Found job metadata with ${metadata.output_metadata?.[0]?.segment_metadata?.length || 0} segments`);
            return metadata;
          } catch (error) {
            logger.info(`No metadata found at ${prefix.Prefix}job_metadata.json`);
          }
        }
      }

      throw new Error('Could not find job_metadata.json in BDA output');
    } catch (error) {
      logger.error(`Error finding job metadata: ${error.message}`);
      throw error;
    }
  }

  async getS3Content(s3Uri) {
    try {
      const { bucket, key } = this.parseS3Uri(s3Uri);
      const command = new GetObjectCommand({ Bucket: bucket, Key: key });
      const response = await this.s3Client.send(command);
      const content = await response.Body.transformToString();
      return JSON.parse(content);
    } catch (error) {
      logger.error(`Error getting S3 content from ${s3Uri}: ${error.message}`);
      throw error;
    }
  }

  async waitForCompletion(invocationArn, maxTries = 60, delayMs = 10000) {
    logger.info(`Waiting for BDA completion: ${invocationArn}`);

    for (let i = 0; i < maxTries; i++) {
      try {
        const command = new GetDataAutomationStatusCommand({ invocationArn });
        const response = await this.bdaRuntimeClient.send(command);

        logger.info(`Job status (${i + 1}/${maxTries}): ${response.status}`);

        if (response.status === 'Success') {
          return response;
        } else if (response.status === 'ClientError' || response.status === 'ServiceError') {
          throw new Error(`Job failed: ${response.status} - ${response.errorMessage || 'Unknown error'}`);
        }

        if (i < maxTries - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } catch (error) {
        if (error.message.includes('Job failed')) throw error;
        logger.warn(`Status check failed (attempt ${i + 1}): ${error.message}`);
        if (i < maxTries - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    throw new Error(`Job timed out after ${maxTries * delayMs / 1000} seconds`);
  }

  calculateStandardGenerativeCosts(pageCount, modelId, tokenUsage) {
    const costs = {
      bdaCost: (pageCount || 0) * 0.01,
      bedrockCost: 0,
      totalCost: 0,
      breakdown: []
    };

    costs.breakdown.push({
      service: 'BDA Standard + XML Structure',
      description: `${pageCount || 0} pages with XML page analysis`,
      cost: costs.bdaCost
    });

    if (tokenUsage) {
      const modelCosts = {
        'nova-lite': { input: 0.00006, output: 0.00024 },
        'nova-micro': { input: 0.000035, output: 0.00014 },
        'nova-pro': { input: 0.0008, output: 0.0032 },
        'claude-3-7-sonnet': { input: 0.003, output: 0.015 }
      };

      if (modelCosts[modelId]) {
        const cost = modelCosts[modelId];
        costs.bedrockCost = (tokenUsage.inputTokens * cost.input / 1000) +
          (tokenUsage.outputTokens * cost.output / 1000);
        costs.breakdown.push({
          service: `Bedrock ${modelId} (using XML structure)`,
          description: `${tokenUsage.inputTokens} input + ${tokenUsage.outputTokens} output tokens`,
          cost: costs.bedrockCost
        });
      }
    }

    costs.totalCost = costs.bdaCost + costs.bedrockCost;
    return costs;
  }

  calculateCustomOutputCosts(pageCount, fieldCount = 20) {
    const costs = {
      bdaCost: (pageCount || 0) * 0.04,
      bedrockCost: 0,
      totalCost: 0,
      breakdown: []
    };

    costs.breakdown.push({
      service: 'BDA Custom Output',
      description: `${pageCount || 0} pages processed`,
      cost: costs.bdaCost
    });

    if (fieldCount > 30) {
      const extraFieldCost = 0.0005 * (fieldCount - 30) * (pageCount || 0);
      costs.bdaCost += extraFieldCost;
      costs.breakdown.push({
        service: 'Additional Fields',
        description: `${fieldCount - 30} extra fields × ${pageCount || 0} pages`,
        cost: extraFieldCost
      });
    }

    costs.totalCost = costs.bdaCost;
    return costs;
  }

  async saveResultsToS3(outputUri, results, jobId) {
    try {
      const { bucket, key } = this.parseS3Uri(outputUri);
      const resultsKey = `${key}/${jobId}/comparison-results.json`;

      const resultsData = {
        timestamp: new Date().toISOString(),
        jobId,
        results,
        summary: {
          standardXMLBedrock: {
            documents: results.standardBedrock.documentCount,
            pages: results.standardBedrock.totalPages,
            cost: results.standardBedrock.costs.totalCost
          },
          customOutput: {
            documents: results.customOutput.documentCount,
            pages: results.customOutput.totalPages,
            cost: results.customOutput.costs.totalCost
          }
        }
      };

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: resultsKey,
        Body: JSON.stringify(resultsData, null, 2),
        ContentType: 'application/json'
      });

      await this.s3Client.send(command);
      logger.info(`Comparison results saved to S3: s3://${bucket}/${resultsKey}`);
    } catch (error) {
      logger.error(`Failed to save results to S3: ${error.message}`);
    }
  }

  parseS3Uri(s3Uri) {
    const path = s3Uri.replace('s3://', '');
    const firstSlashIndex = path.indexOf('/');
    return {
      bucket: path.substring(0, firstSlashIndex),
      key: path.substring(firstSlashIndex + 1)
    };
  }
}

module.exports = BDAService;