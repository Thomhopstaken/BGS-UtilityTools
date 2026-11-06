import { describe, expect, it } from "vitest";
import { normalizeClassQuery } from "../../ClassSearcher/validation";

describe("normalizeClassQuery", () => {
  it("keeps one class name as typed, trimmed", () => {
    expect(normalizeClassQuery("  card--highlight ")).toEqual({ ok: true, className: "card--highlight" });
  });

  it("keeps the case", () => {
    expect(normalizeClassQuery("Card")).toEqual({ ok: true, className: "Card" });
  });

  it("drops one leading dot, as written in CSS", () => {
    expect(normalizeClassQuery(".card")).toEqual({ ok: true, className: "card" });
    expect(normalizeClassQuery("..card")).toEqual({ ok: true, className: ".card" });
  });

  it("asks for a class name when there is none", () => {
    for (const input of ["", "   ", "."]) {
      expect(normalizeClassQuery(input)).toEqual({ ok: false, message: "Enter a class name." });
    }
  });

  it("asks for one class name when there are spaces", () => {
    expect(normalizeClassQuery("card card--big")).toEqual({ ok: false, message: "Enter one class name, without spaces." });
    expect(normalizeClassQuery("card\tbig")).toEqual({ ok: false, message: "Enter one class name, without spaces." });
  });
});
