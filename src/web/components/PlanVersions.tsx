import type { PlanVersionSummary } from '../../shared/plan-schemas';
import { versionDetail, versionLabel } from '../pages/plan-view-state';

/**
 * Every saved version of the Plan, newest first. Restoring an earlier one saves a copy of it as a new
 * version, so nothing is overwritten (REQ-TRV-018).
 */
export function PlanVersions({
  versions,
  currentVersion,
  isBusy,
  onRestore,
}: {
  readonly versions: readonly PlanVersionSummary[];
  readonly currentVersion: number;
  readonly isBusy: boolean;
  readonly onRestore: (version: number) => void;
}) {
  return (
    <section aria-labelledby="plan-versions-heading">
      <h2 id="plan-versions-heading">Plan versions</h2>
      <ul aria-label="Plan versions">
        {versions.map((summary) => {
          const isCurrent = summary.version === currentVersion;
          return (
            <li key={summary.version}>
              <strong>{versionLabel(summary)}</strong> <span className="muted">{versionDetail(summary, isCurrent)}</span>{' '}
              {isCurrent ? null : (
                <button type="button" disabled={isBusy} aria-label={`Restore ${versionLabel(summary)}`} onClick={() => onRestore(summary.version)}>
                  Restore
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
