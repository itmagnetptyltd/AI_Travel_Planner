import type { AdminFeedbackView } from '../../shared/feedback-schemas';

const HEADING = ['Rating', 'Comment', 'Destination', 'Date'];
/** A cell that starts with one of these is run by a spreadsheet as a formula, or as a command. */
const STARTS_A_FORMULA = /^[=+\-@\t\r]/;
const NEEDS_QUOTING = /[",\r\n]/;
const ROW_END = '\r\n';

/** Text a person typed, made safe to open in a spreadsheet: a leading apostrophe stops it being read as a formula. */
const asText = (text: string): string => (STARTS_A_FORMULA.test(text) ? `'${text}` : text);

const cell = (text: string): string => (NEEDS_QUOTING.test(text) ? `"${text.replace(/"/g, '""')}"` : text);

/**
 * Feedback as CSV: the rating, comment, Destination and date, and nothing that identifies a Trip or a Traveler
 * (REQ-TRV-065). Comments and Destination names are text a person wrote, so they are made safe for a spreadsheet.
 */
export function feedbackCsv(entries: readonly AdminFeedbackView[]): string {
  const rows = entries.map((entry) => [String(entry.rating), asText(entry.comment ?? ''), asText(entry.destination.name), entry.date]);
  return [HEADING, ...rows].map((row) => row.map(cell).join(',') + ROW_END).join('');
}
