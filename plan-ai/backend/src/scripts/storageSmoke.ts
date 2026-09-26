/**
 * Checks private storage end to end against the real bucket in .env, through
 * the same helpers the backend uses.
 *
 *   yarn storage:smoke
 *   yarn storage:smoke --audio meeting.mp3 [--language es] [--keep]
 *
 * Always: uploads a small file privately and checks that an anonymous read
 * is refused, a signed URL works (from the gs:// URI and from the old public
 * URL form old rows hold), a tampered signature is refused, and the backend
 * can read it directly (how chat attachments reach the text extractor).
 *
 * With --audio: uploads the recording privately and runs it through the
 * configured speech-to-text provider by signed URL, as a finished meeting
 * is, and through the voice service's /verify when VOICE_AI_URL is set.
 *
 * Everything goes under smoke-tests/<timestamp>/ and is deleted at the end,
 * unless --keep is passed.
 */
import { readFileSync } from "fs";
import { basename, extname } from "path";
import {
  downloadPath,
  objectPathOf,
  readableUrl,
  storageUri,
  uploadPrivateFile,
} from "../firebase/privateStorage";
import { getSttProvider } from "../services/stt/sttConfig";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const MIME_BY_EXT: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".webm": "audio/webm",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
};

let failures = 0;
const check = (ok: boolean, label: string, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
};

const status = async (url: string): Promise<number> =>
  (await fetch(url, { signal: AbortSignal.timeout(30_000) })).status;

const main = async () => {
  const bucket = process.env.FIREBASE_STORAGE_BUCKET?.trim();
  if (!bucket) throw new Error("FIREBASE_STORAGE_BUCKET is not set");
  const folder = `smoke-tests/${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const written: string[] = [];
  console.log(`Bucket ${bucket}, writing under ${folder}/\n`);

  try {
    // 1. Storage
    const text = `private storage smoke test ${Date.now()}`;
    const notePath = `${folder}/note.txt`;
    const noteUri = await uploadPrivateFile(notePath, Buffer.from(text), "text/plain");
    written.push(notePath);
    check(noteUri === storageUri(notePath), "upload returns the gs:// URI", noteUri);

    const publicForm = `https://storage.googleapis.com/${bucket}/${notePath}`;
    const anonymous = await status(publicForm);
    check(anonymous === 401 || anonymous === 403, "anonymous read is refused", `HTTP ${anonymous}`);

    const signed = await readableUrl(noteUri);
    const signedRes = await fetch(signed, { signal: AbortSignal.timeout(30_000) });
    const body = await signedRes.text();
    check(
      signedRes.ok && body === text,
      "signed URL from the gs:// URI reads the file",
      `HTTP ${signedRes.status}`,
    );

    const legacy = await readableUrl(publicForm);
    check(
      legacy !== publicForm && (await status(legacy)) === 200,
      "old public URL form still resolves",
    );

    check(objectPathOf(signed) === notePath, "a signed URL maps back to its object");

    const tampered = signed.replace(
      /(X-Goog-Signature=[0-9a-f]*)([0-9a-f])/,
      (_m, head: string, last: string) => `${head}${last === "0" ? "1" : "0"}`,
    );
    const tamperedStatus = await status(tampered);
    check(
      tamperedStatus >= 400 && tamperedStatus < 500,
      "tampered signature is refused",
      `HTTP ${tamperedStatus}`,
    );

    const direct = await downloadPath(notePath);
    check(direct.toString() === text, "backend reads it directly");

    // 2. A real recording, when given
    const audioFile = arg("audio");
    if (audioFile) {
      const ext = extname(audioFile).toLowerCase() || ".webm";
      const audioPath = `${folder}/meeting${ext}`;
      const audioUri = await uploadPrivateFile(
        audioPath,
        readFileSync(audioFile),
        MIME_BY_EXT[ext] ?? "application/octet-stream",
      );
      written.push(audioPath);
      console.log(`\nRecording ${basename(audioFile)} uploaded privately`);

      const provider = getSttProvider();
      const { projectTranscriptService } = await import("../services/projectTranscriptService");
      const diarizeAudio = (
        projectTranscriptService as unknown as {
          diarizeAudio: (
            mic: string | null,
            sys: string | null,
            language?: string | null,
          ) => Promise<{
            utterances: Array<{ speaker: string; transcript: string }>;
            diagnostics: string[];
          }>;
        }
      ).diarizeAudio.bind(projectTranscriptService);
      const started = Date.now();
      const result = await diarizeAudio(
        await readableUrl(audioUri),
        null,
        arg("language") ?? "multi",
      );
      const words = result.utterances.reduce((n, u) => n + u.transcript.split(/\s+/).length, 0);
      check(
        result.utterances.length > 0 && result.diagnostics.length === 0,
        `${provider} transcribes it by signed URL`,
        `${result.utterances.length} utterances, ${words} words, ${((Date.now() - started) / 1000).toFixed(1)} s${result.diagnostics.length ? `, ${result.diagnostics.join(" | ")}` : ""}`,
      );
      if (result.utterances[0]) {
        console.log(`      "${result.utterances[0].transcript.slice(0, 120)}"`);
      }

      const voiceAiUrl = process.env.VOICE_AI_URL?.trim().replace(/\/+$/, "");
      if (voiceAiUrl) {
        // What identifySpeaker sends: the profile and the meeting, both signed.
        // The same file on both sides must match.
        const form = new FormData();
        form.append("profile_url", await readableUrl(audioUri));
        form.append("meeting_url", await readableUrl(audioUri));
        const key = process.env.VOICE_AI_API_KEY?.trim();
        const res = await fetch(`${voiceAiUrl}/verify`, {
          method: "POST",
          body: form,
          headers: key ? { "x-api-key": key } : undefined,
          signal: AbortSignal.timeout(120_000),
        });
        const out = (await res.json().catch(() => ({}))) as { match?: boolean; score?: number };
        check(
          res.ok && out.match === true,
          "voice service downloads both by signed URL",
          `HTTP ${res.status}, score ${out.score?.toFixed(2) ?? "?"}`,
        );
      } else {
        console.log("SKIP  voice service (VOICE_AI_URL not set)");
      }
    }
  } finally {
    if (process.argv.includes("--keep")) {
      console.log(`\nKept ${written.length} files under ${folder}/`);
    } else if (written.length > 0) {
      const { firebaseAdmin } = await import("../firebase/firebaseAdmin");
      const b = firebaseAdmin.storage().bucket(bucket);
      await Promise.all(
        written.map((p) =>
          b
            .file(p)
            .delete()
            .catch(() => undefined),
        ),
      );
      console.log(`\nDeleted the ${written.length} test files`);
    }
  }

  console.log(failures === 0 ? "\nAll checks passed" : `\n${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
