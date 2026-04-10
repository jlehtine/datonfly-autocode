import { bootstrap } from "@datonfly-autocode/app-sdk";

import { App } from "./App";

const rootElement = document.getElementById("root");
if (!rootElement) {
    throw new Error("Root element #root was not found.");
}

const shellOrigin = import.meta.env.VITE_SHELL_ORIGIN ?? window.location.origin;

bootstrap({
    rootElement,
    root: <App />,
    shellOrigin,
});
