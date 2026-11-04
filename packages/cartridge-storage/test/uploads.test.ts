import { describe, expect, it } from "@effect/vitest";
import { DocumentKey, MaxPdfBytes } from "@drepaplan/domain";
import { Effect, Layer, Schema } from "effect";

import { DocumentReader, DocumentWriteFailed, DocumentWriter, MemoryDocumentStore, Uploads } from "../src/index.ts";

const pdf = (size = 16) => {
  const bytes = new Uint8Array(size);
  bytes.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
  return bytes;
};

const TestStorage = Layer.provideMerge(Uploads.layer, MemoryDocumentStore());

describe("Uploads", () => {
  it.effect("stores a PDF under a fresh key that the reader can load", () =>
    Effect.gen(function* () {
      const uploads = yield* Uploads;
      const reader = yield* DocumentReader;
      const stored = yield* uploads.store({ contentType: "application/pdf", bytes: pdf() });
      expect(Schema.is(DocumentKey)(stored.key)).toBe(true);
      expect(stored.sizeBytes).toBe(16);
      expect(yield* reader.read(stored.key)).toEqual(pdf());
    }).pipe(Effect.provide(TestStorage))
  );

  it.effect("never reuses a key and accepts content-type parameters", () =>
    Effect.gen(function* () {
      const uploads = yield* Uploads;
      const first = yield* uploads.store({ contentType: "application/pdf", bytes: pdf() });
      const second = yield* uploads.store({ contentType: "Application/PDF; charset=binary", bytes: pdf() });
      expect(first.key).not.toBe(second.key);
    }).pipe(Effect.provide(TestStorage))
  );

  it.effect("rejects non-PDF content types and bytes without a PDF signature", () =>
    Effect.gen(function* () {
      const uploads = yield* Uploads;
      const html = yield* Effect.flip(uploads.store({ contentType: "text/html", bytes: pdf() }));
      const missing = yield* Effect.flip(uploads.store({ contentType: undefined, bytes: pdf() }));
      const disguised = yield* Effect.flip(
        uploads.store({ contentType: "application/pdf", bytes: new TextEncoder().encode("<html></html>") })
      );
      expect([html._tag, missing._tag, disguised._tag]).toEqual([
        "UnsupportedDocument",
        "UnsupportedDocument",
        "UnsupportedDocument",
      ]);
    }).pipe(Effect.provide(TestStorage))
  );

  it.effect("rejects empty or oversized PDFs", () =>
    Effect.gen(function* () {
      const uploads = yield* Uploads;
      const tooLarge = yield* Effect.flip(uploads.store({ contentType: "application/pdf", bytes: pdf(MaxPdfBytes + 1) }));
      const empty = yield* Effect.flip(uploads.store({ contentType: "application/pdf", bytes: new Uint8Array() }));
      expect(tooLarge._tag).toBe("DocumentTooLarge");
      expect(empty._tag).toBe("DocumentTooLarge");
    }).pipe(Effect.provide(TestStorage))
  );

  it.effect("surfaces storage write failures", () =>
    Effect.gen(function* () {
      const uploads = yield* Uploads;
      const error = yield* Effect.flip(uploads.store({ contentType: "application/pdf", bytes: pdf() }));
      expect(error._tag).toBe("DocumentWriteFailed");
    }).pipe(
      Effect.provide(
        Uploads.layer.pipe(
          Layer.provide(
            Layer.succeed(DocumentWriter, {
              write: (key) => Effect.fail(new DocumentWriteFailed({ key, message: "R2 unavailable" })),
            })
          )
        )
      )
    )
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
    }).pipe(Effect.provide(MemoryDocumentStore(new Map([[key, new Uint8Array([1, 2, 3])]]))))
  );
});
