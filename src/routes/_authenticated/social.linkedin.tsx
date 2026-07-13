import { createFileRoute } from "@tanstack/react-router";
import { SocialAccountScreen } from "@/components/SocialAccountScreen";

export const Route = createFileRoute("/_authenticated/social/linkedin")({
  component: () => <SocialAccountScreen platform="linkedin" title="LinkedIn" />,
});
