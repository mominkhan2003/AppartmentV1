import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Home } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — FlatMate Hub" },
      { name: "description", content: "Sign in to your shared flat's FlatMate Hub." },
      { property: "og:title", content: "Sign in — FlatMate Hub" },
      { property: "og:description", content: "Sign in to your shared flat's FlatMate Hub." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        nav({ to: "/dashboard", replace: true });
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/dashboard", data: { display_name: name } },
        });
        if (error) throw error;
        if (data.session) nav({ to: "/dashboard", replace: true });
        else toast.success("Check your email to confirm your account.");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-8 shadow-sm">
        <div className="flex items-center gap-2 text-primary">
          <Home className="h-6 w-6" />
          <span className="font-display text-xl font-bold">FlatMate Hub</span>
        </div>
        <h1 className="text-2xl font-bold">{mode === "in" ? "Welcome back" : "Join your flat"}</h1>
        {mode === "up" && (
          <div className="space-y-1">
            <Label htmlFor="name">Your name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pw">Password</Label>
          <Input id="pw" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <Button className="w-full" disabled={busy}>{mode === "in" ? "Sign in" : "Create account"}</Button>
        {mode === "in" && <Button type="button" variant="link" className="w-full" disabled={busy} onClick={async () => {
          if (!email) { toast.error("Enter your login email first."); return; }
          setBusy(true);
          const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/reset-password" });
          setBusy(false);
          if (error) toast.error(error.message); else toast.success("If an account exists, a password reset link has been sent.");
        }}>Forgot password?</Button>}
        <Button type="button" variant="link" className="w-full text-sm text-muted-foreground" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}
        </Button>
        {mode === "up" && (
          <p className="text-xs text-muted-foreground">The first person to sign up becomes the flat admin. If the admin added you with your email, your account links automatically.</p>
        )}
      </form>
    </div>
  );
}
