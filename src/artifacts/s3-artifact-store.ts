import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createHash, randomUUID } from "node:crypto";
import type { ArtifactDraft, ArtifactRef } from "../types";

export class S3ArtifactStore {
  private readonly client: S3Client;
  private readonly endpointUrl: URL;

  constructor(
    private readonly bucket: string,
    endpoint: string,
    region: string,
    accessKeyId: string,
    secretAccessKey: string,
    private readonly forcePathStyle: boolean
  ) {
    this.endpointUrl = new URL(endpoint);
    this.client = new S3Client({
      endpoint,
      region,
      forcePathStyle,
      credentials: {
        accessKeyId,
        secretAccessKey
      }
    });
  }

  async upload(
    source: string,
    runKey: string,
    eventId: string,
    artifact: ArtifactDraft
  ): Promise<ArtifactRef> {
    const body = typeof artifact.body === "string" ? Buffer.from(artifact.body, "utf-8") : artifact.body;
    const checksum = createHash("sha256").update(body).digest("hex");
    const objectKey =
      artifact.objectKey ??
      `${source}/${runKey}/${eventId}/${randomUUID()}-${artifact.fileName}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: body,
        ContentType: artifact.contentType,
        Metadata: artifact.metadata
          ? Object.fromEntries(
              Object.entries(artifact.metadata).map(([key, value]) => [key, String(value)])
            )
          : undefined
      })
    );

    return {
      kind: artifact.kind,
      bucket: this.bucket,
      objectKey,
      mimeType: artifact.contentType,
      checksum,
      sizeBytes: body.byteLength,
      metadata: artifact.metadata
    };
  }

  resolveObjectUrl(artifact: Pick<ArtifactRef, "bucket" | "objectKey">): string {
    const url = new URL(this.endpointUrl.toString());
    const objectPath = artifact.objectKey
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");

    if (this.forcePathStyle) {
      url.pathname = `${trimTrailingSlash(url.pathname)}/${encodeURIComponent(artifact.bucket)}/${objectPath}`;
      return url.toString();
    }

    url.hostname = `${artifact.bucket}.${url.hostname}`;
    url.pathname = `${trimTrailingSlash(url.pathname)}/${objectPath}`;
    return url.toString();
  }
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
