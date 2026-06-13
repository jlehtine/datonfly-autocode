/**
 * Host-run codegen for the Datonfly Autocode framework.
 *
 * Exposes the {@link HostCodegenProvider} (the Generate flow that drives the
 * agent runtime to produce a committed, taggable revision) and the
 * application-scoped {@link createFileTools} the agent writes through. The agent
 * runs on the host in this slice; the in-sandbox codegen container and the
 * repair flow land in later slices.
 */
export { HostCodegenProvider, codegenBranch, type HostCodegenProviderOptions } from "./host-codegen-provider.js";
export {
    createFileTools,
    DEFAULT_APPLICATION_OWNED_GLOBS,
    type CodegenTool,
    type CreateFileToolsOptions,
    type FileTools,
} from "./tools/fs-tools.js";
