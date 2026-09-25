import { useCallback, useEffect, useRef, useState } from 'react';
import type { ShareSummary } from '../../shared/share-schemas';
import { api } from '../api-client';
import { emailedMessage, shareFailureMessage } from './share-view-state';

export interface Notice {
  readonly text: string;
  readonly isError: boolean;
}

export interface SharesController {
  readonly shares: readonly ShareSummary[];
  readonly recipient: string;
  readonly recipientError: string | undefined;
  readonly notice: Notice | null;
  readonly isBusy: boolean;
  readonly setRecipient: (value: string) => void;
  readonly emailPlan: () => Promise<void>;
  readonly share: () => Promise<void>;
  readonly revoke: (shareId: string) => Promise<void>;
}

const LIST_FAILED = 'Your links could not be shown. Reload the page to try again.';

/**
 * A Trip's links to its read-only Plan, and what can be done with them: email the Plan to oneself, share it, revoke a
 * link. The list is read again after every action. Only the newest read counts, so a slow earlier one can never put back
 * a list that an action has since changed, and one that finishes after the panel has gone is dropped.
 */
export function useShares(tripId: string): SharesController {
  const [shares, setShares] = useState<readonly ShareSummary[]>([]);
  const [recipient, setRecipientText] = useState('');
  const [recipientError, setRecipientError] = useState<string | undefined>(undefined);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const newestRead = useRef(0);
  const base = `/api/trips/${encodeURIComponent(tripId)}`;

  const load = useCallback(async (): Promise<void> => {
    newestRead.current += 1;
    const thisRead = newestRead.current;
    const result = await api<{ shares: ShareSummary[] }>('GET', `${base}/shares`);
    if (thisRead !== newestRead.current) return;
    if (result.ok) setShares(result.data.shares);
    else setNotice({ text: LIST_FAILED, isError: true });
  }, [base]);

  useEffect(() => {
    void load();
    return () => {
      newestRead.current += 1;
    };
  }, [load]);

  const run = async (work: () => Promise<void>): Promise<void> => {
    if (isBusy) return;
    setIsBusy(true);
    setNotice(null);
    setRecipientError(undefined);
    try {
      await work();
    } finally {
      setIsBusy(false);
    }
  };

  return {
    shares,
    recipient,
    recipientError,
    notice,
    isBusy,
    setRecipient: (value) => {
      setRecipientText(value);
      setRecipientError(undefined);
    },
    emailPlan: () =>
      run(async () => {
        const result = await api<{ sentTo: string }>('POST', `${base}/plan/email`);
        setNotice(result.ok ? { text: emailedMessage(result.data.sentTo), isError: false } : { text: shareFailureMessage(result.error), isError: true });
        await load();
      }),
    share: () =>
      run(async () => {
        const result = await api<ShareSummary>('POST', `${base}/shares`, { recipient });
        if (result.ok) {
          setRecipientText('');
          setNotice({ text: `The Plan was shared with ${result.data.recipient ?? recipient}.`, isError: false });
        } else if (result.error.code === 'VALIDATION_FAILED' && result.error.field === 'recipient') {
          setRecipientError(shareFailureMessage(result.error));
        } else {
          setNotice({ text: shareFailureMessage(result.error), isError: true });
        }
        await load();
      }),
    revoke: (shareId) =>
      run(async () => {
        const result = await api('DELETE', `${base}/shares/${encodeURIComponent(shareId)}`);
        setNotice(result.ok ? { text: 'The link was revoked.', isError: false } : { text: 'The link could not be revoked. Try again.', isError: true });
        await load();
      }),
  };
}
