import { AsyncLocalStorage } from "node:async_hooks";
import type { NextFunction, Request, Response } from "express";

/**
 * What the current caller must not see.
 *
 * A project can be RESTRICTED: only the workspace owners, its creator and the
 * people added to it see it. The projects hidden from the caller are worked
 * out once, when the caller's workspace access is resolved, and kept here for
 * the rest of the request. The Prisma client reads it on every query (see
 * prisma/prismaClient.ts), so no controller or service has to remember the
 * rule: a hidden project, its meetings, tasks, files and chats are simply not
 * in the database as far as this request can tell.
 *
 * Code that runs outside a request (queue workers, cron jobs) has no scope and
 * sees everything. When such code builds something for people to read, it
 * wraps the work in `runWithHidden`.
 */

export interface HiddenFromCaller {
  /** Ids of the RESTRICTED projects the caller has no access to. */
  projectIds: string[];
  /** Ids of the knowledge bases (Context) of those projects. */
  contextIds: string[];
}

interface Scope {
  hidden: HiddenFromCaller | null;
}

const storage = new AsyncLocalStorage<Scope>();

/** Express middleware: gives every request its own, empty scope. */
export function accessScopeMiddleware(_req: Request, _res: Response, next: NextFunction): void {
  storage.run({ hidden: null }, next);
}

/**
 * Sets what is hidden for the rest of this request. A no-op outside a request:
 * there is nothing to attach it to, and guessing would leak into other work.
 */
export function setHiddenForRequest(hidden: HiddenFromCaller): void {
  const scope = storage.getStore();
  if (scope) scope.hidden = hidden.projectIds.length > 0 ? hidden : null;
}

/** What is hidden from the current caller, or null when nothing is. */
export function hiddenFromCaller(): HiddenFromCaller | null {
  return storage.getStore()?.hidden ?? null;
}

/** Runs `work` with these projects hidden. For code outside a request. */
export function runWithHidden<T>(hidden: HiddenFromCaller, work: () => T): T {
  return storage.run({ hidden: hidden.projectIds.length > 0 ? hidden : null }, work);
}
