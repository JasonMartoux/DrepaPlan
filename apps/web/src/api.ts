import { Effect, Schema } from "effect";

export class ApiFailure extends Schema.TaggedError<ApiFailure>()("ApiFailure", { message: Schema.String }) {}

const apiUrl = (path: string) => `${import.meta.env.VITE_API_URL ?? "http://localhost:1337"}${path}`;

const request = <S extends Schema.Top & { readonly DecodingServices: never }>(
  schema: S,
  path: string,
  token: string,
  body: unknown
) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(apiUrl(path), {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
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

const IssuedUpload = Schema.Struct({ key: Schema.String, uploadUrl: Schema.String });
const IngestionReport = Schema.Struct({ appointments: Schema.Number, prescriptions: Schema.Number });
const Answer = Schema.Struct({ answer: Schema.String });

export const uploadAndIngest = (token: string, file: File) =>
  Effect.gen(function* () {
    const issued = yield* request(IssuedUpload, "/uploads", token, { contentType: file.type, sizeBytes: file.size });
    yield* Effect.tryPromise({
      try: async () => {
        const response = await fetch(issued.uploadUrl, {
          method: "PUT",
          headers: { "content-type": file.type },
          body: file,
        });
        if (!response.ok) throw new Error(`Upload failed with ${response.status}`);
      },
      catch: (cause) => new ApiFailure({ message: cause instanceof Error ? cause.message : String(cause) }),
    });
    return yield* request(IngestionReport, "/ingestions", token, { documentKey: issued.key });
  });

export const ask = (token: string, question: string) =>
  request(Answer, "/ask", token, { question }).pipe(Effect.map((result) => result.answer));
