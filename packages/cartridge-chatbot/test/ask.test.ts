import { describe, expect, it } from "@effect/vitest";
import { HealthRecordStore, MemoryHealthRecords, RecordIndex, embedText } from "@drepaplan/cartridge-medical-parser";
import { type Appointment, AppointmentId, DocumentKey, type Prescription, PrescriptionId } from "@drepaplan/domain";
import { Effect, Layer } from "effect";
import { TestClock } from "effect/testing";

import { Ask, ExtractiveAnswerGenerator, NoRecordsAnswer } from "../src/index.ts";

const documentKey = DocumentKey.make("documents/123e4567-e89b-42d3-a456-426614174000.pdf");

const appointment = (id: string, dateTime: string, practitioner: string): Appointment => ({
  id: AppointmentId.make(id),
  dateTime,
  agendaCode: null,
  title: "Consultation",
  practitioner,
  comment: null,
  durationMinutes: 30,
});

const prescription: Prescription = {
  id: PrescriptionId.make("p-1"),
  medicationName: "Hydroxyurée",
  dosage: "500 mg",
  frequency: "1 fois par jour",
  duration: null,
  instructions: null,
};

const TestAsk = Ask.layer.pipe(Layer.provideMerge(Layer.mergeAll(MemoryHealthRecords, ExtractiveAnswerGenerator)));

const seed = Effect.gen(function* () {
  yield* TestClock.setTime(Date.parse("2026-11-04T08:00:00Z"));
  const store = yield* HealthRecordStore;
  const index = yield* RecordIndex;
  const records = {
    appointments: [
      appointment("a-past", "2026-10-01T10:00", "Dr. Saoudi"),
      appointment("a-next", "2026-12-01T09:30", "Dr. Saoudi"),
      appointment("a-other", "2026-11-20T14:00", "Dr. Martin"),
    ],
    prescriptions: [prescription],
  };
  yield* store.save(records);
  yield* index.upsert([
    ...records.appointments.map((record) => ({
      kind: "appointment" as const,
      recordId: record.id,
      documentKey,
      vector: embedText(`Consultation ${record.practitioner} ${record.dateTime}`),
    })),
    { kind: "prescription" as const, recordId: prescription.id, documentKey, vector: embedText("Hydroxyurée 500 mg") },
  ]);
});

describe("Ask", () => {
  it.effect("grounds answers in upcoming appointments and semantic matches", () =>
    Effect.gen(function* () {
      yield* seed;
      const ask = yield* Ask;
      const result = yield* ask.ask("When is my next appointment with Dr. Saoudi?");
      const ids = result.sources.map((source) => source.record.id);
      expect(ids).toContain("a-next");
      expect(ids).toContain("a-other");
      expect(result.answer).toContain("Appointment:");
    }).pipe(Effect.provide(TestAsk))
  );

  it.effect("retrieves prescriptions by meaning", () =>
    Effect.gen(function* () {
      yield* seed;
      const ask = yield* Ask;
      const result = yield* ask.ask("Quelle est ma dose de Hydroxyurée ?");
      expect(result.sources.some((source) => source.kind === "prescription")).toBe(true);
    }).pipe(Effect.provide(TestAsk))
  );

  it.effect("answers without calling the model when there are no records", () =>
    Effect.gen(function* () {
      const ask = yield* Ask;
      const result = yield* ask.ask("Next appointment?");
      expect(result).toEqual({ answer: NoRecordsAnswer, sources: [] });
    }).pipe(Effect.provide(TestAsk))
  );

  it.effect("rejects empty and oversized questions", () =>
    Effect.gen(function* () {
      const ask = yield* Ask;
      expect((yield* Effect.flip(ask.ask("   ")))._tag).toBe("QuestionInvalid");
      expect((yield* Effect.flip(ask.ask("x".repeat(501))))._tag).toBe("QuestionInvalid");
    }).pipe(Effect.provide(TestAsk))
  );
});
