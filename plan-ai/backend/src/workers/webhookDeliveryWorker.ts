import { Worker, Job } from "bullmq";
import { createWorkerConnection } from "../queue/redisConnection";
import { WEBHOOK_DELIVERY_QUEUE, WebhookDeliveryJobPayload } from "../queue/webhookDeliveryQueue";
import { webhookRetryDelay } from "../queue/webhookRetrySchedule";
import { runDeliveryAttempt } from "../services/webhookService";
import { logger } from "../utils/logger";

/**
 * Sends webhook deliveries to the customers' servers. One job per delivery.
 * A failed try throws, so BullMQ schedules the next one with the waits in
 * webhookRetrySchedule.ts. The WebhookDelivery row records every try.
 */
export const webhookDeliveryWorker = new Worker<WebhookDeliveryJobPayload>(
  WEBHOOK_DELIVERY_QUEUE,
  async (job: Job<WebhookDeliveryJobPayload>) => {
    const tries = job.opts.attempts ?? 1;
    const lastAttempt = job.attemptsMade + 1 >= tries;
    const outcome = await runDeliveryAttempt(job.data.deliveryId, {
      lastAttempt,
      manual: job.data.manual,
    });
    if (outcome === "retry") {
      throw new Error(`Delivery ${job.data.deliveryId} failed, will retry`);
    }
    return outcome;
  },
  {
    connection: createWorkerConnection(),
    concurrency: 5,
    settings: { backoffStrategy: (attemptsMade: number) => webhookRetryDelay(attemptsMade) },
  },
);

webhookDeliveryWorker.on("error", (err) => {
  logger.error(`[Webhooks] Worker error: ${err.message}`);
});
