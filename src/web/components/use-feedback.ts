import { useCallback, useEffect, useRef, useState } from 'react';
import { FEEDBACK_NOT_FOUND, type FeedbackView } from '../../shared/feedback-schemas';
import { api } from '../api-client';
import { FEEDBACK_SAVED_MESSAGE, feedbackFailureMessage } from './feedback-view-state';

export interface Notice {
  readonly text: string;
  readonly isError: boolean;
}

export interface FeedbackController {
  readonly isLoaded: boolean;
  readonly rating: number | null;
  readonly comment: string;
  readonly notice: Notice | null;
  readonly isSaving: boolean;
  readonly setRating: (rating: number) => void;
  readonly setComment: (comment: string) => void;
  readonly save: () => Promise<void>;
}

/**
 * A Trip's one piece of feedback: read when the panel opens, so a Traveler who gave some can see and change it, and saved
 * by replacing it (REQ-TRV-062). Nothing can be saved until it has been read, so a failed read never becomes an empty save.
 */
export function useFeedback(tripId: string): FeedbackController {
  const [isLoaded, setIsLoaded] = useState(false);
  const [rating, setRatingValue] = useState<number | null>(null);
  const [comment, setCommentText] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const newestRead = useRef(0);
  const path = `/api/trips/${encodeURIComponent(tripId)}/feedback`;

  const show = useCallback((feedback: FeedbackView | null) => {
    setRatingValue(feedback?.rating ?? null);
    setCommentText(feedback?.comment ?? '');
  }, []);

  useEffect(() => {
    newestRead.current += 1;
    const thisRead = newestRead.current;
    void api<FeedbackView>('GET', path).then((result) => {
      if (thisRead !== newestRead.current) return;
      if (result.ok) show(result.data);
      if (result.ok || result.error.code === FEEDBACK_NOT_FOUND) setIsLoaded(true);
      else setNotice({ text: 'Your feedback could not be loaded. Reload the page to try again.', isError: true });
    });
    return () => {
      newestRead.current += 1;
    };
  }, [path, show]);

  return {
    isLoaded,
    rating,
    comment,
    notice,
    isSaving,
    setRating: (value) => {
      setRatingValue(value);
      setNotice(null);
    },
    setComment: (value) => {
      setCommentText(value);
      setNotice(null);
    },
    save: async () => {
      if (isSaving) return;
      setIsSaving(true);
      setNotice(null);
      const result = await api<FeedbackView>('PUT', path, { rating, comment });
      setIsSaving(false);
      setNotice(result.ok ? { text: FEEDBACK_SAVED_MESSAGE, isError: false } : { text: feedbackFailureMessage(result.error), isError: true });
    },
  };
}
