import { useCallback, useEffect, useState } from 'react';
import { EDITS_WOULD_BE_REPLACED, PLAN_NOT_FOUND, type PlanVersionSummary, type SavedPlan } from '../../shared/plan-schemas';
import { api, type ApiError, type ApiResult } from '../api-client';
import { EMPTY_PLAN_PANEL, editsWarning, panelAfterSave, type PlanPanel } from '../pages/plan-view-state';
import { problemWith } from './activity-form-state';
import type { PlanActions, SuggestedActivity } from './plan-actions';

/** Requests that ask the AI or take a while, and so say what they are doing. Changes by hand are quick and say nothing. */
export type PlanBusyKind = 'generating' | 'regenerating-day' | 'restoring';

/** A request held back until the Traveler agrees to lose the Activities they changed. */
export interface PendingConfirmation {
  readonly message: string;
  readonly run: () => Promise<void>;
}

type PlanRequest = (confirmed: boolean) => Promise<ApiResult<SavedPlan>>;

const daysNamedIn = (error: ApiError): readonly number[] => {
  const days = error.details?.['days'];
  return Array.isArray(days) ? days.filter((day): day is number => typeof day === 'number') : [];
};

const withConfirmation = (confirmed: boolean) => (confirmed ? { confirmReplaceEdits: true } : undefined);

export interface PlanPanelController {
  readonly panel: PlanPanel;
  readonly busy: PlanBusyKind | null;
  readonly versions: readonly PlanVersionSummary[];
  readonly isLoading: boolean;
  readonly loadFailure: string | null;
  readonly pending: PendingConfirmation | null;
  readonly regeneratePlan: () => void;
  readonly restore: (version: number) => void;
  readonly cancelPending: () => void;
  /** Puts a Plan that was saved elsewhere, such as by accepting a chat change, on show. */
  readonly showPlan: (plan: SavedPlan) => void;
  readonly actions: PlanActions;
}

/**
 * Everything a Trip's Plan section does: show the saved Plan, ask the AI for a new one or for one Day, hold a
 * request back until the Traveler agrees to lose their own changes, restore a version, and change the Plan by
 * hand. A request that fails or is refused never hides the Plan on show (REQ-TRV-102).
 */
export function usePlanPanel(tripId: string, onPlanSaved: () => void): PlanPanelController {
  const [panel, setPanel] = useState<PlanPanel>(EMPTY_PLAN_PANEL);
  const [busy, setBusy] = useState<PlanBusyKind | null>(null);
  const [isChanging, setIsChanging] = useState(false);
  const [versions, setVersions] = useState<readonly PlanVersionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailure, setLoadFailure] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const planPath = `/api/trips/${encodeURIComponent(tripId)}/plan`;

  const loadVersions = useCallback(async () => {
    const result = await api<{ versions: readonly PlanVersionSummary[] }>('GET', `${planPath}/versions`);
    if (result.ok) setVersions(result.data.versions);
  }, [planPath]);

  useEffect(() => {
    let isCurrent = true;
    void (async () => {
      const result = await api<SavedPlan>('GET', planPath);
      if (!isCurrent) return;
      if (result.ok) {
        setPanel({ plan: result.data, notice: null, isGenerating: false });
        await loadVersions();
      } else if (result.error.code !== PLAN_NOT_FOUND) {
        setLoadFailure(result.error.message ?? "This Trip's Plan could not be loaded.");
      }
      if (isCurrent) setIsLoading(false);
    })();
    return () => {
      isCurrent = false;
    };
  }, [planPath, loadVersions]);

  const save = async (kind: PlanBusyKind, request: PlanRequest, confirmed = false): Promise<void> => {
    setBusy(kind);
    setPending(null);
    setPanel((previous) => ({ ...previous, notice: null, isGenerating: true }));
    const result = await request(confirmed);
    setBusy(null);
    if (!result.ok && result.error.code === EDITS_WOULD_BE_REPLACED) {
      setPanel((previous) => ({ ...previous, isGenerating: false }));
      setPending({ message: editsWarning(daysNamedIn(result.error)), run: () => save(kind, request, true) });
      return;
    }
    setPanel((previous) => panelAfterSave(previous, result));
    if (result.ok) {
      setLoadFailure(null);
      await loadVersions();
      onPlanSaved();
    }
  };

  const change = async (request: () => Promise<ApiResult<SavedPlan>>): Promise<string | null> => {
    setPending(null);
    setIsChanging(true);
    const result = await request();
    setIsChanging(false);
    if (!result.ok) return problemWith(result.error);
    setPanel((previous) => ({ ...previous, plan: result.data, notice: null }));
    await loadVersions();
    return null;
  };

  const activityPath = (activityId: string) => `${planPath}/activities/${encodeURIComponent(activityId)}`;

  const actions: PlanActions = {
    isBusy: isLoading || busy !== null || isChanging,
    onRegenerateDay: (dayNumber) =>
      void save('regenerating-day', (confirmed) => api<SavedPlan>('POST', `${planPath}/days/${dayNumber}/regenerate`, withConfirmation(confirmed))),
    onEdit: (activityId, changes) => change(() => api<SavedPlan>('PATCH', activityPath(activityId), changes)),
    onRemove: (activityId) => change(() => api<SavedPlan>('DELETE', activityPath(activityId))),
    onMove: (activityId, toDay) => change(() => api<SavedPlan>('POST', `${activityPath(activityId)}/move`, { toDay })),
    onReplace: (activityId, activity) => change(() => api<SavedPlan>('POST', `${activityPath(activityId)}/replace`, activity)),
    onSuggest: async (activityId) => {
      setIsChanging(true);
      const result = await api<SuggestedActivity>('POST', `${activityPath(activityId)}/suggestion`);
      setIsChanging(false);
      return result.ok ? { ok: true, activity: result.data } : { ok: false, problem: problemWith(result.error) };
    },
  };

  return {
    panel,
    busy,
    versions,
    isLoading,
    loadFailure,
    pending,
    regeneratePlan: () => void save('generating', (confirmed) => api<SavedPlan>('POST', planPath, withConfirmation(confirmed))),
    restore: (version) => void save('restoring', () => api<SavedPlan>('POST', `${planPath}/versions/${version}/restore`)),
    cancelPending: () => setPending(null),
    showPlan: (plan) => {
      setPending(null);
      setPanel((previous) => ({ ...previous, plan, notice: null }));
      void loadVersions();
    },
    actions,
  };
}
