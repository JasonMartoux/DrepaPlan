# DrepaPlan

Personal health records for appointments and prescriptions. Upload a PDF (appointment schedule, care plan, prescription); DrepaPlan extracts and structures it with Workers AI, stores it in D1 and Vectorize, and answers questions such as "When is my next appointment with Dr. Saoudi?".

Built on the [Rat Stack](https://ratstack.sh/) CAFE architecture: **C**loudflare, **A**lchemy, **F**oldkit, **E**ffect.

## Layout

| Package | Job | Cloudflare resources it owns |
| --- | --- | --- |
| `packages/domain` | `Appointment`, `Prescription`, `DocumentKey` schemas | none |
| `packages/cartridge-storage` | Validated PDF uploads stored through the Worker (`Uploads`), reading originals (`DocumentReader`) | R2 bucket `DrepaPlanDocuments` |
| `packages/cartridge-medical-parser` | Effect ingestion pipeline (`MedicalIngestion`): R2 → Workers AI `toMarkdown` → LLM JSON → Effect Schema → D1 + embeddings → Vectorize | D1 `DrepaPlanHealthRecords` (`migrations/`), Vectorize `DrepaPlanHealthRecordsIndex`, AI Gateway `drepaplan` |
| `packages/cartridge-chatbot` | RAG question answering (`Ask`) over Vectorize + D1 | uses the parser's index and database |
| `apps/api` | Cloudflare Worker composing the cartridges behind a bearer-token API | Worker `DrepaPlanApi` |
| `apps/web` | Foldkit UI: upload a PDF, ask questions | `Cloudflare.Website.Foldkit` |
| `apps/infra` | `alchemy.run.ts` Stack | everything above |

Each cartridge exposes Effect services (ports). `src/memory.ts` gives in-memory Layers for tests; `src/cloudflare.ts` declares the Alchemy resources and the binding-backed Layers. Every provider call in the pipeline runs under `withStagePolicy` (timeout + bounded exponential retry, permanent failures are not retried).

## API

All routes except `GET /health` require `Authorization: Bearer $DREPAPLAN_API_TOKEN`.

- `POST /uploads` with the raw PDF as body (`Content-Type: application/pdf`, max 20 MB, must start with `%PDF`) → `{ key, sizeBytes }`
- `POST /ingestions` `{ documentKey }` → `{ documentKey, appointments, prescriptions }`
- `POST /ask` `{ question }` → `{ answer, sources }`

## Development

Requires Node 24.18+ and pnpm 11.

```sh
pnpm install
pnpm typecheck   # strict tsc in every package
pnpm test        # vitest + @effect/vitest
pnpm build
```

Deploying needs Cloudflare credentials (see `.env.example`):

```sh
pnpm infra:plan
pnpm infra:deploy
```

Set `DREPAPLAN_ALLOWED_ORIGINS` (comma-separated) to the web origins allowed to call the API (CORS).

## Not yet covered

- Single-user: one shared API token, no accounts or per-user data isolation.
- Ingestion runs inside the request; long documents should move to a Queue or Workflow.
- Deleting a document does not yet remove its rows or vectors.
