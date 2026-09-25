import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { parseBody, parseQuery } from '../http/validation';
import type { AdminFeedbackService } from '../feedback/admin-feedback-service';
import type { AnalysisResult, FeedbackAnalysisService } from '../feedback/feedback-analysis-service';
import { ROLE_LABELS, ROLES } from '../../shared/admin-functions';
import { PLAN_NOT_AVAILABLE, PLAN_NOT_AVAILABLE_MESSAGE } from '../../shared/admin-trips';
import { metricsRangeSchema } from '../../shared/admin-metrics';
import { NOTHING_TO_ANALYSE, NOTHING_TO_ANALYSE_MESSAGE } from '../../shared/feedback-analysis';
import { feedbackFilterSchema } from '../../shared/feedback-schemas';
import { AI_UNAVAILABLE, AI_UNAVAILABLE_MESSAGE, PLAN_NOT_FOUND } from '../../shared/plan-schemas';
import type { AdminTripService } from './admin-trip-service';
import type { MetricsService } from './metrics-service';

type IdParams = { readonly id: string };

export interface AdminReportDeps {
  readonly adminFeedback: AdminFeedbackService;
  readonly feedbackAnalysis: FeedbackAnalysisService;
  readonly adminTrips: AdminTripService;
  readonly metrics: MetricsService;
}

/**
 * What an Administrator reads about the application: feedback (REQ-TRV-064, REQ-TRV-065), Travelers' Trips (REQ-TRV-070,
 * REQ-TRV-101), the dashboard's figures (REQ-TRV-069) and the roles (REQ-TRV-079), and asks the AI about the feedback
 * (REQ-TRV-066, REQ-TRV-067). Registered inside the admin scope, so the two guards that apply to every admin route apply to these.
 */
export function registerReportRoutes(scope: FastifyInstance, deps: AdminReportDeps): void {
  const { adminFeedback, feedbackAnalysis, adminTrips, metrics } = deps;
  const notFound = (what: string) => ({ code: 'NOT_FOUND', message: `No such ${what}.` });

  /** Says what an analysis came to. The AI failing is the same 503 as everywhere else, without a word of what it was sent. */
  const answerWith = <View>(request: FastifyRequest, reply: FastifyReply, result: AnalysisResult<View>) => {
    if (result.ok) return result.view;
    if (result.error === 'nothing-to-analyse') return reply.code(422).send({ code: NOTHING_TO_ANALYSE, message: NOTHING_TO_ANALYSE_MESSAGE });
    request.log.warn({ reason: result.reason }, 'Analysing feedback failed');
    return reply.code(503).send({ code: AI_UNAVAILABLE, message: AI_UNAVAILABLE_MESSAGE });
  };

  scope.get('/api/admin/feedback', async (request, reply) => {
    const filter = await parseQuery(feedbackFilterSchema, request.query, reply);
    return filter.ok ? { feedback: adminFeedback.list(filter.value) } : undefined;
  });

  scope.get('/api/admin/feedback/export', async (request, reply) => {
    const filter = await parseQuery(feedbackFilterSchema, request.query, reply);
    if (!filter.ok) return;
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="feedback.csv"')
      .send(adminFeedback.exportCsv(filter.value));
  });

  scope.post('/api/admin/feedback/summary', async (request, reply) => {
    const filter = await parseBody(feedbackFilterSchema, request.body, reply);
    if (!filter.ok) return;
    return answerWith(request, reply, await feedbackAnalysis.summarise(request.accountId ?? '', filter.value));
  });

  scope.post('/api/admin/feedback/themes', async (request, reply) => {
    const filter = await parseBody(feedbackFilterSchema, request.body, reply);
    if (!filter.ok) return;
    return answerWith(request, reply, await feedbackAnalysis.findThemes(request.accountId ?? '', filter.value));
  });

  scope.get('/api/admin/trips', async () => ({ trips: adminTrips.list() }));

  scope.get<{ Params: IdParams }>('/api/admin/trips/:id', async (request, reply) =>
    adminTrips.get(request.params.id) ?? reply.code(404).send(notFound('Trip')),
  );

  scope.get<{ Params: IdParams }>('/api/admin/trips/:id/plan', async (request, reply) => {
    const result = adminTrips.planFor(request.accountId ?? '', request.params.id);
    if (result.ok) return result.view;
    if (result.error === 'no-feedback') return reply.code(403).send({ code: PLAN_NOT_AVAILABLE, message: PLAN_NOT_AVAILABLE_MESSAGE });
    if (result.error === 'no-plan') return reply.code(404).send({ code: PLAN_NOT_FOUND, message: 'This Trip has no Plan yet.' });
    return reply.code(404).send(notFound('Trip'));
  });

  scope.get('/api/admin/metrics', async (request, reply) => {
    const range = await parseQuery(metricsRangeSchema, request.query, reply);
    return range.ok ? metrics.read(range.value) : undefined;
  });

  scope.get('/api/admin/roles', async () => ({ roles: ROLES.map((role) => ({ role, label: ROLE_LABELS[role] })) }));
}
