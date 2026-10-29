import { serve } from '@hono/node-server';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { migrate, sqliteDb } from '../adapters/sqlite-node';
import { createApp } from '../app';
import { readCatalogKeys } from '../routes/catalog';
import { readAgendaKeys } from '../domain/agenda';
import { readConfig } from '../config';
import { createRemoteJWKSet } from 'jose';
import { cleanup } from '../domain/cleanup';
import { DAY_MS } from '../domain/quota';
import { GOOGLE_CERTS_URL, googleVerifier } from '../domain/google';
import { Deps } from '../ports';

/**
 * A entrada fora da Cloudflare: o mesmo app num servidor Node comum, com um arquivo SQLite.
 * Variáveis: as mesmas do wrangler.toml (MODO, ORIGENS, COTA_LINHAS_DIA, GOOGLE_CLIENT_ID, VER_MURAIS), mais
 * TMDB_KEY e RAWG_KEY (as chaves do site na busca, opcionais), GOOGLE_CLIENT_SECRET e AGENDA_CHAVE (o Google Agenda, opcionais), BANCO (o arquivo, padrão `mural.sqlite`),
 * BANCO_IMAGENS (o arquivo só dos bytes das imagens, padrão `mural-imagens.sqlite`) e PORT (padrão 8787).
 */
const file = process.env['BANCO'] ?? 'mural.sqlite';
const sqlite = new DatabaseSync(file);
const applied = migrate(sqlite, fileURLToPath(new URL('../../migrations', import.meta.url)));
if (applied.length) console.log(`Migrações aplicadas: ${applied.join(', ')}`);
const imagesFile = process.env['BANCO_IMAGENS'] ?? 'mural-imagens.sqlite';
const imagesSqlite = new DatabaseSync(imagesFile);
const imagesApplied = migrate(imagesSqlite, fileURLToPath(new URL('../../migrations-imagens', import.meta.url)));
if (imagesApplied.length) console.log(`Migrações das imagens aplicadas: ${imagesApplied.join(', ')}`);

const config = readConfig(process.env);
const deps: Deps = {
  db: sqliteDb(sqlite),
  imagesDb: sqliteDb(imagesSqlite),
  config,
  now: () => new Date(),
  verifyGoogle: googleVerifier(config.googleClientId, createRemoteJWKSet(new URL(GOOGLE_CERTS_URL))),
  catalog: { keys: readCatalogKeys(process.env) },
  agenda: { keys: readAgendaKeys(process.env) },
  log: (line) => console.warn(line),
};
const app = createApp(deps);
const port = Number(process.env['PORT'] ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`API em http://localhost:${port} (banco: ${file}, modo: ${deps.config.mode})`));

// a limpeza na subida e depois a cada dia: um servidor que reinicia antes de 24 horas também limpa
const daily = () => void cleanup(deps).catch((e) => console.error('limpeza falhou', e));
daily();
setInterval(daily, DAY_MS);
