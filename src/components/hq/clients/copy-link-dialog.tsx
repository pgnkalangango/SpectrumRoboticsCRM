"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type ShareLink = { title: string; url: string; delivered: boolean };

export function CopyLinkDialog({ link, onClose }: { link: ShareLink | null; onClose: () => void }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy. Select the link and copy it by hand.");
    }
  };
  return (
    <Dialog open={!!link} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{link?.title}</DialogTitle>
          <DialogDescription>{link?.delivered ? "We emailed it too. Share this link if the email does not arrive." : "Email is not set up on this server, so share this link directly."}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="flex items-center gap-2">
            <Input readOnly value={link?.url ?? ""} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
            <Button type="button" variant="secondary" onClick={copy}>
              {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
