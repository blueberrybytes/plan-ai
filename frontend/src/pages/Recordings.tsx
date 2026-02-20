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
  Grid,
} from "@mui/material";
import { Delete as DeleteIcon, Mic as MicIcon, Refresh as RefreshIcon } from "@mui/icons-material";
import type { components } from "../types/api";
import { useTranslation } from "react-i18next";
import {
  useListGlobalTranscriptsQuery,
  useDeleteTranscriptMutation,
} from "../store/apis/transcriptApi";
import SidebarLayout from "../components/layout/SidebarLayout";

const Recordings: React.FC = () => {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch, isFetching } = useListGlobalTranscriptsQuery({
    page,
    pageSize: 20,
    source: "RECORDING",
  });
  const [deleteTranscript] = useDeleteTranscriptMutation();

  const handleDelete = async (id: string) => {
    if (window.confirm(t("confirmDeletionDialog.title"))) {
      try {
        await deleteTranscript(id).unwrap();
      } catch (err) {
        console.error("Failed to delete transcript", err);
      }
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">Failed to load recordings.</Typography>
      </Box>
    );
  }

  const transcripts = data?.transcripts || [];

  return (
    <SidebarLayout>
      <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1200, mx: "auto" }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="flex-start"
          sx={{ mb: 4 }}
        >
          <Box>
            <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 1 }}>
              <Typography variant="h4" fontWeight={800}>
                {t("sidebarLayout.nav.recordings")}
              </Typography>
              <IconButton onClick={() => refetch()} disabled={isLoading || isFetching}>
                <RefreshIcon />
              </IconButton>
            </Stack>
            <Typography color="text.secondary">
              Manage your global standalone recordings and transcripts.
            </Typography>
          </Box>
        </Stack>

        {transcripts.length === 0 ? (
          <Card sx={{ textAlign: "center", py: 8 }}>
            <MicIcon sx={{ fontSize: 64, color: "text.disabled", mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              No recordings found
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Download the Desktop App to start capturing live audio.
            </Typography>
          </Card>
        ) : (
          <Grid container spacing={3}>
            {transcripts.map(
              (transcript: components["schemas"]["StandaloneTranscriptResponse"]) => (
                <Grid item xs={12} md={6} lg={4} key={transcript.id}>
                  <Card sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
                    <CardContent sx={{ flexGrow: 1 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                        <Typography
                          variant="h6"
                          sx={{ fontSize: "1.1rem", fontWeight: 600, mb: 1 }}
                        >
                          {transcript.title || "Untitled Recording"}
                        </Typography>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => void handleDelete(transcript.id)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Stack>

                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {transcript.recordedAt
                          ? new Date(transcript.recordedAt).toLocaleString()
                          : new Date(transcript.createdAt).toLocaleString()}
                      </Typography>

                      <Typography
                        variant="body2"
                        sx={{
                          display: "-webkit-box",
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {transcript.summary ||
                          transcript.transcript ||
                          "No transcript content available."}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ),
            )}
          </Grid>
        )}

        {data && data.total > 20 && (
          <Stack direction="row" justifyContent="center" sx={{ mt: 4 }} spacing={2}>
            <Button disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </Button>
            <Button disabled={page * 20 >= data.total} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </Stack>
        )}
      </Box>
    </SidebarLayout>
  );
};

export default Recordings;
