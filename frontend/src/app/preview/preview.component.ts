import { DOCUMENT } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnDestroy, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideArrowDown, LucideArrowUp, LucideCheck, LucideDynamicIcon, LucideFileDown, LucidePencil, LucidePlus, LucideTrash2, LucideX } from '@lucide/angular';
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
  PaperSizeId,
  THEMES,
  ThemeName,
  UNIT_SYSTEMS,
  UnitSystem,
  VaultSettings,
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
  readonly editMode = signal(false);
  readonly pendingVaultPrompt = signal<{ label: string; commit: () => void } | null>(null);

  readonly newBulletDrafts = signal<Record<string, string>>({});
  readonly addingRole = signal(false);
  readonly newRole = signal({ role: '', company: '', startDate: '', endDate: '', bullet: '' });
  readonly addingEdu = signal(false);
  readonly newEdu = signal({ degree: '', institution: '', year: '' });
  readonly addingCert = signal(false);
  readonly newCert = signal({ name: '', issuer: '', year: '' });
  readonly newSkill = signal('');
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
  private pageStyleEl: HTMLStyleElement | null = null;
  private measureLayout: (() => void) | null = null;

  constructor() {
    effect(() => {
      const p = this.paperSpec();
      if (!this.pageStyleEl) {
        this.pageStyleEl = this.doc.createElement('style');
        this.pageStyleEl.id = 'resume-page-size-rule';
        this.doc.head.appendChild(this.pageStyleEl);
      }
      this.pageStyleEl.textContent = `@page { size: ${p.widthMm}mm ${p.heightMm}mm; margin: 0; }`;
    });
    effect(() => {
      this.editMode();
      this.paperSpec();
      this.marginSpec();
      if (this.measureLayout) {
        queueMicrotask(() => this.measureLayout?.());
      }
    });
  }

  readonly contact = computed(() => this.vs.snapshotContact() ?? this.vs.vault().contact);
  readonly showPhoto = computed(() => this.s().showPhoto && !!this.contact().photoDataUrl);

  readonly summary = computed(() => (this.vs.hiddenSummary() ? '' : (this.vs.tailoredSummary() ?? this.vs.vault().summary)));
  readonly skills = computed(() => this.vs.tailoredSkills() ?? this.vs.vault().skills);

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

      // Exclude block-level editor-only controls (.no-print) so edit buttons/forms
      // don't trigger false 1-page overflow or misplace the page-1 limit line.
      let extraTotal = 0;
      let extraAboveLimit = 0;
      const editorBlocks = sheetEl.querySelectorAll<HTMLElement>(
        '.r-inline-add.no-print, .r-inline-form.no-print, .r-skills-edit.no-print',
      );
      editorBlocks.forEach((el) => {
        const style = getComputedStyle(el);
        const h =
          el.offsetHeight +
          (parseFloat(style.marginTop || '0') || 0) +
          (parseFloat(style.marginBottom || '0') || 0);
        extraTotal += h;
        if (el.offsetTop < pageH + extraAboveLimit) {
          extraAboveLimit += h;
        }
      });

      this.printableHeight.set(Math.max(pageH, totalH - extraTotal));
      this.pageBreakTopPx.set(pageH + extraAboveLimit);
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

  // --- Visual editor helpers ---
  toggleEditMode(): void {
    this.editMode.update((v) => !v);
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

  addResumeBullet(expId: string): void {
    const text = (this.newBulletDrafts()[expId] ?? '').trim();
    if (!text) return;
    const id = `rb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const isResumeOnlyExp = this.vs.resumeOnlyExperience().some((e) => e.id === expId);

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
          this.vs.addBullet(expId, text, true);
          this.vs.resumeOnlyBullets.update((map) => ({
            ...map,
            [expId]: (map[expId] ?? []).filter((b) => b.id !== id),
          }));
        }
      },
    });
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
    const inResumeExp = this.vs.resumeOnlyExperience().some((e) => e.id === expId);
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

    const vaultExps = this.vs.vault().experience;
    const i1 = vaultExps.findIndex((e) => e.id === expId);
    const i2 = vaultExps.findIndex((e) => e.id === otherId);
    if (i1 !== -1 && i2 !== -1) {
      this.vs.update((v) => {
        [v.experience[i1], v.experience[i2]] = [v.experience[i2], v.experience[i1]];
      });
      return;
    }

    const r1 = this.vs.resumeOnlyExperience().findIndex((e) => e.id === expId);
    const r2 = this.vs.resumeOnlyExperience().findIndex((e) => e.id === otherId);
    if (r1 !== -1 && r2 !== -1) {
      this.vs.resumeOnlyExperience.update((list) => {
        const copy = [...list];
        [copy[r1], copy[r2]] = [copy[r2], copy[r1]];
        return copy;
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

    const vaultRole = this.vs.vault().experience.find((e) => e.id === expId);
    if (vaultRole) {
      const i1 = vaultRole.bullets.findIndex((b) => b.id === bulletId);
      const i2 = vaultRole.bullets.findIndex((b) => b.id === otherId);
      if (i1 !== -1 && i2 !== -1) {
        this.vs.update((v) => {
          const r = v.experience.find((e) => e.id === expId);
          if (r) [r.bullets[i1], r.bullets[i2]] = [r.bullets[i2], r.bullets[i1]];
        });
        return;
      }
      const extra = this.vs.resumeOnlyBullets()[expId] ?? [];
      const e1 = extra.findIndex((b) => b.id === bulletId);
      const e2 = extra.findIndex((b) => b.id === otherId);
      if (e1 !== -1 && e2 !== -1) {
        this.vs.resumeOnlyBullets.update((map) => {
          const copy = [...(map[expId] ?? [])];
          [copy[e1], copy[e2]] = [copy[e2], copy[e1]];
          return { ...map, [expId]: copy };
        });
      }
      return;
    }

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

    const isVaultRole = this.vs.vault().experience.some((e) => e.id === expId);
    if (isVaultRole) {
      this.vs.update((v) => {
        const target = v.experience.find((e) => e.id === expId);
        if (target) {
          target.role = role;
          target.company = company;
          target.startDate = startDate;
          target.endDate = endDate;
        }
      });
    } else {
      this.vs.resumeOnlyExperience.update((list) =>
        list.map((e) => (e.id === expId ? { ...e, role, company, startDate, endDate } : e)),
      );
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
    if (this.vs.resumeOnlyExperience().some((e) => e.id === exp.id)) {
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

  addResumeSkill(): void {
    const skill = this.newSkill().trim();
    if (!skill) return;
    const base = this.vs.tailoredSkills() ?? [...this.vs.vault().skills];
    if (!base.includes(skill)) {
      this.vs.tailoredSkills.set([...base, skill]);
    }
    this.newSkill.set('');

    this.pendingVaultPrompt.set({
      label: 'skill',
      commit: () => {
        this.vs.update((v) => {
          if (!v.skills.includes(skill)) v.skills.push(skill);
        });
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

  print(): void {
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
      settings: this.s(),
    });
  }

  saveCurrentSnapshot(updateActive = false): void {
    const targetId = updateActive ? this.activeSnapshotId() : null;
    const saved = this.savedResumes.saveSnapshot(
      this.snapshotNameDraft(),
      this.captureCurrentSnapshot(),
      targetId,
    );
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
