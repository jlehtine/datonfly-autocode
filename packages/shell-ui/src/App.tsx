import { Box, createTheme, CssBaseline, Divider, ThemeProvider, Typography, useMediaQuery } from "@mui/material";
import { useCallback, useMemo, useState } from "react";

import type { BridgeHost } from "./bridge/host.js";
import { AppFrame } from "./components/AppFrame.js";
import { ChatPanel } from "./components/ChatPanel.js";
import { RecoveryPanel } from "./components/RecoveryPanel.js";
import { SessionPanel } from "./components/SessionPanel.js";
import { useAppSession } from "./session/useAppSession.js";

const DEFAULT_APP_FRAME_ORIGIN = "http://localhost:5273";

function resolveAppFrame(): { appUrl: string; appOrigin: string } {
    const appOrigin = import.meta.env.VITE_APP_FRAME_ORIGIN ?? DEFAULT_APP_FRAME_ORIGIN;
    const appUrl = import.meta.env.VITE_APP_FRAME_URL ?? appOrigin;
    return { appUrl, appOrigin };
}

/**
 * The framework Shell top frame.
 *
 * Hosts the assistant chat, the sandboxed application sub-frame, and the
 * bridge-derived session and recovery panels.
 */
export function App(): React.JSX.Element {
    const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
    const theme = useMemo(() => createTheme({ palette: { mode: prefersDark ? "dark" : "light" } }), [prefersDark]);

    const { state, callbacks } = useAppSession();
    const [host, setHost] = useState<BridgeHost | null>(null);
    const onHost = useCallback((next: BridgeHost | null) => {
        setHost(next);
    }, []);
    const { appUrl, appOrigin } = useMemo(() => resolveAppFrame(), []);

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
                        <SessionPanel state={state} />
                        <RecoveryPanel host={host} />
                    </Box>
                </Box>
            </Box>
        </ThemeProvider>
    );
}
