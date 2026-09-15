import { NextResponse } from "next/server";
import { INLINE_IMAGE_TYPES, storage, StorageNotConfiguredError } from "@/lib/storage";

/** Per file. Keep in step with `experimental.proxyClientMaxBodySize` in next.config.ts. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export type ReadUpload =
  | { ok: true; file: File; bytes: Uint8Array; contentType: string }
  | { ok: false; response: NextResponse };

/** Pull one `file` field out of a multipart request, enforcing the size limit. */
export async function readUpload(req: Request, opts: { allow?: (contentType: string) => boolean } = {}): Promise<ReadUpload> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Expected a multipart upload" }, { status: 400 }) };
  }
  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, response: NextResponse.json({ error: "No file" }, { status: 400 }) };
  if (file.size === 0) return { ok: false, response: NextResponse.json({ error: "Empty file" }, { status: 400 }) };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, response: NextResponse.json({ error: "File is larger than 50MB" }, { status: 413 }) };
  }
  const contentType = (file.type || "application/octet-stream").toLowerCase();
  if (opts.allow && !opts.allow(contentType)) {
    return { ok: false, response: NextResponse.json({ error: `File type ${contentType} is not allowed here` }, { status: 415 }) };
  }
  return { ok: true, file, bytes: new Uint8Array(await file.arrayBuffer()), contentType };
}

export function storageUnavailable(err: unknown): NextResponse {
  const configured = !(err instanceof StorageNotConfiguredError);
  console.error("[storage]", (err as Error).message);
  return NextResponse.json(
    { error: configured ? "File storage failed; try again" : "File storage is not configured" },
    { status: 503 },
  );
}

/**
 * Answer a request for a stored object whose access the caller has ALREADY
 * checked. R2: a 60-second presigned redirect, so large photos never stream
 * through this container. Disk (dev): the bytes.
 *
 * Only known raster images are ever served inline. Everything else downloads,
 * so an uploaded HTML or SVG file cannot run script on the app.erp.io origin.
 */
export async function serveStoredObject(key: string, filename: string, contentType: string): Promise<NextResponse> {
  const inline = INLINE_IMAGE_TYPES.has(contentType);
  const safeType = inline ? contentType : "application/octet-stream";
  let store;
  try { store = storage(); } catch (err) { return storageUnavailable(err); }

  const signed = store.signedUrl(key, { ttlSeconds: 60, downloadName: filename, inline, contentType: safeType });
  if (signed) {
    return NextResponse.redirect(signed, { status: 302, headers: { "Cache-Control": "private, no-store" } });
  }
  const bytes = await store.get(key);
  if (!bytes) return NextResponse.json({ error: "File not found" }, { status: 404 });
  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": safeType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename.replace(/["\r\n\\]/g, "")}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=300",
    },
  });
}
