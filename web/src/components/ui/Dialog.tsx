import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}

export function Dialog({ open, onOpenChange, children, className }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === ref.current) onOpenChange(false);
      }}
      ref={ref}
    >
      <div
        className={cn(
          "relative bg-card rounded-lg shadow-xl border border-border max-w-lg w-full max-h-[90vh] overflow-y-auto",
          className
        )}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("px-6 py-4 border-b border-border flex items-start justify-between gap-4", className)}>
      {children}
    </div>
  );
}

export function DialogTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn("text-lg font-semibold leading-tight", className)}>{children}</h3>;
}

export function DialogDescription({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-sm text-muted-foreground mt-1", className)}>{children}</p>;
}

export function DialogBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-6 py-5 space-y-4", className)}>{children}</div>;
}

export function DialogFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "px-6 py-4 border-t border-border flex items-center justify-end gap-2 bg-muted/30",
        className
      )}
    >
      {children}
    </div>
  );
}

interface CloseButtonProps {
  onClick: () => void;
}

export function DialogClose({ onClick }: CloseButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Cerrar"
      className="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none"
    >
      ×
    </button>
  );
}
