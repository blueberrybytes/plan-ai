import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  List,
  ListItem,
  Radio,
  RadioGroup,
  Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { useGetProjectAccessQuery, useSetProjectAccessMutation } from "../../store/apis/projectApi";
import { useGetWorkspaceMembersQuery } from "../../store/apis/workspaceApi";

type Visibility = "WORKSPACE" | "RESTRICTED";

/** Opens a project to the whole workspace or restricts it to chosen people. */
const ProjectAccessCard: React.FC<{ projectId: string }> = ({ projectId }) => {
  const { t } = useTranslation();
  const { data } = useGetProjectAccessQuery(projectId);
  const { data: team } = useGetWorkspaceMembersQuery();
  const [save, { isLoading: isSaving }] = useSetProjectAccessMutation();
  const access = data?.data;

  const [visibility, setVisibility] = useState<Visibility>("WORKSPACE");
  const [chosen, setChosen] = useState<string[]>([]);
  const [outcome, setOutcome] = useState<"saved" | "failed" | null>(null);

  // Start from what is stored, and again after each save.
  useEffect(() => {
    if (!access) return;
    setVisibility(access.visibility);
    setChosen(access.members.map((m) => m.userId));
  }, [access]);

  if (!access) return null;

  const creatorName = access.creator?.name || access.creator?.email;
  const always = creatorName
    ? t("projectInfo.access.always", { creator: creatorName })
    : t("projectInfo.access.alwaysNoCreator");

  if (!access.canManage) {
    return (
      <Box>
        <Typography variant="overline" color="text.secondary">
          {t("projectInfo.access.label")}
        </Typography>
        <Typography variant="body2">
          {t(
            access.visibility === "RESTRICTED"
              ? "projectInfo.access.readOnlyRestricted"
              : "projectInfo.access.readOnlyOpen",
          )}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t("projectInfo.access.onlyManagers")}
        </Typography>
      </Box>
    );
  }

  // People who can be added: active members, without the creator (always in).
  const candidates = (team?.members ?? []).filter(
    (m): m is typeof m & { userId: string } =>
      m.status === "ACTIVE" && !!m.userId && m.userId !== access.creator?.userId,
  );
  const stored = access.members.map((m) => m.userId);
  const dirty =
    visibility !== access.visibility ||
    (visibility === "RESTRICTED" &&
      (chosen.length !== stored.length || chosen.some((id) => !stored.includes(id))));

  const toggle = (userId: string) => {
    setOutcome(null);
    setChosen((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );
  };

  const handleSave = async () => {
    try {
      await save({
        projectId,
        // The list is only sent when it applies, so opening a project keeps it for later.
        body: visibility === "RESTRICTED" ? { visibility, memberUserIds: chosen } : { visibility },
      }).unwrap();
      setOutcome("saved");
    } catch {
      setOutcome("failed");
    }
  };

  return (
    <Box>
      <Typography variant="overline" color="text.secondary">
        {t("projectInfo.access.label")}
      </Typography>
      <RadioGroup
        value={visibility}
        onChange={(event) => {
          setOutcome(null);
          setVisibility(event.target.value as Visibility);
        }}
      >
        <FormControlLabel
          value="WORKSPACE"
          control={<Radio size="small" />}
          label={t("projectInfo.access.everyone")}
        />
        <FormControlLabel
          value="RESTRICTED"
          control={<Radio size="small" />}
          label={t("projectInfo.access.restricted")}
        />
      </RadioGroup>

      {visibility === "RESTRICTED" && (
        <Box sx={{ mt: 1, maxWidth: 520 }}>
          <Typography variant="body2" color="text.secondary">
            {t("projectInfo.access.explain")} {always}
          </Typography>
          <Typography variant="subtitle2" sx={{ mt: 2 }}>
            {t("projectInfo.access.people")}
          </Typography>
          {candidates.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t("projectInfo.access.noOthers")}
            </Typography>
          ) : (
            <List dense disablePadding>
              {candidates.map((member) => (
                <ListItem key={member.userId} disableGutters disablePadding>
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={chosen.includes(member.userId)}
                        onChange={() => toggle(member.userId)}
                      />
                    }
                    label={member.name ? `${member.name} (${member.email})` : member.email}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      )}

      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mt: 2 }}>
        <Button
          variant="contained"
          size="small"
          onClick={() => void handleSave()}
          disabled={!dirty || isSaving}
        >
          {t("projectInfo.access.save")}
        </Button>
        {outcome === "saved" && !dirty && (
          <Typography variant="body2" color="text.secondary">
            {t("projectInfo.access.saved")}
          </Typography>
        )}
      </Box>
      {outcome === "failed" && (
        <Alert severity="error" sx={{ mt: 1, maxWidth: 520 }}>
          {t("projectInfo.access.failed")}
        </Alert>
      )}
    </Box>
  );
};

export default ProjectAccessCard;
