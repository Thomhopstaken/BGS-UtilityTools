// A new prefix follows the same rule as an existing one: 1-4 capital letters (lead's rule).
export const PREFIX_PATTERN = /^[A-Z]{1,4}$/;

export const MAX_PREFIX_LENGTH = 4;

// Pane inputs a FieldProblem can point to.
export type PrefixField = "prefix" | "newPrefix";

export type FieldProblem = {
  readonly field: PrefixField;
  readonly message: string;
};

// The new prefix for oldPrefix; an error message, or null when it can be used.
export function validateNewPrefix(oldPrefix: string, newPrefix: string): string | null {
  if (newPrefix.length === 0) {
    return "Enter a new prefix, or tick Remove prefix.";
  }
  if (newPrefix.length > MAX_PREFIX_LENGTH) {
    return `A prefix has at most ${MAX_PREFIX_LENGTH} letters.`;
  }
  if (!PREFIX_PATTERN.test(newPrefix)) {
    return "Use capital letters A–Z only.";
  }
  if (newPrefix === oldPrefix) {
    return "The new prefix is the same as the current prefix.";
  }
  console.debug(`new prefix '${newPrefix}' for '${oldPrefix}' is valid`);
  return null;
}

export type PrefixRequestInput = {
  // The selected prefix; undefined when none or an unknown one is selected.
  readonly oldPrefix: string | undefined;
  readonly newPrefix: string;
  readonly removePrefix: boolean;
};

// Checks the whole form; the problem names the field to mark, or null when the run can start.
export function validatePrefixRequest(input: PrefixRequestInput): FieldProblem | null {
  if (input.oldPrefix === undefined) {
    console.debug("prefix request: no prefix selected");
    return { field: "prefix", message: "Select a prefix." };
  }
  if (input.removePrefix) {
    return null;
  }
  const problem = validateNewPrefix(input.oldPrefix, input.newPrefix);
  return problem === null ? null : { field: "newPrefix", message: problem };
}
