import fetch from "node-fetch";

/**
 * Streams audio from a Supabase Storage signed URL directly to the Hugging Face API.
 * Assumptions:
 * - The signedUrl is a valid, time-limited Supabase Storage URL for the audio file.
 * - The contentType matches the file (e.g., 'audio/wav', 'audio/webm', etc.).
 * - The Hugging Face API endpoint expects the audio as the POST body.
 * - The Hugging Face API token is valid and has access to the model.
 */
export async function streamAudioToHuggingFace({
  signedUrl,
  hfApiToken,
  contentType,
  model = "your-model"
}: {
  signedUrl: string;
  hfApiToken: string;
  contentType: string;
  model?: string;
}): Promise<any> {
  // 1. Fetch the audio file as a stream from Supabase Storage
  const audioRes = await fetch(signedUrl);
  if (!audioRes.ok || !audioRes.body) throw new Error("Failed to fetch audio from storage");

  // 2. Stream the audio to Hugging Face API
  const hfRes = await fetch("https://g2ytqe2y7y7hbcy1.us-east-1.aws.endpoints.huggingface.cloud", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${hfApiToken}`,
      "Content-Type": contentType,
    },
    body: audioRes.body, // Pass the ReadableStream directly
  });

  if (!hfRes.ok) throw new Error("Hugging Face API error: " + (await hfRes.text()));
  return await hfRes.json();
} 