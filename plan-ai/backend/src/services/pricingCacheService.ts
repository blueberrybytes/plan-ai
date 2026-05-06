import { redisClient } from "../utils/redisClient";
import { logger } from "../utils/logger";

export interface ModelPricing {
  prompt: number;
  completion: number;
  maxTokens?: number;
}

export class PricingCacheService {
  private static instance: PricingCacheService;
  private cache: Map<string, ModelPricing> = new Map();
  private refreshInterval: NodeJS.Timeout | null = null;
  private readonly REFRESH_RATE_MS = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  public static getInstance(): PricingCacheService {
    if (!PricingCacheService.instance) {
      PricingCacheService.instance = new PricingCacheService();
    }
    return PricingCacheService.instance;
  }

  /**
   * Initialize the cache by fetching immediately, then setting an interval.
   */
  public async init() {
    await this.refreshCache();

    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    this.refreshInterval = setInterval(() => {
      this.refreshCache().catch((err) => {
        logger.error("Failed to refresh PricingCacheService in background loop", err);
      });
    }, this.REFRESH_RATE_MS);

    logger.info("PricingCacheService initialized and refreshing every 5 minutes.");
  }

  /**
   * Stop the refresh interval (useful for graceful shutdown)
   */
  public close() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  private async refreshCache() {
    try {
      const cachedPricingRaw = await redisClient.get("openrouter:pricing");
      if (cachedPricingRaw) {
        const parsed: Record<string, ModelPricing> = JSON.parse(cachedPricingRaw);

        const newMap = new Map<string, ModelPricing>();
        for (const [key, value] of Object.entries(parsed)) {
          newMap.set(key, value);
        }

        this.cache = newMap;
      }
    } catch (error) {
      logger.error("PricingCacheService failed to pull from Redis", error);
    }
  }

  /**
   * Synchronously get pricing for a model
   */
  public getPricing(modelId: string): ModelPricing | undefined {
    return this.cache.get(modelId);
  }

  /**
   * Synchronously get the entire pricing map
   */
  public getAllPricing(): Record<string, ModelPricing> {
    const obj: Record<string, ModelPricing> = {};
    for (const [key, val] of this.cache.entries()) {
      obj[key] = val;
    }
    return obj;
  }
}

export const pricingCacheService = PricingCacheService.getInstance();
