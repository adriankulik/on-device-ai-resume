import { DOCUMENT } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideArrowDown, LucideArrowUp, LucideCheck, LucideDynamicIcon, LucideExternalLink, LucideFileDown, LucidePencil, LucidePlus, LucideTrash2, LucideX } from '@lucide/angular';
import { CollapsibleComponent } from '../collapsible/collapsible.component';
import { DropdownComponent } from '../dropdown/dropdown.component';
import { ModalComponent } from '../modal/modal.component';
import { ToggleComponent } from '../toggle/toggle.component';
import { ButtonComponent } from '../button/button.component';
import { ExtensionService } from '../core/extension.service';
import { LayoutService } from '../core/layout.service';
import {
  ResumeSnapshotData,
  SavedResumeSnapshot,
  SavedResumesService,
} from '../core/saved-resumes.service';
import { VaultService } from '../core/vault.service';
import {
  CustomMargins,
  Experience,
  MARGIN_PRESETS,
  MarginPresetId,
  PAPER_SIZES,
  groupSkillsByCategory,
  PaperSizeId,
  SkillCategory,
  THEMES,
  ThemeName,
  UNIT_SYSTEMS,
  UnitSystem,
  VaultSettings,
  addSkillToVault,
  nextId,
} from '../core/vault.model';
import { RichTextComponent } from '../core/rich-text.component';

const MM_PX = 96 / 25.4;

@Component({
  selector: 'app-preview',
  standalone: true,
  imports: [FormsModule, DropdownComponent, ToggleComponent, CollapsibleComponent, ModalComponent, ButtonComponent, LucideDynamicIcon, RichTextComponent],
  templateUrl: './preview.component.html',
})
export class PreviewComponent implements AfterViewInit, OnDestroy {
  readonly vs = inject(VaultService);
  readonly savedResumes = inject(SavedResumesService);
  private readonly doc = inject(DOCUMENT);
  readonly themes = THEMES;
  readonly unitSystems = UNIT_SYSTEMS;
  readonly exportIcon = LucideFileDown.icon;
  readonly editIcon = LucidePencil.icon;
  readonly externalLinkIcon = LucideExternalLink.icon;
  readonly plusIcon = LucidePlus.icon;
  readonly trashIcon = LucideTrash2.icon;
  readonly checkIcon = LucideCheck.icon;
  readonly closeIcon = LucideX.icon;
  readonly upIcon = LucideArrowUp.icon;
  readonly downIcon = LucideArrowDown.icon;

  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly sheet = viewChild.required<ElementRef<HTMLElement>>('sheet');
  private ro?: ResizeObserver;

  readonly settingsOpen = signal(true);
  readonly editMode = signal(typeof window !== 'undefined' && window.location.search.includes('edit=1'));
  readonly pendingVaultPrompt = signal<{ label: string; commit: () => void } | null>(null);

  readonly newBulletDrafts = signal<Record<string, string>>({});
  readonly addingRole = signal(false);
  readonly newRole = signal({ role: '', company: '', startDate: '', endDate: '', bullet: '' });
  readonly addingEdu = signal(false);
  readonly newEdu = signal({ degree: '', institution: '', year: '' });
  readonly addingCert = signal(false);
  readonly newCert = signal({ name: '', issuer: '', year: '' });
  readonly newSkill = signal('');
  readonly categorySkillDrafts = signal<Record<string, string>>({});
  readonly newSkillCategory = signal('');
  readonly editingSummary = signal(false);
  readonly summaryDraft = signal('');
  readonly editingRoleId = signal<string | null>(null);
  readonly roleDraft = signal({ role: '', company: '', startDate: '', endDate: '' });
  readonly editingBullet = signal<{ expId: string; bulletId: string } | null>(null);
  readonly bulletEditDraft = signal('');
  readonly savedModalOpen = signal(false);
  readonly snapshotNameDraft = signal('');
  readonly activeSnapshotId = this.savedResumes.activeSnapshotId;
  readonly snapshotMsg = signal<{ ok: boolean; text: string } | null>(null);

  readonly s = this.vs.settings;
  readonly paperSpec = computed(() => PAPER_SIZES[this.s().paperSize] ?? PAPER_SIZES.a4);
  readonly marginSpec = computed(() => {
    const preset = this.s().marginPreset;
    if (preset === 'custom') return MARGIN_PRESETS.normal;
    return MARGIN_PRESETS[preset] ?? MARGIN_PRESETS.normal;
  });
  readonly pageWidthPx = computed(() => this.paperSpec().widthMm * MM_PX);
  readonly pageHeightPx = computed(() => this.paperSpec().heightMm * MM_PX);
  readonly sheetPadding = computed(() => {
    if (this.s().marginPreset === 'custom') {
      const c = this.s().customMargins;
      return `${c.topMm}mm ${c.rightMm}mm ${c.bottomMm}mm ${c.leftMm}mm`;
    }
    const m = this.marginSpec();
    return `${m.topBottomMm}mm ${m.leftRightMm}mm`;
  });
  readonly topMarginPx = computed(() => {
    const st = this.s();
    const mm = st.marginPreset === 'custom' ? st.customMargins.topMm : this.marginSpec().topBottomMm;
    return (Number(mm) || 0) * MM_PX;
  });
  readonly bottomMarginPx = computed(() => {
    const st = this.s();
    const mm = st.marginPreset === 'custom' ? st.customMargins.bottomMm : this.marginSpec().topBottomMm;
    return (Number(mm) || 0) * MM_PX;
  });
  readonly pageLimitLabel = computed(() => {
    const p = this.paperSpec();
    const u = this.s().unitSystem;
    const h = u === 'in' ? `${p.heightIn} in` : `${p.heightMm}mm`;
    return `${p.label} page 1 limit (${h})`;
  });
  readonly paperSizeOptions = computed(() => {
    const u = this.s().unitSystem;
    return Object.values(PAPER_SIZES).map((p) => ({
      value: p.id,
      label:
        u === 'in'
          ? `${p.label} (${p.widthIn} × ${p.heightIn} in)`
          : `${p.label} (${p.widthMm} × ${p.heightMm} mm)`,
    }));
  });
  readonly marginOptions = computed(() => {
    const u = this.s().unitSystem;
    const presets = Object.values(MARGIN_PRESETS).map((m) => ({
      value: m.id as MarginPresetId,
      label:
        u === 'in'
          ? `${m.label} (${m.topBottomIn} × ${m.leftRightIn} in)`
          : `${m.label} (${m.topBottomMm} × ${m.leftRightMm} mm)`,
    }));
    return [...presets, { value: 'custom' as MarginPresetId, label: 'Custom' }];
  });

  readonly scale = signal(1);
  readonly sheetHeight = signal(PAPER_SIZES.a4.heightMm * MM_PX);
  readonly printableHeight = signal(PAPER_SIZES.a4.heightMm * MM_PX);
  readonly pageBreakTopPx = signal(PAPER_SIZES.a4.heightMm * MM_PX);
  readonly overflow = computed(() => this.printableHeight() > this.pageHeightPx() + 1);
  readonly extraPageBreaks = computed(() => {
    const pageH = this.pageHeightPx();
    const total = this.printableHeight();
    const firstTop = this.pageBreakTopPx();
    const breaks: { page: number; topPx: number }[] = [];
    let page = 2;
    while (pageH > 0 && page * pageH < total - 1) {
      breaks.push({ page, topPx: firstTop + (page - 1) * pageH });
      page++;
    }
    return breaks;
  });
  private pageStyleEl: HTMLStyleElement | null = null;
  private measureLayout: (() => void) | null = null;

  constructor() {
    effect(() => {
      this.applyPageRule();
    });
    effect(() => {
      this.editMode();
      this.paperSpec();
      this.marginSpec();
      this.s();
      if (this.measureLayout) {
        queueMicrotask(() => this.measureLayout?.());
      }
    });
  }

  readonly contact = computed(() => this.vs.snapshotContact() ?? this.vs.vault().contact);
  readonly showPhoto = computed(() => this.s().showPhoto && !!this.contact().photoDataUrl);

  readonly summary = computed(() => (this.vs.hiddenSummary() ? '' : (this.vs.tailoredSummary() ?? this.vs.vault().summary)));
  readonly skills = computed(() => this.vs.tailoredSkills() ?? this.vs.vault().skills);
  readonly activeSkillCategories = computed(
    () => this.vs.tailoredSkillCategories() ?? this.vs.vault().skillCategories ?? [],
  );
  readonly categorizedSkills = computed(() => groupSkillsByCategory(this.skills(), this.activeSkillCategories()));
  readonly editSkillCategories = computed(() =>
    groupSkillsByCategory(this.skills(), this.activeSkillCategories(), true),
  );

  /** Contact details split into email/phone/location and web links */
  readonly emailLink = computed(() => {
    const email = (this.contact().email || '').trim();
    return email ? { label: email, url: `mailto:${email}` } : null;
  });

  readonly phoneLink = computed(() => {
    const phone = (this.contact().phone || '').trim();
    if (!phone) return null;
    const tel = phone.replace(/[\s()-]/g, '');
    return { label: phone, url: `tel:${tel || phone}` };
  });

  readonly locationText = computed(() => (this.contact().location || '').trim());
  readonly tagline = computed(() => (this.contact().tagline || '').trim());

  readonly linkedinLink = computed(() =>
    formatProfileLink(this.contact().linkedin, 'linkedin.com', '/in/'),
  );

  readonly githubLink = computed(() =>
    formatProfileLink(this.contact().github, 'github.com', '/'),
  );

  readonly contactLinks = computed(() => {
    const li = this.linkedinLink();
    const gh = this.githubLink();
    const exclude = new Set(
      [li ? `linkedin.com${li.display}` : '', gh ? `github.com${gh.display}` : '']
        .filter(Boolean)
        .map((s) => s.toLowerCase()),
    );
    return (this.contact().links || [])
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => ({
        url: /^https?:\/\//i.test(l) ? l : `https://${l}`,
        display: l.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, ''),
      }))
      .filter((l) => !exclude.has(l.display.toLowerCase()));
  });

  readonly rodoText = computed(() => {
    const company = this.s().rodoCompanyName.trim();
    const target = company ? ` by ${company}` : '';
    return (
      `I hereby consent to the processing of my personal data for the purposes of the recruitment process${target}, ` +
      'in accordance with Regulation (EU) 2016/679 of the European Parliament and of the Council of 27 April 2016 (GDPR).'
    );
  });

  ngAfterViewInit(): void {
    const update = () => {
      const stageEl = this.stage().nativeElement;
      const sheetEl = this.sheet().nativeElement;
      const w = stageEl.clientWidth;
      const pageH = this.pageHeightPx();
      this.scale.set(Math.min(1, Math.max(0.3, (w - 8) / this.pageWidthPx())));

      const totalH = sheetEl.offsetHeight;
      this.sheetHeight.set(totalH);

      if (!this.editMode()) {
        this.printableHeight.set(totalH);
        this.pageBreakTopPx.set(pageH);
        return;
      }

      // Measure an off-screen clone with all .no-print controls stripped and skills
      // rendered as plain text (<p>) so wrapped lines and lozenges are accounted for accurately.
      const host = this.doc.createElement('div');
      host.style.cssText = 'position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none;';
      const clone = sheetEl.cloneNode(true) as HTMLElement;
      clone.style.transform = 'none';
      clone.style.position = 'static';

      const skillsEdit = clone.querySelector('.r-skills-edit');
      if (skillsEdit?.parentElement) {
        const cats = this.categorizedSkills();
        if (cats.length) {
          const wrap = this.doc.createElement('div');
          wrap.className = 'r-skill-cats';
          for (const grp of cats) {
            const p = this.doc.createElement('p');
            p.className = 'r-skill-cat';
            const strong = this.doc.createElement('strong');
            strong.textContent = `${grp.category}: `;
            p.appendChild(strong);
            p.appendChild(this.doc.createTextNode(grp.skills.join(', ')));
            wrap.appendChild(p);
          }
          skillsEdit.parentElement.replaceChild(wrap, skillsEdit);
        } else {
          const p = this.doc.createElement('p');
          p.textContent = this.skills().join(', ');
          skillsEdit.parentElement.replaceChild(p, skillsEdit);
        }
      }
      clone.querySelectorAll('.no-print').forEach((el) => el.remove());

      host.appendChild(clone);
      (sheetEl.parentElement ?? this.doc.body).appendChild(host);
      try {
        const printableH = clone.offsetHeight;
        this.printableHeight.set(printableH);

        const selector = '.r-role, .r-bullet-item, .r-edu, .r-rodo';
        const liveEls = Array.from(sheetEl.querySelectorAll<HTMLElement>(selector));
        const cloneEls = Array.from(clone.querySelectorAll<HTMLElement>(selector));
        let delta = totalH - printableH;
        const count = Math.min(liveEls.length, cloneEls.length);
        for (let i = 0; i < count; i++) {
          if (cloneEls[i].offsetTop + cloneEls[i].offsetHeight > pageH - this.bottomMarginPx()) {
            delta = liveEls[i].offsetTop - cloneEls[i].offsetTop;
            break;
          }
        }
        this.pageBreakTopPx.set(pageH + delta);
      } finally {
        host.remove();
      }
    };
    this.measureLayout = update;
    this.ro = new ResizeObserver(() => queueMicrotask(update));
    this.ro.observe(this.stage().nativeElement);
    this.ro.observe(this.sheet().nativeElement);
    update();
  }

  ngOnDestroy(): void {
    this.ro?.disconnect();
    this.pageStyleEl?.remove();
  }

  set<K extends keyof VaultSettings>(key: K, value: VaultSettings[K]): void {
    this.vs.update((v) => {
      v.settings[key] = value;
    });
  }

  setTheme(v: ThemeName): void {
    this.set('theme', v);
  }

  setUnitSystem(v: UnitSystem): void {
    this.set('unitSystem', v);
  }

  setPaperSize(v: PaperSizeId): void {
    this.set('paperSize', v);
  }

  setMarginPreset(v: MarginPresetId): void {
    const prev = this.s().marginPreset;
    if (v === 'custom' && prev !== 'custom') {
      const m = MARGIN_PRESETS[prev] ?? MARGIN_PRESETS.normal;
      this.vs.update((draft) => {
        draft.settings.marginPreset = 'custom';
        draft.settings.customMargins = {
          topMm: m.topBottomMm,
          rightMm: m.leftRightMm,
          bottomMm: m.topBottomMm,
          leftMm: m.leftRightMm,
        };
      });
      return;
    }
    this.set('marginPreset', v);
  }

  customMarginDisplay(side: keyof CustomMargins): number {
    const mm = this.s().customMargins[side];
    return this.s().unitSystem === 'in' ? Number((mm / 25.4).toFixed(2)) : Number(mm.toFixed(1));
  }

  setCustomMargin(side: keyof CustomMargins, raw: number | string): void {
    const n = typeof raw === 'number' ? raw : parseFloat(raw);
    if (!Number.isFinite(n) || n < 0) return;
    const mm = this.s().unitSystem === 'in' ? n * 25.4 : n;
    const clamped = Math.min(60, Math.max(0, Number(mm.toFixed(2))));
    this.vs.update((draft) => {
      draft.settings.marginPreset = 'custom';
      draft.settings.customMargins = { ...draft.settings.customMargins, [side]: clamped };
    });
  }

  stepCustomMargin(side: keyof CustomMargins, direction: -1 | 1): void {
    const step = this.s().unitSystem === 'in' ? 0.05 : 1;
    const next = Math.max(0, Number((this.customMarginDisplay(side) + direction * step).toFixed(2)));
    this.setCustomMargin(side, next);
  }

  // --- Visual editor helpers ---
  toggleEditMode(): void {
    if (this.ext.isSidePanel() && !this.ext.isPopup()) {
      this.ext.openInNewTab('tab=preview&edit=1');
      return;
    }
    const saving = this.editMode();
    if (saving) {
      this.flushSkillDrafts();
    }
    this.editMode.set(!saving);
    if (saving) {
      this.autoSaveSnapshot();
    }
  }

  confirmVaultPrompt(): void {
    const p = this.pendingVaultPrompt();
    if (!p) return;
    p.commit();
    this.pendingVaultPrompt.set(null);
  }

  dismissVaultPrompt(): void {
    this.pendingVaultPrompt.set(null);
  }

  setBulletDraft(expId: string, value: string): void {
    this.newBulletDrafts.update((d) => ({ ...d, [expId]: value }));
  }

  private isResumeOnlyExp(expId: string): boolean {
    if (!this.vs.resumeOnlyExperience().some((e) => e.id === expId)) return false;
    const sel = this.vs.selectedBulletIds();
    const extra = this.vs.resumeOnlyBullets();
    return !this.vs
      .vault()
      .experience.some((e) => e.id === expId && (e.bullets.some((b) => sel.has(b.id)) || (extra[e.id]?.length ?? 0) > 0));
  }

  addResumeBullet(expId: string): void {
    const text = (this.newBulletDrafts()[expId] ?? '').trim();
    if (!text) return;
    const id = `rb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const isResumeOnlyExp = this.isResumeOnlyExp(expId);

    if (isResumeOnlyExp) {
      this.vs.resumeOnlyExperience.update((list) =>
        list.map((e) => (e.id === expId ? { ...e, bullets: [...e.bullets, { id, text }] } : e)),
      );
    } else {
      this.vs.resumeOnlyBullets.update((map) => ({
        ...map,
        [expId]: [...(map[expId] ?? []), { id, text }],
      }));
    }
    this.setBulletDraft(expId, '');

    this.pendingVaultPrompt.set({
      label: 'bullet point',
      commit: () => {
        if (isResumeOnlyExp) {
          this.promoteResumeOnlyExperience(expId);
        } else {
          const newId = this.vs.addBullet(expId, text, true);
          this.vs.resumeOnlyBullets.update((map) => ({
            ...map,
            [expId]: (map[expId] ?? []).filter((b) => b.id !== id),
          }));
          if (this.vs.resumeBulletOrder()[expId]?.includes(id)) {
            this.vs.resumeBulletOrder.update((map) => ({
              ...map,
              [expId]: (map[expId] ?? []).map((bid) => (bid === id ? newId : bid)),
            }));
          }
        }
      },
    });
  }

  /** Vault bullets of this role that are not currently on the resume. */
  availableVaultBullets(expId: string): { id: string; text: string }[] {
    const exp = this.vs.vault().experience.find((x) => x.id === expId);
    if (!exp) return [];
    const onResume = this.vs.selectedExperience().find((x) => x.id === expId);
    const activeIds = new Set(onResume?.bullets.map((b) => b.id) ?? []);
    const activeTexts = new Set(onResume?.bullets.map((b) => b.text.trim()) ?? []);
    return exp.bullets.filter((b) => !activeIds.has(b.id) && !activeTexts.has(b.text.trim()));
  }

  readdVaultBullet(expId: string, bulletId: string): void {
    if (!bulletId) return;
    if (this.isResumeOnlyExp(expId)) {
      const bullet = this.vs.vault().experience.find((x) => x.id === expId)?.bullets.find((b) => b.id === bulletId);
      if (!bullet) return;
      this.vs.resumeOnlyExperience.update((list) =>
        list.map((e) => (e.id === expId ? { ...e, bullets: [...e.bullets, { ...bullet }] } : e)),
      );
      return;
    }
    this.vs.toggleBullet(bulletId, true);
  }

  removeResumeBullet(expId: string, bulletId: string): void {
    const inOverlay = (this.vs.resumeOnlyBullets()[expId] ?? []).some((b) => b.id === bulletId);
    if (inOverlay) {
      this.vs.resumeOnlyBullets.update((map) => ({
        ...map,
        [expId]: (map[expId] ?? []).filter((b) => b.id !== bulletId),
      }));
      return;
    }
    const inResumeExp =
      this.isResumeOnlyExp(expId) &&
      this.vs.resumeOnlyExperience().some((e) => e.id === expId && e.bullets.some((b) => b.id === bulletId));
    if (inResumeExp) {
      this.vs.resumeOnlyExperience.update((list) =>
        list.map((e) => (e.id === expId ? { ...e, bullets: e.bullets.filter((b) => b.id !== bulletId) } : e)),
      );
      return;
    }
    this.vs.toggleBullet(bulletId, false);
  }

  moveResumeExperience(expId: string, delta: -1 | 1): void {
    const visible = this.vs.selectedExperience();
    const visIdx = visible.findIndex((e) => e.id === expId);
    const targetVisIdx = visIdx + delta;
    if (visIdx < 0 || targetVisIdx < 0 || targetVisIdx >= visible.length) return;
    const otherId = visible[targetVisIdx].id;

    const r1 = this.vs.resumeOnlyExperience().findIndex((e) => e.id === expId);
    const r2 = this.vs.resumeOnlyExperience().findIndex((e) => e.id === otherId);
    if (r1 !== -1 && r2 !== -1) {
      this.vs.resumeOnlyExperience.update((list) => {
        const copy = [...list];
        [copy[r1], copy[r2]] = [copy[r2], copy[r1]];
        return copy;
      });
      return;
    }

    const vaultExps = this.vs.vault().experience;
    const i1 = vaultExps.findIndex((e) => e.id === expId);
    const i2 = vaultExps.findIndex((e) => e.id === otherId);
    if (i1 !== -1 && i2 !== -1) {
      this.vs.update((v) => {
        [v.experience[i1], v.experience[i2]] = [v.experience[i2], v.experience[i1]];
      });
    }
  }

  moveResumeBullet(expId: string, bulletId: string, delta: -1 | 1): void {
    const role = this.vs.selectedExperience().find((e) => e.id === expId);
    if (!role) return;
    const visIdx = role.bullets.findIndex((b) => b.id === bulletId);
    const targetVisIdx = visIdx + delta;
    if (visIdx < 0 || targetVisIdx < 0 || targetVisIdx >= role.bullets.length) return;
    const otherId = role.bullets[targetVisIdx].id;

    if (this.isResumeOnlyExp(expId)) {
      this.vs.resumeOnlyExperience.update((list) =>
        list.map((r) => {
          if (r.id !== expId) return r;
          const r1 = r.bullets.findIndex((b) => b.id === bulletId);
          const r2 = r.bullets.findIndex((b) => b.id === otherId);
          if (r1 === -1 || r2 === -1) return r;
          const copy = [...r.bullets];
          [copy[r1], copy[r2]] = [copy[r2], copy[r1]];
          return { ...r, bullets: copy };
        }),
      );
      return;
    }

    const vaultRole = this.vs.vault().experience.find((e) => e.id === expId);
    if (vaultRole) {
      const i1 = vaultRole.bullets.findIndex((b) => b.id === bulletId);
      const i2 = vaultRole.bullets.findIndex((b) => b.id === otherId);
      if (i1 !== -1 && i2 !== -1 && !this.vs.resumeBulletOrder()[expId]?.length) {
        this.vs.update((v) => {
          const r = v.experience.find((e) => e.id === expId);
          if (r) [r.bullets[i1], r.bullets[i2]] = [r.bullets[i2], r.bullets[i1]];
        });
        return;
      }
      const ids = role.bullets.map((b) => b.id);
      [ids[visIdx], ids[targetVisIdx]] = [ids[targetVisIdx], ids[visIdx]];
      this.vs.resumeBulletOrder.update((map) => ({ ...map, [expId]: ids }));
    }
  }

  updateNewRoleField<K extends 'role' | 'company' | 'startDate' | 'endDate' | 'bullet'>(key: K, value: string): void {
    this.newRole.update((r) => ({ ...r, [key]: value }));
  }

  startEditRole(exp: Experience): void {
    this.editingRoleId.set(exp.id);
    this.roleDraft.set({
      role: exp.role,
      company: exp.company,
      startDate: exp.startDate,
      endDate: exp.endDate,
    });
  }

  updateRoleDraftField<K extends 'role' | 'company' | 'startDate' | 'endDate'>(key: K, value: string): void {
    this.roleDraft.update((r) => ({ ...r, [key]: value }));
  }

  saveRoleEdit(): void {
    const expId = this.editingRoleId();
    if (!expId) return;
    const draft = this.roleDraft();
    const role = draft.role.trim();
    const company = draft.company.trim();
    const startDate = draft.startDate.trim();
    const endDate = draft.endDate.trim();
    if (!role && !company) return;

    const inResumeExp = this.isResumeOnlyExp(expId);
    if (inResumeExp) {
      this.vs.resumeOnlyExperience.update((list) =>
        list.map((e) => (e.id === expId ? { ...e, role, company, startDate, endDate } : e)),
      );
    } else if (this.vs.vault().experience.some((e) => e.id === expId)) {
      this.vs.update((v) => {
        const target = v.experience.find((e) => e.id === expId);
        if (target) {
          target.role = role;
          target.company = company;
          target.startDate = startDate;
          target.endDate = endDate;
        }
      });
    }
    this.editingRoleId.set(null);
  }

  cancelRoleEdit(): void {
    this.editingRoleId.set(null);
  }

  startEditBullet(expId: string, bullet: { id: string; text: string }): void {
    this.editingBullet.set({ expId, bulletId: bullet.id });
    this.bulletEditDraft.set(bullet.text);
  }

  saveBulletEdit(): void {
    const target = this.editingBullet();
    if (!target) return;
    const text = this.bulletEditDraft().trim();
    if (!text) return;

    const { expId, bulletId } = target;
    const inResumeExp =
      this.isResumeOnlyExp(expId) &&
      this.vs.resumeOnlyExperience().some((e) => e.id === expId && e.bullets.some((b) => b.id === bulletId));
    if (inResumeExp) {
      this.vs.resumeOnlyExperience.update((list) =>
        list.map((e) =>
          e.id === expId
            ? { ...e, bullets: e.bullets.map((b) => (b.id === bulletId ? { ...b, text } : b)) }
            : e,
        ),
      );
      this.editingBullet.set(null);
      return;
    }
    const vaultRole = this.vs.vault().experience.find((e) => e.id === expId);
    const vaultBullet = vaultRole?.bullets.find((x) => x.id === bulletId);
    if (vaultBullet) {
      this.vs.resumeBulletOverrides.update((m) => ({ ...m, [bulletId]: text }));
      if (text !== vaultBullet.text) {
        this.pendingVaultPrompt.set({
          label: 'bullet point edit',
          commit: () => {
            this.vs.update((v) => {
              const b = v.experience.find((e) => e.id === expId)?.bullets.find((x) => x.id === bulletId);
              if (b) b.text = text;
            });
            this.vs.resumeBulletOverrides.update((m) => {
              const copy = { ...m };
              delete copy[bulletId];
              return copy;
            });
          },
        });
      }
    } else if ((this.vs.resumeOnlyBullets()[expId] ?? []).some((b) => b.id === bulletId)) {
      this.vs.resumeOnlyBullets.update((map) => ({
        ...map,
        [expId]: (map[expId] ?? []).map((b) => (b.id === bulletId ? { ...b, text } : b)),
      }));
      this.pendingVaultPrompt.set({
        label: 'bullet point',
        commit: () => {
          this.vs.addBullet(expId, text, true);
          this.vs.resumeOnlyBullets.update((map) => ({
            ...map,
            [expId]: (map[expId] ?? []).filter((b) => b.id !== bulletId),
          }));
        },
      });
    } else {
      this.vs.resumeOnlyExperience.update((list) =>
        list.map((e) =>
          e.id === expId
            ? { ...e, bullets: e.bullets.map((b) => (b.id === bulletId ? { ...b, text } : b)) }
            : e,
        ),
      );
      this.pendingVaultPrompt.set({
        label: 'experience role',
        commit: () => this.promoteResumeOnlyExperience(expId),
      });
    }
    this.editingBullet.set(null);
  }

  cancelBulletEdit(): void {
    this.editingBullet.set(null);
  }

  addResumeExperience(): void {
    const draft = this.newRole();
    const role = draft.role.trim();
    const company = draft.company.trim();
    if (!role && !company) return;

    const expId = `re_${Date.now()}`;
    const bulletText = draft.bullet.trim();
    const exp: Experience = {
      id: expId,
      role,
      company,
      startDate: draft.startDate.trim(),
      endDate: draft.endDate.trim(),
      bullets: bulletText ? [{ id: `rb_${Date.now()}`, text: bulletText }] : [],
    };
    this.vs.resumeOnlyExperience.update((list) => [...list, exp]);
    this.newRole.set({ role: '', company: '', startDate: '', endDate: '', bullet: '' });
    this.addingRole.set(false);

    this.pendingVaultPrompt.set({
      label: 'experience role',
      commit: () => this.promoteResumeOnlyExperience(expId),
    });
  }

  private promoteResumeOnlyExperience(expId: string): void {
    const target = this.vs.resumeOnlyExperience().find((e) => e.id === expId);
    if (!target) return;
    const addedBulletIds: string[] = [];
    this.vs.update((v) => {
      const newExpId = nextId(v, 'exp');
      const bullets = target.bullets.map((b) => {
        const bid = nextId(v, 'b');
        addedBulletIds.push(bid);
        return { id: bid, text: b.text };
      });
      v.experience.push({
        id: newExpId,
        role: target.role,
        company: target.company,
        startDate: target.startDate,
        endDate: target.endDate,
        bullets,
      });
    });
    for (const bid of addedBulletIds) {
      this.vs.toggleBullet(bid, true);
    }
    this.vs.resumeOnlyExperience.update((list) => list.filter((e) => e.id !== expId));
  }

  removeResumeExperience(exp: Experience): void {
    if (this.isResumeOnlyExp(exp.id)) {
      this.vs.resumeOnlyExperience.update((list) => list.filter((e) => e.id !== exp.id));
      return;
    }
    for (const b of exp.bullets) {
      this.vs.toggleBullet(b.id, false);
    }
    this.vs.resumeOnlyBullets.update((map) => {
      const copy = { ...map };
      delete copy[exp.id];
      return copy;
    });
  }

  updateNewEduField<K extends 'degree' | 'institution' | 'year'>(key: K, value: string): void {
    this.newEdu.update((e) => ({ ...e, [key]: value }));
  }

  addResumeEducation(): void {
    const draft = this.newEdu();
    const degree = draft.degree.trim();
    const institution = draft.institution.trim();
    if (!degree && !institution) return;

    const id = `redu_${Date.now()}`;
    const entry = { id, degree, institution, year: draft.year.trim() };
    this.vs.resumeOnlyEducation.update((list) => [...list, entry]);
    this.newEdu.set({ degree: '', institution: '', year: '' });
    this.addingEdu.set(false);

    this.pendingVaultPrompt.set({
      label: 'education entry',
      commit: () => {
        const current = this.vs.resumeOnlyEducation().find((e) => e.id === id);
        if (!current) return;
        this.vs.update((v) => {
          v.education.push({
            id: nextId(v, 'edu'),
            degree: current.degree,
            institution: current.institution,
            year: current.year,
          });
        });
        this.vs.resumeOnlyEducation.update((list) => list.filter((e) => e.id !== id));
      },
    });
  }

  removeResumeEducation(edId: string): void {
    if (this.vs.resumeOnlyEducation().some((e) => e.id === edId)) {
      this.vs.resumeOnlyEducation.update((list) => list.filter((e) => e.id !== edId));
      return;
    }
    this.vs.hiddenEducationIds.update((set) => {
      const next = new Set(set);
      next.add(edId);
      return next;
    });
  }

  updateNewCertField<K extends 'name' | 'issuer' | 'year'>(key: K, value: string): void {
    this.newCert.update((c) => ({ ...c, [key]: value }));
  }

  addResumeCertification(): void {
    const draft = this.newCert();
    const name = draft.name.trim();
    const issuer = draft.issuer.trim();
    if (!name && !issuer) return;

    const id = `rcert_${Date.now()}`;
    const entry = { id, name, issuer, year: draft.year.trim() };
    this.vs.resumeOnlyCertifications.update((list) => [...list, entry]);
    this.newCert.set({ name: '', issuer: '', year: '' });
    this.addingCert.set(false);

    this.pendingVaultPrompt.set({
      label: 'certification entry',
      commit: () => {
        const current = this.vs.resumeOnlyCertifications().find((c) => c.id === id);
        if (!current) return;
        this.vs.update((v) => {
          v.certifications.push({
            id: nextId(v, 'cert'),
            name: current.name,
            issuer: current.issuer,
            year: current.year,
          });
        });
        this.vs.resumeOnlyCertifications.update((list) => list.filter((c) => c.id !== id));
      },
    });
  }

  removeResumeCertification(certId: string): void {
    if (this.vs.resumeOnlyCertifications().some((c) => c.id === certId)) {
      this.vs.resumeOnlyCertifications.update((list) => list.filter((c) => c.id !== certId));
      return;
    }
    this.vs.hiddenCertificationIds.update((set) => {
      const next = new Set(set);
      next.add(certId);
      return next;
    });
  }

  private flushSkillDrafts(): void {
    if (this.newSkillCategory().trim()) {
      this.addSkillCategory();
    }
    for (const [cat, draft] of Object.entries(this.categorySkillDrafts())) {
      if (draft.trim()) {
        this.addResumeSkillToCategory(cat);
      }
    }
    if (this.newSkill().trim()) {
      this.addResumeSkill();
    }
  }

  private updateSkillCategories(fn: (cats: SkillCategory[]) => SkillCategory[]): void {
    const tailoredCats = this.vs.tailoredSkillCategories();
    if (tailoredCats !== null) {
      this.vs.tailoredSkillCategories.set(fn(structuredClone(tailoredCats)));
      return;
    }
    this.vs.update((v) => {
      v.skillCategories = fn([...(v.skillCategories ?? [])]);
    });
  }

  setCategorySkillDraft(category: string, value: string): void {
    this.categorySkillDrafts.update((d) => ({ ...d, [category]: value }));
  }

  renameSkillCategory(oldName: string, rawNewName: string): void {
    const newName = rawNewName.trim();
    if (!newName || newName === oldName) return;
    const grpSkills = this.editSkillCategories().find((g) => g.category === oldName)?.skills ?? [];
    this.updateSkillCategories((cats) => {
      const oldIdx = cats.findIndex((c) => c.category === oldName);
      const existingNewIdx = cats.findIndex((c) => c.category.toLowerCase() === newName.toLowerCase());
      const movedSkills = oldIdx >= 0 ? cats[oldIdx].skills : grpSkills;
      if (oldIdx >= 0) cats.splice(oldIdx, 1);
      const targetIdx = cats.findIndex((c) => c.category.toLowerCase() === newName.toLowerCase());
      if (existingNewIdx >= 0 && targetIdx >= 0) {
        cats[targetIdx] = {
          ...cats[targetIdx],
          skills: [...new Set([...cats[targetIdx].skills, ...movedSkills])],
        };
      } else {
        const insertAt = oldIdx >= 0 ? Math.min(oldIdx, cats.length) : cats.length;
        cats.splice(insertAt, 0, { category: newName, skills: [...movedSkills] });
      }
      return cats;
    });
    const pendingDraft = this.categorySkillDrafts()[oldName];
    if (pendingDraft !== undefined) {
      this.categorySkillDrafts.update((d) => {
        const copy = { ...d };
        delete copy[oldName];
        if (!copy[newName]) copy[newName] = pendingDraft;
        return copy;
      });
    }
  }

  deleteSkillCategory(category: string): void {
    const grpSkills = new Set(
      this.editSkillCategories().find((g) => g.category === category)?.skills ?? [],
    );
    if (grpSkills.size) {
      const base = this.vs.tailoredSkills() ?? [...this.vs.vault().skills];
      this.vs.tailoredSkills.set(base.filter((sk) => !grpSkills.has(sk)));
    }
    this.updateSkillCategories((cats) => cats.filter((c) => c.category !== category));
  }

  addSkillCategory(): void {
    const name = this.newSkillCategory().trim();
    if (!name) return;
    this.updateSkillCategories((cats) => {
      if (!cats.some((c) => c.category.toLowerCase() === name.toLowerCase())) {
        cats.push({ category: name, skills: [] });
      }
      return cats;
    });
    this.newSkillCategory.set('');
  }

  addResumeSkillToCategory(category: string): void {
    const skill = (this.categorySkillDrafts()[category] ?? '').trim();
    if (!skill) return;
    this.setCategorySkillDraft(category, '');
    this.addResumeSkillValue(skill, category);
  }

  addResumeSkill(): void {
    const skill = this.newSkill().trim();
    if (!skill) return;
    this.newSkill.set('');
    this.addResumeSkillValue(skill);
  }

  private addResumeSkillValue(skill: string, category?: string): void {
    const tailored = this.vs.tailoredSkills();
    if (tailored !== null && !tailored.includes(skill)) {
      this.vs.tailoredSkills.set([...tailored, skill]);
    }
    if (category) {
      const existingVisible = this.editSkillCategories().find((g) => g.category === category)?.skills ?? [];
      const inSnapshotMode = this.vs.tailoredSkillCategories() !== null;
      if (inSnapshotMode && tailored === null) {
        const base = [...this.vs.vault().skills];
        if (!base.includes(skill)) this.vs.tailoredSkills.set([...base, skill]);
      }
      this.updateSkillCategories((cats) => {
        const next = cats.map((c) =>
          c.category === category ? c : { ...c, skills: c.skills.filter((s) => s !== skill) },
        );
        const idx = next.findIndex((c) => c.category === category);
        if (idx >= 0) {
          if (!next[idx].skills.includes(skill)) {
            next[idx] = { ...next[idx], skills: [...next[idx].skills, skill] };
          }
        } else {
          next.push({ category, skills: [...new Set([...existingVisible, skill])] });
        }
        return next;
      });
      if (!inSnapshotMode) {
        this.vs.update((v) => {
          if (!v.skills.includes(skill)) v.skills.push(skill);
        });
      }
      return;
    }

    const base = tailored ?? [...this.vs.vault().skills];
    if (!base.includes(skill)) {
      this.vs.tailoredSkills.set([...base, skill]);
    }
    this.pendingVaultPrompt.set({
      label: 'skill',
      commit: () => {
        this.vs.update((v) => addSkillToVault(v, skill));
      },
    });
  }

  removeResumeSkill(skill: string): void {
    const base = this.vs.tailoredSkills() ?? [...this.vs.vault().skills];
    this.vs.tailoredSkills.set(base.filter((s) => s !== skill));
  }

  startEditSummary(): void {
    this.summaryDraft.set(this.summary());
    this.editingSummary.set(true);
  }

  saveResumeSummary(): void {
    const text = this.summaryDraft().trim();
    this.vs.hiddenSummary.set(false);
    this.vs.tailoredSummary.set(text);
    this.editingSummary.set(false);

    if (text && text !== this.vs.vault().summary) {
      this.pendingVaultPrompt.set({
        label: 'summary',
        commit: () => {
          this.vs.update((v) => {
            v.summary = text;
          });
        },
      });
    }
  }

  removeResumeSummary(): void {
    this.vs.hiddenSummary.set(true);
    this.editingSummary.set(false);
  }

  /** "2022-03" → "03/2022"; other strings pass through. */
  fmt(d: string): string {
    const m = /^(\d{4})-(\d{2})$/.exec(d.trim());
    return m ? `${m[2]}/${m[1]}` : d;
  }

  readonly ext = inject(ExtensionService);
  private readonly layout = inject(LayoutService);

  private applyPageRule(): void {
    const p = this.paperSpec();
    const pad = this.sheetPadding();
    if (!this.pageStyleEl) {
      this.pageStyleEl = this.doc.createElement('style');
      this.pageStyleEl.id = 'resume-page-size-rule';
      this.doc.head.appendChild(this.pageStyleEl);
    }
    this.pageStyleEl.textContent = `@page { size: ${p.widthMm}mm ${p.heightMm}mm; margin: ${pad}; }`;
  }

  print(): void {
    this.applyPageRule();
    this.layout.markStepCompleted('preview');
    this.ext.exportPdf(this.contact().fullName);
  }

  // --- Saved Resumes Vault ---
  openSavedModal(): void {
    this.snapshotMsg.set(null);
    if (!this.snapshotNameDraft().trim()) {
      const active = this.savedResumes.resumes().find((r) => r.id === this.activeSnapshotId());
      this.snapshotNameDraft.set(active?.name || this.s().rodoCompanyName.trim() || '');
    }
    this.savedModalOpen.set(true);
  }

  captureCurrentSnapshot(): ResumeSnapshotData {
    return structuredClone({
      contact: this.contact(),
      summary: this.summary(),
      experience: this.vs.selectedExperience(),
      education: this.vs.visibleEducation(),
      certifications: this.vs.visibleCertifications(),
      skills: this.skills(),
      skillCategories: this.categorizedSkills(),
      settings: this.s(),
    });
  }

  saveCurrentSnapshot(updateActive = false): void {
    const targetId = updateActive ? this.activeSnapshotId() : null;
    this.commitSnapshot(this.snapshotNameDraft(), targetId);
  }

  overwriteSavedSnapshot(item: SavedResumeSnapshot): void {
    if (this.activeSnapshotId() && this.activeSnapshotId() !== item.id) return;
    const name = this.activeSnapshotId() === item.id ? this.snapshotNameDraft().trim() || item.name : item.name;
    this.commitSnapshot(name, item.id);
  }

  private autoSaveSnapshot(): void {
    const activeId = this.activeSnapshotId();
    const active = activeId ? this.savedResumes.resumes().find((r) => r.id === activeId) : null;
    const name =
      active?.name ||
      this.snapshotNameDraft().trim() ||
      this.s().rodoCompanyName.trim() ||
      this.contact().fullName.trim();
    this.commitSnapshot(name, active ? active.id : null);
  }

  private commitSnapshot(name: string, targetId: string | null): void {
    const saved = this.savedResumes.saveSnapshot(name, this.captureCurrentSnapshot(), targetId);
    this.activeSnapshotId.set(saved.id);
    this.snapshotNameDraft.set(saved.name);
    this.snapshotMsg.set({
      ok: true,
      text: targetId ? `Updated "${saved.name}".` : `Saved "${saved.name}" to Saved Resumes.`,
    });
  }

  loadSavedSnapshot(item: SavedResumeSnapshot): void {
    this.vs.loadResumeSnapshot(item.snapshot);
    this.activeSnapshotId.set(item.id);
    this.snapshotNameDraft.set(item.name);
    this.savedModalOpen.set(false);
  }

  deleteSavedSnapshot(id: string): void {
    this.savedResumes.deleteSnapshot(id);
    if (this.activeSnapshotId() === id) {
      this.activeSnapshotId.set(null);
    }
  }
}

function formatProfileLink(
  rawValue: string | undefined,
  domain: string,
  defaultPrefix: string,
): { url: string; display: string } | null {
  const raw = (rawValue || '').trim();
  if (!raw) return null;
  const escaped = domain.replace('.', '\\.');
  const hostRe = new RegExp(`^(?:https?:\\/\\/)?(?:www\\.)?${escaped}\\/?`, 'i');
  let path = raw.replace(hostRe, '').replace(/^\/+|\/+$/g, '');
  if (!path) return null;
  const prefixNoSlash = defaultPrefix.replace(/^\/+|\/+$/g, '');
  if (prefixNoSlash && !path.toLowerCase().startsWith(`${prefixNoSlash.toLowerCase()}/`)) {
    path = `${prefixNoSlash}/${path}`;
  }
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${domain}/${path}`;
  return { url, display: `/${path}` };
}
