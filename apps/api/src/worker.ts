import * as Cloudflare from "@alchemy.run/cloudflare";
import { Ask } from "@drepaplan/cartridge-chatbot";
import { ChatbotCloudflare } from "@drepaplan/cartridge-chatbot/cloudflare";
import { MedicalIngestion } from "@drepaplan/cartridge-medical-parser";
import { MedicalParserCloudflare } from "@drepaplan/cartridge-medical-parser/cloudflare";
import { Uploads } from "@drepaplan/cartridge-storage";
import { StorageCloudflare } from "@drepaplan/cartridge-storage/cloudflare";
import { Config, Effect, Layer } from "effect";

import { handleRequest } from "./routes.ts";

const CartridgeLayer = Layer.mergeAll(Uploads.layer, MedicalIngestion.layer, Ask.layer).pipe(
  Layer.provide(Layer.mergeAll(StorageCloudflare, MedicalParserCloudflare, ChatbotCloudflare))
);

export default Cloudflare.Worker(
  "DrepaPlanApi",
  {
    main: import.meta.url,
    compatibility: { date: "2026-11-04", flags: ["nodejs_compat"] },
    observability: { enabled: true, traces: { enabled: true } },
  },
  Effect.gen(function* () {
    const apiToken = yield* Config.Redacted("DREPAPLAN_API_TOKEN");
    const allowedOrigins = (yield* Config.String("DREPAPLAN_ALLOWED_ORIGINS"))
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin !== "");
    const uploads = yield* Uploads;
    const ingestion = yield* MedicalIngestion;
    const ask = yield* Ask;
    return {
      fetch: handleRequest({ uploads, ingestion, ask, apiToken, allowedOrigins }),
    };
  }).pipe(Effect.provide(CartridgeLayer))
);
