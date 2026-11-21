import { TestBed } from '@angular/core/testing';
import { OnboardingComponent } from './onboarding.component';
import { VaultService } from '../core/vault.service';
import { LayoutService } from '../core/layout.service';

describe('OnboardingComponent', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('starts at paste step and advances to review upon parsing', async () => {
    await TestBed.configureTestingModule({ imports: [OnboardingComponent] }).compileComponents();
    const fixture = TestBed.createComponent(OnboardingComponent);
    const comp = fixture.componentInstance;
    fixture.detectChanges();

    expect(comp.step()).toBe('paste');

    comp.rawText.set('Alice Smith\nalice@example.com\n\nExperience\nDeveloper - Startup (2021 - Present)\n- Built apps');
    await comp.parse();

    expect(comp.step()).toBe('review');
    expect(comp.draft().contact.fullName).toBe('Alice Smith');
  });

  it('completes onboarding when saved', async () => {
    await TestBed.configureTestingModule({ imports: [OnboardingComponent] }).compileComponents();
    const fixture = TestBed.createComponent(OnboardingComponent);
    const comp = fixture.componentInstance;
    const vs = TestBed.inject(VaultService);
    const layout = TestBed.inject(LayoutService);
    fixture.detectChanges();

    comp.rawText.set('Jane Doe\njane@example.com');
    await comp.parse();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const linkedinInput = el.querySelector('input[placeholder="linkedin.com/in/username"]') as HTMLInputElement | null;
    expect(linkedinInput).toBeTruthy();

    const primaryBtn = el.querySelector('.review-sticky-footer button.app-button--primary') as HTMLButtonElement | null;
    expect(primaryBtn?.textContent?.trim()).toBe('Save & continue');

    comp.saveAndProceed();

    expect(vs.onboarded()).toBeTrue();
    expect(layout.activeTab()).toBe('triage');
    expect(layout.isStepCompleted('vault')).toBeTrue();
  });

  it('imports pasted exported vault JSON directly into review step', async () => {
    await TestBed.configureTestingModule({ imports: [OnboardingComponent] }).compileComponents();
    const fixture = TestBed.createComponent(OnboardingComponent);
    const comp = fixture.componentInstance;

    const exportedVault = JSON.stringify({
      contact: { fullName: 'Ada Lovelace', email: 'ada@example.com' },
      summary: 'Computing pioneer',
      experience: [],
      education: [],
      certifications: [],
      skills: ['Mathematics', 'Algorithms'],
    });

    comp.rawText.set(exportedVault);
    await comp.parse();

    expect(comp.step()).toBe('review');
    expect(comp.draft().contact.fullName).toBe('Ada Lovelace');
    expect(comp.draft().skills).toEqual(['Mathematics', 'Algorithms']);
  });

  it('imports exported vault JSON file via importVaultFile', async () => {
    await TestBed.configureTestingModule({ imports: [OnboardingComponent] }).compileComponents();
    const fixture = TestBed.createComponent(OnboardingComponent);
    const comp = fixture.componentInstance;

    const file = new File(
      [JSON.stringify({ contact: { fullName: 'Grace Hopper' }, skills: ['COBOL'] })],
      'vault.json',
      { type: 'application/json' },
    );
    const input = { files: [file], value: 'vault.json' } as unknown as HTMLInputElement;
    await comp.importVaultFile({ target: input } as unknown as Event);

    expect(comp.step()).toBe('review');
    expect(comp.draft().contact.fullName).toBe('Grace Hopper');
    expect(comp.draft().skills).toEqual(['COBOL']);
    expect(input.value).toBe('');
  });

  it('imports full backup JSON bundle (vault + savedResumes) via importVaultFile', async () => {
    localStorage.removeItem('ats-resume-builder:saved-resumes');
    await TestBed.configureTestingModule({ imports: [OnboardingComponent] }).compileComponents();
    const fixture = TestBed.createComponent(OnboardingComponent);
    const comp = fixture.componentInstance;

    const bundle = {
      version: 1,
      exportedAt: '2026-11-21T00:00:00.000Z',
      vault: { contact: { fullName: 'Ada Lovelace' }, skills: ['Angular'] },
      savedResumes: [{ id: 'res_1', name: 'Vstorm', savedAt: '2026-11-21T00:00:00.000Z', snapshot: { contact: { fullName: 'Ada Lovelace' } } }],
    };
    const file = new File([JSON.stringify(bundle)], 'backup.json', { type: 'application/json' });
    const input = { files: [file], value: 'backup.json' } as unknown as HTMLInputElement;
    await comp.importVaultFile({ target: input } as unknown as Event);

    expect(comp.step()).toBe('review');
    expect(comp.draft().contact.fullName).toBe('Ada Lovelace');
    expect(comp.draft().skills).toEqual(['Angular']);
    localStorage.removeItem('ats-resume-builder:saved-resumes');
  });
});
