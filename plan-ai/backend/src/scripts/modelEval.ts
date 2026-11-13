/**
 * Runs the meeting analysis (the TASK_EXTRACTION call) against several
 * OpenRouter models and writes one JSON file per model and meeting.
 *
 * The prompt mirrors analyzeTranscript with no persona, AUTO strategy and no
 * injected context. The schema is the real one. Model fallbacks are OFF, so a
 * failure is the model's own failure and not hidden by the fallback chain.
 *
 * Usage:
 *   yarn eval:models <meetingsDir> <outDir> model1,model2,...
 *
 * Each meeting is a .txt file with one "<speaker>: <text>" line per utterance,
 * the same shape processPendingTranscript sends to the model.
 *
 * Append "@noreason" to a model id to send it with reasoning turned off.
 * Some cheap models spend the whole output budget thinking and return nothing.
 */
import fs from "fs";
import path from "path";
import { generateText, Output } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { transcriptAnalysisSchemaForGeneration } from "../services/projectTranscriptService";
import { extractOpenRouterUsage, privacyProviderPrefs } from "../utils/aiModelUtils";

const [meetingsDir, outDir, modelList, concurrencyArg] = process.argv.slice(2);
if (!meetingsDir || !outDir || !modelList) {
  console.error("Usage: modelEval <meetingsDir> <outDir> model1,model2,... [concurrency]");
  process.exit(1);
}
const models = modelList.split(",").map((m) => m.trim());
const concurrency = Number(concurrencyArg) || 6;

const STATUS = "BACKLOG, IN_PROGRESS, BLOCKED, COMPLETED, ARCHIVED";
const PRIORITY = "LOW, MEDIUM, HIGH, URGENT";

function buildPrompt(content: string): string {
  const todayIso = new Date().toISOString().split("T")[0];
  return `Today is ${todayIso}.

Analyze the following transcript/request and the provided codebase context.

1. Detect the predominant human language (ISO name, e.g. "english" or "spanish").
2. GENERATE a short, representative title for the transcript (max 10 words).
3. Provide a succinct summary (max 80 words).
4. Extract or GENERATE actionable tasks:
   - Each task MUST have a clear title.
   - **summary**: REQUIRED. A concise, 1-sentence overview of the task (max 20 words).
   - **description**: Detailed technical steps or context.
   - **acceptanceCriteria**: REQUIRED. A JSON array of distinct verifiable conditions (e.g. ["Endpoint returns 200 on success", "Logged-out users get 401"]). Each element is a SINGLE atomic criterion. NEVER use markdown bullets ('- foo') inside any element. NEVER return one concatenated string.
   - status (${STATUS}) and priority (${PRIORITY}).
   - **type**: One of "TASK", "BUG", "STORY", or "EPIC". Use "EPIC" ONLY when the task has a non-empty 'subtasks' array. Otherwise use TASK (concrete unit of work), BUG (defect), or STORY (user-facing feature).
   - **category**: One of "engineering", "design", "support", "ops", "research". Use this to split work types: "engineering" = code/dev work, "design" = mocks/UX, "support" = customer outreach + admin flag toggles (NOT engineering), "ops" = infra/devops/migrations, "research" = spikes and investigations. The user filters their ticket board by this.
   - **storyPoints**: REQUIRED. Use the Fibonacci scale (1, 2, 3, 5, 8, 13). Engineering rule of thumb: trivial admin/support actions = 1, simple UI tweak = 1, single-file refactor = 2, cross-file feature = 3, schema migration or new integration = 5, multi-platform feature = 8, full system redesign = 13. Never omit this field.
5. Extract PAIN POINTS — frictions, blockers, complaints, risks, or unmet needs raised by participants. These describe PROBLEMS, distinct from the action items above (a pain point may motivate a task, but state the problem, not the fix). For each:
   - **problem**: REQUIRED. The friction in one clear sentence.
   - **affected**: Who/what it hurts (a person, team, or customer), or null if unclear.
   - **severity**: REQUIRED. One of "blocker" (work cannot proceed), "high" (significant drag), "medium" (notable friction), "low" (minor annoyance).
   - **status**: REQUIRED. One of "raised" (mentioned, no plan), "being_addressed" (someone already on it), "resolved_in_meeting" (settled during the call).
   - **evidence**: A short verbatim quote from the transcript grounding the pain point, or null. NEVER fabricate a quote.
   - **suggestedResolution**: A concise next step, or null.
   - Rank the array most-severe first. CRITICAL: return an EMPTY array if the meeting raised no genuine pain points — do NOT invent friction to fill the list.

CRITICAL LANGUAGE RULE: The generated title, summary, task titles, descriptions, and acceptance criteria MUST be written entirely in the detected predominant human language of the transcript. If the transcript is spoken in Spanish, ALL output fields must be in Spanish!


Do NOT guess due dates. Only populate dueDate if explicitly mentioned.

\nAGILE SLICE & DICE (AUTO MODE): If the transcript covers a large complex feature, decompose it into 1 macro Task with type "EPIC". Place 3 to 6 specialized sub-tasks inside that EPIC's 'subtasks' array (e.g., Frontend, Backend, DevOps tasks). The EPIC's 'storyPoints' field MUST equal the sum of its subtasks' 'storyPoints' (e.g., subtasks of 1+3+5 → EPIC = 9). Assign fibonacci storyPoints (1, 2, 3, 5, 8, 13) to each subtask based on technical complexity (database schema changes = 5 pts, simple UI tweak = 1 pt). The macro task MUST have type: "EPIC" — NOT "STORY".





Transcript/Request:
${content}`;
}

interface RunResult {
  model: string;
  meeting: string;
  ok: boolean;
  error?: string;
  ms: number;
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;
  output?: unknown;
}

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

async function runOne(spec: string, meeting: string, content: string): Promise<RunResult> {
  const started = Date.now();
  const [model, flag] = spec.split("@");
  try {
    const result = await generateText({
      model: openrouter(model),
      providerOptions: {
        openrouter: {
          ...(flag === "noreason" ? { reasoning: { enabled: false } } : {}),
          provider: privacyProviderPrefs(),
          usage: { include: true },
          plugins: [{ id: "response-healing" }],
        },
      },
      output: Output.object({
        name: "TranscriptFullAnalysis",
        description:
          "Performs deep extraction of meeting tasks, key points, and metadata from the transcript.",
        schema: transcriptAnalysisSchemaForGeneration,
      }),
      prompt: buildPrompt(content),
      maxOutputTokens: 8192,
      temperature: 0.2,
      maxRetries: 1,
    });
    const usage = extractOpenRouterUsage(result);
    return {
      model: spec,
      meeting,
      ok: true,
      ms: Date.now() - started,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cost: usage.cost,
      output: result.output,
    };
  } catch (err) {
    return {
      model: spec,
      meeting,
      ok: false,
      ms: Date.now() - started,
      error: err instanceof Error ? err.message.slice(0, 500) : String(err),
    };
  }
}

async function main() {
  const meetings = fs
    .readdirSync(meetingsDir)
    .filter((f) => f.endsWith(".txt"))
    .sort();
  fs.mkdirSync(outDir, { recursive: true });

  const jobs: Array<() => Promise<void>> = [];
  for (const model of models) {
    for (const file of meetings) {
      const meeting = path.basename(file, ".txt");
      const target = path.join(outDir, `${model.replace(/[/:@]/g, "_")}__${meeting}.json`);
      if (fs.existsSync(target)) continue;
      const content = fs.readFileSync(path.join(meetingsDir, file), "utf8");
      jobs.push(async () => {
        const r = await runOne(model, meeting, content);
        fs.writeFileSync(target, JSON.stringify(r, null, 2));
        console.log(
          `${r.ok ? "ok  " : "FAIL"} ${model.padEnd(36)} ${meeting.padEnd(24)} ${String(r.ms).padStart(6)}ms $${r.cost ?? "?"}${r.error ? "  " + r.error.slice(0, 120) : ""}`,
        );
      });
    }
  }

  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < jobs.length) {
        const job = jobs[next++];
        await job();
      }
    }),
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
