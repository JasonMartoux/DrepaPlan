import type { Ask } from "@drepaplan/cartridge-chatbot";
import type { MedicalIngestion } from "@drepaplan/cartridge-medical-parser";
import { DocumentTooLarge, type Uploads } from "@drepaplan/cartridge-storage";
import { DocumentKey, MaxPdfBytes } from "@drepaplan/domain";
import { Effect, type Redacted, Schema } from "effect";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";

import { bearerToken, tokenMatches } from "./auth.ts";

export interface ApiServices {
  readonly uploads: Uploads["Service"];
  readonly ingestion: MedicalIngestion["Service"];
  readonly ask: Ask["Service"];
  readonly apiToken: Redacted.Redacted<string>;
  readonly allowedOrigins: ReadonlyArray<string>;
}

export class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", {}) {}

const IngestionBody = Schema.Struct({ documentKey: DocumentKey });
const AskBody = Schema.Struct({ question: Schema.String });

const statusFor = (tag: string): number => {
  switch (tag) {
    case "Unauthorized":
      return 401;
    case "DocumentNotFound":
      return 404;
    case "ExtractionInvalid":
      return 422;
    case "StageTimedOut":
      return 504;
    case "DocumentTooLarge":
      return 413;
    case "UnsupportedDocument":
      return 415;
    case "QuestionInvalid":
    case "SchemaError":
    case "HttpServerError":
      return 400;
    default:
      return 502;
  }
};

const errorResponse = (error: { readonly _tag: string }) => {
  const status = statusFor(error._tag);
  return HttpServerResponse.jsonUnsafe({ error: error._tag }, { status });
};

const corsHeaders = (origin: string | undefined, allowedOrigins: ReadonlyArray<string>): Record<string, string> =>
  origin !== undefined && allowedOrigins.includes(origin)
    ? {
        "access-control-allow-origin": origin,
        "access-control-allow-headers": "authorization, content-type",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-max-age": "600",
        vary: "origin",
      }
    : { vary: "origin" };

export const handleRequest = (services: ApiServices) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const path = new URL(request.url, "http://drepaplan.local").pathname;
    const cors = corsHeaders(request.headers["origin"], services.allowedOrigins);

    const route = Effect.gen(function* () {
      if (request.method === "OPTIONS") {
        return HttpServerResponse.empty({ status: 204 });
      }
      if (request.method === "GET" && path === "/health") {
        return HttpServerResponse.jsonUnsafe({ status: "ok" });
      }

      const presented = bearerToken(request.headers["authorization"]);
      if (presented === undefined || !(yield* tokenMatches(presented, services.apiToken))) {
        return yield* new Unauthorized();
      }

      if (request.method === "POST" && path === "/uploads") {
        const declaredBytes = Number(request.headers["content-length"]);
        if (declaredBytes > MaxPdfBytes) {
          return yield* new DocumentTooLarge({ sizeBytes: declaredBytes, maxBytes: MaxPdfBytes });
        }
        const bytes = new Uint8Array(yield* request.arrayBuffer);
        const stored = yield* services.uploads.store({ contentType: request.headers["content-type"], bytes });
        return HttpServerResponse.jsonUnsafe(stored, { status: 201 });
      }
      if (request.method === "POST" && path === "/ingestions") {
        const body = yield* HttpServerRequest.schemaBodyJson(IngestionBody);
        const report = yield* services.ingestion.ingest(body.documentKey);
        return HttpServerResponse.jsonUnsafe(report);
      }
      if (request.method === "POST" && path === "/ask") {
        const body = yield* HttpServerRequest.schemaBodyJson(AskBody);
        const answer = yield* services.ask.ask(body.question);
        return HttpServerResponse.jsonUnsafe(answer);
      }
      return HttpServerResponse.jsonUnsafe({ error: "NotFound" }, { status: 404 });
    });

    const response = yield* route.pipe(
      Effect.tapError((error) => Effect.logWarning("request failed", { path, error: error._tag })),
      Effect.catch((error) => Effect.succeed(errorResponse(error)))
    );
    return HttpServerResponse.setHeaders(response, cors);
  });
