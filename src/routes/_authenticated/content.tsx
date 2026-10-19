import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, Empty } from "@/components/flat/Page";
import { Editor, TextField, Notes, DataState, text } from "@/components/flat/Forms";
import { MediaSelect } from "@/components/flat/CmsBits";
import { useMe } from "@/lib/flat";
import { siteContent, saveSiteSection, reorderSections, siteSettings, saveSiteSettings, pageHead } from "@/lib/flat-actions";
import type { SiteSection, SiteSectionTranslation } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/content")({
  head: () => pageHead("Homepage content", "Edit the public homepage copy, order sections and manage site settings."),
  component: Content,
});

const AREA_LABELS: Record<string, string> = {
  home: "Homepage",
  nav: "Navigation",
  footer: "Footer",
  donations: "Donation area",
};

type LocaleText = { heading: string | null; subheading: string | null; body: string | null };
const EMPTY_TEXT: LocaleText = { heading: null, subheading: null, body: null };
type TranslationMap = Record<string, Record<string, LocaleText>>;

function translationsLookup(rows: SiteSectionTranslation[]): TranslationMap {
  const map: TranslationMap = {};
  for (const row of rows) {
    map[row.section_code] ??= {};
    map[row.section_code][row.locale] = row;
  }
  return map;
}

function Content() {
  const me = useMe();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["site-content"], queryFn: siteContent });
  const settingsQuery = useQuery({ queryKey: ["site-settings"], queryFn: siteSettings });
  const refresh = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ["site-content"] }), qc.invalidateQueries({ queryKey: ["site-settings"] }), qc.invalidateQueries({ queryKey: ["public-homepage"] })]);
  };
  const translations = translationsLookup(query.data?.translations ?? []);
  const sections = query.data?.sections ?? [];
  const areas = ["home", "nav", "footer", "donations"] as const;
  if (!me.data?.isAdmin) {
    return <p role="alert" className="text-destructive">Only administrators can edit the homepage content.</p>;
  }
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Homepage content" sub="What visitors read on the public landing page." />
      <DataState query={query} />
      {areas.map((area) => {
        const rows = sections.filter((s) => s.area === area).sort((a, b) => a.sort - b.sort);
        if (!rows.length) return null;
        return (
          <section key={area} className="mb-8">
            <h2 className="mb-3 text-lg font-semibold">{AREA_LABELS[area]}</h2>
            <div className="grid gap-3">
              {rows.map((section, index) => (
                <SectionRow
                  key={section.code}
                  section={section}
                 index={index}
                  siblings={rows.map((s) => s.code)}
                  tr={translations[section.code] ?? {}}
                  onChanged={refresh}
                />
              ))}
            </div>
          </section>
        );
      })}
      <section className="rounded-2xl border bg-card p-5">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Settings className="h-5 w-5" /> Site settings</h2>
        <DataState query={settingsQuery} />
        {settingsQuery.data && (
          <SettingsEditor
            initial={Object.fromEntries(settingsQuery.data.map((r) => [r.setting_key, r.setting_value]))}
            onSaved={refresh}
          />
        )}
      </section>
    </div>
  );
}

function SectionRow({
  section, tr, index, siblings, onChanged,
}: { section: SiteSection; tr: Record<string, LocaleText | undefined>; index: number; siblings: string[]; onChanged: () => Promise<void> }) {
  const en: LocaleText = tr["en"] ?? EMPTY_TEXT;
  const de: LocaleText = tr["de"] ?? EMPTY_TEXT;
  const editor = (
    <Editor title="Edit section" trigger={<Button size="icon" variant="outline" aria-label={"Edit section " + section.code}><Pencil className="h-4 w-4" /></Button>}
      onSave={async (d) => {
        const body: Record<string, unknown> = {
          icon: text(d, "icon") || null,
          media_id: text(d, "media_id") || null,
          media_position: text(d, "media_position") || null,
          cta_label: text(d, "cta_label") || null,
          cta_href: text(d, "cta_href") || null,
          cta2_label: text(d, "cta2_label") || null,
          cta2_href: text(d, "cta2_href") || null,
          en: {
            heading: text(d, "en_heading"),
            subheading: text(d, "en_subheading"),
            body: text(d, "en_body"),
          },
          de: {
            heading: text(d, "de_heading"),
            subheading: text(d, "de_subheading"),
            body: text(d, "de_body"),
          },
        };
        await saveSiteSection(section.code, body);
        await onChanged();
      }}>
      <TextField label="Icon (lucide name, e.g. receipt)" name="icon" value={section.icon ?? ""} />
      <MediaSelect label="Image" name="media_id" value={section.media_id} />
      <label className="grid gap-2 text-sm font-medium">
        Image position
        <select name="media_position" defaultValue={section.media_position ?? ""} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
          <option value="">—</option>
          {["cover", "left", "right", "center", "background"].map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Button label" name="cta_label" value={section.cta_label ?? ""} />
        <TextField label="Button target (/auth)" name="cta_href" value={section.cta_href ?? ""} />
        <TextField label="Second button label" name="cta2_label" value={section.cta2_label ?? ""} />
        <TextField label="Second button target" name="cta2_href" value={section.cta2_href ?? ""} />
      </div>
      <div className="grid gap-4 rounded-lg border p-3">
        <p className="text-xs font-semibold uppercase text-muted-foreground">English</p>
        <TextField label="Heading" name="en_heading" value={en.heading ?? ""} />
        <TextField label="Subheading" name="en_subheading" value={en.subheading ?? ""} />
        <Notes label="Text" name="en_body" value={en.body ?? ""} />
      </div>
      <div className="grid gap-4 rounded-lg border p-3">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Deutsch</p>
        <TextField label="Titel" name="de_heading" value={de.heading ?? ""} />
        <TextField label="Untertitel" name="de_subheading" value={de.subheading ?? ""} />
        <Notes label="Text" name="de_body" value={de.body ?? ""} />
      </div>
    </Editor>
  );
  return (
    <article className={ "flex flex-wrap items-start gap-3 rounded-xl border bg-card p-4" + (section.visible ? "" : " opacity-60") }>
      <div className="flex flex-col gap-1">
        <Button size="icon" variant="ghost" disabled={index === 0} aria-label="Move up"
          onClick={() => runReorder(swapAt(siblings, index, index - 1), section.area, onChanged)}><ArrowUp className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" disabled={index === siblings.length - 1} aria-label="Move down"
          onClick={() => runReorder(swapAt(siblings, index, index + 1), section.area, onChanged)}><ArrowDown className="h-4 w-4" /></Button>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">{section.code}</h3>
          <span className="rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground">{section.kind}</span>
          {section.visible
            ? <span className="rounded-md bg-success/10 px-2 py-1 text-xs text-success">visible</span>
            : <span className="rounded-md bg-secondary px-2 py-1 text-xs text-muted-foreground">hidden</span>}
        </div>
        <p className="mt-1 break-words text-sm text-muted-foreground">
          {en.heading ?? en.subheading ?? en.body ?? "(no English copy)"}
        </p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={async () => { await saveSiteSection(section.code, { visible: !section.visible }); await onChanged(); }}>
          {section.visible ? <><EyeOff className="h-4 w-4" />Hide</> : <><Eye className="h-4 w-4" />Show</>}
        </Button>
        {editor}
      </div>
    </article>
  );
}

async function runReorder(codes: string[], area: string, onChanged: () => Promise<void>) {
  await reorderSections(codes, area);
  await onChanged();
}

/** Reorders one area's codes by swapping the section at `index` with its new neighbour. */
function swapAt(codes: string[], index: number, target: number) {
  const out = [...codes];
  const moved = out[target];
  out[target] = out[index];
  out[index] = moved;
  return out;
}

function SettingsEditor({ initial, onSaved }: { initial: Record<string, string>; onSaved: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="mt-4 grid gap-4 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const d = new FormData(e.currentTarget);
        setSaving(true);
        try {
          await saveSiteSettings({
            site_name: text(d, "site_name") || "FlatMate Hub",
            default_locale: text(d, "default_locale") || "en",
            social_instagram_url: text(d, "social_instagram_url"),
            donations_public: d.get("donations_public") === "on" ? "1" : "0",
            donations_goal: text(d, "donations_goal"),
            donations_account: text(d, "donations_account"),
            donations_instructions: text(d, "donations_instructions"),
          });
          await onSaved();
        } catch (err) {
          throw err;
        } finally {
          setSaving(false);
        }
      }}
    >
      <label className="grid gap-2 text-sm font-medium">Site name
        <input name="site_name" defaultValue={initial.site_name ?? ""} className="h-9 rounded-md border bg-background px-3 text-sm" />
      </label>
      <label className="grid gap-2 text-sm font-medium">Default language (en/de)
        <input name="default_locale" defaultValue={initial.default_locale ?? "en"} className="h-9 rounded-md border bg-background px-3 text-sm" />
      </label>
      <label className="grid gap-2 text-sm font-medium">Instagram URL
        <input name="social_instagram_url" defaultValue={initial.social_instagram_url ?? ""} className="h-9 rounded-md border bg-background px-3 text-sm" />
      </label>
      <label className="grid items-center gap-2 text-sm font-medium">
        <span className="flex items-center gap-2"><input type="checkbox" name="donations_public" defaultChecked={initial.donations_public === "1"} /> Show donation area publicly</span>
      </label>
      <label className="grid gap-2 text-sm font-medium">Donation goal (EUR, optional)
        <input name="donations_goal" type="number" step="0.01" min="0" defaultValue={initial.donations_goal ?? ""} className="h-9 rounded-md border bg-background px-3 text-sm" />
      </label>
      <label className="grid gap-2 text-sm font-medium">Donation account details
        <input name="donations_account" defaultValue={initial.donations_account ?? ""} className="h-9 rounded-md border bg-background px-3 text-sm" />
      </label>
      <label className="grid gap-2 text-sm font-medium sm:col-span-2">Donation instructions shown on the homepage
        <textarea name="donations_instructions" defaultValue={initial.donations_instructions ?? ""} rows={2} maxLength={2000} className="w-full rounded-md border bg-background p-3 text-sm" />
      </label>
      <div>
        <Button disabled={saving}>Save settings</Button>
      </div>
    </form>
  );
}
