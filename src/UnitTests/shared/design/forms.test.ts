import { describe, expect, it } from "vitest";
import { appendStatus, fillGroupedSelect, fillSelect } from "../../../shared/design/forms";
import { FakeElement, fakeDocument, textOf } from "./fakeDom";

const doc = () => fakeDocument() as unknown as Document;

describe("fillSelect", () => {
  const items = [
    { value: "ACT", text: "ACT_ (3)" },
    { value: "SUB", text: "SUB_ (1)" },
  ];

  it("puts the placeholder first, then one option per item", () => {
    const select = new FakeElement("select");
    fillSelect(doc(), select as unknown as HTMLSelectElement, "-- Select a prefix --", items, "SUB");
    expect(select.children.map((o) => [(o as FakeElement).value, (o as FakeElement).textContent])).toEqual([
      ["", "-- Select a prefix --"],
      ["ACT", "ACT_ (3)"],
      ["SUB", "SUB_ (1)"],
    ]);
    expect(select.value).toBe("SUB");
  });

  it("falls back to the placeholder for a selection not in the items", () => {
    const select = new FakeElement("select");
    fillSelect(doc(), select as unknown as HTMLSelectElement, "-- Select --", items, "GONE");
    expect(select.value).toBe("");
  });
});

describe("fillGroupedSelect", () => {
  const groups = [
    { label: "Constants", items: [{ value: "constants:CON", text: "CON_ (2)" }] },
    { label: "Empty", items: [] },
    {
      label: "Microflows & nanoflows",
      items: [
        { value: "flows:ACT", text: "ACT_ (3)" },
        { value: "flows:SUB", text: "SUB_ (1)" },
      ],
    },
  ];

  it("puts the placeholder first, then one optgroup per non-empty group", () => {
    const select = new FakeElement("select");
    fillGroupedSelect(doc(), select as unknown as HTMLSelectElement, "-- Select a prefix --", groups, "flows:SUB");
    const [placeholder, ...optgroups] = select.children as FakeElement[];
    expect([placeholder.tag, placeholder.value, placeholder.textContent]).toEqual(["option", "", "-- Select a prefix --"]);
    expect(optgroups.map((g) => [g.tag, g.label, (g.children as FakeElement[]).map((o) => o.value)])).toEqual([
      ["optgroup", "Constants", ["constants:CON"]],
      ["optgroup", "Microflows & nanoflows", ["flows:ACT", "flows:SUB"]],
    ]);
    expect(select.value).toBe("flows:SUB");
  });

  it("falls back to the placeholder for a selection not in any group", () => {
    const select = new FakeElement("select");
    fillGroupedSelect(doc(), select as unknown as HTMLSelectElement, "-- Select --", groups, "pages:POP");
    expect(select.value).toBe("");
  });
});

describe("appendStatus", () => {
  it("appends a StatusMessage with the tone class, role, glyph and label", () => {
    const list = new FakeElement("div");
    appendStatus(doc(), list as unknown as HTMLElement, { tone: "error", text: "Rename failed." });
    const row = list.children[0] as FakeElement;
    expect(row.className).toBe("bgs-status bgs-status--error");
    expect(row.attributes.get("role")).toBe("alert");
    const [glyph, text] = row.children as FakeElement[];
    expect(glyph.className).toBe("bgs-status__glyph");
    expect(glyph.attributes.get("aria-hidden")).toBe("true");
    expect(textOf(text)).toBe("Error: Rename failed.");
  });

  it("is announced politely for other tones and keeps earlier messages", () => {
    const list = new FakeElement("div");
    appendStatus(doc(), list as unknown as HTMLElement, { tone: "info", text: "Renaming…" });
    appendStatus(doc(), list as unknown as HTMLElement, { tone: "success", text: "Done." });
    expect(list.children.map((r) => (r as FakeElement).attributes.get("role"))).toEqual(["status", "status"]);
    expect(list.children.map((r) => textOf(r))).toEqual(["Info: Renaming…", "Success: Done."]);
  });
});
