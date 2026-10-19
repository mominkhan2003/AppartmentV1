import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, Mail, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Editor, TextField, DataState, text } from "@/components/flat/Forms";
import { PageHeader } from "@/components/flat/Page";
import { useMe, useRefresh } from "@/lib/flat";
import { checked, pageHead } from "@/lib/flat-actions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => pageHead("My account", "Manage your FlatMate Hub name, login email and password."),
  component: Account,
});
function Account() {
  const query = useMe();
  const me = query.data;
  const refresh = useRefresh();
  return <div className="max-w-3xl">
    <PageHeader title="My account" /><DataState query={query} />
    {me && <div className="divide-y border-y">
      <section className="flex flex-wrap items-center justify-between gap-4 py-6">
        <div><h2 className="flex items-center gap-2 font-semibold"><UserRound className="h-4 w-4" />Name</h2><p className="mt-2 text-sm">{me.resident?.display_name ?? "Not set"}</p><p className="mt-1 text-xs text-muted-foreground">{me.isAdmin ? "Administrator · Full access" : "Resident"}</p></div>
        <Editor title="Change name" trigger={<Button variant="outline" disabled={!me.resident}>Change name</Button>} onSave={async d => {
          if (!me.resident) throw new Error("Resident account not found");
          await checked(supabase.from("residents").update({display_name:text(d,"name")}).eq("id",me.resident.id)); await refresh();
        }}><TextField label="Name" name="name" value={me.resident?.display_name} required /></Editor>
      </section>
      <section className="flex flex-wrap items-center justify-between gap-4 py-6">
        <div className="min-w-0"><h2 className="flex items-center gap-2 font-semibold"><Mail className="h-4 w-4" />Login email</h2><p className="mt-2 break-all text-sm">{me.user.email}</p>{me.user.new_email && <p className="mt-1 text-sm text-muted-foreground break-all">Awaiting confirmation: {me.user.new_email}</p>}</div>
        <Editor title="Change login email" trigger={<Button variant="outline">Change email</Button>} onSave={async d => {
          const {error} = await supabase.auth.updateUser({email:text(d,"email")},{emailRedirectTo:window.location.origin+"/account"});
          if (error) throw error; toast.success("Check your old and new inboxes to confirm the email change."); await refresh();
        }}><TextField label="New email" type="email" name="email" required /></Editor>
      </section>
      <section className="flex flex-wrap items-center justify-between gap-4 py-6">
        <h2 className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4" />Password</h2>
        <Editor title="Change password" trigger={<Button variant="outline">Change password</Button>} onSave={async d => {
          const password = text(d,"password");
          if (password.length < 8) throw new Error("Use at least 8 characters");
          if (password !== text(d,"confirm")) throw new Error("Passwords do not match");
          const {error} = await supabase.auth.updateUser({password,current_password:text(d,"current")});
          if (error) throw error;
        }}><TextField label="Current password" name="current" type="password" required /><TextField label="New password" name="password" type="password" required /><TextField label="Confirm password" name="confirm" type="password" required /></Editor>
      </section>
    </div>}
  </div>;
}