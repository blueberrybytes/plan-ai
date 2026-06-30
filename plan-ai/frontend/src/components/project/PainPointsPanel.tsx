import React from "react";
import {
  Card,
  CardContent,
  Stack,
  Box,
  Typography,
  Chip,
  Button,
  Tooltip,
  CircularProgress,
} from "@mui/material";
import {
  ReportProblemOutlined as PainIcon,
  AddTask as AddTaskIcon,
  CheckCircleOutline as DoneIcon,
} from "@mui/icons-material";
import { useTranslation } from "react-i18next";
import type { components } from "../../types/api";
import { useConvertPainPointToTaskMutation } from "../../store/apis/projectApi";

type PainPoint = components["schemas"]["PainPointResponse"];
type Severity = components["schemas"]["PainPointSeverity"];

/** MUI Chip palette per severity. */
const SEVERITY_COLOR: Record<Severity, "error" | "warning" | "info" | "default"> = {
  BLOCKER: "error",
  HIGH: "warning",
  MEDIUM: "info",
  LOW: "default",
};

/** Enum declaration order = severity rank; lower sorts first (most severe). */
const SEVERITY_RANK: Record<Severity, number> = {
  BLOCKER: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

interface PainPointsPanelProps {
  painPoints: PainPoint[] | undefined;
  projectId: string;
  transcriptId: string;
}

/**
 * Renders the AI-extracted pain points of a meeting, ranked most-severe first,
 * with a one-click "convert to task" action that spawns a resolving ticket.
 * Renders nothing when the meeting raised no pain points.
 */
const PainPointsPanel: React.FC<PainPointsPanelProps> = ({
  painPoints,
  projectId,
  transcriptId,
}) => {
  const { t } = useTranslation();
  const [convertPainPoint, { isLoading }] = useConvertPainPointToTaskMutation();
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  if (!painPoints || painPoints.length === 0) return null;

  const sorted = [...painPoints].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );

  const handleConvert = async (painPointId: string) => {
    setPendingId(painPointId);
    try {
      await convertPainPoint({ projectId, transcriptId, painPointId }).unwrap();
    } catch {
      // Tag invalidation refetches the transcript; a 409 (already converted)
      // simply re-renders as the "converted" state. Keep the panel resilient.
    } finally {
      setPendingId(null);
    }
  };

  return (
    <Card variant="outlined" sx={{ mt: 2 }}>
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
          <PainIcon color="warning" fontSize="small" />
          <Typography variant="h6" fontWeight={600}>
            {t("painPoints.title")}
          </Typography>
          <Chip size="small" label={sorted.length} />
        </Stack>

        <Stack spacing={1.5}>
          {sorted.map((pp) => {
            const converted = Boolean(pp.resolutionTaskId);
            const busy = isLoading && pendingId === pp.id;
            return (
              <Box
                key={pp.id}
                sx={{
                  p: 1.5,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 2,
                }}
              >
                <Stack
                  direction="row"
                  alignItems="flex-start"
                  justifyContent="space-between"
                  spacing={1}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Stack
                      direction="row"
                      alignItems="center"
                      spacing={1}
                      sx={{ mb: 0.5, flexWrap: "wrap", rowGap: 0.5 }}
                    >
                      <Chip
                        size="small"
                        label={t(`painPoints.severity.${pp.severity}`)}
                        color={SEVERITY_COLOR[pp.severity]}
                        variant={pp.severity === "LOW" ? "outlined" : "filled"}
                        sx={{ fontWeight: "bold" }}
                      />
                      <Chip
                        size="small"
                        variant="outlined"
                        label={t(`painPoints.status.${pp.status}`)}
                      />
                      {pp.affected && (
                        <Typography variant="caption" color="text.secondary">
                          {t("painPoints.affected", { who: pp.affected })}
                        </Typography>
                      )}
                    </Stack>

                    <Typography variant="body1" sx={{ fontWeight: 500 }}>
                      {pp.problem}
                    </Typography>

                    {pp.evidence && (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{
                          mt: 0.5,
                          fontStyle: "italic",
                          borderLeft: "3px solid",
                          borderColor: "divider",
                          pl: 1,
                        }}
                      >
                        {`“${pp.evidence}”`}
                      </Typography>
                    )}

                    {pp.suggestedResolution && (
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        <strong>{t("painPoints.suggested")}</strong> {pp.suggestedResolution}
                      </Typography>
                    )}
                  </Box>

                  <Box sx={{ flexShrink: 0 }}>
                    {converted ? (
                      <Tooltip title={t("painPoints.convertedTooltip")}>
                        <Chip
                          size="small"
                          icon={<DoneIcon />}
                          color="success"
                          variant="outlined"
                          label={t("painPoints.converted")}
                        />
                      </Tooltip>
                    ) : (
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={busy ? <CircularProgress size={14} /> : <AddTaskIcon />}
                        onClick={() => handleConvert(pp.id)}
                        disabled={busy}
                      >
                        {t("painPoints.convert")}
                      </Button>
                    )}
                  </Box>
                </Stack>
              </Box>
            );
          })}
        </Stack>
      </CardContent>
    </Card>
  );
};

export default PainPointsPanel;
