import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AiRequestSummary } from '../../../shared/ai-limits';
import { api } from '../../api-client';
import { costText } from './ai-request-labels';

type State =
  | { readonly state: 'loading' }
  | { readonly state: 'loaded'; readonly requests: readonly AiRequestSummary[] }
  | { readonly state: 'failed'; readonly message: string };

/** Every stored AI request, without its text. Opening one shows the text and is audit-logged (REQ-TRV-034). */
export function AdminAiRequestsPage() {
  const [state, setState] = useState<State>({ state: 'loading' });

  useEffect(() => {
    let isCurrent = true;
    void api<{ requests: readonly AiRequestSummary[] }>('GET', '/api/admin/ai-requests').then((result) => {
      if (!isCurrent) return;
      setState(
        result.ok
          ? { state: 'loaded', requests: result.data.requests }
          : { state: 'failed', message: result.error.message ?? 'The requests could not be loaded.' },
      );
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  if (state.state === 'loading') return <p>Loading…</p>;
  if (state.state === 'failed') return <p role="alert">{state.message}</p>;
  return (
    <>
      <h1>Stored AI requests</h1>
      {state.requests.length === 0 ? (
        <p>No AI requests yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Result</th>
              <th scope="col">Tokens in / out</th>
              <th scope="col">Estimated cost</th>
              <th scope="col">Text</th>
            </tr>
          </thead>
          <tbody>
            {state.requests.map((request) => (
              <tr key={request.id}>
                <td>{request.createdAt}</td>
                <td>{request.status}</td>
                <td>{`${request.inputTokens} / ${request.outputTokens}`}</td>
                <td>{costText(request.costMicroUsd)}</td>
                <td>
                  <Link to={`/admin/ai-requests/${encodeURIComponent(request.id)}`}>View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p>
        <Link to="/admin/ai-usage-limits">AI usage limits</Link>
      </p>
    </>
  );
}
