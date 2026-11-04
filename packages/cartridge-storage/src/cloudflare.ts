import * as Cloudflare from "@alchemy.run/cloudflare";
import { retain } from "alchemy/RemovalPolicy";
import * as RuntimeContext from "alchemy/RuntimeContext";
import { Effect, Layer } from "effect";

import { DocumentReader } from "./document-reader.ts";
import { DocumentNotFound, DocumentReadFailed, UploadSigningFailed } from "./errors.ts";
import { UploadUrlSigner } from "./upload-urls.ts";

export const UploadOrigins = ["http://localhost:5173", "https://drepaplan.martoux.com"];

export const DocumentBucket = Cloudflare.R2.Bucket("DrepaPlanDocuments", {
  cors: [
    {
      allowedMethods: ["PUT"],
      allowedOrigins: UploadOrigins,
      allowedHeaders: ["content-type"],
      maxAgeSeconds: 600,
    },
  ],
}).pipe(retain());

export const R2UploadUrlSigner = Layer.effect(
  UploadUrlSigner,
  Effect.gen(function* () {
    const bucket = yield* DocumentBucket;
    const presign = yield* Cloudflare.R2.PresignPutObject(bucket);
    return {
      presign: (request) =>
        presign({
          key: request.key,
          contentType: request.contentType,
          expiresIn: request.expiresInSeconds,
        }).pipe(
          Effect.provide(RuntimeContext.RuntimeContext.phantom),
          Effect.mapError((cause) => new UploadSigningFailed({ message: cause.message }))
        ),
    };
  })
).pipe(Layer.provide(Cloudflare.R2.PresignPutObjectToken));

export const R2DocumentReader = Layer.effect(
  DocumentReader,
  Effect.gen(function* () {
    const bucket = yield* DocumentBucket;
    const reader = yield* Cloudflare.R2.ReadBucket(bucket);
    return {
      read: (key) =>
        Effect.gen(function* () {
          const object = yield* reader.get(key);
          if (object === null) {
            return yield* new DocumentNotFound({ key });
          }
          return yield* object.bytes();
        }).pipe(
          Effect.provide(RuntimeContext.RuntimeContext.phantom),
          Effect.catchTag("R2Error", (cause) =>
            Effect.fail(new DocumentReadFailed({ key, message: cause.message }))
          )
        ),
    };
  })
).pipe(Layer.provide(Cloudflare.R2.ReadBucketBinding));

export const StorageCloudflare = Layer.mergeAll(R2UploadUrlSigner, R2DocumentReader);
