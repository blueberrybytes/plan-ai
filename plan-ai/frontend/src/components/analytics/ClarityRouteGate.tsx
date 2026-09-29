import React, { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import { selectUser } from "../../store/slices/auth/authSelector";
import { syncClarityWithRoute } from "../../utils/clarity";

/**
 * Starts Microsoft Clarity on public marketing pages and stops it on every other route.
 * Must be rendered inside the Router. Renders nothing.
 */
const ClarityRouteGate: React.FC = () => {
  const { pathname } = useLocation();
  const user = useSelector(selectUser);
  const isSignedIn = !!user;

  // Layout effect: stop Clarity in the same task as the route change, before its
  // mutation observer sees the new page.
  useLayoutEffect(() => {
    syncClarityWithRoute(pathname, isSignedIn);
  }, [pathname, isSignedIn]);

  return null;
};

export default ClarityRouteGate;
