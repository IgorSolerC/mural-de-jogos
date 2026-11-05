import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MedidoEm, SEM_CONTAGEM, SERVICOS } from '../../../contrato/uso-apis/servicos';
import { CloudAccount, CloudError } from '../core/cloud-account';
import { MONTHS_SHORT } from '../core/dates';
import { ICON, IconModule } from '../ui/icons';

/** Os grupos da tabela: por onde a chamada passa, porque a confiança da conta é diferente em cada um. */
const GROUPS: readonly { id: MedidoEm; title: string; note: string }[] = [
  { id: 'worker', title: 'Pelo Worker', note: 'Passam pela API do Murall.' },
  { id: 'navegador', title: 'Pelo navegador', note: 'Saem direto do aparelho de cada pessoa.' },
  { id: 'cloudflare', title: 'Pela Cloudflare', note: 'Onde tudo isso roda.' },
];

/** "2026-11-05" vira "05/nov/2026". Sem `Date`: a data é um dia, sem fuso. */
export function checkedOn(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${MONTHS_SHORT[Number(month) - 1]}/${year}`;
}

/**
 * Uso das APIs (PLANO-ADMIN-APIS.md, seção 11): só a conta de admin abre. Uma prancheta de conferência
 * pregada na parede: a frase responde se há algo errado, e os papéis embaixo são a prova. Nada daqui fica
 * no navegador; a cada abertura, os números vêm de novo.
 */
@Component({
  selector: 'app-api-usage-page',
  imports: [IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './api-usage-page.html',
  styleUrl: './api-usage-page.scss',
})
export class ApiUsagePage {
  private readonly account = inject(CloudAccount);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private gone = false;

  protected readonly state = signal<'carregando' | 'pronto' | 'erro'>('carregando');
  /** De quando é a primeira conta (AAAA-MM-DD); null, ainda não há nenhuma. */
  protected readonly countingSince = signal<string | null>(null);
  protected readonly groups = GROUPS.map((g) => ({ ...g, services: SERVICOS.filter((s) => s.medidoEm === g.id) }));
  protected readonly uncounted = SEM_CONTAGEM;
  protected readonly checkedOn = checkedOn;
  protected readonly RetryIcon = ICON.atualizar;
  protected readonly OpenIcon = ICON.abrir;

  constructor() {
    this.destroyRef.onDestroy(() => (this.gone = true));
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('carregando');
    try {
      const usage = await this.account.request<{ contandoDesde: string | null }>('/v1/admin/uso');
      if (this.gone) return;
      this.countingSince.set(usage?.contandoDesde ?? null);
      this.state.set('pronto');
    } catch (e) {
      if (this.gone) return;
      if (e instanceof CloudError && e.status === 403) {
        // a bandeira guardada estava velha: a nuvem disse que não é mais admin
        await this.account.refresh().catch(() => undefined);
        if (!this.gone) void this.router.navigateByUrl('/extras');
        return;
      }
      this.state.set('erro');
    }
  }
}
