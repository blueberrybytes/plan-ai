import { Queue } from "bullmq";
import { queueConnection } from "./redisConnection";

export interface GithubContextJobPayload {
  contextId: string;
  githubRepoId: string;
  installationId: string;
  branch?: string;
}

export const githubContextQueue = new Queue<GithubContextJobPayload>("GithubContextQueue", {
  connection: queueConnection,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});
