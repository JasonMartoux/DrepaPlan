import type { DocumentKey } from "@drepaplan/domain";
import { Effect, Layer } from "effect";

import { DocumentReader } from "./document-reader.ts";
import { DocumentNotFound } from "./errors.ts";
import { DocumentWriter } from "./uploads.ts";

export const MemoryDocumentReader = (documents: ReadonlyMap<DocumentKey, Uint8Array>) =>
  Layer.succeed(DocumentReader, {
    read: (key) => {
      const bytes = documents.get(key);
      return bytes === undefined ? Effect.fail(new DocumentNotFound({ key })) : Effect.succeed(bytes);
    },
  });

export const MemoryDocumentStore = (documents: Map<DocumentKey, Uint8Array> = new Map()) =>
  Layer.mergeAll(
    MemoryDocumentReader(documents),
    Layer.succeed(DocumentWriter, {
      write: (key, bytes) => Effect.sync(() => void documents.set(key, bytes)),
    })
  );
