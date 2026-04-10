import { Button, Stack, Typography } from "@mui/material";

import type { RecoveryChoice } from "@datonfly-autocode/core";

import type { BridgeHost, RecoveryCommand } from "../bridge/host.js";

/** Props for {@link RecoveryPanel}. */
export interface RecoveryPanelProps {
    /** Bound bridge host, or `null` before the application frame has loaded. */
    host: BridgeHost | null;
    /** Apply a recovery choice through the control plane. */
    onRecover: (choice: RecoveryChoice) => void;
}

const RECOVERY_ACTIONS: { command: RecoveryCommand; label: string }[] = [
    { command: "auto_repair", label: "Auto-repair" },
    { command: "revert", label: "Revert" },
    { command: "vanilla", label: "Vanilla" },
];

/**
 * Offer the recovery actions, applying each through the control plane.
 *
 * Each choice is POSTed to the control-plane recovery endpoint (a state
 * transition only this slice) and, best-effort, also delivered to the
 * application sub-frame over the bridge.
 */
export function RecoveryPanel({ host, onRecover }: RecoveryPanelProps): React.JSX.Element {
    return (
        <Stack spacing={1} sx={{ p: 2 }}>
            <Typography variant="subtitle2">Recovery</Typography>
            <Stack direction="row" spacing={1}>
                {RECOVERY_ACTIONS.map(({ command, label }) => (
                    <Button
                        key={command}
                        size="small"
                        variant="outlined"
                        onClick={(): void => {
                            onRecover(command);
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
