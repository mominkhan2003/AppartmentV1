import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, Mail, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Editor, TextField, DataState, text } from "@/components/flat/Forms";
import { PageHeader } from "@/components/flat/Page";
import { useMe, useRefresh } from "@/lib/flat";
import { updateResident, changeEmail, changePassword, pageHead } from "@/lib/flat-actions";
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
    {me?.force_password_change && (
      <div className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">Set your own password to continue</p>
        <p className="mt-1">
          You are signed in with the temporary password <code className="rounded bg-white/70 px-1">Password123!</code>.
          Use Change password below; the prompt disappears as soon as the new password is saved.
        </p>
      </div>
    )}
    {me && <div className="divide-y border-y">
      <section className="flex flex-wrap items-center justify-between gap-4 py-6">
        <div><h2 className="flex items-center gap-2 font-semibold"><UserRound className="h-4 w-4" />Name</h2><p className="mt-2 text-sm">{me.resident?.display_name ?? "Not set"}</p><p className="mt-1 text-xs text-muted-foreground">{me.isAdmin ? "Administrator · Full access" : me.can_view_finance === false ? "Limited access · Household pages only" : "Resident"}</p></div>
        <Editor title="Change name" trigger={<Button variant="outline" disabled={!me.resident}>Change name</Button>} onSave={async d => {
          if (!me.resident) throw new Error("Resident account not found");
          await updateResident(me.resident.id, { display_name: text(d, "name") }); await refresh();
        }}><TextField label="Name" name="name" value={me.resident?.display_name} required /></Editor>
      </section>
      <section className="flex flex-wrap items-center justify-between gap-4 py-6">
        <div className="min-w-0"><h2 className="flex items-center gap-2 font-semibold"><Mail className="h-4 w-4" />Login details</h2><p className="mt-2 break-all text-sm">{me.user.email}</p>{me.user.username && <p className="mt-1 text-xs text-muted-foreground">Username: <b>{me.user.username}</b></p>}</div>
        <Editor title="Change login email" trigger={<Button variant="outline">Change email</Button>} onSave={async d => {
          if (text(d, "current_password") === "") throw new Error("Enter your current password to confirm the change");
          await changeEmail(text(d, "email"), text(d, "current_password"));
          toast.success("Email updated. Use the new address the next time you sign in."); await refresh();
        }}><TextField label="New email" type="email" name="email" required /><TextField label="Current password (confirm)" name="current_password" type="password" required /></Editor>
      </section>
      <section className="flex flex-wrap items-center justify-between gap-4 py-6">
        <h2 className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4" />Password</h2>
        <Editor title="Change password" trigger={<Button variant="outline">Change password</Button>} onSave={async d => {
          const password = text(d,"password");
          if (password.length < 8) throw new Error("Use at least 8 characters");
          if (password !== text(d,"confirm")) throw new Error("Passwords do not match");
          await changePassword(text(d,"current"), password);
          toast.success("Password updated. Your starting-password prompt is gone.");
          await refresh();
        }}><TextField label="Current password" name="current" type="password" required /><TextField label="New password" name="password" type="password" required /><TextField label="Confirm password" name="confirm" type="password" required /></Editor>
      </section>
    </div>}
  </div>;
}
