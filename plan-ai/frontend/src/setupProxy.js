module.exports = function (app) {
  app.use((req, res, next) => {
    // Override the headers for the auth callback and all HTML pages
    res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
    res.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");

    // Explicitly remove the restricted headers if react-scripts dev-server added them
    res.removeHeader("cross-origin-opener-policy");
    res.removeHeader("cross-origin-embedder-policy");

    next();
  });
};
