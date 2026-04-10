import { describe, expect, it } from "vitest";

import { digestFiles, type DistFile } from "./digest.js";

function file(p: string, content: string): DistFile {
    return { path: p, content: Buffer.from(content) };
}

describe("digestFiles", () => {
    it("is independent of input ordering", () => {
        const a = [file("index.html", "<h1>hi</h1>"), file("assets/app.js", "console.log(1)")];
        const b = [file("assets/app.js", "console.log(1)"), file("index.html", "<h1>hi</h1>")];
        expect(digestFiles(a)).toBe(digestFiles(b));
    });

    it("changes when any file content changes", () => {
        const base = [file("index.html", "<h1>hi</h1>"), file("assets/app.js", "console.log(1)")];
        const changed = [file("index.html", "<h1>hi</h1>"), file("assets/app.js", "console.log(2)")];
        expect(digestFiles(changed)).not.toBe(digestFiles(base));
    });

    it("changes when a file path changes", () => {
        const base = [file("index.html", "<h1>hi</h1>")];
        const renamed = [file("home.html", "<h1>hi</h1>")];
        expect(digestFiles(renamed)).not.toBe(digestFiles(base));
    });

    it("produces a 64-character hex sha256 digest", () => {
        expect(digestFiles([file("index.html", "<h1>hi</h1>")])).toMatch(/^[0-9a-f]{64}$/);
    });
});
