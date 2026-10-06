import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { migrate, sqliteDb } from '../src/adapters/sqlite-node';
import { apiSuite } from './suite';

const sqlite = new DatabaseSync(':memory:');
migrate(sqlite, fileURLToPath(new URL('../migrations', import.meta.url)));
const db = sqliteDb(sqlite);

apiSuite('Node + SQLite', () => db);
