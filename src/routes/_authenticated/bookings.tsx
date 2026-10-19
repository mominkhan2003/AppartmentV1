import { createFileRoute } from "@tanstack/react-router";
import { HubPage } from "@/components/flat/HubPage";
import { pageHead } from "@/lib/flat-actions";

export const Route = createFileRoute("/_authenticated/bookings")({
  head: () => pageHead("Resource bookings", "Reserve shared spaces and equipment without overlapping bookings."),
  component: Page,
});
function Page() { return <HubPage kind="bookings" />; }
