import React, { useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { selectErrorSession, selectUser } from "../store/slices/auth/authSelector";
import { setToastMessage } from "../store/slices/app/appSlice";
import { sessionError } from "../store/slices/auth/authSlice";

const UnauthenticatedRoute: React.FC = () => {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const errorSession = useSelector(selectErrorSession);

  useEffect(() => {
    if (errorSession) {
      dispatch(
        setToastMessage({
          message: errorSession?.message || "Unexpected Error",
          severity: "error",
        }),
      );
      dispatch(sessionError(null));
    }
  }, [dispatch, errorSession]);

  if (user && user.emailVerified) {
    const isDesktopAuth =
      new URLSearchParams(window.location.search).get("desktop_auth") === "true";
    const localPort = new URLSearchParams(window.location.search).get("local_port");

    if (isDesktopAuth) {
      const desktopUrl = localPort ? `/auth/desktop?local_port=${localPort}` : "/auth/desktop";
      return <Navigate to={desktopUrl} replace />;
    }
    return <Navigate to="/home" replace />;
  }

  return <Outlet />;
};

export default UnauthenticatedRoute;
