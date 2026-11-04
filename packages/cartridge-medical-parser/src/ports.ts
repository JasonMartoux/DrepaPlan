import type { Appointment, AppointmentId, DocumentKey, Prescription, PrescriptionId } from "@drepaplan/domain";
import { Context, type Effect } from "effect";

import type {
  EmbeddingFailed,
  RecordIndexFailed,
  RecordStoreFailed,
  StructuringFailed,
  TextExtractionFailed,
} from "./errors.ts";

export class MedicalTextExtractor extends Context.Service<
  MedicalTextExtractor,
  {
    readonly toText: (name: string, pdf: Uint8Array) => Effect.Effect<string, TextExtractionFailed>;
  }
>()("@drepaplan/cartridge-medical-parser/MedicalTextExtractor") {}

export class MedicalStructurer extends Context.Service<
  MedicalStructurer,
  {
    readonly structure: (text: string) => Effect.Effect<unknown, StructuringFailed>;
  }
>()("@drepaplan/cartridge-medical-parser/MedicalStructurer") {}

export class Embedder extends Context.Service<
  Embedder,
  {
    readonly embed: (texts: ReadonlyArray<string>) => Effect.Effect<ReadonlyArray<ReadonlyArray<number>>, EmbeddingFailed>;
  }
>()("@drepaplan/cartridge-medical-parser/Embedder") {}

export interface HealthRecords {
  readonly appointments: ReadonlyArray<Appointment>;
  readonly prescriptions: ReadonlyArray<Prescription>;
}

export class HealthRecordStore extends Context.Service<
  HealthRecordStore,
  {
    readonly save: (records: HealthRecords) => Effect.Effect<void, RecordStoreFailed>;
    readonly findAppointments: (ids: ReadonlyArray<AppointmentId>) => Effect.Effect<ReadonlyArray<Appointment>, RecordStoreFailed>;
    readonly findPrescriptions: (ids: ReadonlyArray<PrescriptionId>) => Effect.Effect<ReadonlyArray<Prescription>, RecordStoreFailed>;
    readonly upcomingAppointments: (from: string, limit: number) => Effect.Effect<ReadonlyArray<Appointment>, RecordStoreFailed>;
  }
>()("@drepaplan/cartridge-medical-parser/HealthRecordStore") {}

export type RecordKind = "appointment" | "prescription";

export interface IndexedRecord {
  readonly kind: RecordKind;
  readonly recordId: string;
  readonly documentKey: DocumentKey;
  readonly vector: ReadonlyArray<number>;
}

export interface RecordMatch {
  readonly kind: RecordKind;
  readonly recordId: string;
  readonly score: number;
}

export class RecordIndex extends Context.Service<
  RecordIndex,
  {
    readonly upsert: (records: ReadonlyArray<IndexedRecord>) => Effect.Effect<void, RecordIndexFailed>;
    readonly query: (vector: ReadonlyArray<number>, topK: number) => Effect.Effect<ReadonlyArray<RecordMatch>, RecordIndexFailed>;
  }
>()("@drepaplan/cartridge-medical-parser/RecordIndex") {}
