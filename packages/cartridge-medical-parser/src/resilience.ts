import { Duration, Effect, Schedule } from "effect";

import { StageTimedOut } from "./errors.ts";

const PermanentFailures: ReadonlySet<string> = new Set(["DocumentNotFound", "UnsupportedDocument"]);

const isTransient = (error: unknown): boolean =>
  !(typeof error === "object" && error !== null && "_tag" in error && typeof error._tag === "string" && PermanentFailures.has(error._tag));

export interface StagePolicy {
  readonly timeout: Duration.Input;
  readonly retries: number;
}

export const withStagePolicy =
  (stage: string, policy: StagePolicy) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E | StageTimedOut, R> =>
    effect.pipe(
      Effect.timeoutOrElse({
        duration: policy.timeout,
        orElse: () => Effect.fail(new StageTimedOut({ stage })),
      }),
      Effect.retry({
        times: policy.retries,
        while: isTransient,
        schedule: Schedule.exponential("250 millis", 2),
      }),
      Effect.withSpan(`MedicalIngestion.${stage}`)
    );
