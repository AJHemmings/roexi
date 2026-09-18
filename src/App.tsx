import { useKnownCharacters } from './bridge';

export default function App() {
  const chars = useKnownCharacters();
  return (
    <div className="p-4 text-sm">
      <div className="mb-2 font-bold">roexi · {chars.length} characters</div>
      {chars.map((c) => (
        <div key={c.name}>
          {c.online ? '●' : '○'} {c.name} — {c.active.length}/30 active · pages {[...c.donePagesKnown].join(',') || 'none'}
        </div>
      ))}
    </div>
  );
}
