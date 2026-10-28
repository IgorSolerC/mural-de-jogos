import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { parseBackupSnapshot, readBackupFile } from './backup-file';
import { Cloud } from './cloud-config';
import { CloudAccount, CloudError } from './cloud-account';
import { Colleague, ColleagueStore } from './colleague-store';
import { Toasts } from '../ui/toast';

/**
 * Os murais de outras pessoas pela nuvem: o código (K7QF-M2XA) ou o link (…/?mural=K7QF-M2XA) traz
 * o mural público da pessoa (só as resenhas e o nome) para o Comparar, como um backup de colega.
 * Não precisa de conta. Fica guardado neste navegador (abre offline depois) e se atualiza ao abrir.
 */
export const CLOUD_COLLEAGUE_PREFIX = 'nuvem:';
/** Um mural aberto há menos que isso não é pedido de novo à nuvem. */
const FRESH_MS = 2 * 60_000;
/**
 * O jeito de ler o mural de alguém (`parseBackupSnapshot`). Sobe quando a leitura passa a entender
 * algo novo no mural (2: as anotações, em `notas`; 3: o ícone e a cor das categorias, em
 * `categorias`; 4: o perfil, em `perfil`; 5: a parede do perfil e o fundo dos quadros das seções; 6: as molduras; 7: o mural de músicas, em `musicas`; 8: o jeito das pastas dos murais, `wallsLook` no perfil): o guardado por um site mais velho não serve para o "mudou?" (204), senão ficaria sem
 * o que aquele site jogou fora até a pessoa mexer no mural.
 */
export const MURAL_READER = 8;

/** O código como a pessoa digitou → `K7QF-M2XA` (O vira 0; I e L viram 1), ou null se não é um código. */
export function normalizeCode(input: string): string | null {
  const code = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  return /^[0-9A-HJKMNP-TV-Z]{8}$/.test(code) ? `${code.slice(0, 4)}-${code.slice(4)}` : null;
}

/** O id do colega aberto pela nuvem com esse código (`K7QF-M2XA`). */
export function cloudColleagueId(code: string): string {
  return CLOUD_COLLEAGUE_PREFIX + code.replace('-', '');
}

/** O mesmo mural guardado, agora com o código novo da pessoa (a versão do mural continua a mesma). */
export function recodedColleague(c: Colleague, code: string): Colleague {
  return { ...c, id: cloudColleagueId(code), codigo: code, fileName: `Código ${code}` };
}

/** O link que abre o mural de quem tem esse código. */
export function muralLink(code: string, base: string = location.origin + location.pathname): string {
  return `${base}?mural=${code}`;
}

@Injectable({ providedIn: 'root' })
export class CloudMurals {
  private readonly cloud = inject(Cloud);
  private readonly account = inject(CloudAccount);
  private readonly colleagues = inject(ColleagueStore);
  private readonly router = inject(Router);
  private readonly toasts = inject(Toasts);

  /** Abre (ou atualiza) o mural de alguém pelo código e o deixa escolhido no Comparar. */
  async open(input: string): Promise<Colleague> {
    const code = normalizeCode(input);
    if (!code) throw new Error('Esse código não existe. Confira: ele tem 8 letras e números.');
    if (this.account.account()?.codigo === code) throw new Error('Esse é o seu código. Para comparar, abra o de outra pessoa.');
    await this.colleagues.ready;
    const id = cloudColleagueId(code);
    const existing = this.colleagues.colleagues().find((c) => c.id === id);
    const known = existing?.rev && existing.leitor === MURAL_READER ? existing.rev : undefined;
    let res: Response;
    try {
      res = await this.account.requestRaw(`/v1/murais/${code}${known ? `?rev=${known}` : ''}`);
    } catch (err) {
      // o código não leva mais a mural nenhum (a conta foi apagada, ou o código trocou e a pessoa não é
      // seguida daqui): o guardado sai deste navegador, em vez de continuar mostrando o que ela tirou
      if (err instanceof CloudError && err.code === 'mural-nao-encontrado' && existing) await this.colleagues.remove(id).catch(() => undefined);
      // o 401 sobe como veio: com a nuvem mostrando os murais só para quem entrou, quem abriu precisa
      // entrar (não adianta tentar de novo); a mensagem é a mesma
      if (err instanceof CloudError) throw err.status === 401 ? err : new Error(err.message);
      throw err;
    }
    const now = new Date().toISOString();
    if (res.status === 204 && known && existing) {
      const same = { ...existing, loadedAt: now };
      await this.colleagues.restore(same);
      return same;
    }
    const snapshot = parseBackupSnapshot(await readBackupFile(await res.blob()));
    // um nome que a pessoa deu aqui (diferente do que veio no mural) fica
    const renamed = existing && existing.name !== (existing.ownerName ?? existing.name);
    const colleague: Colleague = {
      ...snapshot,
      id,
      name: renamed ? existing.name : (snapshot.ownerName ?? existing?.name ?? 'Colega'),
      fileName: `Código ${code}`,
      loadedAt: now,
      codigo: code,
      rev: Number(res.headers.get('Mural-Rev')) || undefined,
      leitor: MURAL_READER,
    };
    await this.colleagues.restore(colleague);
    return colleague;
  }

  /** Atualiza da nuvem um mural aberto pelo código, sem barulho (offline, fica o guardado). */
  async refresh(colleague: Colleague | null): Promise<void> {
    if (!colleague?.codigo || Date.now() - Date.parse(colleague.loadedAt) < FRESH_MS) return;
    await this.cloud.ready;
    if (!this.cloud.config()) return;
    const selected = this.colleagues.selected()?.id;
    try {
      await this.open(colleague.codigo);
    } catch {
      /* fica o que estava guardado */
    }
    // atualizar não troca quem está escolhido
    if (selected && this.colleagues.selected()?.id !== selected) this.colleagues.select(selected);
  }

  /**
   * O mural de alguém que eu sigo, para o correio: o guardado se foi aberto há pouco; senão pergunta
   * à nuvem se mudou. `need`: as fichas que o correio anunciou; se o guardado não tem alguma, ele é de
   * antes delas e a nuvem é consultada mesmo dentro dos 2 minutos. Não troca quem está escolhido no
   * Comparar. Sem rede, fica o guardado (ou null); `failed` fica sabendo do erro (o perfil diz para
   * entrar quando a nuvem só mostra os murais para quem entrou).
   */
  async ensure(input: string, need: readonly string[] = [], failed?: (err: unknown) => void): Promise<Colleague | null> {
    const code = normalizeCode(input);
    if (!code) return null;
    await this.colleagues.ready;
    const id = cloudColleagueId(code);
    const existing = this.colleagues.colleagues().find((c) => c.id === id) ?? null;
    const hasAll = (c: Colleague) => need.every((ref) => c.reviews.some((r) => r.id === ref));
    if (existing && Date.now() - Date.parse(existing.loadedAt) < FRESH_MS && hasAll(existing)) return existing;
    const selected = this.colleagues.selected()?.id;
    try {
      return await this.open(code);
    } catch (err) {
      failed?.(err);
      // sem rede, fica o guardado; o que a nuvem disse que não existe mais já saiu (ver `open`)
      return this.colleagues.colleagues().find((c) => c.id === id) ?? null;
    } finally {
      if (selected && this.colleagues.selected()?.id !== selected) this.colleagues.select(selected);
    }
  }

  /** O link ?mural=CÓDIGO: abre o mural da pessoa e vai direto para ele. */
  async openFromLink(): Promise<void> {
    if (typeof location === 'undefined') return;
    const params = new URLSearchParams(location.search);
    const code = params.get('mural');
    if (code === null) return;
    // tira o parâmetro do endereço: recarregar a página não abre de novo
    params.delete('mural');
    const rest = params.toString();
    history.replaceState(history.state, '', location.pathname + (rest ? `?${rest}` : '') + location.hash);
    await this.cloud.ready;
    if (!this.cloud.config()) {
      this.toasts.show('Esse link é de um mural na nuvem, e a nuvem está desligada agora.');
      return;
    }
    try {
      const colleague = await this.open(code);
      await this.router.navigate(['/comparar/mural']);
      this.toasts.show(`O mural de ${colleague.name} chegou`);
    } catch (err) {
      this.toasts.show(err instanceof Error ? err.message : 'Não consegui abrir esse mural.');
    }
  }
}
