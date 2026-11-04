import { Effect, Schema } from "effect";

export class ApiFailure extends Schema.TaggedError<ApiFailure>()("ApiFailure", { message: Schema.String }) {}

const apiUrl = (path: string) => `${import.meta.env.VITE_API_URL ?? "http://localhost:1337"}${path}`;

const request = <S extends Schema.Top & { readonly DecodingServices: never }>(
  schema: S,
  path: string,
  token: string,
  body: BodyInit,
  contentType: string
) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(apiUrl(path), {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": contentType },
        body,
      });
      const json: unknown = await response.json();
      if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(json)}`);
      return json;
    },
    catch: (cause) => new ApiFailure({ message: cause instanceof Error ? cause.message : String(cause) }),
  }).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(schema)),
    Effect.mapError((error) => (error instanceof ApiFailure ? error : new ApiFailure({ message: error.message })))
  );

const postJson = <S extends Schema.Top & { readonly DecodingServices: never }>(
  schema: S,
  path: string,
  token: string,
  body: unknown
) => request(schema, path, token, JSON.stringify(body), "application/json");

const StoredUpload = Schema.Struct({ key: Schema.String });
const IngestionReport = Schema.Struct({ appointments: Schema.Number, prescriptions: Schema.Number });
const Answer = Schema.Struct({ answer: Schema.String });

export const uploadAndIngest = (token: string, file: File) =>
  Effect.gen(function* () {
    const stored = yield* request(StoredUpload, "/uploads", token, file, "application/pdf");
    return yield* postJson(IngestionReport, "/ingestions", token, { documentKey: stored.key });
  });

export const ask = (token: string, question: string) =>
  postJson(Answer, "/ask", token, { question }).pipe(Effect.map((result) => result.answer));
