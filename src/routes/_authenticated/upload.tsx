import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { UploadPanel } from "@/components/UploadPanel";

export const Route = createFileRoute("/_authenticated/upload")({
  component: UploadPage,
});

function UploadPage() {
  const navigate = useNavigate();
  return (
    <div className="w-full py-6 pl-6 md:py-10 md:pl-10" style={{ paddingRight: 50 }}>
      <h1 className="text-3xl">Upload a video</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Extraction runs entirely in your browser. Nothing leaves your machine until
        you have the frames you want.
      </p>
      <UploadPanel
        showHeader={false}
        onComplete={() => navigate({ to: "/library" })}
      />
    </div>
  );
}
