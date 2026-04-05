import type { LibraryCoordinates } from "../domain/values.js";

/**
 * Registry enforcement mode.
 *
 * - `allow-list` (Mode A): only explicitly vetted packages may be resolved.
 * - `curated-mirror` (Mode B): a curated mirror of selected public packages,
 *   with provenance, in addition to the allow-list.
 */
export type RegistryMode = "allow-list" | "curated-mirror";

/** Runtime constant mapping each {@link RegistryMode} to itself. */
export const REGISTRY_MODES = {
    "allow-list": "allow-list",
    "curated-mirror": "curated-mirror",
} as const satisfies Record<RegistryMode, RegistryMode>;

/** Provenance metadata recorded for a resolved package version. */
export interface PackageProvenance {
    /** Package name. */
    name: string;
    /** Resolved version. */
    version: string;
    /** Upstream source the version was mirrored from, if any. */
    source?: string | undefined;
    /** Integrity digest of the package contents. */
    integrity: string;
}

/** Result of evaluating a dependency against the registry policy. */
export interface PolicyDecision {
    /** Whether the dependency is permitted. */
    allowed: boolean;
    /** Machine-readable reason when {@link PolicyDecision.allowed} is `false`. */
    reason?: string | undefined;
}

/**
 * The controlled dependency source for generated code.
 *
 * Enforces the allow-list or curated mirror, pins versions, and records
 * provenance. Generalizes across ecosystems (npm, PyPI, …).
 */
export interface RegistryProvider {
    /** The enforcement mode currently in effect. */
    readonly mode: RegistryMode;
    /** Evaluate whether a dependency is permitted by policy. */
    checkPolicy(coordinates: LibraryCoordinates): Promise<PolicyDecision>;
    /** Resolve a dependency to a concrete, pinned version. */
    resolveVersion(name: string, range: string): Promise<string>;
    /** Return recorded provenance for a resolved package version. */
    getProvenance(name: string, version: string): Promise<PackageProvenance>;
}
