import React, { useEffect, useRef, useState } from "react";
import { Box, Card, CardContent, Typography, Button, CircularProgress, Link } from "@mui/material";
import MarkdownRenderer from "../common/MarkdownRenderer";
import {
  CheckCircleOutline,
  DescriptionOutlined,
  OpenInNew as OpenInNewIcon,
} from "@mui/icons-material";
import { useSelector } from "react-redux";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import { RootState } from "../../store/store";

interface AssistantMessageRendererProps {
  content: string;
  onSendMessage?: (msg: string) => void;
  isStreaming?: boolean;
}

// Match: [UI:NAVIGATE path="/slides/create"]
const NAVIGATE_MARKER_RE = /\[UI:NAVIGATE\s+path="([^"]+)"\]/;

export const AssistantMessageRenderer: React.FC<AssistantMessageRendererProps> = ({
  content,
  onSendMessage,
  isStreaming,
}) => {
  const [isTyping, setIsTyping] = useState(false);
  const token = useSelector((state: RootState) => state.auth.user?.token);
  const navigate = useNavigate();

  // ── Navigation marker handling ────────────────────────────────────────
  // The backend emits [UI:NAVIGATE path="..."] when the assistant calls the
  // `navigate` tool. We:
  //   1. Wait until streaming has finished to avoid jumping mid-response.
  //   2. Track which content string we've already auto-navigated for so we
  //      don't re-navigate on re-render.
  //   3. Replace the raw marker in-text with a friendly chip linking to the
  //      destination, so the user can click again if they bounce back.
  const navigateMatch = content.match(NAVIGATE_MARKER_RE);
  const navigatedForContent = useRef<string | null>(null);
  useEffect(() => {
    if (!navigateMatch) return;
    if (isStreaming) return; // wait for the full text to settle
    if (navigatedForContent.current === content) return;
    navigatedForContent.current = content;
    navigate(navigateMatch[1]);
  }, [content, isStreaming, navigate, navigateMatch]);

  // Regex looking for: [UI:CONFIRM_DOC purpose="X" recordingId="Y" recordingName="Z" contextId="A" contextName="B"]
  const confirmMatch = content.match(
    /\[UI:CONFIRM_DOC\s+purpose="([^"]+)"\s+recordingId="([^"]+)"\s+recordingName="([^"]*)"\s+contextId="([^"]*)"\s+contextName="([^"]*)"\]/,
  );

  if (confirmMatch) {
    const purpose = confirmMatch[1];
    const recordingId = confirmMatch[2];
    const recordingName = confirmMatch[3] || recordingId;
    const contextId = confirmMatch[4];
    const contextName = confirmMatch[5] || contextId || "None";
    const textBefore = content.split(/\[UI:CONFIRM_DOC/)[0].trim();

    const handleConfirm = async () => {
      setIsTyping(true);
      try {
        const baseUrl = (process.env.REACT_APP_API_BACKEND_URL || "").replace(/\/$/, "");
        const res = await fetch(`${baseUrl}/api/documents`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: "AI Generated Document",
            transcriptIds: recordingId ? [recordingId] : [],
            contextIds: contextId && contextId !== "None" ? [contextId] : [],
            prompt: purpose,
          }),
        });
        if (!res.ok) throw new Error("Failed to generate document");
        const data = await res.json();
        onSendMessage &&
          onSendMessage(
            `Success! I have generated your document: [View Document](/docs/${data.id})`,
          );
      } catch (e) {
        onSendMessage && onSendMessage(`Sorry, there was an error generating the document.`);
      } finally {
        setIsTyping(false);
      }
    };

    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        {textBefore.length > 0 && <MarkdownRenderer content={textBefore} isStreaming={isStreaming} />}
        <Card variant="outlined" sx={{ mt: 1, bgcolor: "background.paper" }}>
          <Box
            sx={{
              p: 2,
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              borderBottom: 1,
              borderColor: "divider",
            }}
          >
            <DescriptionOutlined color="primary" />
            <Box>
              <Typography variant="subtitle2" fontWeight="bold">
                Generate Document
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Confirmation Required
              </Typography>
            </Box>
          </Box>
          <CardContent
            sx={{ pt: 2, pb: "16px !important", gap: 1, display: "flex", flexDirection: "column" }}
          >
            <Typography variant="body2">
              Ensure the following parameters are correct before generating:
            </Typography>
            <Box sx={{ bgcolor: "action.hover", p: 1.5, borderRadius: 1 }}>
              <Typography variant="caption" fontWeight="bold" display="block">
                Purpose:
              </Typography>
              <Typography variant="body2" mb={1}>
                {purpose}
              </Typography>

              <Typography variant="caption" fontWeight="bold" display="block">
                Recording:
              </Typography>
              <Typography variant="body2" mb={1}>
                {recordingName}
              </Typography>

              <Typography variant="caption" fontWeight="bold" display="block">
                Context:
              </Typography>
              <Typography variant="body2">{contextName}</Typography>
            </Box>
            <Box sx={{ mt: 2, display: "flex", gap: 1 }}>
              <Button
                variant="contained"
                size="small"
                onClick={handleConfirm}
                disabled={isTyping}
                startIcon={isTyping ? <CircularProgress size={16} /> : null}
              >
                Confirm & Generate
              </Button>
              <Button
                variant="text"
                size="small"
                color="error"
                disabled={isTyping}
                onClick={() => onSendMessage && onSendMessage("Cancel that document.")}
              >
                Cancel
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Box>
    );
  }

  // Regex looking for: [UI:CONFIRM_TASK title="X" description="Y" projectId="Z" projectName="A"]
  const taskMatch = content.match(
    /\[UI:CONFIRM_TASK\s+title="([^"]+)"\s+description="([^"]*)"\s+projectId="([^"]+)"\s+projectName="([^"]*)"\]/,
  );

  if (taskMatch) {
    const title = taskMatch[1];
    const description = taskMatch[2];
    const projectId = taskMatch[3];
    const projectName = taskMatch[4] || projectId;
    const textBefore = content.split(/\[UI:CONFIRM_TASK/)[0].trim();

    const handleConfirm = async () => {
      setIsTyping(true);
      try {
        const baseUrl = (process.env.REACT_APP_API_BACKEND_URL || "").replace(/\/$/, "");
        const res = await fetch(`${baseUrl}/api/tasks`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            projectId,
            title,
            description,
          }),
        });
        if (!res.ok) throw new Error("Failed to create task");
        const data = await res.json();
        onSendMessage &&
          onSendMessage(
            `Success! Task created: [View Task](/projects/${projectId}?task=${data.id})`,
          );
      } catch (e) {
        onSendMessage && onSendMessage(`Sorry, there was an error creating the task.`);
      } finally {
        setIsTyping(false);
      }
    };

    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        {textBefore.length > 0 && <MarkdownRenderer content={textBefore} isStreaming={isStreaming} />}
        <Card variant="outlined" sx={{ mt: 1, bgcolor: "background.paper" }}>
          <Box
            sx={{
              p: 2,
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              borderBottom: 1,
              borderColor: "divider",
            }}
          >
            <CheckCircleOutline color="success" />
            <Box>
              <Typography variant="subtitle2" fontWeight="bold">
                Create Task
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Confirmation Required
              </Typography>
            </Box>
          </Box>
          <CardContent
            sx={{ pt: 2, pb: "16px !important", gap: 1, display: "flex", flexDirection: "column" }}
          >
            <Typography variant="body2">
              Ensure the following details are correct before creating the task:
            </Typography>
            <Box sx={{ bgcolor: "action.hover", p: 1.5, borderRadius: 1 }}>
              <Typography variant="caption" fontWeight="bold" display="block">
                Title:
              </Typography>
              <Typography variant="body2" mb={1}>
                {title}
              </Typography>

              <Typography variant="caption" fontWeight="bold" display="block">
                Description:
              </Typography>
              <Typography variant="body2" mb={1}>
                {description || "None"}
              </Typography>

              <Typography variant="caption" fontWeight="bold" display="block">
                Project:
              </Typography>
              <Typography variant="body2">{projectName}</Typography>
            </Box>
            <Box sx={{ mt: 2, display: "flex", gap: 1 }}>
              <Button
                variant="contained"
                size="small"
                onClick={handleConfirm}
                disabled={isTyping}
                startIcon={isTyping ? <CircularProgress size={16} /> : null}
              >
                Confirm & Create Task
              </Button>
              <Button
                variant="text"
                size="small"
                color="error"
                disabled={isTyping}
                onClick={() => onSendMessage && onSendMessage("Cancel that task.")}
              >
                Cancel
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Box>
    );
  }

  // If the message contains a navigation marker, strip it from the markdown
  // and append a friendly clickable chip the user can re-trigger.
  if (navigateMatch) {
    const cleanContent = content.replace(NAVIGATE_MARKER_RE, "").trim();
    const path = navigateMatch[1];
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {cleanContent && <MarkdownRenderer content={cleanContent} isStreaming={isStreaming} />}
        <Link
          component={RouterLink}
          to={path}
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.5,
            fontSize: "0.8rem",
            alignSelf: "flex-start",
            textDecoration: "none",
            color: "primary.main",
            "&:hover": { textDecoration: "underline" },
          }}
        >
          <OpenInNewIcon sx={{ fontSize: 14 }} />
          Open {path}
        </Link>
      </Box>
    );
  }

  return <MarkdownRenderer content={content} isStreaming={isStreaming} />;
};

export default AssistantMessageRenderer;
