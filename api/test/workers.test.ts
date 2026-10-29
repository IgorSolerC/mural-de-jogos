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
import { gastosSuite } from './gastos.suite';
import { kanbanSuite } from './kanban.suite';
import { calendarioSuite } from './calendario.suite';
import { apiSuite } from './suite';
import { notasSuite } from './notas.suite';
import { imagensSuite } from './imagens.suite';

const bindings = env as unknown as { DB: D1Database; IMAGENS: D1Database; TEST_MIGRATIONS: D1Migration[]; TEST_MIGRATIONS_IMAGENS: D1Migration[] };

beforeAll(async () => {
  await applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS);
  await applyD1Migrations(bindings.IMAGENS, bindings.TEST_MIGRATIONS_IMAGENS);
});

apiSuite('Cloudflare D1', () => d1Db(bindings.DB));
amigosSuite('Cloudflare D1', () => d1Db(bindings.DB));
notasSuite('Cloudflare D1', () => d1Db(bindings.DB));
chavesSuite('Cloudflare D1', () => d1Db(bindings.DB));
espelhoSuite('Cloudflare D1', () => d1Db(bindings.DB));
pedidosSuite('Cloudflare D1', () => d1Db(bindings.DB));
mcpSuite('Cloudflare D1', () => d1Db(bindings.DB));
oauthSuite('Cloudflare D1', () => d1Db(bindings.DB));
gastosSuite('Cloudflare D1', () => d1Db(bindings.DB));
kanbanSuite('Cloudflare D1', () => d1Db(bindings.DB));
calendarioSuite('Cloudflare D1', () => d1Db(bindings.DB));
imagensSuite('Cloudflare D1', () => d1Db(bindings.DB), () => d1Db(bindings.IMAGENS));
