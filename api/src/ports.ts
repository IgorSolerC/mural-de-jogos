/**
 * O que a API precisa do mundo lá fora. Nada aqui sabe de Cloudflare ou de Node: cada host entrega
 * as suas versões (ver `src/adapters/` e `src/entry/`). Trocar de host é escrever outro adaptador.
 */

import type { AgendaKeys } from './domain/agenda';
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

/** As chaves do site nos catálogos (secrets do Worker). Vazia: aquele catálogo fica sem a chave do site. */
export interface CatalogKeys {
  tmdb: string;
  rawg: string;
}

export interface Deps {
  db: Db;
  config: Config;
  now: () => Date;
  /** Confere o ID token do login do Google (ver `src/domain/google.ts`). */
  verifyGoogle: VerifyGoogle;
  /**
   * A busca com as chaves do site (ver `src/routes/catalog.ts`). Sem isto, os catálogos respondem que
   * estão sem chave. `fetch` só muda nos testes.
   */
  catalog?: { keys: CatalogKeys; fetch?: (url: string, init?: RequestInit) => Promise<Response> };
  /**
   * O Google Agenda do Calendário (ver `src/routes/agenda.ts`): o client secret e a chave que cifra a
   * permissão guardada. Sem isto, ele fica indisponível. `fetch` só muda nos testes.
   */
  agenda?: { keys: AgendaKeys; fetch?: (url: string, init?: RequestInit) => Promise<Response> };
  /**
   * O cofre de senhas, pelo service binding (ver `src/domain/vault.ts`): a conta pode usá-lo? Tem
   * cofre? E, quando a conta sai, apagar o cofre dela. Sem isto (nos testes, ou sem o binding), ninguém
   * vê a aba do cofre e nenhuma conta tem cofre.
   */
  vault?: { canUse(code: string): Promise<boolean>; has(userId: string): Promise<boolean>; erase(userId: string): Promise<void> };
}
