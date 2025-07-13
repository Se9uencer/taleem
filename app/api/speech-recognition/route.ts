// File: app/api/speech-recognition/route.ts
import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { normalizeArabicText, calculateSimilarity } from "@/lib/arabic-utils"
import { createClient } from "@supabase/supabase-js"
import { supabaseConfig } from "@/lib/config"
import type {
  Recitation,
  Assignment,
  Feedback,
  Surah,
  UpdateErrorStatusParams,
  SignedUploadUrlRequest,
  SignedUploadUrlResponse
} from "@/types";
import pino from "pino";
import * as Sentry from '@sentry/nextjs';
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 1.0,
  environment: process.env.NODE_ENV,
});
const logger = pino({ level: process.env.NODE_ENV === "production" ? "info" : "debug" });

const HF_API_TOKEN = process.env.HF_API_TOKEN;
const HUGGINGFACE_MODEL_URL = "https://g2ytqe2y7y7hbcy1.us-east-1.aws.endpoints.huggingface.cloud";

// Helper function to update the error status in the database
async function updateErrorStatus(supabase: any, recitationId: string, message: string) {
    await supabase
      .from("recitations")
      .update({
        transcription_status: 'error',
        transcription_error: message
      })
      .eq("id", recitationId);
}

// --- BEGIN RATE LIMITER ---
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10;
// Map: key (userId or IP) -> array of timestamps
const rateLimitStore = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = rateLimitStore.get(key) || [];
  // Remove timestamps outside the window
  const recent = timestamps.filter(ts => ts > windowStart);
  recent.push(now);
  rateLimitStore.set(key, recent);
  return recent.length > RATE_LIMIT_MAX_REQUESTS;
}
// --- END RATE LIMITER ---

// Helper to generate recitation storage path
function getRecitationStoragePath({ userId, assignmentId, fileType }: { userId: string, assignmentId: string, fileType: string }) {
  const fileExtension = fileType.split("/")[1] || "webm";
  const timestamp = Date.now();
  return `recitations/${userId}/${assignmentId}/${timestamp}.${fileExtension}`;
}

export async function POST(request: Request) {
  // --- AUTHENTICATION ENFORCEMENT ---
  let accessToken: string | null = null;
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    accessToken = authHeader.replace("Bearer ", "").trim();
  } else {
    const cookie = request.headers.get("cookie") || "";
    const match = cookie.match(/sb-access-token=([^;]+)/);
    if (match) accessToken = match[1];
  }

  let userId: string | null = null;
  if (accessToken) {
    const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);
    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
    if (!userError && user) {
      userId = user.id;
    }
  }
  // Use userId if available, else fallback to IP address
  let rateLimitKey = userId;
  if (!rateLimitKey) {
    // Try to get IP from headers (works on Vercel/Next.js)
    rateLimitKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown-ip";
  }
  if (isRateLimited(rateLimitKey)) {
    return NextResponse.json({ error: "Too many requests. Please wait and try again." }, { status: 429 });
  }

  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized: No access token provided." }, { status: 401 });
  }

  // Create a Supabase client with the anon key to verify the token
  const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);
  const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized: Invalid or expired session." }, { status: 401 });
  }
  // --- END AUTHENTICATION ENFORCEMENT ---

  if (!HF_API_TOKEN) {
    logger.error({ msg: "Hugging Face API token is not set in environment variables.", event: "missing_hf_token", timestamp: new Date().toISOString() });
    return NextResponse.json({ error: "Speech recognition service is not configured." }, { status: 500 });
  }

  let recitationId: string;
  let audioBlob: Blob;
  // Use the service role client for DB writes, but only after auth check
  const serviceSupabase = await createServiceRoleClient();

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    recitationId = formData.get("recitationId") as string;

    // --- AUDIO FILE VALIDATION ---
    logger.info({ msg: "Validating audio file submission", recitationId, fileType: file?.type, fileSize: file?.size });
    const ALLOWED_MIME_TYPES = [
      "audio/webm",
      "audio/wav",
      "audio/mpeg",
      "audio/mp3",
      "audio/ogg",
      "audio/x-wav",
      "audio/x-m4a",
      "audio/mp4",
      "audio/aac",
      "audio/flac"
    ];
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

    if (!file || !recitationId) {
      logger.error({ msg: "Missing audio file or recitation ID", recitationId, file });
      throw new Error("Missing audio file or recitation ID in the request.");
    }
    audioBlob = file;

    // Check MIME type
    logger.info({ msg: "Checking MIME type", fileType: file.type });
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      logger.error({ msg: "Invalid file type", fileType: file.type });
      return NextResponse.json({ error: `Invalid file type: ${file.type}` }, { status: 400 });
    }
    // Check file size
    logger.info({ msg: "Checking file size", fileSize: file.size });
    if (file.size > MAX_FILE_SIZE) {
      logger.error({ msg: "File too large", fileSize: file.size });
      return NextResponse.json({ error: `File too large. Maximum allowed size is 10MB.` }, { status: 400 });
    }

    // --- SERVER-SIDE CONTENT SNIFFING ---
    logger.info({ msg: "Checking audio file magic number (signature)" });
    async function isValidAudioMagicNumber(blob: Blob) {
      const header = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
      // WAV: 52 49 46 46 ('RIFF') and 57 41 56 45 ('WAVE')
      if (header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46 && header[8] === 0x57 && header[9] === 0x41 && header[10] === 0x56 && header[11] === 0x45) return true;
      // MP3: 49 44 33 ('ID3') or 0xFF 0xFB/0xF3/0xF2
      if ((header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33) || (header[0] === 0xFF && (header[1] & 0xE0) === 0xE0)) return true;
      // OGG: 4F 67 67 53 ('OggS')
      if (header[0] === 0x4F && header[1] === 0x67 && header[2] === 0x67 && header[3] === 0x53) return true;
      // WEBM: 1A 45 DF A3 (Matroska)
      if (header[0] === 0x1A && header[1] === 0x45 && header[2] === 0xDF && header[3] === 0xA3) return true;
      // FLAC: 66 4C 61 43 ('fLaC')
      if (header[0] === 0x66 && header[1] === 0x4C && header[2] === 0x61 && header[3] === 0x43) return true;
      // AAC/MP4/M4A: 00 00 00 .. 66 74 79 70 ('ftyp') at offset 4
      if (header[4] === 0x66 && header[5] === 0x74 && header[6] === 0x79 && header[7] === 0x70) return true;
      return false;
    }
    if (!(await isValidAudioMagicNumber(file))) {
      logger.error({ msg: "Audio file failed magic number (signature) check" });
      return NextResponse.json({ error: "Uploaded file does not appear to be a valid audio file (bad signature)." }, { status: 400 });
    }
    // --- END SERVER-SIDE CONTENT SNIFFING ---
    // --- END AUDIO FILE VALIDATION ---

  } catch (e: any) {
    logger.error({ msg: "Failed to parse form data:", error: e.message, event: "parse_form_data_failed", timestamp: new Date().toISOString() });
    return NextResponse.json({ error: `Invalid request body: ${e.message}` }, { status: 400 });
  }
  
  try {
    // CHECKPOINT 1: Confirm the function started
    logger.info({ msg: "Processing recitation", recitationId, userId, checkpoint: 1, timestamp: new Date().toISOString() });
    await serviceSupabase.from("recitations").update({ transcription_error: "Processing started..." }).eq("id", recitationId);


    const { data: recitation, error: recitationError } = await serviceSupabase
      .from("recitations")
      .select(`id, assignments (target_text, surah_name, start_ayah, end_ayah)`)
      .eq("id", recitationId)
      .single();

    if (recitationError || !recitation) {
      throw new Error(`Recitation not found (ID: ${recitationId}): ${recitationError?.message}`);
    }

    // CHECKPOINT 2: Confirm we are about to call the AI model
    logger.info({ msg: "Sending audio to Hugging Face for recitation", recitationId, userId, checkpoint: 2, timestamp: new Date().toISOString() });
    await serviceSupabase.from("recitations").update({ transcription_error: "Sending to AI for analysis..." }).eq("id", recitationId);

    const hfResponse = await fetch(HUGGINGFACE_MODEL_URL, {
      method: "POST",
      headers: { "Authorization": `Bearer ${HF_API_TOKEN}`, "Content-Type": audioBlob.type || "audio/webm" },
      body: audioBlob,
    });

    if (!hfResponse.ok) {
      const errorBody = await hfResponse.text();
      throw new Error(`Hugging Face API Error: ${errorBody}`);
    }

    const transcriptionResult = await hfResponse.json();
    const transcribedText = transcriptionResult.text?.trim();

    if (!transcribedText) {
      throw new Error("Transcription failed: The model returned empty text.");
    }
    
    // CHECKPOINT 3: Confirm we got a response from the AI
    logger.info({ msg: "Received transcription for", recitationId, userId, checkpoint: 3, timestamp: new Date().toISOString() });
    await serviceSupabase.from("recitations").update({ transcription_error: "AI analysis complete. Saving results..." }).eq("id", recitationId);

    let accuracy = 0.0;
    let notes = "Recitation transcribed.";
    const assignment = Array.isArray(recitation.assignments) ? recitation.assignments[0] : recitation.assignments;
    const expectedQuranText = assignment?.target_text;

    if (expectedQuranText) {
      const normalizedTranscribedText = normalizeArabicText(transcribedText);
      const normalizedExpectedText = normalizeArabicText(expectedQuranText);
      accuracy = calculateSimilarity(normalizedTranscribedText, normalizedExpectedText);
      notes = accuracy < 0.8 ? "Good effort! Some differences found." : accuracy < 0.95 ? "Very good! Almost perfect." : "Excellent recitation!";
    } else {
        notes = "Transcription complete. Accuracy could not be calculated as no target text was found for the assignment.";
    }

    const { error: feedbackError } = await serviceSupabase.from("feedback").insert({
        recitation_id: recitationId,
        accuracy: accuracy,
        notes: notes,
        expected_text: expectedQuranText || `Reference: Surah ${assignment?.surah_name}, Ayahs ${assignment?.start_ayah}-${assignment?.end_ayah}`,
        generated_at: new Date().toISOString(),
    });
    if (feedbackError) throw feedbackError;

    // FINAL STEP: Mark as completed
    const { error: updateError } = await serviceSupabase.from("recitations").update({
        transcription: transcribedText,
        transcription_status: "completed",
        transcription_date: new Date().toISOString(),
        transcription_error: null // Clear the error log
    }).eq("id", recitationId);
    if (updateError) throw updateError;

    logger.info({ msg: "Successfully processed recitation", recitationId, userId, status: "completed", timestamp: new Date().toISOString() });
    return NextResponse.json({ success: true });

  } catch (error: any) {
    logger.error({ msg: `Taleem AI Error for Recitation ID ${recitationId}:`, error: error.message, event: "taleem_ai_error", recitationId, userId, timestamp: new Date().toISOString() });
    await updateErrorStatus(serviceSupabase, recitationId, error.message || 'An unknown processing error occurred.');
    Sentry.captureException(error, { extra: { userId, recitationId } });
    return NextResponse.json({ error: `Internal server error: ${error.message}` }, { status: 500 });
  }
}

// --- NEW: Generate signed upload URL for Supabase Storage ---
export async function PUT(request: Request) {
  // Require authentication
  let accessToken: string | null = null;
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    accessToken = authHeader.replace("Bearer ", "").trim();
  } else {
    const cookie = request.headers.get("cookie") || "";
    const match = cookie.match(/sb-access-token=([^;]+)/);
    if (match) accessToken = match[1];
  }
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized: No access token provided." }, { status: 401 });
  }
  const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);
  const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized: Invalid or expired session." }, { status: 401 });
  }
  // Parse request body for file info
  const { assignmentId, studentId, fileType, fileNameFromClient } = await request.json();
  if (!assignmentId || !studentId || !fileType) {
    return NextResponse.json({ error: "Missing assignmentId, studentId, or fileType." }, { status: 400 });
  }
  // Log for debugging
  console.log("[Recitation Upload] userId:", studentId, "assignmentId:", assignmentId, "fileType:", fileType, "fileNameFromClient:", fileNameFromClient);
  // Prepare file extension and base file name, stripping codec info
  const fileExtension = fileType.split("/")[1]?.split(";")[0] || "webm";
  const baseFileName = fileNameFromClient
    ? fileNameFromClient.split(";")[0].trim()
    : `${Date.now()}.${fileExtension}`;
  const fileName = `recitations/${studentId}/${assignmentId}/${baseFileName}`;
  // Use service role for signed URL
  const serviceSupabase = await createServiceRoleClient();
  const { data, error } = await serviceSupabase.storage
    .from("recitations")
    .createSignedUploadUrl(fileName); // Use default expiry
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ url: data.signedUrl, path: fileName });
}