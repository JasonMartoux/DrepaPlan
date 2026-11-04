import { Effect, Schema } from "effect";
import { Command } from "foldkit";

import { ask, uploadAndIngest } from "./api.ts";
import { Message } from "./message.ts";

export const UploadDocument = Command.define("UploadDocument", {
  args: { token: Schema.String, file: Schema.instanceOf(File) },
  execute: ({ token, file }) =>
    uploadAndIngest(token, file).pipe(
      Effect.match({
        onFailure: (error) => Message.Failed({ message: error.message }),
        onSuccess: (report) => Message.Ingested(report),
      })
    ),
  messages: [Message.Ingested, Message.Failed],
});

export const AskQuestion = Command.define("AskQuestion", {
  args: { token: Schema.String, question: Schema.String },
  execute: ({ token, question }) =>
    ask(token, question).pipe(
      Effect.match({
        onFailure: (error) => Message.Failed({ message: error.message }),
        onSuccess: (answer) => Message.Answered({ answer }),
      })
    ),
  messages: [Message.Answered, Message.Failed],
});
