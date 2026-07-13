import { createFileRoute } from "@tanstack/react-router";
import { SocialAccountScreen } from "@/components/SocialAccountScreen";

export const Route = createFileRoute("/_authenticated/social/facebook")({
  component: () => <SocialAccountScreen platform="facebook" title="Facebook" />,
});
