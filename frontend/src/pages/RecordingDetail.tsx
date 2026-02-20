import React, { useState } from "react";
import {
  Box,
  Typography,
  Stack,
  Card,
  CardContent,
  CircularProgress,
  IconButton,
  Button,
  Divider,
} from "@mui/material";
import {
  ArrowBack as BackIcon,
  ContentCopy as CopyIcon,
  Download as DownloadIcon,
} from "@mui/icons-material";
import { useParams, useNavigate } from "react-router-dom";
import { useGetTranscriptQuery } from "../store/apis/transcriptApi";
import SidebarLayout from "../components/layout/SidebarLayout";
import { useDispatch } from "react-redux";
import { setToastMessage } from "../store/slices/app/appSlice";

const RecordingDetail: React.FC = () => {
  const { recordingId } = useParams<{ recordingId: string }>();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const {
    data: transcript,
    isLoading,
    error,
  } = useGetTranscriptQuery(recordingId || "", {
    skip: !recordingId,
  });

  const [copying, setCopying] = useState(false);

  const handleCopy = async () => {
    const text = transcript?.data?.transcript;
    if (!text) return;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(text);
      dispatch(
        setToastMessage({ message: "Transcript copied to clipboard!", severity: "success" }),
      );
    } catch (err) {
      console.error("Failed to copy text", err);
      dispatch(setToastMessage({ message: "Failed to copy transcript", severity: "error" }));
    } finally {
      setTimeout(() => setCopying(false), 2000);
    }
  };

  const handleDownload = () => {
    const text = transcript?.data?.transcript;
    if (!text) return;

    const element = document.createElement("a");
    const file = new Blob([text], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = `${transcript.data?.title || "transcript"}.txt`;
    document.body.appendChild(element); // Required for this to work in FireFox
    element.click();
    document.body.removeChild(element);
  };

  if (isLoading) {
    return (
      <SidebarLayout>
        <Box sx={{ display: "flex", justifyContent: "center", p: 4, mt: 8 }}>
          <CircularProgress />
        </Box>
      </SidebarLayout>
    );
  }

  if (error || !transcript) {
    return (
      <SidebarLayout>
        <Box sx={{ p: 4, mt: 4 }}>
          <Button startIcon={<BackIcon />} onClick={() => navigate("/recordings")} sx={{ mb: 2 }}>
            Back to Recordings
          </Button>
          <Typography color="error">Failed to load the recording details.</Typography>
        </Box>
      </SidebarLayout>
    );
  }

  return (
    <SidebarLayout>
      <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1000, mx: "auto" }}>
        {/* Header */}
        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", sm: "center" }}
          spacing={2}
          sx={{ mb: 4 }}
        >
          <Stack direction="row" alignItems="center" spacing={2}>
            <IconButton onClick={() => navigate("/recordings")}>
              <BackIcon />
            </IconButton>
            <Box>
              <Typography variant="h4" fontWeight={800} sx={{ wordBreak: "break-word" }}>
                {transcript.data?.title || "Untitled Recording"}
              </Typography>
              <Typography color="text.secondary" variant="body2">
                Recorded on{" "}
                {transcript.data?.recordedAt
                  ? new Date(transcript.data.recordedAt).toLocaleString()
                  : transcript.data?.createdAt
                    ? new Date(transcript.data.createdAt).toLocaleString()
                    : "Unknown"}
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={2}>
            <Button
              variant="outlined"
              startIcon={<CopyIcon />}
              onClick={handleCopy}
              disabled={copying || !transcript.data?.transcript}
            >
              {copying ? "Copied!" : "Copy Text"}
            </Button>
            <Button
              variant="contained"
              startIcon={<DownloadIcon />}
              onClick={handleDownload}
              disabled={!transcript.data?.transcript}
            >
              Download .txt
            </Button>
          </Stack>
        </Stack>

        <Divider sx={{ mb: 4 }} />

        {/* Content */}
        <Card elevation={0} sx={{ border: 1, borderColor: "divider" }}>
          <CardContent sx={{ p: { xs: 2, md: 4 } }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
              Transcript
            </Typography>
            {transcript.data?.transcript ? (
              <Typography
                variant="body1"
                sx={{
                  whiteSpace: "pre-wrap",
                  color: "text.primary",
                  lineHeight: 1.8,
                  fontSize: "1.05rem",
                }}
              >
                {transcript.data.transcript}
              </Typography>
            ) : (
              <Typography color="text.secondary" sx={{ fontStyle: "italic" }}>
                No transcript text generated yet.
              </Typography>
            )}
          </CardContent>
        </Card>
      </Box>
    </SidebarLayout>
  );
};

export default RecordingDetail;
