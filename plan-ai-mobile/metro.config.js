const { getSentryExpoConfig } = require("@sentry/react-native/metro");

const config = getSentryExpoConfig(__dirname);

// The mermaid library ships as a .txt asset (assets/mermaid/mermaid.txt).
// MermaidViewer reads it and runs it inside a WebView, so diagrams render on
// the phone.
config.resolver.assetExts.push("txt");

module.exports = config;
