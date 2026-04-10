import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Backend that serves the embedded assistant chat (REST + Socket.io). The Shell
// proxies the assistant API paths to it so the chat shares the Shell's origin.
const ASSISTANT_BACKEND_TARGET = "http://localhost:3000";

export default defineConfig({
    plugins: [react()],
    // The assistant chat packages are consumed as `link:` dependencies, so they
    // resolve their own React / Emotion copies from the sibling repo's
    // `node_modules`. Dedupe forces a single instance, avoiding the "Invalid
    // hook call" crash and the duplicate-Emotion warning.
    resolve: {
        dedupe: ["react", "react-dom", "react-i18next", "@emotion/react", "@emotion/styled"],
    },
    server: {
        port: 5274,
        proxy: {
            "/datonfly-assistant": {
                target: ASSISTANT_BACKEND_TARGET,
                ws: true,
                changeOrigin: true,
            },
            "/auth": {
                target: ASSISTANT_BACKEND_TARGET,
                changeOrigin: true,
            },
        },
    },
});
