import { describe, expect, it } from "@effect/vitest";
import { MemoryDocumentReader } from "@drepaplan/cartridge-storage";
import { DocumentKey } from "@drepaplan/domain";
import { Effect, Fiber, Layer, Ref } from "effect";
import { TestClock } from "effect/testing";

import {
  embedText,
  HealthRecordStore,
  MedicalIngestion,
  MedicalStructurer,
  MemoryHealthRecords,
  parseExtraction,
  RecordIndex,
  StaticStructurer,
  StaticTextExtractor,
} from "../src/index.ts";

const documentKey = DocumentKey.make("documents/123e4567-e89b-42d3-a456-426614174000.pdf");

const extraction = {
  appointments: [
    {
      dateTime: "2026-12-01T09:30",
      agendaCode: "HEM-12",
      title: "Consultation hématologie",
      practitioner: "Dr. Saoudi",
      durationMinutes: 30,
    },
  ],
  prescriptions: [
    {
      medicationName: "Hydroxyurée",
      dosage: "500 mg",
      frequency: "1 fois par jour",
      duration: "3 mois",
      instructions: null,
    },
  ],
};

const ingestionLayer = (structurer: Layer.Layer<MedicalStructurer>) =>
  MedicalIngestion.layer.pipe(
    Layer.provideMerge(MemoryHealthRecords),
    Layer.provide(
      Layer.mergeAll(
        MemoryDocumentReader(new Map([[documentKey, new Uint8Array([37, 80, 68, 70])]])),
        StaticTextExtractor("RDV 01/12/2026 9h30 Dr. Saoudi — Hydroxyurée 500 mg"),
        structurer
      )
    )
  );

describe("parseExtraction", () => {
  it.effect("decodes JSON strings and fills missing optional fields", () =>
    Effect.gen(function* () {
      const parsed = yield* parseExtraction(JSON.stringify(extraction));
      expect(parsed.appointments[0]?.practitioner).toBe("Dr. Saoudi");
      expect(parsed.appointments[0]?.comment).toBeUndefined();
    })
  );

  it.effect("rejects invalid JSON and schema violations", () =>
    Effect.gen(function* () {
      const notJson = yield* Effect.flip(parseExtraction("{oops"));
      expect(notJson._tag).toBe("ExtractionInvalid");
      const badDate = yield* Effect.flip(
        parseExtraction({ appointments: [{ dateTime: "next tuesday", title: "x" }], prescriptions: [] })
      );
      expect(badDate._tag).toBe("ExtractionInvalid");
    })
  );
});

describe("MedicalIngestion", () => {
  it.effect("extracts, validates, persists and indexes a document", () =>
    Effect.gen(function* () {
      const ingestion = yield* MedicalIngestion;
      const report = yield* ingestion.ingest(documentKey);
      expect(report).toEqual({ documentKey, appointments: 1, prescriptions: 1 });

      const store = yield* HealthRecordStore;
      const upcoming = yield* store.upcomingAppointments("2026-11-04T00:00", 5);
      expect(upcoming.map((appointment) => appointment.practitioner)).toEqual(["Dr. Saoudi"]);
      expect(upcoming[0]?.comment).toBeNull();

      const index = yield* RecordIndex;
      const matches = yield* index.query(embedText("Hydroxyurée dosage"), 1);
      expect(matches[0]?.kind).toBe("prescription");
    }).pipe(Effect.provide(ingestionLayer(StaticStructurer(extraction))))
  );

  it.effect("fails with DocumentNotFound without retrying", () =>
    Effect.gen(function* () {
      const ingestion = yield* MedicalIngestion;
      const error = yield* Effect.flip(
        ingestion.ingest(DocumentKey.make("documents/00000000-0000-4000-8000-000000000000.pdf"))
      );
      expect(error._tag).toBe("DocumentNotFound");
    }).pipe(Effect.provide(ingestionLayer(StaticStructurer(extraction))))
  );

  it.effect("retries the structuring stage once when the model output is invalid", () =>
    Effect.gen(function* () {
      const calls = yield* Ref.make(0);
      const flaky = Layer.succeed(MedicalStructurer, {
        structure: () =>
          Ref.getAndUpdate(calls, (count) => count + 1).pipe(
            Effect.map((count) => (count === 0 ? "not json" : extraction))
          ),
      });
      const report = yield* Effect.gen(function* () {
        const ingestion = yield* MedicalIngestion;
        const fiber = yield* Effect.forkChild(ingestion.ingest(documentKey));
        yield* TestClock.adjust("1 second");
        return yield* Fiber.join(fiber);
      }).pipe(Effect.provide(ingestionLayer(flaky)));
      expect(report.appointments).toBe(1);
      expect(yield* Ref.get(calls)).toBe(2);
    })
  );

  it.effect("times out a hung structuring call", () =>
    Effect.gen(function* () {
      const hung = Layer.succeed(MedicalStructurer, { structure: () => Effect.never });
      const error = yield* Effect.gen(function* () {
        const ingestion = yield* MedicalIngestion;
        const fiber = yield* Effect.forkChild(Effect.flip(ingestion.ingest(documentKey)));
        yield* TestClock.adjust("10 minutes");
        return yield* Fiber.join(fiber);
      }).pipe(Effect.provide(ingestionLayer(hung)));
      expect(error).toMatchObject({ _tag: "StageTimedOut", stage: "structure" });
    })
  );
});
