import { serve } from '@hono/node-server';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { migrate, sqliteDb } from '../adapters/sqlite-node';
import { createApp } from '../app';
import { readConfig } from '../config';
import { createRemoteJWKSet } from 'jose';
import { cleanup } from '../domain/cleanup';
import { GOOGLE_CERTS_URL, googleVerifier } from '../domain/google';
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

const config = readConfig(process.env);
const deps: Deps = {
  db: sqliteDb(sqlite),
  config,
  now: () => new Date(),
  verifyGoogle: googleVerifier(config.googleClientId, createRemoteJWKSet(new URL(GOOGLE_CERTS_URL))),
};
const app = createApp(deps);
const port = Number(process.env['PORT'] ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`API em http://localhost:${port} (banco: ${file}, modo: ${deps.config.mode})`));

setInterval(() => void cleanup(deps).catch((e) => console.error('limpeza falhou', e)), 86_400_000);
