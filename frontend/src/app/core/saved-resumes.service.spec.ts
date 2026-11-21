import { TestBed } from '@angular/core/testing';
import { SavedResumesService, ResumeSnapshotData } from './saved-resumes.service';
import { emptyVault } from './vault.model';

const KEY = 'ats-resume-builder:saved-resumes';

function sampleSnapshot(summary = 'Tailored summary'): ResumeSnapshotData {
  const v = emptyVault();
  return {
    contact: { ...v.contact, fullName: 'Jane Doe' },
    summary,
    experience: [
      {
        id: 'exp_1',
        role: 'Senior Engineer',
        company: 'Acme',
        startDate: '2022-01',
        endDate: 'Present',
        bullets: [{ id: 'b_1', text: 'Shipped Angular app' }],
      },
    ],
    education: [],
    certifications: [],
    skills: ['Angular', 'TypeScript'],
    skillCategories: [{ category: 'Frontend', skills: ['Angular', 'TypeScript'] }],
    settings: v.settings,
  };
}

describe('SavedResumesService', () => {
  beforeEach(() => localStorage.removeItem(KEY));
  afterEach(() => localStorage.removeItem(KEY));

  it('saves, updates, and deletes resume snapshots independently', async () => {
    const svc = TestBed.inject(SavedResumesService);
    await svc.ready;

    const saved = svc.saveSnapshot('Acme — Senior Engineer', sampleSnapshot('V1 summary'));
    expect(svc.resumes().length).toBe(1);
    expect(saved.name).toBe('Acme — Senior Engineer');

    const updated = svc.saveSnapshot('Acme — Staff Engineer', sampleSnapshot('V2 summary'), saved.id);
    expect(svc.resumes().length).toBe(1);
    expect(updated.id).toBe(saved.id);
    expect(updated.snapshot.summary).toBe('V2 summary');

    svc.deleteSnapshot(saved.id);
    expect(svc.resumes().length).toBe(0);
  });

  it('exports and imports both single snapshots and full snapshot collections', async () => {
    const svc = TestBed.inject(SavedResumesService);
    await svc.ready;

    const s1 = svc.saveSnapshot('Company A', sampleSnapshot('Summary A'));
    const s2 = svc.saveSnapshot('Company B', sampleSnapshot('Summary B'));

    const singleJson = svc.exportSingleJson(s1.id);
    const allJson = svc.exportAllJson();

    svc.deleteSnapshot(s1.id);
    svc.deleteSnapshot(s2.id);
    expect(svc.resumes().length).toBe(0);

    const singleResult = svc.importJson(singleJson);
    expect(singleResult).toEqual({ added: 1, updated: 0 });
    expect(svc.resumes().length).toBe(1);

    const allResult = svc.importJson(allJson);
    expect(allResult).toEqual({ added: 1, updated: 1 });
    expect(svc.resumes().length).toBe(2);
    expect(svc.resumes()[0].snapshot.skillCategories).toEqual([
      { category: 'Frontend', skills: ['Angular', 'TypeScript'] },
    ]);
  });
});
