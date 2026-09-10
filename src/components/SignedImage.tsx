import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, { url: string; expires: number }>();

export function useSignedUrl(bucket: string, path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    if (
      path.startsWith("http://") ||
      path.startsWith("https://") ||
      path.startsWith("blob:") ||
      path.startsWith("data:")
    ) {
      setUrl(path);
      return;
    }
    const key = `${bucket}:${path}`;
    const cached = cache.get(key);
    const now = Date.now();
    if (cached && cached.expires > now + 30_000) {
      setUrl(cached.url);
      return;
    }
    let cancelled = false;
    supabase.storage
      .from(bucket)
      .createSignedUrl(path, 60 * 60)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (data?.signedUrl) {
          cache.set(key, { url: data.signedUrl, expires: now + 55 * 60_000 });
          setUrl(data.signedUrl);
        } else {
          const { data: pubData } = supabase.storage.from(bucket).getPublicUrl(path);
          if (pubData?.publicUrl) {
            setUrl(pubData.publicUrl);
          }
        }
      })
      .catch(() => {
        if (!cancelled) {
          const { data: pubData } = supabase.storage.from(bucket).getPublicUrl(path);
          if (pubData?.publicUrl) setUrl(pubData.publicUrl);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bucket, path]);

  return url;
}

export function SignedImage({
  bucket,
  path,
  alt,
  className,
}: {
  bucket: string;
  path: string | null | undefined;
  alt: string;
  className?: string;
}) {
  const url = useSignedUrl(bucket, path);
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return (
      <div className={`flex items-center justify-center bg-muted/50 text-muted-foreground ${className ?? ""}`}>
        <ImageIcon className="h-4 w-4 opacity-40" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
