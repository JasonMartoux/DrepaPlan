import { Schema } from "effect";

export class TextExtractionFailed extends Schema.TaggedError<TextExtractionFailed>()(
  "TextExtractionFailed",
  { message: Schema.String }
) {}

export class StructuringFailed extends Schema.TaggedError<StructuringFailed>()(
  "StructuringFailed",
  { message: Schema.String }
) {}

export class ExtractionInvalid extends Schema.TaggedError<ExtractionInvalid>()(
  "ExtractionInvalid",
  { message: Schema.String }
) {}

export class EmbeddingFailed extends Schema.TaggedError<EmbeddingFailed>()(
  "EmbeddingFailed",
  { message: Schema.String }
) {}

export class RecordStoreFailed extends Schema.TaggedError<RecordStoreFailed>()(
  "RecordStoreFailed",
  { message: Schema.String }
) {}

export class RecordIndexFailed extends Schema.TaggedError<RecordIndexFailed>()(
  "RecordIndexFailed",
  { message: Schema.String }
) {}

export class StageTimedOut extends Schema.TaggedError<StageTimedOut>()(
  "StageTimedOut",
  { stage: Schema.String }
) {}
