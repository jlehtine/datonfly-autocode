import { z } from "zod";

/**
 * Vendor application manifest.
 *
 * The declarative descriptor an {@link Application} is configured by: base
 * library coordinates, vendor backend endpoints, hook contract version,
 * registry/library policy, resource limits, recovery options, the application
 * template repository, and references to the stack template and agent
 * instructions. Validated with Zod so it can be authored as JSON/YAML and
 * checked at the control-plane boundary.
 */

/** Coordinates of a package resolved through the controlled registry. */
export const libraryCoordinatesSchema = z.object({
    name: z.string(),
    version: z.string(),
    registry: z.string().optional(),
});

/** A vendor backend endpoint the application's runtime is allowed to reach. */
export const vendorEndpointSchema = z.object({
    /** Logical name the application references the endpoint by. */
    name: z.string(),
    /** Base URL of the vendor service. */
    url: z.url(),
    /** OAuth2 audience the control plane mints scoped tokens for. */
    audience: z.string(),
});

/** Registry/library policy governing what generated code may depend on. */
export const registryPolicySchema = z.object({
    /** Enforcement mode: allow-list only, or curated mirror in addition. */
    mode: z.enum(["allow-list", "curated-mirror"]),
    /** Package names permitted beyond the stack defaults. */
    allowList: z.array(z.string()),
});

/** Resource ceiling applied to the workspace's runtime workloads. */
export const resourceLimitsSchema = z.object({
    cpu: z.string(),
    memory: z.string(),
    storage: z.string().optional(),
});

/** Recovery options offered to end users for this application. */
export const recoveryOptionsSchema = z.object({
    /** Whether auto-repair via the codegen agent is enabled. */
    autoRepair: z.boolean(),
    /** Whether revert-to-revision is offered. */
    revert: z.boolean(),
    /** Whether the switch-to-vanilla escape hatch is offered. */
    vanilla: z.boolean(),
});

/** Coordinates of the application template repository. */
export const templateRepoSchema = z.object({
    owner: z.string(),
    name: z.string(),
    cloneUrl: z.url(),
    templateVersion: z.string(),
});

/** The complete vendor application manifest. */
export const vendorAppManifestSchema = z.object({
    /** Schema version of the manifest format itself. */
    manifestVersion: z.string(),
    /** Stable, URL-safe slug of the application. */
    slug: z.string(),
    /** Human-readable application name. */
    name: z.string(),
    /** Coordinates of the vendor UI base library. */
    baseLibrary: libraryCoordinatesSchema,
    /** Vendor backend endpoints the application may reach. */
    vendorEndpoints: z.array(vendorEndpointSchema),
    /** Hook contract version generated code targets. */
    hookContractVersion: z.string(),
    /** Registry/library policy for generated dependencies. */
    registryPolicy: registryPolicySchema,
    /** Resource ceiling for the workspace's runtime workloads. */
    resourceLimits: resourceLimitsSchema,
    /** Recovery options offered to end users. */
    recoveryOptions: recoveryOptionsSchema,
    /** The application template repository new workspaces clone. */
    templateRepo: templateRepoSchema,
    /** Identifier of the stack template the application is built on. */
    stackTemplateRef: z.string(),
    /** Reference to the vendor-supplied agent instructions for the stack. */
    agentInstructionsRef: z.string(),
});

/** A validated vendor application manifest. */
export type VendorAppManifest = z.infer<typeof vendorAppManifestSchema>;
