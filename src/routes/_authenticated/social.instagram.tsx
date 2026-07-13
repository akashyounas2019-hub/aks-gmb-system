import { createFileRoute } from "@tanstack/react-router";
import { SocialAccountScreen } from "@/components/SocialAccountScreen";

export const Route = createFileRoute("/_authenticated/social/instagram")({
  component: () => <SocialAccountScreen platform="instagram" title="Instagram" />,
});
