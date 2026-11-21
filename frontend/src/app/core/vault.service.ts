import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { StorageService } from './storage.service';
import { Bullet, Certification, Contact, Education, Experience, MasterVault, emptyVault, normalizeVault, nextId } from './vault.model';
import type { ResumeSnapshotData } from './saved-resumes.service';

const VAULT_KEY = 'master-vault';
const ONBOARDED_KEY = 'ats-onboarding-completed';
const TAILORED_STATE_KEY = 'tailored-state';

interface SavedTailoredState {
  selectedBulletIds?: string[];
  tailoredSummary?: string | null;
  tailoredSkills?: string[] | null;
  resumeOnlyBullets?: Record<string, Bullet[]>;
  resumeBulletOverrides?: Record<string, string>;
  resumeOnlyExperience?: Experience[];
  resumeOnlyEducation?: Education[];
  hiddenEducationIds?: string[];
  resumeOnlyCertifications?: Certification[];
  hiddenCertificationIds?: string[];
  hiddenSummary?: boolean;
  snapshotContact?: Contact | null;
}

@Injectable({ providedIn: 'root' })
export class VaultService {
  private readonly storage = inject(StorageService);

  readonly vault = signal<MasterVault>(emptyVault());
  readonly loaded = signal(false);
  /** True when the user has completed onboarding (pasted/reviewed their profile) or imported a vault. */
  readonly onboarded = signal(false);
  /** True until the user adds/edits/imports anything (or a saved vault is loaded). Shows onboarding. */
  readonly pristine = signal(true);
  /** IDs of bullets selected for the current resume (driven by triage). */
  readonly selectedBulletIds = signal<Set<string>>(new Set());

  /** Summary generated for the current job description; overrides the vault summary in the preview. */
  readonly tailoredSummary = signal<string | null>(null);
  /** Skills ordered/selected for the current job description; overrides the vault skills in the preview. */
  readonly tailoredSkills = signal<string[] | null>(null);

  /** Resume-only additions & visibility overrides (keeps Master Vault untouched unless promoted). */
  readonly resumeOnlyBullets = signal<Record<string, Bullet[]>>({});
  readonly resumeBulletOverrides = signal<Record<string, string>>({});
  readonly resumeOnlyExperience = signal<Experience[]>([]);
  readonly resumeOnlyEducation = signal<Education[]>([]);
  readonly hiddenEducationIds = signal<Set<string>>(new Set());
  readonly resumeOnlyCertifications = signal<Certification[]>([]);
  readonly hiddenCertificationIds = signal<Set<string>>(new Set());
  readonly hiddenSummary = signal(false);
  readonly snapshotContact = signal<Contact | null>(null);

  readonly settings = computed(() => this.vault().settings);
  readonly ready: Promise<void>;
  private readonly destroyRef = inject(DestroyRef);
  private readonly lastSavedJson = new Map<string, string>();
  private cleared = false;
  private syncingExternal = false;

  constructor() {
    this.ready = this.init();
    const unwatch = this.storage.watch((key, newValue) => this.applyExternalChange(key, newValue));
    this.destroyRef.onDestroy(unwatch);

    effect(() => {
      const v = this.vault();
      if (this.loaded() && !this.pristine() && !this.syncingExternal) {
        this.persistKey(VAULT_KEY, v);
      }
    });
    effect(() => {
      const payload: SavedTailoredState = {
        selectedBulletIds: Array.from(this.selectedBulletIds()),
        tailoredSummary: this.tailoredSummary(),
        tailoredSkills: this.tailoredSkills(),
        resumeOnlyBullets: this.resumeOnlyBullets(),
        resumeBulletOverrides: this.resumeBulletOverrides(),
        resumeOnlyExperience: this.resumeOnlyExperience(),
        resumeOnlyEducation: this.resumeOnlyEducation(),
        hiddenEducationIds: Array.from(this.hiddenEducationIds()),
        resumeOnlyCertifications: this.resumeOnlyCertifications(),
        hiddenCertificationIds: Array.from(this.hiddenCertificationIds()),
        hiddenSummary: this.hiddenSummary(),
        snapshotContact: this.snapshotContact(),
      };
      if (this.loaded() && !this.pristine() && !this.syncingExternal) {
        this.persistKey(TAILORED_STATE_KEY, payload);
      }
    });
  }

  private persistKey(key: string, value: unknown): void {
    try {
      this.lastSavedJson.set(key, JSON.stringify(value));
    } catch {
      // Ignore serialization errors when caching last-written JSON
    }
    this.storage.set(key, value).catch((e) => console.warn('Vault save failed (storage full?)', e));
  }

  private applyExternalChange(key: string, newValue: unknown): void {
    const incomingJson = newValue === undefined ? '' : JSON.stringify(newValue);
    if (this.lastSavedJson.get(key) === incomingJson) return;
    this.lastSavedJson.set(key, incomingJson);

    this.syncingExternal = true;
    try {
      if (key === VAULT_KEY) {
        if (newValue) {
          this.setVault(normalizeVault(newValue), false);
        } else {
          this.vault.set(emptyVault());
          this.pristine.set(true);
          this.selectedBulletIds.set(new Set());
        }
      } else if (key === ONBOARDED_KEY) {
        this.onboarded.set(Boolean(newValue));
      } else if (key === TAILORED_STATE_KEY) {
        this.applyTailoredState((newValue ?? {}) as SavedTailoredState);
      }
    } finally {
      this.syncingExternal = false;
    }
  }

  private applyTailoredState(tailored: SavedTailoredState): void {
    if (Array.isArray(tailored.selectedBulletIds)) {
      this.selectedBulletIds.set(new Set(tailored.selectedBulletIds));
    }
    if (tailored.tailoredSummary !== undefined) {
      this.tailoredSummary.set(tailored.tailoredSummary);
    }
    if (tailored.tailoredSkills !== undefined) {
      this.tailoredSkills.set(Array.isArray(tailored.tailoredSkills) ? tailored.tailoredSkills : null);
    }
    if (tailored.resumeOnlyBullets && typeof tailored.resumeOnlyBullets === 'object') {
      this.resumeOnlyBullets.set(tailored.resumeOnlyBullets);
    }
    if (tailored.resumeBulletOverrides && typeof tailored.resumeBulletOverrides === 'object') {
      this.resumeBulletOverrides.set(tailored.resumeBulletOverrides);
    }
    if (Array.isArray(tailored.resumeOnlyExperience)) {
      this.resumeOnlyExperience.set(tailored.resumeOnlyExperience);
    }
    if (Array.isArray(tailored.resumeOnlyEducation)) {
      this.resumeOnlyEducation.set(tailored.resumeOnlyEducation);
    }
    if (Array.isArray(tailored.hiddenEducationIds)) {
      this.hiddenEducationIds.set(new Set(tailored.hiddenEducationIds));
    }
    if (Array.isArray(tailored.resumeOnlyCertifications)) {
      this.resumeOnlyCertifications.set(tailored.resumeOnlyCertifications);
    }
    if (Array.isArray(tailored.hiddenCertificationIds)) {
      this.hiddenCertificationIds.set(new Set(tailored.hiddenCertificationIds));
    }
    if (typeof tailored.hiddenSummary === 'boolean') {
      this.hiddenSummary.set(tailored.hiddenSummary);
    }
    if (tailored.snapshotContact !== undefined) {
      this.snapshotContact.set(tailored.snapshotContact);
    }
  }

  private async init(): Promise<void> {
    try {
      const isDone = await this.storage.get<boolean>(ONBOARDED_KEY);
      const saved = await this.storage.get<unknown>(VAULT_KEY);
      const tailored = await this.storage.get<SavedTailoredState>(TAILORED_STATE_KEY);
      if (this.cleared) return;
      if (saved) {
        this.setVault(normalizeVault(saved), true);
        this.onboarded.set(isDone ?? true);
      } else {
        this.selectAll();
        this.onboarded.set(isDone ?? false);
      }

      if (tailored) {
        this.applyTailoredState(tailored);
      }
    } catch (e) {
      console.warn('Vault load failed, starting with empty vault', e);
      if (this.cleared) return;
      this.selectAll();
      this.onboarded.set(false);
    }
    this.loaded.set(true);
  }

  completeOnboarding(): void {
    this.onboarded.set(true);
    this.persistKey(ONBOARDED_KEY, true);
  }

  startOnboarding(): void {
    this.onboarded.set(false);
    this.persistKey(ONBOARDED_KEY, false);
  }

  /** Signals an in-place mutation (e.g. via ngModel) so dependents refresh and the vault persists. */
  touch(): void {
    this.pristine.set(false);
    this.vault.update((v) => ({ ...v, contact: { ...v.contact }, settings: { ...v.settings } }));
  }

  update(fn: (draft: MasterVault) => void): void {
    const copy = structuredClone(this.vault());
    fn(copy);
    this.pristine.set(false);
    this.vault.set(copy);
  }

  /** Replace the vault; keeps selection only for IDs that still exist. */
  setVault(v: MasterVault, selectAllBullets = false): void {
    this.pristine.set(false);
    this.vault.set(v);
    if (selectAllBullets) this.selectAll();
    else {
      const ids = new Set(this.allBulletIds());
      this.selectedBulletIds.update((s) => new Set([...s].filter((i) => ids.has(i))));
    }
  }

  allBulletIds(): string[] {
    return this.vault().experience.flatMap((e) => e.bullets.map((b) => b.id));
  }

  selectAll(): void {
    this.selectedBulletIds.set(new Set(this.allBulletIds()));
  }

  setSelected(ids: Iterable<string>): void {
    this.selectedBulletIds.set(new Set(ids));
  }

  toggleBullet(id: string, on: boolean): void {
    this.selectedBulletIds.update((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  }

  // --- CRUD helpers ---
  addExperience(): void {
    this.update((v) => {
      v.experience.push({
        id: nextId(v, 'exp'),
        role: '',
        company: '',
        startDate: '',
        endDate: '',
        bullets: [],
      });
    });
  }

  removeExperience(id: string): void {
    this.update((v) => (v.experience = v.experience.filter((e) => e.id !== id)));
    this.setVault(this.vault());
  }

  moveExperience(index: number, delta: -1 | 1): void {
    this.update((v) => moveItem(v.experience, index, delta));
  }

  moveBullet(expId: string, index: number, delta: -1 | 1): void {
    this.update((v) => {
      const e = v.experience.find((x) => x.id === expId);
      if (e) moveItem(e.bullets, index, delta);
    });
  }

  addBullet(expId: string, text = '', select = true): string {
    let newId = '';
    this.update((v) => {
      newId = nextId(v, 'b');
      v.experience.find((e) => e.id === expId)?.bullets.push({ id: newId, text });
    });
    if (select) this.toggleBullet(newId, true);
    return newId;
  }

  removeBullet(expId: string, bulletId: string): void {
    this.update((v) => {
      const e = v.experience.find((x) => x.id === expId);
      if (e) e.bullets = e.bullets.filter((b) => b.id !== bulletId);
    });
    this.toggleBullet(bulletId, false);
  }

  addEducation(): void {
    this.update((v) => v.education.push({ id: nextId(v, 'edu'), degree: '', institution: '', year: '' }));
  }

  removeEducation(id: string): void {
    this.update((v) => (v.education = v.education.filter((e) => e.id !== id)));
  }

  addCertification(): void {
    this.update((v) => v.certifications.push({ id: nextId(v, 'cert'), name: '', issuer: '', year: '' }));
  }

  removeCertification(id: string): void {
    this.update((v) => (v.certifications = v.certifications.filter((c) => c.id !== id)));
  }

  /** Experience filtered to selected bullets plus any resume-only additions. */
  selectedExperience = computed<Experience[]>(() => {
    const sel = this.selectedBulletIds();
    const extraBullets = this.resumeOnlyBullets();
    const overrides = this.resumeBulletOverrides();
    const vaultExps = this.vault()
      .experience.map((e) => ({
        ...e,
        bullets: [
          ...e.bullets
            .filter((b) => sel.has(b.id))
            .map((b) => (overrides[b.id] !== undefined ? { ...b, text: overrides[b.id] } : b)),
          ...(extraBullets[e.id] ?? []),
        ],
      }))
      .filter((e) => e.bullets.length > 0);
    return [...vaultExps, ...this.resumeOnlyExperience()];
  });

  /** Education entries from the vault (excluding hidden ones) plus resume-only additions. */
  visibleEducation = computed<Education[]>(() => {
    const hidden = this.hiddenEducationIds();
    return [...this.vault().education.filter((e) => !hidden.has(e.id)), ...this.resumeOnlyEducation()];
  });

  /** Certification entries from the vault (excluding hidden ones) plus resume-only additions. */
  visibleCertifications = computed<Certification[]>(() => {
    const hidden = this.hiddenCertificationIds();
    return [...this.vault().certifications.filter((c) => !hidden.has(c.id)), ...this.resumeOnlyCertifications()];
  });

  /** Loads a point-in-time resume snapshot into the preview/editor without mutating the Master Vault. */
  loadResumeSnapshot(snap: ResumeSnapshotData): void {
    const v = this.vault();
    this.selectedBulletIds.set(new Set());
    this.resumeBulletOverrides.set({});
    this.resumeOnlyBullets.set({});
    this.hiddenEducationIds.set(new Set(v.education.map((e) => e.id)));
    this.hiddenCertificationIds.set(new Set(v.certifications.map((c) => c.id)));
    this.resumeOnlyExperience.set(structuredClone(snap.experience));
    this.resumeOnlyEducation.set(structuredClone(snap.education));
    this.resumeOnlyCertifications.set(structuredClone(snap.certifications));
    this.tailoredSummary.set(snap.summary);
    this.hiddenSummary.set(!snap.summary);
    this.tailoredSkills.set([...snap.skills]);
    this.snapshotContact.set(structuredClone(snap.contact));
    this.update((draft) => {
      draft.settings = { ...snap.settings };
    });
  }

  /** Backup */
  exportJson(): string {
    return JSON.stringify(this.vault(), null, 2);
  }

  importJson(text: string): void {
    this.setVault(normalizeVault(JSON.parse(text)), true);
  }

  async clearStorage(): Promise<void> {
    await this.storage.delete(VAULT_KEY);
  }

  async clearAllData(): Promise<void> {
    this.cleared = true;
    await this.storage.clearAll();
    await this.storage.delete(TAILORED_STATE_KEY).catch(() => undefined);
    this.pristine.set(true);
    this.vault.set(emptyVault());
    this.onboarded.set(false);
    this.selectedBulletIds.set(new Set());
    this.tailoredSummary.set(null);
    this.tailoredSkills.set(null);
    this.resumeOnlyBullets.set({});
    this.resumeBulletOverrides.set({});
    this.resumeOnlyExperience.set([]);
    this.resumeOnlyEducation.set([]);
    this.hiddenEducationIds.set(new Set());
    this.resumeOnlyCertifications.set([]);
    this.hiddenCertificationIds.set(new Set());
    this.hiddenSummary.set(false);
    this.snapshotContact.set(null);
  }
}

function moveItem<T>(arr: T[], index: number, delta: -1 | 1): void {
  const target = index + delta;
  if (index < 0 || index >= arr.length || target < 0 || target >= arr.length) return;
  const [item] = arr.splice(index, 1);
  arr.splice(target, 0, item);
}
