import { Button, Stack, Typography } from "@mui/material";

import type { BridgeHost, RecoveryCommand } from "../bridge/host.js";

/** Props for {@link RecoveryPanel}. */
export interface RecoveryPanelProps {
    /** Bound bridge host, or `null` before the application frame has loaded. */
    host: BridgeHost | null;
}

const RECOVERY_ACTIONS: { command: RecoveryCommand; label: string }[] = [
    { command: "auto_repair", label: "Auto-repair" },
    { command: "revert", label: "Revert" },
    { command: "vanilla", label: "Vanilla" },
];

/**
 * Offer the recovery actions, dispatching each over the bridge.
 *
 * In this slice the commands are delivered to the application sub-frame over the
 * bridge only; wiring them to a real rebuild/revert lands with the recovery loop.
 */
export function RecoveryPanel({ host }: RecoveryPanelProps): React.JSX.Element {
    return (
        <Stack spacing={1} sx={{ p: 2 }}>
            <Typography variant="subtitle2">Recovery</Typography>
            <Stack direction="row" spacing={1}>
                {RECOVERY_ACTIONS.map(({ command, label }) => (
                    <Button
                        key={command}
                        size="small"
                        variant="outlined"
                        disabled={host === null}
                        onClick={(): void => {
                            host?.sendRecoveryCommand(command);
                        }}
                    >
                        {label}
                    </Button>
                ))}
            </Stack>
        </Stack>
    );
}
