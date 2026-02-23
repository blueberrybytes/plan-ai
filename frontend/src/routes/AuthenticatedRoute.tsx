import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useSelector } from "react-redux";
import { selectUser } from "../store/slices/auth/authSelector";

const AuthenticatedRoute: React.FC = () => {
  const user = useSelector(selectUser);

  return user && user.emailVerified ? <Outlet /> : <Navigate to="/" replace />;
};

export default AuthenticatedRoute;
