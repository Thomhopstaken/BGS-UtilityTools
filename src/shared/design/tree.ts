import type { RowTarget } from "./runLog";

// The Tree component's data: nested rows that open an element, with the fields that matched.

// [start, end) of a part of a text, e.g. the matching class in a field value.
export type TextRange = readonly [start: number, end: number];

// One field under a result row: key "Class", value "card card--highlight", hits on "card--highlight".
export type TreeField = {
  readonly key: string;
  readonly value: string;
  // Sorted and not overlapping.
  readonly hits: readonly TextRange[];
};

export type TreeNode = {
  readonly label: string;
  // Type caption after the label ("Container"); "" for none.
  readonly type: string;
  readonly target: RowTarget;
  // A node with fields is a result itself; one without is a level on the way to a result.
  readonly fields: readonly TreeField[];
  readonly children: readonly TreeNode[];
  // Results in this node and below it; root rows show it.
  readonly count: number;
};

export type TextPart = {
  readonly text: string;
  readonly hit: boolean;
};

// The value cut into plain and hit parts, in order; empty parts are left out.
export function markParts(value: string, hits: readonly TextRange[]): TextPart[] {
  const parts: TextPart[] = [];
  let at = 0;
  for (const [start, end] of hits) {
    if (start > at) {
      parts.push({ text: value.slice(at, start), hit: false });
    }
    if (end > start) {
      parts.push({ text: value.slice(start, end), hit: true });
    }
    at = Math.max(at, end);
  }
  if (at < value.length) {
    parts.push({ text: value.slice(at), hit: false });
  }
  return parts;
}
