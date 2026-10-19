import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { pageHead } from "@/lib/flat-actions";
export const Route = createFileRoute("/reset-password")({head:()=>pageHead("Reset password", "Set a new password for your FlatMate Hub account."), component:ResetPassword});
function ResetPassword() {
  const [ready,setReady]=useState(false);
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [done,setDone]=useState(false);
  useEffect(()=> {
    // Remember the recovery marker before the auth client consumes the hash.
    const recovery=window.location.hash.includes("type=recovery");
    void supabase.auth.getUser().then(({data})=>setReady(!!data.user));
    if(recovery) void supabase.auth.getSession().then(({data})=>setReady(!!data.session));
  },[]);
  return <main className="grid min-h-screen place-items-center px-4"><div className="w-full max-w-sm space-y-5">
    <h1 className="text-2xl font-bold">{done ? "Password updated" : "Reset password"}</h1>
    {done ? <Button asChild><Link to="/auth">Continue to sign in</Link></Button> : ready ? <form className="space-y-4" onSubmit={async e=>{
      e.preventDefault();setError("");
      if(password!==confirm){setError("Passwords do not match");return;}
      setBusy(true);const {error}=await supabase.auth.updateUser({password});setBusy(false);
      if(error)setError(error.message);else setDone(true);
    }}><Label className="grid gap-2">New password<Input type="password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)} /></Label><Label className="grid gap-2">Confirm password<Input type="password" minLength={8} required value={confirm} onChange={e=>setConfirm(e.target.value)} /></Label>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<Button disabled={busy} className="w-full">{busy?"Saving…":"Set password"}</Button></form> : <><p className="text-sm text-muted-foreground">Open the password reset link from your email.</p><Button asChild variant="outline"><Link to="/auth">Back to sign in</Link></Button></>}
  </div></main>;
}