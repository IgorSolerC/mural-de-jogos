import { applyD1Migrations, type D1Migration } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeAll } from 'vitest';
import { d1Db } from '../src/adapters/d1';
import { amigosSuite } from './amigos.suite';
import { chavesSuite } from './chaves.suite';
import { espelhoSuite } from './espelho.suite';
import { pedidosSuite } from './pedidos.suite';
import { mcpSuite } from './mcp.suite';
import { oauthSuite } from './oauth.suite';
import { apiSuite } from './suite';
import { notasSuite } from './notas.suite';

const bindings = env as unknown as { DB: D1Database; TEST_MIGRATIONS: D1Migration[] };

beforeAll(() => applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS));

apiSuite('Cloudflare D1', () => d1Db(bindings.DB));
amigosSuite('Cloudflare D1', () => d1Db(bindings.DB));
notasSuite('Cloudflare D1', () => d1Db(bindings.DB));
chavesSuite('Cloudflare D1', () => d1Db(bindings.DB));
espelhoSuite('Cloudflare D1', () => d1Db(bindings.DB));
pedidosSuite('Cloudflare D1', () => d1Db(bindings.DB));
mcpSuite('Cloudflare D1', () => d1Db(bindings.DB));
oauthSuite('Cloudflare D1', () => d1Db(bindings.DB));
