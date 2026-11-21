import { Component, ElementRef, inject, output, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideSparkles, LucideCheck, LucideArrowLeft, LucideArrowRight, LucidePlus, LucideTrash2 } from '@lucide/angular';
import { ButtonComponent } from '../button/button.component';
import { VaultService } from '../core/vault.service';
import { SavedResumesService } from '../core/saved-resumes.service';
import { AiService } from '../core/ai.service';
import { LayoutService } from '../core/layout.service';
import { MasterVault, emptyVault, formatCategorizedSkillsText, normalizeVault, parseCategorizedSkillsText } from '../core/vault.model';

type OnboardingStep = 'paste' | 'review';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent],
  templateUrl: './onboarding.component.html',
  styleUrl: './onboarding.component.scss',
})
export class OnboardingComponent {
  readonly vs = inject(VaultService);
  private readonly savedResumes = inject(SavedResumesService);
  readonly ai = inject(AiService);
  readonly layout = inject(LayoutService);

  readonly openImportExport = output<void>();
  readonly step = signal<OnboardingStep>('paste');
  readonly rawText = signal('');
  readonly parsing = signal(false);
  readonly error = signal('');
  /** Number of saved resumes found in an imported file (null when nothing was imported). */
  readonly importedResumeCount = signal<number | null>(null);
  private readonly importInput = viewChild<ElementRef<HTMLInputElement>>('vaultImportInput');

  readonly parsingMessages = [
    'Parsing resume structure…',
    'Extracting contact & links…',
    'Organizing work history & roles…',
    'Isolating impact-driven bullets…',
    'Extracting core technical skills…',
    'Finalizing Career Vault…',
  ];

  // Local draft vault during review
  readonly draft = signal<MasterVault>(structuredClone(this.vs.vault()));

  readonly sparklesIcon = LucideSparkles.icon;
  readonly checkIcon = LucideCheck.icon;
  readonly backIcon = LucideArrowLeft.icon;
  readonly arrowRightIcon = LucideArrowRight.icon;
  readonly plusIcon = LucidePlus.icon;
  readonly trashIcon = LucideTrash2.icon;

  async parse(): Promise<void> {
    const text = this.rawText().trim();
    if (!text) {
      this.error.set('Please paste your resume, work history, or exported vault JSON first.');
      return;
    }
    if (text.startsWith('{')) {
      try {
        const parsedJson: unknown = JSON.parse(text);
        if (
          parsedJson &&
          typeof parsedJson === 'object' &&
          ('experience' in parsedJson || 'contact' in parsedJson || 'skills' in parsedJson)
        ) {
          this.draft.set(normalizeVault(parsedJson));
          this.error.set('');
          this.step.set('review');
          return;
        }
      } catch {
        // Not valid JSON — fall through to normal resume text parsing
      }
    }
    this.parsing.set(true);
    this.error.set('');
    try {
      const parsed = await this.ai.parseResume(text, this.vs.vault());
      this.draft.set(parsed);
      this.step.set('review');
    } catch (e) {
      console.warn(e);
      this.error.set('Extraction failed. Please try pasting your resume again.');
    } finally {
      this.parsing.set(false);
    }
  }

  triggerImport(): void {
    this.importInput()?.nativeElement.click();
  }

  async importVaultFile(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const raw = JSON.parse(await file.text()) as Record<string, unknown>;
      if (raw && typeof raw === 'object' && 'vault' in raw && !Array.isArray(raw)) {
        this.draft.set(normalizeVault(raw['vault']));
        if (Array.isArray(raw['savedResumes'])) {
          this.savedResumes.replaceAll(raw['savedResumes']);
          this.importedResumeCount.set(raw['savedResumes'].length);
        } else {
          this.importedResumeCount.set(0);
        }
      } else {
        this.draft.set(normalizeVault(raw));
        this.importedResumeCount.set(0);
      }
      this.error.set('');
      this.step.set('review');
    } catch {
      this.error.set('Could not import vault JSON. Make sure you selected a valid exported vault file.');
    } finally {
      input.value = '';
    }
  }

  async clearAll(): Promise<void> {
    await this.vs.clearAllData();
    this.layout.resetCompletedSteps();
    this.rawText.set('');
    this.importedResumeCount.set(null);
    this.draft.set(emptyVault());
    this.step.set('paste');
  }

  backToPaste(): void {
    this.importedResumeCount.set(null);
    this.step.set('paste');
  }

  addBullet(expIndex: number): void {
    this.draft.update((v) => {
      const copy = structuredClone(v);
      const exp = copy.experience[expIndex];
      if (exp) {
        exp.bullets.push({
          id: `b_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          text: '',
        });
      }
      return copy;
    });
  }

  removeBullet(expIndex: number, bulletIndex: number): void {
    this.draft.update((v) => {
      const copy = structuredClone(v);
      const exp = copy.experience[expIndex];
      if (exp) {
        exp.bullets.splice(bulletIndex, 1);
      }
      return copy;
    });
  }

  readonly formatSkills = formatCategorizedSkillsText;

  setSkills(value: string): void {
    const parsed = parseCategorizedSkillsText(value);
    this.draft.update((v) => {
      const copy = structuredClone(v);
      copy.skills = parsed.skills;
      copy.skillCategories = parsed.skillCategories;
      return copy;
    });
  }

  saveAndProceed(): void {
    this.vs.setVault(this.draft(), true);
    this.vs.completeOnboarding();
    this.layout.markStepCompleted('vault');
    this.layout.setActiveTab('triage');
    this.layout.setTriageCollapsed(false);
  }
}
