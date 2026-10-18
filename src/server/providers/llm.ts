import {
  extractionResultSchema,
  type EvidenceClaim,
} from "../../shared/claim.js";

export interface ExtractionContext {
  documentName: string;
  page: number | null;
  paragraph: number;
}

export interface LlmProvider {
  extract(text: string, context: ExtractionContext): Promise<EvidenceClaim[]>;
}

export class MockLlmProvider implements LlmProvider {
  async extract(
    text: string,
    context: ExtractionContext,
  ): Promise<EvidenceClaim[]> {
    const result = [
      {
        side: "neutral",
        originalText: text,
        claim: `Mock extraction for human review: ${text.slice(0, 180)}`,
        entities: [],
        numbers: [],
        dates: [],
        allegedSource: null,
        documentName: context.documentName,
        page: context.page,
        paragraph: context.paragraph,
      },
    ];
    return extractionResultSchema.parse(result);
  }
}

export const llmProvider: LlmProvider = new MockLlmProvider();
