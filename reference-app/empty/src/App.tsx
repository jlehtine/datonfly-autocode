import { createTheme, CssBaseline, ThemeProvider } from "@mui/material";
import type { JSX } from "react";

const theme = createTheme();

/**
 * Empty placeholder application root.
 *
 * Renders only the Material UI theme baseline and no content. This is the
 * application-owned root that the codegen agent fills in; the empty app exists to
 * exercise code generation from scratch.
 */
export function App(): JSX.Element {
    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
        </ThemeProvider>
    );
}
