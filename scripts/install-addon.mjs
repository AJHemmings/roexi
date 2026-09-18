// Copies addon/roexi/ into the Windower addons folder.
//   npm run addon:install                    -> E:\ffxi\addons\roexi
//   WINDOWER_ADDONS=D:\Windower\addons npm run addon:install
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(process.env.WINDOWER_ADDONS ?? 'E:\\ffxi\\addons', 'roexi');
mkdirSync(dest, { recursive: true });
cpSync(join(ROOT, 'addon', 'roexi'), dest, { recursive: true });
console.log(`installed addon to ${dest}`);
