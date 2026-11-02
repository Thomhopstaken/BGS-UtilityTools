import { createElement } from "./dom";
import { type Status, statusLabel, statusRole } from "./status";

export type SelectItem = {
  readonly value: string;
  readonly text: string;
};

// Placeholder first (empty value); a selection not in items falls back to it.
export function fillSelect(
  doc: Document,
  select: HTMLSelectElement,
  placeholder: string,
  items: readonly SelectItem[],
  selected: string,
): void {
  const first = createElement(doc, "option", undefined, placeholder);
  first.value = "";
  const options = items.map((item) => {
    const option = createElement(doc, "option", undefined, item.text);
    option.value = item.value;
    return option;
  });
  select.replaceChildren(first, ...options);
  select.value = items.some((item) => item.value === selected) ? selected : "";
}

export type SelectGroup = {
  readonly label: string;
  readonly items: readonly SelectItem[];
};

// Like fillSelect, with the items in <optgroup>s; empty groups are left out.
export function fillGroupedSelect(
  doc: Document,
  select: HTMLSelectElement,
  placeholder: string,
  groups: readonly SelectGroup[],
  selected: string,
): void {
  const first = createElement(doc, "option", undefined, placeholder);
  first.value = "";
  const optgroups = groups
    .filter((group) => group.items.length > 0)
    .map((group) => {
      const optgroup = createElement(doc, "optgroup");
      optgroup.label = group.label;
      for (const item of group.items) {
        const option = optgroup.appendChild(createElement(doc, "option", undefined, item.text));
        option.value = item.value;
      }
      return optgroup;
    });
  select.replaceChildren(first, ...optgroups);
  select.value = groups.some((group) => group.items.some((item) => item.value === selected)) ? selected : "";
}

// One StatusMessage (bgs-status) appended to a status list; the label says the tone, never colour alone.
export function appendStatus(doc: Document, list: HTMLElement, status: Status): void {
  const row = createElement(doc, "div", `bgs-status bgs-status--${status.tone}`);
  row.setAttribute("role", statusRole(status.tone));
  row.appendChild(createElement(doc, "span", "bgs-status__glyph")).setAttribute("aria-hidden", "true");
  const text = row.appendChild(createElement(doc, "span"));
  text.appendChild(createElement(doc, "span", "bgs-status__label", `${statusLabel(status.tone)}: `));
  text.appendChild(doc.createTextNode(status.text));
  list.appendChild(row);
}
