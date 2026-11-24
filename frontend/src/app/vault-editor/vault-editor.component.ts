import { DOCUMENT } from '@angular/common';
import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StorageService } from '../core/storage.service';
import { VaultService } from '../core/vault.service';
import { AiService } from '../core/ai.service';
import { SavedResumeSnapshot, SavedResumesService } from '../core/saved-resumes.service';
import { exportVaultBackup, importVaultBackupText } from '../core/backup.util';
import { formatCategorizedSkillsText, groupSkillsByCategory, parseCategorizedSkillsText } from '../core/vault.model';
import { ButtonComponent } from '../button/button.component';
import { ModalComponent } from '../modal/modal.component';
import { CollapsibleComponent } from '../collapsible/collapsible.component';
import { LucideArrowDown, LucideArrowDownToLine, LucideArrowRight, LucideArrowUp, LucideArrowUpToLine, LucideX } from '@lucide/angular';
import { LayoutService } from '../core/layout.service';
import { ExtensionService } from '../core/extension.service';

export type EditorDialog =
  | 'backup'
  | 'summary'
  | 'experience'
  | 'education'
  | 'certifications'
  | 'skills'
  | 'confirm-reset';

const MAX_PHOTO_PX = 400;
const RAW_KEY = 'raw-resume-text';

@Component({
  selector: 'app-vault-editor',
  standalone: true,
  imports: [FormsModule, ModalComponent, ButtonComponent, CollapsibleComponent],
  templateUrl: './vault-editor.component.html',
})
export class VaultEditorComponent {
  readonly vs = inject(VaultService);
  readonly savedResumes = inject(SavedResumesService);
  readonly ai = inject(AiService);
  private readonly doc = inject(DOCUMENT);
  private readonly storage = inject(StorageService);
  readonly layout = inject(LayoutService);
  readonly ext = inject(ExtensionService);
  readonly arrowRightIcon = LucideArrowRight.icon;
  readonly upIcon = LucideArrowUp.icon;
  readonly downIcon = LucideArrowDown.icon;
  readonly topIcon = LucideArrowUpToLine.icon;
  readonly bottomIcon = LucideArrowDownToLine.icon;

  readonly dialog = signal<EditorDialog | null>(null);
  readonly removeIcon = LucideX.icon;
  readonly parseOpen = signal(this.vs.pristine());
  /** Pasted resume text; persisted (localStorage) until it has been parsed into the vault. */
  readonly rawText = signal('');
  readonly message = signal<{ kind: 'ok' | 'error'; text: string } | null>(null);
  readonly parsing = signal(false);

  readonly parsingMessages = [
    'Parsing resume structure…',
    'Extracting contact & links…',
    'Organizing work history & roles…',
    'Isolating impact-driven bullets…',
    'Extracting core technical skills…',
    'Finalizing Career Vault…',
  ];
  private readonly importInput = viewChild<ElementRef<HTMLInputElement>>('importInput');

  constructor() {
    this.storage.get<string>(RAW_KEY).then((t) => {
      if (t && !this.rawText()) this.rawText.set(t);
    });
  }

  setRawText(value: string): void {
    this.rawText.set(value);
    this.storage.set(RAW_KEY, value).catch(() => undefined);
  }

  setLinks(value: string): void {
    this.vs.vault().contact.links = value.split(',').map((s) => s.trim()).filter(Boolean);
    this.vs.touch();
  }

  readonly formatSkills = formatCategorizedSkillsText;
  readonly groupSkills = groupSkillsByCategory;

  setSkills(value: string): void {
    const parsed = parseCategorizedSkillsText(value);
    this.vs.vault().skills = parsed.skills;
    this.vs.vault().skillCategories = parsed.skillCategories;
    this.vs.tailoredSkills.set(null);
    this.vs.tailoredSkillCategories.set(null);
    this.vs.touch();
  }

  setSummary(value: string): void {
    this.vs.vault().summary = value;
    this.vs.tailoredSummary.set(null);
    this.vs.touch();
  }

  get bulletCount(): number {
    return this.vs.vault().experience.reduce((n, e) => n + e.bullets.length, 0);
  }

  continueToJobMatch(): void {
    this.layout.markStepCompleted('vault');
    this.layout.setActiveTab('triage');
    this.layout.setTriageCollapsed(false);
  }

  async onPhoto(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const dataUrl = await this.readAsDataUrl(file);
      this.vs.vault().contact.photoDataUrl = await this.downscale(dataUrl);
      this.vs.touch();
    } catch {
      this.flash('error', 'Could not read that image.');
    }
  }

  removePhoto(): void {
    this.vs.vault().contact.photoDataUrl = '';
    this.vs.touch();
  }

  private readAsDataUrl(file: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  }

  /** Shrinks big photos so the vault stays small; falls back to the original on failure. */
  private downscale(dataUrl: string): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_PHOTO_PX / Math.max(img.width, img.height));
        if (scale === 1 && dataUrl.length < 300_000) return resolve(dataUrl);
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  async parseRaw(): Promise<void> {
    const text = this.rawText().trim();
    if (!text) return;
    this.parsing.set(true);
    try {
      const v = await this.ai.parseResume(text, this.vs.vault());
      this.vs.setVault(v, true);
      this.rawText.set('');
      this.parseOpen.set(false);
      this.storage.delete(RAW_KEY).catch(() => undefined);
      this.flash('ok', 'Resume parsed. Please review every field.');
    } catch (e) {
      console.warn(e);
      this.flash('error', 'AI parsing failed. Check that Chrome built-in AI is available, or enter data manually.');
    } finally {
      this.parsing.set(false);
    }
  }

  exportVault(): void {
    exportVaultBackup(this.doc, this.vs.vault(), this.savedResumes.resumes());
  }

  async importVault(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      this.handleJsonImportText(await file.text());
    } catch {
      this.flash('error', 'Invalid backup JSON file.');
    }
  }

  handleJsonImportText(text: string): void {
    const msg = importVaultBackupText(text, this.vs, this.savedResumes);
    this.dialog.set(null);
    this.flash('ok', msg);
  }

  triggerImport(): void {
    this.importInput()?.nativeElement.click();
  }

  async executeClearAll(): Promise<void> {
    await this.vs.clearAllData();
    this.layout.resetCompletedSteps();
    this.dialog.set(null);
    this.rawText.set('');
  }

  private flash(kind: 'ok' | 'error', text: string): void {
    this.message.set({ kind, text });
    setTimeout(() => this.message.set(null), 6000);
  }

  loadPreviousResume(item: SavedResumeSnapshot): void {
    this.vs.loadResumeSnapshot(item.snapshot);
    this.savedResumes.activeSnapshotId.set(item.id);
    this.layout.setActiveTab('preview');
  }

  deletePreviousResume(id: string): void {
    this.savedResumes.deleteSnapshot(id);
    if (this.savedResumes.activeSnapshotId() === id) {
      this.savedResumes.activeSnapshotId.set(null);
    }
  }
}
