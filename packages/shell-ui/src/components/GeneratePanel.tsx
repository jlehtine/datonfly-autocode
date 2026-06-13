import { Button, Chip, Stack, TextField, Typography } from "@mui/material";
import { useState } from "react";

import type { CodegenState } from "../control-plane/useControlPlaneSession.js";

/** Props for {@link GeneratePanel}. */
export interface GeneratePanelProps {
    /** Live state of the most recent Generate run. */
    state: CodegenState;
    /** Whether generation is unavailable (e.g. no active workspace). */
    disabled: boolean;
    /** Submit a Generate prompt to the control plane. */
    onGenerate: (prompt: string) => void;
}

const STEP_LABEL: Record<CodegenState["steps"][number]["step"], string> = {
    "planned-diff": "Planned diff",
    commit: "Commit",
    build: "Build",
    deploy: "Deploy",
};

/**
 * Minimal Generate trigger: a prompt field, a submit button, and the live list
 * of steps streamed for the active job. Full chat-driven generation is a later
 * slice; this panel drives the codegen endpoint directly.
 */
export function GeneratePanel({ state, disabled, onGenerate }: GeneratePanelProps): React.JSX.Element {
    const [prompt, setPrompt] = useState("");
    const running = state.status === "running";

    const submit = (): void => {
        const trimmed = prompt.trim();
        if (trimmed === "" || running) {
            return;
        }
        onGenerate(trimmed);
    };

    return (
        <Stack spacing={1} sx={{ p: 2, minWidth: 280 }}>
            <Typography variant="subtitle2">Generate</Typography>
            <TextField
                size="small"
                multiline
                minRows={2}
                placeholder="Describe a change…"
                value={prompt}
                onChange={(event): void => {
                    setPrompt(event.target.value);
                }}
                disabled={running}
            />
            <Button
                size="small"
                variant="contained"
                onClick={submit}
                disabled={disabled || running || prompt.trim() === ""}
            >
                {running ? "Generating…" : "Generate"}
            </Button>
            {state.steps.length > 0 && (
                <Stack spacing={0.5}>
                    {state.steps.map((view, index) => (
                        <Typography
                            key={`${String(index)}-${view.step}-${view.phase}`}
                            variant="body2"
                            color="text.secondary"
                        >
                            {STEP_LABEL[view.step]} — {view.phase}
                            {view.ok === false ? " (failed)" : ""}
                        </Typography>
                    ))}
                </Stack>
            )}
            {state.status === "succeeded" && <Chip size="small" color="success" label="Generated" />}
            {state.status === "failed" && (
                <Typography variant="body2" color="error.main">
                    Generation failed{state.error !== undefined ? `: ${state.error}` : ""}
                </Typography>
            )}
        </Stack>
    );
}
