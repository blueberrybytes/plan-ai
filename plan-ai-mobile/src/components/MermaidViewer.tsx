import React, { useEffect, useMemo, useState } from "react";
import { View, ActivityIndicator, Platform } from "react-native";
import { Text, useTheme } from "react-native-paper";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import { reportMessage, reportUnexpected } from "../utils/reportError";

/**
 * Renders a mermaid diagram on the phone. The diagram text is meeting content,
 * so it never leaves the device: the mermaid library ships with the app
 * (assets/mermaid/mermaid.txt is dist/mermaid.min.js of mermaid 11.16.0, MIT)
 * and runs in a WebView that cannot load anything or navigate anywhere.
 */

// Metro turns this into an asset reference, see metro.config.js.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const MERMAID_ASSET = require("../../assets/mermaid/mermaid.txt");

let mermaidSource: Promise<string> | null = null;

/** Reads the bundled mermaid library once and keeps it in memory. */
function loadMermaidSource(): Promise<string> {
  if (!mermaidSource) {
    const loading = (async () => {
      const asset = await Asset.fromModule(MERMAID_ASSET).downloadAsync();
      if (!asset.localUri) throw new Error("Mermaid asset has no local file");
      const text = await new File(asset.localUri).text();
      // A "</script" inside the library would end the script tag early.
      // "<\/script" means the same to JavaScript.
      return text.replace(/<\/script/gi, "<\\/script");
    })();
    mermaidSource = loading;
    // Let the next diagram try again if the read failed.
    loading.catch(() => {
      if (mermaidSource === loading) mermaidSource = null;
    });
  }
  return mermaidSource;
}

// No network at all: no fetch, no images or fonts from a server, no frames.
// Inline scripts are allowed because the library itself is inline.
const CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
  "img-src data:; font-src data:; form-action 'none'; base-uri 'none'";

function buildPage(library: string, code: string): string {
  // JSON is a valid JavaScript string. Escaping "<" keeps the diagram text
  // from closing the script tag.
  const diagram = JSON.stringify(code).replace(/</g, "\\u003c");
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<style>
html, body { margin: 0; padding: 0; background: #ffffff; }
#out svg { display: block; max-width: 100%; height: auto; margin: 0 auto; }
</style>
</head>
<body>
<div id="out"></div>
<script>${library}</script>
<script>
(function () {
  function post(message) {
    window.ReactNativeWebView.postMessage(JSON.stringify(message));
  }
  try {
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "default" });
    mermaid.render("diagram", ${diagram}).then(function (result) {
      var out = document.getElementById("out");
      out.innerHTML = result.svg;
      post({ type: "height", value: Math.ceil(out.getBoundingClientRect().height) });
    }, function () {
      post({ type: "error" });
    });
  } catch (e) {
    post({ type: "error" });
  }
})();
</script>
</body>
</html>`;
}

/** Only the page itself may load. Links in a diagram go nowhere. */
const onlyThisPage = (request: { url: string }) =>
  request.url.startsWith("about:");

const RENDER_TIMEOUT_MS = 15000;

export default function MermaidViewer({ code }: { code: string }) {
  const theme = useTheme();
  const [library, setLibrary] = useState<string | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadMermaidSource()
      .then((text) => {
        if (!cancelled) setLibrary(text);
      })
      .catch((e) => {
        // The library ships with the app, so this is a build or disk problem.
        console.warn("Could not load the mermaid library", e);
        reportUnexpected(e, "mermaid", { op: "load_library" });
        if (!cancelled) setHasError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // A new diagram starts from scratch.
  useEffect(() => {
    setHeight(null);
    setHasError(false);
  }, [code]);

  // Show the source if the page never answers.
  useEffect(() => {
    if (height !== null || hasError) return;
    const timer = setTimeout(() => {
      // A diagram with a syntax error answers at once. Silence means the
      // library or the WebView never ran. No diagram text in the report.
      reportMessage("Mermaid diagram timed out", "mermaid", { op: "render" });
      setHasError(true);
    }, RENDER_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [height, hasError, code]);

  const html = useMemo(
    () => (library ? buildPage(library, code) : null),
    [library, code],
  );

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as {
        type?: string;
        value?: unknown;
      };
      if (message.type === "height" && typeof message.value === "number") {
        setHeight(Math.max(40, Math.min(message.value, 4000)));
      } else if (message.type === "error") {
        setHasError(true);
      }
    } catch (e) {
      reportUnexpected(e, "mermaid", { op: "message" });
      setHasError(true);
    }
  };

  if (hasError) {
    return (
      <View
        style={{
          padding: 16,
          backgroundColor: theme.colors.surfaceVariant,
          borderRadius: 8,
          marginVertical: 12,
        }}
      >
        <Text
          style={{
            color: theme.colors.onSurfaceVariant,
            fontWeight: "bold",
            marginBottom: 8,
          }}
        >
          Diagram not available
        </Text>
        <Text
          selectable
          style={{
            color: theme.colors.onSurfaceVariant,
            fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
            fontSize: 12,
          }}
        >
          {code}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        marginVertical: 12,
        borderRadius: 8,
        overflow: "hidden",
        backgroundColor: "white",
        padding: 8,
      }}
    >
      {height === null && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1,
            backgroundColor: "rgba(255,255,255,0.7)",
          }}
        >
          <ActivityIndicator size="small" color={theme.colors.primary} />
        </View>
      )}
      {html ? (
        <WebView
          source={{ html }}
          style={{ height: height ?? 200, backgroundColor: "white" }}
          onMessage={onMessage}
          // Every URL reaches onShouldStartLoadWithRequest. With a narrower
          // list, the WebView hands unlisted URLs to Linking.openURL.
          originWhitelist={["*"]}
          onShouldStartLoadWithRequest={onlyThisPage}
          // Swallow window.open and target="_blank" instead of loading them.
          onOpenWindow={() => {}}
          setSupportMultipleWindows={false}
          javaScriptCanOpenWindowsAutomatically={false}
          allowFileAccess={false}
          allowFileAccessFromFileURLs={false}
          allowUniversalAccessFromFileURLs={false}
          allowsLinkPreview={false}
          dataDetectorTypes="none"
          mixedContentMode="never"
          cacheEnabled={false}
          incognito
          scrollEnabled={false}
        />
      ) : (
        <View style={{ height: 200 }} />
      )}
    </View>
  );
}
