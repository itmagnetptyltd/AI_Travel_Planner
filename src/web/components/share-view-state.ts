import type { ShareSummary } from '../../shared/share-schemas';
import type { ApiError } from '../api-client';

export const recipientLabel = (share: Pick<ShareSummary, 'recipient'>): string => share.recipient ?? 'Your own Plan email';

/** When a link was sent, to the minute, so two links to the same address can be told apart. */
const sentAt = (iso: string): string => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

export const revokeLabel = (share: Pick<ShareSummary, 'recipient' | 'createdAt'>): string =>
  `Revoke link for ${recipientLabel(share)} sent ${sentAt(share.createdAt)}`;

/** Until when a link works, or why it no longer does. Revoked outranks expired: the Traveler did that on purpose. */
export function shareStatus(share: Pick<ShareSummary, 'expiresAt' | 'isRevoked'>, now: Date): string {
  if (share.isRevoked) return 'Revoked';
  if (new Date(share.expiresAt).getTime() <= now.getTime()) return 'Expired';
  return `Works until ${share.expiresAt.slice(0, 10)}`;
}

export const emailedMessage = (address: string): string => `The Plan was emailed to ${address}.`;

const PLAIN_SHARE_FAILURE = 'The Plan could not be shared. Try again.';

/** What to tell a Traveler whose share was refused. The server's own words are used where it wrote them for a person. */
export function shareFailureMessage(error: Pick<ApiError, 'code' | 'message' | 'field'>): string {
  if (error.code === 'VALIDATION_FAILED' && error.field === 'recipient') return 'Enter a valid email address.';
  return error.message ?? PLAIN_SHARE_FAILURE;
}

/** What a shared link says when it cannot be opened. Nothing about the Plan is ever said with it. */
export function linkProblemMessage(status: number): string {
  if (status === 410) return 'This link has expired.';
  if (status === 404) return 'This link is not valid.';
  return 'This link could not be opened. Try again.';
}
