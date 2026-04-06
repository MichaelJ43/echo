/** Shown when creating/renaming folders or requests with a colon in the name. */
export const TREE_NAME_COLON_ERROR =
  'Folder and request names cannot contain ":" (reserved for {{request:…}} placeholders).';

export function treeNameContainsColon(name: string): boolean {
  return name.includes(":");
}
