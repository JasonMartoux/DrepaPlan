import { Schema } from "effect";

export const DocumentKey = Schema.String.check(
  Schema.isPattern(/^documents\/[0-9a-f-]{36}\.pdf$/)
).pipe(Schema.brand("DocumentKey"));
export type DocumentKey = typeof DocumentKey.Type;

export const PdfContentType = "application/pdf";

export const MaxPdfBytes = 20 * 1024 * 1024;
