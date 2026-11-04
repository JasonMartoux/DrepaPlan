import type { Html, HtmlBuilder } from "foldkit/html";

import { Message } from "./message.ts";
import type { Model } from "./model.ts";

export const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.main(
    [h.Class("drepaplan")],
    [
      h.h1([], ["DrepaPlan"]),
      h.section(
        [h.Class("token")],
        [
          h.label([], ["API token"]),
          h.input([h.Type("password"), h.Value(model.token), h.OnInput((token) => Message.ChangedToken({ token }))]),
        ]
      ),
      h.section(
        [h.Class("upload")],
        [
          h.h2([], ["Add a document"]),
          h.input([
            h.Type("file"),
            h.Accept("application/pdf"),
            h.Disabled(model.status !== "idle" || model.token.length === 0),
            h.OnFileChange((files) => Message.ChoseFiles({ files })),
          ]),
        ]
      ),
      h.section(
        [h.Class("chat")],
        [
          h.h2([], ["Ask about your care"]),
          ...model.conversation.flatMap((turn) => [
            h.p([h.Class("question")], [turn.question]),
            h.p([h.Class("answer")], [turn.answer]),
          ]),
          h.form(
            [h.OnSubmit(Message.SubmittedQuestion())],
            [
              h.input([
                h.Value(model.question),
                h.Placeholder("When is my next appointment with Dr. Saoudi?"),
                h.OnInput((question) => Message.ChangedQuestion({ question })),
              ]),
              h.button([h.Type("submit"), h.Disabled(model.status !== "idle" || model.token.length === 0)], ["Ask"]),
            ]
          ),
        ]
      ),
      ...(model.notice === null ? [] : [h.p([h.Class("notice")], [model.notice])]),
      ...(model.error === null ? [] : [h.p([h.Class("error")], [model.error])]),
    ]
  );
