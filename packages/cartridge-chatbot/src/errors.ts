import { Schema } from "effect";

export class QuestionInvalid extends Schema.TaggedError<QuestionInvalid>()("QuestionInvalid", {
  message: Schema.String,
}) {}

export class AnswerFailed extends Schema.TaggedError<AnswerFailed>()("AnswerFailed", {
  message: Schema.String,
}) {}
