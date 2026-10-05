/** One canonical path boundary shared by models and language adapters.
 * DocumentSession paths are workspace-relative and never contain traversal. */
export function editorFileUri(root: string, relativePath: string): string {
  let base = root.replace(/\\/g, "/").replace(/^\/\/\?\//, "").replace(/\/+$/, "") || "/";
  if (base.startsWith("UNC/")) base = `//${base.slice(4)}`;
  const relative = relativePath.replace(/\\/g, "/");
  if (!relative || relative.startsWith("/") || /^[A-Za-z]:/.test(relative) || relative.includes("\0") || relative.split("/").some(part => !part || part === "." || part === "..")) throw new Error("Invalid editor document path.");
  if (!base.startsWith("/") && !/^[A-Za-z]:\//.test(base)) throw new Error("Workspace path must be absolute.");
  if (/^[A-Za-z]:/.test(base)) base = base[0].toUpperCase() + base.slice(1);
  const encode = (part: string) => encodeURIComponent(part).replace(/%3A/gi, ":");
  const path = `${base === "/" ? "" : base}/${relative}`.split("/").map(encode).join("/");
  return base.startsWith("//") ? `file:${path}` : `file://${path.startsWith("/") ? "" : "/"}${path}`;
}

export function editorUriPath(uri: string): string {
  const url = new URL(uri);
  if (url.protocol !== "file:") throw new Error("Expected a file URI.");
  const path = decodeURIComponent(url.pathname);
  if (url.host) return `//${url.host}${path}`;
  return /^\/[A-Za-z]:\//.test(path) ? path.slice(1) : path;
}
