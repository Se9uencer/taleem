// File: app/api/speech-recognition/route.ts
import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { normalizeArabicText, calculateSimilarity } from "@/lib/arabic-utils"

const HF_API_TOKEN = process.env.HF_API_TOKEN;
const TARTEEL_MODEL_URL = "https://api-inference.huggingface.co/models/tarteel-ai/whisper-base-ar-quran";

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


export async function POST(request: Request) {
  if (!HF_API_TOKEN) {
    console.error("Hugging Face API token is not set in environment variables.");
    return NextResponse.json({ error: "Speech recognition service is not configured." }, { status: 500 });
  }

  let recitationId: string;
  let audioBlob: Blob;
  const supabase = createServiceRoleClient();

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    recitationId = formData.get("recitationId") as string;

    if (!file || !recitationId) {
        throw new Error("Missing audio file or recitation ID in the request.");
    }
    audioBlob = file;

  } catch (e: any) {
    console.error("Failed to parse form data:", e);
    return NextResponse.json({ error: `Invalid request body: ${e.message}` }, { status: 400 });
  }
  
  try {
    // CHECKPOINT 1: Confirm the function started
    console.log(`[Checkpoint 1] Processing recitation ${recitationId}`);
    await supabase.from("recitations").update({ transcription_error: "Processing started..." }).eq("id", recitationId);


    const { data: recitation, error: recitationError } = await supabase
      .from("recitations")
      .select(`id, assignments (target_text, surah_name, start_ayah, end_ayah)`)
      .eq("id", recitationId)
      .single();

    if (recitationError || !recitation) {
      throw new Error(`Recitation not found (ID: ${recitationId}): ${recitationError?.message}`);
    }

    // CHECKPOINT 2: Confirm we are about to call the AI model
    console.log(`[Checkpoint 2] Sending audio to Hugging Face for recitation ${recitationId}`);
    await supabase.from("recitations").update({ transcription_error: "Sending to AI for analysis..." }).eq("id", recitationId);

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
    
    // CHECKPOINT 3: Confirm we got a response from the AI
    console.log(`[Checkpoint 3] Received transcription for ${recitationId}. Saving feedback.`);
    await supabase.from("recitations").update({ transcription_error: "AI analysis complete. Saving results..." }).eq("id", recitationId);

    let accuracy = 0.0;
    let notes = "Recitation transcribed.";
    const expectedQuranText = recitation.assignments?.target_text;

    if (expectedQuranText) {
      const normalizedTranscribedText = normalizeArabicText(transcribedText);
      const normalizedExpectedText = normalizeArabicText(expectedQuranText);
      accuracy = calculateSimilarity(normalizedTranscribedText, normalizedExpectedText);
      notes = accuracy < 0.8 ? "Good effort! Some differences found." : accuracy < 0.95 ? "Very good! Almost perfect." : "Excellent recitation!";
    } else {
        notes = "Transcription complete. Accuracy could not be calculated as no target text was found for the assignment.";
    }

    const { error: feedbackError } = await supabase.from("feedback").insert({
        recitation_id: recitationId,
        accuracy: accuracy,
        notes: notes,
        expected_text: expectedQuranText || `Reference: Surah ${recitation.assignments?.surah_name}, Ayahs ${recitation.assignments?.start_ayah}-${recitation.assignments?.end_ayah}`,
        generated_at: new Date().toISOString(),
    });
    if (feedbackError) throw feedbackError;

    // FINAL STEP: Mark as completed
    const { error: updateError } = await supabase.from("recitations").update({
        transcription: transcribedText,
        transcription_status: "completed",
        transcription_date: new Date().toISOString(),
        transcription_error: null // Clear the error log
    }).eq("id", recitationId);
    if (updateError) throw updateError;

    console.log(`[Success] Successfully processed recitation ${recitationId}`);
    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error(`[Taleem AI Error] For Recitation ID ${recitationId}:`, error);
    await updateErrorStatus(supabase, recitationId, error.message || 'An unknown processing error occurred.');
    return NextResponse.json({ error: `Internal server error: ${error.message}` }, { status: 500 });
  }
}