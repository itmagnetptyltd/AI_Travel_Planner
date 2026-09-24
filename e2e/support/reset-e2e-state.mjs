// Gives each browser-test run a fresh database and an empty outbox.
import { rmSync } from 'node:fs';

rmSync('.e2e', { recursive: true, force: true });
