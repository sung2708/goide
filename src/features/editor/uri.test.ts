import { describe, expect, it } from "vitest";
import { editorFileUri, editorUriPath } from "./uri";
describe("editor URI boundary", () => {
  it.each([
    ["d:\\QA tiếng Việt", "src/😀 #?%.go", "file:///D:/QA%20ti%E1%BA%BFng%20Vi%E1%BB%87t/src/%F0%9F%98%80%20%23%3F%25.go", "D:/QA tiếng Việt/src/😀 #?%.go"],
    ["/home/user/project", "main.go", "file:///home/user/project/main.go", "/home/user/project/main.go"],
    ["\\\\server\\share", "main.go", "file://server/share/main.go", "//server/share/main.go"],
    ["\\\\?\\D:\\project", "main.go", "file:///D:/project/main.go", "D:/project/main.go"],
    ["\\\\?\\UNC\\server\\share", "main.go", "file://server/share/main.go", "//server/share/main.go"],
  ])("round-trips %s / %s", (root, path, uri, decoded) => { expect(editorFileUri(root, path)).toBe(uri); expect(editorUriPath(uri)).toBe(decoded); });
  it.each(["../main.go", "/main.go", "C:/main.go", "src//main.go", "src/./main.go", "src/../main.go", "main\0.go"])("rejects unsafe document path %s", path => expect(() => editorFileUri("D:/project", path)).toThrow());
  it("rejects relative workspaces and non-file URIs", () => { expect(() => editorFileUri("relative", "main.go")).toThrow(); expect(() => editorUriPath("https://example.com/main.go")).toThrow(); });
});
