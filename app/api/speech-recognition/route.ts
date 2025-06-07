// File: app/api/speech-recognition/route.ts
import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { normalizeArabicText, calculateSimilarity } from "@/lib/arabic-utils"

const HF_API_TOKEN = process.env.HF_API_TOKEN;
const TARTEEL_MODEL_URL = "https://api-inference.huggingface.co/models/tarteel-ai/whisper-base-ar-quran";

export async function POST(request: Request) {
  if (!HF_API_TOKEN) {
    console.error("Hugging Face API token is not set in environment variables.");
    return NextResponse.json({ error: "Speech recognition service is not configured." }, { status: 500 });
  }

  let recitationId: string;
  try {
    const body = await request.json();
    recitationId = body.recitationId;
    if (!recitationId) throw new Error("Recitation ID is required");
  } catch (e) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const supabase = await createServerClient();

  try {
    const { data: recitation, error: recitationError } = await supabase
      .from("recitations")
      .select(`id, audio_url, assignments (id, title, surah_name, start_ayah, end_ayah, target_text)`)
      .eq("id", recitationId)
      .single();

    if (recitationError || !recitation) {
      throw new Error(`Recitation not found (ID: ${recitationId}): ${recitationError?.message}`);
    }
    if (!recitation.audio_url || !recitation.assignments) {
      throw new Error("Recitation is missing required audio URL or assignment details.");
    }

    const audioResponse = await fetch(recitation.audio_url);
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio file: ${audioResponse.statusText}`);
    }
    const audioBlob = await audioResponse.blob();

    const hfResponse = await fetch(TARTEEL_MODEL_URL, {
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
    
    let accuracy = 0.0;
    let notes = "Recitation transcribed.";
    const expectedQuranText = recitation.assignments.target_text;

    if (expectedQuranText) {
      const normalizedTranscribedText = normalizeArabicText(transcribedText);
      const normalizedExpectedText = normalizeArabicText(expectedQuranText);
      accuracy = calculateSimilarity(normalizedTranscribedText, normalizedExpectedText);
      notes = accuracy < 0.8 ? "Good effort! Some differences found." : accuracy < 0.95 ? "Very good! Almost perfect." : "Excellent recitation!";
    } else {
        notes = "Transcription complete. Accuracy could not be calculated as no target text was found for the assignment.";
    }

    await supabase.from("feedback").insert({
        recitation_id: recitationId,
        accuracy: accuracy,
        notes: notes,
        expected_text: expectedQuranText || `Reference: Surah ${recitation.assignments.surah_name}, Ayahs ${recitation.assignments.start_ayah}-${recitation.assignments.end_ayah}`,
        generated_at: new Date().toISOString(),
    });

    await supabase.from("recitations").update({
        transcription: transcribedText,
        transcription_status: "completed",
        transcription_date: new Date().toISOString()
    }).eq("id", recitationId);

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error(`[Taleem AI Error] For Recitation ID ${recitationId}:`, error);
    
    // FIX: Update the database to reflect that an error occurred.
    await supabase
      .from("recitations")
      .update({
        transcription_status: 'error',
        transcription_error: error.message || 'An unknown processing error occurred.'
      })
      .eq("id", recitationId);
      
    return NextResponse.json({ error: `Internal server error: ${error.message}` }, { status: 500 });
  }
}