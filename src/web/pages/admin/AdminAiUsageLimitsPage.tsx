import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api-client';
import { FormField } from '../../components/FormField';

interface Limits {
  readonly dailyPlanGenerationLimit: number;
}

type Message = { readonly text: string; readonly isError: boolean } | null;

/** How many Plans one Traveler may generate per day (REQ-TRV-091). Stored AI requests are reached from here. */
export function AdminAiUsageLimitsPage() {
  const [limit, setLimit] = useState('');
  const [message, setMessage] = useState<Message>(null);

  useEffect(() => {
    let isCurrent = true;
    void api<Limits>('GET', '/api/admin/ai-usage-limits').then((result) => {
      if (!isCurrent) return;
      if (result.ok) setLimit(String(result.data.dailyPlanGenerationLimit));
      else setMessage({ text: result.error.message ?? 'The limits could not be loaded.', isError: true });
    });
    return () => {
      isCurrent = false;
    };
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const result = await api<Limits>('PUT', '/api/admin/ai-usage-limits', {
      dailyPlanGenerationLimit: limit.trim() === '' ? null : Number(limit),
    });
    setMessage(
      result.ok
        ? { text: 'Limit saved.', isError: false }
        : { text: result.error.message ?? 'The limit could not be saved.', isError: true },
    );
  };

  return (
    <>
      <h1>AI usage limits</h1>
      <form onSubmit={(event) => void save(event)}>
        <FormField
          label="Plan generations per Traveler per day"
          type="number"
          value={limit}
          onChange={setLimit}
          description="A Traveler past this many generations in one day is told when the limit resets."
        />
        <button type="submit">Save limit</button>
      </form>
      {message ? <p role={message.isError ? 'alert' : 'status'}>{message.text}</p> : null}
      <p>
        <Link to="/admin/ai-requests">Stored AI requests</Link>
      </p>
    </>
  );
}
