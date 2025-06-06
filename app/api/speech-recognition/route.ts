// File: app/api/speech-recognition/route.ts
import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server" //
import { normalizeArabicText, calculateSimilarity } from "@/lib/arabic-utils" //

const HF_API_TOKEN = process.env.HF_API_TOKEN; // This will now read from your .env.local file
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

    if (!recitationId || typeof recitationId !== "string") {
      return NextResponse.json({ error: "Valid Recitation ID is required" }, { status: 400 });
    }
  } catch (validationError) {
    console.error("Error parsing request body:", validationError);
    return NextResponse.json({ error: "Invalid request format" }, { status: 400 });
  }

  const supabase = await createServerClient(); //

  try {
    // 1. Get the recitation details, including audio_url and assignment details
    //    IMPORTANT: This assumes your 'assignments' table has a 'target_text' field
    //    containing the actual Arabic script for the assigned verses for accurate feedback.
    const { data: recitation, error: recitationError } = await supabase
      .from("recitations")
      .select(`
        id,
        audio_url,
        assignments (
          id,
          title,
          surah_name,
          start_ayah,
          end_ayah,
          target_text 
        )
      `)
      .eq("id", recitationId)
      .single();

    if (recitationError || !recitation) {
      console.error(`Recitation not found or error fetching (ID: ${recitationId}):`, recitationError);
      return NextResponse.json({ error: "Recitation not found" }, { status: 404 });
    }

    if (!recitation.audio_url) {
      return NextResponse.json({ error: "Audio URL missing for this recitation" }, { status: 400 });
    }

    if (!recitation.assignments) {
      return NextResponse.json({ error: "Assignment details missing for this recitation" }, { status: 400 });
    }
    
    const expectedQuranText = recitation.assignments.target_text;
    let notes = "Recitation transcribed."; // Default notes

    if (!expectedQuranText) {
        const assignmentRef = `${recitation.assignments.surah_name || 'Surah'}, Ayahs ${recitation.assignments.start_ayah || 'X'}-${recitation.assignments.end_ayah || 'Y'}`;
        notes = `Recitation transcribed. Expected Quranic text for assignment (ID: ${recitation.assignments.id}, Ref: ${assignmentRef}) was not found. Accuracy cannot be calculated. Please ensure 'target_text' is populated in the 'assignments' table.`;
        console.warn(notes);
    }

    // 2. Download the audio file from Supabase Storage
    console.log(`Fetching audio from: ${recitation.audio_url}`);
    const audioResponse = await fetch(recitation.audio_url);
    if (!audioResponse.ok) {
      console.error(`Failed to download audio file (${recitation.audio_url}): ${audioResponse.status} ${audioResponse.statusText}`);
      return NextResponse.json({ error: `Failed to download audio file: ${audioResponse.statusText}` }, { status: 500 });
    }
    const audioBlob = await audioResponse.blob();
    console.log(`Audio blob fetched, type: ${audioBlob.type}, size: ${audioBlob.size}`);

    // 3. Send audio to Hugging Face Inference API
    console.log(`Sending audio to Hugging Face model: ${TARTEEL_MODEL_URL}`);
    const hfResponse = await fetch(TARTEEL_MODEL_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${HF_API_TOKEN}`,
        "Content-Type": audioBlob.type || "audio/webm", 
      },
      body: audioBlob,
    });

    if (!hfResponse.ok) {
      const errorBody = await hfResponse.text();
      console.error("Hugging Face API error:", hfResponse.status, errorBody);
      return NextResponse.json({ error: `Speech recognition service error: ${errorBody}`.slice(0, 500) }, { status: hfResponse.status });
    }

    const transcriptionResult = await hfResponse.json();
    const transcribedText = transcriptionResult.text?.trim();

    if (!transcribedText) {
      console.error("Transcription result empty or missing 'text' field:", transcriptionResult);
      return NextResponse.json({ error: "Transcription failed to produce text" }, { status: 500 });
    }
    console.log("Transcription successful:", transcribedText);

    // 4. Normalize texts and calculate similarity (accuracy)
    let accuracy = 0.0;
    const normalizedTranscribedText = normalizeArabicText(transcribedText); //

    if (expectedQuranText) {
      const normalizedExpectedText = normalizeArabicText(expectedQuranText); //
      accuracy = calculateSimilarity(normalizedTranscribedText, normalizedExpectedText); //
      
      // Update notes based on accuracy
      if (accuracy < 0.8) {
        notes = "Good effort! There are some differences from the expected text. Please review carefully."
      } else if (accuracy < 0.95) {
        notes = "Very good! Almost perfect. A few minor points to check."
      } else {
        notes = "Excellent recitation, masha'Allah!"
      }
      console.log(`Calculated accuracy: ${accuracy}`);
    }
    // If expectedQuranText was null, 'notes' retains its warning message from above.

    // 5. Store the feedback
    console.log("Saving feedback to database...");
    const { data: feedback, error: feedbackError } = await supabase
      .from("feedback")
      .insert({
        recitation_id: recitationId,
        accuracy: accuracy,
        notes: notes,
        expected_text: expectedQuranText || `Reference: Surah ${recitation.assignments.surah_name}, Ayahs ${recitation.assignments.start_ayah}-${recitation.assignments.end_ayah}`,
        generated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (feedbackError) {
      console.error("Failed to save feedback to database:", feedbackError);
      return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 });
    }
    console.log("Feedback saved successfully:", feedback);
    
    // **FIX**: Update recitation table with transcription details
    await supabase.from("recitations").update({ 
      transcription: transcribedText, 
      transcription_status: "completed",
      transcription_date: new Date().toISOString() 
    }).eq("id", recitationId);

    return NextResponse.json({ success: true, feedback });

  } catch (error: any) {
    console.error("Unhandled error in speech recognition API route:", error);
    // Optionally update recitation status to error here if you have the fields
    return NextResponse.json({ error: `Internal server error: ${error.message}` }, { status: 500 });
  }
}
