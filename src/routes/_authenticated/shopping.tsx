import { createFileRoute } from "@tanstack/react-router";
import { HubPage } from "@/components/flat/HubPage";
import { pageHead } from "@/lib/flat-actions";

export const Route = createFileRoute("/_authenticated/shopping")({
  head: () => pageHead("Shopping list", "Shared groceries and household essentials."),
  component: Page,
});
function Page() { return <HubPage kind="shopping" />; }
