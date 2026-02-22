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

export interface Transcript {
  id: string;
  projectId: string | null;
  userId: string;
  title: string | null;
  source: string;
  language: string | null;
  summary: string | null;
  transcript: string | null;
  recordedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

async function handleResponseWithRetry<T>(
  res: Response,
  retryRequest: () => Promise<Response>,
): Promise<T> {
  if (res.status === 401 || res.status === 403) {
    console.log(`HTTP ${res.status} encountered, attempting token refresh...`);
    const refreshedRes = await retryRequest();
    if (!refreshedRes.ok) {
      const body = await refreshedRes.json().catch(() => ({ message: refreshedRes.statusText }));
      throw new Error((body as { message?: string }).message ?? `HTTP ${refreshedRes.status}`);
    }
    const json = (await refreshedRes.json()) as { data: T };
    return json.data;
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
  }
  const json = (await res.json()) as { data: T };
  return json.data;
}

export const createPlanAiApi = (getToken: (forceRefresh?: boolean) => Promise<string | null>) => {
  const getAuthHeaders = async (forceRefresh = false): Promise<HeadersInit> => {
    const token = await getToken(forceRefresh);
    if (!token) throw new Error("No auth token available");
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  };

  return {
    async listProjects(): Promise<Project[]> {
      const req = async (force: boolean) =>
        fetch(`${BASE_URL}/api/projects?pageSize=50`, {
          headers: await getAuthHeaders(force),
        });

      const res = await req(false);
      return handleResponseWithRetry<{ projects: Project[] }>(res, () => req(true)).then(
        (d) => d.projects,
      );
    },

    async createProject(payload: { title: string; description?: string }): Promise<Project> {
      const req = async (force: boolean) =>
        fetch(`${BASE_URL}/api/projects`, {
          method: "POST",
          headers: await getAuthHeaders(force),
          body: JSON.stringify(payload),
        });

      const res = await req(false);
      return handleResponseWithRetry<Project>(res, () => req(true));
    },

    async listContexts(): Promise<Context[]> {
      const req = async (force: boolean) =>
        fetch(`${BASE_URL}/api/contexts?pageSize=50`, {
          headers: await getAuthHeaders(force),
        });

      const res = await req(false);
      return handleResponseWithRetry<{ contexts: Context[] }>(res, () => req(true)).then(
        (d) => d.contexts,
      );
    },

    async listTranscripts(): Promise<Transcript[]> {
      const req = async (force: boolean) =>
        fetch(`${BASE_URL}/api/transcripts?pageSize=50&source=RECORDING`, {
          headers: await getAuthHeaders(force),
        });

      const res = await req(false);
      return handleResponseWithRetry<{ transcripts: Transcript[] }>(res, () => req(true)).then(
        (d) => d.transcripts,
      );
    },

    async transcribeChunk(chunks: { mic?: Blob; system?: Blob }): Promise<string> {
      const req = async (force: boolean) => {
        const token = await getToken(force);
        if (!token) throw new Error("No auth token available");

        const form = new FormData();
        if (chunks.mic) {
          form.append("mic", chunks.mic, "mic.webm");
        }
        if (chunks.system) {
          const isMacNative =
            chunks.system.type.includes("mp4") || chunks.system.type.includes("m4a");
          form.append("system", chunks.system, isMacNative ? "system.m4a" : "system.webm");
        }

        return fetch(`${BASE_URL}/api/audio/transcribe-chunk`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
      };

      const res = await req(false);
      return handleResponseWithRetry<{ text: string }>(res, () => req(true)).then((d) => d.text);
    },

    async saveRecording(payload: {
      content: string;
      title?: string;
      recordedAt?: string;
    }): Promise<Transcript> {
      const req = async (force: boolean) =>
        fetch(`${BASE_URL}/api/transcripts`, {
          method: "POST",
          headers: await getAuthHeaders(force),
          body: JSON.stringify({
            ...payload,
            source: "RECORDING",
          }),
        });

      const res = await req(false);
      return handleResponseWithRetry<Transcript>(res, () => req(true));
    },

    async getTranscript(id: string): Promise<Transcript> {
      const req = async (force: boolean) =>
        fetch(`${BASE_URL}/api/transcripts/${id}`, {
          headers: await getAuthHeaders(force),
        });

      const res = await req(false);
      return handleResponseWithRetry<Transcript>(res, () => req(true));
    },

    async deleteTranscript(id: string): Promise<void> {
      const req = async (force: boolean) =>
        fetch(`${BASE_URL}/api/transcripts/${id}`, {
          method: "DELETE",
          headers: await getAuthHeaders(force),
        });

      const res = await req(false);
      await handleResponseWithRetry(res, () => req(true));
    },
  };
};
