import { Queue } from "bullmq";
import { queueConnection } from "./redisConnection";
import { WEBHOOK_MAX_TRIES } from "./webhookRetrySchedule";

export interface WebhookDeliveryJobPayload {
  /** Id of the WebhookDelivery row. The row holds the payload. */
  deliveryId: string;
  /** A test event or a redelivery asked by a person: one try, no retries. */
  manual: boolean;
}

export const WEBHOOK_DELIVERY_QUEUE = "WebhookDeliveryQueue";

export const webhookDeliveryQueue = new Queue<WebhookDeliveryJobPayload>(WEBHOOK_DELIVERY_QUEUE, {
  connection: queueConnection,
  defaultJobOptions: {
    // The WebhookDelivery row is the record. Jobs are only the schedule.
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 100 },
  },
});

/** Puts one delivery on the queue. */
export async function enqueueWebhookDelivery(deliveryId: string, manual: boolean): Promise<void> {
  await webhookDeliveryQueue.add(
    "deliver",
    { deliveryId, manual },
    manual ? { attempts: 1 } : { attempts: WEBHOOK_MAX_TRIES, backoff: { type: "custom" } },
  );
}
