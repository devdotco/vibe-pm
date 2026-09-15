import { createHash, createHmac } from "node:crypto";

/**
 * Cloudflare R2 over its S3-compatible API — a SigV4 query presigner plus
 * fetch, no AWS SDK. Copied from cfo-erp-io's adapter
 * (src/modules/documents/storage/r2.ts), which has been in production since
 * September; kept dependency-free for the same reason: the app runs on
 * Hetzner, and R2 is just the object store.
 *
 * Buckets are private. Every read is a short-lived presigned URL for ONE key,
 * handed out only after the route has checked the caller's organization.
 */
export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint?: string;
}

const REGION = "auto";
const SERVICE = "s3";

function sha256Hex(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}
function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}
function rfc3986(str: string): string {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}
function amzDate(now: Date): string {
  return now.toISOString().replace(/[:-]/g, "").replace(/\.\d{3}/, "");
}

export class R2Client {
  private readonly host: string;

  constructor(private readonly cfg: R2Config) {
    const endpoint = cfg.endpoint ?? `https://${cfg.accountId}.r2.cloudflarestorage.com`;
    this.host = new URL(endpoint).host;
  }

  presign(method: string, objectKey: string, expiresSeconds: number, extraQuery: Record<string, string> = {}, now = new Date()): string {
    const stamp = amzDate(now);
    const datestamp = stamp.slice(0, 8);
    const scope = `${datestamp}/${REGION}/${SERVICE}/aws4_request`;
    const path = `/${rfc3986(this.cfg.bucket)}/${objectKey.split("/").map(rfc3986).join("/")}`;

    const query: Record<string, string> = {
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": `${this.cfg.accessKeyId}/${scope}`,
      "X-Amz-Date": stamp,
      "X-Amz-Expires": String(expiresSeconds),
      "X-Amz-SignedHeaders": "host",
      ...extraQuery,
    };
    const canonicalQuery = Object.keys(query)
      .map((k) => [rfc3986(k), rfc3986(query[k]!)] as const)
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([k, v]) => `${k}=${v}`)
      .join("&");

    const canonicalRequest = [method, path, canonicalQuery, `host:${this.host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
    const stringToSign = ["AWS4-HMAC-SHA256", stamp, scope, sha256Hex(canonicalRequest)].join("\n");
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${this.cfg.secretAccessKey}`, datestamp), REGION), SERVICE), "aws4_request");
    const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

    return `https://${this.host}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`;
  }

  async put(objectKey: string, body: Uint8Array, contentType: string): Promise<void> {
    const res = await fetch(this.presign("PUT", objectKey, 300), {
      method: "PUT",
      body: body as unknown as BodyInit,
      headers: { "content-type": contentType },
    });
    if (!res.ok) throw new Error(`R2 put failed (${res.status})`);
  }

  async get(objectKey: string): Promise<Uint8Array | null> {
    const res = await fetch(this.presign("GET", objectKey, 60));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`R2 get failed (${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  }

  async delete(objectKey: string): Promise<void> {
    const res = await fetch(this.presign("DELETE", objectKey, 60), { method: "DELETE" });
    if (!res.ok && res.status !== 404) throw new Error(`R2 delete failed (${res.status})`);
  }
}
