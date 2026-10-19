import { createFileRoute } from "@tanstack/react-router";
import { HubPage } from "@/components/flat/HubPage";
import { pageHead } from "@/lib/flat-actions";

export const Route = createFileRoute("/_authenticated/contacts")({
  head: () => pageHead("Useful contacts", "Landlord, maintenance and local service contacts."),
  component: Page,
});
function Page() { return <HubPage kind="contacts" />; }
