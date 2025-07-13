import { useState, useEffect } from "react";
import { createClientComponentClient } from "@/lib/supabase/client";

/**
 * RecitationAudioPlayer ensures secure playback of Quran recitations from Supabase Storage.
 * Always use this component instead of a raw <audio src> for any recitation audio file.
 * It fetches a signed URL for the given storagePath and handles errors gracefully.
 */
export function RecitationAudioPlayer({ storagePath, className }: { storagePath: string, className?: string }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!storagePath) {
      setSignedUrl(null);
      setAudioError(null);
      return;
    }
    setLoading(true);
    const supabase = createClientComponentClient();
    supabase.storage.from("recitations").createSignedUrl(storagePath, 60)
      .then(({ data, error }) => {
        if (error || !data?.signedUrl) {
          setAudioError("Could not load audio. Please try again later.");
          setSignedUrl(null);
        } else {
          setSignedUrl(data.signedUrl);
          setAudioError(null);
          if (process.env.NODE_ENV !== "production") console.log("Signed audio URL:", data.signedUrl);
        }
      })
      .finally(() => setLoading(false));
  }, [storagePath]);

  if (loading) return <div className="w-full text-center py-2">Loading audio...</div>;
  if (audioError) return <div className="text-red-600 w-full text-center">{audioError}</div>;
  if (!signedUrl) return null;
  return (
    <audio controls src={signedUrl} className={className || "w-full"}>
      Your browser does not support the audio element.
    </audio>
  );
} 