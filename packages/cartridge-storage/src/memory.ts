import type { DocumentKey } from "@drepaplan/domain";
import { Effect, Layer } from "effect";

import { DocumentReader } from "./document-reader.ts";
import { DocumentNotFound } from "./errors.ts";
import { UploadUrlSigner } from "./upload-urls.ts";

export const MemoryUploadUrlSigner = (baseUrl: string) =>
  Layer.succeed(UploadUrlSigner, {
    presign: (request) =>
      Effect.succeed(
        `${baseUrl}/${request.key}?expires=${request.expiresInSeconds}&type=${encodeURIComponent(request.contentType)}`
      ),
  });

export const MemoryDocumentReader = (documents: ReadonlyMap<DocumentKey, Uint8Array>) =>
  Layer.succeed(DocumentReader, {
    read: (key) => {
      const bytes = documents.get(key);
      return bytes === undefined ? Effect.fail(new DocumentNotFound({ key })) : Effect.succeed(bytes);
    },
  });
