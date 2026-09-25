import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { PlanDisplay } from '../../src/web/components/PlanDisplay';
import { PlanGenerator } from '../../src/web/components/PlanGenerator';
import { ChatBox } from '../../src/web/components/ChatBox';
import { FeedbackPanel } from '../../src/web/components/FeedbackPanel';
import { BudgetPanel } from '../../src/web/components/BudgetPanel';
import { PreferenceSummary } from '../../src/web/components/PreferenceSummary';
import { ReadOnlyPlan } from '../../src/web/components/ReadOnlyPlan';
import { SharePanel } from '../../src/web/components/SharePanel';
import { TripForm } from '../../src/web/components/TripForm';
import { TripTable } from '../../src/web/components/TripTable';
import type { PlanActions } from '../../src/web/components/plan-actions';
import { publicPlan } from '../../src/server/plans/public-plan';
import { PLAN_RECOMMENDATION_NOTICE } from '../../src/shared/plan-notice';
import type { PlanView } from '../../src/shared/plan-schemas';
import type { TripView } from '../../src/shared/trip-schemas';
import { estimatesOf } from '../../src/shared/trip-budget';
import { initialTripFormState } from '../../src/web/pages/trip-form-state';
import { aPlanView } from './a-plan';

/** What a component draws, as static HTML, with a router around it as the application has. Effects do not run, so nothing is loaded. */
export const markupOf = (element: ReactElement): string => renderToStaticMarkup(createElement(MemoryRouter, null, element));

const TAGS = /<[^>]*>/g;
const ATTRIBUTES = /\b(?:aria-label|title|alt|placeholder|value|name|href|src|for)="([^"]*)"/g;
const ENTITIES: Readonly<Record<string, string>> = { '&amp;': '&', '&#x27;': "'", '&quot;': '"', '&lt;': '<', '&gt;': '>' };

const decoded = (text: string): string => text.replace(/&(?:amp|quot|lt|gt|#x27);/g, (entity) => ENTITIES[entity] ?? entity);

/** Everything a person or a screen reader is given by the markup: its text, and the words in its labels, titles, names and addresses. */
export function shownIn(markup: string): string {
  const attributes = [...markup.matchAll(ATTRIBUTES)].map((match) => match[1] ?? '');
  return decoded([markup.replace(TAGS, ' '), ...attributes].join(' ')).replace(/\s+/g, ' ');
}

/** The same, without the one sentence that has to say "availability" and "bookings" in order to disclaim them. */
export const shownWithoutNotice = (markup: string): string => shownIn(markup).split(PLAN_RECOMMENDATION_NOTICE).join(' ');

/** How many of these elements the markup holds. */
export const countOf = (markup: string, tags: readonly string[]): number =>
  tags.reduce((total, tag) => total + (markup.match(new RegExp(`<${tag}\\b`, 'gi')) ?? []).length, 0);

export interface Control {
  readonly kind: 'button' | 'link' | 'input';
  readonly name: string;
  readonly href: string | null;
}

const nameOf = (attributes: string, inner: string): string => /aria-label="([^"]*)"/.exec(attributes)?.[1] ?? inner.replace(TAGS, ' ').replace(/\s+/g, ' ').trim();

/** Every button, link, submit or button input, and anything that says it is a button, by the name it is given. */
export function controlsIn(markup: string): Control[] {
  const found: Control[] = [];
  for (const match of markup.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    found.push({ kind: 'button', name: decoded(nameOf(match[1] ?? '', match[2] ?? '')), href: null });
  }
  for (const match of markup.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
    found.push({ kind: 'link', name: decoded(nameOf(match[1] ?? '', match[2] ?? '')), href: /href="([^"]*)"/.exec(match[1] ?? '')?.[1] ?? null });
  }
  for (const match of markup.matchAll(/<input\b([^>]*)>/g)) {
    const attributes = match[1] ?? '';
    if (/type="(submit|button|image)"/.test(attributes)) found.push({ kind: 'input', name: decoded(/value="([^"]*)"/.exec(attributes)?.[1] ?? nameOf(attributes, '')), href: null });
  }
  for (const match of markup.matchAll(/<(?!button\b|a\b|input\b)[a-z]+\b([^>]*role="button"[^>]*)>([\s\S]*?)<\/[a-z]+>/g)) {
    found.push({ kind: 'button', name: decoded(nameOf(match[1] ?? '', match[2] ?? '')), href: null });
  }
  return found;
}

/** Every address a link, form or embed in the markup points to. */
export const addressesIn = (markup: string): string[] => [...markup.matchAll(/\b(?:href|src|action)="([^"]*)"/g)].map((match) => match[1] ?? '');

export const A_TRIP: TripView = {
  id: 'trip-1',
  name: 'Kyoto Family Holiday',
  destination: { id: 'destination-1', name: 'Kyoto', country: 'Japan' },
  startDate: '2026-10-10',
  endDate: '2026-10-17',
  dayCount: 8,
  adults: 2,
  children: 2,
  numberOfTravelers: 4,
  budget: 5000,
  currency: 'USD',
  travelStyles: ['Relaxed'],
  interests: ['Food'],
  foodPreferences: [],
  transportation: [],
  accommodation: null,
  status: 'Planned',
};

const doNothing = async (): Promise<string | null> => null;

/** What a Traveler can do to a Plan on show, none of it doing anything: enough to draw it. */
export const NO_ACTIONS: PlanActions = {
  isBusy: false,
  onRegenerateDay: () => undefined,
  onEdit: doNothing,
  onRemove: doNothing,
  onMove: doNothing,
  onReplace: doNothing,
  onSuggest: async () => ({ ok: false, problem: 'not in a test' }),
};

export const A_FULL_PLAN: PlanView = aPlanView({ days: 8 });

/** A shared link's view of the Plan: what the Traveler sends to someone else. */
export const A_SHARED_VIEW = {
  trip: { name: A_TRIP.name, destination: { name: 'Kyoto', country: 'Japan' }, startDate: A_TRIP.startDate, endDate: A_TRIP.endDate },
  plan: publicPlan(A_FULL_PLAN),
  estimates: estimatesOf(A_FULL_PLAN),
  notice: PLAN_RECOMMENDATION_NOTICE,
};

export const VIEW_NAMES = [
  'plan',
  'shared or Administrator view of a Plan',
  'plan generator',
  'chat',
  'trip form',
  'trip preferences',
  'trip list',
  'sharing',
  'budget',
  'feedback',
] as const;
export type ViewName = (typeof VIEW_NAMES)[number];

/** Every screen a Traveler or an Administrator meets while planning a Trip, drawn with a full Plan where it takes one. */
export function everyPlanningView(): Readonly<Record<ViewName, string>> {
  const noop = () => undefined;
  return {
    plan: markupOf(createElement(PlanDisplay, { plan: A_FULL_PLAN, actions: NO_ACTIONS })),
    'shared or Administrator view of a Plan': markupOf(createElement(ReadOnlyPlan, { view: A_SHARED_VIEW })),
    'plan generator': markupOf(createElement(PlanGenerator, { trip: A_TRIP, onPlanSaved: noop })),
    chat: markupOf(createElement(ChatBox, { tripId: A_TRIP.id, planVersion: 1, currency: 'USD', isBusy: false, onBusyChange: noop, onPlanChanged: noop })),
    'trip form': markupOf(createElement(TripForm, { state: initialTripFormState(), dispatch: noop, submitLabel: 'Save Trip', onSubmit: noop })),
    'trip preferences': markupOf(createElement(PreferenceSummary, { trip: A_TRIP })),
    'trip list': markupOf(createElement(TripTable, { trips: [A_TRIP] })),
    sharing: markupOf(createElement(SharePanel, { tripId: A_TRIP.id, isBusy: false })),
    budget: markupOf(createElement(BudgetPanel, { tripId: A_TRIP.id, planVersion: 1 })),
    feedback: markupOf(createElement(FeedbackPanel, { tripId: A_TRIP.id })),
  };
}
