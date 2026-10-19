import { createFileRoute } from "@tanstack/react-router";
import { HubPage } from "@/components/flat/HubPage";
import { pageHead } from "@/lib/flat-actions";

export const Route = createFileRoute("/_authenticated/notices")({
  head: () => pageHead("Noticeboard", "Household announcements and acknowledgements."),
  component: Page,
});
function Page() { return <HubPage kind="notices" />; }
