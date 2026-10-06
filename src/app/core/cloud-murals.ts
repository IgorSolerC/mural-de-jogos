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

/** O código como a pessoa digitou → `K7QF-M2XA` (O vira 0; I e L viram 1), ou null se não é um código. */
export function normalizeCode(input: string): string | null {
  const code = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  return /^[0-9A-HJKMNP-TV-Z]{8}$/.test(code) ? `${code.slice(0, 4)}-${code.slice(4)}` : null;
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
    const id = CLOUD_COLLEAGUE_PREFIX + code.replace('-', '');
    const existing = this.colleagues.colleagues().find((c) => c.id === id);
    let res: Response;
    try {
      res = await this.account.requestRaw(`/v1/murais/${code}${existing?.rev ? `?rev=${existing.rev}` : ''}`);
    } catch (err) {
      if (err instanceof CloudError) throw new Error(err.message);
      throw err;
    }
    const now = new Date().toISOString();
    if (res.status === 204 && existing) {
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
   * à nuvem se mudou. Não troca quem está escolhido no Comparar. Sem rede, fica o guardado (ou null).
   */
  async ensure(input: string): Promise<Colleague | null> {
    const code = normalizeCode(input);
    if (!code) return null;
    await this.colleagues.ready;
    const id = CLOUD_COLLEAGUE_PREFIX + code.replace('-', '');
    const existing = this.colleagues.colleagues().find((c) => c.id === id) ?? null;
    if (existing && Date.now() - Date.parse(existing.loadedAt) < FRESH_MS) return existing;
    const selected = this.colleagues.selected()?.id;
    try {
      return await this.open(code);
    } catch {
      return existing;
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
