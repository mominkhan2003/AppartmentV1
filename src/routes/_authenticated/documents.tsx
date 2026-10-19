import { createFileRoute } from "@tanstack/react-router";
import { HubPage } from "@/components/flat/HubPage";
import { pageHead } from "@/lib/flat-actions";

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => pageHead("Shared documents", "Household document links in one place."),
  component: Page,
});
function Page() { return <HubPage kind="documents" />; }
