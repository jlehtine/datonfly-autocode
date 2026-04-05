/**
 * Small shared value objects referenced by both the domain entities and the
 * vendor application manifest. Kept here so the manifest can depend on the
 * domain layer without the domain layer depending on the manifest.
 */

/**
 * Coordinates of a package resolved through the controlled registry (for
 * example the vendor UI base library a workspace extends).
 */
export interface LibraryCoordinates {
    /** Package name as known to the registry (e.g. `@vendor/app-base`). */
    name: string;
    /** Exact pinned version. Generated code never floats this. */
    version: string;
    /** Registry the package is resolved from, if not the framework default. */
    registry?: string | undefined;
}

/** Coordinates of a Git repository hosted on the framework's Git service. */
export interface RepoCoordinates {
    /** Owning organization / namespace on the Git host. */
    owner: string;
    /** Repository name. */
    name: string;
    /** Clone URL (HTTPS or SSH) of the repository. */
    cloneUrl: string;
}

/**
 * Coordinates of an application template repository together with the template
 * version a workspace was created from (used to drive template upgrades).
 */
export interface TemplateRepoCoordinates extends RepoCoordinates {
    /** Semantic version of the template this repository currently provides. */
    templateVersion: string;
}

/** Resource ceiling applied to a per-user workspace's runtime workloads. */
export interface ResourceLimits {
    /** Maximum CPU, expressed in Kubernetes CPU units (e.g. `"500m"`). */
    cpu: string;
    /** Maximum memory, expressed in Kubernetes quantity units (e.g. `"512Mi"`). */
    memory: string;
    /** Maximum ephemeral storage, expressed in Kubernetes quantity units. */
    storage?: string | undefined;
}
