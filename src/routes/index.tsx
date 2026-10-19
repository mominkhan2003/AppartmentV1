import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Home, Receipt, Sparkles, Wrench } from "lucide-react";

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

function Index() {
  const items = [
    { icon: Receipt, t: "Fair expenses", d: "Split by group or custom shares, claims reviewed by the admin." },
    { icon: Sparkles, t: "Cleaning rota", d: "Duties rotate automatically, with photo proof." },
    { icon: Wrench, t: "Issues", d: "Report a broken tap, follow it until resolved." },
    { icon: Home, t: "Floor plan", d: "See every room and washroom in 2D or 3D." },
  ];
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-6 py-20">
        <div className="flex items-center gap-2 text-primary">
          <Home className="h-6 w-6" /> <span className="font-display text-lg font-bold">FlatMate Hub</span>
        </div>
        <h1 className="mt-10 max-w-2xl text-5xl font-bold leading-tight">Seven people, one flat, zero spreadsheets.</h1>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground">Everything your shared flat needs: who owes what, whose turn it is to clean, and what needs fixing.</p>
        <Button asChild size="lg" className="mt-8"><Link to="/auth">Sign in</Link></Button>
        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((i) => (
            <div key={i.t} className="rounded-xl border bg-card p-5">
              <i.icon className="h-5 w-5 text-accent" />
              <h3 className="mt-3 font-semibold">{i.t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{i.d}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
