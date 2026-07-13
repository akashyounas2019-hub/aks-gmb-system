import { createFileRoute } from "@tanstack/react-router";
import { PostGeneratorPage } from "@/routes/_authenticated/post-generator";

export const Route = createFileRoute("/_authenticated/social/facebook")({
  component: () => (
    <PostGeneratorPage defaultPlatform="facebook" pageTitle="Facebook" />
  ),
});
