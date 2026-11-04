import { describe, expect, it } from "@effect/vitest";
import { DocumentKey, MaxPdfBytes } from "@drepaplan/domain";
import { Effect, Layer, Schema } from "effect";

import { DocumentReader, MemoryDocumentReader, MemoryUploadUrlSigner, UploadUrls } from "../src/index.ts";

const TestUploads = UploadUrls.layer.pipe(Layer.provide(MemoryUploadUrlSigner("https://r2.test")));

describe("UploadUrls", () => {
  it.effect("issues a presigned PUT URL for a fresh PDF key", () =>
    Effect.gen(function* () {
      const uploads = yield* UploadUrls;
      const issued = yield* uploads.issue({ contentType: "application/pdf", sizeBytes: 1024 });
      expect(Schema.is(DocumentKey)(issued.key)).toBe(true);
      expect(issued.uploadUrl).toBe(`https://r2.test/${issued.key}?expires=600&type=application%2Fpdf`);
      expect(issued.expiresAt).toBe("1970-01-01T00:10:00.000Z");
    }).pipe(Effect.provide(TestUploads))
  );

  it.effect("never reuses a key", () =>
    Effect.gen(function* () {
      const uploads = yield* UploadUrls;
      const first = yield* uploads.issue({ contentType: "application/pdf", sizeBytes: 1 });
      const second = yield* uploads.issue({ contentType: "application/pdf", sizeBytes: 1 });
      expect(first.key).not.toBe(second.key);
    }).pipe(Effect.provide(TestUploads))
  );

  it.effect("rejects non-PDF content", () =>
    Effect.gen(function* () {
      const uploads = yield* UploadUrls;
      const error = yield* Effect.flip(uploads.issue({ contentType: "text/html", sizeBytes: 10 }));
      expect(error._tag).toBe("UnsupportedDocument");
    }).pipe(Effect.provide(TestUploads))
  );

  it.effect("rejects empty or oversized PDFs", () =>
    Effect.gen(function* () {
      const uploads = yield* UploadUrls;
      const tooLarge = yield* Effect.flip(uploads.issue({ contentType: "application/pdf", sizeBytes: MaxPdfBytes + 1 }));
      const empty = yield* Effect.flip(uploads.issue({ contentType: "application/pdf", sizeBytes: 0 }));
      expect(tooLarge._tag).toBe("DocumentTooLarge");
      expect(empty._tag).toBe("DocumentTooLarge");
    }).pipe(Effect.provide(TestUploads))
  );
});

describe("DocumentReader", () => {
  const key = DocumentKey.make("documents/123e4567-e89b-42d3-a456-426614174000.pdf");

  it.effect("reads stored documents and fails with DocumentNotFound otherwise", () =>
    Effect.gen(function* () {
      const reader = yield* DocumentReader;
      expect(yield* reader.read(key)).toEqual(new Uint8Array([1, 2, 3]));
      const missing = yield* Effect.flip(
        reader.read(DocumentKey.make("documents/00000000-0000-4000-8000-000000000000.pdf"))
      );
      expect(missing._tag).toBe("DocumentNotFound");
    }).pipe(Effect.provide(MemoryDocumentReader(new Map([[key, new Uint8Array([1, 2, 3])]]))))
  );
});
