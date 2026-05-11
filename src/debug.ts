export interface DebugEntry {
  timestamp: number;
  message: string;
  data?: unknown;
}

export type DebugListener = (entry: DebugEntry) => void;

let enabled = false;
const listeners: Set<DebugListener> = new Set();
const entries: DebugEntry[] = [];

export function enableDebug(): void {
  enabled = true;
}

export function disableDebug(): void {
  enabled = false;
}

export function isDebugEnabled(): boolean {
  return enabled;
}

export function onDebug(listener: DebugListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDebugLog(): readonly DebugEntry[] {
  return entries;
}

export function clearDebugLog(): void {
  entries.length = 0;
}

export function debug(message: string, data?: unknown): void {
  if (!enabled) return;
  const entry: DebugEntry = { timestamp: performance.now(), message, data };
  entries.push(entry);
  console.log(`[FWU] ${message}`, data !== undefined ? data : "");
  for (const listener of listeners) {
    listener(entry);
  }
}
