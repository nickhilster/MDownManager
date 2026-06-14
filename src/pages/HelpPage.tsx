interface HelpPageProps {
  onStartTour: () => void;
}

export function HelpPage({ onStartTour: _onStartTour }: HelpPageProps) {
  return (
    <div className="flex items-center justify-center h-full text-[var(--color-text-muted)] text-sm">
      Help loading…
    </div>
  );
}
