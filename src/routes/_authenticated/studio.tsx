import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Empty } from "@/components/flat/Page";
import { Editor, TextField, Notes, DataState, text, upload } from "@/components/flat/Forms";
import { formatUtc } from "@/components/flat/CmsBits";
import { useMe } from "@/lib/flat";
import { listSocialPosts, studioMeta, createSocialPost, deleteSocialPost, pageHead } from "@/lib/flat-actions";
import { mediaUrl, openMedia } from "@/lib/api";
import type { SocialPost } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/studio")({
  head: () => pageHead("Social post studio", "Export branded graphics and keep the matching captions."),
  component: Studio,
});

function Studio() {
  const me = useMe();
  const qc = useQueryClient();
  const posts = useQuery({ queryKey: ["social-posts"], queryFn: listSocialPosts });
  const meta = useQuery({ queryKey: ["studio-meta"], queryFn: studioMeta });
  const refresh = () => qc.invalidateQueries({ queryKey: ["social-posts"] });
  if (!me.data?.isAdmin) {
    return <p role="alert" className="text-destructive">Only administrators use the post studio.</p>;
  }
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Social post studio"
        sub="Save finished graphics (PNG/JPEG) with their Instagram captions in both languages."
      />
      <div className="mb-6 grid gap-5 rounded-2xl border bg-card p-5 lg:grid-cols-[300px_1fr]">
        <DataState query={meta} />
        {meta.data && (
          <form
            className="grid gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const file = upload(form);
              if (!file) throw new Error("Attach the exported graphic (PNG or JPEG)");
              await createSocialPost(form);
              (e.target as HTMLFormElement).reset();
              await refresh();
            }}
          >
            <label className="grid gap-2 text-sm font-medium">
              Format
              <select name="format" className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                {meta.data.formats.map((f) => <option key={f.id} value={f.id}>{f.name} ({f.width}×{f.height})</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Template
              <select name="template" className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                {meta.data.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <TextField label="Headline (reference)" name="headline" />
            <label className="grid gap-2 text-sm font-medium">
              Graphic (PNG/JPEG)
              <input type="file" name="file" accept="image/png,image/jpeg" required className="text-sm" />
            </label>
            <Notes label="Caption (German)" name="de[caption]" />
            <Notes label="Caption (English)" name="en[caption]" />
            <div><Button><Wand2 className="h-4 w-4" />Save post</Button></div>
          </form>
        )}
        <div>
          <DataState query={posts} />
          {posts.data && posts.data.length === 0 && <Empty>No posts saved yet.</Empty>}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(posts.data ?? []).map((post) => <PostCard key={post.id} post={post} onChanged={refresh} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

function PostCard({ post, onChanged }: { post: SocialPost; onChanged: () => Promise<void> }) {
  return (
    <figure className="rounded-xl border bg-card p-3">
      <button
        type="button"
        onClick={() => openMedia(post.media_id)}
        aria-label={"View post " + (post.headline ?? post.id)}
        className="block w-full overflow-hidden rounded-lg border bg-muted"
      >
        <img src={mediaUrl(post.media_id ?? "")} alt={post.headline ?? ""} className="h-40 w-full object-cover" loading="lazy" />
      </button>
      <figcaption className="mt-2 space-y-1 text-xs text-muted-foreground">
        <p className="truncate font-medium text-foreground">{post.headline ?? "Untitled post"}</p>
        <p>{post.format} · {post.mime_type} · {formatUtc(post.created_at)}</p>
        {post.captions && <p className="max-h-16 overflow-y-auto break-words">{post.captions}</p>}
      </figcaption>
      <div className="mt-2 flex gap-1">
        <Button size="sm" variant="ghost" onClick={() => openMedia(post.media_id)}>
          <Download className="h-4 w-4" />Download
        </Button>
        <Editor
          title="Delete post"
          destructive
          trigger={<Button size="sm" variant="ghost" className="text-destructive" aria-label="Delete post"><Trash2 className="h-4 w-4" /></Button>}
          onSave={async () => { await deleteSocialPost(post.id); await onChanged(); }}
        >
          <p className="text-sm">Delete the graphic and its captions?</p>
        </Editor>
      </div>
    </figure>
  );
}
