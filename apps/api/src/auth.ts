import { Effect, Redacted } from "effect";

const sha256 = (value: string) =>
  Effect.promise(() => crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))).pipe(
    Effect.map((buffer) => new Uint8Array(buffer))
  );

export const tokenMatches = (presented: string, expected: Redacted.Redacted<string>) =>
  Effect.gen(function* () {
    const [left, right] = yield* Effect.all([sha256(presented), sha256(Redacted.value(expected))]);
    let difference = 0;
    for (let position = 0; position < left.length; position++) {
      difference |= (left[position] ?? 0) ^ (right[position] ?? 0);
    }
    return difference === 0;
  });

export const bearerToken = (authorization: string | undefined): string | undefined => {
  const match = /^Bearer\s+(.+)$/i.exec(authorization ?? "");
  return match?.[1];
};
