import { DOCUMENT } from '@angular/common';
import { Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { LucideArrowUpDown, LucideCheck, LucideChevronsRight, LucideDynamicIcon, LucideInfo } from '@lucide/angular';
import { ButtonComponent } from './button/button.component';
import { LayoutService, WorkspaceTab } from './core/layout.service';
import { AiService } from './core/ai.service';
import { ExtensionService } from './core/extension.service';
import { VaultService } from './core/vault.service';
import { SavedResumeSnapshot, SavedResumesService } from './core/saved-resumes.service';
import { exportVaultBackup, importVaultBackupText } from './core/backup.util';
import { VaultEditorComponent } from './vault-editor/vault-editor.component';
import { TriageComponent } from './triage/triage.component';
import { ThemeToggleComponent } from './theme/theme-toggle.component';
import { PreviewComponent } from './preview/preview.component';
import { OnboardingComponent } from './onboarding/onboarding.component';
import { ModalComponent } from './modal/modal.component';
import { AiSettingsComponent } from './ai-settings/ai-settings.component';
import { AiLozengeComponent } from './ai-lozenge/ai-lozenge.component';
import { AboutComponent } from './about/about.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    VaultEditorComponent,
    TriageComponent,
    PreviewComponent,
    ThemeToggleComponent,
    ButtonComponent,
    OnboardingComponent,
    ModalComponent,
    AiSettingsComponent,
    AiLozengeComponent,
    AboutComponent,
    LucideDynamicIcon,
  ],
  templateUrl: './app.component.html',
})
export class AppComponent implements OnInit {
  readonly vs = inject(VaultService);
  readonly savedResumes = inject(SavedResumesService);
  private readonly doc = inject(DOCUMENT);
  readonly ai = inject(AiService);
  readonly ext = inject(ExtensionService);
  readonly layout = inject(LayoutService);
  readonly checkIcon = LucideCheck.icon;
  readonly expandIcon = LucideChevronsRight.icon;
  readonly infoIcon = LucideInfo.icon;
  readonly backupIcon = LucideArrowUpDown.icon;
  readonly tab = this.layout.activeTab;
  readonly aiSettingsOpen = signal(false);
  readonly aboutOpen = signal(false);
  readonly backupOpen = signal(false);
  readonly backupMsg = signal<{ kind: 'ok' | 'error'; text: string } | null>(null);
  readonly vaultSummary = computed(() => {
    const v = this.vs.vault();
    const hasData = Boolean(
      v.contact.fullName.trim() ||
        v.summary.trim() ||
        v.experience.length ||
        v.skills.length ||
        v.education.length ||
        v.certifications.length,
    );
    return {
      hasData,
      name: v.contact.fullName.trim(),
      rolesCount: v.experience.length,
      skillsCount: v.skills.length,
    };
  });
  readonly headerImportInput = viewChild<ElementRef<HTMLInputElement>>('headerImportInput');

  loadSavedResume(item: SavedResumeSnapshot): void {
    this.vs.loadResumeSnapshot(item.snapshot);
    this.savedResumes.activeSnapshotId.set(item.id);
    this.layout.setActiveTab('preview');
    this.backupOpen.set(false);
  }

  exportAll(): void {
    exportVaultBackup(this.doc, this.vs.vault(), this.savedResumes.resumes());
  }

  triggerHeaderImport(): void {
    this.headerImportInput()?.nativeElement.click();
  }

  async importAll(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const msg = importVaultBackupText(await file.text(), this.vs, this.savedResumes);
      this.backupMsg.set({ kind: 'ok', text: msg });
    } catch {
      this.backupMsg.set({ kind: 'error', text: 'Invalid backup JSON file.' });
    }
  }

  readonly closeAiSettings = (): void => {
    this.aiSettingsOpen.set(false);
  };

  readonly tabs: { id: WorkspaceTab; label: string }[] = [
    { id: 'vault', label: '1. Vault' },
    { id: 'triage', label: '2. Job match' },
    { id: 'preview', label: '3. Preview' },
  ];

  isStepCompleted(id: WorkspaceTab): boolean {
    return this.layout.isStepCompleted(id) || (id === 'vault' && this.vs.onboarded());
  }

  ngOnInit(): void {
    if (typeof window === 'undefined') return;

    try {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam === 'triage' || tabParam === 'vault' || tabParam === 'preview') {
        this.layout.setActiveTab(tabParam);
      }

      if (params.has('print')) {
        this.layout.setActiveTab('preview');
        // Wait for preview stage and font rendering to stabilize before printing
        setTimeout(() => {
          this.ext.exportPdf(this.vs.vault().contact.fullName);
          if (typeof window !== 'undefined') {
            window.addEventListener(
              'afterprint',
              () => {
                window.close();
              },
              { once: true },
            );
          }
        }, 500);
      }
    } catch {
      // URL parsing fallback
    }
  }
}
