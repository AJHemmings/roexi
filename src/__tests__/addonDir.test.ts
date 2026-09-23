import { describe, it, expect } from 'vitest';
import { resolveAddonDir } from '../addonDir';

// Fake filesystem: the set of folders that contain a roexi.lua.
const withAddonIn = (...dirs: string[]) => async (dir: string) => dirs.includes(dir);

describe('resolveAddonDir', () => {
  it('accepts the addons\\roexi folder itself when it holds roexi.lua', async () => {
    expect(await resolveAddonDir('E:\\ffxi\\addons\\roexi', withAddonIn('E:\\ffxi\\addons\\roexi'))).toBe('E:\\ffxi\\addons\\roexi');
  });

  it('accepts the Windower addons folder and uses its roexi subfolder', async () => {
    expect(await resolveAddonDir('E:\\ffxi\\addons', withAddonIn('E:\\ffxi\\addons\\roexi'))).toBe('E:\\ffxi\\addons\\roexi');
  });

  it('targets addons\\roexi for a fresh install when the addon is not there yet', async () => {
    expect(await resolveAddonDir('D:\\Windower\\addons\\', withAddonIn())).toBe('D:\\Windower\\addons\\roexi');
  });

  it('accepts an empty folder named roexi as a fresh install target', async () => {
    expect(await resolveAddonDir('D:\\Windower\\addons\\roexi', withAddonIn())).toBe('D:\\Windower\\addons\\roexi');
  });

  it('rejects an unrelated folder', async () => {
    expect(await resolveAddonDir('C:\\Users\\me\\Downloads', withAddonIn())).toBeNull();
  });
});
