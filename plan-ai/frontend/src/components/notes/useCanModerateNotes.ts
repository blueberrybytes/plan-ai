import { useSelector } from "react-redux";
import { useGetMyWorkspacesQuery } from "../../store/apis/workspaceApi";
import { selectActiveWorkspaceId } from "../../store/slices/app/appSelector";

/** Owners and admins may delete a note someone else shared with the workspace. */
export const useCanModerateNotes = (): boolean => {
  const activeWorkspaceId = useSelector(selectActiveWorkspaceId);
  const { data: workspaces } = useGetMyWorkspacesQuery();
  const role = workspaces?.find((workspace) => workspace.id === activeWorkspaceId)?.role;
  return role === "OWNER" || role === "ADMIN";
};
