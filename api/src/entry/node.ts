import { serve } from '@hono/node-server';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { migrate, sqliteDb } from '../adapters/sqlite-node';
import { createApp } from '../app';
import { readConfig } from '../config';
import { cleanup } from '../domain/cleanup';
import { Deps } from '../ports';

/**
 * A entrada fora da Cloudflare: o mesmo app num servidor Node comum, com um arquivo SQLite.
 * Variáveis: as mesmas do wrangler.toml (MODO, ORIGENS, COTA_LINHAS_DIA, GOOGLE_CLIENT_ID), mais
 * BANCO (o arquivo, padrão `mural.sqlite`) e PORT (padrão 8787).
 */
const file = process.env['BANCO'] ?? 'mural.sqlite';
const sqlite = new DatabaseSync(file);
const applied = migrate(sqlite, fileURLToPath(new URL('../../migrations', import.meta.url)));
if (applied.length) console.log(`Migrações aplicadas: ${applied.join(', ')}`);

const deps: Deps = { db: sqliteDb(sqlite), config: readConfig(process.env), now: () => new Date() };
const app = createApp(deps);
const port = Number(process.env['PORT'] ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`API em http://localhost:${port} (banco: ${file}, modo: ${deps.config.mode})`));

setInterval(() => void cleanup(deps).catch((e) => console.error('limpeza falhou', e)), 86_400_000);
