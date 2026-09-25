import { useEffect, useState } from 'react';
import type { TripBudget } from '../../shared/trip-budget';
import { api } from '../api-client';

export type BudgetState =
  | { readonly state: 'loading' }
  | { readonly state: 'loaded'; readonly budget: TripBudget }
  | { readonly state: 'failed' };

type Stamped = { readonly planVersion: number; readonly result: BudgetState };

/**
 * A Trip's budget, read again whenever the Plan on show is a different version, so an edit, a removal or an
 * accepted chat change is reflected. What was read (or failed) for an earlier version is never shown for a later one.
 */
export function useBudget(tripId: string, planVersion: number): BudgetState {
  const [stamped, setStamped] = useState<Stamped>({ planVersion, result: { state: 'loading' } });

  useEffect(() => {
    let isCurrent = true;
    void api<TripBudget>('GET', `/api/trips/${encodeURIComponent(tripId)}/budget`).then((answer) => {
      if (isCurrent) setStamped({ planVersion, result: answer.ok ? { state: 'loaded', budget: answer.data } : { state: 'failed' } });
    });
    return () => {
      isCurrent = false;
    };
  }, [tripId, planVersion]);

  return stamped.planVersion === planVersion ? stamped.result : { state: 'loading' };
}
