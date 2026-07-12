import { describe, expect, test, vi } from "vitest";

// @ts-expect-error -- pipeline runtime intentionally uses native .mjs modules.
import * as translationModule from "../pipeline/lib/offering-translations.mjs";

const {
  classifyOfferingTranslationBatch,
  normalizeTranslation,
  normalizeVerifiedTranslation,
  OFFERING_TRANSLATION_RESPONSE_FORMAT,
} = translationModule;

describe("offering translations", () => {
  test("normalizes a confident Japanese translation for English display", () => {
    expect(normalizeTranslation({ source_text: "細胞保管料（1年）" }, {
      source_language: "ja",
      is_english: false,
      english_text: "Cell storage fee (1 year)",
      confidence: 0.99,
      rationale: "Japanese medical fee label.",
    }, "openai/gpt-4o-mini")).toEqual(expect.objectContaining({
      source_text: "細胞保管料（1年）",
      source_language: "ja",
      english_text: "Cell storage fee (1 year)",
      is_english: false,
      review_status: "auto_approved",
    }));
  });

  test("preserves already-English source wording exactly", () => {
    expect(normalizeTranslation({ source_text: "BrainTap Therapy" }, {
      source_language: "en",
      is_english: true,
      english_text: null,
      confidence: 0.98,
      rationale: "Already English.",
    }, "openai/gpt-4o-mini")).toEqual(expect.objectContaining({
      english_text: "BrainTap Therapy",
      is_english: true,
      review_status: "auto_approved",
    }));
  });

  test("verification rejects an unnecessary rewrite of English source text", () => {
    expect(normalizeVerifiedTranslation({ source_text: "NK Cell Therapy" }, {
      should_translate: false,
      source_language: "en",
      english_text: null,
      confidence: 0.99,
      rationale: "Already English.",
    }, "openai/gpt-4o-mini")).toEqual(expect.objectContaining({
      source_language: "en",
      english_text: "NK Cell Therapy",
      is_english: true,
    }));
  });

  test("uses bounded structured output and requires complete term coverage", async () => {
    const complete = vi.fn(async (request: { callType: string }) => ({
      content: request.callType === "offering_translation"
        ? JSON.stringify({ translations: [{
            term_key: 1,
            source_language: "ja",
            is_english: false,
            english_text: "NK cell therapy — 1 course (4 sessions)",
            confidence: 0.99,
            rationale: "Japanese treatment menu item.",
          }] })
        : JSON.stringify({ verifications: [{
            term_key: 1,
            should_translate: true,
            source_language: "ja",
            english_text: "NK cell therapy — 1 course (4 sessions)",
            confidence: 0.99,
            rationale: "Translation is accurate.",
          }] }),
      model: "openai/gpt-4o-mini",
    }));
    const result = await classifyOfferingTranslationBatch({
      terms: [{
        source_text: "NK細胞療法 1コース（4回）",
        country_codes: ["JP"],
        example_locations: ["The Hundred Longevity House"],
      }],
      runId: "17",
      llmClient: { complete },
    });

    expect(result.rows[0]).toMatchObject({
      english_text: "NK cell therapy — 1 course (4 sessions)",
      source_language: "ja",
    });
    expect(complete).toHaveBeenNthCalledWith(1, expect.objectContaining({
      callType: "offering_translation",
      responseFormat: OFFERING_TRANSLATION_RESPONSE_FORMAT,
    }));
    expect(complete).toHaveBeenNthCalledWith(2, expect.objectContaining({
      callType: "offering_translation_verification",
    }));
  });
});
