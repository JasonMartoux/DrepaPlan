import type { Appointment, Prescription } from "@drepaplan/domain";
import { Effect, Layer, Ref } from "effect";

import { Embedder, HealthRecordStore, MedicalStructurer, MedicalTextExtractor, RecordIndex, type IndexedRecord } from "./ports.ts";

export const StaticTextExtractor = (text: string) =>
  Layer.succeed(MedicalTextExtractor, { toText: () => Effect.succeed(text) });

export const StaticStructurer = (output: unknown) =>
  Layer.succeed(MedicalStructurer, { structure: () => Effect.succeed(output) });

export const HashingEmbedderDimensions = 64;

export const embedText = (text: string): ReadonlyArray<number> => {
  const vector = Array.from({ length: HashingEmbedderDimensions }, () => 0);
  for (const token of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (token.length === 0) continue;
    let hash = 0;
    for (const char of token) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
    const slot = hash % HashingEmbedderDimensions;
    vector[slot] = (vector[slot] ?? 0) + 1;
  }
  return vector;
};

export const HashingEmbedder = Layer.succeed(Embedder, {
  embed: (texts) => Effect.succeed(texts.map(embedText)),
});

export const MemoryHealthRecordStore = Layer.effect(
  HealthRecordStore,
  Effect.gen(function* () {
    const appointments = yield* Ref.make(new Map<string, Appointment>());
    const prescriptions = yield* Ref.make(new Map<string, Prescription>());
    return {
      save: (records) =>
        Effect.all([
          Ref.update(appointments, (current) => new Map([...current, ...records.appointments.map((a) => [a.id, a] as const)])),
          Ref.update(prescriptions, (current) => new Map([...current, ...records.prescriptions.map((p) => [p.id, p] as const)])),
        ]).pipe(Effect.asVoid),
      findAppointments: (ids) =>
        Ref.get(appointments).pipe(Effect.map((current) => ids.flatMap((id) => current.get(id) ?? []))),
      findPrescriptions: (ids) =>
        Ref.get(prescriptions).pipe(Effect.map((current) => ids.flatMap((id) => current.get(id) ?? []))),
      upcomingAppointments: (from, limit) =>
        Ref.get(appointments).pipe(
          Effect.map((current) =>
            [...current.values()]
              .filter((appointment) => appointment.dateTime >= from)
              .sort((left, right) => left.dateTime.localeCompare(right.dateTime))
              .slice(0, limit)
          )
        ),
    };
  })
);

const cosine = (left: ReadonlyArray<number>, right: ReadonlyArray<number>): number => {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  left.forEach((value, position) => {
    const other = right[position] ?? 0;
    dot += value * other;
    leftNorm += value * value;
    rightNorm += other * other;
  });
  return leftNorm === 0 || rightNorm === 0 ? 0 : dot / Math.sqrt(leftNorm * rightNorm);
};

export const MemoryRecordIndex = Layer.effect(
  RecordIndex,
  Effect.gen(function* () {
    const entries = yield* Ref.make(new Map<string, IndexedRecord>());
    return {
      upsert: (records) =>
        Ref.update(entries, (current) => new Map([...current, ...records.map((record) => [`${record.kind}:${record.recordId}`, record] as const)])),
      query: (vector, topK) =>
        Ref.get(entries).pipe(
          Effect.map((current) =>
            [...current.values()]
              .map((record) => ({ kind: record.kind, recordId: record.recordId, score: cosine(vector, record.vector) }))
              .sort((left, right) => right.score - left.score)
              .slice(0, topK)
          )
        ),
    };
  })
);

export const MemoryHealthRecords = Layer.mergeAll(MemoryHealthRecordStore, MemoryRecordIndex, HashingEmbedder);
