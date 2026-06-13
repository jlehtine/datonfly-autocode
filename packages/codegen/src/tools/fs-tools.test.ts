import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { createFileTools, DEFAULT_APPLICATION_OWNED_GLOBS } from "./fs-tools.js";

/** Find a tool by name in a tool set (tests invoke `execute` directly). */
function tool(tools: ReturnType<typeof createFileTools>["tools"], name: string) {
    const found = tools.find((t) => t.name === name);
    if (!found) {
        throw new Error(`Missing tool ${name}`);
    }
    return found;
}

describe("createFileTools", () => {
    let workdir: string;

    beforeEach(async () => {
        workdir = await mkdtemp(join(tmpdir(), "codegen-fs-"));
        await mkdir(join(workdir, "src"), { recursive: true });
        await writeFile(join(workdir, "src", "App.tsx"), "export const App = () => null;\n", "utf8");
        await writeFile(join(workdir, "package.json"), "{}\n", "utf8");
    });

    it("writes within the application-owned area and tracks the written path", async () => {
        const fileTools = createFileTools({ workdir });
        const write = tool(fileTools.tools, "write_file");

        await write.execute({ path: "src/components/Button.tsx", content: "export const Button = () => null;\n" });

        const onDisk = await readFile(join(workdir, "src", "components", "Button.tsx"), "utf8");
        expect(onDisk).toContain("Button");
        expect(fileTools.writtenFiles()).toEqual(["src/components/Button.tsx"]);
    });

    it("reads a file back through the read tool", async () => {
        const fileTools = createFileTools({ workdir });
        const read = tool(fileTools.tools, "read_file");

        const content = await read.execute({ path: "src/App.tsx" });

        expect(content).toContain("export const App");
    });

    it("rejects writes outside the application-owned globs", async () => {
        const fileTools = createFileTools({ workdir });
        const write = tool(fileTools.tools, "write_file");

        await expect(write.execute({ path: "package.json", content: "{}" })).rejects.toThrow(/application-owned/);
        expect(fileTools.writtenFiles()).toEqual([]);
    });

    it("rejects path traversal that escapes the working tree", async () => {
        const fileTools = createFileTools({ workdir });
        const write = tool(fileTools.tools, "write_file");
        const read = tool(fileTools.tools, "read_file");

        await expect(write.execute({ path: "../escape.ts", content: "x" })).rejects.toThrow(/escapes/);
        await expect(read.execute({ path: "../../etc/passwd" })).rejects.toThrow(/escapes/);
    });

    it("lists and searches application files", async () => {
        const fileTools = createFileTools({ workdir });
        const list = tool(fileTools.tools, "list_files");
        const search = tool(fileTools.tools, "search_files");

        const listing = await list.execute({});
        expect(listing).toContain("src/App.tsx");
        expect(listing).toContain("package.json");

        const matches = await search.execute({ query: "export const App" });
        expect(matches).toContain("src/App.tsx:1:");
    });

    it("honours custom allowed globs", async () => {
        const fileTools = createFileTools({ workdir, allowedGlobs: ["app/**"] });
        const write = tool(fileTools.tools, "write_file");

        await expect(write.execute({ path: "src/App.tsx", content: "x" })).rejects.toThrow(/application-owned/);
        await write.execute({ path: "app/main.ts", content: "x" });
        expect(fileTools.writtenFiles()).toEqual(["app/main.ts"]);
    });

    it("defaults the allowed globs to the application source tree", () => {
        expect(DEFAULT_APPLICATION_OWNED_GLOBS).toEqual(["src/**"]);
    });
});
