/**
 * One-time import of the pre-0.2.0 config file into the row's settings
 * document. The old version stored distro/user/wsl.exe in
 * `${DSH_HOME:-~/.dsh}/wsl-keepalive.json`; from 0.2.0 those are the row's
 * Volatile Config, persisted by the settings service into the profile's
 * Cordis patch. This mirrors the settings service's own `settings.yaml`
 * import: values are written into the entry of the same id, and the legacy
 * file is renamed to `<name>.imported` so the import happens once.
 * @module wsl-keepalive/migrate
 */

import { existsSync, promises as fsp } from 'node:fs'
import { homedir } from 'node:os'

/** Minimal writer face of the host settings service used by the import. */
export interface SettingsWriter {
  /**
   * Merge fields into one entry's stored user section.
   * @param ns - profile entry id.
   * @param patch - fields to merge.
   * @returns settlement after persistence.
   */
  update(ns: string, patch: Record<string, string>, expectedRevision?: number): Promise<void>
}

/** Legacy file basename (matches the pre-0.2.0 plugin). */
const CONFIG_NAME = 'wsl-keepalive.json'

/** Suffix marking a file already imported. */
const IMPORTED_SUFFIX = '.imported'

/** Legacy JSON keys -> new Config field names. */
const FIELD_MAP: Readonly<Record<string, string>> = {
  'wsl-dist-name': 'wslDistName',
  'wsl-user-name': 'wslUserName',
  'wsl-exec-path': 'wslExecPath',
}

/** Path of the legacy config file, honoring DSH_HOME and HOME. */
export function legacyConfigPath(): string {
  const dshHome = process.env.DSH_HOME
  if (dshHome) return dshHome + '/' + CONFIG_NAME
  const home = process.env.HOME || homedir()
  return home ? home + '/.dsh/' + CONFIG_NAME : CONFIG_NAME
}

/** Read the legacy JSON as new-field values; undefined when absent or unreadable. */
export async function readLegacyConfig(): Promise<Record<string, string> | undefined> {
  const path = legacyConfigPath()
  if (!existsSync(path)) return undefined
  try {
    const text = await fsp.readFile(path, 'utf-8')
    const parsed = JSON.parse(text || '{}') as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [legacyKey, field] of Object.entries(FIELD_MAP)) {
      const value = parsed[legacyKey]
      if (typeof value === 'string' && value.trim() !== '') out[field] = value.trim()
    }
    return out
  } catch (error) {
    console.error('[wsl-keepalive] cannot read legacy config:', String((error as Error | undefined)?.message ?? error))
    return undefined
  }
}

/**
 * Import the legacy file's values into the settings document, then rename the
 * file to `<name>.imported`. Fields already set in the live Config are not
 * overwritten. The file is left in place when the write is refused, so a later
 * start retries the import.
 * @param settings - the settings service writer.
 * @param current - live Config values.
 * @param ns - profile entry id.
 * @returns the imported field names (empty when nothing was migrated).
 */
export async function migrateLegacyConfig(
  settings: SettingsWriter,
  current: Record<string, string>,
  ns: string,
): Promise<string[]> {
  const importable = await readLegacyConfig()
  if (importable === undefined) return []
  const patch: Record<string, string> = {}
  for (const [field, value] of Object.entries(importable)) {
    if ((current[field] ?? '').trim() === '') patch[field] = value
  }
  const fields = Object.keys(patch)
  // Nothing to import: every field already carries a value. Keep the file.
  if (fields.length === 0) return []
  try {
    await settings.update(ns, patch)
  } catch (error) {
    console.error(
      '[wsl-keepalive] legacy config import rejected; values remain in',
      legacyConfigPath(),
      String((error as Error | undefined)?.message ?? error),
    )
    return []
  }
  // The write landed; retire the legacy file so the import is one-time.
  try {
    await fsp.rename(legacyConfigPath(), legacyConfigPath() + IMPORTED_SUFFIX)
  } catch (error) {
    console.error('[wsl-keepalive] imported legacy config but could not rename the file:', String((error as Error | undefined)?.message ?? error))
  }
  return fields
}
