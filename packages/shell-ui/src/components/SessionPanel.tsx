import { Box, Chip, Stack, Typography } from "@mui/material";

import type { AppSessionState, AppSessionStatus } from "../session/useAppSession.js";

/** Props for {@link SessionPanel}. */
export interface SessionPanelProps {
    /** Current bridge-derived session state. */
    state: AppSessionState;
}

const STATUS_COLOR: Record<AppSessionStatus, "default" | "success" | "warning" | "error"> = {
    connecting: "default",
    live: "success",
    stalled: "warning",
    errored: "error",
};

const STATUS_LABEL: Record<AppSessionStatus, string> = {
    connecting: "Connecting",
    live: "Live",
    stalled: "Stalled",
    errored: "Errored",
};

/** Display the bridge-derived session status, location, and latest failure. */
export function SessionPanel({ state }: SessionPanelProps): React.JSX.Element {
    const { status, hookContractVersion, currentPath, buildError, runtimeError } = state;

    return (
        <Stack spacing={1} sx={{ p: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="subtitle2">Session</Typography>
                <Chip size="small" color={STATUS_COLOR[status]} label={STATUS_LABEL[status]} />
            </Stack>
            <Typography variant="body2" color="text.secondary">
                Hook contract: {hookContractVersion ?? "—"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
                Path: {currentPath ?? "—"}
            </Typography>
            {buildError !== undefined && (
                <Box>
                    <Typography variant="body2" color="error.main">
                        Build error: {buildError}
                    </Typography>
                </Box>
            )}
            {runtimeError !== undefined && (
                <Box>
                    <Typography variant="body2" color="error.main">
                        Runtime error: {runtimeError.message}
                    </Typography>
                </Box>
            )}
        </Stack>
    );
}
