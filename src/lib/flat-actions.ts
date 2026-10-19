import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Functions = Database["public"]["Functions"];
export async function rpc<K extends keyof Functions>(
  name: K,
  args: { [P in keyof Functions[K]["Args"]]: Functions[K]["Args"][P] | null },
) {
  const { data, error } = await supabase.rpc(name, args as Functions[K]["Args"]);
  if (error) throw new Error(error.message);
  return data;
}
export async function checked(result: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await result;
  if (error) throw new Error(error.message);
}
export const pageHead = (title: string, description: string) => ({
  meta: [
    { title: `${title} — FlatMate Hub` },
    { name: "description", content: description },
    { property: "og:title", content: `${title} — FlatMate Hub` },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ],
});
