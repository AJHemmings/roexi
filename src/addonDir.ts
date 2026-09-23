/** Works out which folder the user meant when they pick one for the addon, so "Change Folder" /
 * "Set Folder" accept what people naturally choose: the addons\roexi folder itself, or Windower's
 * addons folder (we use its roexi subfolder, which the installer creates on a fresh install).
 * `hasAddon` reports whether a folder contains roexi.lua; it's injected so this stays testable.
 * Returns null for a folder that is neither, so an update can never land somewhere unrelated. */
export async function resolveAddonDir(picked: string, hasAddon: (dir: string) => Promise<boolean>): Promise<string | null> {
  const dir = picked.replace(/[\\/]+$/, '');
  if (await hasAddon(dir)) return dir;
  const sub = `${dir}\\roexi`;
  if (await hasAddon(sub)) return sub;
  if (/[\\/]addons$/i.test(dir)) return sub;
  if (/[\\/]roexi$/i.test(dir)) return dir;
  return null;
}
