import { useEffect } from "react";
import helpHtml from "@/assets/help.html?raw";

interface HelpPageProps {
  onStartTour: () => void;
}

export function HelpPage({ onStartTour }: HelpPageProps) {
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data === "start-tour") onStartTour();
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onStartTour]);

  return (
    <div className="h-full w-full overflow-hidden">
      <iframe
        srcDoc={helpHtml}
        title="MDownManager Help"
        className="w-full h-full border-0"
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}
