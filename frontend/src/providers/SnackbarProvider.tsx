import React from "react";
import { Snackbar, Alert } from "@mui/material";
import { useDispatch, useSelector } from "react-redux";
import { clearToastMessage } from "../store/slices/app/appSlice";
import { selectToastMessage } from "../store/slices/app/appSelector";

const SnackbarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const dispatch = useDispatch();
  const toastMessage = useSelector(selectToastMessage);

  const handleClose = () => {
    dispatch(clearToastMessage());
  };

  return (
    <>
      {children}
      {toastMessage && (
        <Snackbar
          open={!!toastMessage}
          autoHideDuration={toastMessage.autoHideDuration ?? 3000}
          onClose={handleClose}
          anchorOrigin={
            toastMessage.anchorOrigin ?? {
              vertical: "top",
              horizontal: "center",
            }
          }
        >
          <Alert
            onClose={handleClose}
            severity={toastMessage.severity || "info"}
            sx={{ width: "100%" }}
          >
            {toastMessage.message}
          </Alert>
        </Snackbar>
      )}
    </>
  );
};

export default SnackbarProvider;
