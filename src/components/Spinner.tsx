/** Small "work in progress" ring, sized to surrounding text and coloured by currentColor. Spins only
 * when the OS allows motion; with reduced motion it stays a static ring, which still reads as busy.
 * Decorative (aria-hidden): the surrounding control's text or title carries the meaning. */
export function Spinner({ className = 'w-3 h-3' }: { className?: string }) {
  return <span aria-hidden="true" className={`inline-block shrink-0 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin ${className}`} />;
}
