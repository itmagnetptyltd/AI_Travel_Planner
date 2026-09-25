import { AI_UNAVAILABLE, PLAN_LIMIT_REACHED, TRIP_CHANGED, type PlanActivity } from '../../shared/plan-schemas';
import type { ApiError } from '../api-client';

/** What the Traveler has typed for one Activity, exactly as entered. */
export interface ActivityFormValues {
  readonly title: string;
  readonly startTime: string;
  readonly durationMinutes: string;
  readonly estimatedCost: string;
  readonly location: string;
}

export const EMPTY_ACTIVITY_FORM: ActivityFormValues = {
  title: '',
  startTime: '',
  durationMinutes: '',
  estimatedCost: '',
  location: '',
};

export type ActivityFormField = keyof ActivityFormValues;

export const ACTIVITY_FORM_FIELDS: readonly ActivityFormField[] = ['title', 'startTime', 'durationMinutes', 'estimatedCost', 'location'];

const NUMBER_FIELDS: readonly ActivityFormField[] = ['durationMinutes', 'estimatedCost'];

export const valuesFromActivity = (activity: Pick<PlanActivity, ActivityFormField>): ActivityFormValues => ({
  title: activity.title,
  startTime: activity.startTime,
  durationMinutes: String(activity.durationMinutes),
  estimatedCost: String(activity.estimatedCost),
  location: activity.location,
});

/** A blank is sent as typed when the Traveler blanked a field that had a value, so the server names it. */
function sentValue(field: ActivityFormField, text: string): string | number {
  return text.trim() === '' || !NUMBER_FIELDS.includes(field) ? text : Number(text);
}

function sentFields(values: ActivityFormValues, only: (field: ActivityFormField) => boolean): Record<string, string | number> {
  return Object.fromEntries(ACTIVITY_FORM_FIELDS.filter(only).map((field) => [field, sentValue(field, values[field])]));
}

/** Only what the Traveler changed, so an edit that changes nothing is not saved as a change. */
export const changesMade = (original: ActivityFormValues, values: ActivityFormValues): Record<string, string | number> =>
  sentFields(values, (field) => values[field] !== original[field]);

/** A whole Activity: typed in, or an AI suggestion the Traveler accepted (`fromSuggestion`), whose reason is kept. */
export function newActivityPayload(
  values: ActivityFormValues,
  suggestion?: { readonly fromSuggestion: true; readonly reason: string },
): Record<string, string | number | boolean> {
  // A field left blank is left out, so the server names what is missing rather than receiving a guess.
  return { ...sentFields(values, (field) => values[field].trim() !== ''), ...(suggestion ?? {}) };
}

const FIELD_PROBLEMS: Readonly<Record<string, string>> = {
  title: 'Check the title.',
  startTime: 'Check the start time. Use 24-hour HH:MM, for example 14:30.',
  durationMinutes: 'Check the duration in minutes.',
  estimatedCost: 'Check the estimated cost. Use a whole number.',
  location: 'Check the location.',
};

const PLAIN_PROBLEM = 'The change could not be saved. Try again.';

/** What to tell the Traveler when the server refused an Activity or could not suggest one. */
export function problemWith(error: ApiError): string {
  const isAboutTheAi = [AI_UNAVAILABLE, PLAN_LIMIT_REACHED, TRIP_CHANGED].includes(error.code);
  if (isAboutTheAi && error.message) return error.message;
  return (error.field === undefined ? undefined : FIELD_PROBLEMS[error.field]) ?? error.message ?? PLAIN_PROBLEM;
}
