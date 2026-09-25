import { useCallback, useEffect, useState } from 'react';
import { PLAN_NOT_FOUND, type PlanVersionSummary, type SavedPlan } from '../../shared/plan-schemas';
import { api, type ApiResult } from '../api-client';
import { EMPTY_PLAN_PANEL, panelAfterSave, type PlanPanel } from '../pages/plan-view-state';
import { PlanDisplay } from './PlanDisplay';
import { PlanVersions } from './PlanVersions';

type Activity = 'generating' | 'restoring';

const BUSY_MESSAGES: Readonly<Record<Activity, string>> = {
  generating: 'Generating your Plan… this can take up to two minutes.',
  restoring: 'Restoring that version…',
};

/**
 * A Trip's Plan section. It shows the saved Plan as soon as the page opens, and asks the AI for a new
 * one only when the Traveler presses the button, never when the page opens. A failed or refused request
 * leaves the saved Plan on show. When the AI fails the Traveler sees the fallback message and nothing
 * else: there is no way to build a Plan by hand in this build. `onPlanSaved` runs after a Plan is saved,
 * so the page can show the Trip as Planned.
 */
export function PlanGenerator({ tripId, onPlanSaved }: { readonly tripId: string; readonly onPlanSaved: () => void }) {
  const [panel, setPanel] = useState<PlanPanel>(EMPTY_PLAN_PANEL);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [versions, setVersions] = useState<readonly PlanVersionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailure, setLoadFailure] = useState<string | null>(null);
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

  const save = async (kind: Activity, request: () => Promise<ApiResult<SavedPlan>>) => {
    setActivity(kind);
    setPanel((previous) => ({ ...previous, notice: null, isGenerating: true }));
    const result = await request();
    setPanel((previous) => panelAfterSave(previous, result));
    setActivity(null);
    if (result.ok) {
      setLoadFailure(null);
      await loadVersions();
      onPlanSaved();
    }
  };

  const isBusy = isLoading || panel.isGenerating;
  return (
    <>
      <button type="button" disabled={isBusy} onClick={() => void save('generating', () => api<SavedPlan>('POST', planPath))}>
        Generate Plan
      </button>
      {activity ? <p role="status">{BUSY_MESSAGES[activity]}</p> : null}
      {panel.notice ? <p role="alert">{panel.notice.message}</p> : null}
      {loadFailure ? <p role="alert">{loadFailure}</p> : null}
      {panel.plan ? <PlanDisplay plan={panel.plan} /> : null}
      {panel.plan && versions.length > 0 ? (
        <PlanVersions
          versions={versions}
          currentVersion={panel.plan.version}
          isBusy={isBusy}
          onRestore={(version) => void save('restoring', () => api<SavedPlan>('POST', `${planPath}/versions/${version}/restore`))}
        />
      ) : null}
    </>
  );
}
