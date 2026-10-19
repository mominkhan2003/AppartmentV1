import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPassword } from "@/lib/flat-actions";
import { pageHead } from "@/lib/flat-actions";
export const Route = createFileRoute("/reset-password")({head:()=>pageHead("Reset password", "Set a new password for your FlatMate Hub account."), component:ResetPassword});
function ResetPassword() {
  const [token] = useState(() => new URLSearchParams(window.location.search).get("token") ?? "");
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [done,setDone]=useState(false);
  const ready = token !== "";
  return <main className="grid min-h-screen place-items-center px-4"><div className="w-full max-w-sm space-y-5">
    <h1 className="text-2xl font-bold">{done ? "Password updated" : "Reset password"}</h1>
    {done ? <Button asChild><Link to="/auth">Continue to sign in</Link></Button> : ready ? <form className="space-y-4" onSubmit={async e=>{
      e.preventDefault();setError("");
      if(password!==confirm){setError("Passwords do not match");return;}
      setBusy(true);
      try {
        await resetPassword(token, password);
        setDone(true);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setBusy(false);
      }
    }}><Label className="grid gap-2">New password<Input type="password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)} /></Label><Label className="grid gap-2">Confirm password<Input type="password" minLength={8} required value={confirm} onChange={e=>setConfirm(e.target.value)} /></Label>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<Button disabled={busy} className="w-full">{busy?"Saving…":"Set password"}</Button></form> : <><p className="text-sm text-muted-foreground">Open the password reset link you received (or ask an administrator for one).</p><Button asChild variant="outline"><Link to="/auth">Back to sign in</Link></Button></>}
  </div></main>;
}
