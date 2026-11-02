import { describe, expect, it } from "vitest";
import { COMMIT_FIRST_WARNING, withCommitWarning } from "../../../shared/design/confirm";

describe("withCommitWarning", () => {
  it("puts the commit warning after the question, as its own paragraph", () => {
    expect(withCommitWarning("Rename it?")).toBe(`Rename it?\n\n${COMMIT_FIRST_WARNING}`);
  });

  it("tells the developer to commit first", () => {
    expect(COMMIT_FIRST_WARNING).toBe("Commit your app first: this changes many documents at once and can't be undone from here.");
  });
});
