import { Schema } from "effect";

export class UnsupportedDocument extends Schema.TaggedError<UnsupportedDocument>()(
  "UnsupportedDocument",
  { contentType: Schema.String }
) {}

export class DocumentTooLarge extends Schema.TaggedError<DocumentTooLarge>()(
  "DocumentTooLarge",
  { sizeBytes: Schema.Number, maxBytes: Schema.Number }
) {}

export class DocumentWriteFailed extends Schema.TaggedError<DocumentWriteFailed>()(
  "DocumentWriteFailed",
  { key: Schema.String, message: Schema.String }
) {}

export class DocumentNotFound extends Schema.TaggedError<DocumentNotFound>()(
  "DocumentNotFound",
  { key: Schema.String }
) {}

export class DocumentReadFailed extends Schema.TaggedError<DocumentReadFailed>()(
  "DocumentReadFailed",
  { key: Schema.String, message: Schema.String }
) {}
