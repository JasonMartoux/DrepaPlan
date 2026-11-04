import { fileURLToPath } from "node:url";

import * as Cloudflare from "@alchemy.run/cloudflare";
import Api from "@drepaplan/api";
import { HealthAiGateway } from "@drepaplan/cartridge-medical-parser/cloudflare";
import * as Alchemy from "alchemy";
import * as Effect from "effect/Effect";

export default Alchemy.Stack(
  "DrepaPlan",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const gateway = yield* HealthAiGateway;
    const api = yield* Api;
    const web = yield* Cloudflare.Website.Foldkit("DrepaPlanWeb", {
      rootDir: fileURLToPath(new URL("../web/", import.meta.url)),
      env: { VITE_API_URL: api.url.as<string>() },
    });

    return {
      apiUrl: api.url,
      webUrl: web.url,
      aiGateway: gateway.gatewayId,
    };
  })
);
