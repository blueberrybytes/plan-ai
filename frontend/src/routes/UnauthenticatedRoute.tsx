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

  return !user || !user.emailVerified ? <Outlet /> : <Navigate to="/home" replace />;
};

export default UnauthenticatedRoute;
