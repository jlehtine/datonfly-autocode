import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

/** A single file within a build's `dist/` output. */
export interface DistFile {
    /** Path relative to the `dist/` root, using forward slashes. */
    path: string;
    /** Raw file contents. */
    content: Buffer;
}

/**
 * Compute a stable, order-independent sha256 digest over a set of `dist/`
 * files. The digest depends only on the relative paths and their contents, so
 * reordering the input never changes the result while any content change does.
 */
export function digestFiles(files: readonly DistFile[]): string {
    const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    const root = createHash("sha256");
    for (const file of sorted) {
        const fileHash = createHash("sha256").update(file.content).digest("hex");
        root.update(file.path);
        root.update("\0");
        root.update(fileHash);
        root.update("\n");
    }
    return root.digest("hex");
}

/** Compute the {@link digestFiles} digest over every file under `distPath`. */
export async function computeDistDigest(distPath: string): Promise<string> {
    const files = await collectFiles(distPath, distPath);
    return digestFiles(files);
}

async function collectFiles(root: string, dir: string): Promise<DistFile[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files: DistFile[] = [];
    for (const entry of entries) {
        const absolute = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await collectFiles(root, absolute)));
        } else if (entry.isFile()) {
            files.push({
                path: path.relative(root, absolute).split(path.sep).join("/"),
                content: await fs.readFile(absolute),
            });
        }
    }
    return files;
}
