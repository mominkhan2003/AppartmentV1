import { createFileRoute } from "@tanstack/react-router";
import { HubPage } from "@/components/flat/HubPage";
import { pageHead } from "@/lib/flat-actions";

export const Route = createFileRoute("/_authenticated/rules")({
  head: () => pageHead("House rules", "Household agreements and resident acknowledgements."),
  component: Page,
});
function Page() { return <HubPage kind="rules" />; }
