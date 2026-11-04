import { Effect, Schema } from "effect";

import { ExtractionInvalid } from "./errors.ts";

const OptionalText = Schema.optional(Schema.NullOr(Schema.String));

export const IsoDateTime = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/)
);

export const ExtractedAppointment = Schema.Struct({
  dateTime: IsoDateTime,
  agendaCode: OptionalText,
  title: Schema.String.check(Schema.isNonEmpty()),
  practitioner: OptionalText,
  comment: OptionalText,
  durationMinutes: Schema.optional(Schema.NullOr(Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 1440 })))),
});
export type ExtractedAppointment = typeof ExtractedAppointment.Type;

export const ExtractedPrescription = Schema.Struct({
  medicationName: Schema.String.check(Schema.isNonEmpty()),
  dosage: Schema.String.check(Schema.isNonEmpty()),
  frequency: Schema.String.check(Schema.isNonEmpty()),
  duration: OptionalText,
  instructions: OptionalText,
});
export type ExtractedPrescription = typeof ExtractedPrescription.Type;

export const ExtractedDocument = Schema.Struct({
  appointments: Schema.Array(ExtractedAppointment),
  prescriptions: Schema.Array(ExtractedPrescription),
});
export type ExtractedDocument = typeof ExtractedDocument.Type;

const decodeExtractedDocument = Schema.decodeUnknownEffect(ExtractedDocument);

export const parseExtraction = (output: unknown): Effect.Effect<ExtractedDocument, ExtractionInvalid> =>
  Effect.gen(function* () {
    const json =
      typeof output === "string"
        ? yield* Effect.try({
            try: (): unknown => JSON.parse(output),
            catch: () => new ExtractionInvalid({ message: "Model output is not valid JSON" }),
          })
        : output;
    return yield* decodeExtractedDocument(json).pipe(
      Effect.mapError((error) => new ExtractionInvalid({ message: error.message }))
    );
  });

export const ExtractionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["appointments", "prescriptions"],
  properties: {
    appointments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["dateTime", "title"],
        properties: {
          dateTime: { type: "string", description: "ISO 8601 local date-time, e.g. 2026-12-01T09:30" },
          agendaCode: { type: ["string", "null"] },
          title: { type: "string" },
          practitioner: { type: ["string", "null"] },
          comment: { type: ["string", "null"] },
          durationMinutes: { type: ["integer", "null"] },
        },
      },
    },
    prescriptions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["medicationName", "dosage", "frequency"],
        properties: {
          medicationName: { type: "string" },
          dosage: { type: "string" },
          frequency: { type: "string" },
          duration: { type: ["string", "null"] },
          instructions: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

export const ExtractionInstructions = [
  "You extract structured data from a patient's medical document (appointment schedule, care plan or prescription).",
  "Return only JSON matching the provided schema. Do not invent data: omit fields or use null when the document does not state them.",
  "Dates must be ISO 8601 (YYYY-MM-DDTHH:mm). Durations of appointments are integer minutes.",
  "Keep medication names, dosages and practitioner names exactly as written.",
].join("\n");
