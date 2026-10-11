import { Injectable, effect, signal } from '@angular/core';
import { Profile, defaultProfile, sanitizeProfile } from './profile';

/** O perfil deste navegador e quando mudou (fica com "Apagar o save", como os outros ajustes). */
export const PROFILE_KEY = 'meu-mural:perfil:v1';

/** O perfil guardado aqui, com a data da última mudança (ISO; vazio: nunca mexeu). */
interface StoredProfile {
  perfil: Profile;
  em: string;
}

function read(): StoredProfile {
  try {
    const raw = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null') as Record<string, unknown> | null;
    const perfil = sanitizeProfile(raw?.['perfil']);
    const em = typeof raw?.['em'] === 'string' && Number.isFinite(Date.parse(raw['em'])) ? raw['em'] : '';
    if (perfil) return { perfil, em };
  } catch {
    /* ilegível: começa do padrão */
  }
  return { perfil: defaultProfile(), em: '' };
}

/**
 * O seu perfil. Toda mudança passa por `update` e vale como a mais nova (com conta, ela vence a da
 * nuvem; ver core/cloud-sync.ts). O nome não fica aqui: é o "Seu nome" dos Ajustes.
 */
@Injectable({ providedIn: 'root' })
export class ProfileStore {
  private readonly stored = read();
  readonly profile = signal<Profile>(this.stored.perfil);
  /** Quando o perfil mudou pela última vez (vazio: nunca mexeu, e nada vai para a nuvem). */
  readonly changedAt = signal(this.stored.em);

  constructor() {
    effect(() => {
      const data: StoredProfile = { perfil: this.profile(), em: this.changedAt() };
      try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(data));
      } catch {
        /* sem armazenamento: vale só nesta sessão */
      }
    });
  }

  /** Muda o perfil (o resultado passa pelo saneamento, com os limites). */
  update(change: (p: Profile) => Profile): void {
    const next = sanitizeProfile(change(this.profile()));
    if (!next) return;
    this.profile.set(next);
    this.changedAt.set(new Date().toISOString());
  }

  /** O perfil que veio de outro aparelho (mudado depois do daqui). */
  apply(profile: Profile, at: string): void {
    this.profile.set(profile);
    this.changedAt.set(at);
  }
}
