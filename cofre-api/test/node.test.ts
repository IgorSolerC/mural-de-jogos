import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { migrate, sqliteDb } from '../src/adapters/sqlite-node';
import { paginaSuite } from './pagina.suite';
import { cofreSuite } from './suite';

const sqlite = new DatabaseSync(':memory:');
migrate(sqlite, fileURLToPath(new URL('../migrations', import.meta.url)));

// a página e a API juntas só no Node: o Argon2id da página é WASM, que o runtime dos Workers não compila
cofreSuite('Node + SQLite', () => sqliteDb(sqlite), [paginaSuite]);
