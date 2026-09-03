"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/misc";
import { PERMISSIONS, TIER_LABELS, type PermissionKey } from "@/lib/permissions";
import type { Tier } from "@/generated/prisma/enums";

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

export function tierDefault(key: PermissionKey, tier: Tier): boolean {
  return (PERMISSIONS[key].default as readonly string[]).includes(tier);
}

// What a person can actually do: explicit deny wins, then explicit grant, then the tier default.
export function effective(key: PermissionKey, tier: Tier, permissions: string[]): boolean {
  if (tier === "OWNER") return true;
  if (permissions.includes(`-${key}`)) return false;
  if (permissions.includes(key)) return true;
  return tierDefault(key, tier);
}

// Turn a set of checked keys back into the stored list: grants beyond the tier default, denies below it.
export function toStoredPermissions(checked: Record<string, boolean>, tier: Tier): string[] {
  const out: string[] = [];
  for (const key of PERMISSION_KEYS) {
    const on = !!checked[key];
    const def = tierDefault(key, tier);
    if (on && !def) out.push(key);
    if (!on && def) out.push(`-${key}`);
  }
  return out;
}

export function PermissionsChecklist({ tier, value, onChange, disabled }: { tier: Tier; value: Record<string, boolean>; onChange: (v: Record<string, boolean>) => void; disabled?: boolean }) {
  const isOwner = tier === "OWNER";
  return (
    <div className="rounded-lg border border-line">
      <div className="flex items-center justify-between border-b border-line bg-surface-2/60 px-3 py-2 text-[11.5px] text-muted">
        <span>{isOwner ? "Owners can do everything." : `Defaults come from the ${TIER_LABELS[tier].toLowerCase()} level. Tick to grant, untick to deny.`}</span>
        {!isOwner && !disabled ? (
          <button type="button" className="font-semibold text-brand hover:underline" onClick={() => onChange(Object.fromEntries(PERMISSION_KEYS.map((k) => [k, tierDefault(k, tier)])))}>
            Reset to defaults
          </button>
        ) : null}
      </div>
      <ul className="divide-y divide-line">
        {PERMISSION_KEYS.map((key) => {
          const def = tierDefault(key, tier);
          const on = isOwner ? true : !!value[key];
          const changed = !isOwner && on !== def;
          return (
            <li key={key} className={cn("flex items-center gap-3 px-3 py-2", changed && "bg-brand-tint/20")}>
              <Checkbox checked={on} disabled={disabled || isOwner} onCheckedChange={(c) => onChange({ ...value, [key]: !!c })} id={`perm-${key}`} />
              <label htmlFor={`perm-${key}`} className="min-w-0 flex-1 cursor-pointer">
                <span className="block text-[13px] font-medium text-ink">{PERMISSIONS[key].label}</span>
                <span className="block font-mono text-[10.5px] text-faint">{key}</span>
              </label>
              <span className={cn("shrink-0 rounded px-1.5 py-px text-[10.5px] font-semibold", changed ? (on ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad") : "bg-surface-2 text-muted")}>{isOwner ? "Always" : changed ? (on ? "Granted" : "Denied") : def ? "Default on" : "Default off"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
