import { createFileRoute } from "@tanstack/react-router";
import { HubPage } from "@/components/flat/HubPage";
import { pageHead } from "@/lib/flat-actions";

export const Route = createFileRoute("/_authenticated/polls")({
  head: () => pageHead("Household polls", "Vote on household decisions and see live results."),
  component: Page,
});
function Page() { return <HubPage kind="polls" />; }
