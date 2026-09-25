import type { FastifyInstance } from 'fastify';
import { parseQuery } from '../http/validation';
import type { AdminFeedbackService } from '../feedback/admin-feedback-service';
import { ROLE_LABELS, ROLES } from '../../shared/admin-functions';
import { PLAN_NOT_AVAILABLE, PLAN_NOT_AVAILABLE_MESSAGE } from '../../shared/admin-trips';
import { metricsRangeSchema } from '../../shared/admin-metrics';
import { feedbackFilterSchema } from '../../shared/feedback-schemas';
import { PLAN_NOT_FOUND } from '../../shared/plan-schemas';
import type { AdminTripService } from './admin-trip-service';
import type { MetricsService } from './metrics-service';

type IdParams = { readonly id: string };

export interface AdminReportDeps {
  readonly adminFeedback: AdminFeedbackService;
  readonly adminTrips: AdminTripService;
  readonly metrics: MetricsService;
}

/**
 * What an Administrator reads about the application: feedback (REQ-TRV-064, REQ-TRV-065), Travelers' Trips (REQ-TRV-070,
 * REQ-TRV-101), the dashboard's figures (REQ-TRV-069) and the roles (REQ-TRV-079). Registered inside the admin scope, so the
 * two guards that apply to every admin route apply to these.
 */
export function registerReportRoutes(scope: FastifyInstance, deps: AdminReportDeps): void {
  const { adminFeedback, adminTrips, metrics } = deps;
  const notFound = (what: string) => ({ code: 'NOT_FOUND', message: `No such ${what}.` });

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
