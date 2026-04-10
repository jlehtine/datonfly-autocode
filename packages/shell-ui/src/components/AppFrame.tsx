import { Box } from "@mui/material";
import { useEffect, useRef } from "react";

import { createBridgeHost, type BridgeHost } from "../bridge/host.js";
import type { AppSessionBridgeCallbacks } from "../session/useAppSession.js";

/** Props for {@link AppFrame}. */
export interface AppFrameProps {
    /** URL the application sub-frame is loaded from. */
    appUrl: string;
    /** Expected origin of the application; bridge messages from other origins are dropped. */
    appOrigin: string;
    /** Session callbacks fed by inbound bridge traffic. */
    callbacks: AppSessionBridgeCallbacks;
    /** Receives the bound bridge host once the frame loads, and `null` on teardown. */
    onHost: (host: BridgeHost | null) => void;
}

/**
 * Host the per-user application in a sandboxed `<iframe>` and bind the bridge.
 *
 * Isolating the application in a sub-frame keeps the framework top frame alive
 * even when the application fails, which is essential for recovery. Once the
 * frame loads, a {@link BridgeHost} is bound to its window and lifted to the
 * parent via {@link AppFrameProps.onHost}.
 */
export function AppFrame({ appUrl, appOrigin, callbacks, onHost }: AppFrameProps): React.JSX.Element {
    const frameRef = useRef<HTMLIFrameElement>(null);

    useEffect(() => {
        const frame = frameRef.current;
        const targetWindow = frame?.contentWindow;
        if (!targetWindow) {
            return;
        }

        const host = createBridgeHost({
            targetWindow,
            appOrigin,
            onReady: callbacks.onReady,
            onHeartbeat: callbacks.onHeartbeat,
            onNavigated: callbacks.onNavigated,
            onBuildError: callbacks.onBuildError,
            onRuntimeError: callbacks.onRuntimeError,
        });
        onHost(host);

        return (): void => {
            host.dispose();
            onHost(null);
        };
    }, [appOrigin, callbacks, onHost]);

    return (
        <Box
            component="iframe"
            ref={frameRef}
            src={appUrl}
            title="Application"
            sandbox="allow-scripts allow-forms allow-same-origin"
            sx={{
                flex: 1,
                width: "100%",
                border: 0,
                bgcolor: "background.default",
            }}
        />
    );
}
