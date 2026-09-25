import { useState } from 'react';
import type { TripView } from '../../shared/trip-schemas';
import { planBanner, planButtonLabel } from '../pages/plan-view-state';
import { BudgetPanel } from './BudgetPanel';
import { ChatBox } from './ChatBox';
import { ConfirmRegeneration } from './ConfirmRegeneration';
import { FeedbackPanel } from './FeedbackPanel';
import { PlanDisplay } from './PlanDisplay';
import { PlanVersions } from './PlanVersions';
import { SharePanel } from './SharePanel';
import { busyText, isSlowRequest, useElapsedMs } from './plan-progress';
import { usePlanPanel } from './use-plan-panel';

/**
 * A Trip's Plan section. It shows the saved Plan as soon as the page opens, and asks the AI for a new one
 * only when the Traveler presses the button, never when the page opens. A failed or refused request leaves
 * the saved Plan on show. When the AI fails the Traveler sees the fallback message and can still change the
 * Plan by hand. `onPlanSaved` runs after a Plan is saved, so the page can show the Trip as Planned.
 */
export function PlanGenerator({ trip, onPlanSaved }: { readonly trip: TripView; readonly onPlanSaved: () => void }) {
  const { panel, busy, versions, loadFailure, pending, regeneratePlan, restore, cancelPending, showPlan, actions } = usePlanPanel(
    trip.id,
    onPlanSaved,
  );
  const [isChatBusy, setIsChatBusy] = useState(false);
  const elapsedMs = useElapsedMs(busy !== null);
  const banner = panel.plan ? planBanner(panel.plan, trip) : null;
  // Asking the chat, or deciding on what it suggested, and changing the Plan another way, never happen at once.
  const planActions = { ...actions, isBusy: actions.isBusy || isChatBusy };

  return (
    <>
      <button type="button" disabled={planActions.isBusy} onClick={regeneratePlan}>
        {planButtonLabel(panel.plan !== null)}
      </button>
      {busy ? <p role="status">{busyText(busy, elapsedMs)}</p> : null}
      {busy && isSlowRequest(busy) ? <progress aria-label="Progress of the AI request" /> : null}
      {panel.notice ? <p role="alert">{panel.notice.message}</p> : null}
      {loadFailure ? <p role="alert">{loadFailure}</p> : null}
      {pending ? <ConfirmRegeneration message={pending.message} isBusy={planActions.isBusy} onConfirm={() => void pending.run()} onCancel={cancelPending} /> : null}
      {banner ? (
        <p role="note" className="plan-notice">
          {banner}
        </p>
      ) : null}
      {panel.plan ? <PlanDisplay plan={panel.plan} actions={planActions} /> : null}
      {panel.plan ? <BudgetPanel tripId={trip.id} planVersion={panel.plan.version} /> : null}
      {panel.plan ? <SharePanel tripId={trip.id} isBusy={planActions.isBusy} /> : null}
      {panel.plan ? <FeedbackPanel key={trip.id} tripId={trip.id} /> : null}
      {panel.plan && versions.length > 0 ? (
        <PlanVersions versions={versions} currentVersion={panel.plan.version} isBusy={planActions.isBusy} onRestore={restore} />
      ) : null}
      {panel.plan ? <ChatBox tripId={trip.id} planVersion={panel.plan.version} currency={panel.plan.currency} isBusy={actions.isBusy} onBusyChange={setIsChatBusy} onPlanChanged={showPlan} /> : null}
    </>
  );
}
