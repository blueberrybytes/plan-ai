import React, { useState } from "react";
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Typography,
  Box,
  Alert,
  Autocomplete,
  TextField,
} from "@mui/material";
import GitHubIcon from "@mui/icons-material/GitHub";
import {
  useGetGithubRepositoriesQuery,
  useGetGithubRepositoryBranchesQuery,
} from "../../store/apis/integrationApi";
import { useConnectGithubRepositoryMutation } from "../../store/apis/contextApi";
import { useDispatch } from "react-redux";
import { setToastMessage } from "../../store/slices/app/appSlice";
import { useTranslation } from "react-i18next";

interface GithubRepoSelectDialogProps {
  open: boolean;
  contextId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const GithubRepoSelectDialog: React.FC<GithubRepoSelectDialogProps> = ({
  open,
  contextId,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const dispatch = useDispatch();

  const [selectedRepoJson, setSelectedRepoJson] = useState<string>("");
  const [selectedBranch, setSelectedBranch] = useState<string>("");

  const {
    data: reposData,
    isLoading: isFetchingRepos,
    error: reposError,
  } = useGetGithubRepositoriesQuery(undefined, {
    skip: !open,
  });

  const [connectGithub, { isLoading: isConnecting }] = useConnectGithubRepositoryMutation();

  // Flatten the installation tree to make a single list of repositories
  const allRepositories = React.useMemo(() => {
    if (!reposData?.installations) return [];

    return reposData.installations.flatMap((installation) =>
      installation.repositories.map((repo) => ({
        installationId: String(installation.installationId),
        repoFullName: repo.full_name,
        repoName: repo.name,
      })),
    );
  }, [reposData]);

  const parsedSelection = React.useMemo(() => {
    if (!selectedRepoJson) return null;
    try {
      const data = JSON.parse(selectedRepoJson);
      const [owner, repoName] = data.repoFullName.split("/");
      return {
        installationId: data.installationId,
        owner,
        repoName,
        repoFullName: data.repoFullName,
      };
    } catch {
      return null;
    }
  }, [selectedRepoJson]);

  const { data: branchesData, isLoading: isFetchingBranches } = useGetGithubRepositoryBranchesQuery(
    parsedSelection
      ? {
          installationId: parsedSelection.installationId,
          owner: parsedSelection.owner,
          repo: parsedSelection.repoName,
        }
      : { installationId: "", owner: "", repo: "" },
    { skip: !parsedSelection },
  );

  const handleConnect = async () => {
    if (!selectedRepoJson) return;

    try {
      const { installationId, repoFullName } = JSON.parse(selectedRepoJson);

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
          message: "Successfully requested GitHub repository sync.",
        }),
      );

      onSuccess();
      setSelectedBranch("");
      onClose();
    } catch (error) {
      console.error("Failed to connect GitHub repository", error);
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
        <GitHubIcon /> {t("contexts.dialog.githubTitle", "Connect GitHub Repository")}
      </DialogTitle>

      <DialogContent sx={{ minHeight: "200px" }}>
        {isFetchingRepos ? (
          <Box display="flex" justifyContent="center" alignItems="center" height="100%" py={5}>
            <CircularProgress />
          </Box>
        ) : reposError ? (
          <Alert severity="error" sx={{ mt: 2 }}>
            {t(
              "contexts.dialog.githubError",
              "Failed to retrieve your connected GitHub repositories. Are you connected to GitHub in Integrations?",
            )}
          </Alert>
        ) : allRepositories.length === 0 ? (
          <Box sx={{ mt: 2, textAlign: "center", py: 4, color: "text.secondary" }}>
            <Typography variant="body1">
              No accessible repositories found. Install the GitHub app first.
            </Typography>
          </Box>
        ) : (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 2 }}>
              Select a repository to sync into this Context. The repository will be downloaded and
              processed in the background.
            </Typography>
            <Autocomplete
              fullWidth
              options={allRepositories}
              getOptionLabel={(option) => option.repoFullName}
              value={
                allRepositories.find(
                  (r) =>
                    selectedRepoJson ===
                    JSON.stringify({
                      installationId: r.installationId,
                      repoFullName: r.repoFullName,
                    }),
                ) ?? null
              }
              onChange={(_e, repo) => {
                if (repo) {
                  setSelectedRepoJson(
                    JSON.stringify({
                      installationId: repo.installationId,
                      repoFullName: repo.repoFullName,
                    }),
                  );
                } else {
                  setSelectedRepoJson("");
                }
                setSelectedBranch("");
              }}
              renderInput={(params) => (
                <TextField {...params} label="Repository" placeholder="Search repositories..." />
              )}
            />

            {parsedSelection && (
              <Autocomplete
                fullWidth
                sx={{ mt: 3 }}
                options={["", ...(branchesData?.branches.map((b) => b.name) ?? [])]}
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
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} color="inherit">
          {t("contexts.buttons.cancel", "Cancel")}
        </Button>
        <Button
          onClick={handleConnect}
          variant="contained"
          disabled={!selectedRepoJson || isConnecting}
          startIcon={isConnecting ? <CircularProgress size={20} color="inherit" /> : null}
        >
          {isConnecting ? "Syncing..." : "Connect Repository"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default GithubRepoSelectDialog;
