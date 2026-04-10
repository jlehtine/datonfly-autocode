/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** Origin of the application sub-frame the Shell hosts and drives over the bridge. */
    readonly VITE_APP_FRAME_ORIGIN?: string;
    /** URL the application sub-frame is loaded from (defaults to {@link VITE_APP_FRAME_ORIGIN}). */
    readonly VITE_APP_FRAME_URL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
