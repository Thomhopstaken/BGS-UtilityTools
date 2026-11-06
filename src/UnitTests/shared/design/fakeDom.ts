// A tiny stand-in for the DOM: the node test environment has none. Only what the design helpers use.

export type FakeNode = FakeElement | { readonly text: string };

export class FakeElement {
  className = "";
  textContent: string | null = null;
  value = "";
  label = "";
  innerHTML = "";
  outerHTML = "";
  hidden = false;
  type = "";
  title = "";
  // Set by fakeDocument().createElement.
  ownerDocument: unknown = null;
  children: FakeNode[] = [];
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, (() => void)[]>();

  constructor(readonly tag: string) {}

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  // Runs the listeners of an event, as a user action would.
  dispatch(type: string): void {
    this.listeners.get(type)?.forEach((listener) => listener());
  }

  appendChild<T extends FakeNode>(child: T): T {
    this.children.push(child);
    return child;
  }

  append(...children: FakeNode[]): void {
    this.children.push(...children);
  }

  replaceChildren(...children: FakeNode[]): void {
    this.children = children;
  }
}

export function fakeDocument() {
  const doc = {
    createElement: (tag: string): FakeElement => {
      const element = new FakeElement(tag);
      element.ownerDocument = doc;
      return element;
    },
    createTextNode: (text: string) => ({ text }),
    head: new FakeElement("head"),
  };
  return doc;
}

// Text of a node and its children, depth first.
export function textOf(node: FakeNode): string {
  if (!(node instanceof FakeElement)) {
    return node.text;
  }
  return (node.textContent ?? "") + node.children.map(textOf).join("");
}
