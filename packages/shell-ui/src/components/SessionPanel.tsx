import { Box, Chip, Stack, Typography } from "@mui/material";

import type { ControlPlaneSessionState, ControlPlaneStatus } from "../control-plane/useControlPlaneSession.js";

/** Props for {@link SessionPanel}. */
export interface SessionPanelProps {
    /** Current control-plane session state. */
    state: ControlPlaneSessionState;
}

const STATUS_COLOR: Record<ControlPlaneStatus, "default" | "info" | "success" | "warning" | "error"> = {
    initializing: "default",
    starting: "info",
    active: "success",
    idle: "warning",
    expired: "default",
    error: "error",
};

const STATUS_LABEL: Record<ControlPlaneStatus, string> = {
    initializing: "Initializing",
    starting: "Starting",
    active: "Active",
    idle: "Idle",
    expired: "Expired",
    error: "Error",
};

/** Display the control-plane session status, recovery state, and runtime URL. */
export function SessionPanel({ state }: SessionPanelProps): React.JSX.Element {
    const { status, recoveryState, appRuntimeUrl, error } = state;

    return (
        <Stack spacing={1} sx={{ p: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="subtitle2">Session</Typography>
                <Chip size="small" color={STATUS_COLOR[status]} label={STATUS_LABEL[status]} />
            </Stack>
            <Typography variant="body2" color="text.secondary">
                Recovery: {recoveryState ?? "—"}
            </Typography>
            <Typography variant="body2" color="text.secondary">
                App Runtime: {appRuntimeUrl ?? "—"}
            </Typography>
            {error !== undefined && (
                <Box>
                    <Typography variant="body2" color="error.main">
                        Error: {error}
                    </Typography>
                </Box>
            )}
        </Stack>
    );
}
