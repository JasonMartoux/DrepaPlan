import { DocumentKey, MaxPdfBytes, PdfContentType } from "@drepaplan/domain";
import { Context, Effect, Layer } from "effect";

import { DocumentTooLarge, type DocumentWriteFailed, UnsupportedDocument } from "./errors.ts";

export class DocumentWriter extends Context.Service<
  DocumentWriter,
  {
    readonly write: (key: DocumentKey, bytes: Uint8Array) => Effect.Effect<void, DocumentWriteFailed>;
  }
>()("@drepaplan/cartridge-storage/DocumentWriter") {}

export interface UploadRequest {
  readonly contentType: string | undefined;
  readonly bytes: Uint8Array;
}

export interface StoredUpload {
  readonly key: DocumentKey;
  readonly sizeBytes: number;
}

export type UploadError = UnsupportedDocument | DocumentTooLarge | DocumentWriteFailed;

const PdfSignature = [0x25, 0x50, 0x44, 0x46];

const mediaType = (contentType: string | undefined): string =>
  (contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";

export const hasPdfSignature = (bytes: Uint8Array): boolean =>
  PdfSignature.every((byte, index) => bytes[index] === byte);

const makeUploads = Effect.gen(function* () {
  const writer = yield* DocumentWriter;

  const store = Effect.fn("Uploads.store")(function* (request: UploadRequest) {
    const contentType = mediaType(request.contentType);
    if (contentType !== PdfContentType) {
      return yield* new UnsupportedDocument({ contentType });
    }
    const sizeBytes = request.bytes.byteLength;
    if (sizeBytes === 0 || sizeBytes > MaxPdfBytes) {
      return yield* new DocumentTooLarge({ sizeBytes, maxBytes: MaxPdfBytes });
    }
    if (!hasPdfSignature(request.bytes)) {
      return yield* new UnsupportedDocument({ contentType });
    }
    const id = yield* Effect.sync(() => crypto.randomUUID());
    const key = DocumentKey.make(`documents/${id}.pdf`);
    yield* writer.write(key, request.bytes);
    const stored: StoredUpload = { key, sizeBytes };
    return stored;
  });

  return { store };
});

export class Uploads extends Context.Service<
  Uploads,
  {
    readonly store: (request: UploadRequest) => Effect.Effect<StoredUpload, UploadError>;
  }
>()("@drepaplan/cartridge-storage/Uploads") {
  static readonly layer = Layer.effect(Uploads, makeUploads);
}
