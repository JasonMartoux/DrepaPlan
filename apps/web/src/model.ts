import { Schema } from "effect";

export const Status = Schema.Literals(["idle", "uploading", "asking"]);

export const Model = Schema.Struct({
  token: Schema.String,
  question: Schema.String,
  status: Status,
  notice: Schema.NullOr(Schema.String),
  error: Schema.NullOr(Schema.String),
  conversation: Schema.Array(Schema.Struct({ question: Schema.String, answer: Schema.String })),
});
export type Model = typeof Model.Type;

export const initialModel: Model = {
  token: "",
  question: "",
  status: "idle",
  notice: null,
  error: null,
  conversation: [],
};
