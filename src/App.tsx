import { useEffect, useState, type ReactElement } from 'react';
import { MotionConfig, AnimatePresence, motion } from 'motion/react';
import TitleBar from './TitleBar';
import NavRail, { type Section } from './NavRail';
import { ErrorBoundary } from './ErrorBoundary';
import { useSettings } from './settings';
import { getMode, applyWindowSize, watchMaximized } from './windowSize';
import RecordsView from './views/RecordsView';
import SetsView from './views/SetsView';
import SettingsView from './views/SettingsView';

const VIEWS: Record<Section, ReactElement> = {
  records: <RecordsView />,
  sets: <SetsView />,
  settings: <SettingsView />,
};

export default function App() {
  const [section, setSection] = useState<Section>('records');
  const uiScale = useSettings().uiScale;
  useEffect(() => {
    const el = document.documentElement;
    if (uiScale && uiScale !== 1) el.style.setProperty('zoom', String(uiScale));
    else el.style.removeProperty('zoom');
  }, [uiScale]);
  useEffect(() => { void applyWindowSize(getMode()); }, []);
  useEffect(() => {
    // watchMaximized() resolves asynchronously; if this effect's cleanup fires first (React's
    // mount→unmount→mount dev cycle does this), calling the still-default no-op `un` would leak
    // the real listener registered a moment later. `cancelled` makes the late resolution unregister
    // itself instead.
    let cancelled = false;
    let un = () => {};
    void watchMaximized().then((u) => { if (cancelled) u(); else un = u; });
    return () => { cancelled = true; un(); };
  }, []);
  return (
    <MotionConfig reducedMotion="user">
      <div className="le-bg" />
      <div className="fixed inset-0 flex flex-col text-fg-2 @container">
        <TitleBar />
        <div className="flex-1 min-h-0 flex">
          <NavRail active={section} onSelect={setSection} />
          <main className="flex-1 min-h-0 overflow-y-auto">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={section} className="h-full" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}>
                <ErrorBoundary>{VIEWS[section]}</ErrorBoundary>
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </MotionConfig>
  );
}
