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
  /**
   * Quem pode usar a API das AIs (as chaves, PLANO-API.md): os códigos das contas, sem o traço; `*` é
   * todo mundo; vazio, ninguém.
   */
  apiCodes: string[];
  /**
   * O endereço do site (`https://murall.igorsc.com.br`), para onde o OAuth manda a pessoa autorizar um
   * conector; vazio, autorizar fica indisponível.
   */
  site: string;
  /**
   * As imagens coladas nas anotações (PLANO-IMAGENS.md): quanto a nuvem inteira guarda (bem abaixo dos
   * 500 MB do banco `mural-imagens`), quanto cada conta guarda e quantas cada conta manda por dia. Zero
   * recusa todo envio.
   */
  imagesTotalBytes: number;
  imagesUserBytes: number;
  imagesPerDay: number;
}

/** As chaves do site nos catálogos (secrets do Worker). Vazia: aquele catálogo fica sem a chave do site. */
export interface CatalogKeys {
  tmdb: string;
  rawg: string;
}

/** O freio da busca do site: `true` se aquele IP ainda pode buscar agora (e conta a vez). */
export interface CatalogBrake {
  take(ip: string, now: number): boolean;
}

export interface Deps {
  db: Db;
  /**
   * O banco só dos bytes das imagens (`mural-imagens`, binding IMAGENS): à parte, para ele encher sem
   * parar o mural. Sem isto, as imagens respondem que estão fora do ar.
   */
  imagesDb?: Db;
  /** O freio das imagens por IP (só muda nos testes; ver `routes/images.ts`). */
  imageBrake?: CatalogBrake;
  config: Config;
  now: () => Date;
  /** Confere o ID token do login do Google (ver `src/domain/google.ts`). */
  verifyGoogle: VerifyGoogle;
  /**
   * A busca com as chaves do site (ver `src/routes/catalog.ts`). Sem isto, os catálogos respondem que
   * estão sem chave. `fetch` e `brake` (o freio por IP, um só por instância) só mudam nos testes.
   */
  catalog?: { keys: CatalogKeys; fetch?: (url: string, init?: RequestInit) => Promise<Response>; brake?: CatalogBrake };
  /**
   * O Google Agenda do Calendário (ver `src/routes/agenda.ts`): o client secret e a chave que cifra a
   * permissão guardada. Sem isto, ele fica indisponível. `fetch` só muda nos testes.
   */
  agenda?: { keys: AgendaKeys; fetch?: (url: string, init?: RequestInit) => Promise<Response> };
  /**
   * A busca do documento de um cliente do OAuth (CIMD: o `client_id` é um endereço https com o JSON do
   * cliente, ver `src/ext/oauth.ts`). Sem isto, o `fetch` de sempre; só muda nos testes.
   */
  oauthFetch?: (url: string, init?: RequestInit) => Promise<Response>;
  /**
   * O cofre de senhas, pelo service binding (ver `src/domain/vault.ts`): a conta pode usá-lo? Tem
   * cofre? E, quando a conta sai, apagar o cofre dela. Sem isto (nos testes, ou sem o binding), ninguém
   * vê a aba do cofre e nenhuma conta tem cofre.
   */
  vault?: { canUse(code: string): Promise<boolean>; has(userId: string): Promise<boolean>; erase(userId: string): Promise<void> };
  /**
   * Uma linha no log (no Worker, o console, que o Workers Logs guarda): as respostas de erro e as recusas
   * de quem a API chama, nunca o corpo do pedido nem um token. Sem isto (nos testes), nada se escreve.
   */
  log?: (line: string) => void;
}
