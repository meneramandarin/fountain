import { readFileSync } from "node:fs";

import sharp from "sharp";
import { describe, expect, test, vi } from "vitest";

// @ts-expect-error -- pipeline runtime intentionally uses native .mjs modules.
import * as imageClassifyModule from "../pipeline/tasks/image_classify.mjs";

const {
  classifyImageMetadata,
  classifyImageWithLlm,
  handleImageClassify,
  IMAGE_CLASSIFY_JPEG_MAX_EDGE,
  IMAGE_CLASSIFY_JPEG_MAX_OUTPUT_BYTES,
  IMAGE_CLASSIFY_RESPONSE_FORMAT,
  IMAGE_KINDS,
  prepareVisionImageUrl,
  transcodeAvifToJpegDataUrl,
  transcodeProviderUnsupportedImageToJpegDataUrl,
} = imageClassifyModule;

describe("image classification task", () => {
  test("migration adds only the nullable constrained classification and an unclassified index", () => {
    const sql = readFileSync(new URL("../migrations/20260711_image_kind.sql", import.meta.url), "utf8");
    expect(sql).toContain("BEGIN;");
    expect(sql).toContain("ADD COLUMN image_kind text");
    expect(sql).toContain("image_kind IN ('photo', 'logo', 'text_graphic', 'junk')");
    expect(sql).toContain("image_kind IS NULL");
    expect(sql).toContain("COMMIT;");
    expect(sql).not.toMatch(/DELETE\s+FROM\s+fountain\.images/iu);
  });

  test("uses deterministic rules only for explicit metadata evidence", () => {
    expect(classifyImageMetadata({ image_url: "https://cdn.example/tracking-pixel.png" }))
      .toMatchObject({ image_kind: "junk", method: "metadata_rule" });
    expect(classifyImageMetadata({ image_url: "https://cdn.example/clinic-logo.png" }))
      .toMatchObject({ image_kind: "logo", method: "metadata_rule" });
    expect(classifyImageMetadata({ alt: "Clinic treatment room" }))
      .toMatchObject({ image_kind: "photo", method: "metadata_rule" });
    expect(classifyImageMetadata({ alt: "Summer promotion flyer" }))
      .toMatchObject({ image_kind: "text_graphic", method: "metadata_rule" });
    expect(classifyImageMetadata({ alt: "Example Longevity" })).toBeNull();
  });

  test("sends ambiguous images to the cheap vision tier with strict four-class output", async () => {
    const complete = vi.fn(async (request: unknown) => {
      void request;
      return {
        content: JSON.stringify({
          image_kind: "photo",
          confidence: 0.93,
          rationale: "A photographic clinic treatment room.",
        }),
        model: "openai/gpt-4o-mini",
        externalCallId: "800",
      };
    });
    const download = vi.fn();
    const decision = await classifyImageWithLlm(imageRow(), {
      llmClient: { complete },
      runId: "17",
      imageClient: { download },
    });

    expect(decision).toMatchObject({
      image_kind: "photo",
      confidence: 0.93,
      method: "llm_vision",
      model: "openai/gpt-4o-mini",
      external_call_id: "800",
    });
    expect(IMAGE_CLASSIFY_RESPONSE_FORMAT.json_schema.schema.properties.image_kind.enum)
      .toEqual(IMAGE_KINDS);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({
      runId: "17",
      entityId: 91,
      tier: "default",
      callType: "image_classify",
      responseFormat: IMAGE_CLASSIFY_RESPONSE_FORMAT,
      temperature: 0,
    }));
    const request = complete.mock.calls[0][0] as {
      messages: Array<{ content: unknown }>;
    };
    expect(request.messages[1].content).toContainEqual({
      type: "image_url",
      image_url: { url: "https://store.public.blob.vercel-storage.com/image.jpg" },
    });
    expect(download).not.toHaveBeenCalled();
  });

  test("downloads AVIF safely and sends a bounded locally converted JPEG data URL", async () => {
    const order: string[] = [];
    const avif = await sharp({
      create: {
        width: 32,
        height: 20,
        channels: 4,
        background: { r: 24, g: 90, b: 160, alpha: 0.7 },
      },
    }).avif().toBuffer();
    const imageClient = {
      download: vi.fn(async (url: string) => {
        order.push("download");
        expect(url).toBe("https://store.public.blob.vercel-storage.com/image.avif?download=1");
        return { ok: true, buffer: avif, contentType: "image/avif" };
      }),
    };
    let providerImageUrl = "";
    const complete = vi.fn(async (request: {
      messages: Array<{ content: unknown }>;
    }) => {
      order.push("complete");
      const content = request.messages[1].content as Array<{
        type: string;
        image_url?: { url: string };
      }>;
      providerImageUrl = content.find((part) => part.type === "image_url")?.image_url?.url || "";
      return {
        content: JSON.stringify({
          image_kind: "photo",
          confidence: 0.91,
          rationale: "A clinic photograph.",
        }),
        model: "openai/gpt-4o-mini",
        externalCallId: "802",
      };
    });

    const decision = await classifyImageWithLlm(imageRow({
      blob_url: "https://store.public.blob.vercel-storage.com/image.avif?download=1",
    }), {
      llmClient: { complete },
      runId: "20",
      imageClient,
    });

    expect(order).toEqual(["download", "complete"]);
    expect(decision).toMatchObject({ image_kind: "photo", external_call_id: "802" });
    expect(providerImageUrl).toMatch(/^data:image\/jpeg;base64,/u);
    const jpeg = Buffer.from(providerImageUrl.split(",", 2)[1], "base64");
    const metadata = await sharp(jpeg).metadata();
    expect(metadata.format).toBe("jpeg");
    expect(Math.max(metadata.width || 0, metadata.height || 0))
      .toBeLessThanOrEqual(IMAGE_CLASSIFY_JPEG_MAX_EDGE);
    expect(jpeg.length).toBeLessThanOrEqual(IMAGE_CLASSIFY_JPEG_MAX_OUTPUT_BYTES);
  });

  test("downloads an opaque .img blob whose source is SVG and sends a bounded JPEG", async () => {
    const svg = Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="32" viewBox="0 0 48 32">
        <rect width="48" height="32" fill="#ffffff"/>
        <circle cx="24" cy="11" r="7" fill="#7890a0"/>
        <path d="M8 32c2-10 10-14 16-14s14 4 16 14" fill="#456070"/>
      </svg>
    `);
    const blobUrl = "https://store.public.blob.vercel-storage.com/mmt-empty-doctor-list.img";
    const download = vi.fn(async (url: string) => {
      expect(url).toBe(blobUrl);
      return { ok: true, buffer: svg, contentType: "application/octet-stream" };
    });
    let providerImageUrl = "";
    const complete = vi.fn(async (request: {
      messages: Array<{ content: unknown }>;
    }) => {
      const content = request.messages[1].content as Array<{
        type: string;
        image_url?: { url: string };
      }>;
      providerImageUrl = content.find((part) => part.type === "image_url")?.image_url?.url || "";
      return {
        content: JSON.stringify({
          image_kind: "junk",
          confidence: 0.99,
          rationale: "An empty-doctor placeholder illustration.",
        }),
        model: "openai/gpt-4o-mini",
        externalCallId: "803",
      };
    });

    const decision = await classifyImageWithLlm(imageRow({
      image_url: "https://www.mymeditravel.com/images/mmt/mmt-empty-doctor-list.svg",
      blob_url: blobUrl,
    }), {
      llmClient: { complete },
      runId: "22",
      imageClient: { download },
    });

    expect(download).toHaveBeenCalledOnce();
    expect(decision).toMatchObject({ image_kind: "junk", external_call_id: "803" });
    expect(providerImageUrl).toMatch(/^data:image\/jpeg;base64,/u);
    const jpeg = Buffer.from(providerImageUrl.split(",", 2)[1], "base64");
    const metadata = await sharp(jpeg).metadata();
    expect(metadata.format).toBe("jpeg");
    expect(Math.max(metadata.width || 0, metadata.height || 0))
      .toBeLessThanOrEqual(IMAGE_CLASSIFY_JPEG_MAX_EDGE);
    expect(jpeg.length).toBeLessThanOrEqual(IMAGE_CLASSIFY_JPEG_MAX_OUTPUT_BYTES);
  });

  test("downloads direct SVG URLs while leaving provider-supported remote URLs untouched", async () => {
    const svg = Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20">
        <rect width="20" height="20" fill="#345678"/>
      </svg>
    `);
    const download = vi.fn(async () => ({ ok: true, buffer: svg, contentType: "image/svg+xml" }));
    const converted = await prepareVisionImageUrl("https://clinic.example/team.svg?version=2", {
      imageClient: { download },
    });
    const remote = await prepareVisionImageUrl("https://clinic.example/team.webp?version=2", {
      imageClient: { download },
    });

    expect(converted).toMatch(/^data:image\/jpeg;base64,/u);
    expect(remote).toBe("https://clinic.example/team.webp?version=2");
    expect(download).toHaveBeenCalledOnce();
  });

  test("rejects external SVG resource references before Sharp rendering", async () => {
    const svg = Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20">
        <image href="https://private.example/image.png" width="20" height="20"/>
      </svg>
    `);
    await expect(transcodeProviderUnsupportedImageToJpegDataUrl(svg, {
      contentType: "image/svg+xml",
    })).rejects.toThrow("SVG input contains a disallowed external resource reference");
  });

  test("fails before the provider call when an AVIF cannot be downloaded", async () => {
    const complete = vi.fn();
    await expect(classifyImageWithLlm(imageRow({
      blob_url: "https://store.public.blob.vercel-storage.com/missing.avif",
    }), {
      llmClient: { complete },
      runId: "21",
      imageClient: {
        download: vi.fn(async () => ({ ok: false, outcome: "http_error" })),
      },
    })).rejects.toThrow("AVIF vision input download failed: http_error");
    expect(complete).not.toHaveBeenCalled();
  });

  test("enforces the AVIF input bound before sharp decoding", async () => {
    await expect(transcodeAvifToJpegDataUrl(Buffer.alloc(5), {
      maxInputBytes: 4,
    })).rejects.toThrow("AVIF input exceeds the 4-byte limit");
  });

  test("classifies junk through the guarded write while preserving active, undeleted data", async () => {
    const complete = vi.fn(async () => ({
      content: JSON.stringify({
        image_kind: "junk",
        confidence: 0.98,
        rationale: "A broken placeholder asset, not listing imagery.",
      }),
      model: "openai/gpt-4o-mini",
      externalCallId: "801",
    }));
    const tx = classifyTransaction();
    const recordWrite = vi.fn(async ({ mutate }) => ({
      written: true,
      result: await mutate(tx),
    }));
    const setActor = vi.fn(async () => undefined);
    const result = await handleImageClassify({
      task: { id: "9", entity_type: "image", entity_id: 91 },
      run: { id: "17" },
    }, {
      query: vi.fn(async () => ({ rows: [imageRow()] })),
      llmClient: { complete },
      recordWrite,
      setActor,
    });

    expect(result).toMatchObject({
      outcome: "images_classified",
      counts: { loaded: 1, attempted: 1, written: 1, junk_demoted: 1, skipped: 0 },
      serving_write: {
        attempted: true,
        written: true,
        images_written: 1,
        junk_demoted: 1,
        images_deleted: 0,
      },
      images: [{
        image_id: 91,
        image_kind: "junk",
        primary_eligible: false,
        demoted_from_primary: true,
        status_preserved: true,
        deleted: false,
        write: { written: true, status_preserved: true, deleted: false },
      }],
    });
    expect(recordWrite).toHaveBeenCalledWith(expect.objectContaining({
      entity: { entity_type: "image", entity_id: 91 },
      field: "image_kind",
      verification: "agent_verified",
    }));
    const updateSql = tx.query.mock.calls.map(([sql]) => String(sql))
      .find((sql) => sql.includes("UPDATE fountain.images"));
    expect(updateSql).toContain("SET image_kind = $2");
    const setClause = updateSql?.match(/SET([\s\S]*?)WHERE/iu)?.[1] || "";
    expect(setClause).not.toMatch(/status\s*=/iu);
    expect(setClause).not.toMatch(/deleted_at\s*=/iu);
    expect(setActor).toHaveBeenCalledOnce();
  });

  test("location tasks classify all active images and skip already-classified rows without LLM spend", async () => {
    const logo = imageRow({ image_id: 92, image_url: "https://clinic.example/brand-logo.png" });
    const existing = imageRow({ image_id: 93, image_kind: "photo" });
    const complete = vi.fn();
    const writes: number[] = [];
    const recordWrite = vi.fn(async ({ entity, mutate }) => {
      writes.push(entity.entity_id);
      return { written: true, result: await mutate(classifyTransaction({ image_id: entity.entity_id })) };
    });

    const result = await handleImageClassify({
      task: { id: 10, entity_type: "location", entity_id: 42 },
      run: { id: 18 },
    }, {
      query: vi.fn(async () => ({ rows: [logo, existing] })),
      llmClient: { complete },
      recordWrite,
      setActor: vi.fn(),
    });

    expect(result).toMatchObject({
      outcome: "images_classified",
      entity_type: "location",
      counts: { loaded: 2, attempted: 1, written: 1, skipped: 1 },
      images: [
        { image_id: 92, image_kind: "logo", method: "metadata_rule", write: { written: true } },
        { image_id: 93, image_kind: "photo", write: { attempted: false, reason: "image_already_classified" } },
      ],
    });
    expect(writes).toEqual([92]);
    expect(complete).not.toHaveBeenCalled();
  });

  test("rechecks suppression after LLM classification and refuses the data write", async () => {
    const complete = vi.fn(async () => ({
      content: JSON.stringify({ image_kind: "photo", confidence: 0.9, rationale: "Clinic interior photograph." }),
      model: "openai/gpt-4o-mini",
      externalCallId: 900,
    }));
    const tx = classifyTransaction({ non_suppressed: false });
    const result = await handleImageClassify({
      task: { id: 11, entity_type: "image", entity_id: 91 },
      run: { id: 19 },
    }, {
      query: vi.fn(async () => ({ rows: [imageRow()] })),
      llmClient: { complete },
      recordWrite: vi.fn(async ({ mutate }) => ({ written: true, result: await mutate(tx) })),
      setActor: vi.fn(),
    });

    expect(result).toMatchObject({
      outcome: "no_changes",
      counts: { attempted: 1, written: 0 },
      images: [{ write: { attempted: true, written: false, reason: "location_suppressed" } }],
    });
    expect(tx.query.mock.calls.some(([sql]) => String(sql).includes("UPDATE fountain.images"))).toBe(false);
  });

  test("skips suppressed and owner/human-protected images before LLM calls", async () => {
    const complete = vi.fn();
    const recordWrite = vi.fn();
    const suppressed = await handleImageClassify({
      task: { id: 1, entity_type: "image", entity_id: 91 },
      run: { id: 2 },
    }, {
      query: vi.fn(async () => ({ rows: [imageRow({ non_suppressed: false })] })),
      llmClient: { complete },
      recordWrite,
    });
    const protectedResult = await handleImageClassify({
      task: { id: 3, entity_type: "image", entity_id: 91 },
      run: { id: 4 },
    }, {
      query: vi.fn(async () => ({ rows: [imageRow({ image_verification_status: "owner_verified" })] })),
      llmClient: { complete },
      recordWrite,
    });

    expect(suppressed.images[0].write.reason).toBe("location_suppressed");
    expect(protectedResult.images[0].write.reason).toBe("image_owner_or_human_protected");
    expect(complete).not.toHaveBeenCalled();
    expect(recordWrite).not.toHaveBeenCalled();
  });

  test("fails closed on an invalid vision class", async () => {
    await expect(classifyImageWithLlm(imageRow(), {
      llmClient: {
        complete: vi.fn(async () => ({
          content: JSON.stringify({ image_kind: "review", confidence: 0.7, rationale: "Unsure." }),
        })),
      },
      runId: 7,
    })).rejects.toThrow("image_kind must be one of");
  });
});

function imageRow(overrides: Record<string, unknown> = {}) {
  return {
    image_id: 91,
    image_entity_type: "location",
    image_entity_id: 42,
    image_url: "https://clinic.example/source.jpg",
    blob_url: "https://store.public.blob.vercel-storage.com/image.jpg",
    alt: "Example Longevity",
    image_status: "active",
    image_deleted_at: null,
    image_owner_account_id: null,
    image_verification_status: "unverified",
    image_kind: null,
    location_id: 42,
    location_name: "Example Longevity",
    location_status: "active",
    location_deleted_at: null,
    non_suppressed: true,
    ...overrides,
  };
}

function classifyTransaction(overrides: Record<string, unknown> = {}) {
  const state = imageRow(overrides);
  return {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("FOR UPDATE OF image, location")) return { rows: [state] };
      if (sql.includes("transaction_timestamp")) {
        return { rows: [{ write_started_at: "2026-07-11T21:00:00.000Z" }] };
      }
      if (sql.includes("UPDATE fountain.images")) {
        return {
          rowCount: 1,
          rows: [{ id: state.image_id, image_kind: params?.[1], status: "active", deleted_at: null }],
        };
      }
      if (sql.includes("UPDATE fountain.entity_change_events")) return { rowCount: 1, rows: [] };
      throw new Error(`Unexpected SQL: ${sql}`);
    }),
  };
}
