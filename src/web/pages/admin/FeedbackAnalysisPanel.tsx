import { useEffect, useRef, useState } from 'react';
import { NOTHING_TO_ANALYSE, type FeedbackSummaryView, type FeedbackThemesView } from '../../../shared/feedback-analysis';
import { api, type ApiResult } from '../../api-client';
import { analysisBasisLabel, themeLabel, type FeedbackFilterForm } from './admin-view-state';

type Analysis =
  | { readonly kind: 'summary'; readonly view: FeedbackSummaryView }
  | { readonly kind: 'themes'; readonly view: FeedbackThemesView };

type State =
  | { readonly state: 'idle' }
  | { readonly state: 'working' }
  | { readonly state: 'shown'; readonly analysis: Analysis }
  | { readonly state: 'refused'; readonly message: string; readonly isNothingToAnalyse: boolean };

const FAILED = 'The AI could not be asked. Try again.';

function outcomeOf<View>(result: ApiResult<View>, shown: (view: View) => Analysis): State {
  if (result.ok) return { state: 'shown', analysis: shown(result.data) };
  return { state: 'refused', message: result.error.message ?? FAILED, isNothingToAnalyse: result.error.code === NOTHING_TO_ANALYSE };
}

/**
 * Asks the AI, through the server, about the comments in the list as it was last shown: for a summary (REQ-TRV-066) or for the
 * themes that recur (REQ-TRV-067). The browser sends its filters to the server and never anything to the AI. A result is
 * dropped when the list is filtered again, since it would then describe comments no longer on show.
 */
export function FeedbackAnalysisPanel({ filter }: { readonly filter: FeedbackFilterForm }) {
  const [shown, setShown] = useState<State>({ state: 'idle' });
  const newestAsked = useRef(0);

  useEffect(() => {
    newestAsked.current += 1;
    setShown({ state: 'idle' });
  }, [filter]);

  const ask = async (what: 'summary' | 'themes') => {
    if (shown.state === 'working') return;
    newestAsked.current += 1;
    const thisAsk = newestAsked.current;
    setShown({ state: 'working' });
    const outcome =
      what === 'summary'
        ? outcomeOf(await api<FeedbackSummaryView>('POST', '/api/admin/feedback/summary', filter), (view) => ({ kind: 'summary', view }))
        : outcomeOf(await api<FeedbackThemesView>('POST', '/api/admin/feedback/themes', filter), (view) => ({ kind: 'themes', view }));
    if (thisAsk === newestAsked.current) setShown(outcome);
  };

  const isWorking = shown.state === 'working';
  return (
    <section aria-label="AI analysis">
      <h2>AI analysis</h2>
      <p className="muted">
        Asks the AI about the comments in the list shown, newest first. They are sent without the Traveler’s name, email address or Trip name, and any email address or phone number written in a comment is removed. Anything else in a comment is sent as written.
      </p>
      <button type="button" aria-disabled={isWorking} onClick={() => void ask('summary')}>
        Summarise feedback
      </button>{' '}
      <button type="button" aria-disabled={isWorking} onClick={() => void ask('themes')}>
        Find recurring themes
      </button>
      {isWorking ? <p role="status">Asking the AI…</p> : null}
      {shown.state === 'refused' ? <p role={shown.isNothingToAnalyse ? 'status' : 'alert'}>{shown.message}</p> : null}
      {shown.state === 'shown' && shown.analysis.kind === 'summary' ? (
        <>
          <h3>Summary</h3>
          <p>{shown.analysis.view.summary}</p>
          <p className="muted">{analysisBasisLabel(shown.analysis.view)}</p>
          <p className="muted">Written by the AI from the comments. It can be wrong.</p>
        </>
      ) : null}
      {shown.state === 'shown' && shown.analysis.kind === 'themes' ? (
        <>
          <h3>Recurring themes</h3>
          {shown.analysis.view.themes.length === 0 ? (
            <p>The AI found no theme that recurs.</p>
          ) : (
            <ul aria-label="Recurring themes, most entries first">
              {shown.analysis.view.themes.map((theme, index) => (
                <li key={`${index}-${theme.name}`}>{themeLabel(theme)}</li>
              ))}
            </ul>
          )}
          <p className="muted">{analysisBasisLabel(shown.analysis.view)}</p>
          <p className="muted">Named by the AI from the comments. It can be wrong.</p>
        </>
      ) : null}
    </section>
  );
}
