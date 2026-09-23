import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Tauri 2 refuses any plugin command that isn't granted in a capability file, and it only does so at
// runtime, on the user's machine. v0.1.0 and v0.2.0 shipped with the updater, dialog and process
// plugins installed but not granted, so the update check, the folder picker and the post-update
// relaunch were all silently broken. Nothing at build time catches that, so these tests do.

const CAPABILITIES = 'src-tauri/capabilities/default.json';

function grantedPermissions(json: string): string[] {
  return (JSON.parse(json) as { permissions: (string | { identifier: string })[] }).permissions
    .map((p) => (typeof p === 'string' ? p : p.identifier));
}

// `@tauri-apps/plugin-foo-bar` → permission prefix `foo-bar:`
function importedPlugins(dir: string): string[] {
  const found = new Set<string>();
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== '__tests__') for (const p of importedPlugins(path)) found.add(p);
    } else if (/\.(ts|tsx)$/.test(name)) {
      for (const m of readFileSync(path, 'utf8').matchAll(/@tauri-apps\/plugin-([a-z-]+)/g)) found.add(m[1]);
    }
  }
  return [...found];
}

/** Plugins the frontend uses that have no permission granted at all. */
function ungrantedPlugins(plugins: string[], granted: string[]): string[] {
  return plugins.filter((plugin) => !granted.some((g) => g.startsWith(`${plugin}:`)));
}

// The specific commands roexi depends on: the update check + install, the addon folder picker, and
// relaunch() after an app update (which plugin-process implements as its `restart` command).
const REQUIRED = ['updater:default', 'dialog:allow-open', 'process:allow-restart'];

describe('Tauri capabilities', () => {
  const granted = grantedPermissions(readFileSync(CAPABILITIES, 'utf8'));

  it('grants a permission for every Tauri plugin the frontend imports', () => {
    const plugins = importedPlugins('src');
    expect(plugins.length).toBeGreaterThan(0);
    expect(ungrantedPlugins(plugins, granted)).toEqual([]);
  });

  it('grants the commands the updater and folder picker depend on', () => {
    expect(REQUIRED.filter((p) => !granted.includes(p))).toEqual([]);
  });

  it('would have caught the v0.1.0 bug (core-only permissions)', () => {
    const v010 = ['core:default', 'core:window:allow-start-dragging', 'core:window:allow-close'];
    expect(ungrantedPlugins(['dialog', 'process', 'updater'], v010)).toEqual(['dialog', 'process', 'updater']);
    expect(REQUIRED.filter((p) => !v010.includes(p))).toEqual(REQUIRED);
  });
});
