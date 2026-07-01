import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

const TYPES: Record<string, string> = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path: pathParts } = await context.params;
  const mediaRoot = resolveMediaRoot();
  if (!mediaRoot) {
    return NextResponse.json({ error: "media root is not configured" }, { status: 404 });
  }
  const requestedPath = path.resolve(mediaRoot, ...pathParts);

  if (!requestedPath.startsWith(mediaRoot + path.sep)) {
    return NextResponse.json({ error: "invalid media path" }, { status: 400 });
  }

  try {
    const file = await fs.readFile(requestedPath);
    const contentType = TYPES[path.extname(requestedPath).toLowerCase()] || "application/octet-stream";
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": contentType,
      },
    });
  } catch {
    return NextResponse.json({ error: "media not found" }, { status: 404 });
  }
}

function resolveMediaRoot() {
  if (process.env.FOUNTAIN_MEDIA_ROOT) {
    return path.resolve(process.env.FOUNTAIN_MEDIA_ROOT);
  }
  if (process.env.NODE_ENV === "development") {
    return path.resolve(process.cwd(), "data", "media");
  }
  return null;
}
