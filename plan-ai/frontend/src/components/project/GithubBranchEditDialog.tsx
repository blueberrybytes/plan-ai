import React, { useState, useEffect } from "react";
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Typography,
  Box,
  TextField,
  Autocomplete,
} from "@mui/material";
import GitHubIcon from "@mui/icons-material/GitHub";
import { useGetGithubRepositoryBranchesQuery } from "../../store/apis/integrationApi";
import { useConnectGithubRepositoryMutation } from "../../store/apis/contextApi";
import { useDispatch } from "react-redux";
import { setToastMessage } from "../../store/slices/app/appSlice";
import { useTranslation } from "react-i18next";

interface GithubBranchEditDialogProps {
  open: boolean;
  contextId: string;
  installationId: string;
  repoFullName: string;
  currentBranch?: string;
  onClose: () => void;
  onSuccess: () => void;
}

const GithubBranchEditDialog: React.FC<GithubBranchEditDialogProps> = ({
  open,
  contextId,
  installationId,
  repoFullName,
  currentBranch,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const dispatch = useDispatch();

  const [selectedBranch, setSelectedBranch] = useState<string>("");

  useEffect(() => {
    if (open) {
      setSelectedBranch(currentBranch || "");
    }
  }, [open, currentBranch]);

  const parsedSelection = React.useMemo(() => {
    if (!repoFullName) return null;
    const [owner, repo] = repoFullName.split("/");
    return { owner, repo, installationId };
  }, [repoFullName, installationId]);

  const { data: branchesData, isLoading: isFetchingBranches } = useGetGithubRepositoryBranchesQuery(
    parsedSelection
      ? {
          installationId: parsedSelection.installationId,
          owner: parsedSelection.owner,
          repo: parsedSelection.repo,
        }
      : { installationId: "", owner: "", repo: "" },
    { skip: !open || !parsedSelection },
  );

  const [connectGithub, { isLoading: isConnecting }] = useConnectGithubRepositoryMutation();

  const handleUpdate = async () => {
    try {
      await connectGithub({
        contextId,
        body: {
          installationId,
          repoFullName,
          branch: selectedBranch || undefined,
        },
      }).unwrap();

      dispatch(
        setToastMessage({
          severity: "success",
          message: "Successfully requested GitHub repository re-sync with updated branch.",
        }),
      );

      onSuccess();
      onClose();
    } catch (error) {
      console.error("Failed to re-sync GitHub repository branch", error);
      dispatch(
        setToastMessage({
          severity: "error",
          message: "Failed to connect GitHub repository.",
        }),
      );
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <GitHubIcon /> Edit Synchronization Branch
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mt: 1 }}>
          <Typography variant="body2" sx={{ mb: 3 }} color="text.secondary">
            Change the default branch or re-sync this repository against the selected branch
            context.
          </Typography>

          <TextField label="Repository" value={repoFullName} fullWidth disabled sx={{ mb: 3 }} />

          <Autocomplete
            fullWidth
            options={[
              // Empty string = "Default branch" sentinel
              "",
              ...(branchesData?.branches.map((b) => b.name) ?? []),
            ]}
            getOptionLabel={(option) => (option === "" ? "Default branch" : option)}
            value={selectedBranch}
            onChange={(_e, value) => setSelectedBranch(value ?? "")}
            loading={isFetchingBranches}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Branch"
                placeholder="Search branches..."
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {isFetchingBranches ? <CircularProgress size={16} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
          />
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} color="inherit">
          {t("contexts.buttons.cancel", "Cancel")}
        </Button>
        <Button
          onClick={handleUpdate}
          variant="contained"
          disabled={isConnecting}
          startIcon={isConnecting ? <CircularProgress size={20} color="inherit" /> : null}
        >
          {isConnecting ? "Updating..." : "Update Branch"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default GithubBranchEditDialog;
