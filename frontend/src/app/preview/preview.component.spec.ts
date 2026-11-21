import { TestBed } from '@angular/core/testing';
import { PreviewComponent } from './preview.component';
import { VaultService } from '../core/vault.service';

describe('PreviewComponent', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('adds a bullet to the resume and prompts to update the source of truth', async () => {
    await TestBed.configureTestingModule({ imports: [PreviewComponent] }).compileComponents();
    const fixture = TestBed.createComponent(PreviewComponent);
    const comp = fixture.componentInstance;
    const vs = TestBed.inject(VaultService);
    await vs.ready;
    vs.update((v) => {
      v.experience.push({
        id: 'exp_1',
        role: 'Engineer',
        company: 'Acme',
        startDate: '2022-01',
        endDate: 'Present',
        bullets: [{ id: 'b_101', text: 'Shipped features' }],
      });
    });

    const expId = vs.vault().experience[0].id;
    const initialVaultBulletCount = vs.vault().experience[0].bullets.length;

    comp.toggleEditMode();
    comp.setBulletDraft(expId, 'Built visual resume editor');
    comp.addResumeBullet(expId);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Built visual resume editor');
    expect(comp.pendingVaultPrompt()).toBeTruthy();
    expect(el.querySelector('.vault-sync-banner')?.textContent).toContain('Master Career Vault');

    // Keep for this resume only: vault remains unchanged
    comp.dismissVaultPrompt();
    fixture.detectChanges();
    expect(comp.pendingVaultPrompt()).toBeNull();
    expect(vs.vault().experience[0].bullets.length).toBe(initialVaultBulletCount);
    expect(el.textContent).toContain('Built visual resume editor');
  });

  it('updates the Master Career Vault when user confirms the source-of-truth prompt', async () => {
    await TestBed.configureTestingModule({ imports: [PreviewComponent] }).compileComponents();
    const fixture = TestBed.createComponent(PreviewComponent);
    const comp = fixture.componentInstance;
    const vs = TestBed.inject(VaultService);
    await vs.ready;

    const initialSkillCount = vs.vault().skills.length;

    comp.toggleEditMode();
    comp.newSkill.set('Playwright');
    comp.addResumeSkill();
    fixture.detectChanges();

    expect(comp.skills()).toContain('Playwright');
    expect(vs.vault().skills.length).toBe(initialSkillCount);

    comp.confirmVaultPrompt();
    fixture.detectChanges();

    expect(comp.pendingVaultPrompt()).toBeNull();
    expect(vs.vault().skills).toContain('Playwright');
  });

  it('deletes items from the resume without deleting them from the Master Career Vault', async () => {
    await TestBed.configureTestingModule({ imports: [PreviewComponent] }).compileComponents();
    const fixture = TestBed.createComponent(PreviewComponent);
    const comp = fixture.componentInstance;
    const vs = TestBed.inject(VaultService);
    await vs.ready;
    vs.update((v) => {
      v.experience.push({
        id: 'exp_1',
        role: 'Engineer',
        company: 'Acme',
        startDate: '2022-01',
        endDate: 'Present',
        bullets: [{ id: 'b_101', text: 'Shipped features' }],
      });
      v.education.push({
        id: 'edu_1',
        degree: 'B.Sc. CS',
        institution: 'State University',
        year: '2020',
      });
    });

    const exp = vs.vault().experience[0];
    const bulletId = exp.bullets[0].id;
    const eduId = vs.vault().education[0].id;

    comp.removeResumeBullet(exp.id, bulletId);
    comp.removeResumeEducation(eduId);
    fixture.detectChanges();

    expect(vs.selectedBulletIds().has(bulletId)).toBeFalse();
    expect(vs.vault().experience[0].bullets.some((b) => b.id === bulletId)).toBeTrue();
    expect(vs.visibleEducation().some((e) => e.id === eduId)).toBeFalse();
    expect(vs.vault().education.some((e) => e.id === eduId)).toBeTrue();
  });

  it('uses local photo wording when no photo is set', async () => {
    await TestBed.configureTestingModule({ imports: [PreviewComponent] }).compileComponents();
    const fixture = TestBed.createComponent(PreviewComponent);
    const vs = TestBed.inject(VaultService);
    await vs.ready;
    vs.vault().contact.photoDataUrl = '';
    vs.touch();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Add a photo in the vault first');
    expect(el.textContent).not.toContain('Upload a photo in the vault first');
  });

  it('renders the LinkedIn link when provided and omits it when empty', async () => {
    await TestBed.configureTestingModule({ imports: [PreviewComponent] }).compileComponents();
    const fixture = TestBed.createComponent(PreviewComponent);
    const vs = TestBed.inject(VaultService);
    await vs.ready;

    vs.vault().contact.linkedin = 'https://linkedin.com/in/janedoe';
    vs.touch();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    let liLink = el.querySelector('a.r-contact__link--linkedin') as HTMLAnchorElement | null;
    expect(liLink).toBeTruthy();
    expect(liLink?.getAttribute('href')).toBe('https://linkedin.com/in/janedoe');
    expect(liLink?.textContent).toContain('/in/janedoe');

    vs.vault().contact.linkedin = '   ';
    vs.touch();
    fixture.detectChanges();

    liLink = el.querySelector('a.r-contact__link--linkedin');
    expect(liLink).toBeNull();
  });

  it('renders the GitHub link with /{username} display and full href', async () => {
    await TestBed.configureTestingModule({ imports: [PreviewComponent] }).compileComponents();
    const fixture = TestBed.createComponent(PreviewComponent);
    const vs = TestBed.inject(VaultService);
    await vs.ready;

    vs.vault().contact.github = 'janedoe';
    vs.touch();
    fixture.detectChanges();

    const ghLink = fixture.nativeElement.querySelector('a.r-contact__link--github') as HTMLAnchorElement | null;
    expect(ghLink).toBeTruthy();
    expect(ghLink?.getAttribute('href')).toBe('https://github.com/janedoe');
    expect(ghLink?.textContent).toContain('/janedoe');
  });

  it('shows or hides certification dates based on showCertificationDates setting', async () => {
    await TestBed.configureTestingModule({ imports: [PreviewComponent] }).compileComponents();
    const fixture = TestBed.createComponent(PreviewComponent);
    const comp = fixture.componentInstance;
    const vs = TestBed.inject(VaultService);
    await vs.ready;

    vs.update((v) => {
      v.certifications.push({
        id: 'cert_1',
        name: 'AWS Solutions Architect',
        issuer: 'Amazon Web Services',
        year: '2024',
      });
    });
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.r-certs')?.textContent).toContain('(2024)');

    comp.set('showCertificationDates', false);
    fixture.detectChanges();

    expect(el.querySelector('.r-certs')?.textContent).not.toContain('(2024)');
    expect(el.querySelector('.r-certs')?.textContent).toContain('AWS Solutions Architect');
  });

  it('renders markdown links in experience bullets as clickable anchor tags', async () => {
    await TestBed.configureTestingModule({ imports: [PreviewComponent] }).compileComponents();
    const fixture = TestBed.createComponent(PreviewComponent);
    const vs = TestBed.inject(VaultService);
    await vs.ready;

    vs.update((v) => {
      v.experience.push({
        id: 'exp_1',
        role: 'Maintainer',
        company: 'Self-employment',
        startDate: '2020-01',
        endDate: 'Present',
        bullets: [
          {
            id: 'b_101',
            text: '[kmd-labs/design-system](https://github.com/kmd-labs/design-system): Unified Angular design system.',
          },
        ],
      });
    });
    vs.selectAll();
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('a.r-bullet-link') as HTMLAnchorElement | null;
    expect(link).toBeTruthy();
    expect(link?.textContent?.trim()).toBe('kmd-labs/design-system');
    expect(link?.getAttribute('href')).toBe('https://github.com/kmd-labs/design-system');
  });

  it('edits role title, company, dates, and existing bullets in edit mode', async () => {
    await TestBed.configureTestingModule({ imports: [PreviewComponent] }).compileComponents();
    const fixture = TestBed.createComponent(PreviewComponent);
    const comp = fixture.componentInstance;
    const vs = TestBed.inject(VaultService);
    await vs.ready;

    vs.update((v) => {
      v.experience.push({
        id: 'exp_1',
        role: 'Junior Dev',
        company: 'OldCorp',
        startDate: '2020-01',
        endDate: '2021-01',
        bullets: [{ id: 'b_1', text: 'Original bullet' }],
      });
    });
    vs.selectAll();
    comp.editMode.set(true);
    fixture.detectChanges();

    comp.startEditRole(vs.vault().experience[0]);
    comp.updateRoleDraftField('role', 'Senior Dev');
    comp.updateRoleDraftField('company', 'NewCorp');
    comp.updateRoleDraftField('startDate', '2021-02');
    comp.updateRoleDraftField('endDate', 'Present');
    comp.saveRoleEdit();

    const updatedRole = vs.vault().experience[0];
    expect(updatedRole.role).toBe('Senior Dev');
    expect(updatedRole.company).toBe('NewCorp');
    expect(updatedRole.startDate).toBe('2021-02');
    expect(updatedRole.endDate).toBe('Present');

    comp.startEditBullet('exp_1', updatedRole.bullets[0]);
    comp.bulletEditDraft.set('Updated bullet text');
    comp.saveBulletEdit();

    expect(vs.selectedExperience()[0].bullets[0].text).toBe('Updated bullet text');
    expect(vs.vault().experience[0].bullets[0].text).toBe('Original bullet');
    expect(comp.pendingVaultPrompt()?.label).toBe('bullet point edit');

    comp.confirmVaultPrompt();
    expect(vs.vault().experience[0].bullets[0].text).toBe('Updated bullet text');
    expect(comp.pendingVaultPrompt()).toBeNull();
  });

  it('shows A4 page break visualiser in edit mode only when 1-page enforcer is enabled', async () => {
    await TestBed.configureTestingModule({ imports: [PreviewComponent] }).compileComponents();
    const fixture = TestBed.createComponent(PreviewComponent);
    const comp = fixture.componentInstance;
    const vs = TestBed.inject(VaultService);
    await vs.ready;

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.r-page-break')).toBeNull();

    comp.editMode.set(true);
    comp.set('strictOnePage', true);
    fixture.detectChanges();
    expect(el.querySelector('.r-page-break')).toBeTruthy();

    comp.set('strictOnePage', false);
    fixture.detectChanges();
    expect(el.querySelector('.r-page-break')).toBeNull();
  });

  it('supports switching unit system, paper size presets (US/Europe), and margin presets', async () => {
    await TestBed.configureTestingModule({ imports: [PreviewComponent] }).compileComponents();
    const fixture = TestBed.createComponent(PreviewComponent);
    const comp = fixture.componentInstance;
    const vs = TestBed.inject(VaultService);
    await vs.ready;
    fixture.detectChanges();

    const sheet = fixture.nativeElement.querySelector('.sheet') as HTMLElement;
    expect(sheet.style.width).toBe('210mm');
    expect(sheet.style.padding).toBe('12mm 14mm');

    comp.setUnitSystem('in');
    comp.setPaperSize('letter');
    comp.setMarginPreset('wide');
    fixture.detectChanges();

    expect(sheet.style.width).toBe('215.9mm');
    expect(sheet.style.minHeight).toBe('279.4mm');
    expect(sheet.style.padding).toBe('22mm 25.4mm');
    expect(comp.paperSizeOptions().find((o) => o.value === 'letter')?.label).toContain('8.5 × 11 in');
    expect(comp.marginOptions().find((o) => o.value === 'wide')?.label).toContain('0.87 × 1 in');
    expect(comp.pageLimitLabel()).toBe('US Letter page 1 limit (11 in)');
  });

  it('disables Export PDF button while editMode is active', async () => {
    await TestBed.configureTestingModule({ imports: [PreviewComponent] }).compileComponents();
    const fixture = TestBed.createComponent(PreviewComponent);
    const comp = fixture.componentInstance;
    const vs = TestBed.inject(VaultService);
    await vs.ready;
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const exportBtn = Array.from(el.querySelectorAll('.toolbar__actions button')).find((b) =>
      b.textContent?.includes('Export PDF'),
    ) as HTMLButtonElement | undefined;
    expect(exportBtn).toBeTruthy();
    expect(exportBtn?.disabled).toBeFalse();

    comp.editMode.set(true);
    fixture.detectChanges();
    expect(exportBtn?.disabled).toBeTrue();
  });

  it('saves, loads, and updates a point-in-time resume snapshot without mutating the Master Vault', async () => {
    localStorage.removeItem('ats-resume-builder:saved-resumes');
    await TestBed.configureTestingModule({ imports: [PreviewComponent] }).compileComponents();
    const fixture = TestBed.createComponent(PreviewComponent);
    const comp = fixture.componentInstance;
    const vs = TestBed.inject(VaultService);
    await vs.ready;
    await comp.savedResumes.ready;

    vs.update((v) => {
      v.summary = 'Vault summary';
      v.experience.push({
        id: 'exp_1',
        role: 'Engineer',
        company: 'OldCo',
        startDate: '2020-01',
        endDate: 'Present',
        bullets: [{ id: 'b_1', text: 'Original vault bullet' }],
      });
    });
    vs.selectAll();
    fixture.detectChanges();

    comp.snapshotNameDraft.set('OldCo Application');
    comp.saveCurrentSnapshot(false);
    expect(comp.savedResumes.resumes().length).toBe(1);

    // Mutate Master Vault afterwards
    vs.update((v) => {
      v.summary = 'Newer vault summary';
      v.experience[0].bullets[0].text = 'Newer vault bullet';
    });

    // Load the older snapshot and add a bullet to it
    comp.loadSavedSnapshot(comp.savedResumes.resumes()[0]);
    expect(comp.summary()).toBe('Vault summary');
    expect(vs.selectedExperience()[0].bullets[0].text).toBe('Original vault bullet');

    comp.setBulletDraft('exp_1', 'Added later to old application');
    comp.addResumeBullet('exp_1');
    comp.saveCurrentSnapshot(true);

    expect(comp.savedResumes.resumes()[0].snapshot.experience[0].bullets.length).toBe(2);
    expect(vs.vault().experience[0].bullets.length).toBe(1);
    localStorage.removeItem('ats-resume-builder:saved-resumes');
  });

  it('reorders experience roles and bullets in edit mode', async () => {
    await TestBed.configureTestingModule({ imports: [PreviewComponent] }).compileComponents();
    const fixture = TestBed.createComponent(PreviewComponent);
    const comp = fixture.componentInstance;
    const vs = TestBed.inject(VaultService);
    await vs.ready;

    vs.update((v) => {
      v.experience = [
        {
          id: 'exp_1',
          role: 'Role A',
          company: 'Co A',
          startDate: '2020-01',
          endDate: '2021-01',
          bullets: [
            { id: 'b_1', text: 'First' },
            { id: 'b_2', text: 'Second' },
          ],
        },
        {
          id: 'exp_2',
          role: 'Role B',
          company: 'Co B',
          startDate: '2022-01',
          endDate: 'Present',
          bullets: [{ id: 'b_3', text: 'Third' }],
        },
      ];
    });
    vs.selectAll();
    comp.toggleEditMode();
    fixture.detectChanges();

    const moveRoleDown = fixture.nativeElement.querySelector('button[aria-label="Move role Role A down"]') as HTMLButtonElement | null;
    expect(moveRoleDown).toBeTruthy();
    moveRoleDown?.click();
    expect(vs.selectedExperience().map((e) => e.id)).toEqual(['exp_2', 'exp_1']);

    const moveBulletUp = fixture.nativeElement.querySelector('button[aria-label="Move bullet b_2 up"]') as HTMLButtonElement | null;
    expect(moveBulletUp).toBeTruthy();
    moveBulletUp?.click();
    expect(vs.selectedExperience()[1].bullets.map((b) => b.id)).toEqual(['b_2', 'b_1']);
  });

  it('renders email as mailto: and phone as tel: links in contact section', async () => {
    await TestBed.configureTestingModule({ imports: [PreviewComponent] }).compileComponents();
    const fixture = TestBed.createComponent(PreviewComponent);
    const vs = TestBed.inject(VaultService);
    await vs.ready;

    vs.update((v) => {
      v.contact.email = 'ada@example.com';
      v.contact.phone = '+48 123 456 789';
    });
    fixture.detectChanges();

    const emailEl = fixture.nativeElement.querySelector('a.r-contact__link--email') as HTMLAnchorElement | null;
    const phoneEl = fixture.nativeElement.querySelector('a.r-contact__link--phone') as HTMLAnchorElement | null;
    expect(emailEl?.getAttribute('href')).toBe('mailto:ada@example.com');
    expect(emailEl?.textContent?.trim()).toBe('ada@example.com');
    expect(phoneEl?.getAttribute('href')).toBe('tel:+48123456789');
    expect(phoneEl?.textContent?.trim()).toBe('+48 123 456 789');
  });
});
