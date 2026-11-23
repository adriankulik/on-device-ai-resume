/* eslint-disable @typescript-eslint/no-explicit-any -- parsing untrusted JSON */
export interface Bullet {
  id: string;
  text: string;
}

export interface Experience {
  id: string;
  role: string;
  company: string;
  startDate: string;
  endDate: string;
  bullets: Bullet[];
}

export interface Education {
  id: string;
  degree: string;
  institution: string;
  year: string;
}

export interface Certification {
  id: string;
  name: string;
  issuer: string;
  year: string;
}

export interface SkillCategory {
  category: string;
  skills: string[];
}

export type ThemeName = 'classic-serif' | 'modern-slate' | 'minimal-mono';
export type UnitSystem = 'mm' | 'in';
export type PaperSizeId = 'a4' | 'a5' | 'letter' | 'legal';
export type MarginPresetId = 'compact' | 'normal' | 'comfortable' | 'wide' | 'custom';

export interface CustomMargins {
  topMm: number;
  rightMm: number;
  bottomMm: number;
  leftMm: number;
}

export interface PaperSizeSpec {
  id: PaperSizeId;
  label: string;
  region: 'Europe' | 'US';
  widthMm: number;
  heightMm: number;
  widthIn: number;
  heightIn: number;
}

export interface MarginPresetSpec {
  id: MarginPresetId;
  label: string;
  topBottomMm: number;
  leftRightMm: number;
  topBottomIn: number;
  leftRightIn: number;
}

export const UNIT_SYSTEMS: { value: UnitSystem; label: string }[] = [
  { value: 'mm', label: 'Millimeters (mm)' },
  { value: 'in', label: 'Inches (in)' },
];

export const PAPER_SIZES: Record<PaperSizeId, PaperSizeSpec> = {
  a4: { id: 'a4', label: 'A4', region: 'Europe', widthMm: 210, heightMm: 297, widthIn: 8.27, heightIn: 11.69 },
  a5: { id: 'a5', label: 'A5', region: 'Europe', widthMm: 148, heightMm: 210, widthIn: 5.83, heightIn: 8.27 },
  letter: { id: 'letter', label: 'US Letter', region: 'US', widthMm: 215.9, heightMm: 279.4, widthIn: 8.5, heightIn: 11 },
  legal: { id: 'legal', label: 'US Legal', region: 'US', widthMm: 215.9, heightMm: 355.6, widthIn: 8.5, heightIn: 14 },
};

export const MARGIN_PRESETS: Record<Exclude<MarginPresetId, 'custom'>, MarginPresetSpec> = {
  compact: { id: 'compact', label: 'Compact', topBottomMm: 8, leftRightMm: 10, topBottomIn: 0.31, leftRightIn: 0.39 },
  normal: { id: 'normal', label: 'Normal', topBottomMm: 12, leftRightMm: 14, topBottomIn: 0.47, leftRightIn: 0.55 },
  comfortable: { id: 'comfortable', label: 'Comfortable', topBottomMm: 16, leftRightMm: 18, topBottomIn: 0.63, leftRightIn: 0.71 },
  wide: { id: 'wide', label: 'Wide', topBottomMm: 22, leftRightMm: 25.4, topBottomIn: 0.87, leftRightIn: 1.0 },
};

export interface VaultSettings {
  theme: ThemeName;
  showPhoto: boolean;
  showCertificationDates: boolean;
  strictOnePage: boolean;
  includeRodoClause: boolean;
  rodoCompanyName: string;
  unitSystem: UnitSystem;
  paperSize: PaperSizeId;
  marginPreset: MarginPresetId;
  customMargins: CustomMargins;
}

export interface Contact {
  fullName: string;
  tagline?: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  links: string[];
  photoDataUrl: string;
}

export interface MasterVault {
  contact: Contact;
  summary: string;
  experience: Experience[];
  education: Education[];
  certifications: Certification[];
  skills: string[];
  skillCategories: SkillCategory[];
  settings: VaultSettings;
}

export const THEMES: { value: ThemeName; label: string }[] = [
  { value: 'classic-serif', label: 'Classic Serif' },
  { value: 'modern-slate', label: 'Modern Slate' },
  { value: 'minimal-mono', label: 'Minimal Mono' },
];

export function emptyVault(): MasterVault {
  return {
    contact: { fullName: '', tagline: '', email: '', phone: '', location: '', linkedin: '', github: '', links: [], photoDataUrl: '' },
    summary: '',
    experience: [],
    education: [],
    certifications: [],
    skills: [],
    skillCategories: [],
    settings: {
      theme: 'modern-slate',
      showPhoto: true,
      showCertificationDates: true,
      strictOnePage: true,
      includeRodoClause: true,
      rodoCompanyName: '',
      unitSystem: 'mm',
      paperSize: 'a4',
      marginPreset: 'normal',
      customMargins: { topMm: 12, rightMm: 14, bottomMm: 12, leftMm: 14 },
    },
  };
}

/** Coerces arbitrary parsed JSON (import / AI output) into a valid vault. */
export function normalizeVault(raw: unknown): MasterVault {
  const base = emptyVault();
  if (!raw || typeof raw !== 'object') throw new Error('Vault must be a JSON object');
  const r = raw as Record<string, any>;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const strArr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

  const c = (r['contact'] ?? {}) as Record<string, unknown>;
  base.contact = {
    fullName: str(c['fullName']),
    tagline: str(c['tagline']),
    email: str(c['email']),
    phone: str(c['phone']),
    location: str(c['location']),
    linkedin: str(c['linkedin']),
    github: str(c['github']),
    links: strArr(c['links']),
    photoDataUrl: str(c['photoDataUrl']),
  };
  base.summary = str(r['summary']);
  const rawCats = Array.isArray(r['skillCategories']) ? r['skillCategories'] : [];
  base.skillCategories = dedupeSkillCategories(
    rawCats.map((c: unknown) => {
      const rec = (c ?? {}) as Record<string, unknown>;
      return {
        category: str(rec['category']),
        skills: strArr(rec['skills']),
      };
    }),
  );
  const flat = strArr(r['skills']);
  const fromCats = base.skillCategories.flatMap((c) => c.skills);
  base.skills = [...new Set([...flat, ...fromCats])];

  const used = new Set<string>();
  const uid = (prefix: string, given: unknown) => {
    let id = typeof given === 'string' && given && !used.has(given) ? given : '';
    let n = used.size + 1;
    while (!id || used.has(id)) id = `${prefix}_${n++}`;
    used.add(id);
    return id;
  };

  const rawExperience: Experience[] = (Array.isArray(r['experience']) ? r['experience'] : []).map((e: any) => ({
    id: uid('exp', e?.id),
    role: str(e?.role),
    company: str(e?.company),
    startDate: str(e?.startDate),
    endDate: str(e?.endDate),
    bullets: (Array.isArray(e?.bullets) ? e.bullets : []).map((b: any) => ({
      id: uid('b', b?.id),
      text: str(b?.text ?? b),
    })),
  }));
  // Merge duplicate positions (same non-empty role, company, startDate, endDate) and their bullets
  const seenExp = new Map<string, Experience>();
  base.experience = [];
  for (const exp of rawExperience) {
    const keyParts = [exp.role, exp.company, exp.startDate, exp.endDate].map((s) => s.trim().toLowerCase());
    const key = keyParts[0] && keyParts[1] ? keyParts.join('|') : '';
    const existing = key ? seenExp.get(key) : undefined;
    if (existing) {
      const seenTexts = new Set(existing.bullets.map((b) => b.text.trim().toLowerCase()));
      for (const b of exp.bullets) {
        const norm = b.text.trim().toLowerCase();
        if (norm && !seenTexts.has(norm)) {
          seenTexts.add(norm);
          existing.bullets.push(b);
        }
      }
    } else {
      if (key) seenExp.set(key, exp);
      base.experience.push(exp);
    }
  }
  base.education = (Array.isArray(r['education']) ? r['education'] : []).map((e: any) => ({
    id: uid('edu', e?.id),
    degree: str(e?.degree),
    institution: str(e?.institution),
    year: str(e?.year),
  }));
  base.certifications = (Array.isArray(r['certifications']) ? r['certifications'] : []).map((c: any) => ({
    id: uid('cert', c?.id),
    name: str(c?.name),
    issuer: str(c?.issuer),
    year: str(c?.year),
  }));

  const s = (r['settings'] ?? {}) as Record<string, any>;
  const themes = THEMES.map((t) => t.value);
  const unitSystems = UNIT_SYSTEMS.map((u) => u.value);
  const paperSizes = Object.keys(PAPER_SIZES) as PaperSizeId[];
  const marginPresets: MarginPresetId[] = [...(Object.keys(MARGIN_PRESETS) as MarginPresetId[]), 'custom'];
  const cm = (s['customMargins'] ?? {}) as Record<string, unknown>;
  const clampMm = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(60, Math.max(0, v)) : fallback;
  base.settings = {
    theme: themes.includes(s['theme']) ? s['theme'] : base.settings.theme,
    showPhoto: typeof s['showPhoto'] === 'boolean' ? s['showPhoto'] : base.settings.showPhoto,
    showCertificationDates:
      typeof s['showCertificationDates'] === 'boolean'
        ? s['showCertificationDates']
        : base.settings.showCertificationDates,
    strictOnePage:
      typeof s['strictOnePage'] === 'boolean' ? s['strictOnePage'] : base.settings.strictOnePage,
    includeRodoClause:
      typeof s['includeRodoClause'] === 'boolean'
        ? s['includeRodoClause']
        : base.settings.includeRodoClause,
    rodoCompanyName: str(s['rodoCompanyName']),
    unitSystem: unitSystems.includes(s['unitSystem']) ? s['unitSystem'] : base.settings.unitSystem,
    paperSize: paperSizes.includes(s['paperSize']) ? s['paperSize'] : base.settings.paperSize,
    marginPreset: marginPresets.includes(s['marginPreset']) ? s['marginPreset'] : base.settings.marginPreset,
    customMargins: {
      topMm: clampMm(cm['topMm'], base.settings.customMargins.topMm),
      rightMm: clampMm(cm['rightMm'], base.settings.customMargins.rightMm),
      bottomMm: clampMm(cm['bottomMm'], base.settings.customMargins.bottomMm),
      leftMm: clampMm(cm['leftMm'], base.settings.customMargins.leftMm),
    },
  };
  return base;
}

/** Generates the next unique id with the given prefix across the whole vault. */
export function nextId(vault: MasterVault, prefix: 'exp' | 'b' | 'edu' | 'cert'): string {
  const ids = new Set<string>();
  vault.experience.forEach((e) => {
    ids.add(e.id);
    e.bullets.forEach((b) => ids.add(b.id));
  });
  vault.education.forEach((e) => ids.add(e.id));
  vault.certifications.forEach((c) => ids.add(c.id));
  let n = prefix === 'b' ? 101 : 1;
  while (ids.has(`${prefix}_${n}`)) n++;
  return `${prefix}_${n}`;
}

const SKILL_CATEGORY_RULES: { category: string; keywords: RegExp }[] = [
  { category: 'AI', keywords: /\b(ai|ml|llm|gpt|gemini|rag|langchain|pytorch|tensorflow|nlp|openai|transformers|huggingface|embeddings?|agents?|genai|machine learning|deep learning)\b/i },
  { category: 'Frontend', keywords: /\b(react|angular|vue|svelte|next\.?js|typescript|javascript|html|css|scss|sass|tailwind|rxjs|webpack|vite|accessibility|wcag|redux|dom)\b/i },
  { category: 'Backend', keywords: /\b(node\.?js|python|java|go|golang|rust|c#|\.net|ruby|php|sql|postgres|postgresql|mysql|mongodb|redis|graphql|rest|api|grpc|kafka|express|fastapi|django|spring)\b/i },
  { category: 'Cloud', keywords: /\b(aws|azure|gcp|google cloud|docker|kubernetes|k8s|terraform|ci\/cd|github actions|linux|serverless|lambda|cloudflare|vercel|nginx)\b/i },
  { category: 'Design', keywords: /\b(figma|sketch|ui|ux|design system|wirefram|prototyp|adobe|photoshop|illustrator|storybook)\b/i },
];

/** Groups a flat skill list into concise heuristic categories (Frontend, Backend, AI, Cloud, Design, Other). */
export function categorizeSkillsHeuristic(skills: string[]): SkillCategory[] {
  const buckets = new Map<string, string[]>();
  for (const raw of skills) {
    const skill = raw.trim();
    if (!skill) continue;
    const match = SKILL_CATEGORY_RULES.find((r) => r.keywords.test(skill));
    const cat = match ? match.category : 'Other';
    const list = buckets.get(cat) ?? [];
    if (!list.includes(skill)) list.push(skill);
    buckets.set(cat, list);
  }
  return Array.from(buckets.entries()).map(([category, items]) => ({ category, skills: items }));
}

/** Filters categorized vault skills to the active/tailored flat skills list, appending uncategorized ones under Other. */
export function groupSkillsByCategory(
  flatSkills: string[],
  categories: SkillCategory[],
  includeEmpty = false,
): SkillCategory[] {
  if (!categories.length || (!flatSkills.length && !includeEmpty)) return [];
  const active = new Set(flatSkills);
  const assigned = new Set<string>();
  const result: SkillCategory[] = [];
  for (const grp of categories) {
    const kept = grp.skills.filter((sk) => active.has(sk));
    kept.forEach((sk) => assigned.add(sk));
    if (kept.length || includeEmpty) result.push({ category: grp.category, skills: kept });
  }
  const extra = flatSkills.filter((sk) => !assigned.has(sk));
  if (extra.length) {
    const existingOther = result.find((r) => r.category.toLowerCase() === 'other');
    if (existingOther) existingOther.skills.push(...extra);
    else result.push({ category: 'Other', skills: extra });
  }
  return result;
}

/** Merges case-insensitive duplicate skill categories while keeping empty ones and deduplicating skills. */
export function dedupeSkillCategories(categories: SkillCategory[]): SkillCategory[] {
  const result: SkillCategory[] = [];
  const byLower = new Map<string, SkillCategory>();
  for (const grp of categories) {
    const category = grp.category.trim();
    if (!category) continue;
    const key = category.toLowerCase();
    const cleaned = grp.skills.map((s) => s.trim()).filter(Boolean);
    const existing = byLower.get(key);
    if (existing) {
      for (const sk of cleaned) {
        if (!existing.skills.includes(sk)) existing.skills.push(sk);
      }
    } else {
      const entry: SkillCategory = { category, skills: [...new Set(cleaned)] };
      byLower.set(key, entry);
      result.push(entry);
    }
  }
  return result;
}

/** Formats categorized skills as `Category: a, b` lines, or comma-separated when uncategorized. */
export function formatCategorizedSkillsText(skills: string[], categories: SkillCategory[]): string {
  if (categories.length) {
    return groupSkillsByCategory(skills, categories, true)
      .map((c) => `${c.category}: ${c.skills.join(', ')}`)
      .join('\n');
  }
  return skills.join(', ');
}

/** Parses `Category: a, b` lines (or plain comma-separated skills) into flat skills + categories. */
export function parseCategorizedSkillsText(raw: string): { skills: string[]; skillCategories: SkillCategory[] } {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const hasCategories = lines.some((l) => /^[^:,]{1,40}:\s*.+/.test(l));
  if (!hasCategories) {
    const skills = [...new Set(raw.split(',').map((x) => x.trim()).filter(Boolean))];
    return { skills, skillCategories: skills.length ? categorizeSkillsHeuristic(skills) : [] };
  }
  const rawCategories: SkillCategory[] = [];
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const category = line.slice(0, idx).trim();
      const items = [...new Set(line.slice(idx + 1).split(',').map((x) => x.trim()).filter(Boolean))];
      if (category && items.length) rawCategories.push({ category, skills: items });
    } else {
      const items = [...new Set(line.split(',').map((x) => x.trim()).filter(Boolean))];
      if (items.length) rawCategories.push({ category: 'Other', skills: items });
    }
  }
  const skillCategories = dedupeSkillCategories(rawCategories);
  const skills = [...new Set(skillCategories.flatMap((c) => c.skills))];
  return { skills, skillCategories };
}

/** Adds a skill to vault.skills and vault.skillCategories (when categories exist or one is given), deduplicating case-insensitively. */
export function addSkillToVault(v: MasterVault, rawSkill: string, category?: string): void {
  const clean = rawSkill.trim();
  if (!clean) return;
  const lower = clean.toLowerCase();
  if (!v.skills.some((s) => s.toLowerCase() === lower)) {
    v.skills.push(clean);
  }
  const targetCat = category?.trim() || (v.skillCategories.length ? categorizeSkillsHeuristic([clean])[0]?.category : '');
  if (!targetCat) return;
  const catLower = targetCat.toLowerCase();
  const existing = v.skillCategories.find((c) => c.category.toLowerCase() === catLower);
  if (existing) {
    if (!existing.skills.some((s) => s.toLowerCase() === lower)) {
      existing.skills.push(clean);
    }
  } else {
    v.skillCategories.push({ category: targetCat, skills: [clean] });
  }
}
