"use client"

import { useState, useEffect } from "react"
import { createClientComponentClient } from "@/lib/supabase/client"
import { Card, CardContent } from "@/components/ui/card"
import { AlertCircle, CheckCircle, Headphones } from "lucide-react"
import { RecitationTranscription } from "./recitation-transcription"

interface RecitationFeedbackProps {
  recitationId: string
}

export function RecitationFeedback({ recitationId }: RecitationFeedbackProps) {
  const [recitation, setRecitation] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadRecitation = async () => {
      try {
        setLoading(true)
        const supabase = createClientComponentClient()

        // FIX: Removed the non-existent 'processing_status' column from the select query
        const { data, error } = await supabase
          .from("recitations")
          .select(`
            id,
            audio_url,
            submitted_at,
            feedback (
              id,
              accuracy,
              notes
            )
          `)
          .eq("id", recitationId)
          .single()

        if (error) {
          throw error
        }

        setRecitation(data)
      } catch (err: any) {
        console.error("Error loading recitation:", err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    if (recitationId) {
      loadRecitation()
    }
  }, [recitationId])

  if (loading) {
    return (
      <div className="flex justify-center items-center p-8">
        <div className="animate-spin h-8 w-8 border-4 border-purple-600 border-t-transparent rounded-full"></div>
      </div>
    )
  }

  if (error || !recitation) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-md">
        <div className="flex items-start">
          <AlertCircle className="h-5 w-5 mr-2 mt-0.5" />
          <div>
            <p className="font-medium">Error</p>
            <p className="text-sm">{error || "Failed to load recitation"}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center mb-4">
            <CheckCircle className="h-8 w-8 text-green-500 mr-2" />
            <h3 className="text-xl font-medium text-green-700 dark:text-green-500">Recitation Submitted</h3>
          </div>

          <p className="text-center text-muted-foreground mb-6">
            Your recitation has been submitted successfully. You can listen to your recording below.
          </p>

          <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-md mb-4">
            <div className="flex items-center mb-2">
              <Headphones className="h-5 w-5 text-purple-600 mr-2" />
              <h4 className="font-medium">Your Recording</h4>
            </div>
            <audio controls src={recitation.audio_url} className="w-full mt-2">
              Your browser does not support the audio element.
            </audio>
          </div>

          {recitation.feedback ? (
            <div className="bg-green-50 dark:bg-green-900/10 p-4 rounded-md border border-green-200 dark:border-green-800">
              <h4 className="font-medium text-green-700 dark:text-green-500 mb-2">Feedback Available</h4>
              <p className="text-sm text-muted-foreground">
                Your teacher has provided feedback on this recitation. You can view it on the assignment page.
              </p>
            </div>
          ) : (
            <div className="bg-yellow-50 dark:bg-yellow-900/10 p-4 rounded-md border border-yellow-200 dark:border-yellow-800">
              <h4 className="font-medium text-yellow-700 dark:text-yellow-500 mb-2">Awaiting Feedback</h4>
              <p className="text-sm text-muted-foreground">
                Your recitation is awaiting feedback from your teacher. Check back later.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add the transcription component */}
      <RecitationTranscription recitationId={recitationId} />
    </div>
  )
}