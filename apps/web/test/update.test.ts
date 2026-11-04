import { describe, expect, it } from "vitest";

import { Message } from "../src/message.ts";
import { initialModel } from "../src/model.ts";
import { update } from "../src/update.ts";

const withToken = { ...initialModel, token: "t" };

describe("update", () => {
  it("starts an upload only for PDFs", () => {
    const pdf = new File(["%PDF"], "plan.pdf", { type: "application/pdf" });
    const started = update(withToken, Message.ChoseFiles({ files: [pdf] }));
    expect(started.model.status).toBe("uploading");
    expect(started.commands).toHaveLength(1);

    const html = new File(["<p>"], "x.html", { type: "text/html" });
    const rejected = update(withToken, Message.ChoseFiles({ files: [html] }));
    expect(rejected.model.error).toBe("Choose a PDF document.");
    expect(rejected.commands).toBeUndefined();
  });

  it("asks non-empty questions and records the answer", () => {
    expect(update(withToken, Message.SubmittedQuestion()).commands).toBeUndefined();

    const typed = update(withToken, Message.ChangedQuestion({ question: " Next appointment? " })).model;
    const asking = update(typed, Message.SubmittedQuestion());
    expect(asking.model.status).toBe("asking");
    expect(asking.commands).toHaveLength(1);

    const answered = update(asking.model, Message.Answered({ answer: "1 Dec at 09:30" })).model;
    expect(answered.conversation).toEqual([{ question: "Next appointment?", answer: "1 Dec at 09:30" }]);
    expect(answered.status).toBe("idle");
  });

  it("surfaces failures and returns to idle", () => {
    const failed = update({ ...withToken, status: "uploading" }, Message.Failed({ message: "401" })).model;
    expect(failed).toMatchObject({ status: "idle", error: "401" });
  });
});
