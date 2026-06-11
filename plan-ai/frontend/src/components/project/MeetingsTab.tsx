import React from "react";
import { Link as RouterLink, useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Link,
  Stack,
  Typography,
} from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import QuestionAnswerOutlinedIcon from "@mui/icons-material/QuestionAnswerOutlined";
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined";
import SlideshowOutlinedIcon from "@mui/icons-material/SlideshowOutlined";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import { setToastMessage } from "../../store/slices/app/appSlice";
import {
  useGetProjectQuery,
  useListProjectTranscriptsQuery,
  useGenerateProjectDigestMutation,
} from "../../store/apis/projectApi";
import MeetingsChatDrawer from "./MeetingsChatDrawer";

interface MeetingsTabProps {
  projectId: string;
}

const MEETING_TYPE_LABELS: Record<string, string> = {
  general: "General",
  briefing: "Briefing / Discovery",
  tasks: "Tasks / Standup",
  decision: "Decision / Strategy",
  client: "Client",
};

/** Output chips derived from a transcript's postMeetingTasks metadata. */
const OutputChips: React.FC<{ metadata: Record<string, unknown> | null }> = ({ metadata }) => {
  const pmt = (metadata?.postMeetingTasks as Record<string, { status?: string }> | undefined) ?? {};
  const chips: React.ReactNode[] = [];
  if (pmt.doc)
    chips.push(
      <Chip key="doc" size="small" icon={<ArticleOutlinedIcon />} label="Doc" variant="outlined" />,
    );
  if (pmt.slides)
    chips.push(
      <Chip
        key="slides"
        size="small"
        icon={<SlideshowOutlinedIcon />}
        label="Slides"
        variant="outlined"
      />,
    );
  const integrations = ["jira", "linear", "trello", "notion", "asana"].filter((k) => pmt[k]);
  if (integrations.length > 0) {
    chips.push(
      <Chip
        key="tickets"
        size="small"
        icon={<AssignmentOutlinedIcon />}
        label="Tickets"
        variant="outlined"
      />,
    );
  }
  if (chips.length === 0) return null;
  return (
    <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ gap: 0.5 }}>
      {chips}
    </Stack>
  );
};

const MeetingsTab: React.FC<MeetingsTabProps> = ({ projectId }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { data: projectData } = useGetProjectQuery(projectId, { skip: !projectId });
  const { data: transcriptsData, isLoading } = useListProjectTranscriptsQuery(
    { projectId, params: undefined },
    { skip: !projectId },
  );
  const [generateDigest, { isLoading: isGenerating }] = useGenerateProjectDigestMutation();

  const meetings = transcriptsData?.data?.transcripts ?? [];
  const digestDocId = (projectData?.data?.metadata as { digestDocId?: string } | null)?.digestDocId;
  const [chatOpen, setChatOpen] = React.useState(false);

  const handleGenerateDigest = async () => {
    try {
      await generateDigest(projectId).unwrap();
      dispatch(
        setToastMessage({
          message: t("meetings.digest.started", "Generating project digest… it'll appear shortly."),
          severity: "success",
        }),
      );
    } catch {
      dispatch(
        setToastMessage({
          message: t("meetings.digest.error", "Could not generate the digest. Try again."),
          severity: "error",
        }),
      );
    }
  };

  return (
    <Stack spacing={3}>
      {/* Project Digest — cross-meeting synthesis */}
      <Card variant="outlined" sx={{ borderColor: "primary.main" }}>
        <CardContent>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <AutoAwesomeIcon color="primary" />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {t("meetings.digest.title", "Project Digest")}
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t(
              "meetings.digest.subtitle",
              "A living synthesis of all meetings: decisions, open action items, recurring themes and next steps. Confidential meetings are excluded.",
            )}
          </Typography>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Button
              variant="contained"
              startIcon={
                isGenerating ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeIcon />
              }
              onClick={handleGenerateDigest}
              disabled={isGenerating || meetings.length === 0}
            >
              {digestDocId
                ? t("meetings.digest.regenerate", "Update digest")
                : t("meetings.digest.generate", "Generate digest")}
            </Button>
            {digestDocId && (
              <Button variant="outlined" component={RouterLink} to={`/docs/view/${digestDocId}`}>
                {t("meetings.digest.view", "View digest")}
              </Button>
            )}
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
            {t(
              "meetings.contextActive",
              "The project's context (files, knowledge base) feeds every meeting automatically.",
            )}
          </Typography>
        </CardContent>
      </Card>

      <Divider />

      {/* Meetings timeline */}
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="overline" color="text.secondary">
          {t("meetings.timeline", "Meetings")} ({meetings.length})
        </Typography>
        <Button
          variant="outlined"
          size="small"
          startIcon={<QuestionAnswerOutlinedIcon />}
          onClick={() => setChatOpen(true)}
          disabled={meetings.length === 0}
        >
          {t("meetings.chat.cta", "Ask about meetings")}
        </Button>
      </Stack>

      {isLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <CircularProgress />
        </Box>
      ) : meetings.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {t("meetings.empty", "No meetings yet. Record or upload one to get started.")}
        </Typography>
      ) : (
        <Stack spacing={2}>
          {meetings.map((m) => {
            const meta = (m.metadata as Record<string, unknown> | null) ?? {};
            const meetingType = typeof meta.meetingType === "string" ? meta.meetingType : "general";
            const isConfidential = meta.confidential === true;
            const recorded = m.recordedAt ? new Date(m.recordedAt) : null;
            return (
              <Card key={m.id} variant="outlined">
                <CardActionArea
                  onClick={() => navigate(`/projects/${projectId}/info/transcripts/${m.id}`)}
                >
                  <CardContent>
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      flexWrap="wrap"
                      sx={{ mb: 0.5, gap: 0.5 }}
                    >
                      <Chip
                        size="small"
                        color="primary"
                        variant="outlined"
                        label={MEETING_TYPE_LABELS[meetingType] ?? meetingType}
                      />
                      {isConfidential && (
                        <Chip
                          size="small"
                          color="warning"
                          icon={<LockOutlinedIcon />}
                          label={t("meetings.confidential", "Confidential")}
                        />
                      )}
                      <Typography variant="caption" color="text.secondary">
                        {recorded ? recorded.toLocaleString() : ""}
                      </Typography>
                    </Stack>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      {m.title ?? t("meetings.untitled", "Untitled meeting")}
                    </Typography>
                    {m.summary && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 1 }}>
                        {m.summary.length > 200 ? `${m.summary.slice(0, 200)}…` : m.summary}
                      </Typography>
                    )}
                    <OutputChips metadata={meta} />
                  </CardContent>
                </CardActionArea>
              </Card>
            );
          })}
        </Stack>
      )}

      <Box>
        <Link
          component={RouterLink}
          to={`/projects/${projectId}/info`}
          underline="hover"
          variant="body2"
        >
          {t("meetings.viewAllInfo", "View full project info →")}
        </Link>
      </Box>

      <MeetingsChatDrawer
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        projectId={projectId}
        meetings={meetings}
      />
    </Stack>
  );
};

export default MeetingsTab;
