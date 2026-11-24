import { TestBed } from '@angular/core/testing';
import { VaultService } from './vault.service';

const KEY = 'ats-resume-builder:master-vault';
const tick = () => new Promise((r) => setTimeout(r, 20));

describe('VaultService persistence', () => {
  beforeEach(() => localStorage.removeItem(KEY));
  afterEach(() => localStorage.removeItem(KEY));

  it('is pristine and does not persist example data until the user edits', async () => {
    const vs = TestBed.inject(VaultService);
    await tick();
    TestBed.tick();
    expect(vs.pristine()).toBeTrue();
    expect(localStorage.getItem(KEY)).toBeNull();

    vs.vault().summary = 'Mine';
    vs.touch();
    TestBed.tick();
    await tick();
    expect(vs.pristine()).toBeFalse();
    expect(JSON.parse(localStorage.getItem(KEY) ?? '{}').summary).toBe('Mine');
  });

  it('loads a saved vault from localStorage and is not pristine', async () => {
    localStorage.setItem(KEY, JSON.stringify({ summary: 'Saved' }));
    const vs = TestBed.inject(VaultService);
    await tick();
    expect(vs.vault().summary).toBe('Saved');
    expect(vs.pristine()).toBeFalse();
  });

  it('clears all data and resets to pristine onboarding state', async () => {
    localStorage.setItem(KEY, JSON.stringify({ summary: 'Custom' }));
    localStorage.setItem('ats-resume-builder:ats-onboarding-completed', 'true');
    const vs = TestBed.inject(VaultService);
    await tick();
    vs.completeOnboarding();
    expect(vs.onboarded()).toBeTrue();

    await vs.clearAllData();
    expect(vs.onboarded()).toBeFalse();
    expect(vs.pristine()).toBeTrue();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(localStorage.getItem('ats-resume-builder:ats-onboarding-completed')).toBeNull();
  });

  it('syncs vault and tailored state when storage changes in another tab/context', async () => {
    const vs = TestBed.inject(VaultService);
    await tick();
    expect(vs.pristine()).toBeTrue();

    const updatedVault = { summary: 'Edited in full tab', contact: { fullName: 'Ada Lovelace' } };
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: KEY,
        newValue: JSON.stringify(updatedVault),
      }),
    );

    expect(vs.vault().summary).toBe('Edited in full tab');
    expect(vs.vault().contact.fullName).toBe('Ada Lovelace');
    expect(vs.pristine()).toBeFalse();

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'ats-resume-builder:tailored-state',
        newValue: JSON.stringify({
          selectedBulletIds: ['b_1'],
          tailoredSummary: 'Tailored from full tab',
          tailoredSkills: ['TypeScript', 'Angular'],
        }),
      }),
    );

    expect(vs.tailoredSummary()).toBe('Tailored from full tab');
    expect(vs.tailoredSkills()).toEqual(['TypeScript', 'Angular']);
    expect(vs.selectedBulletIds().has('b_1')).toBeTrue();
  });

  it('preserves deselected bullets when a vault settings change syncs from another context', async () => {
    const vs = TestBed.inject(VaultService);
    await tick();

    vs.update((v) => {
      v.experience.push({
        id: 'exp_1',
        role: 'Engineer',
        company: 'Acme',
        startDate: '2022-01',
        endDate: 'Present',
        bullets: [
          { id: 'b_1', text: 'Keep me' },
          { id: 'b_2', text: 'Deselect me' },
        ],
      });
    });
    vs.setSelected(['b_1']);
    expect(vs.selectedBulletIds().has('b_2')).toBeFalse();

    const synced = structuredClone(vs.vault());
    synced.settings.includeRodoClause = !synced.settings.includeRodoClause;
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: KEY,
        newValue: JSON.stringify(synced),
      }),
    );

    expect(vs.selectedBulletIds().has('b_1')).toBeTrue();
    expect(vs.selectedBulletIds().has('b_2')).toBeFalse();
  });

  it('clears stale tailored skills and categories on importJson and restores snapshot categories without mutating vault', async () => {
    const vs = TestBed.inject(VaultService);
    await tick();

    vs.tailoredSkills.set(['OldSkill']);
    vs.tailoredSkillCategories.set([{ category: 'OldCat', skills: ['OldSkill'] }]);

    vs.importJson(
      JSON.stringify({
        skills: ['Angular', 'Docker'],
        skillCategories: [
          { category: 'Frontend', skills: ['Angular'] },
          { category: 'Cloud', skills: ['Docker'] },
        ],
      }),
    );
    expect(vs.tailoredSkills()).toBeNull();
    expect(vs.tailoredSkillCategories()).toBeNull();

    vs.loadResumeSnapshot({
      contact: vs.vault().contact,
      summary: 'Snap summary',
      experience: [],
      education: [],
      certifications: [],
      skills: ['Python', 'PyTorch'],
      skillCategories: [{ category: 'AI', skills: ['Python', 'PyTorch'] }],
      settings: vs.vault().settings,
    });
    expect(vs.tailoredSkills()).toEqual(['Python', 'PyTorch']);
    expect(vs.tailoredSkillCategories()).toEqual([{ category: 'AI', skills: ['Python', 'PyTorch'] }]);
    expect(vs.vault().skillCategories.map((c) => c.category)).toEqual(['Frontend', 'Cloud']);

    // Snapshot with empty skillCategories stays uncategorized instead of borrowing Master Vault categories
    vs.loadResumeSnapshot({
      contact: vs.vault().contact,
      summary: 'Flat snap',
      experience: [],
      education: [],
      certifications: [],
      skills: ['Go'],
      skillCategories: [],
      settings: vs.vault().settings,
    });
    expect(vs.tailoredSkillCategories()).toEqual([]);
  });

  it('does not bounce incoming external storage changes back to storage', async () => {
    const vs = TestBed.inject(VaultService);
    await tick();

    const setSpy = spyOn(localStorage, 'setItem').and.callThrough();
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: KEY,
        newValue: JSON.stringify({ summary: 'External update' }),
      }),
    );
    TestBed.tick();
    await tick();

    expect(vs.vault().summary).toBe('External update');
    expect(setSpy.calls.allArgs().filter(([k]) => k === KEY).length).toBe(0);
  });

  it('does not duplicate positions when resumeOnlyExperience shares an id with vault experience', async () => {
    const vs = TestBed.inject(VaultService);
    await tick();

    vs.update((v) => {
      v.experience = [
        {
          id: 'exp_1',
          role: 'Senior Engineer',
          company: 'Acme',
          startDate: '2022',
          endDate: 'Present',
          bullets: [{ id: 'b_1', text: 'Built TypeScript services' }],
        },
      ];
    });
    vs.resumeOnlyExperience.set([
      {
        id: 'exp_1',
        role: 'Senior Engineer',
        company: 'Acme',
        startDate: '2022',
        endDate: 'Present',
        bullets: [{ id: 'b_1', text: 'Old snapshot bullet' }],
      },
      {
        id: 're_extra',
        role: 'Advisor',
        company: 'Beta',
        startDate: '2021',
        endDate: '2022',
        bullets: [{ id: 'rb_1', text: 'Advised startup' }],
      },
    ]);
    vs.setSelected(['b_1']);

    expect(vs.selectedExperience().map((e) => e.id)).toEqual(['exp_1', 're_extra']);
  });

  it('clears stale resumeExperienceOrder and resumeBulletOrder on loadResumeSnapshot', async () => {
    const vs = TestBed.inject(VaultService);
    await tick();

    vs.resumeExperienceOrder.set(['exp_2', 'exp_1']);
    vs.resumeBulletOrder.set({ exp_1: ['b_2', 'b_1'] });

    vs.loadResumeSnapshot({
      contact: vs.vault().contact,
      summary: 'Snap',
      experience: [],
      education: [],
      certifications: [],
      skills: [],
      settings: vs.vault().settings,
    });

    expect(vs.resumeExperienceOrder()).toEqual([]);
    expect(vs.resumeBulletOrder()).toEqual({});
  });

  it('moves bullets directly to the top or bottom with moveBulletToEdge', async () => {
    const vs = TestBed.inject(VaultService);
    await tick();

    vs.update((v) => {
      v.experience = [
        {
          id: 'exp_1',
          role: 'Engineer',
          company: 'Acme',
          startDate: '2022',
          endDate: 'Present',
          bullets: [
            { id: 'b_1', text: 'One' },
            { id: 'b_2', text: 'Two' },
            { id: 'b_3', text: 'Three' },
          ],
        },
      ];
    });

    vs.moveBulletToEdge('exp_1', 2, 'top');
    expect(vs.vault().experience[0].bullets.map((b) => b.id)).toEqual(['b_3', 'b_1', 'b_2']);

    vs.moveBulletToEdge('exp_1', 0, 'bottom');
    expect(vs.vault().experience[0].bullets.map((b) => b.id)).toEqual(['b_1', 'b_2', 'b_3']);
  });
});
