import { Schema } from "effect";
import { defineMessageUnion } from "foldkit/message";

export const Message = defineMessageUnion({
  ChangedToken: { token: Schema.String },
  ChoseFiles: { files: Schema.Array(Schema.instanceOf(File)) },
  ChangedQuestion: { question: Schema.String },
  SubmittedQuestion: {},
  Ingested: { appointments: Schema.Number, prescriptions: Schema.Number },
  Answered: { answer: Schema.String },
  Failed: { message: Schema.String },
});
export type Message = typeof Message.Type;
