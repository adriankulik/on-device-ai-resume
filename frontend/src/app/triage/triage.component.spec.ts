import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TriageComponent } from './triage.component';
import { VaultService } from '../core/vault.service';
import { ExtensionService } from '../core/extension.service';
import { LayoutService } from '../core/layout.service';
import { AiService } from '../core/ai.service';

describe('TriageComponent', () => {
  let component: TriageComponent;
  let fixture: ComponentFixture<TriageComponent>;
  let vaultService: VaultService;
  let layoutService: LayoutService;
  let extensionService: ExtensionService;
  let aiService: AiService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TriageComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TriageComponent);
    component = fixture.componentInstance;
    vaultService = TestBed.inject(VaultService);
    layoutService = TestBed.inject(LayoutService);
    extensionService = TestBed.inject(ExtensionService);
    aiService = TestBed.inject(AiService);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('starts in hero state with manualMode false', () => {
    expect(component.manualMode()).toBeFalse();
    expect(component.matches().length).toBe(0);
    expect(component.analyzing()).toBeFalse();
  });

  it('toggles manual input textarea', () => {
    expect(component.showManualInput()).toBeFalse();
    component.toggleManualInput();
    expect(component.showManualInput()).toBeTrue();
    component.toggleManualInput();
    expect(component.showManualInput()).toBeFalse();
  });

  it('enters manual mode when continueManually is called without JD', () => {
    vaultService.update((v) => {
      v.experience.push({
        id: 'exp_1',
        role: 'Engineer',
        company: 'Acme',
        startDate: '2022-01',
        endDate: 'Present',
        bullets: [{ id: 'b_101', text: 'Shipped features' }],
      });
    });
    component.continueManually();
    expect(component.manualMode()).toBeTrue();
    expect(vaultService.selectedBulletIds().size).toBeGreaterThan(0);
  });

  it('extracts keywords, tailors matching bullets, and preserves vault summary when continueManually is called with JD', () => {
    vaultService.update((v) => {
      v.experience.push({
        id: 'exp_1',
        role: 'Engineer',
        company: 'Acme',
        startDate: '2022-01',
        endDate: 'Present',
        bullets: [
          { id: 'b_match', text: 'Built Angular and TypeScript frontend applications' },
          { id: 'b_other', text: 'Managed office catering and supplies' },
        ],
      });
    });
    vaultService.selectAll();
    const originalSummary = vaultService.vault().summary;
    component.jd.set('Senior Angular engineer skilled in TypeScript and frontend architecture');
    component.continueManually();

    expect(component.manualMode()).toBeTrue();
    expect(component.keywords().length).toBeGreaterThan(0);
    expect(component.source()).toBe('fallback');
    expect(vaultService.selectedBulletIds().has('b_match')).toBeTrue();
    expect(vaultService.selectedBulletIds().has('b_other')).toBeFalse();
    // Summary was not overwritten by generative AI
    expect(vaultService.tailoredSummary()).toBeNull();
    expect(vaultService.vault().summary).toBe(originalSummary);
  });

  it('auto-runs analyze on paste when JD has sufficient length', (done) => {
    const analyzeSpy = spyOn(component, 'analyze').and.resolveTo();
    component.jd.set('Looking for a Senior TypeScript & Angular Engineer to build scalable apps.');
    component.onJdPaste();
    setTimeout(() => {
      expect(analyzeSpy).toHaveBeenCalled();
      done();
    }, 10);
  });

  it('switches layout tab to preview and marks triage completed when viewPreview is clicked', () => {
    const layoutSpy = spyOn(layoutService, 'setActiveTab');

    component.viewPreview();

    expect(layoutSpy).toHaveBeenCalledWith('preview');
    expect(layoutService.isStepCompleted('triage')).toBeTrue();
  });

  it('switches layout tab to vault when editProfile is called', () => {
    const layoutSpy = spyOn(layoutService, 'setActiveTab');
    component.editProfile();
    expect(layoutSpy).toHaveBeenCalledWith('vault');
  });

  it('extracts directly when user highlighted text', async () => {
    spyOn(extensionService, 'extractFromActiveTab').and.resolveTo({
      text: 'Senior Rust Developer',
      isUserSelection: true,
    });
    const distillSpy = spyOn(aiService, 'distillJobDescription');

    await component.extractFromActiveTab();

    expect(component.jd()).toBe('Senior Rust Developer');
    expect(component.showManualInput()).toBeTrue();
    expect(distillSpy).not.toHaveBeenCalled();
  });

  it('distills job description with AI when page content is extracted and AI is available', async () => {
    spyOn(extensionService, 'extractFromActiveTab').and.resolveTo({
      text: 'Header Nav\nStaff Engineer at Acme Corp\nBuild distributed systems\nFooter',
      isUserSelection: false,
    });
    spyOn(aiService, 'resolveActiveProvider').and.resolveTo({
      id: 'chrome-nano',
      name: 'Mock Provider',
      isAvailable: async () => true,
      generateJson: async <T>() => ({} as unknown as T),
    });
    spyOn(aiService, 'distillJobDescription').and.resolveTo({
      title: 'Staff Engineer',
      company: 'Acme Corp',
      description: 'Staff Engineer at Acme Corp. Build distributed systems.',
    });

    await component.extractFromActiveTab();

    expect(component.jd()).toBe('Staff Engineer at Acme Corp. Build distributed systems.');
    expect(component.showManualInput()).toBeTrue();
  });

  it('sets error message when extraction fails', async () => {
    spyOn(extensionService, 'extractFromActiveTab').and.resolveTo(null);

    await component.extractFromActiveTab();

    expect(component.error()).toContain('Could not extract job description');
  });

  it('resets job and manual mode on resetJob', () => {
    component.jd.set('Some job');
    component.continueManually();
    expect(component.manualMode()).toBeTrue();

    component.resetJob();
    expect(component.jd()).toBe('');
    expect(component.keywords()).toEqual([]);
    expect(component.manualMode()).toBeFalse();
    expect(component.source()).toBeNull();
    expect(vaultService.tailoredSummary()).toBeNull();
  });

  it('shows Enhance with AI button in Keywords & Bullets only when ATS match is below 100%', async () => {
    await vaultService.ready;
    vaultService.update((v) => {
      v.skills = ['TypeScript'];
    });
    const firstSkill = vaultService.vault().skills[0];
    component.keywords.set([firstSkill, 'NonExistentQuantumSkillXYZ']);
    fixture.detectChanges();

    const btnBelow = fixture.nativeElement.querySelector('section[aria-label="ATS keyword match"] .card-head button') as HTMLButtonElement | null;
    expect(btnBelow).toBeTruthy();
    expect(btnBelow?.textContent?.trim()).toBe('Enhance with AI');

    component.keywords.set([firstSkill]);
    fixture.detectChanges();

    const btnFull = fixture.nativeElement.querySelector('section[aria-label="ATS keyword match"] .card-head button');
    expect(btnFull).toBeNull();
  });

  it('enhances summary, skills, and bullet proposals when enhanceMissingKeywords is called', async () => {
    await vaultService.ready;
    vaultService.update((v) => {
      v.experience.push({
        id: 'exp_1',
        role: 'Engineer',
        company: 'Acme',
        startDate: '2022-01',
        endDate: 'Present',
        bullets: [{ id: 'b_101', text: 'Built TypeScript services' }],
      });
      v.skills = ['TypeScript'];
    });
    const firstSkill = vaultService.vault().skills[0];
    component.jd.set('Looking for Kubernetes and GraphQL experience');
    component.keywords.set([firstSkill, 'Kubernetes', 'GraphQL']);
    fixture.detectChanges();

    const enhanceSpy = spyOn(aiService, 'enhanceWithMissingKeywords').and.resolveTo({
      summary: 'Enhanced summary with Kubernetes and GraphQL.',
      proposedBullets: ['Deployed microservices on Kubernetes with GraphQL APIs.'],
      suggestedSkills: ['Kubernetes', 'GraphQL'],
    });

    await component.enhanceMissingKeywords();
    fixture.detectChanges();

    expect(enhanceSpy).toHaveBeenCalled();
    expect(vaultService.tailoredSummary()).toBe('Enhanced summary with Kubernetes and GraphQL.');
    expect(vaultService.tailoredSkills()).toContain('Kubernetes');
    expect(vaultService.tailoredSkills()).toContain('GraphQL');
    expect(component.aiAddedSkills()).toEqual(['Kubernetes', 'GraphQL']);
    const addedBanner = fixture.nativeElement.querySelector('.ai-added-skills');
    expect(addedBanner?.textContent).toContain('Added by AI:');
    expect(addedBanner?.textContent).toContain('Kubernetes');
    expect(addedBanner?.textContent).toContain('GraphQL');
    const firstExpId = vaultService.vault().experience[0].id;
    expect(component.proposals()[firstExpId]).toEqual(['Deployed microservices on Kubernetes with GraphQL APIs.']);
    expect(component.matchedCount()).toBe(component.matches().length);
  });

  it('counts keywords covered in certifications toward ATS match', async () => {
    await vaultService.ready;
    vaultService.update((v) => {
      v.certifications.push({
        id: 'cert_1',
        name: 'AWS Certified Solutions Architect',
        issuer: 'Amazon Web Services',
        year: '2024',
      });
    });
    component.keywords.set(['AWS']);
    fixture.detectChanges();

    expect(component.matches()[0].inCerts).toBeTrue();
    expect(component.matchedCount()).toBe(1);
    expect(component.uncoveredKeywords()).toEqual([]);
  });

  it('marks triage step completed after extracting job description from active tab', async () => {
    spyOn(extensionService, 'extractFromActiveTab').and.resolveTo({
      text: 'Senior Angular Developer with TypeScript experience',
      isUserSelection: true,
    });

    await component.extractFromActiveTab();

    expect(component.jd()).toBe('Senior Angular Developer with TypeScript experience');
    expect(layoutService.isStepCompleted('triage')).toBeTrue();
  });

  it('keeps Enhance with AI label and shows spinner while enhancing', async () => {
    await vaultService.ready;
    vaultService.update((v) => {
      v.skills = ['TypeScript'];
    });
    component.keywords.set(['TypeScript', 'Rust']);
    component.enhancing.set(true);
    fixture.detectChanges();

    const btn = fixture.nativeElement.querySelector('section[aria-label="ATS keyword match"] .card-head button') as HTMLButtonElement | null;
    expect(btn).toBeTruthy();
    expect(btn?.textContent?.trim()).toBe('Enhance with AI');
    expect(btn?.querySelector('.app-button__icon--spin')).toBeTruthy();
  });

  it('adds a missing keyword to vault and tailored skills when Add to skills is clicked', async () => {
    await vaultService.ready;
    vaultService.update((v) => {
      v.skills = ['TypeScript'];
      v.skillCategories = [{ category: 'Frontend', skills: ['TypeScript'] }];
    });
    vaultService.tailoredSkills.set(['TypeScript']);
    component.keywords.set(['TypeScript', 'Docker']);
    fixture.detectChanges();

    const addBtn = fixture.nativeElement.querySelector('button[aria-label="Add Docker to skills"]') as HTMLButtonElement | null;
    expect(addBtn).toBeTruthy();
    addBtn?.click();
    fixture.detectChanges();

    expect(vaultService.vault().skills).toContain('Docker');
    expect(vaultService.vault().skillCategories.find((c) => c.category === 'Cloud')?.skills).toContain('Docker');
    expect(vaultService.tailoredSkills()).toContain('Docker');
    expect(component.matches().find((m) => m.keyword === 'Docker')?.inSkills).toBeTrue();
  });

  it('clears previously loaded snapshot experience on analyze so positions are not duplicated', async () => {
    await vaultService.ready;
    vaultService.update((v) => {
      v.experience = [
        {
          id: 'exp_1',
          role: 'Staff Engineer',
          company: 'Acme',
          startDate: '2022-01',
          endDate: 'Present',
          bullets: [{ id: 'b_1', text: 'Led Angular architecture' }],
        },
      ];
      v.skills = ['Angular'];
    });
    vaultService.loadResumeSnapshot({
      contact: vaultService.vault().contact,
      summary: 'Old snapshot summary',
      experience: structuredClone(vaultService.vault().experience),
      education: [],
      certifications: [],
      skills: ['Angular'],
      settings: vaultService.vault().settings,
    });
    spyOn(aiService, 'triage').and.resolveTo({
      selectedBulletIds: ['b_1'],
      extractedKeywords: ['Angular'],
      relevantSkills: ['Angular'],
      summary: 'New tailored summary',
      source: 'fallback',
    });

    component.jd.set('Looking for a Staff Engineer skilled in Angular.');
    await component.analyze();

    expect(vaultService.resumeOnlyExperience()).toEqual([]);
    expect(vaultService.selectedExperience().map((e) => e.id)).toEqual(['exp_1']);
  });
});
