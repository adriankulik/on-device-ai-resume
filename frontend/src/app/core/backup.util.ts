import { MasterVault, normalizeVault } from './vault.model';
import { VaultService } from './vault.service';
import { SavedResumeSnapshot, SavedResumesService, downloadJsonFile } from './saved-resumes.service';

/** Downloads a JSON backup containing the Master Career Vault and all saved resume snapshots. */
export function exportVaultBackup(doc: Document, vault: MasterVault, savedResumes: SavedResumeSnapshot[]): void {
  const bundle = {
    version: 1,
    exportedAt: new Date().toISOString(),
    vault,
    savedResumes,
  };
  downloadJsonFile(doc, JSON.stringify(bundle, null, 2), 'on-device-ai-resume-backup.json');
}

/** Parses and applies an exported backup JSON bundle (or raw MasterVault JSON) into VaultService and SavedResumesService. */
export function importVaultBackupText(text: string, vs: VaultService, savedResumes: SavedResumesService): string {
  const parsed = JSON.parse(text) as Record<string, unknown>;
  if (parsed && typeof parsed === 'object' && 'vault' in parsed && !Array.isArray(parsed)) {
    vs.setVault(normalizeVault(parsed['vault']), true);
    const count = Array.isArray(parsed['savedResumes']) ? savedResumes.replaceAll(parsed['savedResumes']) : 0;
    return `Imported Career Vault and ${count} saved resume(s).`;
  }
  vs.importJson(text);
  return 'Career Vault imported.';
}
