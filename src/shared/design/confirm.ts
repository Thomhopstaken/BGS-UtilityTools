// The warning every tool adds to its Studio Pro confirmation before a run (ui.messageBoxes.ask).
export const COMMIT_FIRST_WARNING = "Commit your app first: this changes many documents at once and can't be undone from here.";

// The question, then the commit warning as its own paragraph.
export function withCommitWarning(question: string): string {
  return `${question}\n\n${COMMIT_FIRST_WARNING}`;
}
