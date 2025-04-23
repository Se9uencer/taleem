import { NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  try {
    const supabase = createServerClient()
    const { recitationId } = await request.json()

    try {
      if (!recitationId) {
        return NextResponse.json({ error: "Recitation ID is required" }, { status: 400 })
      }

      // Validate that recitationId is a string
      if (typeof recitationId !== "string") {
        return NextResponse.json({ error: "Invalid recitation ID format" }, { status: 400 })
      }
    } catch (validationError) {
      console.error("Error validating request:", validationError)
      return NextResponse.json({ error: "Invalid request format" }, { status: 400 })
    }

    // Get the recitation details
    const { data: recitation, error: recitationError } = await supabase
      .from("recitations")
      .select("*, assignments(*)")
      .eq("id", recitationId)
      .single()

    if (recitationError || !recitation) {
      return NextResponse.json({ error: "Recitation not found" }, { status: 404 })
    }

    // Update processing status
    await supabase.from("recitations").update({ processing_status: "processing" }).eq("id", recitationId)

    // In a real implementation, we would:
    // 1. Download the audio file from Supabase Storage
    // 2. Process it with the Hugging Face model
    // 3. Compare with expected text
    // 4. Generate feedback

    // For now, we'll simulate the process with a mock response
    const mockAccuracy = Math.random() * 0.3 + 0.7 // Random accuracy between 70% and 100%
    const mockNotes = "Good recitation. Pay attention to proper tajweed rules."
    const mockTranscript = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ"
    const mockExpectedText = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ"

    // Store the feedback
    const { data: feedback, error: feedbackError } = await supabase
      .from("feedback")
      .insert({
        recitation_id: recitationId,
        accuracy: mockAccuracy,
        notes: mockNotes,
        transcript: mockTranscript,
        expected_text: mockExpectedText,
        generated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (feedbackError) {
      return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 })
    }

    // Update processing status to completed
    await supabase.from("recitations").update({ processing_status: "completed" }).eq("id", recitationId)

    return NextResponse.json({ success: true, feedback })
  } catch (error) {
    console.error("Error processing speech recognition:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
