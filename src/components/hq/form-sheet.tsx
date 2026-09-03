"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

// A right side panel with a form inside. Opens from a URL flag (?new=1 or ?edit=<id>) or a controlled prop.
export function FormSheet({ open, onOpenChange, title, description, children, footer, width = "max-w-xl", submitLabel = "Save", pending, formId, onDelete, deleteLabel = "Delete" }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode; width?: string; submitLabel?: string; pending?: boolean; formId: string; onDelete?: () => void; deleteLabel?: string }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent width={width}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <SheetBody>{children}</SheetBody>
        <SheetFooter className="justify-between">
          <div>{onDelete ? <Button type="button" variant="ghost" className="text-bad hover:bg-bad-soft" onClick={onDelete}>{deleteLabel}</Button> : null}</div>
          <div className="flex items-center gap-2">
            {footer}
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" form={formId} loading={pending}>
              {submitLabel}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// Reads ?new=1 / ?edit=id from the URL and clears them on close.
export function useUrlSheet(param = "new") {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const value = sp.get(param);
  const close = React.useCallback(() => {
    const next = new URLSearchParams(sp.toString());
    next.delete(param);
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [router, pathname, sp, param]);
  return { value, open: !!value, close };
}

export function FormRow({ children, cols = 2 }: { children: React.ReactNode; cols?: 1 | 2 | 3 }) {
  return <div className={cols === 3 ? "grid gap-3 sm:grid-cols-3" : cols === 2 ? "grid gap-3 sm:grid-cols-2" : "grid gap-3"}>{children}</div>;
}
