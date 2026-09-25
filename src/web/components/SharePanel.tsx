import { useRef, type FormEvent } from 'react';
import { SHARE_DAILY_LIMIT } from '../../shared/share-schemas';
import { FormField } from './FormField';
import { recipientLabel, revokeLabel, shareStatus } from './share-view-state';
import { useShares, type SharesController } from './use-shares';

function ShareList({ controller, onDone }: { readonly controller: SharesController; readonly onDone: (action: () => Promise<void>) => () => void }) {
  const now = new Date();
  if (controller.shares.length === 0) return null;
  return (
    <ul aria-label="Links to this Plan">
      {controller.shares.map((share) => (
        <li key={share.id}>
          {`${recipientLabel(share)}: ${shareStatus(share, now)}. `}
          {share.isRevoked ? null : (
            <button type="button" disabled={controller.isBusy} onClick={onDone(() => controller.revoke(share.id))}>
              {revokeLabel(share)}
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Sends the Plan by email, to the Traveler on request (REQ-TRV-054) or to another person they name (REQ-TRV-058), and
 * lists the links those emails hold so any of them can be revoked. A link opens the Trip's read-only Plan with no login.
 * Whatever is pressed, the result is announced, and focus goes to the heading, since the button pressed may be gone.
 */
export function SharePanel({ tripId, isBusy }: { readonly tripId: string; readonly isBusy: boolean }) {
  const controller = useShares(tripId);
  const heading = useRef<HTMLHeadingElement>(null);
  const isWorking = controller.isBusy || isBusy;
  const announcement = controller.recipientError ?? (controller.notice && !controller.notice.isError ? controller.notice.text : '');
  const then = (action: () => Promise<void>) => () => void action().then(() => heading.current?.focus());
  const submit = (event: FormEvent) => {
    event.preventDefault();
    then(controller.share)();
  };
  return (
    <section aria-labelledby="share-heading">
      <h2 id="share-heading" ref={heading} tabIndex={-1}>
        Share and email
      </h2>
      <p>
        <button type="button" disabled={isWorking} onClick={then(controller.emailPlan)}>
          Email me this Plan
        </button>
      </p>
      <form onSubmit={submit} noValidate aria-label="Share this Plan">
        <FormField
          label="Email address to share with"
          type="email"
          value={controller.recipient}
          onChange={controller.setRecipient}
          error={controller.recipientError}
          autoComplete="off"
          description={`They get an email with the Plan and a link to a read-only view. You can share with up to ${SHARE_DAILY_LIMIT} people a day.`}
        />
        <button type="submit" disabled={isWorking}>
          Share
        </button>
      </form>
      <div aria-live="polite">{announcement}</div>
      {controller.notice?.isError ? <p role="alert">{controller.notice.text}</p> : null}
      <ShareList controller={controller} onDone={then} />
    </section>
  );
}
