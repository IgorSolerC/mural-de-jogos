import { ContentfulStatusCode } from 'hono/utils/http-status';

/** Um erro que vira resposta: `{ "erro": code, "mensagem": message }` com o status dado. */
export class HttpError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
