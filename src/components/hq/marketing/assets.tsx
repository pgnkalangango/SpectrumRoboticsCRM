"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { FileText, Film, Image as ImageIcon, Palette, Plus, Trash2, ExternalLink, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Panel } from "@/components/hq/record";
import { fmtDate } from "@/lib/utils";
import { addAsset, deleteAsset, type AssetInput } from "@/server/actions/marketing";

export type AssetRow = { id: string; name: string; url: string; type: string; tags: string[]; createdAt: string; canvaDesignId: string | null };

const ICON: Record<string, React.ElementType> = { image: ImageIcon, video: Film, pdf: FileText, design: Palette };

export function AssetLibrary({ assets, canEdit }: { assets: AssetRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const form = useForm<AssetInput & { tagsText: string }>({ defaultValues: { name: "", url: "", type: "image", tagsText: "" } });
  const onSubmit = form.handleSubmit((v) =>
    start(async () => {
      const r = await addAsset({ name: v.name, url: v.url, type: v.type, tags: v.tagsText.split(",").map((s) => s.trim()).filter(Boolean) });
      if (r.ok) {
        toast.success("Asset added");
        form.reset({ name: "", url: "", type: "image", tagsText: "" });
        router.refresh();
      } else toast.error(r.error);
    }),
  );
  const remove = (id: string) => {
    if (!confirm("Remove this asset from the library? The file itself is not deleted.")) return;
    start(async () => {
      const r = await deleteAsset(id);
      if (r.ok) router.refresh();
      else toast.error(r.error);
    });
  };
  const copy = (url: string) => {
    navigator.clipboard?.writeText(url).then(() => toast.success("Link copied"));
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div>
        {assets.length === 0 ? (
          <EmptyState icon={ImageIcon} title="No assets yet" body="Add image, video, PDF or Canva design links here so every post can reuse them." compact />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {assets.map((a) => {
              const Icon = ICON[a.type] ?? FileText;
              return (
                <li key={a.id} className="group overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
                  <div className="flex h-36 items-center justify-center bg-surface-2">
                    {a.type === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.url} alt={a.name} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <Icon className="size-8 text-muted" />
                    )}
                  </div>
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-ink" title={a.name}>
                          {a.name}
                        </div>
                        <div className="text-[11px] text-muted">
                          {a.type} · {fmtDate(a.createdAt)}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                        <button type="button" className="rounded p-1 text-muted hover:bg-surface-2 hover:text-ink" onClick={() => copy(a.url)} title="Copy link">
                          <Copy className="size-3.5" />
                        </button>
                        <a href={a.url} target="_blank" rel="noreferrer" className="rounded p-1 text-muted hover:bg-surface-2 hover:text-ink" title="Open">
                          <ExternalLink className="size-3.5" />
                        </a>
                        {canEdit ? (
                          <button type="button" className="rounded p-1 text-muted hover:bg-bad-soft hover:text-bad" onClick={() => remove(a.id)} title="Remove" disabled={pending}>
                            <Trash2 className="size-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {a.tags.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {a.tags.map((t) => (
                          <Badge key={t}>{t}</Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {canEdit ? (
        <Panel title="Add by link">
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <Field label="Name" required error={form.formState.errors.name?.message}>
              <Input {...form.register("name", { required: "Give the asset a name." })} placeholder="BellaBot hero photo" />
            </Field>
            <Field label="URL" required error={form.formState.errors.url?.message} hint="A public link. Canva exports and Higgsfield renders come through the MCP gateway.">
              <Input {...form.register("url", { required: "Paste the link." })} placeholder="https://" />
            </Field>
            <Field label="Type">
              <NativeSelect {...form.register("type")}>
                <option value="image">Image</option>
                <option value="video">Video</option>
                <option value="pdf">PDF</option>
                <option value="design">Canva design</option>
              </NativeSelect>
            </Field>
            <Field label="Tags" hint="Comma separated">
              <Input {...form.register("tagsText")} placeholder="bellabot, casino, hero" />
            </Field>
            <Button type="submit" loading={pending}>
              <Plus /> Add asset
            </Button>
          </form>
        </Panel>
      ) : null}
    </div>
  );
}
