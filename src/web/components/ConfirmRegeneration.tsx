/**
 * Asks the Traveler whether to go on before the Plan is written again over Activities they changed
 * themselves (REQ-TRV-041). Nothing has been asked of the AI yet.
 */
export function ConfirmRegeneration({ message, isBusy, onConfirm, onCancel }: {
  readonly message: string;
  readonly isBusy: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  return (
    <div role="group" aria-label="Confirm regeneration" className="plan-notice">
      <p>{message}</p>
      <button type="button" disabled={isBusy} onClick={onConfirm}>
        Replace my changes and regenerate
      </button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
