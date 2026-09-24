// Installation step: creates the first Administrator (REQ-TRV-068).
//
//   SEED_ADMIN_PASSWORD=... DATABASE_PATH=data/trv.sqlite npm run seed:admin -- admin@example.com
//
// The password is read from the environment, never from the command line, so it
// stays out of shell history and process listings.
import { z } from 'zod';
import { loadBundledBreachedPasswordChecker } from '../src/server/accounts/breached-password-checker';
import { seedAdministrator } from '../src/server/admin/seed-administrator';
import { systemClock } from '../src/server/clock';
import { openDatabase } from '../src/server/db/client';

const inputSchema = z.object({
  email: z.email(),
  password: z.string().min(1, 'SEED_ADMIN_PASSWORD must be set'),
  databasePath: z.string().min(1, 'DATABASE_PATH must be set'),
});

const REFUSALS = {
  'email-already-registered': 'That email address already has an account.',
  'invalid-password': 'SEED_ADMIN_PASSWORD does not meet the password policy (12-128 characters, not breached).', // itm-sdlc:allow-secret - error message, not a credential
} as const;

const input = inputSchema.safeParse({
  email: process.argv[2],
  password: process.env.SEED_ADMIN_PASSWORD ?? '',
  databasePath: process.env.DATABASE_PATH ?? '',
});
if (!input.success) {
  process.stderr.write(`Usage: npm run seed:admin -- <email>. ${input.error.issues.map((i) => i.message).join('; ')}\n`);
  process.exit(2);
}

const { db, close } = openDatabase(input.data.databasePath);
const result = await seedAdministrator(
  { db, clock: systemClock, breachedPasswords: loadBundledBreachedPasswordChecker() },
  { email: input.data.email, password: input.data.password },
);
close();

if (!result.ok) {
  process.stderr.write(`Administrator not created: ${REFUSALS[result.error]}\n`);
  process.exit(1);
}
process.stdout.write(`Administrator ${input.data.email} created.\n`);
