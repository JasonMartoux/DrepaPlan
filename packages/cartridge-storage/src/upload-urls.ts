import { DocumentKey, MaxPdfBytes, PdfContentType } from "@drepaplan/domain";
import { Clock, Context, Effect, Layer } from "effect";

import { DocumentTooLarge, UnsupportedDocument, UploadSigningFailed } from "./errors.ts";

export const UploadUrlTtlSeconds = 600;

export interface PresignRequest {
  readonly key: DocumentKey;
  readonly contentType: string;
  readonly expiresInSeconds: number;
}

export class UploadUrlSigner extends Context.Service<
  UploadUrlSigner,
  {
    readonly presign: (request: PresignRequest) => Effect.Effect<string, UploadSigningFailed>;
  }
>()("@drepaplan/cartridge-storage/UploadUrlSigner") {}

export interface UploadRequest {
  readonly contentType: string;
  readonly sizeBytes: number;
}

export interface IssuedUpload {
  readonly key: DocumentKey;
  readonly uploadUrl: string;
  readonly expiresAt: string;
}

export type UploadError = UnsupportedDocument | DocumentTooLarge | UploadSigningFailed;

const makeUploadUrls = Effect.gen(function* () {
  const signer = yield* UploadUrlSigner;

  const issue = Effect.fn("UploadUrls.issue")(function* (request: UploadRequest) {
    if (request.contentType !== PdfContentType) {
      return yield* new UnsupportedDocument({ contentType: request.contentType });
    }
    if (!Number.isInteger(request.sizeBytes) || request.sizeBytes <= 0 || request.sizeBytes > MaxPdfBytes) {
      return yield* new DocumentTooLarge({ sizeBytes: request.sizeBytes, maxBytes: MaxPdfBytes });
    }
    const id = yield* Effect.sync(() => crypto.randomUUID());
    const key = DocumentKey.make(`documents/${id}.pdf`);
    const uploadUrl = yield* signer.presign({
      key,
      contentType: PdfContentType,
      expiresInSeconds: UploadUrlTtlSeconds,
    });
    const now = yield* Clock.currentTimeMillis;
    const issued: IssuedUpload = {
      key,
      uploadUrl,
      expiresAt: new Date(now + UploadUrlTtlSeconds * 1000).toISOString(),
    };
    return issued;
  });

  return { issue };
});

export class UploadUrls extends Context.Service<
  UploadUrls,
  {
    readonly issue: (request: UploadRequest) => Effect.Effect<IssuedUpload, UploadError>;
  }
>()("@drepaplan/cartridge-storage/UploadUrls") {
  static readonly layer = Layer.effect(UploadUrls, makeUploadUrls);
}
