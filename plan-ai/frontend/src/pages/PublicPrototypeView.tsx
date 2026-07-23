import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Box, CircularProgress, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

/**
 * Renders a generated prototype for a prospect.
 *
 * SECURITY — the iframe below is the last line of defence and must not be
 * loosened. The HTML was written by a model from an anonymous stranger's
 * message, and it is served from OUR domain, where our users hold a session.
 *
 * The `sandbox` attribute is set to the empty string ON PURPOSE. That is the
 * most restrictive value: the frame gets a unique opaque origin, scripts do not
 * run, forms cannot submit, and it cannot reach `window.parent`, cookies or
 * `localStorage`. Adding `allow-scripts allow-same-origin` together would undo
 * the whole thing — that pair lets framed code remove its own sandbox.
 *
 * `srcDoc` rather than `src` keeps the markup from ever becoming a top-level
 * document on this origin.
 *
 * The backend also sanitizes before storing (`utils/htmlSanitize.ts`); this is
 * the second layer, not the only one.
 */
const PublicPrototypeView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();

  const [html, setHtml] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    const backendUrl = (process.env.REACT_APP_API_BACKEND_URL || "").replace(/\/+$/, "");

    fetch(`${backendUrl}/api/public/prototypes/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((data: { html: string; title: string; variant: string }) => {
        setHtml(data.html);
        setTitle(`${data.title} · ${data.variant}`);
      })
      .catch(() => setError(true));
  }, [id]);

  if (error) {
    return (
      <Box
        sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}
      >
        <Typography color="text.secondary">{t("prototype.notFound")}</Typography>
      </Box>
    );
  }

  if (!html) {
    return (
      <Box
        sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ height: "100vh", width: "100vw", bgcolor: "#0b0d11" }}>
      <iframe
        // Empty sandbox = maximum restriction. See the comment above before
        // adding any allow-* token.
        sandbox=""
        srcDoc={html}
        title={title}
        style={{ border: "none", width: "100%", height: "100%", display: "block" }}
      />
    </Box>
  );
};

export default PublicPrototypeView;
