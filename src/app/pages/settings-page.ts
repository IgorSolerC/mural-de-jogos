import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  BookOpen,
  Check,
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
  Search,
  UserRound,
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
import { BonusSticker } from '../ui/bonus';
import { JudgeLabel } from '../ui/judge-label';
import { Bonus, fold, localDay } from '../core/review';
import { scramble } from '../core/spoiler';
import { Rabisco } from '../ui/rabisco';
import { Busy } from '../ui/busy';
import { Cloud } from '../core/cloud-config';
import { CloudAccount, CloudError } from '../core/cloud-account';
import { CloudSync } from '../core/cloud-sync';
import { BeforeCloudCopy, KEEP_DAYS, readBeforeCloud } from '../core/cloud-before';
import { GoogleButton } from '../ui/google-button';
import { muralLink } from '../core/cloud-murals';
import { News } from '../core/news';

const DAY = 86_400_000;

type Tab = 'perfil' | 'backup' | 'mural' | 'busca';
const TABS: readonly Tab[] = ['perfil', 'backup', 'mural', 'busca'];

/** "às 14:32" hoje; "em 3 de outubro às 14:32" antes. */
function when(ms: number): string {
  const d = new Date(ms);
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString()
    ? `às ${time}`
    : `em ${d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })} às ${time}`;
}

/**
 * Ajustes: fichas pregadas. Conta (rosa, só com a nuvem ligada), Backup (azul) e Mural (verde) numa
 * coluna, Busca e capas (lilás) na outra, para nenhuma deixar um buraco na parede. Toda escolha é o adesivo da cartela, como no editor:
 * a não escolhida é o recorte picotado, a escolhida sai colada. Nada aqui tem botão de salvar: vale na hora.
 */
@Component({
  selector: 'app-settings-page',
  imports: [Busy, LucideAngularModule, Pin, BonusSticker, JudgeLabel, Rabisco, GoogleButton, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="cabeca">
      <h1 class="tape-label big">Ajustes</h1>
      <p class="resumo">Vale na hora e fica salvo neste navegador</p>
      <!-- o que mudou no site: a página de novidades, com quantas ainda não foram vistas -->
      <a class="btn-quiet novidades" routerLink="/novidades">
        <lucide-icon [img]="MegaphoneIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />
        Novidades
        @if (news.unseen(); as n) {
          <span class="novas">{{ n }}<span class="sr-only"> {{ n === 1 ? 'nova' : 'novas' }}</span></span>
        }
      </a>
    </header>

    <!-- as partes dos ajustes: abas de divisória na régua, uma ficha por vez -->
    <div class="prateleira abas-ajustes">
      <div class="prateleira-abas" role="tablist" aria-label="Partes dos ajustes" (keydown)="onTabKey($event)">
        @for (t of tabs; track t.id) {
          <button
            type="button"
            role="tab"
            class="plate"
            [id]="'aba-' + t.id"
            [class.is-active]="tab() === t.id"
            [attr.aria-selected]="tab() === t.id"
            [attr.aria-controls]="'painel-' + t.id"
            [attr.tabindex]="tab() === t.id ? 0 : -1"
            (click)="go(t.id)"
          >
            <lucide-icon [img]="t.icon" [size]="16" [strokeWidth]="2.6" aria-hidden="true" />
            {{ t.label }}
            @if (t.id === 'perfil' && syncTrouble() && account.signedIn()) {
              <span class="badge" aria-label="(precisa de atenção)">!</span>
            }
          </button>
        }
      </div>
    </div>

    <div class="painel" role="tabpanel" [id]="'painel-' + tab()" [attr.aria-labelledby]="'aba-' + tab()">
      <!-- ===== Perfil: o seu nome e, com a nuvem ligada, a conta ===== -->
      @if (tab() === 'perfil') {
        <section class="ficha cartolina conta" aria-labelledby="perfil-titulo">
          <app-pin class="pin" color="#e62e2d" />
          <h2 id="perfil-titulo">Perfil</h2>

          <div class="nome-dono">
            <h3 class="sub"><label for="dono-nome">Seu nome</label></h3>
            <p class="hint">
              É como você aparece para quem abre o seu mural em Comparar, pelo código ou por um backup seu, e vai no nome
              do arquivo de backup.
            </p>
            <div class="key">
              <input
                id="dono-nome"
                type="text"
                autocomplete="nickname"
                spellcheck="false"
                [maxLength]="ownerNameMax"
                placeholder="Como você quer aparecer"
                [value]="settings.ownerName()"
                (input)="settings.ownerName.set($any($event.target).value)"
              />
            </div>
          </div>

          @if (cloud.config(); as cfg) {
          <div class="bloco nuvem" role="group" aria-labelledby="conta-titulo">
          <h3 id="conta-titulo" class="sub">Conta na nuvem</h3>
          @if (account.account(); as acc) {
            <div class="estado" [class.atrasado]="syncTrouble()">
              <lucide-icon
                class="estado-icone"
                [img]="syncTrouble() ? CloudOffIcon : CloudOnIcon"
                [size]="22"
                [strokeWidth]="2.4"
                aria-hidden="true"
              />
              <div>
                <p class="estado-linha" role="status">{{ syncLine() }}</p>
                <p class="estado-sub">Entrou como {{ acc.nome }}, o "Seu nome" aqui em cima.</p>
              </div>
            </div>
            @if (sync.message(); as m) {
              <p class="msg" [class.error]="sync.status() === 'erro' || sync.status() === 'desatualizado'">{{ m }}</p>
            }
            @if (sync.clockWrong()) {
              <p class="msg error">
                O relógio deste aparelho está {{ sync.clockSkew() > 0 ? 'atrasado' : 'adiantado' }} em relação à nuvem. Acerte a
                hora: com o relógio errado, uma edição antiga pode passar por cima de uma nova.
              </p>
            }
            <div class="sync-acoes">
              @if (sync.status() === 'escolha') {
                <button type="button" class="btn-ink" (click)="sync.syncNow()">Escolher agora</button>
              } @else if (sync.status() === 'desatualizado') {
                <button type="button" class="btn-ink" (click)="reload()">Recarregar a página</button>
              } @else {
                <button type="button" class="btn-quiet" (click)="sync.syncNow()" [disabled]="sync.status() === 'sincronizando'" [appBusy]="sync.status() === 'sincronizando'">
                  <lucide-icon [img]="RefreshIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />
                  Sincronizar agora
                </button>
              }
            </div>
            @if (beforeCopy(); as copy) {
              <p class="hint copia">
                O mural que estava neste navegador antes de entrar na conta está guardado até {{ copyUntil(copy) }}.
                <button type="button" class="link-btn" (click)="downloadBefore(copy)">Baixar essa cópia</button>
              </p>
            }

            <div class="bloco codigo" role="group" aria-labelledby="codigo-titulo">
              <h3 id="codigo-titulo" class="sub">Seu código</h3>
              <div class="codigo-linha">
                <span class="codigo-valor" [attr.aria-label]="'Código ' + spelled(acc.codigo)">{{ acc.codigo }}</span>
                <button type="button" class="btn-quiet" (click)="copyCode(acc.codigo)">
                  <lucide-icon [img]="CopyIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />
                  Copiar
                </button>
                <button type="button" class="btn-quiet" (click)="copyLink(acc.codigo)">
                  <lucide-icon [img]="LinkIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />
                  Copiar o link
                </button>
              </div>
              <p class="hint">
                Com o código ou o link, qualquer pessoa abre as suas resenhas em Comparar (a fila, a wishlist e os ajustes
                não vão). Com ele, a pessoa também pode seguir você em Amigos.
                <button type="button" class="link-btn" (click)="newCode()" [disabled]="!!accountBusy()" [appBusy]="accountBusy() === 'codigo'">
                  {{ accountBusy() === 'codigo' ? 'Trocando o código…' : 'Trocar o código' }}
                </button>
              </p>
            </div>

            <div class="bloco sair" role="group" aria-label="Sair da conta">
              <button type="button" class="btn-quiet" (click)="signOut()" [disabled]="!!accountBusy()" [appBusy]="accountBusy() === 'sair'">
                <lucide-icon [img]="LogOutIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />
                {{ accountBusy() === 'sair' ? 'Saindo…' : 'Sair' }}
              </button>
              <button type="button" class="btn-quiet" (click)="signOutEverywhere()" [disabled]="!!accountBusy()" [appBusy]="accountBusy() === 'sair-todos'">
                {{ accountBusy() === 'sair-todos' ? 'Saindo de todos…' : 'Sair de todos os aparelhos' }}
              </button>
            </div>

            <div class="bloco apagar-conta" role="group" aria-labelledby="apagar-conta-titulo">
              <h3 id="apagar-conta-titulo" class="sub">Apagar a conta</h3>
              <p class="hint">
                Tira da nuvem a conta, o código e tudo o que estiver guardado lá. O mural deste navegador continua aqui.
              </p>
              <button type="button" class="btn-ink danger" (click)="deleteAccount(acc.nome, acc.codigo)" [disabled]="!!accountBusy()" [appBusy]="accountBusy() === 'apagar'">
                <lucide-icon [img]="TrashIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />
                {{ accountBusy() === 'apagar' ? 'Apagando…' : 'Apagar a conta' }}
              </button>
            </div>
          } @else {
            <p class="lead">
              Entre com o Google para guardar o mural na nuvem e abrir em qualquer aparelho. Sem conta, tudo continua só
              neste navegador, como sempre.
            </p>
            <div class="entrar">
              @if (accountBusy() === 'entrar') {
                <p class="hint entrando" role="status"><span class="carregando" aria-hidden="true"></span>Entrando…</p>
              } @else {
                <app-google-button [clientId]="cfg.googleClientId" (credential)="signIn($event)" />
              }
            </div>
            <p class="hint">
              A nuvem guarda o número da sua conta Google, o nome que você escolher e o seu mural; nunca o seu e-mail.
              <a href="privacidade.html" target="_blank" rel="noopener">Como a privacidade funciona</a>
            </p>
          }
          @if (accountMsg(); as m) {
            <p class="msg error" role="alert">{{ m }}</p>
          }
          </div>
          }
        </section>
      }

      <!-- ===== Backup ===== -->
      @if (tab() === 'backup') {
      <section class="ficha cartolina backup" aria-labelledby="backup-titulo">
        <app-pin class="pin" color="#e62e2d" />
        <h2 id="backup-titulo">Backup</h2>
        <p class="lead">
          @if (account.signedIn() && cloud.config()) {
            Suas resenhas estão neste navegador e na sua conta. O backup é um arquivo só seu, com todos os murais: resenhas,
            pra depois e wishlist.
          } @else {
            Suas resenhas moram só neste navegador. O backup é um arquivo com todos os murais: resenhas, pra depois e
            wishlist.
          }
        </p>

        <div class="estado" [class.atrasado]="overdue()">
          <lucide-icon
            class="estado-icone"
            [img]="backup.inCloud() ? CloudOnIcon : overdue() ? AlertIcon : OkIcon"
            [size]="22"
            [strokeWidth]="2.4"
            aria-hidden="true"
          />
          <div>
            <p class="estado-linha">{{ backup.inCloud() ? syncLine() : lastBackup() }}</p>
            <p class="estado-sub">
              {{ contents() }}
              @if (backup.inCloud()) {
                {{ lastBackup() }}.
              }
            </p>
          </div>
        </div>

        <button type="button" class="btn-ink baixar" (click)="exportFile()" [disabled]="!hasData() || exporting()" [appBusy]="exporting()">
          <lucide-icon [img]="DownloadIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />
          {{ exporting() ? 'Preparando o backup…' : 'Baixar backup' }}
        </button>
        <p class="hint arquivo">
          O arquivo sai como <strong>{{ fileNamePreview() }}</strong> (o nome vem do
          <button type="button" class="link-btn" (click)="go('perfil')">Perfil</button>).
        </p>

        @if (backup.persisted() === false) {
          <p class="tip">
            <lucide-icon [img]="ShieldIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />
            <span>
              O navegador pode apagar o que um site guarda quando falta espaço (o Safari apaga depois de uma semana sem
              abrir). Instale o mural na tela inicial para ele ficar protegido.
            </span>
          </p>
        }

        <div class="bloco" role="group" aria-labelledby="restaurar-titulo">
          <h3 id="restaurar-titulo" class="sub">Restaurar um backup</h3>
          <fieldset class="escolha">
            <legend class="rotulo">O que fazer com o que já está aqui?</legend>
            <label class="op">
              <span class="opcao">
                <input type="radio" name="modo" value="merge" [checked]="mode() === 'merge'" (change)="mode.set('merge')" />
                <span class="adesivo" [class.recorte]="mode() !== 'merge'" [class.colado]="mode() === 'merge'">Juntar</span>
              </span>
              <span class="op-texto">Soma o arquivo ao que já está aqui. Se uma resenha está nos dois, fica a mais nova.</span>
            </label>
            <label class="op">
              <span class="opcao">
                <input type="radio" name="modo" value="replace" [checked]="mode() === 'replace'" (change)="mode.set('replace')" />
                <span class="adesivo" [class.recorte]="mode() !== 'replace'" [class.colado]="mode() === 'replace'">Substituir</span>
              </span>
              <span class="op-texto">Apaga o que está aqui e deixa os murais iguais ao arquivo.</span>
            </label>
          </fieldset>
          <label class="file-btn" [appBusy]="importing()">
            <lucide-icon [img]="UploadIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />
            {{ importing() ? 'Lendo o arquivo…' : mode() === 'replace' ? 'Escolher arquivo e substituir' : 'Escolher arquivo e juntar' }}
            <input type="file" accept="application/json,.json,application/gzip,.gz" [disabled]="importing()" (change)="importFile($event)" />
          </label>
          <p class="hint">O arquivo .json ou .json.gz baixado aqui, em qualquer navegador.</p>
          @if (importMsg(); as m) {
            <p class="msg" [class.error]="m.error" role="status">{{ m.text }}</p>
          }
        </div>

        <div class="bloco apagar" role="group" aria-labelledby="apagar-titulo">
          <h3 id="apagar-titulo" class="sub">Apagar o save</h3>
          <p class="hint">
            Começa do zero: tira deste navegador as resenhas, o pra depois, a wishlist, os backups de colegas e o progresso
            dos Extras. Seu nome, as chaves e as escolhas desta página ficam. Não tem desfazer: baixe um backup antes se
            quiser guardar.
            @if (account.signedIn() && cloud.config()) {
              Com a conta, o mural da nuvem volta para cá na próxima sincronização; para tirar da nuvem, apague a conta.
            }
          </p>
          <button type="button" class="btn-ink danger" (click)="erase()" [disabled]="erasing()" [appBusy]="erasing()">
            <lucide-icon [img]="TrashIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />
            {{ erasing() ? 'Apagando…' : 'Apagar o save' }}
          </button>
        </div>
      </section>
      }

      <!-- ===== Mural ===== -->
      @if (tab() === 'mural') {
      <section class="ficha cartolina mural" aria-labelledby="mural-titulo">
        <app-pin class="pin" color="#e62e2d" />
        <h2 id="mural-titulo">Mural</h2>
        <fieldset class="escolha">
          <legend class="rotulo">Etiquetas dos grupos</legend>
          <label class="op">
            <span class="opcao">
              <input type="radio" name="etiquetas" value="mostrar" [checked]="settings.groupLabels()" (change)="settings.groupLabels.set(true)" />
              <span class="adesivo" [class.recorte]="!settings.groupLabels()" [class.colado]="settings.groupLabels()">Mostrar</span>
            </span>
            <span class="op-texto">Uma fita separa cada grupo pelo que ordena: mês, nota, letra ou status.</span>
          </label>
          <label class="op">
            <span class="opcao">
              <input type="radio" name="etiquetas" value="esconder" [checked]="!settings.groupLabels()" (change)="settings.groupLabels.set(false)" />
              <span class="adesivo" [class.recorte]="settings.groupLabels()" [class.colado]="!settings.groupLabels()">Esconder</span>
            </span>
            <span class="op-texto">As fichas correm juntas, sem nada no meio. Bom para tirar print.</span>
          </label>
        </fieldset>

        <!-- um pedaço da parede, para ver o efeito antes de voltar ao mural -->
        <div class="previa parede" [class.junta]="!settings.groupLabels()" aria-hidden="true">
          @for (g of preview; track g.label) {
            <div class="p-grupo">
              @if (settings.groupLabels()) {
                <span class="p-fita">{{ g.label }}</span>
              }
              <div class="p-fichas">
                @for (s of g.stocks; track $index) {
                  <span class="p-ficha" [style.--stock]="'var(--stock-' + s + ')'"></span>
                }
              </div>
            </div>
          }
        </div>

        <fieldset class="escolha spoilers">
          <legend class="rotulo">Spoilers</legend>
          <label class="op">
            <span class="opcao">
              <input type="radio" name="spoilers" value="mostrar" [checked]="!settings.noSpoilers()" (change)="settings.noSpoilers.set(false)" />
              <span class="adesivo" [class.recorte]="settings.noSpoilers()" [class.colado]="!settings.noSpoilers()">Mostrar</span>
            </span>
            <span class="op-texto">As fichas mostram o que você achou: notas, veredito, bônus e a frase da resenha.</span>
          </label>
          <label class="op">
            <span class="opcao">
              <input type="radio" name="spoilers" value="esconder" [checked]="settings.noSpoilers()" (change)="settings.noSpoilers.set(true)" />
              <span class="adesivo" [class.recorte]="!settings.noSpoilers()" [class.colado]="settings.noSpoilers()">Sem spoilers</span>
            </span>
            <span class="op-texto">
              Toda nota vira “?”, o veredito vira “Segredo”, as horas e a dificuldade somem, todo bônus fica meio branco e meio preto, e o texto vira um rabisco do mesmo tamanho, como letreiro de desenho animado.
              Bom para mostrar o mural sem contar nada.
            </span>
          </label>
        </fieldset>

        @if (cloud.config()) {
          <fieldset class="escolha amigos-murais">
            <legend class="rotulo">Novidades dos amigos</legend>
            <label class="op">
              <span class="opcao">
                <input type="radio" name="amigos-murais" value="misturado" [checked]="settings.friendKinds() === 'misturado'" (change)="settings.friendKinds.set('misturado')" />
                <span class="adesivo" [class.recorte]="settings.friendKinds() !== 'misturado'" [class.colado]="settings.friendKinds() === 'misturado'">Misturado</span>
              </span>
              <span class="op-texto">Em Amigos aparece tudo: jogos, livros, filmes, séries e animes, esteja no mural que estiver.</span>
            </label>
            <label class="op">
              <span class="opcao">
                <input type="radio" name="amigos-murais" value="separado" [checked]="settings.friendKinds() === 'separado'" (change)="settings.friendKinds.set('separado')" />
                <span class="adesivo" [class.recorte]="settings.friendKinds() !== 'separado'" [class.colado]="settings.friendKinds() === 'separado'">Separado</span>
              </span>
              <span class="op-texto">Só o que é do mural aberto no cartaz: no de animes, só animes. O número da aba Amigos também.</span>
            </label>
          </fieldset>

          <fieldset class="escolha numero-amigos">
            <legend class="rotulo">Número na aba Amigos</legend>
            <label class="op">
              <span class="opcao">
                <input type="radio" name="numero-amigos" value="mostrar" [checked]="settings.mailCount()" (change)="settings.mailCount.set(true)" />
                <span class="adesivo" [class.recorte]="!settings.mailCount()" [class.colado]="settings.mailCount()">Mostrar</span>
              </span>
              <span class="op-texto">A aba Amigos, no topo, mostra quantas novidades chegaram, e as pessoas acenam quando chega algo.</span>
            </label>
            <label class="op">
              <span class="opcao">
                <input type="radio" name="numero-amigos" value="esconder" [checked]="!settings.mailCount()" (change)="settings.mailCount.set(false)" />
                <span class="adesivo" [class.recorte]="settings.mailCount()" [class.colado]="!settings.mailCount()">Esconder</span>
              </span>
              <span class="op-texto">A aba fica quieta; as novidades continuam lá dentro.</span>
            </label>
          </fieldset>
        }

        <!-- vale para a ficha de qualquer outra pessoa: em Amigos, no mural dela e em Comparar -->
        <fieldset class="escolha spoilers-amigos">
          <legend class="rotulo">Notas dos outros</legend>
          <label class="op">
            <span class="opcao">
              <input type="radio" name="spoilers-amigos" value="mostrar" [checked]="!settings.friendSpoilers()" (change)="settings.friendSpoilers.set(false)" />
              <span class="adesivo" [class.recorte]="settings.friendSpoilers()" [class.colado]="!settings.friendSpoilers()">Mostrar</span>
            </span>
            <span class="op-texto">As fichas de outras pessoas aparecem inteiras, amigos ou não.</span>
          </label>
          <label class="op">
            <span class="opcao">
              <input type="radio" name="spoilers-amigos" value="evitar" [checked]="settings.friendSpoilers()" (change)="settings.friendSpoilers.set(true)" />
              <span class="adesivo" [class.recorte]="!settings.friendSpoilers()" [class.colado]="settings.friendSpoilers()">Evitar spoilers</span>
            </span>
            <span class="op-texto">
              Em Amigos, no mural de alguém e em Comparar, o que você ainda não avaliou fica em segredo; o que já avaliou mostra a nota.
              Dá para revelar na hora, sem mudar aqui.
            </span>
          </label>
        </fieldset>

        <fieldset class="escolha nota">
          <legend class="rotulo">Nota</legend>
          @for (o of scoreDisplays; track o.value) {
            <label class="op">
              <span class="opcao">
                <input type="radio" name="nota" [value]="o.value" [checked]="settings.scoreDisplay() === o.value" (change)="settings.scoreDisplay.set(o.value)" />
                <span class="adesivo" [class.recorte]="settings.scoreDisplay() !== o.value" [class.colado]="settings.scoreDisplay() === o.value">{{ o.label }}</span>
              </span>
              <span class="op-texto">{{ o.text }}</span>
            </label>
          }
        </fieldset>

        <!-- um canto de ficha, para ver o que some e como a nota aparece -->
        <div class="previa-ficha" aria-hidden="true">
          <app-judge-label class="p-julgamento" [value]="8.7" verdict="recomendo" size="compact" [masked]="settings.noSpoilers()" />
          <ul class="p-bonus">
            @for (b of sampleBonuses; track b.id; let i = $index) {
              <li><app-bonus-sticker [bonus]="b" [index]="i" size="mini" [masked]="settings.noSpoilers()" seed="previa" /></li>
            }
          </ul>
          <p class="p-frase">
            @if (settings.noSpoilers()) {
              “<app-rabisco [text]="sampleLeadMasked" />”
            } @else {
              “{{ sampleLead }}”
            }
          </p>
        </div>
      </section>
      }

      <!-- ===== Busca e capas ===== -->
      @if (tab() === 'busca') {
      <section class="ficha cartolina catalog" aria-labelledby="catalogo-titulo">
        <app-pin class="pin" color="#f4f4f0" />
        <h2 id="catalogo-titulo">Busca e capas</h2>
        <p class="lead">A busca já funciona sem configurar nada. Duas chaves gratuitas deixam ela melhor.</p>
        @if (account.signedIn() && cloud.config()) {
          <p class="hint">Com a conta, as chaves coladas aqui valem em todos os seus aparelhos. Elas nunca vão no arquivo de backup.</p>
        }

        <h3 class="rotulo fontes-titulo" id="fontes-titulo">De onde vem a busca agora</h3>
        <dl class="fontes" aria-labelledby="fontes-titulo">
          <div>
            <dt><lucide-icon [img]="GamesIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />Jogos</dt>
            <dd>
              @if (settings.effectiveSource() === 'rawg') {
                RAWG <span class="via">com capa da Steam</span>
              } @else {
                Wikipedia <span class="via">em inglês</span>
              }
            </dd>
          </div>
          <div>
            <dt><lucide-icon [img]="BooksIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />Livros</dt>
            <dd>Open Library <span class="via">edição em português</span></dd>
          </div>
          <div>
            <dt>
              <lucide-icon [img]="FilmsIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />
              <lucide-icon [img]="SeriesIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />Filmes e séries
            </dt>
            <dd>
              @if (settings.hasTmdb()) {
                TMDB <span class="via">em português</span>
              } @else {
                Wikipedia <span class="via">em inglês</span>
              }
            </dd>
          </div>
          <div>
            <dt><lucide-icon [img]="AnimesIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />Animes</dt>
            <dd>Kitsu <span class="via">nome brasileiro quando tem</span></dd>
          </div>
        </dl>

        <!-- TMDB -->
        <section class="chave" aria-labelledby="tmdb-titulo">
          <div class="chave-topo">
            <h3 id="tmdb-titulo" class="sub">Chave do TMDB</h3>
            <span class="selo" [class.ok]="settings.hasTmdb()">
              @if (settings.hasTmdb()) {
                <lucide-icon [img]="CheckIcon" [size]="14" [strokeWidth]="3" aria-hidden="true" />
                Chave salva
              } @else {
                Sem chave
              }
            </span>
          </div>
          <p class="ganho">Filmes e séries com o nome e o pôster em português.</p>
          <ol class="passos">
            <li>
              Crie uma conta grátis em
              <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener">themoviedb.org</a>.
            </li>
            <li>Peça uma chave de API para uso pessoal.</li>
            <li>Cole aqui a "Chave da API" ou o "Token de leitura".</li>
          </ol>
          <div class="key">
            <input
              #tmdbInput
              id="tmdb-key"
              aria-labelledby="tmdb-titulo"
              [type]="showTmdb() ? 'text' : 'password'"
              autocomplete="off"
              spellcheck="false"
              placeholder="Cole sua chave do TMDB"
              [value]="settings.tmdbKey()"
              (input)="settings.setKey('tmdb', $any($event.target).value)"
            />
            @if (settings.tmdbKey()) {
              <button type="button" class="icon-btn" (click)="settings.setKey('tmdb', ''); tmdbInput.focus()" aria-label="Apagar a chave do TMDB">
                <lucide-icon [img]="ClearIcon" [size]="20" [strokeWidth]="2.6" />
              </button>
            }
            <button
              type="button"
              class="icon-btn"
              (click)="showTmdb.set(!showTmdb())"
              [attr.aria-label]="showTmdb() ? 'Esconder chave' : 'Mostrar chave'"
              [attr.aria-pressed]="showTmdb()"
            >
              <lucide-icon [img]="showTmdb() ? HideIcon : ShowIcon" [size]="20" [strokeWidth]="2.4" />
            </button>
          </div>
          <p class="credit">Este site usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.</p>
        </section>

        <!-- RAWG -->
        <section class="chave" aria-labelledby="rawg-titulo">
          <div class="chave-topo">
            <h3 id="rawg-titulo" class="sub">Chave da RAWG</h3>
            <span class="selo" [class.ok]="settings.hasRawg()">
              @if (settings.hasRawg()) {
                <lucide-icon [img]="CheckIcon" [size]="14" [strokeWidth]="3" aria-hidden="true" />
                Chave salva
              } @else {
                Sem chave
              }
            </span>
          </div>
          <p class="ganho">Busca de jogos mais precisa, e a capa vertical da Steam quando o jogo está lá.</p>
          <ol class="passos">
            <li>
              Crie uma chave grátis em
              <a href="https://rawg.io/apidocs" target="_blank" rel="noopener">rawg.io/apidocs</a>.
            </li>
            <li>Cole a chave aqui.</li>
          </ol>
          <div class="key">
            <input
              #rawgInput
              id="rawg-key"
              aria-labelledby="rawg-titulo"
              [type]="showKey() ? 'text' : 'password'"
              autocomplete="off"
              spellcheck="false"
              placeholder="Cole sua chave da RAWG"
              [value]="settings.rawgKey()"
              (input)="settings.setKey('rawg', $any($event.target).value)"
            />
            @if (settings.rawgKey()) {
              <button type="button" class="icon-btn" (click)="settings.setKey('rawg', ''); rawgInput.focus()" aria-label="Apagar a chave da RAWG">
                <lucide-icon [img]="ClearIcon" [size]="20" [strokeWidth]="2.6" />
              </button>
            }
            <button
              type="button"
              class="icon-btn"
              (click)="showKey.set(!showKey())"
              [attr.aria-label]="showKey() ? 'Esconder chave' : 'Mostrar chave'"
              [attr.aria-pressed]="showKey()"
            >
              <lucide-icon [img]="showKey() ? HideIcon : ShowIcon" [size]="20" [strokeWidth]="2.4" />
            </button>
          </div>

          <fieldset class="escolha fonte">
            <legend class="rotulo">Buscar jogos e capas de jogos em</legend>
            <label class="op">
              <span class="opcao">
                <input
                  type="radio"
                  name="fonte"
                  value="wikipedia"
                  [checked]="settings.effectiveSource() === 'wikipedia'"
                  (change)="settings.source.set('wikipedia')"
                />
                <span class="adesivo" [class.recorte]="settings.effectiveSource() !== 'wikipedia'" [class.colado]="settings.effectiveSource() === 'wikipedia'">
                  Wikipedia
                </span>
              </span>
              <span class="op-texto">Não precisa de chave.</span>
            </label>
            <label class="op" [class.off]="!settings.hasRawg()">
              <span class="opcao">
                <input
                  type="radio"
                  name="fonte"
                  value="rawg"
                  [disabled]="!settings.hasRawg()"
                  [checked]="settings.effectiveSource() === 'rawg'"
                  (change)="settings.source.set('rawg')"
                />
                <span class="adesivo" [class.recorte]="settings.effectiveSource() !== 'rawg'" [class.colado]="settings.effectiveSource() === 'rawg'">
                  RAWG
                </span>
              </span>
              <span class="op-texto">
                @if (settings.hasRawg()) {
                  Usa a sua chave, e traz a capa da Steam.
                } @else {
                  Cole a chave acima para usar.
                }
              </span>
            </label>
          </fieldset>
        </section>
      </section>
      }
    </div>
  `,
  styleUrl: './settings-page.scss',
})
export class SettingsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  /** As abas, na ordem da régua. A aberta fica no endereço (#/ajustes?aba=backup), para links irem direto. */
  protected readonly tabs: readonly { id: Tab; label: string; icon: typeof Search }[] = [
    { id: 'perfil', label: 'Perfil', icon: UserRound },
    { id: 'backup', label: 'Backup', icon: HardDriveDownload },
    { id: 'mural', label: 'Mural', icon: LayoutGrid },
    { id: 'busca', label: 'Busca e capas', icon: Search },
  ];
  protected readonly tab = signal<Tab>(this.tabFrom(this.route.snapshot.queryParamMap.get('aba')));

  private tabFrom(value: string | null): Tab {
    return TABS.includes(value as Tab) ? (value as Tab) : 'perfil';
  }

  protected go(id: Tab): void {
    this.tab.set(id);
    void this.router.navigate([], { relativeTo: this.route, queryParams: { aba: id }, replaceUrl: true });
  }

  /** Setas, Home e End andam entre as abas (o padrão das abas para teclado). */
  protected onTabKey(e: KeyboardEvent): void {
    const i = TABS.indexOf(this.tab());
    const next =
      e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i - 1 + TABS.length) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    this.go(TABS[next]);
    queueMicrotask(() => document.getElementById(`aba-${TABS[next]}`)?.focus());
  }

  protected readonly store = inject(ReviewStore);
  protected readonly settings = inject(Settings);
  /** O jeito de mostrar a nota, com um exemplo de cada. */
  protected readonly scoreDisplays: readonly { value: ScoreDisplay; label: string; text: string }[] = [
    { value: 'livre', label: 'Livre', text: 'Qualquer nota com até uma casa: 8,4 fica 8,4.' },
    { value: 'metade', label: 'Arredondado', text: 'Vai para a metade ou o inteiro mais perto: 9,2 vira 9 e 8,4 vira 8,5.' },
    { value: 'inteiro', label: 'Inteiros', text: 'Vai para o inteiro mais perto: 8,4 vira 8 e 8,5 vira 9.' },
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
  protected readonly CheckIcon = Check;
  protected readonly OkIcon = CircleCheck;
  protected readonly AlertIcon = TriangleAlert;
  protected readonly ShieldIcon = ShieldAlert;
  protected readonly TrashIcon = Trash2;
  protected readonly GamesIcon = Gamepad2;
  protected readonly BooksIcon = BookOpen;
  protected readonly FilmsIcon = Film;
  protected readonly SeriesIcon = Tv;
  protected readonly AnimesIcon = Origami;
  protected readonly CloudOnIcon = CloudIcon;
  protected readonly CopyIcon = Copy;
  protected readonly LinkIcon = LinkIconData;
  protected readonly LogOutIcon = LogOut;
  protected readonly RefreshIcon = RefreshCw;
  protected readonly CloudOffIcon = CloudOff;

  /** O pedaço de parede da prévia das etiquetas: dois meses, cinco fichas. */
  protected readonly preview = [
    { label: 'Março', stocks: ['rosa', 'azul', 'verde'] },
    { label: 'Fevereiro', stocks: ['amarelo', 'laranja'] },
  ];

  /** A prévia do modo sem spoilers: dois bônus, um de cada lado, e uma frase de resenha. */
  protected readonly sampleBonuses: Bonus[] = [
    { id: 'trilha-sonora', label: 'Trilha sonora incrível', kind: 'favor' },
    { id: 'bugs', label: 'Muitos bugs', kind: 'contra' },
  ];
  protected readonly sampleLead = 'Valeu cada hora, mesmo com o final corrido.';
  protected readonly sampleLeadMasked = scramble(this.sampleLead, 'previa');

  protected readonly showKey = signal(false);
  protected readonly showTmdb = signal(false);
  protected readonly mode = signal<'merge' | 'replace'>('merge');
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
    const replace = this.mode() === 'replace';
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
      const n = this.store.count();
      const lists = this.store.draftCount() + this.wishCount();
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
      const res = this.store.importJson(text, this.mode());
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
