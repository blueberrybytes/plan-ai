import React, { useEffect, useState } from "react";
import { Alert, Box, Button, Chip, Paper, TextField, Typography } from "@mui/material";
import { QRCodeSVG } from "qrcode.react";
import {
  MultiFactorInfo,
  onIdTokenChanged,
  sendEmailVerification,
  TotpSecret,
  User,
} from "firebase/auth";
import { useTranslation } from "react-i18next";
import { useDispatch } from "react-redux";
import { auth } from "../../firebase/firebase";
import {
  finishTotpEnrollment,
  getTotpFactors,
  mfaErrorKey,
  removeFactor,
  startTotpEnrollment,
  withRecentLogin,
} from "../../services/mfaService";
import { setToastMessage } from "../../store/slices/app/appSlice";
import { useBrandIdentity } from "../../hooks/useBrandIdentity";
import ConfirmDeletionDialog from "../dialogs/ConfirmDeletionDialog";

const CODE_PATTERN = /^\d{6}$/;

/**
 * Turns two-step verification (authenticator app, TOTP) on and off for the signed-in user.
 * The QR code is drawn in the browser: the secret never goes to a third-party service.
 */
const TwoStepVerificationCard: React.FC = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { productName } = useBrandIdentity();

  const [firebaseUser, setFirebaseUser] = useState<User | null>(auth.currentUser);
  // Read again after enrol and remove: the Firebase user object changes in place.
  const [factors, setFactors] = useState<MultiFactorInfo[]>(() =>
    auth.currentUser ? getTotpFactors(auth.currentUser) : [],
  );
  const [secret, setSecret] = useState<TotpSecret | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);

  useEffect(
    () =>
      onIdTokenChanged(auth, (user) => {
        setFirebaseUser(user);
        setFactors(user ? getTotpFactors(user) : []);
      }),
    [],
  );

  const isOn = factors.length > 0;

  if (!firebaseUser) return null;

  const showError = (error: unknown) => setErrorKey(mfaErrorKey(error) ?? "mfa.errors.generic");

  const handleStart = async () => {
    setErrorKey(null);
    setBusy(true);
    try {
      setSecret(await withRecentLogin(firebaseUser, () => startTotpEnrollment(firebaseUser)));
      setCode("");
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    if (!secret) return;
    setErrorKey(null);
    setBusy(true);
    try {
      await finishTotpEnrollment(firebaseUser, secret, code, t("mfa.enrol.factorName"));
      setSecret(null);
      setCode("");
      setFactors(getTotpFactors(firebaseUser));
      dispatch(setToastMessage({ severity: "success", message: t("mfa.enrol.enabled") }));
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    setErrorKey(null);
    setBusy(true);
    try {
      await withRecentLogin(firebaseUser, async () => {
        for (const factor of getTotpFactors(firebaseUser)) {
          await removeFactor(firebaseUser, factor);
        }
      });
      setConfirmRemoveOpen(false);
      setFactors(getTotpFactors(firebaseUser));
      dispatch(setToastMessage({ severity: "success", message: t("mfa.enrol.disabled") }));
    } catch (error) {
      setConfirmRemoveOpen(false);
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  // Microsoft accounts often arrive unverified, and Firebase refuses a second
  // factor until the email is verified.
  const handleSendVerification = async () => {
    try {
      await sendEmailVerification(firebaseUser);
      setErrorKey(null);
      dispatch(setToastMessage({ severity: "info", message: t("mfa.enrol.verificationSent") }));
    } catch (error) {
      showError(error);
    }
  };

  const accountName = firebaseUser.email ?? firebaseUser.uid;

  return (
    <Paper elevation={1} sx={{ p: 3, borderRadius: 2 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          {t("mfa.enrol.title")}
        </Typography>
        <Chip
          size="small"
          color={isOn ? "success" : "default"}
          label={isOn ? t("mfa.enrol.statusOn") : t("mfa.enrol.statusOff")}
        />
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {t("mfa.enrol.description")}
      </Typography>

      {errorKey ? (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            errorKey === "mfa.errors.unverifiedEmail" ? (
              <Button color="inherit" size="small" onClick={handleSendVerification}>
                {t("mfa.enrol.sendVerification")}
              </Button>
            ) : undefined
          }
        >
          {t(errorKey)}
        </Alert>
      ) : null}

      {secret ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, maxWidth: 360 }}>
          <Typography variant="body2">{t("mfa.enrol.scanQr")}</Typography>
          <Box sx={{ p: 1.5, bgcolor: "#fff", borderRadius: 1, alignSelf: "flex-start" }}>
            <QRCodeSVG value={secret.generateQrCodeUrl(accountName, productName)} size={180} />
          </Box>
          <TextField
            label={t("mfa.enrol.secretLabel")}
            value={secret.secretKey}
            InputProps={{ readOnly: true, sx: { fontFamily: "monospace" } }}
            size="small"
          />
          <TextField
            label={t("mfa.enrol.codeLabel")}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            inputProps={{ inputMode: "numeric", autoComplete: "one-time-code" }}
            size="small"
          />
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button
              variant="contained"
              onClick={() => void handleVerify()}
              disabled={busy || !CODE_PATTERN.test(code)}
            >
              {t("mfa.enrol.verify")}
            </Button>
            <Button onClick={() => setSecret(null)} disabled={busy}>
              {t("common.cancel")}
            </Button>
          </Box>
        </Box>
      ) : isOn ? (
        <Button
          variant="outlined"
          color="error"
          onClick={() => setConfirmRemoveOpen(true)}
          disabled={busy}
        >
          {t("mfa.enrol.turnOff")}
        </Button>
      ) : (
        <Button variant="contained" onClick={() => void handleStart()} disabled={busy}>
          {t("mfa.enrol.turnOn")}
        </Button>
      )}

      <ConfirmDeletionDialog
        open={confirmRemoveOpen}
        title={t("mfa.enrol.removeTitle")}
        description={t("mfa.enrol.removeDescription")}
        confirmLabel={t("mfa.enrol.removeConfirm")}
        isProcessing={busy}
        onConfirm={() => void handleRemove()}
        onCancel={() => setConfirmRemoveOpen(false)}
      />
    </Paper>
  );
};

export default TwoStepVerificationCard;
