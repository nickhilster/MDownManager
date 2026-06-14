import { useCallback, useEffect, useState } from "react";
import {
  getTourState,
  setTourSeen,
  setTourStep,
  TOUR_STEPS,
  TourStep,
} from "@/lib/help";

export interface UseTourReturn {
  active: boolean;
  currentStep: number;
  totalSteps: number;
  step: TourStep | null;
  start: () => void;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  skip: () => Promise<void>;
}

export function useTour(): UseTourReturn {
  const [active, setActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const totalSteps = TOUR_STEPS.length;

  useEffect(() => {
    getTourState().then(({ seen, step }) => {
      if (!seen) {
        setCurrentStep(step);
        setActive(true);
      }
    });
  }, []);

  const start = useCallback(() => {
    setCurrentStep(0);
    setActive(true);
  }, []);

  const next = useCallback(async () => {
    const nextStep = currentStep + 1;
    if (nextStep >= totalSteps) {
      setActive(false);
      await setTourSeen();
    } else {
      setCurrentStep(nextStep);
      await setTourStep(nextStep);
    }
  }, [currentStep, totalSteps]);

  const prev = useCallback(async () => {
    const prevStep = Math.max(0, currentStep - 1);
    setCurrentStep(prevStep);
    await setTourStep(prevStep);
  }, [currentStep]);

  const skip = useCallback(async () => {
    setActive(false);
    await setTourSeen();
  }, []);

  return {
    active,
    currentStep,
    totalSteps,
    step: active ? TOUR_STEPS[currentStep] : null,
    start,
    next,
    prev,
    skip,
  };
}
