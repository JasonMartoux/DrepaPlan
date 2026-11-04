import { Context, type Effect } from "effect";

import type { AnswerFailed } from "./errors.ts";

export interface AnswerPrompt {
  readonly question: string;
  readonly now: string;
  readonly context: ReadonlyArray<string>;
}

export class AnswerGenerator extends Context.Service<
  AnswerGenerator,
  {
    readonly answer: (prompt: AnswerPrompt) => Effect.Effect<string, AnswerFailed>;
  }
>()("@drepaplan/cartridge-chatbot/AnswerGenerator") {}
