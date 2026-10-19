import { createFileRoute } from "@tanstack/react-router";
import { HubPage } from "@/components/flat/HubPage";
import { pageHead } from "@/lib/flat-actions";

export const Route = createFileRoute("/_authenticated/lost-found")({
  head: () => pageHead("Lost & found", "Report missing belongings and claim found items."),
  component: Page,
});
function Page() { return <HubPage kind="lost-found" />; }
