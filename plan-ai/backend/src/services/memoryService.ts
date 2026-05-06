import { firebaseAdmin } from "../firebase/firebaseAdmin";
import { logger } from "../utils/logger";

const db = firebaseAdmin.firestore();

export interface MemoryFact {
  id: string;
  organizationId: string;
  fact: string;
  createdAt: Date;
}

export class MemoryService {
  /**
   * Adds a new memory fact to the organization's knowledge graph.
   */
  public async addMemory(organizationId: string, fact: string): Promise<string | null> {
    try {
      if (!organizationId || !fact) return null;

      const memoryRef = db.collection(`organizations/${organizationId}/memories`).doc();

      const newMemory: Omit<MemoryFact, "id"> = {
        organizationId,
        fact,
        createdAt: new Date(),
      };

      await memoryRef.set(newMemory);
      logger.info(`Added new memory for organization ${organizationId}: ${fact}`);
      return memoryRef.id;
    } catch (error) {
      logger.error(`Error adding memory for organization ${organizationId}:`, error);
      return null;
    }
  }

  /**
   * Fetches recent memories for an organization, used to inject into system prompts.
   */
  public async getRecentMemories(
    organizationId: string,
    limit: number = 20,
  ): Promise<MemoryFact[]> {
    try {
      if (!organizationId) return [];

      const snapshot = await db
        .collection(`organizations/${organizationId}/memories`)
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get();

      if (snapshot.empty) {
        return [];
      }

      return snapshot.docs.map(
        (doc) =>
          ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt.toDate(),
          }) as MemoryFact,
      );
    } catch (error) {
      logger.error(`Error fetching recent memories for organization ${organizationId}:`, error);
      return [];
    }
  }

  /**
   * Basic search across memories for an organization using a simple keyword filter.
   * Note: For advanced semantic search, this should be upgraded to use embeddings or vector search.
   */
  public async queryMemories(organizationId: string, query: string): Promise<MemoryFact[]> {
    try {
      if (!organizationId || !query) return [];

      // Currently fetches recent memories and filters in-memory for MVP simplicity.
      // Firebase doesn't natively support full-text search without an extension (like Algolia/Typesense).
      const allRecentMemories = await this.getRecentMemories(organizationId, 100);

      const queryLower = query.toLowerCase();
      const searchTerms = queryLower.split(" ").filter((t) => t.length > 2);

      return allRecentMemories.filter((m) => {
        const factLower = m.fact.toLowerCase();
        return searchTerms.some((term) => factLower.includes(term));
      });
    } catch (error) {
      logger.error(`Error querying memories for organization ${organizationId}:`, error);
      return [];
    }
  }
}

export const memoryService = new MemoryService();
