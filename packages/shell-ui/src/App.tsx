import { Box, createTheme, CssBaseline, Divider, ThemeProvider, Typography, useMediaQuery } from "@mui/material";
import { useCallback, useMemo, useState } from "react";

import type { RecoveryChoice } from "@datonfly-autocode/core";

import type { BridgeHost } from "./bridge/host.js";
import { AppFrame } from "./components/AppFrame.js";
import { ChatPanel } from "./components/ChatPanel.js";
import { RecoveryPanel } from "./components/RecoveryPanel.js";
import { SessionPanel } from "./components/SessionPanel.js";
import { useControlPlaneSession } from "./control-plane/useControlPlaneSession.js";
import { useAppSession } from "./session/useAppSession.js";

/** Derive the application sub-frame origin from its runtime URL for bridge validation. */
function originOf(url: string | undefined): string {
    if (!url) {
        return "";
    }
    try {
        return new URL(url).origin;
    } catch {
        return "";
    }
}

/**
 * The framework Shell top frame.
 *
 * Hosts the assistant chat, the sandboxed application sub-frame pointed at the
 * control plane's App Runtime URL, and the control-plane session and recovery
 * panels. The bridge host stays wired to the sub-frame but is inert against the
 * stub workload this slice.
 */
export function App(): React.JSX.Element {
    const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
    const theme = useMemo(() => createTheme({ palette: { mode: prefersDark ? "dark" : "light" } }), [prefersDark]);

    const { state: sessionState, recover } = useControlPlaneSession();
    const { callbacks } = useAppSession();
    const [host, setHost] = useState<BridgeHost | null>(null);
    const onHost = useCallback((next: BridgeHost | null) => {
        setHost(next);
    }, []);
    const onRecover = useCallback(
        (choice: RecoveryChoice) => {
            void recover(choice);
        },
        [recover],
    );

    const appUrl = sessionState.appRuntimeUrl ?? "";
    const appOrigin = useMemo(() => originOf(sessionState.appRuntimeUrl), [sessionState.appRuntimeUrl]);

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <Box sx={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden" }}>
                <Box
                    sx={{
                        width: 570,
                        minWidth: 480,
                        display: "flex",
                        flexDirection: "column",
                        borderRight: 1,
                        borderColor: "divider",
                        minHeight: 0,
                    }}
                >
                    <Typography variant="subtitle1" sx={{ p: 2, pb: 1 }}>
                        Assistant
                    </Typography>
                    <Divider />
                    <Box sx={{ flex: 1, minHeight: 0 }}>
                        <ChatPanel />
                    </Box>
                </Box>
                <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
                    <AppFrame appUrl={appUrl} appOrigin={appOrigin} callbacks={callbacks} onHost={onHost} />
                    <Divider />
                    <Box sx={{ display: "flex", flexWrap: "wrap" }}>
                        <SessionPanel state={sessionState} />
                        <RecoveryPanel host={host} onRecover={onRecover} />
                    </Box>
                </Box>
            </Box>
        </ThemeProvider>
    );
}
