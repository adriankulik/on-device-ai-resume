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
});
