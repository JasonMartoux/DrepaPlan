import { Effect, Layer } from "effect";

import { AnswerGenerator } from "./ports.ts";

export const ExtractiveAnswerGenerator = Layer.succeed(AnswerGenerator, {
  answer: (prompt) => Effect.succeed(prompt.context[0] ?? ""),
});
