import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, { url: string; expires: number }>();

export function useSignedUrl(bucket: string, path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setUrl(null);
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
      .then(({ data }) => {
        if (cancelled || !data?.signedUrl) return;
        cache.set(key, { url: data.signedUrl, expires: now + 55 * 60_000 });
        setUrl(data.signedUrl);
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
  if (!url) {
    return <div className={`animate-pulse bg-muted ${className ?? ""}`} />;
  }
  return <img src={url} alt={alt} className={className} loading="lazy" />;
}
