import * as Cloudflare from "@alchemy.run/cloudflare";
import { PdfContentType } from "@drepaplan/domain";
import { retain } from "alchemy/RemovalPolicy";
import * as RuntimeContext from "alchemy/RuntimeContext";
import { Context, Effect, Layer } from "effect";

import { DocumentReader } from "./document-reader.ts";
import { DocumentNotFound, DocumentReadFailed, DocumentWriteFailed } from "./errors.ts";
import { DocumentWriter } from "./uploads.ts";

export const DocumentBucket = Cloudflare.R2.Bucket("DrepaPlanDocuments", {}).pipe(retain());

export const R2DocumentStore = Layer.effectContext(
  Effect.gen(function* () {
    const bucket = yield* DocumentBucket;
    const client = yield* Cloudflare.R2.ReadWriteBucket(bucket);

    const reader: DocumentReader["Service"] = {
      read: (key) =>
        Effect.gen(function* () {
          const object = yield* client.get(key);
          if (object === null) {
            return yield* new DocumentNotFound({ key });
          }
          return yield* object.bytes();
        }).pipe(
          Effect.provide(RuntimeContext.RuntimeContext.phantom),
          Effect.catchTag("R2Error", (cause) => Effect.fail(new DocumentReadFailed({ key, message: cause.message })))
        ),
    };

    const writer: DocumentWriter["Service"] = {
      write: (key, bytes) =>
        client.put(key, bytes, { httpMetadata: { contentType: PdfContentType } }).pipe(
          Effect.asVoid,
          Effect.provide(RuntimeContext.RuntimeContext.phantom),
          Effect.catchTag("R2Error", (cause) => Effect.fail(new DocumentWriteFailed({ key, message: cause.message })))
        ),
    };

    return Context.add(Context.make(DocumentReader, reader), DocumentWriter, writer);
  })
).pipe(Layer.provide(Cloudflare.R2.ReadWriteBucketBinding));

export const StorageCloudflare = R2DocumentStore;
