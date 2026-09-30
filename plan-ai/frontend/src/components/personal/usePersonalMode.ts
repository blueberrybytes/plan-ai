import { useSelector } from "react-redux";
import { selectActiveWorkspaceId } from "../../store/slices/app/appSelector";
import { useGetMyWorkspacesQuery } from "../../store/apis/workspaceApi";
import { useGetPersonalStatusQuery } from "../../store/apis/personalApi";

/** Personal mode status, and whether trackers work in the active workspace. */
export const usePersonalMode = () => {
  const activeWorkspaceId = useSelector(selectActiveWorkspaceId);
  const { data: status, isLoading, isError, refetch } = useGetPersonalStatusQuery();
  const { data: workspaces } = useGetMyWorkspacesQuery();
  const activeWorkspace = workspaces?.find((w) => w.id === activeWorkspaceId);
  const inPersonalWorkspace = activeWorkspace?.kind === "PERSONAL";
  const trackersReady =
    Boolean(status?.available && status.enabled) &&
    inPersonalWorkspace &&
    status?.workspaceId === activeWorkspaceId;

  return {
    status,
    isLoading,
    isError,
    refetch,
    activeWorkspace,
    inPersonalWorkspace,
    trackersReady,
    hideCalories: status?.hideCalories ?? false,
    autoExtract: status?.autoExtract ?? false,
  };
};
