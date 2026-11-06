export type ClassQuery = { readonly ok: true; readonly className: string } | { readonly ok: false; readonly message: string };

// One class name to search: trimmed, one leading "." dropped (".card" as written in CSS), no spaces.
export function normalizeClassQuery(input: string): ClassQuery {
  const trimmed = input.trim();
  const className = trimmed.startsWith(".") ? trimmed.slice(1) : trimmed;
  if (className === "") {
    return { ok: false, message: "Enter a class name." };
  }
  if (/\s/.test(className)) {
    return { ok: false, message: "Enter one class name, without spaces." };
  }
  return { ok: true, className };
}
