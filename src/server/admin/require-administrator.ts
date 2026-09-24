import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AccountService } from '../accounts/account-service';

/**
 * Refuses anyone who is not an enabled Administrator with 403 (REQ-TRV-068).
 * Run after requireTraveler, which has already set request.accountId.
 */
export function requireAdministrator(accounts: AccountService) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const account = request.accountId ? await accounts.findAccount(request.accountId) : null;
    if (account?.role !== 'administrator' || account.isDisabled) {
      await reply.code(403).send({ code: 'NOT_AN_ADMINISTRATOR', message: 'Only Administrators can do this.' });
    }
  };
}
