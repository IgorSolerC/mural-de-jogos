import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeAll } from 'vitest';
import { d1Db } from '../src/adapters/d1';
import { cofreSuite } from './suite';

const bindings = env as unknown as { DB: D1Database; TEST_MIGRATIONS: D1Migration[] };

beforeAll(() => applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS));

cofreSuite('Cloudflare D1', () => d1Db(bindings.DB));
