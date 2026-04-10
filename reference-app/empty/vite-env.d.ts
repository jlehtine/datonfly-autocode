/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** Origin of the framework Shell that hosts this application sub-frame. */
    readonly VITE_SHELL_ORIGIN?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
