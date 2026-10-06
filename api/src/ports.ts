/**
 * O que a API precisa do mundo lá fora. Nada aqui sabe de Cloudflare ou de Node: cada host entrega
 * as suas versões (ver `src/adapters/` e `src/entry/`). Trocar de host é escrever outro adaptador.
 */

import type { VerifyGoogle } from './domain/google';

/** O que pode ir num parâmetro de SQL. */
export type SqlValue = string | number | null | Uint8Array;

export interface Statement {
  sql: string;
  params?: SqlValue[];
}

export interface StatementResult {
  /** Linhas mudadas pela consulta. */
  changes: number;
  /** Quanto o banco diz que leu e gravou (o D1 conta assim; no SQLite comum, uma estimativa). */
  rowsRead: number;
  rowsWritten: number;
}

/** O banco, do jeito mínimo: só SQL comum do SQLite. */
export interface Db {
  first<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** Várias gravações de uma vez: ou todas acontecem, ou nenhuma. */
  batch(statements: Statement[]): Promise<StatementResult[]>;
}

/** Ligado, só leitura (gravações recusadas) ou desligado (só o /v1/status responde). */
export type Mode = 'ligado' | 'so-leitura' | 'desligado';

export interface Config {
  mode: Mode;
  /** As origens que podem chamar a API pelo navegador (CORS). */
  allowedOrigins: string[];
  /** Quantas linhas a API se permite gravar por dia UTC (bem abaixo do limite gratuito). */
  dailyRowBudget: number;
  /** O Client ID do Google (o `aud` que o login confere). */
  googleClientId: string;
  /** Quem pode abrir um mural pelo código: qualquer um, ou só quem está logado (se alguém abusar). */
  publicMurals: 'todos' | 'logados';
}

export interface Deps {
  db: Db;
  config: Config;
  now: () => Date;
  /** Confere o ID token do login do Google (ver `src/domain/google.ts`). */
  verifyGoogle: VerifyGoogle;
}
