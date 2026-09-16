import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

export type ObservabilityContext = {
  requestId: string;
  method: string;
  path: string;
  userId?: number;
};

const storage = new AsyncLocalStorage<ObservabilityContext>();

export function runWithObservabilityContext<T>(
  context: ObservabilityContext,
  callback: () => T,
): T {
  return storage.run(context, callback);
}

export function getObservabilityContext(): ObservabilityContext | undefined {
  return storage.getStore();
}

export function setObservabilityUser(userId: number): void {
  const context = storage.getStore();
  if (context) context.userId = userId;
}
