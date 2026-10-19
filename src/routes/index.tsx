import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Home, Receipt, Sparkles, Wrench } from "lucide-react";
import { publicHomepage, createDonationRequest, publicDonationCategories } from "@/lib/flat-actions";
import { mediaUrl } from "@/lib/api";
import type { PublicHomepageSection, PublicEvent, PublicImpact } from "@/lib/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FlatMate Hub — run your shared flat together" },
      { name: "description", content: "Split expenses, rotate cleaning duties, report issues and see your flat's floor plan in one place." },
      { property: "og:title", content: "FlatMate Hub — run your shared flat together" },
      { property: "og:description", content: "Split expenses, rotate cleaning duties, report issues and see your flat's floor plan." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

/** The design source of truth — rendered verbatim whenever the CMS has no override. */
const FALLBACK = {
  hero: { heading: "Seven people, one flat, zero spreadsheets.", subheading: "Everything your shared flat needs: who owes what, whose turn it is to clean, and what needs fixing.", cta_label: "Sign in", cta_href: "/auth" },
  features: [
    { icon: "receipt", t: "Fair expenses", d: "Split by group or custom shares, claims reviewed by the admin." },
    { icon: "sparkles", t: "Cleaning rota", d: "Duties rotate automatically, with photo proof." },
    { icon: "wrench", t: "Issues", d: "Report a broken tap, follow it until resolved." },
    { icon: "home", t: "Floor plan", d: "See every room and washroom in 2D or 3D." },
  ] as { icon: string; t: string; d: string }[],
};

const ICONS: Record<string, typeof Home> = {
  receipt: Receipt,
  sparkles: Sparkles,
  wrench: Wrench,
  home: Home,
};

const iconFor = (name: string | null | undefined) => (name && ICONS[name]) || Home;

function sectionCopy(s: PublicHomepageSection, lang: "en" | "de"): { heading: string; subheading: string; body: string } | null {
  const en = s.translations.en ?? null;
  const de = s.translations.de ?? null;
  const rows = lang === "de" ? [de, en] : [en, de];
  for (const row of rows) {
    if (!row) continue;
    if ((row.heading ?? "") !== "" || (row.body ?? "") !== "") {
      return { heading: row.heading ?? "", subheading: row.subheading ?? "", body: row.body ?? "" };
    }
  }
  return null;
}

type DonationCat = { id: string; name: string; description: string | null };

function Index() {
  const [lang, setLang] = useState<"en" | "de">("en");
  const hub = useQuery({ queryKey: ["public-homepage"], queryFn: publicHomepage, staleTime: 60_000, retry: 1 });
  const data = hub.data;
  const sections = data?.sections ?? [];
  const hero = sections.find((s) => s.kind === "hero" && s.area === "home");
  const features = sections.filter((s) => s.kind === "feature").sort((a, b) => a.sort - b.sort);
  const hasGerman = sections.some((s) => (s.translations.de?.heading ?? s.translations.de?.subheading ?? s.translations.de?.body ?? "") !== "");
  const heroCopy = hero ? sectionCopy(hero, lang) : null;
  const heading = heroCopy?.heading || FALLBACK.hero.heading;
  const subheading = heroCopy?.subheading || heroCopy?.body || FALLBACK.hero.subheading;
  const ctaLabel = hero?.cta_label || FALLBACK.hero.cta_label;
  const ctaHref = hero?.cta_href || FALLBACK.hero.cta_href;
  const heroMedia = hero?.media_id ? mediaUrl(hero.media_id) : null;
  const events = data?.events ?? [];
  const impact = data?.impact ?? null;
  const settings = data?.settings ?? {};
  const siteName = typeof settings.site_name === "string" && settings.site_name ? settings.site_name : "FlatMate Hub";
  // Donations appear only after the admin explicitly enables the area in settings.
  const donationsEnabled = impact?.enabled !== false && settings.donations_public === true;
  const showLocaleToggle = hasGerman && hub.isSuccess;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-primary">
            <Home className="h-6 w-6" /> <span className="font-display text-lg font-bold">{siteName}</span>
          </div>
          {showLocaleToggle && (
            <button
              type="button"
              aria-label="Switch language"
              onClick={() => setLang(lang === "en" ? "de" : "en")}
              className="rounded-md border px-2 py-1 text-sm hover:bg-accent"
            >
              {lang === "en" ? "Deutsch" : "English"}
            </button>
          )}
        </div>
        <h1 className="mt-10 max-w-2xl text-5xl font-bold leading-tight">{heading}</h1>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground">{subheading}</p>
        <Button asChild size="lg" className="mt-8">
          {ctaHref === "/auth" ? <Link to="/auth">{ctaLabel}</Link> : <a href={ctaHref}>{ctaLabel}</a>}
        </Button>
        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(features.length
            ? features.map((s) => {
                const copy = sectionCopy(s, lang);
                return { icon: s.icon ?? "home", t: copy?.heading ?? "", d: copy?.body || copy?.subheading || "" };
              })
            : FALLBACK.features
          ).map((i) => {
            const Icon = iconFor(i.icon);
            return (
              <div key={i.t} className="rounded-xl border bg-card p-5">
                <Icon className="h-5 w-5 text-accent" />
                <h3 className="mt-3 font-semibold">{i.t}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{i.d}</p>
              </div>
            );
          })}
        </div>
        {heroMedia && <img src={heroMedia} alt="" className="mt-12 w-full rounded-xl border object-cover" />}
        {events.length > 0 && <EventsStrip events={events} lang={lang} />}
        {donationsEnabled && impact && <Donations impact={impact} settings={settings} lang={lang} />}
      </div>
    </div>
  );
}

function EventsStrip({ events, lang }: { events: PublicEvent[]; lang: "de" | "en" }) {
  const byId = new Map<string, PublicEvent>();
  for (const e of events) {
    const existing = byId.get(e.id);
    const preferred = lang === "de" ? e.locale === "de" : e.locale === "en";
    if (!existing || (preferred && existing.locale !== lang)) byId.set(e.id, e);
  }
  const shown = [...byId.values()].slice(0, 3);
  return (
    <section className="mt-16">
      <h2 className="text-2xl font-bold">{lang === "de" ? "Nächste Termine" : "Upcoming events"}</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((e) => (
          <article key={e.id} className="rounded-xl border bg-card p-5">
            <p className="text-sm text-accent">
              {new Date(e.starts_at + "Z").toLocaleString(lang === "de" ? "de-AT" : "en-IE", { dateStyle: "medium", timeStyle: "short" })}
            </p>
            <h3 className="mt-2 font-semibold">{e.title ?? (lang === "de" ? "Treffen" : "Meet-up")}</h3>
            {(e.meeting_point || e.address) && <p className="mt-1 text-sm text-muted-foreground">{e.meeting_point || e.address}</p>}
          </article>
        ))}
      </div>
    </section>
  );
}

function Donations({ impact, settings, lang }: { impact: PublicImpact; settings: Record<string, string | boolean>; lang: "de" | "en" }) {
  const [open, setOpen] = useState(false);
  const eurFormat = (cents?: number | null) =>
    new Intl.NumberFormat("de-AT", { style: "currency", currency: "EUR" }).format((cents ?? 0) / 100);
  const instructions = typeof settings.donations_instructions === "string" ? settings.donations_instructions : "";
  const account = typeof settings.donations_account === "string" ? settings.donations_account : "";
  const categories = useQuery({
    queryKey: ["public-donation-categories"],
    enabled: open,
    staleTime: 300_000,
    queryFn: publicDonationCategories,
  });
  const total = impact.total_amount_cents ?? 0;
  const goal = impact.goal_cents ?? null;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const amountRaw = String(form.get("amount") ?? "").trim();
    try {
      await createDonationRequest({
        contact_name: String(form.get("contact_name") ?? ""),
        contact_email: String(form.get("contact_email") ?? ""),
        contact_phone: String(form.get("contact_phone") ?? "") || null,
        amount_cents: amountRaw ? Math.round(parseFloat(amountRaw.replace(",", ".")) * 100) : null,
        category_id: String(form.get("category_id") ?? "") || null,
        message: String(form.get("message") ?? "") || null,
      });
      toast.success(lang === "de" ? "Danke! Wir melden uns bei dir." : "Thank you! We will get back to you.");
      setOpen(false);
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
  return (
    <section className="mt-16 rounded-xl border bg-card p-6">
      <h2 className="text-2xl font-bold">{lang === "de" ? "Unterstützen" : "Support the flat"}</h2>
      {instructions && <p className="mt-2 max-w-2xl whitespace-pre-line text-sm text-muted-foreground">{instructions}</p>}
      {account && <p className="mt-1 break-words text-sm text-muted-foreground">{account}</p>}
      {total > 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          {lang === "de" ? "Bisher gesammelt" : "Raised so far"}: <strong>{eurFormat(total)}</strong>
          {impact.this_year_amount_cents
            ? ` (${lang === "de" ? "heuer" : "this year"}: ${eurFormat(impact.this_year_amount_cents)})`
            : ""}
        </p>
      )}
      {goal ? <progress className="mt-3 h-2 w-full accent-primary" value={Math.min(total, goal)} max={goal} /> : null}
      {open ? (
        <form onSubmit={submit} className="mt-5 grid max-w-md gap-3 text-sm">
          <Input name="contact_name" placeholder={lang === "de" ? "Name" : "Name"} required />
          <Input name="contact_email" type="email" placeholder="Email" required />
          <Input name="contact_phone" placeholder={lang === "de" ? "Telefon (optional)" : "Phone (optional)"} />
          <Input name="amount" type="number" min="1" step="0.01" placeholder={lang === "de" ? "Betrag in EUR (optional)" : "Amount in EUR (optional)"} />
          <select name="category_id" className="h-9 rounded-md border bg-background px-3">
            <option value="">{lang === "de" ? "Zweck (optional)" : "Purpose (optional)"}</option>
            {(categories.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <textarea
            name="message"
            rows={3}
            maxLength={2000}
            placeholder={lang === "de" ? "Nachricht" : "Message"}
            className="w-full rounded-md border bg-background p-3"
          />
          <div className="flex gap-2">
            <Button type="submit">{lang === "de" ? "Anfrage senden" : "Send request"}</Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {lang === "de" ? "Abbrechen" : "Cancel"}
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" className="mt-4" onClick={() => setOpen(true)}>
          {lang === "de" ? "Spendenanfrage" : "Make a donation request"}
        </Button>
      )}
    </section>
  );
}
