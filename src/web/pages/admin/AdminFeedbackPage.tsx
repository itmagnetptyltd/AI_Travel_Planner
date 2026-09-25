import { useEffect, useState, type FormEvent } from 'react';
import type { AdminFeedbackView } from '../../../shared/feedback-schemas';
import { api } from '../../api-client';
import { FormField } from '../../components/FormField';
import { csvUrlFor, EMPTY_FEEDBACK_FORM, feedbackQuery, type FeedbackFilterForm } from './admin-view-state';

type State =
  | { readonly state: 'loading' }
  | { readonly state: 'loaded'; readonly feedback: readonly AdminFeedbackView[] }
  | { readonly state: 'failed'; readonly message: string };

const SORTS = [
  { value: '', label: 'Newest first', sort: '', order: '' },
  { value: 'date-asc', label: 'Oldest first', sort: 'date', order: 'asc' },
  { value: 'rating-asc', label: 'Rating, lowest first', sort: 'rating', order: 'asc' },
  { value: 'rating-desc', label: 'Rating, highest first', sort: 'rating', order: 'desc' },
] as const;

const NO_TRIP = 'No longer available';

/**
 * All the feedback Travelers have given (REQ-TRV-064), which can be filtered by keyword, rating, Destination and date range,
 * sorted, and exported as CSV (REQ-TRV-065). That is all it offers: filtering and reading, with no way to tag feedback.
 * The CSV is of the list as it is filtered.
 */
export function AdminFeedbackPage() {
  const [form, setForm] = useState<FeedbackFilterForm>(EMPTY_FEEDBACK_FORM);
  const [applied, setApplied] = useState<FeedbackFilterForm>(EMPTY_FEEDBACK_FORM);
  const [shown, setShown] = useState<State>({ state: 'loading' });

  useEffect(() => {
    let isCurrent = true;
    setShown({ state: 'loading' });
    void api<{ feedback: AdminFeedbackView[] }>('GET', `/api/admin/feedback${feedbackQuery(applied)}`).then((result) => {
      if (!isCurrent) return;
      setShown(
        result.ok
          ? { state: 'loaded', feedback: result.data.feedback }
          : { state: 'failed', message: result.error.message ?? 'The feedback could not be loaded.' },
      );
    });
    return () => {
      isCurrent = false;
    };
  }, [applied]);

  const change = (field: keyof FeedbackFilterForm) => (value: string) => setForm((current) => ({ ...current, [field]: value }));
  const chooseSort = (value: string) => {
    const choice = SORTS.find((candidate) => candidate.value === value) ?? SORTS[0];
    setForm((current) => ({ ...current, sort: choice.sort, order: choice.order }));
  };
  const apply = (event: FormEvent) => {
    event.preventDefault();
    setApplied(form);
  };
  const clear = () => {
    setForm(EMPTY_FEEDBACK_FORM);
    setApplied(EMPTY_FEEDBACK_FORM);
  };
  const sortValue = SORTS.find((choice) => choice.sort === form.sort && choice.order === form.order)?.value ?? '';

  return (
    <>
      <h1>Feedback</h1>
      <form onSubmit={apply} role="search" aria-label="Filter feedback" noValidate>
        <FormField label="Keyword in the comment" value={form.keyword} onChange={change('keyword')} />
        <div className="field">
          <label htmlFor="feedback-rating">Rating</label>
          <select id="feedback-rating" value={form.rating} onChange={(event) => change('rating')(event.target.value)}>
            <option value="">Any</option>
            {[1, 2, 3, 4, 5].map((rating) => (
              <option key={rating} value={rating}>
                {rating}
              </option>
            ))}
          </select>
        </div>
        <FormField label="Destination" value={form.destination} onChange={change('destination')} />
        <FormField label="From" type="date" value={form.from} onChange={change('from')} />
        <FormField label="To" type="date" value={form.to} onChange={change('to')} />
        <div className="field">
          <label htmlFor="feedback-sort">Sort</label>
          <select id="feedback-sort" value={sortValue} onChange={(event) => chooseSort(event.target.value)}>
            {SORTS.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit">Show feedback</button>
        <button type="button" onClick={clear}>
          Clear filters
        </button>
      </form>
      {shown.state === 'failed' ? null : (
        <p>
          <a href={csvUrlFor(applied)} download="feedback.csv">
            Export CSV
          </a>{' '}
          <span className="muted">Exports the list as last shown{form === applied ? '' : ', not the filters you have changed since'}.</span>
        </p>
      )}
      {shown.state === 'loading' ? <p>Loading…</p> : null}
      {shown.state === 'failed' ? <p role="alert">{shown.message}</p> : null}
      {shown.state === 'loaded' && shown.feedback.length === 0 ? <p role="status">No feedback matches.</p> : null}
      {shown.state === 'loaded' && shown.feedback.length > 0 ? (
        <table>
          <caption>{`Feedback: ${shown.feedback.length} ${shown.feedback.length === 1 ? 'entry' : 'entries'}`}</caption>
          <thead>
            <tr>
              <th scope="col">Rating</th>
              <th scope="col">Comment</th>
              <th scope="col">Trip</th>
              <th scope="col">Destination</th>
              <th scope="col">Date</th>
            </tr>
          </thead>
          <tbody>
            {shown.feedback.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.rating}</td>
                <td>{entry.comment ?? ''}</td>
                <td>{entry.tripName ?? NO_TRIP}</td>
                <td>{`${entry.destination.name}, ${entry.destination.country}`}</td>
                <td>{entry.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </>
  );
}
