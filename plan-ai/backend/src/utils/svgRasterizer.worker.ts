/**
 * Child-process entry point for SVG rasterization.
 *
 * Exists solely so that a pango `abort()` (see `textSanitize.ts`) kills THIS
 * process instead of the API server. The parent reads the exit code and
 * degrades gracefully; sanitizing handles the trigger we know about, this
 * handles the one we don't.
 *
 * Protocol: SVG arrives on stdin, PNG leaves on stdout, diagnostics on stderr.
 * Binary on stdout is why nothing here may `console.log`.
 */
import sharp from "sharp";

const readStdin = async (): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
};

void (async () => {
  try {
    const svg = await readStdin();
    const png = await sharp(svg, { density: 144 })
      .flatten({ background: "#ffffff" })
      .png({ compressionLevel: 9 })
      .toBuffer();

    process.stdout.write(png, () => process.exit(0));
  } catch (err) {
    process.stderr.write(String(err instanceof Error ? err.message : err));
    process.exit(1);
  }
})();
