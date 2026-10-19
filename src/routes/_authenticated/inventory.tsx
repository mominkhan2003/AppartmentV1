import { createFileRoute } from "@tanstack/react-router";
import { HubPage } from "@/components/flat/HubPage";
import { pageHead } from "@/lib/flat-actions";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => pageHead("Shared inventory", "Track shared belongings, borrowing and returns."),
  component: Page,
});
function Page() { return <HubPage kind="inventory" />; }
