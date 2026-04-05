import type { RevisionId, WorkspaceId } from "../domain/ids.js";
import type { BuildDiagnostics } from "../types/diagnostics.js";

/** A published, deployable build artifact for a revision. */
export interface BuildArtifact {
    /** Revision the artifact was built from. */
    revisionId: RevisionId;
    /** Content-addressable digest of the artifact (e.g. an image digest). */
    digest: string;
    /** Reference by which the artifact can be pulled for deployment. */
    reference: string;
}

/** Options for building a revision into a deployable artifact. */
export interface BuildOptions {
    /** Workspace whose revision is built. */
    workspaceId: WorkspaceId;
    /** Revision to build. */
    revisionId: RevisionId;
    /** Git ref (tag or SHA) to build from. */
    ref: string;
}

/** Outcome of a build, carrying the artifact on success or diagnostics on failure. */
export interface BuildResult {
    /** Whether the build succeeded. */
    succeeded: boolean;
    /** Published artifact, present when {@link BuildResult.succeeded} is `true`. */
    artifact?: BuildArtifact | undefined;
    /** Structured diagnostics, always captured and fully logged. */
    diagnostics: BuildDiagnostics;
}

/**
 * Builds a {@link Revision} into a deployable artifact.
 *
 * Emits structured build diagnostics (fully logged and summarizable for end
 * users) and publishes artifacts for the deployment step. Builds are
 * reproducible from a revision's commit using the in-repo build recipe.
 */
export interface BuildProvider {
    /** Build a revision; resolves with the artifact or failure diagnostics. */
    build(options: BuildOptions): Promise<BuildResult>;
}
