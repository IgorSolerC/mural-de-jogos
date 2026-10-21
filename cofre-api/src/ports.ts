/**
 * O que a API do cofre precisa do mundo lá fora. Nada aqui sabe de Cloudflare ou de Node: cada host
 * entrega as suas versões (ver `src/adapters/` e `src/entry/`), como na API do Murall (`api/`).
 */

import type { GoogleLogin } from './domain/google';
import type { Secrets } from './secrets';

/** O que pode ir num parâmetro de SQL. */
export type SqlValue = string | number | null | Uint8Array;

export interface Statement {
  sql: string;
  params?: SqlValue[];
}

export interface StatementResult {
  /** Linhas mudadas pela consulta. */
  changes: number;
}

/** O banco, do jeito mínimo: só SQL comum do SQLite. */
export interface Db {
  first<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** Várias gravações de uma vez: ou todas acontecem, ou nenhuma. */
  batch(statements: Statement[]): Promise<StatementResult[]>;
}

/** Ligado, só leitura (gravações recusadas) ou desligado (só o /api/status responde). */
export type Mode = 'ligado' | 'so-leitura' | 'desligado';

export interface Config {
  mode: Mode;
  /** Quantas linhas a API se permite gravar por dia UTC (bem abaixo do limite gratuito). */
  dailyRowBudget: number;
  /** Os códigos das contas do Murall que podem usar o cofre (16.1); `'*'`, todas as logadas. */
  allowedCodes: '*' | readonly string[];
  /** O endereço do cofre (`https://cofre.murall.igorsc.com.br`): a origem que o WebAuthn confere. */
  origin: string;
  /** O rpId das passkeys: o host exato do cofre, nunca o domínio de cima (7.1). */
  rpId: string;
  /** O client ID do cliente OAuth do cofre (o `aud` que o login confere). */
  googleClientId: string;
}

/** A conta do Murall, como a API do Murall a devolve pelo RPC (16.13). */
export interface MuralAccount {
  id: string;
  /** O código da conta, sem o traço (`K7QFM2XA`). */
  code: string;
}

/** O que o cofre pergunta à API do Murall, por service binding com RPC (sem endereço público). */
export interface Mural {
  /** A conta do Murall que entrou com este `sub` do Google; null se a pessoa nunca entrou no Murall. */
  accountByGoogle(sub: string): Promise<MuralAccount | null>;
}

export interface Deps {
  db: Db;
  config: Config;
  secrets: Secrets;
  now: () => Date;
  mural: Mural;
  /** Troca o código do login do Google pelo `sub` (ver `domain/google.ts`). */
  googleLogin: GoogleLogin;
}
