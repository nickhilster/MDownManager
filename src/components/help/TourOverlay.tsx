import { useLayoutEffect, useRef, useState } from "react";
import { TourTooltip } from "./TourTooltip";
import { TourStep } from "@/lib/help";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const TOOLTIP_WIDTH = 288; // w-72
const TOOLTIP_HEIGHT = 200;
const GAP = 12;

function tooltipPosition(rect: Rect): { x: number; y: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let x = rect.left + rect.width + GAP;
  let y = rect.top;

  if (x + TOOLTIP_WIDTH > vw) x = rect.left - TOOLTIP_WIDTH - GAP;
  if (x < 8) x = 8;
  if (y + TOOLTIP_HEIGHT > vh) y = vh - TOOLTIP_HEIGHT - GAP;
  if (y < 8) y = 8;

  return { x, y };
}

interface TourOverlayProps {
  step: TourStep;
  currentStep: number;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}

export function TourOverlay({
  step,
  currentStep,
  totalSteps,
  onNext,
  onPrev,
  onSkip,
}: TourOverlayProps) {
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const frameRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const el = document.querySelector(
        `[data-tour-target="${step.target}"]`
      ) as HTMLElement | null;
      if (el) {
        const r = el.getBoundingClientRect();
        setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      } else {
        setTargetRect(null);
      }
    };

    measure();
    frameRef.current = window.setInterval(measure, 200);
    return () => {
      if (frameRef.current !== null) clearInterval(frameRef.current);
    };
  }, [step.target]);

  const pos = targetRect ? tooltipPosition(targetRect) : { x: 40, y: 40 };
  const PADDING = 6;

  return (
    <>
      <div className="fixed inset-0 z-[190] pointer-events-none">
        {targetRect ? (
          <svg
            className="absolute inset-0 w-full h-full"
            style={{ mixBlendMode: "multiply" }}
          >
            <defs>
              <mask id="tour-mask">
                <rect width="100%" height="100%" fill="white" />
                <rect
                  x={targetRect.left - PADDING}
                  y={targetRect.top - PADDING}
                  width={targetRect.width + PADDING * 2}
                  height={targetRect.height + PADDING * 2}
                  rx="6"
                  fill="black"
                />
              </mask>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill="rgba(0,0,0,0.55)"
              mask="url(#tour-mask)"
            />
          </svg>
        ) : (
          <div className="absolute inset-0 bg-black/55" />
        )}

        {targetRect && (
          <div
            className="absolute rounded-md ring-2 ring-[var(--color-accent)] ring-offset-0 transition-all duration-200"
            style={{
              top: targetRect.top - PADDING,
              left: targetRect.left - PADDING,
              width: targetRect.width + PADDING * 2,
              height: targetRect.height + PADDING * 2,
            }}
          />
        )}
      </div>

      <TourTooltip
        title={step.title}
        body={step.body}
        step={currentStep}
        totalSteps={totalSteps}
        onNext={onNext}
        onPrev={onPrev}
        onSkip={onSkip}
        x={pos.x}
        y={pos.y}
      />
    </>
  );
}
