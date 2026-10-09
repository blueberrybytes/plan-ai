import React, { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import { selectUser } from "../../store/slices/auth/authSelector";
import { selectActiveWorkspaceId } from "../../store/slices/app/appSelector";
import {
  navFeatureFor,
  setFeatureWorkspace,
  trackFeature,
  type WebFeature,
} from "../../utils/trackFeature";

/**
 * Counts each time a signed-in user opens a main section (projects, meetings,
 * notes...). Moving inside a section is not counted again. Only the name of
 * the section is sent, never the address of the page.
 * Must be rendered inside the Router. Renders nothing.
 */
const FeatureUsageRouteTracker: React.FC = () => {
  const { pathname, search } = useLocation();
  const isSignedIn = !!useSelector(selectUser);
  const workspaceId = useSelector(selectActiveWorkspaceId);
  const lastSection = useRef<WebFeature | null>(null);

  useEffect(() => {
    setFeatureWorkspace(isSignedIn ? workspaceId : null);
  }, [isSignedIn, workspaceId]);

  useEffect(() => {
    const section = navFeatureFor(pathname, search);
    if (!isSignedIn || !workspaceId) {
      lastSection.current = null;
      return;
    }
    if (section && section !== lastSection.current) trackFeature(section);
    lastSection.current = section;
  }, [pathname, search, isSignedIn, workspaceId]);

  return null;
};

export default FeatureUsageRouteTracker;
