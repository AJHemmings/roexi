// Copies addon/roexi/ into the Windower addons folder.
//   npm run addon:install                    -> E:\ffxi\addons\roexi
//   WINDOWER_ADDONS=D:\Windower\addons npm run addon:install
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(process.env.WINDOWER_ADDONS ?? 'E:\\ffxi\\addons', 'roexi');
const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(join(ROOT, 'addon', 'roexi'), dest, { recursive: true });

// package.json's version is the single source of truth for both the app and the addon - stamp
// it into the installed copy so they can never drift apart, rather than relying on the .lua
// source's own _addon.version literal staying manually in sync release to release.
const luaPath = join(dest, 'roexi.lua');
const lua = readFileSync(luaPath, 'utf8');
if (!/_addon\.version = '[^']*'/.test(lua)) throw new Error(`_addon.version line not found in ${luaPath}`);
writeFileSync(luaPath, lua.replace(/_addon\.version = '[^']*'/, `_addon.version = '${version}'`));

console.log(`installed addon to ${dest} (v${version})`);
