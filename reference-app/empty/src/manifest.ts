import { HOOK_CONTRACT_VERSION, type VendorAppManifest } from "@datonfly-autocode/core";

/**
 * Sample vendor application manifest for the empty reference application.
 *
 * Type-checked against {@link VendorAppManifest} so the empty app exercises the
 * manifest contract. The empty app has no vendor base library content yet; the
 * codegen agent fills the application-owned area.
 */
export const emptyAppManifest = {
    manifestVersion: "1",
    slug: "empty",
    name: "Empty Reference Application",
    baseLibrary: {
        name: "@datonfly-autocode/reference-empty-app",
        version: "0.0.1",
    },
    vendorEndpoints: [],
    hookContractVersion: HOOK_CONTRACT_VERSION,
    registryPolicy: {
        mode: "allow-list",
        allowList: [],
    },
    resourceLimits: {
        cpu: "1",
        memory: "1Gi",
    },
    recoveryOptions: {
        autoRepair: true,
        revert: true,
        vanilla: true,
    },
    templateRepo: {
        owner: "datonfly-autocode",
        name: "reference-empty-app",
        cloneUrl: "https://forgejo.invalid/datonfly-autocode/reference-empty-app.git",
        templateVersion: "0.0.1",
    },
    stackTemplateRef: "node-react-mui",
    agentInstructionsRef: "node-react-mui@0.0.1",
} satisfies VendorAppManifest;
