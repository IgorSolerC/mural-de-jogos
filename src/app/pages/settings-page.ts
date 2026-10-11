import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  BookOpen,
  Cloud as CloudIcon,
  Copy,
  Link as LinkIconData,
  Megaphone,
  CircleCheck,
  Download,
  Eye,
  EyeOff,
  Film,
  Gamepad2,
  HardDriveDownload,
  LayoutGrid,
  LogOut,
  LucideIconData,
  Pencil,
  Search,
  UserRound,
  UsersRound,
  LucideAngularModule,
  RefreshCw,
  CloudOff,
  Origami,
  ShieldAlert,
  Trash2,
  TriangleAlert,
  Tv,
  Upload,
  X,
} from 'lucide-angular';
import { BACKUP_EVERY_DAYS, Backup, backupFileName } from '../core/backup';
import { backupLists, ownerNameOf, readBackupFile } from '../core/backup-file';
import { eraseSave, takeErased } from '../core/erase-save';
import { ReviewStore } from '../core/review-store';
import { OWNER_NAME_MAX, ScoreDisplay, Settings } from '../core/settings';
import { Confirm } from '../ui/confirm';
import { Toasts } from '../ui/toast';
import { Pin } from '../ui/pin';
import { fold, localDay } from '../core/review';
import { Busy } from '../ui/busy';
import { Cloud } from '../core/cloud-config';
import { CloudAccount, CloudError } from '../core/cloud-account';
import { CloudSync } from '../core/cloud-sync';
import { BeforeCloudCopy, KEEP_DAYS, readBeforeCloud } from '../core/cloud-before';
import { GoogleButton } from '../ui/google-button';
import { muralLink } from '../core/cloud-murals';
import { News } from '../core/news';
import { GameLookup } from '../core/game-lookup';
import { SiteKeys } from '../core/site-keys';

const DAY = 86_400_000;

type Tab = 'conta' | 'mural' | 'amigos' | 'backup' | 'busca';
const TABS: readonly Tab[] = ['conta', 'mural', 'amigos', 'backup', 'busca'];

/** "às 14:32" hoje; "em 3 de outubro às 14:32" antes. */
function when(ms: number): string {
  const d = new Date(ms);
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString()
    ? `às ${time}`
    : `em ${d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })} às ${time}`;
}

/**
 * Ajustes: um quadro de pinus com parafusos e papelão dentro. À esquerda (no celular, em cima), uma
 * etiqueta de papel por parte (Conta, Mural, Amigos, Backup, Busca), com uma linha do que tem nela; ao
 * lado, a folha creme da parte aberta. Cada ajuste é uma linha: o nome, o que ele faz e o controle
 * (interruptor, seletor ou botão). O que não tem volta fica junto, no pé da folha, em "Cuidado".
 * Nada aqui tem botão de salvar: vale na hora.
 */
@Component({
  selector: 'app-settings-page',
  imports: [Busy, LucideAngularModule, Pin, GoogleButton, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
})
export class SettingsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  /** As partes, na ordem do índice. A aberta fica no endereço (#/ajustes?aba=backup), para links irem direto. */
  protected readonly tabs: readonly { id: Tab; label: string; hint: string; icon: LucideIconData }[] = [
    { id: 'conta', label: 'Conta', hint: 'Nome, perfil e nuvem', icon: UserRound },
    { id: 'mural', label: 'Mural', hint: 'Notas, grupos e spoilers', icon: LayoutGrid },
    { id: 'amigos', label: 'Amigos', hint: 'O que chega dos outros', icon: UsersRound },
    { id: 'backup', label: 'Backup', hint: 'Baixar e restaurar', icon: HardDriveDownload },
    { id: 'busca', label: 'Busca', hint: 'De onde vêm as capas', icon: Search },
  ];
  /** As etiquetas no papelão, cada uma presa num ângulo (a aberta fica reta). */
  protected readonly tilts = ['-1.2deg', '0.9deg', '-0.6deg', '1.1deg', '-0.9deg'];
  protected readonly tab = signal<Tab>(this.tabFrom(this.route.snapshot.queryParamMap.get('aba')));
  /** Um link para outra aba (o "Baixar backup" do aviso) com a página já aberta também troca a aba. */
  private readonly followTabParam = this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((q) => this.tab.set(this.tabFrom(q.get('aba'))));

  private tabFrom(value: string | null): Tab {
    // "perfil" era o nome da Conta (links antigos e de outras páginas)
    if (value === 'perfil') return 'conta';
    return TABS.includes(value as Tab) ? (value as Tab) : 'conta';
  }

  protected go(id: Tab): void {
    this.tab.set(id);
    void this.router.navigate([], { relativeTo: this.route, queryParams: { aba: id }, replaceUrl: true });
  }

  /** Setas, Home e End andam entre as partes (o padrão das abas para teclado; o índice fica de pé ou deitado). */
  protected onTabKey(e: KeyboardEvent): void {
    const i = TABS.indexOf(this.tab());
    const forward = e.key === 'ArrowRight' || e.key === 'ArrowDown';
    const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
    const next = forward ? (i + 1) % TABS.length : back ? (i - 1 + TABS.length) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    this.go(TABS[next]);
    queueMicrotask(() => document.getElementById(`aba-${TABS[next]}`)?.focus());
  }

  protected readonly store = inject(ReviewStore);
  protected readonly settings = inject(Settings);
  /** O jeito de mostrar a nota, com um 8,4 em cada um. */
  protected readonly scoreDisplays: readonly { value: ScoreDisplay; label: string; sample: string }[] = [
    { value: 'livre', label: 'Como dei', sample: '8,4' },
    { value: 'metade', label: 'De meio em meio', sample: '8,5' },
    { value: 'inteiro', label: 'Inteiras', sample: '8' },
  ];
  protected readonly backup = inject(Backup);
  protected readonly ownerNameMax = OWNER_NAME_MAX;
  /** Como o próximo backup vai se chamar, com o nome digitado. */
  protected readonly fileNamePreview = computed(() =>
    backupFileName(this.settings.ownerName(), localDay(new Date()), typeof CompressionStream === 'undefined' ? 'json' : 'json.gz'),
  );
  private readonly toasts = inject(Toasts);
  private readonly confirm = inject(Confirm);
  protected readonly cloud = inject(Cloud);
  protected readonly news = inject(News);
  protected readonly MegaphoneIcon = Megaphone;
  private readonly lookup = inject(GameLookup);
  private readonly siteKeys = inject(SiteKeys);
  protected readonly account = inject(CloudAccount);
  protected readonly sync = inject(CloudSync);
  protected readonly beforeCopy = signal<BeforeCloudCopy | null>(null);
  /** A ação da conta em andamento ('entrar', 'codigo', 'sair', 'sair-todos', 'apagar'): ela mostra o aro, as outras esperam. */
  protected readonly accountBusy = signal<string | null>(null);
  protected readonly exporting = signal(false);
  protected readonly importing = signal(false);
  protected readonly accountMsg = signal<string | null>(null);

  protected readonly DownloadIcon = Download;
  protected readonly UploadIcon = Upload;
  protected readonly ShowIcon = Eye;
  protected readonly HideIcon = EyeOff;
  protected readonly ClearIcon = X;
  protected readonly OkIcon = CircleCheck;
  protected readonly AlertIcon = TriangleAlert;
  protected readonly ShieldIcon = ShieldAlert;
  protected readonly TrashIcon = Trash2;
  protected readonly CloudOnIcon = CloudIcon;
  protected readonly CopyIcon = Copy;
  protected readonly PenIcon = Pencil;
  protected readonly LinkIcon = LinkIconData;
  protected readonly LogOutIcon = LogOut;
  protected readonly RefreshIcon = RefreshCw;
  protected readonly CloudOffIcon = CloudOff;

  protected readonly showRawg = signal(false);
  protected readonly showTmdb = signal(false);

  /** A busca do site tem as duas chaves: ninguém precisa da própria. */
  protected readonly siteReady = computed(() => !!this.cloud.config() && this.siteKeys.rawg() && this.siteKeys.tmdb());
  /** "Usar as suas próprias chaves" abre sozinho quando há chave colada ou quando o site está sem as dele. */
  protected readonly keysOpen = signal(this.settings.hasRawg() || this.settings.hasTmdb() || !this.siteReady());
  protected readonly ownKeysLine = computed(() => {
    const own = [this.settings.hasTmdb() && 'TMDB', this.settings.hasRawg() && 'RAWG'].filter(Boolean);
    return own.length ? `Em uso: ${own.join(' e ')}` : 'Opcional';
  });

  /** De onde cada mural busca agora: muda com as chaves (as suas e as do site). */
  protected readonly sources = computed(() => {
    const games = this.lookup.gamesSource();
    const films = this.lookup.filmsSource();
    const yours = (own: boolean) => (own ? ', com a sua chave' : '');
    const rows: { wall: string; icons: LucideIconData[]; name: string; via: string }[] = [
      { wall: 'Jogos', icons: [Gamepad2], name: games.name, via: games.name === 'RAWG' ? `com a capa da Steam${yours(games.own)}` : 'em inglês' },
      { wall: 'Livros', icons: [BookOpen], name: 'Open Library', via: 'edição em português' },
      { wall: 'Filmes e séries', icons: [Film, Tv], name: films.name, via: films.name === 'TMDB' ? `em português${yours(films.own)}` : 'em inglês' },
      { wall: 'Animes', icons: [Origami], name: 'Kitsu', via: 'nome brasileiro quando tem' },
    ];
    return rows;
  });

  /** O que pede atenção, por parte: a sincronização com problema, o backup atrasado. */
  protected readonly attention = computed<Partial<Record<Tab, string>>>(() => ({
    ...(this.syncTrouble() && this.account.signedIn() ? { conta: 'a sincronização precisa de atenção' } : {}),
    ...(this.overdue() ? { backup: 'hora de baixar um backup' } : {}),
  }));
  protected readonly importMsg = signal<{ text: string; error: boolean } | null>(null);
  protected readonly erasing = signal(false);

  constructor() {
    // a página recarregou depois de apagar o save
    if (takeErased()) this.toasts.show('Save apagado. O mural começou do zero.');
    // a cópia de antes da nuvem nasce na primeira sincronização: confere de novo a cada uma
    effect(() => {
      this.sync.lastSyncAt();
      void readBeforeCloud().then((copy) => this.beforeCopy.set(copy));
    });
  }

  private readonly wishCount = computed(() => this.store.wishes().length);
  protected readonly hasData = computed(() => this.store.count() > 0 || this.store.draftCount() > 0 || this.wishCount() > 0);

  /** Dias desde o último backup (null: nunca baixou). */
  private readonly daysSince = computed(() => {
    const at = this.backup.lastAt();
    return at ? Math.max(0, Math.floor((Date.now() - Date.parse(at)) / DAY)) : null;
  });

  /** Mesmo critério do bilhete em cima do mural: passou do prazo, ou nunca baixou e já tem o que guardar. */
  protected readonly overdue = computed(() => {
    if (this.backup.inCloud()) return false;
    const d = this.daysSince();
    return this.hasData() && (d === null || d >= BACKUP_EVERY_DAYS);
  });

  protected readonly lastBackup = computed(() => {
    const d = this.daysSince();
    if (d === null) return 'Nenhum backup baixado ainda';
    const when = d === 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`;
    return this.overdue() ? `Último backup: ${when}. Hora de baixar outro.` : `Último backup: ${when}`;
  });

  /** O que entra no arquivo, contado. */
  protected readonly contents = computed(() => {
    const n = this.store.count();
    const drafts = this.store.draftCount();
    const wishes = this.wishCount();
    if (!n && !drafts && !wishes) return 'Ainda não há nada para guardar.';
    const parts = [`${n} ${n === 1 ? 'resenha' : 'resenhas'}`];
    if (drafts) parts.push(`${drafts} pra depois`);
    if (wishes) parts.push(`${wishes} na wishlist`);
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}` : parts[0];
    return `O arquivo leva ${list}.`;
  });

  /** "K7QF-M2XA" soletrado para o leitor de tela: "K 7 Q F, M 2 X A". */
  protected spelled(code: string): string {
    return code.split('-').map((part) => part.split('').join(' ')).join(', ');
  }

  /** Roda uma ação da conta mostrando o erro da nuvem na ficha. */
  private async accountAction(key: string, run: () => Promise<void>): Promise<boolean> {
    this.accountBusy.set(key);
    this.accountMsg.set(null);
    try {
      await run();
      return true;
    } catch (err) {
      this.accountMsg.set(err instanceof CloudError ? err.message : 'Algo deu errado. Tente de novo.');
      return false;
    } finally {
      this.accountBusy.set(null);
    }
  }

  protected async signIn(credential: string): Promise<void> {
    let created = false;
    if (await this.accountAction('entrar', async () => void (created = (await this.account.signIn(credential)).nova))) {
      this.toasts.show(created ? 'Conta criada. O seu código está aqui em Ajustes.' : 'Você entrou na sua conta.');
    }
  }

  protected async copyCode(code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      this.toasts.show(`Código ${code} copiado`);
    } catch {
      this.toasts.show('Não deu para copiar. Selecione o código e copie à mão.');
    }
  }

  /** A linha do estado da sincronização, na ficha da Conta. */
  protected readonly syncLine = computed(() => {
    const status = this.sync.status();
    const at = this.sync.lastSyncAt();
    switch (status) {
      case 'sincronizando':
        return 'Sincronizando…';
      case 'ok':
        return at ? `Salvo na nuvem ${when(at)}` : 'Salvo na nuvem';
      case 'sem-rede':
        return 'Só neste aparelho por enquanto';
      case 'pausado':
        return 'Sincronização pausada';
      case 'escolha':
        return 'Falta uma escolha sua';
      case 'desatualizado':
        return 'Site desatualizado';
      case 'erro':
        return 'A sincronização parou';
      default:
        return at ? `Salvo na nuvem ${when(at)}` : 'Conectando à nuvem…';
    }
  });
  protected readonly syncTrouble = computed(() => ['sem-rede', 'pausado', 'escolha', 'desatualizado', 'erro'].includes(this.sync.status()));

  protected reload(): void {
    location.reload();
  }

  protected copyUntil(copy: BeforeCloudCopy): string {
    const until = new Date(Date.parse(copy.at) + KEEP_DAYS * DAY);
    return until.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
  }

  protected downloadBefore(copy: BeforeCloudCopy): void {
    const url = URL.createObjectURL(copy.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meu-mural-antes-da-nuvem-${copy.at.slice(0, 10)}.json.gz`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  protected async copyLink(code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(muralLink(code));
      this.toasts.show('Link do mural copiado');
    } catch {
      this.toasts.show(`Não deu para copiar. O link é ${muralLink(code)}`);
    }
  }

  protected async newCode(): Promise<void> {
    const sure = await this.confirm.ask({
      title: 'Trocar o código?',
      text:
        'O código e o link de agora param de abrir o seu mural. Quem já abriu fica com a cópia que tinha, e quem segue você continua seguindo.',
      confirm: 'Trocar o código',
      icon: null,
    });
    let code = '';
    if (sure && (await this.accountAction('codigo', async () => void (code = await this.account.newCode())))) {
      this.toasts.show(`Código novo: ${code}`);
    }
  }

  protected async signOut(): Promise<void> {
    let done = false;
    if (await this.accountAction('sair', async () => void (done = await this.sync.signOut()))) {
      if (done) this.toasts.show('Você saiu da conta. O mural continua neste navegador.');
    }
  }

  protected async signOutEverywhere(): Promise<void> {
    const sure = await this.confirm.ask({
      title: 'Sair de todos os aparelhos?',
      text: 'Todo aparelho onde você entrou vai precisar entrar de novo. O mural de cada um continua lá.',
      confirm: 'Sair de todos',
      icon: null,
    });
    if (sure && (await this.accountAction('sair-todos', () => this.account.signOutEverywhere()))) {
      this.toasts.show('Você saiu de todos os aparelhos.');
    }
  }

  protected async deleteAccount(name: string, code: string): Promise<void> {
    const sure = await this.confirm.ask({
      title: 'Apagar a conta?',
      text:
        `A conta de ${name}, o código ${code} e tudo o que estiver na nuvem vão embora, e quem segue você deixa de seguir. ` +
        'O mural deste navegador continua aqui. Não dá para desfazer.',
      confirm: 'Apagar a conta',
    });
    if (sure && (await this.accountAction('apagar', () => this.account.deleteAccount()))) {
      this.sync.forgetAccount();
      this.toasts.show('Conta apagada. O mural continua neste navegador.');
    }
  }

  protected async exportFile(): Promise<void> {
    if (this.exporting()) return;
    this.exporting.set(true);
    try {
      await this.backup.download();
    } finally {
      this.exporting.set(false);
    }
  }

  /** Apagar o save: pergunta, apaga e recarrega, para nada ficar com o save velho na memória. */
  protected async erase(): Promise<void> {
    const sure = await this.confirm.ask({
      text:
        'Tudo o que o mural guarda neste navegador vai embora: resenhas, pra depois, wishlist, colegas e Extras.' +
        (this.overdue() ? ' Você não tem um backup recente.' : '') +
        ' Não dá para desfazer.',
      confirm: 'Apagar o save',
    });
    if (!sure) return;
    this.erasing.set(true);
    await eraseSave();
    location.reload();
  }

  protected async importFile(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      // lê antes de perguntar: um arquivo que não serve não pede confirmação nenhuma
      this.importing.set(true);
      let text: string;
      try {
        text = await readBackupFile(file);
      } finally {
        this.importing.set(false);
      }
      // não serve (não é backup, é de outro app ou de uma versão mais nova): avisa antes de perguntar qualquer coisa
      const owner = ownerNameOf(backupLists(text).data);
      const n = this.store.count();
      const lists = this.store.draftCount() + this.wishCount();
      // com algo aqui, a pergunta vem depois do arquivo: juntar (o seguro, a principal) ou substituir
      let replace = false;
      if (n > 0 || lists > 0) {
        const choice = await this.confirm.choose({
          title: 'Juntar ou substituir?',
          text:
            'Juntar soma o arquivo ao que já está aqui (se uma resenha está nos dois, fica a mais nova). ' +
            'Substituir apaga o que está aqui e deixa os murais iguais ao arquivo.',
          confirm: 'Juntar',
          secondary: 'Substituir',
        });
        if (!choice) return;
        replace = choice === 'secondary';
      }
      // o backup de um colega misturaria as fichas dele com as suas: o lugar dele é Comparar
      const me = this.settings.ownerName().trim();
      if (
        owner &&
        me &&
        fold(owner) !== fold(me) &&
        !(await this.confirm.ask({
          title: `Esse backup é de ${owner}`,
          text: `As fichas de ${owner} vão ${replace ? 'ficar no lugar das suas' : 'se misturar com as suas'}. Para ver o mural sem misturar, abra o arquivo em Extras › Comparar.`,
          confirm: replace ? 'Substituir mesmo assim' : 'Juntar mesmo assim',
          icon: null,
        }))
      ) {
        return;
      }
      if (
        replace &&
        (n > 0 || lists > 0) &&
        !(await this.confirm.ask({
          text: n
            ? `${n === 1 ? 'A resenha que está aqui sai' : `As ${n} resenhas que estão aqui saem`} e os murais ficam iguais ao arquivo.`
            : 'O pra depois e a wishlist daqui saem e ficam iguais aos do arquivo.',
          confirm: 'Substituir',
          icon: null,
        }))
      ) {
        return;
      }
      const res = this.store.importJson(text, replace ? 'replace' : 'merge');
      // o seu próprio backup num navegador novo: o nome volta junto, se ainda não há um aqui
      if (!this.settings.ownerName().trim() && owner) this.settings.ownerName.set(owner.slice(0, OWNER_NAME_MAX));
      const parts = [`${res.added} ${res.added === 1 ? 'resenha nova' : 'resenhas novas'}`];
      if (res.updated) parts.push(`${res.updated} atualizada${res.updated === 1 ? '' : 's'}`);
      if (res.skipped) parts.push(`${res.skipped} ignorada${res.skipped === 1 ? '' : 's'}`);
      if (res.removed) parts.push(`${res.removed} ${res.removed === 1 ? 'apagada' : 'apagadas'} como no backup`);
      if (res.drafts) parts.push(`${res.drafts} pra depois`);
      if (res.wishes) parts.push(`${res.wishes} na wishlist`);
      this.importMsg.set({ text: `Backup restaurado: ${parts.join(', ')}.`, error: false });
      const total = res.added + res.updated;
      if (total) this.toasts.show(`${total} ${total === 1 ? 'resenha voltou' : 'resenhas voltaram'} para os murais`);
    } catch (err) {
      this.importMsg.set({ text: (err as Error).message, error: true });
    }
  }
}
