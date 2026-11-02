import type { RenameMap } from "./variableRewrite";

// `{Param}` or `{Param/Attribute}` placeholders in a page URL or published REST operation path.
// UNVERIFIED: placeholder syntax.
const URL_PLACEHOLDER = /\{([A-Za-z_][A-Za-z0-9_]*)(?=[/}])/g;

// Replaces every placeholder whose parameter was renamed; the whole name is matched, literal text is kept.
export function rewriteUrlPlaceholders(url: string, renames: RenameMap): string {
  if (renames.size === 0) {
    return url;
  }
  // Only `{Name` is matched; the following `/` or `}` stays in place.
  const newUrl = url.replace(URL_PLACEHOLDER, (match: string, name: string) => {
    const newName = renames.get(name);
    return newName === undefined ? match : `{${newName}`;
  });
  if (newUrl !== url) {
    console.debug(`updated url '${url}' to '${newUrl}'`);
  }
  return newUrl;
}
