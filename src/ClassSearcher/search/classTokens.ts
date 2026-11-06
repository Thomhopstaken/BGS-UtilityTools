import type { TextRange } from "../../shared/design/tree";

// Where className is one of the classes of a space-separated class list, such as the Class field.
// Exact and case-sensitive, like CSS: "card" doesn't match "card--big" or "Card". offset shifts the ranges.
export function classRanges(classList: string, className: string, offset = 0): TextRange[] {
  const ranges: TextRange[] = [];
  const pattern = /\S+/g;
  for (let match = pattern.exec(classList); match !== null; match = pattern.exec(classList)) {
    if (match[0] === className) {
      ranges.push([offset + match.index, offset + match.index + className.length]);
    }
  }
  return ranges;
}

// The contents of the '…' string literals in an expression, without the quotes. An unclosed literal runs to the end.
// UNVERIFIED: how Mendix escapes a quote inside a literal; both '' and \' are read as an escaped quote.
export function stringLiterals(expression: string): TextRange[] {
  const literals: TextRange[] = [];
  let at = 0;
  while (at < expression.length) {
    if (expression[at] !== "'") {
      at++;
      continue;
    }
    const start = at + 1;
    let end = start;
    while (end < expression.length) {
      if (expression[end] === "\\" && expression[end + 1] === "'") {
        end += 2;
      } else if (expression[end] === "'" && expression[end + 1] === "'") {
        end += 2;
      } else if (expression[end] === "'") {
        break;
      } else {
        end++;
      }
    }
    literals.push([start, Math.min(end, expression.length)]);
    at = end + 1;
  }
  return literals;
}

// Where className is a whole class inside the expression's string literals (the Dynamic classes field).
// A class built from parts ('card--' + $Status) can't be found.
export function expressionRanges(expression: string, className: string): TextRange[] {
  return stringLiterals(expression).flatMap(([start, end]) => classRanges(expression.slice(start, end), className, start));
}
