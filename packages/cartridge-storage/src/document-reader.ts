import type { DocumentKey } from "@drepaplan/domain";
import { Context, type Effect } from "effect";

import type { DocumentNotFound, DocumentReadFailed } from "./errors.ts";

export class DocumentReader extends Context.Service<
  DocumentReader,
  {
    readonly read: (key: DocumentKey) => Effect.Effect<Uint8Array, DocumentNotFound | DocumentReadFailed>;
  }
>()("@drepaplan/cartridge-storage/DocumentReader") {}
