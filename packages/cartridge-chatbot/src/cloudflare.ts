import * as Cloudflare from "@alchemy.run/cloudflare";
import { AiGatewayId } from "@drepaplan/cartridge-medical-parser/cloudflare";
import * as RuntimeContext from "alchemy/RuntimeContext";
import { Effect, Layer } from "effect";

import { AnswerFailed } from "./errors.ts";
import { AnswerGenerator } from "./ports.ts";

export const AnswerModel = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export const AnswerInstructions = [
  "You are DrepaPlan, an assistant that answers questions about the user's own appointments and prescriptions.",
  "Answer only from the records provided. If they do not contain the answer, say so.",
  "Never give medical advice or change a dosage; refer the user to their practitioner instead.",
  "Answer in the language of the question, concisely, with exact dates, times and dosages.",
].join("\n");

export const WorkersAiAnswerGenerator = Layer.effect(
  AnswerGenerator,
  Effect.gen(function* () {
    const ai = yield* Cloudflare.Workers.AI();
    return {
      answer: (prompt) =>
        ai
          .run(
            AnswerModel,
            {
              messages: [
                { role: "system", content: AnswerInstructions },
                {
                  role: "user",
                  content: `Current date and time: ${prompt.now}\n\nRecords:\n${prompt.context.join("\n\n")}\n\nQuestion: ${prompt.question}`,
                },
              ],
              temperature: 0.2,
              max_tokens: 512,
            },
            { gateway: { id: AiGatewayId, skipCache: true, collectLog: false } }
          )
          .pipe(
            Effect.provide(RuntimeContext.RuntimeContext.phantom),
            Effect.mapError((cause) => new AnswerFailed({ message: cause.message })),
            Effect.flatMap((output) =>
              "response" in output && typeof output.response === "string"
                ? Effect.succeed(output.response)
                : Effect.fail(new AnswerFailed({ message: "Model returned no response" }))
            )
          ),
    };
  })
).pipe(Layer.provide(Cloudflare.Workers.AIBinding));

export const ChatbotCloudflare = WorkersAiAnswerGenerator;
