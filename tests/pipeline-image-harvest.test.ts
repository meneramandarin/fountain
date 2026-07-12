import sharp from "sharp";
import { describe, expect, test, vi } from "vitest";

// @ts-expect-error -- pipeline runtime intentionally uses native .mjs modules.
import * as imageHarvestModule from "../pipeline/tasks/image_harvest.mjs";

const {
  createCachedImageClient,
  extractImageCandidates,
  handleImageHarvest,
  isJunkImageCandidate,
  validateAndProcessImage,
} = imageHarvestModule;

describe("image harvest task", () => {
  test("extracts cached OG/JSON-LD/hero candidates in precedence order and applies legacy junk filters", () => {
    const html = `
      <html>
        <head>
          <title>Example Longevity</title>
          <meta property="og:image" content="/assets/company-logo.svg">
          <script type="application/ld+json">
            {"@type":"MedicalClinic","name":"Example Longevity","image":"/images/clinic-exterior.jpg"}
          </script>
        </head>
        <body>
          <section class="hero" style="background-image:url('/images/hero-room.webp')"></section>
          <img src="/images/thumb.jpg" width="120" alt="small thumbnail">
          <img srcset="/images/room-600.jpg 600w, /images/room-1200.jpg 1200w" alt="Treatment room">
        </body>
      </html>
    `;

    expect(extractImageCandidates(html, "https://clinic.example/about", { limit: 8 })).toEqual([
      {
        url: "https://clinic.example/images/clinic-exterior.jpg",
        source: "jsonld_image",
        alt: "Example Longevity",
      },
      {
        url: "https://clinic.example/images/hero-room.webp",
        source: "hero_background",
        alt: "Example Longevity",
      },
      {
        url: "https://clinic.example/images/room-1200.jpg",
        source: "img",
        alt: "Treatment room",
      },
    ]);
    expect(isJunkImageCandidate("https://clinic.example/pixel.gif", "")).toBe(true);
    expect(isJunkImageCandidate("https://clinic.example/photo.jpg", "Company logo")).toBe(true);
  });

  test("uses the established byte, type, dimension, aspect-ratio, and processing contract", async () => {
    const photo = await sharp({
      create: { width: 800, height: 600, channels: 3, background: "#557799" },
    }).jpeg().toBuffer();
    const accepted = await validateAndProcessImage(photo, "image/jpeg", { minBytes: 1 });
    expect(accepted).toMatchObject({
      ok: true,
      width: 800,
      height: 600,
      extension: "jpg",
      contentType: "image/jpeg",
    });

    const logoShape = await sharp({
      create: { width: 1_000, height: 100, channels: 3, background: "#ffffff" },
    }).png().toBuffer();
    await expect(validateAndProcessImage(logoShape, "image/png", { minBytes: 1 }))
      .resolves.toMatchObject({ ok: false, reason: "logo_like_aspect_ratio" });
    await expect(validateAndProcessImage(Buffer.from("<svg/>"), "image/svg+xml", { minBytes: 1 }))
      .resolves.toMatchObject({ ok: false, reason: "unsupported_content_type" });
  });

  test("rejects a private-address binary candidate before any fetch", async () => {
    const fetchImpl = vi.fn();
    const imageClient = createCachedImageClient({
      fetchImpl,
      resolveHost: vi.fn(async () => [{ address: "127.0.0.1" }]),
    });

    await expect(imageClient.download("https://images.example/photo.jpg"))
      .resolves.toMatchObject({ ok: false, outcome: "unsafe_url" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("harvests one processed candidate through Blob and the guarded transaction", async () => {
    const query = vi.fn(async () => ({ rows: [eligibleLocation()] }));
    const webClient = {
      fetchHomepage: vi.fn(async () => ({
        ok: true,
        outcome: "ok",
        requestedUrl: "https://clinic.example/",
        finalUrl: "https://clinic.example/",
        status: 200,
        contentType: "text/html",
        cached: true,
        cachePath: "/tmp/cache.json",
        html: `<meta property="og:image" content="/photos/clinic.jpg">`,
      })),
    };
    const imageClient = {
      download: vi.fn(async () => ({
        ok: true,
        buffer: Buffer.from("source-image"),
        contentType: "image/jpeg",
        cachePath: "/tmp/image.bin",
        cached: true,
      })),
    };
    const processed = Buffer.from("processed-image");
    const processImage = vi.fn(async () => ({
      ok: true,
      buffer: processed,
      width: 1_200,
      height: 800,
      extension: "jpg",
      contentType: "image/jpeg",
      bytes: processed.length,
    }));
    const blobClient = {
      upload: vi.fn(async () => ({ url: "https://store.public.blob.vercel-storage.com/photo.jpg" })),
      remove: vi.fn(async () => undefined),
    };
    const tx = harvestTransaction({ non_suppressed: true });
    const recordWrite = vi.fn(async ({ mutate }) => ({
      written: true,
      result: await mutate(tx),
    }));
    const setActor = vi.fn(async () => undefined);

    const result = await handleImageHarvest({
      task: { id: "9", entity_type: "location", entity_id: 42 },
      run: { id: "17" },
    }, {
      query,
      webClient,
      imageClient,
      blobClient,
      processImage,
      recordWrite,
      setActor,
    });

    expect(result).toMatchObject({
      outcome: "image_harvested",
      task_id: "9",
      run_id: "17",
      location_id: 42,
      selected: {
        url: "https://clinic.example/photos/clinic.jpg",
        source: "og_image",
        blob_url: "https://store.public.blob.vercel-storage.com/photo.jpg",
      },
      write: { written: true, image_id: 700, event_stamped: true },
      serving_write: { attempted: true, written: true, image_id: 700 },
    });
    expect(result.page).not.toHaveProperty("html");
    expect(recordWrite).toHaveBeenCalledWith(expect.objectContaining({
      entity: { entity_type: "location", entity_id: 42 },
      field: "images",
      verification: "agent_verified",
    }));
    expect(blobClient.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^listing-images\/website-harvest\/location\/42\/[a-f0-9]{20}\.jpg$/u),
      processed,
      { contentType: "image/jpeg" },
    );
    expect(blobClient.remove).not.toHaveBeenCalled();
    expect(setActor).toHaveBeenCalledOnce();
    expect(tx.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO fountain.images"))).toBe(true);
    expect(tx.query.mock.calls.some(([sql]) => String(sql).includes("image_harvest"))).toBe(true);
  });

  test("rechecks suppression after upload and compensates the Blob without inserting", async () => {
    const blobClient = {
      upload: vi.fn(async () => ({ url: "https://store.public.blob.vercel-storage.com/photo.jpg" })),
      remove: vi.fn(async () => undefined),
    };
    const tx = harvestTransaction({ non_suppressed: false });
    const result = await handleImageHarvest({
      task: { id: 9, entity_type: "location", entity_id: 42 },
      run: { id: 17 },
    }, {
      query: vi.fn(async () => ({ rows: [eligibleLocation()] })),
      webClient: {
        fetchHomepage: vi.fn(async () => ({
          ok: true,
          outcome: "ok",
          requestedUrl: "https://clinic.example/",
          finalUrl: "https://clinic.example/",
          html: `<meta property="og:image" content="/photos/clinic.jpg">`,
        })),
      },
      imageClient: {
        download: vi.fn(async () => ({ ok: true, buffer: Buffer.from("source"), contentType: "image/jpeg" })),
      },
      blobClient,
      processImage: vi.fn(async () => ({
        ok: true,
        buffer: Buffer.from("processed"),
        width: 900,
        height: 600,
        extension: "jpg",
        contentType: "image/jpeg",
        bytes: 9,
      })),
      recordWrite: vi.fn(async ({ mutate }) => ({ written: true, result: await mutate(tx) })),
      setActor: vi.fn(),
    });

    expect(result).toMatchObject({
      outcome: "write_refused",
      write: { attempted: true, written: false, reason: "location_suppressed" },
      serving_write: { attempted: true, written: false, reason: "location_suppressed" },
    });
    expect(blobClient.remove).toHaveBeenCalledWith("https://store.public.blob.vercel-storage.com/photo.jpg");
    expect(tx.query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO fountain.images"))).toBe(false);
  });

  test("skips an initially suppressed row before crawl, download, or mutation", async () => {
    const webClient = { fetchHomepage: vi.fn() };
    const imageClient = { download: vi.fn() };
    const blobClient = { upload: vi.fn(), remove: vi.fn() };
    const recordWrite = vi.fn();
    const result = await handleImageHarvest({
      task: { id: 1, entity_type: "location", entity_id: 42 },
      run: { id: 2 },
    }, {
      query: vi.fn(async () => ({ rows: [{ ...eligibleLocation(), non_suppressed: false }] })),
      webClient,
      imageClient,
      blobClient,
      recordWrite,
    });

    expect(result).toMatchObject({ outcome: "skipped", reason: "location_suppressed" });
    expect(webClient.fetchHomepage).not.toHaveBeenCalled();
    expect(imageClient.download).not.toHaveBeenCalled();
    expect(blobClient.upload).not.toHaveBeenCalled();
    expect(recordWrite).not.toHaveBeenCalled();
  });
});

function eligibleLocation() {
  return {
    id: 42,
    name: "Example Longevity",
    website: "https://clinic.example/",
    status: "active",
    deleted_at: null,
    is_virtual: false,
    active_image_count: 0,
    non_suppressed: true,
  };
}

function harvestTransaction(overrides: Record<string, unknown>) {
  const state = {
    status: "active",
    deleted_at: null,
    is_virtual: false,
    non_suppressed: true,
    has_zero_active_images: true,
    ...overrides,
  };
  return {
    query: vi.fn(async (sql: string) => {
      if (sql.includes("has_zero_active_images")) return { rows: [state] };
      if (sql.includes("transaction_timestamp")) {
        return { rows: [{ write_started_at: "2026-07-11T20:00:00.000Z" }] };
      }
      if (sql.includes("INSERT INTO fountain.images")) return { rowCount: 1, rows: [{ id: 700 }] };
      if (sql.includes("UPDATE fountain.entity_change_events")) return { rowCount: 1, rows: [] };
      throw new Error(`Unexpected SQL: ${sql}`);
    }),
  };
}
