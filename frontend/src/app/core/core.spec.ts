import { extractKeywords, fallbackTriage, keywordStatus, textHasKeyword } from './keyword-matcher';
import { MasterVault, emptyVault, formatCategorizedSkillsText, nextId, normalizeVault, parseCategorizedSkillsText } from './vault.model';
import { parseMarkdownLinks } from './rich-text';

function testVault(): MasterVault {
  const v = emptyVault();
  v.experience = [
    {
      id: 'exp_1',
      role: 'Senior Engineer',
      company: 'Acme',
      startDate: '2022-01',
      endDate: 'Present',
      bullets: [
        { id: 'b_101', text: 'Introduced GraphQL gateway, cutting API round-trips by 45%.' },
        { id: 'b_102', text: 'Delivered TypeScript web applications.' },
      ],
    },
    {
      id: 'exp_2',
      role: 'Engineer',
      company: 'Beta',
      startDate: '2020-01',
      endDate: '2021-12',
      bullets: [{ id: 'b_103', text: 'Containerised build pipelines with Docker.' }],
    },
  ];
  v.skills = ['TypeScript', 'GraphQL', 'Docker'];
  return v;
}

describe('keyword matcher', () => {
  it('matches whole tokens only', () => {
    expect(textHasKeyword('Built React apps', 'react')).toBeTrue();
    expect(textHasKeyword('Reactive streams', 'react')).toBeFalse();
    expect(textHasKeyword('Used Node.js daily', 'Node.js')).toBeTrue();
    expect(textHasKeyword('C++ developer', 'C++')).toBeTrue();
  });

  it('tolerates plurals on long words', () => {
    expect(textHasKeyword('Built web applications', 'application')) .toBeTrue();
    expect(textHasKeyword('Built web application', 'applications')).toBeTrue();
  });

  it('extracts vault skills found in the JD', () => {
    const v = testVault();
    const kws = extractKeywords('We need TypeScript and GraphQL experts. Docker a plus.', v);
    expect(kws).toContain('TypeScript');
    expect(kws).toContain('GraphQL');
  });

  it('fallback triage selects relevant bullets only, honouring the cap', () => {
    const v = testVault();
    const res = fallbackTriage(v, 'Looking for GraphQL and Docker experience', 1);
    expect(res.selectedBulletIds.length).toBe(1);
    const all = v.experience.flatMap((e) => e.bullets.map((b) => b.id));
    expect(all).toContain(res.selectedBulletIds[0]);
  });

  it('reports present/missing keywords', () => {
    const st = keywordStatus(testVault(), ['TypeScript', 'Kubernetes']);
    expect(st.map((s) => s.present)).toEqual([true, false]);
  });
});

describe('vault model', () => {
  it('normalizes partial input and de-duplicates ids', () => {
    const v = normalizeVault({
      experience: [{ id: 'exp_1', bullets: [{ id: 'b_1', text: 'a' }, { id: 'b_1', text: 'b' }] }],
    });
    const ids = v.experience[0].bullets.map((b) => b.id);
    expect(new Set(ids).size).toBe(2);
    expect(v.settings.theme).toBe('modern-slate');
  });

  it('rejects non-objects', () => {
    expect(() => normalizeVault(null)).toThrow();
  });

  it('generates unique next ids', () => {
    const v = testVault();
    expect(nextId(v, 'b')).toBe('b_104');
    expect(nextId(v, 'exp')).toBe('exp_3');
  });

  it('keeps empty skill categories, merges duplicate category names, and preserves uncategorized skills', () => {
    const v = normalizeVault({
      skills: ['Docker'],
      skillCategories: [
        { category: 'Frontend', skills: ['Angular'] },
        { category: 'frontend', skills: ['TypeScript'] },
        { category: 'AI', skills: [] },
      ],
    });
    expect(v.skillCategories).toEqual([
      { category: 'Frontend', skills: ['Angular', 'TypeScript'] },
      { category: 'AI', skills: [] },
    ]);
    expect(formatCategorizedSkillsText(v.skills, v.skillCategories)).toBe(
      'Frontend: Angular, TypeScript\nAI: \nOther: Docker',
    );

    const parsed = parseCategorizedSkillsText('Cloud: AWS\ncloud: GCP, AWS');
    expect(parsed.skillCategories).toEqual([{ category: 'Cloud', skills: ['AWS', 'GCP'] }]);
    expect(parsed.skills).toEqual(['AWS', 'GCP']);
  });

  it('merges duplicate experience positions with the same role, company, and dates', () => {
    const v = normalizeVault({
      experience: [
        {
          id: 'exp_3',
          role: 'Skipper',
          company: 'Race for the Baltic',
          startDate: '2020-05',
          endDate: '2020-09',
          bullets: [{ id: 'b_1', text: 'Led crew' }],
        },
        {
          id: 'exp_15',
          role: 'skipper',
          company: 'Race for the Baltic',
          startDate: '2020-05',
          endDate: '2020-09',
          bullets: [
            { id: 'b_2', text: 'Led crew' },
            { id: 'b_3', text: 'Won leg 2' },
          ],
        },
      ],
    });
    expect(v.experience.length).toBe(1);
    expect(v.experience[0].id).toBe('exp_3');
    expect(v.experience[0].bullets.map((b) => b.text)).toEqual(['Led crew', 'Won leg 2']);
  });
});

describe('parseMarkdownLinks', () => {
  it('parses markdown links, inline code, bold, and italic', () => {
    const segs = parseMarkdownLinks(
      '[kmd-labs](https://github.com/kmd-labs): **Unified** `npx` *CLI* (e.g., [el-nino](https://github.com/kmd-labs/el-nino)).',
    );
    expect(segs).toEqual([
      { type: 'link', label: 'kmd-labs', url: 'https://github.com/kmd-labs' },
      { type: 'text', text: ': ' },
      { type: 'bold', text: 'Unified' },
      { type: 'text', text: ' ' },
      { type: 'code', text: 'npx' },
      { type: 'text', text: ' ' },
      { type: 'italic', text: 'CLI' },
      { type: 'text', text: ' (e.g., ' },
      { type: 'link', label: 'el-nino', url: 'https://github.com/kmd-labs/el-nino' },
      { type: 'text', text: ').' },
    ]);
  });

  it('parses markdown links nested inside bold or italic', () => {
    const segs = parseMarkdownLinks(
      '**[Desqueezer](https://github.com/adriankulik/Desqueezer):** Adobe Lightroom plugin.',
    );
    expect(segs).toEqual([
      {
        type: 'bold',
        text: '[Desqueezer](https://github.com/adriankulik/Desqueezer):',
        children: [
          { type: 'link', label: 'Desqueezer', url: 'https://github.com/adriankulik/Desqueezer' },
          { type: 'text', text: ':' },
        ],
      },
      { type: 'text', text: ' Adobe Lightroom plugin.' },
    ]);
  });

  it('ignores unsafe protocols like javascript:', () => {
    const segs = parseMarkdownLinks('Click [here](javascript:alert(1)) now');
    expect(segs).toEqual([{ type: 'text', text: 'Click [here](javascript:alert(1)) now' }]);
  });
});
