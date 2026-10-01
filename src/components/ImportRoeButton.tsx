import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { Modal } from '../overlay';
import { inTauri } from '../bridge';
import { useCatalog } from '../roe/catalog';
import { parseRoeProfiles, type RoeProfile } from '../roe/importRoe';
import { ImportRoeModal } from './ImportRoeModal';

const NOT_ROE = "Couldn't find any roe profiles in that file. Pick addons\\roe\\data\\settings.xml.";

// null = the user cancelled the picker. Outside Tauri (npm run dev with the mock feed) there's no
// file picker, so a bundled real settings.xml stands in — that's how the preview gets tested in a
// browser.
async function readRoeXml(): Promise<string | null> {
  if (!inTauri) return (await import('../dev/sampleRoeSettings')).SAMPLE_ROE_SETTINGS;
  const picked = await openDialog({ multiple: false, directory: false, title: 'Select addons\\roe\\data\\settings.xml', filters: [{ name: 'roe settings', extensions: ['xml'] }] });
  if (typeof picked !== 'string') return null;
  return invoke<string>('read_text_file', { path: picked });
}

type State = { kind: 'error'; msg: string } | { kind: 'preview'; profiles: RoeProfile[] } | null;

/** "Import from roe": pick the file, read it, parse it, then open the preview (or a small error
 * modal). Self-contained so SetsView can drop it into both its header and its empty state. */
export function ImportRoeButton() {
  const catalog = useCatalog();
  const [state, setState] = useState<State>(null);
  const close = () => setState(null);

  const start = async () => {
    let xml: string | null;
    try { xml = await readRoeXml(); } catch { setState({ kind: 'error', msg: "Couldn't read that file." }); return; }
    if (xml == null) return;
    const profiles = parseRoeProfiles(xml);
    setState(profiles && profiles.length > 0 ? { kind: 'preview', profiles } : { kind: 'error', msg: NOT_ROE });
  };

  return (
    <>
      <button disabled={!catalog} onClick={() => void start()}
        className="le-tap px-3 py-1.5 text-[12px] font-bold rounded-md bg-field border border-line text-fg-2 hover:text-fg disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
        Import from roe
      </button>
      {state?.kind === 'preview' && catalog && <ImportRoeModal profiles={state.profiles} byId={catalog.byId} onClose={close} />}
      {state?.kind === 'error' && (
        <Modal onClose={close}>
          {(dismiss) => (
            <div className="p-4 flex flex-col gap-3">
              <div className="text-[13px] font-bold text-fg">Import from roe</div>
              <div className="text-[12px] text-fg-3 leading-relaxed">{state.msg}</div>
              <div className="flex justify-end">
                <button onClick={dismiss} className="le-tap px-3 py-1.5 text-[12px] font-bold rounded-md bg-accent text-on-accent">OK</button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
