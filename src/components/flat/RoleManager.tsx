import { useQuery } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Editor, TextField, Notes, DataState, text } from "@/components/flat/Forms";
import { useResidents, useRefresh, useMe } from "@/lib/flat";
import { rpc } from "@/lib/flat-actions";
import { supabase } from "@/integrations/supabase/client";
import { portalPermissions } from "@/lib/portal-permissions";

export function RoleManager() {
  const { data: me } = useMe();
  const { data: residents = [] } = useResidents();
  const refresh = useRefresh();
  const roles = useQuery({ queryKey: ["portal_roles"], queryFn: async () => {
    const { data, error } = await supabase.from("portal_roles").select("*").order("name");
    if (error) throw error;
    return data;
  }});
  const members = useQuery({ queryKey: ["portal_role_members"], queryFn: async () => {
    const { data, error } = await supabase.from("portal_role_members").select("*");
    if (error) throw error;
    return data;
  }});
  const admins = useQuery({ queryKey: ["admins"], queryFn: async () => {
    const { data, error } = await supabase.rpc("list_admin_residents");
    if (error) throw error;
    return data;
  }});
  const roleEditor = (role?: NonNullable<typeof roles.data>[number]) => <Editor
    title={role ? "Edit role" : "Create role"}
    trigger={role ? <Button size="icon" variant="outline" aria-label={"Edit role " + role.name}><Pencil /></Button> : <Button><Plus />Create role</Button>}
    onSave={async d => {
      await rpc("save_portal_role", { _id: role?.id ?? null, _name: text(d, "name"), _description: text(d, "description"), _permissions: d.getAll("permissions").map(String) });
      await refresh();
    }}>
    <TextField label="Role name" name="name" value={role?.name} required />
    <Notes label="Description" name="description" value={role?.description ?? ""} />
    <fieldset className="grid gap-3"><legend className="mb-3 text-sm font-semibold">Permissions</legend>
      {portalPermissions.map(p => <label key={p.id} className="flex items-start gap-3 text-sm"><input type="checkbox" name="permissions" value={p.id} defaultChecked={role?.permissions.includes(p.id)} className="mt-1" />{p.name}</label>)}
    </fieldset>
  </Editor>;
  return <section>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Custom roles</h2>{roleEditor()}</div>
    <DataState query={roles} /><DataState query={members} /><DataState query={admins} />
    <div className="grid gap-3 sm:grid-cols-2">
      {roles.data?.map(role => <article key={role.id} className="rounded-lg border bg-card p-4">
        <div className="flex items-start justify-between gap-2"><h3 className="font-semibold break-words">{role.name}</h3><div className="flex gap-2">{roleEditor(role)}
          <Editor title={"Delete " + role.name} destructive trigger={<Button size="icon" variant="outline" aria-label={"Delete role " + role.name}><Trash2 /></Button>} onSave={async () => { await rpc("delete_portal_role", {_id: role.id}); await refresh(); }}><p className="text-sm">Remove this role from all assigned accounts?</p></Editor>
        </div></div>
        <p className="mt-2 text-sm text-muted-foreground break-words">{role.description}</p>
        <ul className="mt-3 space-y-1 text-sm">{role.permissions.map(p => <li key={p}>{portalPermissions.find(x => x.id === p)?.name}</li>)}</ul>
        {!role.permissions.length && <p className="mt-3 text-sm text-muted-foreground">No additional permissions</p>}
      </article>)}
    </div>
    <h2 className="mt-8 mb-4 text-xl font-semibold">Account access</h2>
    <div className="divide-y border-y">{residents.filter(r => r.user_id).map(r => {
      const isAdmin = admins.data?.includes(r.id) ?? false;
      const assigned = members.data?.filter(m => m.user_id === r.user_id).map(m => m.role_id) ?? [];
      return <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="min-w-0"><p className="font-semibold break-words">{r.display_name}{r.user_id === me?.user.id && " (you)"}</p><p className="text-xs text-muted-foreground break-all">{r.email}</p>
          <p className="mt-1 text-sm">{isAdmin ? "Administrator · Full access" : "Resident"}{assigned.length ? " · " + roles.data?.filter(x => assigned.includes(x.id)).map(x => x.name).join(", ") : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Editor title={"Roles for " + r.display_name} trigger={<Button variant="outline" disabled={members.isPending || !!members.error}><ShieldCheck />Assign roles</Button>} onSave={async d => { await rpc("assign_portal_roles", {_resident_id:r.id, _roles:d.getAll("roles").map(String)}); await refresh(); }}>
            <fieldset className="grid gap-3"><legend className="mb-3 text-sm font-semibold">Custom roles</legend>{roles.data?.map(role => <label key={role.id} className="flex gap-3 text-sm"><input type="checkbox" name="roles" value={role.id} defaultChecked={assigned.includes(role.id)} />{role.name}</label>)}</fieldset>
          </Editor>
          <Editor title={isAdmin ? "Remove administrator" : "Grant administrator"} trigger={<Button variant="outline" disabled={r.user_id === me?.user.id || admins.isPending || !!admins.error}>{isAdmin ? "Remove admin" : "Make admin"}</Button>} onSave={async () => { await rpc("set_admin", {_resident_id:r.id,_make_admin:!isAdmin}); await refresh(); }}>
            <p className="text-sm">{isAdmin ? "Remove full administrator access from" : "Give full administrator access to"} {r.display_name}?</p>
          </Editor>
        </div>
      </div>;
    })}</div>
  </section>;
}