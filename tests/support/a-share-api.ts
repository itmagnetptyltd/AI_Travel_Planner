import type { ShareSummary, SharedPlanView } from '../../src/shared/share-schemas';
import type { TravelerWithTrip } from './a-saved-plan-journey';

type Ready = Pick<TravelerWithTrip, 'testApp' | 'cookies' | 'tripId'>;

export const emailPlan = (ready: Ready, cookies = ready.cookies) =>
  ready.testApp.app.inject({ method: 'POST', url: `/api/trips/${ready.tripId}/plan/email`, cookies });

export const sharePlan = (ready: Ready, recipient: unknown, cookies = ready.cookies) =>
  ready.testApp.app.inject({ method: 'POST', url: `/api/trips/${ready.tripId}/shares`, cookies, payload: { recipient } });

export const listShares = (ready: Ready, cookies = ready.cookies) =>
  ready.testApp.app.inject({ method: 'GET', url: `/api/trips/${ready.tripId}/shares`, cookies });

export const revokeShare = (ready: Ready, shareId: string, cookies = ready.cookies) =>
  ready.testApp.app.inject({ method: 'DELETE', url: `/api/trips/${ready.tripId}/shares/${shareId}`, cookies });

/** Opens a link as anyone would: no cookie, no login. */
export const openSharedLink = (ready: Ready, token: string) => ready.testApp.app.inject({ method: 'GET', url: `/api/shared/${token}` });

export const sharedViewOf = (response: { json(): unknown }): SharedPlanView => response.json() as SharedPlanView;
export const sharesOf = (response: { json(): unknown }): ShareSummary[] => (response.json() as { shares: ShareSummary[] }).shares;

/** The token in the link of the latest email whose text has one, sent to `address`. */
export function tokenSentTo(ready: Ready, address: string): string {
  const message = ready.testApp.email.sentTo(address).filter((sent) => /\/shared\//.test(sent.text)).at(-1);
  const token = message?.text.match(/\/shared\/([A-Za-z0-9_-]+)/)?.[1];
  if (!token) throw new Error(`No share link in any email to ${address}`);
  return token;
}
