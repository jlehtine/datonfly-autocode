import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import { z } from "zod";

/**
 * A tool the codegen agent can invoke, defined over this package's own `zod`.
 *
 * Structurally identical to the agent runtime's `ITool`, but intentionally
 * built with the local `zod` instance: the agent runtime is linked from a
 * sibling repository with its own `zod` copy, and reconciling two `zod` copies
 * through a shared generic is pathologically expensive for the type checker.
 * The tools are cast to the runtime's `ITool[]` at the single call boundary
 * where they are handed to the agent.
 */
export interface CodegenTool<S extends z.ZodType = z.ZodType> {
    /** Unique tool name (used by the agent to select the tool). */
    name: string;
    /** Human-readable description shown to the agent. */
    description: string;
    /** Zod schema validating and describing the tool's input. */
    schema: S;
    /** Execute the tool with validated input and return a result string. */
    execute(input: z.infer<S>): Promise<string>;
}

/** Identity helper that preserves per-tool schema inference for {@link CodegenTool.execute}. */
function defineTool<S extends z.ZodType>(tool: CodegenTool<S>): CodegenTool<S> {
    return tool;
}

/**
 * Default set of globs the agent is allowed to write to: the application-owned
 * source tree. Everything else (framework-owned config, build recipes, the Git
 * metadata) is off-limits and rejected at the tool boundary.
 */
export const DEFAULT_APPLICATION_OWNED_GLOBS: readonly string[] = ["src/**"];

/** Options for {@link createFileTools}. */
export interface CreateFileToolsOptions {
    /** Absolute path to the workspace working tree the tools operate within. */
    workdir: string;
    /**
     * Globs (repo-relative, posix separators) the agent may write to. Reads and
     * listings are allowed anywhere inside {@link workdir}; writes outside these
     * globs are rejected. Defaults to {@link DEFAULT_APPLICATION_OWNED_GLOBS}.
     */
    allowedGlobs?: readonly string[];
}

/** A set of file tools plus an accessor for the paths written through them. */
export interface FileTools {
    /** The tools to hand to the agent for this job. */
    tools: CodegenTool[];
    /** Repo-relative posix paths written via `write_file`, in first-write order. */
    writtenFiles(): string[];
}

/**
 * Convert a restricted glob into an anchored {@link RegExp}.
 *
 * Supports the subset needed for the framework/application partition: `**`
 * (any number of path segments, including zero), `*` (any run of non-separator
 * characters), and `?` (a single non-separator character). All other characters
 * are matched literally.
 */
function globToRegExp(glob: string): RegExp {
    let source = "";
    for (let i = 0; i < glob.length; i++) {
        const char = glob[i];
        if (char === "*") {
            if (glob[i + 1] === "*") {
                i++;
                // Consume a trailing slash so `**/` also matches zero segments.
                if (glob[i + 1] === "/") {
                    i++;
                }
                source += "(?:.*)";
            } else {
                source += "[^/]*";
            }
        } else if (char === "?") {
            source += "[^/]";
        } else if (char !== undefined && "\\^$.|+()[]{}".includes(char)) {
            source += `\\${char}`;
        } else {
            source += char ?? "";
        }
    }
    return new RegExp(`^${source}$`);
}

/** Resolve `target` against `workdir`, rejecting anything that escapes the tree. */
function resolveWithin(workdir: string, target: string): { abs: string; relPosix: string } {
    const abs = resolve(workdir, target);
    const rel = relative(workdir, abs);
    if (rel.startsWith("..") || isAbsolute(rel)) {
        throw new Error(`Path escapes the application working tree: ${target}`);
    }
    return { abs, relPosix: rel.split(sep).join("/") };
}

/** Recursively collect repo-relative posix file paths under `dir`. */
async function walk(workdir: string, dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const out: string[] = [];
    for (const entry of entries) {
        if (entry.name === ".git" || entry.name === "node_modules") {
            continue;
        }
        const childAbs = resolve(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...(await walk(workdir, childAbs)));
        } else if (entry.isFile()) {
            out.push(relative(workdir, childAbs).split(sep).join("/"));
        }
    }
    return out;
}

/**
 * Build application-scoped file tools rooted at a workspace working tree.
 *
 * The returned `list_files`, `read_file`, `search_files`, and `write_file` tools
 * resolve every path against {@link CreateFileToolsOptions.workdir} and reject
 * any path that escapes it. `write_file` additionally rejects paths outside the
 * application-owned globs, enforcing the framework/application partition at the
 * tool boundary. Written paths are tracked so the caller can commit exactly the
 * set the agent produced.
 */
export function createFileTools(options: CreateFileToolsOptions): FileTools {
    const workdir = options.workdir;
    const globs = (options.allowedGlobs ?? DEFAULT_APPLICATION_OWNED_GLOBS).map(globToRegExp);
    const written = new Set<string>();

    function isApplicationOwned(relPosix: string): boolean {
        return globs.some((re) => re.test(relPosix));
    }

    const listFiles = defineTool({
        name: "list_files",
        description:
            "List application files (repo-relative paths) under an optional sub-directory of the working tree.",
        schema: z.object({
            dir: z
                .string()
                .optional()
                .describe("Sub-directory to list, relative to the working tree. Defaults to root."),
        }),
        async execute(input) {
            const { abs } = resolveWithin(workdir, input.dir ?? ".");
            const files = await walk(workdir, abs);
            files.sort();
            return files.join("\n");
        },
    });

    const readFileTool = defineTool({
        name: "read_file",
        description: "Read the UTF-8 text content of an application file, relative to the working tree.",
        schema: z.object({
            path: z.string().describe("File path relative to the working tree."),
        }),
        async execute(input) {
            const { abs } = resolveWithin(workdir, input.path);
            return readFile(abs, "utf8");
        },
    });

    const searchFiles = defineTool({
        name: "search_files",
        description: "Search application files for a substring, returning matching `path:line:text` entries.",
        schema: z.object({
            query: z.string().describe("Case-sensitive substring to search for."),
            dir: z.string().optional().describe("Sub-directory to search within. Defaults to root."),
        }),
        async execute(input) {
            const { abs } = resolveWithin(workdir, input.dir ?? ".");
            const files = await walk(workdir, abs);
            const matches: string[] = [];
            for (const relPosix of files) {
                const content = await readFile(resolve(workdir, relPosix), "utf8");
                const lines = content.split("\n");
                lines.forEach((line, index) => {
                    if (line.includes(input.query)) {
                        matches.push(`${relPosix}:${String(index + 1)}:${line.trim()}`);
                    }
                });
            }
            return matches.join("\n");
        },
    });

    const writeFileTool = defineTool({
        name: "write_file",
        description:
            "Create or overwrite an application file. Only paths within the application-owned area are allowed.",
        schema: z.object({
            path: z.string().describe("File path relative to the working tree."),
            content: z.string().describe("Full UTF-8 content to write."),
        }),
        async execute(input) {
            const { abs, relPosix } = resolveWithin(workdir, input.path);
            if (!isApplicationOwned(relPosix)) {
                throw new Error(`Path is outside the application-owned area: ${relPosix}`);
            }
            await mkdir(dirname(abs), { recursive: true });
            await writeFile(abs, input.content, "utf8");
            written.add(relPosix);
            return `Wrote ${relPosix}`;
        },
    });

    return {
        tools: [listFiles, readFileTool, searchFiles, writeFileTool],
        writtenFiles() {
            return [...written];
        },
    };
}
