# AGENTS.md

- Follow Rat Stack conventions (https://ratstack.sh/llms.txt): one job per cartridge, resources declared with Alchemy next to the code that uses them, provider code behind Effect services.
- Exact dependency pins only; keep versions aligned with `pnpm-workspace.yaml` and the root `package.json`.
- New behaviour goes behind a `Context.Service` port with an in-memory Layer in `src/memory.ts` and a Cloudflare Layer in `src/cloudflare.ts`.
- Tests use `@effect/vitest` (`it.effect`) and in-memory Layers; never call Cloudflare from unit tests.
- Before pushing: `pnpm typecheck && pnpm test && pnpm build`.
- Do not run `pnpm infra:deploy` without explicit approval.
