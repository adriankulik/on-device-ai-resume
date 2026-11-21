import { TestBed } from '@angular/core/testing';
import { VaultEditorComponent } from './vault-editor.component';
import { VaultService } from '../core/vault.service';
import { LayoutService } from '../core/layout.service';

describe('VaultEditorComponent', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('creates and can trigger clearAllData', async () => {
    await TestBed.configureTestingModule({ imports: [VaultEditorComponent] }).compileComponents();
    const fixture = TestBed.createComponent(VaultEditorComponent);
    const comp = fixture.componentInstance;
    const vs = TestBed.inject(VaultService);
    await vs.ready;
    vs.completeOnboarding();
    expect(vs.onboarded()).toBeTrue();

    await comp.executeClearAll();
    expect(vs.onboarded()).toBeFalse();
    expect(comp.dialog()).toBeNull();
  });

  it('renders continue and backup actions in vault-head__actions container without collapse chevrons', async () => {
    await TestBed.configureTestingModule({ imports: [VaultEditorComponent] }).compileComponents();
    const fixture = TestBed.createComponent(VaultEditorComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const actions = el.querySelector('.vault-head__actions');
    expect(actions).toBeTruthy();
    const buttons = actions?.querySelectorAll('button');
    expect(buttons?.length).toBe(2);
    expect(actions?.querySelector('.collapse-btn')).toBeFalsy();
    expect(el.textContent).toContain('Continue to Job Match');
  });

  it('switches layout to triage tab and uncollapses triage on continueToJobMatch', async () => {
    await TestBed.configureTestingModule({ imports: [VaultEditorComponent] }).compileComponents();
    const fixture = TestBed.createComponent(VaultEditorComponent);
    const comp = fixture.componentInstance;
    const layout = TestBed.inject(LayoutService);
    const tabSpy = spyOn(layout, 'setActiveTab');
    const collapseSpy = spyOn(layout, 'setTriageCollapsed');

    comp.continueToJobMatch();
    expect(tabSpy).toHaveBeenCalledWith('triage');
    expect(collapseSpy).toHaveBeenCalledWith(false);
  });

  it('uses local photo wording instead of upload wording and includes a LinkedIn input', async () => {
    await TestBed.configureTestingModule({ imports: [VaultEditorComponent] }).compileComponents();
    const fixture = TestBed.createComponent(VaultEditorComponent);
    const vs = TestBed.inject(VaultService);
    await vs.ready;
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Add photo');
    expect(el.textContent).not.toContain('Upload photo');

    const linkedinInput = el.querySelector('input[placeholder="linkedin.com/in/username"]') as HTMLInputElement;
    expect(linkedinInput).toBeTruthy();
  });

  it('renders a Save button in the modal footer for summary, experience, education, and skills popups', async () => {
    await TestBed.configureTestingModule({ imports: [VaultEditorComponent] }).compileComponents();
    const fixture = TestBed.createComponent(VaultEditorComponent);
    const comp = fixture.componentInstance;
    const vs = TestBed.inject(VaultService);
    await vs.ready;

    for (const kind of ['summary', 'experience', 'education', 'certifications', 'skills'] as const) {
      comp.dialog.set(kind);
      fixture.detectChanges();

      const footerBtn = fixture.nativeElement.querySelector('.modal__footer button.app-button--primary') as HTMLButtonElement | null;
      expect(footerBtn).withContext(`Save button for ${kind}`).toBeTruthy();
      expect(footerBtn?.textContent?.trim()).toBe('Save');

      footerBtn?.click();
      fixture.detectChanges();
      expect(comp.dialog()).withContext(`dialog closed after Save for ${kind}`).toBeNull();
    }
  });

  it('commits skills when clicking Save in Edit skills modal', async () => {
    await TestBed.configureTestingModule({ imports: [VaultEditorComponent] }).compileComponents();
    const fixture = TestBed.createComponent(VaultEditorComponent);
    const comp = fixture.componentInstance;
    const vs = TestBed.inject(VaultService);
    await vs.ready;

    comp.dialog.set('skills');
    fixture.detectChanges();

    const textarea = fixture.nativeElement.querySelector('app-modal textarea') as HTMLTextAreaElement;
    textarea.value = 'TypeScript, Angular, Testing';
    const saveBtn = fixture.nativeElement.querySelector('.modal__footer button') as HTMLButtonElement;
    saveBtn.click();
    fixture.detectChanges();

    expect(vs.vault().skills).toEqual(['TypeScript', 'Angular', 'Testing']);
    expect(comp.dialog()).toBeNull();
  });

  it('renders + Add role and + Add education as secondary buttons inside .row.wrap', async () => {
    await TestBed.configureTestingModule({ imports: [VaultEditorComponent] }).compileComponents();
    const fixture = TestBed.createComponent(VaultEditorComponent);
    const comp = fixture.componentInstance;
    const vs = TestBed.inject(VaultService);
    await vs.ready;

    comp.dialog.set('experience');
    fixture.detectChanges();
    const addRoleBtn = fixture.nativeElement.querySelector('.modal__body .row.wrap button.app-button--secondary') as HTMLButtonElement | null;
    expect(addRoleBtn?.textContent?.trim()).toBe('+ Add role');

    comp.dialog.set('education');
    fixture.detectChanges();
    const addEduBtn = fixture.nativeElement.querySelector('.modal__body .row.wrap button.app-button--secondary') as HTMLButtonElement | null;
    expect(addEduBtn?.textContent?.trim()).toBe('+ Add education');

    comp.dialog.set('certifications');
    fixture.detectChanges();
    const addCertBtn = fixture.nativeElement.querySelector('.modal__body .row.wrap button.app-button--secondary') as HTMLButtonElement | null;
    expect(addCertBtn?.textContent?.trim()).toBe('+ Add certification');
  });

  it('reorders experience roles and bullets via moveExperience and moveBullet', async () => {
    await TestBed.configureTestingModule({ imports: [VaultEditorComponent] }).compileComponents();
    const fixture = TestBed.createComponent(VaultEditorComponent);
    const comp = fixture.componentInstance;
    const vs = TestBed.inject(VaultService);
    await vs.ready;

    vs.update((v) => {
      v.experience = [
        {
          id: 'exp_1',
          role: 'First Role',
          company: 'A',
          startDate: '2020-01',
          endDate: '2021-01',
          bullets: [
            { id: 'b_1', text: 'Bullet 1' },
            { id: 'b_2', text: 'Bullet 2' },
          ],
        },
        {
          id: 'exp_2',
          role: 'Second Role',
          company: 'B',
          startDate: '2022-01',
          endDate: 'Present',
          bullets: [],
        },
      ];
    });

    comp.dialog.set('experience');
    fixture.detectChanges();

    const moveRoleDownBtn = fixture.nativeElement.querySelector('button[aria-label="Move role exp_1 down"]') as HTMLButtonElement | null;
    expect(moveRoleDownBtn).toBeTruthy();
    moveRoleDownBtn?.click();
    expect(vs.vault().experience.map((e) => e.id)).toEqual(['exp_2', 'exp_1']);

    const moveBulletUpBtn = fixture.nativeElement.querySelector('button[aria-label="Move bullet b_2 up"]') as HTMLButtonElement | null;
    expect(moveBulletUpBtn).toBeTruthy();
    moveBulletUpBtn?.click();
    expect(vs.vault().experience[1].bullets.map((b) => b.id)).toEqual(['b_2', 'b_1']);
  });

  it('imports a full backup JSON containing both Career Vault and all saved resumes', async () => {
    localStorage.removeItem('ats-resume-builder:saved-resumes');
    const vs = TestBed.inject(VaultService);
    await vs.ready;

    const fixture = TestBed.createComponent(VaultEditorComponent);
    const comp = fixture.componentInstance;
    await comp.savedResumes.ready;

    const fullBackup = JSON.stringify({
      version: 1,
      exportedAt: '2026-11-21T00:00:00.000Z',
      vault: {
        contact: { fullName: 'Ada Lovelace', email: '', phone: '', location: '', linkedin: '', github: '', links: [], photoDataUrl: '' },
        summary: 'Full backup vault summary',
        experience: [],
        education: [],
        certifications: [],
        skills: ['TypeScript'],
      },
      savedResumes: [
        {
          id: 'res_test_1',
          name: 'Acme — Staff Engineer',
          savedAt: '2026-11-21T00:00:00.000Z',
          snapshot: {
            contact: { fullName: 'Ada Lovelace' },
            summary: 'Snapshot summary',
            experience: [],
            education: [],
            certifications: [],
            skills: ['TypeScript'],
          },
        },
      ],
    });

    comp.handleJsonImportText(fullBackup);
    expect(vs.vault().summary).toBe('Full backup vault summary');
    expect(vs.vault().contact.fullName).toBe('Ada Lovelace');
    expect(comp.savedResumes.resumes().length).toBe(1);
    expect(comp.savedResumes.resumes()[0].name).toBe('Acme — Staff Engineer');
    localStorage.removeItem('ats-resume-builder:saved-resumes');
  });
});
