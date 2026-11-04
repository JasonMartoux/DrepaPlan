import { DocumentReader, type DocumentNotFound, type DocumentReadFailed } from "@drepaplan/cartridge-storage";
import {
  type Appointment,
  AppointmentId,
  describeAppointment,
  describePrescription,
  type DocumentKey,
  type Prescription,
  PrescriptionId,
} from "@drepaplan/domain";
import { Context, Effect, Layer } from "effect";

import {
  type EmbeddingFailed,
  ExtractionInvalid,
  type RecordIndexFailed,
  type RecordStoreFailed,
  type StageTimedOut,
  type StructuringFailed,
  type TextExtractionFailed,
} from "./errors.ts";
import { type ExtractedAppointment, type ExtractedPrescription, parseExtraction } from "./extraction.ts";
import { Embedder, HealthRecordStore, type IndexedRecord, MedicalStructurer, MedicalTextExtractor, RecordIndex } from "./ports.ts";
import { withStagePolicy } from "./resilience.ts";

export interface IngestionReport {
  readonly documentKey: DocumentKey;
  readonly appointments: number;
  readonly prescriptions: number;
}

export type IngestionError =
  | DocumentNotFound
  | DocumentReadFailed
  | TextExtractionFailed
  | StructuringFailed
  | ExtractionInvalid
  | RecordStoreFailed
  | EmbeddingFailed
  | RecordIndexFailed
  | StageTimedOut;

const newId = Effect.sync(() => crypto.randomUUID());

const toAppointment = (extracted: ExtractedAppointment) =>
  Effect.map(
    newId,
    (id): Appointment => ({
      id: AppointmentId.make(id),
      dateTime: extracted.dateTime,
      agendaCode: extracted.agendaCode ?? null,
      title: extracted.title,
      practitioner: extracted.practitioner ?? null,
      comment: extracted.comment ?? null,
      durationMinutes: extracted.durationMinutes ?? null,
    })
  );

const toPrescription = (extracted: ExtractedPrescription) =>
  Effect.map(
    newId,
    (id): Prescription => ({
      id: PrescriptionId.make(id),
      medicationName: extracted.medicationName,
      dosage: extracted.dosage,
      frequency: extracted.frequency,
      duration: extracted.duration ?? null,
      instructions: extracted.instructions ?? null,
    })
  );

const makeMedicalIngestion = Effect.gen(function* () {
  const documents = yield* DocumentReader;
  const extractor = yield* MedicalTextExtractor;
  const structurer = yield* MedicalStructurer;
  const embedder = yield* Embedder;
  const store = yield* HealthRecordStore;
  const index = yield* RecordIndex;

  const ingest = Effect.fn("MedicalIngestion.ingest")(function* (documentKey: DocumentKey) {
    const pdf = yield* documents.read(documentKey).pipe(withStagePolicy("read", { timeout: "10 seconds", retries: 2 }));

    const text = yield* extractor
      .toText(documentKey, pdf)
      .pipe(withStagePolicy("extract", { timeout: "60 seconds", retries: 2 }));
    if (text.trim().length === 0) {
      return yield* new ExtractionInvalid({ message: "Document contains no extractable text" });
    }

    const extracted = yield* structurer
      .structure(text)
      .pipe(Effect.flatMap(parseExtraction), withStagePolicy("structure", { timeout: "90 seconds", retries: 1 }));

    const appointments = yield* Effect.forEach(extracted.appointments, toAppointment);
    const prescriptions = yield* Effect.forEach(extracted.prescriptions, toPrescription);

    yield* store
      .save({ appointments, prescriptions })
      .pipe(withStagePolicy("persist", { timeout: "15 seconds", retries: 2 }));

    const records = [
      ...appointments.map((appointment) => ({
        kind: "appointment" as const,
        recordId: appointment.id,
        text: describeAppointment(appointment),
      })),
      ...prescriptions.map((prescription) => ({
        kind: "prescription" as const,
        recordId: prescription.id,
        text: describePrescription(prescription),
      })),
    ];

    if (records.length > 0) {
      const vectors = yield* embedder
        .embed(records.map((record) => record.text))
        .pipe(withStagePolicy("embed", { timeout: "30 seconds", retries: 2 }));
      const indexed = records.flatMap((record, position): ReadonlyArray<IndexedRecord> => {
        const vector = vectors[position];
        return vector === undefined ? [] : [{ kind: record.kind, recordId: record.recordId, documentKey, vector }];
      });
      yield* index.upsert(indexed).pipe(withStagePolicy("index", { timeout: "15 seconds", retries: 2 }));
    }

    const report: IngestionReport = {
      documentKey,
      appointments: appointments.length,
      prescriptions: prescriptions.length,
    };
    return report;
  });

  return { ingest };
});

export class MedicalIngestion extends Context.Service<
  MedicalIngestion,
  {
    readonly ingest: (documentKey: DocumentKey) => Effect.Effect<IngestionReport, IngestionError>;
  }
>()("@drepaplan/cartridge-medical-parser/MedicalIngestion") {
  static readonly layer = Layer.effect(MedicalIngestion, makeMedicalIngestion);
}
