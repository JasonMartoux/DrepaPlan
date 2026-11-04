import { fileURLToPath } from "node:url";

import * as Cloudflare from "@alchemy.run/cloudflare";
import {
  type Appointment,
  appointmentFromRow,
  appointmentToRow,
  AppointmentRow,
  type Prescription,
  prescriptionFromRow,
  prescriptionToRow,
  PrescriptionRow,
} from "@drepaplan/domain";
import { retain } from "alchemy/RemovalPolicy";
import * as RuntimeContext from "alchemy/RuntimeContext";
import { Effect, Layer, Schema } from "effect";

import { EmbeddingFailed, RecordIndexFailed, RecordStoreFailed, StructuringFailed, TextExtractionFailed } from "./errors.ts";
import { ExtractionInstructions, ExtractionJsonSchema } from "./extraction.ts";
import {
  Embedder,
  HealthRecordStore,
  MedicalStructurer,
  MedicalTextExtractor,
  RecordIndex,
  type RecordKind,
  type RecordMatch,
} from "./ports.ts";

export const EmbeddingModel = "@cf/baai/bge-m3";
export const EmbeddingDimensions = 1024;
export const StructuringModel = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
export const AiGatewayId = "drepaplan";

export const HealthRecordsDatabase = Cloudflare.D1.Database("DrepaPlanHealthRecords", {
  migrations: fileURLToPath(new URL("../migrations/", import.meta.url)),
}).pipe(retain());

export const HealthRecordsIndex = Cloudflare.Vectorize.Index("DrepaPlanHealthRecordsIndex", {
  dimensions: EmbeddingDimensions,
  metric: "cosine",
  description: "Semantic index of DrepaPlan appointments and prescriptions",
}).pipe(retain());

export const HealthAiGateway = Cloudflare.AI.Gateway("DrepaPlanAiGateway", {
  id: AiGatewayId,
  collectLogs: false,
  cacheTtl: null,
  rateLimitingInterval: 60,
  rateLimitingLimit: 120,
  rateLimitingTechnique: "sliding",
});

const gateway = { gateway: { id: AiGatewayId, skipCache: true, collectLog: false } };

const message = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

const phantom = <A, E>(effect: Effect.Effect<A, E, RuntimeContext.RuntimeContext>) =>
  Effect.provide(effect, RuntimeContext.RuntimeContext.phantom);

const ConversionResult = Schema.Union([
  Schema.Struct({ format: Schema.Literal("error"), error: Schema.String }),
  Schema.Struct({ format: Schema.Literals(["markdown", "text"]), data: Schema.String }),
]);

const decodeConversion = (output: unknown) =>
  Schema.decodeUnknownEffect(ConversionResult)(output).pipe(
    Effect.mapError((cause) => new TextExtractionFailed({ message: cause.message }))
  );

export const WorkersAiTextExtractor = Layer.effect(
  MedicalTextExtractor,
  Effect.gen(function* () {
    const ai = yield* Cloudflare.Workers.AI();
    return {
      toText: (name, pdf) =>
        phantom(ai.raw).pipe(
          Effect.flatMap((binding) =>
            Effect.tryPromise({
              try: () => binding.toMarkdown({ name, blob: new Blob([new Uint8Array(pdf)], { type: "application/pdf" }) }),
              catch: (cause) => new TextExtractionFailed({ message: message(cause) }),
            })
          ),
          Effect.flatMap(decodeConversion),
          Effect.flatMap((result) =>
            result.format === "error"
              ? Effect.fail(new TextExtractionFailed({ message: result.error }))
              : Effect.succeed(result.data)
          )
        ),
    };
  })
).pipe(Layer.provide(Cloudflare.Workers.AIBinding));

export const WorkersAiStructurer = Layer.effect(
  MedicalStructurer,
  Effect.gen(function* () {
    const ai = yield* Cloudflare.Workers.AI();
    return {
      structure: (text) =>
        phantom(
          ai.run(
            StructuringModel,
            {
              messages: [
                { role: "system", content: ExtractionInstructions },
                { role: "user", content: text },
              ],
              response_format: { type: "json_schema", json_schema: ExtractionJsonSchema },
              temperature: 0,
              max_tokens: 4096,
            },
            gateway
          )
        ).pipe(
          Effect.mapError((cause) => new StructuringFailed({ message: cause.message })),
          Effect.flatMap((output) =>
            "response" in output
              ? Effect.succeed<unknown>(output.response)
              : Effect.fail(new StructuringFailed({ message: "Model returned no response" }))
          )
        ),
    };
  })
).pipe(Layer.provide(Cloudflare.Workers.AIBinding));

export const WorkersAiEmbedder = Layer.effect(
  Embedder,
  Effect.gen(function* () {
    const ai = yield* Cloudflare.Workers.AI();
    return {
      embed: (texts) =>
        phantom(ai.run(EmbeddingModel, { text: [...texts] }, gateway)).pipe(
          Effect.mapError((cause) => new EmbeddingFailed({ message: cause.message })),
          Effect.flatMap((output) =>
            "data" in output && output.data !== undefined && output.data.length === texts.length
              ? Effect.succeed(output.data)
              : Effect.fail(new EmbeddingFailed({ message: "Embedding model returned an unexpected shape" }))
          )
        ),
    };
  })
).pipe(Layer.provide(Cloudflare.Workers.AIBinding));

const decodeAppointmentRows = Schema.decodeUnknownEffect(Schema.Array(AppointmentRow));
const decodePrescriptionRows = Schema.decodeUnknownEffect(Schema.Array(PrescriptionRow));

const placeholders = (count: number) => Array.from({ length: count }, () => "?").join(", ");

export const D1HealthRecordStore = Layer.effect(
  HealthRecordStore,
  Effect.gen(function* () {
    const database = yield* HealthRecordsDatabase;
    const client = yield* Cloudflare.D1.QueryDatabase(database);

    const storeFailure = <A, E extends { readonly message: string }>(effect: Effect.Effect<A, E, RuntimeContext.RuntimeContext>) =>
      phantom(effect).pipe(
        Effect.mapError((cause) => new RecordStoreFailed({ message: cause.message })),
        Effect.catchDefect((defect) => Effect.fail(new RecordStoreFailed({ message: message(defect) })))
      );

    const insertAppointment = (appointment: Appointment) => {
      const row = appointmentToRow(appointment);
      return client
        .prepare(
          "INSERT INTO appointments (id, date_time, agenda_code, title, practitioner, comment, duration) VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(row.id, row.date_time, row.agenda_code, row.title, row.practitioner, row.comment, row.duration);
    };

    const insertPrescription = (prescription: Prescription) => {
      const row = prescriptionToRow(prescription);
      return client
        .prepare(
          "INSERT INTO prescriptions (id, medication_name, dosage, frequency, duration, instructions) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(row.id, row.medication_name, row.dosage, row.frequency, row.duration, row.instructions);
    };

    const selectRows = (sql: string, values: ReadonlyArray<string | number>) =>
      client
        .prepare(sql)
        .bind(...values)
        .all()
        .pipe(Effect.map((result) => result.results));

    return {
      save: (records) => {
        const statements = [...records.appointments.map(insertAppointment), ...records.prescriptions.map(insertPrescription)];
        return statements.length === 0 ? Effect.void : storeFailure(client.batch(statements).pipe(Effect.asVoid));
      },
      findAppointments: (ids) =>
        ids.length === 0
          ? Effect.succeed([])
          : storeFailure(
              selectRows(`SELECT * FROM appointments WHERE id IN (${placeholders(ids.length)})`, ids).pipe(
                Effect.flatMap(decodeAppointmentRows),
                Effect.map((rows) => rows.map(appointmentFromRow))
              )
            ),
      findPrescriptions: (ids) =>
        ids.length === 0
          ? Effect.succeed([])
          : storeFailure(
              selectRows(`SELECT * FROM prescriptions WHERE id IN (${placeholders(ids.length)})`, ids).pipe(
                Effect.flatMap(decodePrescriptionRows),
                Effect.map((rows) => rows.map(prescriptionFromRow))
              )
            ),
      upcomingAppointments: (from, limit) =>
        storeFailure(
          selectRows("SELECT * FROM appointments WHERE date_time >= ? ORDER BY date_time ASC LIMIT ?", [from, limit]).pipe(
            Effect.flatMap(decodeAppointmentRows),
            Effect.map((rows) => rows.map(appointmentFromRow))
          )
        ),
    };
  })
).pipe(Layer.provide(Cloudflare.D1.QueryDatabaseBinding));

const parseVectorId = (id: string, score: number): ReadonlyArray<RecordMatch> => {
  const [kind, recordId] = id.split(":");
  const isKind = (value: string | undefined): value is RecordKind => value === "appointment" || value === "prescription";
  return isKind(kind) && recordId !== undefined ? [{ kind, recordId, score }] : [];
};

export const VectorizeRecordIndex = Layer.effect(
  RecordIndex,
  Effect.gen(function* () {
    const index = yield* HealthRecordsIndex;
    const search = yield* Cloudflare.Vectorize.SearchIndex(index);
    const indexFailure = Effect.catchDefect((defect) => Effect.fail(new RecordIndexFailed({ message: message(defect) })));
    return {
      upsert: (records) =>
        records.length === 0
          ? Effect.void
          : search
              .upsert(
                records.map((record) => ({
                  id: `${record.kind}:${record.recordId}`,
                  values: [...record.vector],
                  metadata: { kind: record.kind, recordId: record.recordId, documentKey: record.documentKey },
                }))
              )
              .pipe(Effect.asVoid, indexFailure),
      query: (vector, topK) =>
        search
          .query([...vector], { topK })
          .pipe(
            Effect.map((result) => result.matches.flatMap((match) => parseVectorId(match.id, match.score))),
            indexFailure
          ),
    };
  })
).pipe(Layer.provide(Cloudflare.Vectorize.SearchIndexBinding));

export const MedicalParserCloudflare = Layer.mergeAll(
  WorkersAiTextExtractor,
  WorkersAiStructurer,
  WorkersAiEmbedder,
  D1HealthRecordStore,
  VectorizeRecordIndex
);
