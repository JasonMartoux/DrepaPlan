import { describe, expect, it } from "@effect/vitest";
import { Ask, ExtractiveAnswerGenerator } from "@drepaplan/cartridge-chatbot";
import { MedicalIngestion, MemoryHealthRecords, StaticStructurer, StaticTextExtractor } from "@drepaplan/cartridge-medical-parser";
import { MemoryDocumentStore, Uploads } from "@drepaplan/cartridge-storage";
import { DocumentKey } from "@drepaplan/domain";
import { Effect, Layer, Redacted } from "effect";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";

import { handleRequest } from "../src/routes.ts";

const documentKey = DocumentKey.make("documents/123e4567-e89b-42d3-a456-426614174000.pdf");
const token = "test-token";
const origin = "http://localhost:5173";

const extraction = {
  appointments: [{ dateTime: "2026-12-01T09:30", title: "Consultation", practitioner: "Dr. Saoudi" }],
  prescriptions: [],
};

const ServicesLayer = Layer.mergeAll(Uploads.layer, MedicalIngestion.layer, Ask.layer).pipe(
  Layer.provide(
    Layer.mergeAll(
      MemoryDocumentStore(new Map([[documentKey, new Uint8Array([1])]])),
      StaticTextExtractor("RDV Dr. Saoudi"),
      StaticStructurer(extraction),
      MemoryHealthRecords,
      ExtractiveAnswerGenerator
    )
  )
);

const call = (path: string, init: RequestInit & { readonly auth?: boolean } = {}) =>
  Effect.gen(function* () {
    const services = {
      uploads: yield* Uploads,
      ingestion: yield* MedicalIngestion,
      ask: yield* Ask,
      apiToken: Redacted.make(token),
      allowedOrigins: [origin],
    };
    const headers = new Headers(init.headers);
    headers.set("origin", origin);
    if (init.auth !== false) headers.set("authorization", `Bearer ${token}`);
    const request = new Request(`https://api.test${path}`, { ...init, headers });
    const response = yield* handleRequest(services).pipe(
      Effect.provideService(HttpServerRequest.HttpServerRequest, HttpServerRequest.fromWeb(request))
    );
    const web = HttpServerResponse.toWeb(response);
    return { status: web.status, headers: web.headers, body: web.status === 204 ? null : yield* Effect.promise(() => web.json()) };
  });

const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

const upload = (body: Uint8Array, contentType = "application/pdf", auth = true) =>
  call("/uploads", { method: "POST", body, headers: { "content-type": contentType }, auth });

const post = (path: string, body: unknown, auth = true) =>
  call(path, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" }, auth });

describe("api routes", () => {
  it.effect("serves health checks without a token", () =>
    Effect.gen(function* () {
      const response = yield* call("/health", { auth: false });
      expect(response.status).toBe(200);
      expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    }).pipe(Effect.provide(ServicesLayer))
  );

  it.effect("rejects missing or wrong tokens", () =>
    Effect.gen(function* () {
      expect((yield* upload(pdf, "application/pdf", false)).status).toBe(401);
      const wrong = yield* call("/ask", {
        method: "POST",
        body: JSON.stringify({ question: "hi" }),
        headers: { authorization: "Bearer nope" },
        auth: false,
      });
      expect(wrong.status).toBe(401);
    }).pipe(Effect.provide(ServicesLayer))
  );

  it.effect("stores uploads, ingests documents and answers questions", () =>
    Effect.gen(function* () {
      const stored = yield* upload(pdf);
      expect(stored).toMatchObject({ status: 201, body: { sizeBytes: pdf.byteLength } });
      expect(JSON.stringify(stored.body)).toMatch(/documents\/[0-9a-f-]{36}\.pdf/);

      const ingestion = yield* post("/ingestions", { documentKey });
      expect(ingestion).toMatchObject({ status: 200, body: { appointments: 1, prescriptions: 0 } });

      const answer = yield* post("/ask", { question: "When is my next appointment with Dr. Saoudi?" });
      expect(answer.status).toBe(200);
      expect(JSON.stringify(answer.body)).toContain("Dr. Saoudi");
    }).pipe(Effect.provide(ServicesLayer))
  );

  it.effect("maps domain failures to HTTP statuses", () =>
    Effect.gen(function* () {
      expect((yield* upload(pdf, "text/html")).status).toBe(415);
      expect((yield* upload(new Uint8Array())).status).toBe(413);
      expect((yield* post("/ingestions", { documentKey: "../secret" })).status).toBe(400);
      expect(
        (yield* post("/ingestions", { documentKey: "documents/00000000-0000-4000-8000-000000000000.pdf" })).status
      ).toBe(404);
      expect((yield* call("/nope", { method: "GET" })).status).toBe(404);
    }).pipe(Effect.provide(ServicesLayer))
  );
});
