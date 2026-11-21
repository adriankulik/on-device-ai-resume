import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { StorageService } from './storage.service';
import {
  Certification,
  Contact,
  Education,
  Experience,
  VaultSettings,
  emptyVault,
  normalizeVault,
} from './vault.model';

const SAVED_RESUMES_KEY = 'saved-resumes';

export interface ResumeSnapshotData {
  contact: Contact;
  summary: string;
  experience: Experience[];
  education: Education[];
  certifications: Certification[];
  skills: string[];
  settings: VaultSettings;
}

export interface SavedResumeSnapshot {
  id: string;
  name: string;
  savedAt: string;
  snapshot: ResumeSnapshotData;
}

export function isSavedResumePayload(parsed: unknown): boolean {
  if (Array.isArray(parsed)) return parsed.length > 0;
  if (!parsed || typeof parsed !== 'object') return false;
  const r = parsed as Record<string, unknown>;
  return typeof r['snapshot'] === 'object' && r['snapshot'] !== null;
}

export function normalizeSnapshot(raw: unknown): SavedResumeSnapshot {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid saved resume snapshot');
  }
  const r = raw as Record<string, unknown>;
  const snapRaw = (r['snapshot'] && typeof r['snapshot'] === 'object' ? r['snapshot'] : r) as Record<
    string,
    unknown
  >;
  const normalized = normalizeVault(snapRaw);
  const id =
    typeof r['id'] === 'string' && r['id'].trim()
      ? r['id'].trim()
      : `res_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const name =
    typeof r['name'] === 'string' && r['name'].trim()
      ? r['name'].trim()
      : normalized.contact.fullName || 'Saved Resume';
  const savedAt =
    typeof r['savedAt'] === 'string' && r['savedAt'].trim()
      ? r['savedAt'].trim()
      : new Date().toISOString();

  return {
    id,
    name,
    savedAt,
    snapshot: {
      contact: normalized.contact,
      summary: normalized.summary,
      experience: normalized.experience,
      education: normalized.education,
      certifications: normalized.certifications,
      skills: normalized.skills,
      settings: normalized.settings,
    },
  };
}

@Injectable({ providedIn: 'root' })
export class SavedResumesService {
  private readonly storage = inject(StorageService);
  private readonly destroyRef = inject(DestroyRef);

  readonly resumes = signal<SavedResumeSnapshot[]>([]);
  readonly activeSnapshotId = signal<string | null>(null);
  readonly ready: Promise<void>;
  private lastSavedJson = '';

  constructor() {
    this.ready = this.init();
    const unwatch = this.storage.watch((key, newValue) => {
      if (key !== SAVED_RESUMES_KEY) return;
      const incomingJson = newValue === undefined ? '[]' : JSON.stringify(newValue);
      if (incomingJson === this.lastSavedJson) return;
      this.lastSavedJson = incomingJson;
      if (Array.isArray(newValue)) {
        this.resumes.set(newValue.map((item) => normalizeSnapshot(item)));
      } else {
        this.resumes.set([]);
      }
    });
    this.destroyRef.onDestroy(unwatch);
  }

  private async init(): Promise<void> {
    try {
      const saved = await this.storage.get<unknown[]>(SAVED_RESUMES_KEY);
      if (Array.isArray(saved)) {
        const list = saved.map((item) => normalizeSnapshot(item));
        this.lastSavedJson = JSON.stringify(list);
        this.resumes.set(list);
      }
    } catch {
      this.resumes.set([]);
    }
  }

  private persist(list: SavedResumeSnapshot[]): void {
    this.lastSavedJson = JSON.stringify(list);
    this.storage.set(SAVED_RESUMES_KEY, list).catch(() => undefined);
  }

  saveSnapshot(
    name: string,
    snapshot: ResumeSnapshotData,
    existingId?: string | null,
  ): SavedResumeSnapshot {
    const cleanName = name.trim() || `Resume ${new Date().toISOString().slice(0, 10)}`;
    const now = new Date().toISOString();
    const cloned: ResumeSnapshotData = structuredClone({
      ...emptyVault(),
      ...snapshot,
    });

    if (existingId && this.resumes().some((r) => r.id === existingId)) {
      let updatedItem!: SavedResumeSnapshot;
      const next = this.resumes().map((r) => {
        if (r.id !== existingId) return r;
        updatedItem = { ...r, name: cleanName, savedAt: now, snapshot: cloned };
        return updatedItem;
      });
      this.resumes.set(next);
      this.persist(next);
      return updatedItem;
    }

    const item: SavedResumeSnapshot = {
      id: `res_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: cleanName,
      savedAt: now,
      snapshot: cloned,
    };
    const next = [item, ...this.resumes()];
    this.resumes.set(next);
    this.persist(next);
    return item;
  }

  deleteSnapshot(id: string): void {
    const next = this.resumes().filter((r) => r.id !== id);
    this.resumes.set(next);
    this.persist(next);
  }

  exportAllJson(): string {
    return JSON.stringify(this.resumes(), null, 2);
  }

  exportSingleJson(id: string): string {
    const item = this.resumes().find((r) => r.id === id);
    if (!item) throw new Error('Saved resume not found');
    return JSON.stringify(item, null, 2);
  }

  importJson(raw: string): { added: number; updated: number } {
    const parsed = JSON.parse(raw) as unknown;
    const itemsRaw = Array.isArray(parsed) ? parsed : [parsed];
    const incoming = itemsRaw.map((item) => normalizeSnapshot(item));

    let added = 0;
    let updated = 0;
    const current = [...this.resumes()];
    for (const snap of incoming) {
      const idx = current.findIndex((r) => r.id === snap.id);
      if (idx >= 0) {
        current[idx] = snap;
        updated++;
      } else {
        current.unshift(snap);
        added++;
      }
    }
    this.resumes.set(current);
    this.persist(current);
    return { added, updated };
  }
}

export function downloadJsonFile(doc: Document, content: string, filename: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
