import {
  AppointmentId,
  describeAppointment,
  describePrescription,
  type Appointment,
  type Prescription,
  PrescriptionId,
} from "@drepaplan/domain";
import {
  Embedder,
  type EmbeddingFailed,
  HealthRecordStore,
  RecordIndex,
  type RecordIndexFailed,
  type RecordStoreFailed,
  type StageTimedOut,
  withStagePolicy,
} from "@drepaplan/cartridge-medical-parser";
import { Clock, Context, Effect, Layer } from "effect";

import { type AnswerFailed, QuestionInvalid } from "./errors.ts";
import { AnswerGenerator } from "./ports.ts";

export const MaxQuestionLength = 500;
export const RetrievedRecords = 8;
export const UpcomingAppointments = 5;
export const NoRecordsAnswer = "I could not find any appointment or prescription in your documents yet.";

export type Source =
  | { readonly kind: "appointment"; readonly record: Appointment }
  | { readonly kind: "prescription"; readonly record: Prescription };

export interface Answer {
  readonly answer: string;
  readonly sources: ReadonlyArray<Source>;
}

export type AskError =
  | QuestionInvalid
  | EmbeddingFailed
  | RecordIndexFailed
  | RecordStoreFailed
  | AnswerFailed
  | StageTimedOut;

const describeSource = (source: Source): string =>
  source.kind === "appointment" ? describeAppointment(source.record) : describePrescription(source.record);

const makeAsk = Effect.gen(function* () {
  const embedder = yield* Embedder;
  const index = yield* RecordIndex;
  const store = yield* HealthRecordStore;
  const generator = yield* AnswerGenerator;

  const ask = Effect.fn("Ask.ask")(function* (rawQuestion: string) {
    const question = rawQuestion.trim();
    if (question.length === 0 || question.length > MaxQuestionLength) {
      return yield* new QuestionInvalid({ message: `Questions must contain 1 to ${MaxQuestionLength} characters` });
    }

    const now = new Date(yield* Clock.currentTimeMillis).toISOString().slice(0, 16);

    const [vector] = yield* embedder
      .embed([question])
      .pipe(withStagePolicy("embed-question", { timeout: "15 seconds", retries: 2 }));
    const matches =
      vector === undefined
        ? []
        : yield* index.query(vector, RetrievedRecords).pipe(withStagePolicy("retrieve", { timeout: "10 seconds", retries: 2 }));

    const policy = withStagePolicy("load-records", { timeout: "10 seconds", retries: 2 });
    const [matchedAppointments, prescriptions, upcoming] = yield* Effect.all(
      [
        store
          .findAppointments(matches.filter((match) => match.kind === "appointment").map((match) => AppointmentId.make(match.recordId)))
          .pipe(policy),
        store
          .findPrescriptions(matches.filter((match) => match.kind === "prescription").map((match) => PrescriptionId.make(match.recordId)))
          .pipe(policy),
        store.upcomingAppointments(now, UpcomingAppointments).pipe(policy),
      ],
      { concurrency: "unbounded" }
    );

    const appointments = [...new Map([...upcoming, ...matchedAppointments].map((record) => [record.id, record])).values()];
    const sources: ReadonlyArray<Source> = [
      ...appointments.map((record) => ({ kind: "appointment" as const, record })),
      ...prescriptions.map((record) => ({ kind: "prescription" as const, record })),
    ];

    if (sources.length === 0) {
      const empty: Answer = { answer: NoRecordsAnswer, sources };
      return empty;
    }

    const answer = yield* generator
      .answer({ question, now, context: sources.map(describeSource) })
      .pipe(withStagePolicy("answer", { timeout: "45 seconds", retries: 1 }));

    const result: Answer = { answer, sources };
    return result;
  });

  return { ask };
});

export class Ask extends Context.Service<
  Ask,
  {
    readonly ask: (question: string) => Effect.Effect<Answer, AskError>;
  }
>()("@drepaplan/cartridge-chatbot/Ask") {
  static readonly layer = Layer.effect(Ask, makeAsk);
}
