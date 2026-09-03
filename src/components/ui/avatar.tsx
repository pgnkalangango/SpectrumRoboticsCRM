"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn, colorFor, initials } from "@/lib/utils";

export function Avatar({ name, src, size = 32, className, color }: { name: string; src?: string | null; size?: number; className?: string; color?: string | null }) {
  const bg = color || colorFor(name || "?");
  return (
    <AvatarPrimitive.Root className={cn("relative inline-flex shrink-0 overflow-hidden rounded-full select-none", className)} style={{ width: size, height: size }}>
      {src ? <AvatarPrimitive.Image src={src} alt={name} className="h-full w-full object-cover" /> : null}
      <AvatarPrimitive.Fallback
        className="flex h-full w-full items-center justify-center font-semibold text-white"
        style={{ background: bg, fontSize: Math.max(10, Math.round(size * 0.38)) }}
        delayMs={src ? 300 : 0}
      >
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

export function AvatarStack({ people, size = 24, max = 4 }: { people: { name: string; image?: string | null; color?: string | null }[]; size?: number; max?: number }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((p, i) => (
        <Avatar key={i} name={p.name} src={p.image} size={size} color={p.color} className="ring-2 ring-surface" />
      ))}
      {rest > 0 ? (
        <span className="flex items-center justify-center rounded-full bg-surface-2 text-[10px] font-semibold text-muted ring-2 ring-surface" style={{ width: size, height: size }}>
          +{rest}
        </span>
      ) : null}
    </div>
  );
}
