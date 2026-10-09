// Tones of the StatusMessage component; each maps to a bgs-status--<tone> modifier.
export type StatusTone = "success" | "info" | "warning" | "error";

export type Status = {
  readonly tone: StatusTone;
  readonly text: string;
};

const LABELS: Readonly<Record<StatusTone, string>> = {
  success: "Success",
  info: "Info",
  warning: "Warning",
  error: "Error",
};

// The bold word in front of a status; tone is never shown by colour alone.
export function statusLabel(tone: StatusTone): string {
  return LABELS[tone];
}

// Errors interrupt screen readers, the rest is announced politely.
export function statusRole(tone: StatusTone): "alert" | "status" {
  return tone === "error" ? "alert" : "status";
}
