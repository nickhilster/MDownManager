import { useEffect, useState } from "react";
import { X, AlertTriangle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastType = "error" | "success";

export interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

let _push: ((t: Omit<ToastItem, "id">) => void) | null = null;
let _id = 0;

export function toast(message: string, type: ToastType = "error") {
  _push?.({ message, type });
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    _push = (t) => {
      const id = ++_id;
      setItems((prev) => [...prev, { ...t, id }]);
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== id)), 4000);
    };
    return () => { _push = null; };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            "flex items-center gap-2 px-3 py-2.5 rounded-lg shadow-lg text-sm pointer-events-auto",
            "border animate-in slide-in-from-right-4 fade-in duration-200",
            item.type === "error"
              ? "bg-red-950 border-red-800 text-red-200"
              : "bg-green-950 border-green-800 text-green-200"
          )}
        >
          {item.type === "error"
            ? <AlertTriangle size={14} className="text-red-400 shrink-0" />
            : <CheckCircle size={14} className="text-green-400 shrink-0" />}
          <span>{item.message}</span>
          <button
            className="ml-1 opacity-60 hover:opacity-100"
            onClick={() => setItems((prev) => prev.filter((x) => x.id !== item.id))}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
