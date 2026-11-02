// A tiny stand-in for the DOM: the node test environment has none. Only what the design helpers use.

export type FakeNode = FakeElement | { readonly text: string };

export class FakeElement {
  className = "";
  textContent: string | null = null;
  value = "";
  label = "";
  innerHTML = "";
  outerHTML = "";
  children: FakeNode[] = [];
  readonly attributes = new Map<string, string>();

  constructor(readonly tag: string) {}

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
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
  return {
    createElement: (tag: string) => new FakeElement(tag),
    createTextNode: (text: string) => ({ text }),
    head: new FakeElement("head"),
  };
}

// Text of a node and its children, depth first.
export function textOf(node: FakeNode): string {
  if (!(node instanceof FakeElement)) {
    return node.text;
  }
  return (node.textContent ?? "") + node.children.map(textOf).join("");
}
