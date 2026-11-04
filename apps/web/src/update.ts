import type { Update } from "foldkit";

import { AskQuestion, UploadDocument } from "./command.ts";
import { Message } from "./message.ts";
import type { Model } from "./model.ts";

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ChangedToken: ({ token }) => ({ model: { ...model, token } }),
    ChangedQuestion: ({ question }) => ({ model: { ...model, question } }),
    ChoseFiles: ({ files }) => {
      const file = files[0];
      if (file === undefined || model.status !== "idle") return { model };
      if (file.type !== "application/pdf") {
        return { model: { ...model, error: "Choose a PDF document.", notice: null } };
      }
      return {
        model: { ...model, status: "uploading", error: null, notice: `Reading ${file.name}…` },
        commands: [UploadDocument({ token: model.token, file })],
      };
    },
    SubmittedQuestion: () => {
      const question = model.question.trim();
      if (question.length === 0 || model.status !== "idle") return { model };
      return {
        model: { ...model, status: "asking", error: null },
        commands: [AskQuestion({ token: model.token, question })],
      };
    },
    Ingested: ({ appointments, prescriptions }) => ({
      model: {
        ...model,
        status: "idle",
        notice: `Added ${appointments} appointment(s) and ${prescriptions} prescription(s).`,
      },
    }),
    Answered: ({ answer }) => ({
      model: {
        ...model,
        status: "idle",
        question: "",
        conversation: [...model.conversation, { question: model.question.trim(), answer }],
      },
    }),
    Failed: ({ message }) => ({ model: { ...model, status: "idle", error: message, notice: null } }),
  });
