import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Trash2, Upload, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, Empty } from "@/components/flat/Page";
import { Editor, TextField, FileField, Notes, DataState, text, upload } from "@/components/flat/Forms";
import { formatUtc } from "@/components/flat/CmsBits";
import { useMe } from "@/lib/flat";
import { listMedia, updateMediaMeta, deleteMedia, replaceMedia, uploadMedia, pageHead } from "@/lib/flat-actions";
import { mediaUrl, openMedia } from "@/lib/api";
import type { MediaAsset } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/media")({
  head: () => pageHead("Media library", "Website graphics, uploaded by the admin and reused across the site."),
  component: MediaLibrary,
});

function MediaLibrary() {
  const me = useMe();
  const qc = useQueryClient();
  const [bucket, setBucket] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const refresh = () => qc.invalidateQueries({ queryKey: ["media"] });
  const media = useQuery({
    queryKey: ["media", bucket, search, page],
    queryFn: () => listMedia({ bucket: bucket || undefined, q: search || undefined, page, per_page: 24 }),
  });
  if (!me.data?.isAdmin) {
    return <p role="alert" className="text-destructive">Only administrators can manage the media library.</p>;
  }
  const pages = media.data ? Math.max(1, Math.ceil(media.data.total / media.data.per_page)) : 1;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Media library"
        sub="Images live on the server disk (backend/uploads); receipts stay private, website graphics are public."
        action={
          <Editor
            title="Upload image"
            trigger={<Button><Upload className="h-4 w-4" />Upload image</Button>}
            onSave={async (d) => {
              const file = upload(d);
              if (!file) throw new Error("Choose an image (JPG, PNG, WebP, max 10 MB)");
              const asset = await uploadMedia("media", file);
              const alt = text(d, "alt");
              const caption = text(d, "caption");
              if (alt || caption) await updateMediaMeta(asset.id, { alt_text: alt || null, caption: caption || null });
              await refresh();
            }}
          >
            <FileField label="Image (JPG/PNG/WebP)" name="file" />
            <TextField label="Alt text" name="alt" />
            <Notes label="Caption" name="caption" />
          </Editor>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={bucket} onChange={(e) => { setBucket(e.target.value); setPage(1); qc.invalidateQueries({ queryKey: ["media"] }); }} className="h-9 w-32 rounded-md border bg-background px-3 text-sm">
          <option value="">All kinds</option>
          <option value="media">Graphics</option>
          <option value="receipts">Receipts</option>
          <option value="photos">Photos</option>
          <option value="social">Social</option>
        </select>
        <Input
          className="w-56"
          placeholder="Search file name, alt text…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { setSearch(q); setPage(1); } }}
        />
        <Button variant="outline" size="sm" onClick={() => { setSearch(q); setPage(1); }}>
          <Search className="h-4 w-4" />Search
        </Button>
      </div>
      <DataState query={media} />
      {media.data && media.data.items.length === 0 && <Empty>No files yet — upload the first graphic.</Empty>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {(media.data?.items ?? []).map((asset) => (
          <AssetCard key={asset.id} asset={asset} onChanged={refresh} />
        ))}
      </div>
      {pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span>Page {page} of {pages}</span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}

function AssetCard({ asset, onChanged }: { asset: MediaAsset; onChanged: () => Promise<void> }) {
  const isImage = (asset.mime_type ?? "").startsWith("image/");
  return (
    <figure className="rounded-xl border bg-card p-3">
      <button type="button" onClick={() => openMedia(asset.id)} aria-label={"View " + (asset.alt_text ?? asset.original_name ?? "media")} className="block aspect-square w-full overflow-hidden rounded-lg border bg-muted">
        {isImage ? (
          <img src={mediaUrl(asset.id)} alt={asset.alt_text ?? ""} className="h-full w-full object-cover" loading="lazy" />
        ) : <span className="grid h-full w-full place-items-center text-xs text-muted-foreground">{asset.mime_type || "file"}</span>}
      </button>
      <figcaption className="mt-2 space-y-1 text-xs text-muted-foreground">
        <p className="truncate font-medium text-foreground">{asset.alt_text ?? asset.original_name ?? asset.file_path}</p>
        <p>{asset.bucket} · {asset.width ? `${asset.width}×${asset.height} · ` : ""}{formatUtc(asset.created_at)}</p>
      </figcaption>
      <div className="mt-2 flex flex-wrap gap-1">
        <Editor
          title="Replace file"
          trigger={<Button size="sm" variant="ghost"><RefreshCcw className="h-4 w-4" />Replace</Button>}
          onSave={async (d) => {
            const file = upload(d);
            if (!file) throw new Error("Choose a replacement image");
            await replaceMedia(asset.id, file);
            await onChanged();
          }}
        >
          <FileField label="New image" name="file" />
        </Editor>
        <Editor
          title="Edit details"
          trigger={<Button size="sm" variant="ghost">Details</Button>}
          onSave={async (d) => {
            await updateMediaMeta(asset.id, { alt_text: text(d, "alt_text") || null, caption: text(d, "caption") || null });
            await onChanged();
          }}
        >
          <TextField label="Alt text" name="alt_text" value={asset.alt_text ?? ""} />
          <Notes label="Caption" name="caption" value={asset.caption ?? ""} />
        </Editor>
        <Editor
          title="Delete file"
          destructive
          trigger={<Button size="sm" variant="ghost" className="text-destructive" aria-label={"Delete " + (asset.alt_text ?? "file")}><Trash2 className="h-4 w-4" />Delete</Button>}
          onSave={async () => {
            await deleteMedia(asset.id);
            await onChanged();
          }}
        >
          <p className="text-sm">Pages that reference this file will lose it. Delete “{asset.alt_text ?? asset.original_name ?? asset.file_path}”?</p>
        </Editor>
      </div>
    </figure>
  );
}
