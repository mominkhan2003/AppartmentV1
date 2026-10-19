import { createFileRoute } from "@tanstack/react-router";
import { HubPage } from "@/components/flat/HubPage";
import { pageHead } from "@/lib/flat-actions";

export const Route = createFileRoute("/_authenticated/events")({
  head: () => pageHead("Events", "Household gatherings and resident RSVPs."),
  component: Page,
});
function Page() { return <HubPage kind="events" />; }
