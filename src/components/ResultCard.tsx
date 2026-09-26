import { dismissResult, useResults, type ResultCard as ResultCardData, type AddCharResult, type RemoveCharResult } from '../roe/results';
import type { CatalogEntry } from '../roe/types';

const nameFor = (byId: Map<number, CatalogEntry>, id: number) => byId.get(id)?.n ?? `#${id}`;

export function addLine(c: AddCharResult, byId: Map<number, CatalogEntry>): string {
  if (c.status === 'offline') return `${c.name}: offline`;
  if (c.status === 'full') return `${c.name}: full (30 active already)`;
  if (c.status === 'no-response') return `${c.name}: no response from the addon (state may still have changed)`;
  if (c.status === 'addon-error') return `${c.name}: addon error`;
  const parts: string[] = [];
  if (c.added.length) parts.push(`added ${c.added.map((id) => nameFor(byId, id)).join(', ')}`);
  if (c.notAccepted.length) parts.push(`refused (probably locked): ${c.notAccepted.map((id) => nameFor(byId, id)).join(', ')}`);
  if (c.skipActive.length) parts.push(`already active: ${c.skipActive.map((id) => nameFor(byId, id)).join(', ')}`);
  if (c.skipDone.length) parts.push(`already completed: ${c.skipDone.map((id) => nameFor(byId, id)).join(', ')}`);
  if (c.skipAuto.length) parts.push(`daily (can't add): ${c.skipAuto.map((id) => nameFor(byId, id)).join(', ')}`);
  return `${c.name}: ${parts.join(' · ') || 'nothing to do'}`;
}

export function removeLine(c: RemoveCharResult, byId: Map<number, CatalogEntry>): string {
  if (c.status === 'offline') return `${c.name}: offline`;
  if (c.status === 'no-response') return `${c.name}: no response from the addon (state may still have changed)`;
  if (c.status === 'addon-error') return `${c.name}: addon error`;
  const parts: string[] = [];
  if (c.removed.length) parts.push(`removed ${c.removed.map((id) => nameFor(byId, id)).join(', ')}`);
  if (c.notRemoved.length) parts.push(`not removed: ${c.notRemoved.map((id) => nameFor(byId, id)).join(', ')}`);
  if (c.skipNotActive.length) parts.push(`wasn't active: ${c.skipNotActive.map((id) => nameFor(byId, id)).join(', ')}`);
  return `${c.name}: ${parts.join(' · ') || 'nothing to do'}`;
}

function CardBody({ card, byId }: { card: ResultCardData; byId: Map<number, CatalogEntry> }) {
  return (
    <>
      {card.kind === 'add'
        ? card.chars.map((c) => <div key={c.name} className="text-[11px] text-fg-3 leading-relaxed">{addLine(c, byId)}</div>)
        : card.chars.map((c) => <div key={c.name} className="text-[11px] text-fg-3 leading-relaxed">{removeLine(c, byId)}</div>)}
    </>
  );
}

export function ResultCards({ byId }: { byId: Map<number, CatalogEntry> }) {
  const results = useResults();
  if (results.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 mb-2">
      {results.map((r) => (
        <div key={r.id} className="rounded-xl bg-surface border border-line px-3.5 py-2.5">
          <div className="flex items-start justify-between gap-2 mb-1">
            <span className="text-[11px] font-bold text-fg uppercase tracking-wide">{r.kind === 'add' ? 'Add result' : 'Remove result'}</span>
            <button onClick={() => dismissResult(r.id)} aria-label="Dismiss" className="le-tap text-fg-4 hover:text-fg-2 leading-none text-base">×</button>
          </div>
          <CardBody card={r} byId={byId} />
        </div>
      ))}
    </div>
  );
}
