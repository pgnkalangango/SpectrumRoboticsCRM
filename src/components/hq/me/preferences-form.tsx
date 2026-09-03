"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/misc";
import { Panel } from "@/components/hq/record";
import { updatePreferences } from "@/server/actions/me";

export type Prefs = { emailDigest: "daily" | "weekly" | "off"; notifyOnApprovals: boolean; notifyOnTickets: boolean };

export function PreferencesForm({ initial }: { initial: Prefs }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [v, setV] = React.useState<Prefs>(initial);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const save = () =>
    start(async () => {
      const r = await updatePreferences(v);
      if (r.ok) {
        toast.success("Preferences saved");
        router.refresh();
      } else toast.error(r.error);
    });
  return (
    <Panel
      title="Notifications"
      action={
        <Button size="sm" onClick={save} loading={pending} disabled={!dirty}>
          Save
        </Button>
      }
    >
      <div className="flex flex-col divide-y divide-line">
        <div className="flex items-center justify-between gap-4 py-3 first:pt-0">
          <div>
            <div className="text-[13px] font-semibold text-ink-2">Email digest</div>
            <div className="text-xs text-muted">A summary of tasks due, quiet deals and quotes waiting on a reply.</div>
          </div>
          <NativeSelect value={v.emailDigest} onChange={(e) => setV({ ...v, emailDigest: e.target.value as Prefs["emailDigest"] })} className="w-36">
            <option value="daily">Every morning</option>
            <option value="weekly">Monday mornings</option>
            <option value="off">Off</option>
          </NativeSelect>
        </div>
        <label className="flex items-center justify-between gap-4 py-3">
          <div>
            <div className="text-[13px] font-semibold text-ink-2">Approvals</div>
            <div className="text-xs text-muted">Tell me when something needs my sign off or when my request is decided.</div>
          </div>
          <Switch checked={v.notifyOnApprovals} onCheckedChange={(c) => setV({ ...v, notifyOnApprovals: c })} />
        </label>
        <label className="flex items-center justify-between gap-4 py-3 last:pb-0">
          <div>
            <div className="text-[13px] font-semibold text-ink-2">Tickets</div>
            <div className="text-xs text-muted">Tell me about new tickets and replies on tickets assigned to me.</div>
          </div>
          <Switch checked={v.notifyOnTickets} onCheckedChange={(c) => setV({ ...v, notifyOnTickets: c })} />
        </label>
      </div>
    </Panel>
  );
}
