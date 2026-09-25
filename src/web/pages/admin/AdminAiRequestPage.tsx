import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AiRequestDetail } from '../../../shared/ai-limits';
import { api } from '../../api-client';
import { costText } from './ai-request-labels';

type State =
  | { readonly state: 'loading' }
  | { readonly state: 'loaded'; readonly detail: AiRequestDetail }
  | { readonly state: 'failed'; readonly message: string };

function TextBlock({ heading, text }: { readonly heading: string; readonly text: string | null }) {
  return (
    <>
      <h2>{heading}</h2>
      {text === null ? <p>The text is no longer kept: it is deleted after 30 days.</p> : <pre className="ai-text">{text}</pre>}
    </>
  );
}

/** One stored AI request with its text. Opening it writes an audit log entry naming the Administrator. */
export function AdminAiRequestPage() {
  const { id = '' } = useParams();
  const [state, setState] = useState<State>({ state: 'loading' });

  useEffect(() => {
    let isCurrent = true;
    void api<AiRequestDetail>('GET', `/api/admin/ai-requests/${encodeURIComponent(id)}`).then((result) => {
      if (!isCurrent) return;
      setState(
        result.ok
          ? { state: 'loaded', detail: result.data }
          : { state: 'failed', message: result.error.message ?? 'This request could not be loaded.' },
      );
    });
    return () => {
      isCurrent = false;
    };
  }, [id]);

  if (state.state === 'loading') return <p>Loading…</p>;
  if (state.state === 'failed') return <p role="alert">{state.message}</p>;
  const { detail } = state;
  return (
    <>
      <h1>AI request</h1>
      <p>{`${detail.createdAt}, ${detail.status}, ${detail.inputTokens} tokens in, ${detail.outputTokens} out, ${costText(detail.costMicroUsd)}`}</p>
      <TextBlock heading="Sent to the AI" text={detail.requestText} />
      <TextBlock heading="Returned by the AI" text={detail.replyText} />
      <p>
        <Link to="/admin/ai-requests">Back to stored AI requests</Link>
      </p>
    </>
  );
}
