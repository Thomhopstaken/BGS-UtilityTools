import { describe, expect, it } from "vitest";
import { statusLabel, statusRole } from "../../../shared/design/status";

describe("status", () => {
  it.each([
    ["success", "Success", "status"],
    ["info", "Info", "status"],
    ["warning", "Warning", "status"],
    ["error", "Error", "alert"],
  ] as const)("%s: label %s, role %s", (tone, label, role) => {
    expect(statusLabel(tone)).toBe(label);
    expect(statusRole(tone)).toBe(role);
  });
});
