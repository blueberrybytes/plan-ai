const BASE_URL = import.meta.env.VITE_PLAN_AI_API_URL ?? "";

export interface Project {
  id: string;
  title: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface Context {
  id: string;
  name: string;
  description: string | null;
}

function authHeaders(token: string): HeadersInit {
  console.log("Building auth headers with token of length:", token ? token.length : "NULL");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
  }
  const json = (await res.json()) as { data: T };
  return json.data;
}

export const planAiApi = {
  async listProjects(token: string): Promise<Project[]> {
    const res = await fetch(`${BASE_URL}/api/projects?pageSize=50`, {
      headers: authHeaders(token),
    });
    const data = await handleResponse<{ projects: Project[] }>(res);
    return data.projects;
  },

  async createProject(
    token: string,
    payload: { title: string; description?: string },
  ): Promise<Project> {
    const res = await fetch(`${BASE_URL}/api/projects`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(payload),
    });
    return handleResponse<Project>(res);
  },

  async listContexts(token: string): Promise<Context[]> {
    const res = await fetch(`${BASE_URL}/api/contexts?pageSize=50`, {
      headers: authHeaders(token),
    });
    const data = await handleResponse<{ contexts: Context[] }>(res);
    return data.contexts;
  },

  /**
   * Send a raw audio chunk to the backend for Groq Whisper transcription.
   * The backend holds the Groq API key — it never touches the client.
   */
  async transcribeChunk(token: string, projectId: string, audioBlob: Blob): Promise<string> {
    const form = new FormData();
    form.append("audio", audioBlob, "chunk.webm");

    const res = await fetch(`${BASE_URL}/api/projects/${projectId}/transcribe-chunk`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const data = await handleResponse<{ text: string }>(res);
    return data.text;
  },

  /**
   * Submit the final accumulated transcript text and trigger AI task generation.
   */
  async submitTranscript(
    token: string,
    projectId: string,
    payload: {
      transcript: string;
      title?: string;
      persona?: "SECRETARY" | "ARCHITECT" | "PRODUCT_MANAGER" | "DEVELOPER";
      contextIds?: string[];
      objective?: string;
    },
  ): Promise<void> {
    const form = new FormData();
    const blob = new Blob([payload.transcript], { type: "text/plain" });
    form.append("files", blob, `${payload.title ?? "recording"}.txt`);
    if (payload.title) form.append("title", payload.title);
    if (payload.persona) form.append("persona", payload.persona);
    if (payload.objective) form.append("objective", payload.objective);
    if (payload.contextIds) {
      payload.contextIds.forEach((id) => form.append("contextIds", id));
    }

    const res = await fetch(`${BASE_URL}/api/projects/${projectId}/transcripts/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
    }
  },
};
