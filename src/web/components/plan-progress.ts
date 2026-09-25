import { useEffect, useState } from 'react';
import type { PlanBusyKind } from './use-plan-panel';

const CAN_TAKE = 'This can take up to two minutes.';
const TICK_MS = 1_000;

function secondsSoFar(elapsedMs: number): string {
  const seconds = Number.isFinite(elapsedMs) && elapsedMs > 0 ? Math.floor(elapsedMs / 1_000) : 0;
  return `${seconds} ${seconds === 1 ? 'second' : 'seconds'} so far`;
}

/** What the page says while a Plan is being generated: that it is under way, for how long, and how long it may take (REQ-TRV-080). */
export const generationProgressText = (elapsedMs: number): string => `Generating your Plan… ${secondsSoFar(elapsedMs)}. ${CAN_TAKE}`;

/** Whether the AI is being waited on, so the wait is shown as progress; restoring an earlier version is quick and is not. */
export const isSlowRequest = (kind: PlanBusyKind): boolean => kind !== 'restoring';

export function busyText(kind: PlanBusyKind, elapsedMs: number): string {
  switch (kind) {
    case 'generating':
      return generationProgressText(elapsedMs);
    case 'regenerating-day':
      return `Generating that Day… ${secondsSoFar(elapsedMs)}. ${CAN_TAKE}`;
    case 'restoring':
      return 'Restoring that version…';
  }
}

/** Milliseconds since `isRunning` became true, updated each second, and 0 while it is false. */
export function useElapsedMs(isRunning: boolean): number {
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    setElapsedMs(0);
    if (!isRunning) return undefined;
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsedMs(Date.now() - startedAt), TICK_MS);
    return () => clearInterval(timer);
  }, [isRunning]);
  return elapsedMs;
}
