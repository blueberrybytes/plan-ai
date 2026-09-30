import { useCallback } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import type { ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";
import { workspaceApi } from "../../store/apis/workspaceApi";
import { setActiveWorkspaceId } from "../../store/slices/app/appSlice";

/**
 * Reloads the workspace list (the personal workspace may be new), makes the
 * personal workspace active and opens the trackers page.
 */
export const useSwitchToPersonal = () => {
  const dispatch = useDispatch<ThunkDispatch<unknown, unknown, UnknownAction>>();
  const navigate = useNavigate();

  return useCallback(
    async (workspaceId: string | null) => {
      if (!workspaceId) return;
      try {
        await dispatch(
          workspaceApi.endpoints.getMyWorkspaces.initiate(undefined, {
            forceRefetch: true,
            subscribe: false,
          }),
        ).unwrap();
      } catch {
        // The switcher loads the list again on its own.
      }
      dispatch(setActiveWorkspaceId(workspaceId));
      navigate("/trackers");
    },
    [dispatch, navigate],
  );
};
