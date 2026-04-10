import { ChatHistoryEmbed } from "@datonfly-assistant/chat-ui-mui";
import { Box } from "@mui/material";

/**
 * Embed the assistant chat in the Shell top frame.
 *
 * The chat talks to the assistant backend over the Shell's own origin (the dev
 * server proxies the assistant API paths to it). In this slice the chat is fully
 * functional but is not yet wired to drive the application sub-frame; binding the
 * assistant to Operate dispatch and the repair conversation lands later.
 */
export function ChatPanel(): React.JSX.Element {
    return (
        <Box sx={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
            <ChatHistoryEmbed config={{ url: window.location.origin }} />
        </Box>
    );
}
