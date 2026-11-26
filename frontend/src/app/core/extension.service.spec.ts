import { TestBed } from '@angular/core/testing';
import { ExtensionService } from './extension.service';

describe('ExtensionService', () => {
  let service: ExtensionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ExtensionService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('detects when not running inside a Chrome extension', () => {
    // In headless test runner, chrome.runtime.id is not defined
    expect(service.isExtension()).toBeFalse();
  });

  it('detects when not running inside a Chrome extension side panel', () => {
    expect(service.isSidePanel()).toBeFalse();
  });

  it('returns null from extractFromActiveTab when not in extension environment', async () => {
    const result = await service.extractFromActiveTab();
    expect(result).toBeNull();
  });

  it('falls back to window.open when openInNewTab is called in web environment', async () => {
    const spy = spyOn(window, 'open');
    await service.openInNewTab();
    expect(spy).toHaveBeenCalled();
  });

  it('focuses an existing web popup window instead of opening a new one', async () => {
    const focusSpy = jasmine.createSpy('focus');
    const mockPopup = { closed: false, focus: focusSpy } as unknown as Window;
    const openSpy = spyOn(window, 'open').and.returnValue(mockPopup);

    await service.openInNewTab('tab=preview&edit=1');
    await service.openInNewTab('tab=preview&edit=1');

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(focusSpy).toHaveBeenCalledTimes(1);
  });

  it('focuses an existing extension popup window instead of creating a duplicate', async () => {
    const win = window as unknown as { chrome?: unknown };
    const prevChrome = win.chrome;
    const createWinSpy = jasmine.createSpy('windows.create').and.resolveTo({});
    const updateWinSpy = jasmine.createSpy('windows.update').and.resolveTo({});
    const updateTabSpy = jasmine.createSpy('tabs.update').and.resolveTo({});
    const queryTabsSpy = jasmine
      .createSpy('tabs.query')
      .and.resolveTo([{ id: 42, windowId: 7, url: 'chrome-extension://ext-id/index.html?tab=preview&edit=1' }]);

    win.chrome = {
      runtime: { id: 'ext-id', getURL: (p: string) => `chrome-extension://ext-id/${p}` },
      tabs: { query: queryTabsSpy, update: updateTabSpy },
      windows: { create: createWinSpy, update: updateWinSpy },
    };

    try {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const extService = TestBed.inject(ExtensionService);
      await extService.openInNewTab('tab=preview&edit=1');

      expect(queryTabsSpy).toHaveBeenCalledWith({ url: 'chrome-extension://ext-id/index.html*' });
      expect(updateWinSpy).toHaveBeenCalledWith(7, { focused: true });
      expect(updateTabSpy).toHaveBeenCalledWith(42, { active: true });
      expect(createWinSpy).not.toHaveBeenCalled();
    } finally {
      win.chrome = prevChrome;
    }
  });

  it('calls window.print with candidate name in title in web environment', () => {
    const printSpy = spyOn(window, 'print');
    const originalTitle = document.title;
    service.exportPdf('Ada Lovelace');
    expect(printSpy).toHaveBeenCalled();
    expect(document.title).toBe(originalTitle);
  });
});
