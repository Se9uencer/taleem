"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { createClientComponentClient } from "@/lib/supabase/client"
import { Play, Pause, AlertCircle, CheckCircle, Clock } from "lucide-react"

interface RecitationFeedbackProps {
  recitationId: string
}

export function RecitationFeedback({ recitationId }: RecitationFeedbackProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recitation, setRecitation] = useState<any>(null)
  const [feedback, setFeedback] = useState<any>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        const supabase = createClientComponentClient()

        // Fetch recitation with feedback
        // FIXED: Removed transcript and expected_text from feedback selection
        const { data, error } = await supabase
          .from("recitations")
          .select(`
          *,
          assignments(*),
          feedback(id, accuracy, notes)
        `)
          .eq("id", recitationId)
          .single()

        if (error) throw error

        setRecitation(data)
        setFeedback(data.feedback[0] || null)

        // Create audio element
        if (data.audio_url) {
          const audio = new Audio(data.audio_url)
          audio.addEventListener("ended", () => setIsPlaying(false))
          audio.addEventListener("pause", () => setIsPlaying(false))
          audio.addEventListener("play", () => setIsPlaying(true))
          setAudioElement(audio)
        }
      } catch (err: any) {
        console.error("Error loading recitation feedback:", err)
        setError(err.message || "Failed to load feedback")
      } finally {
        setLoading(false)
      }
    }

    loadData()

    // Cleanup
    return () => {
      if (audioElement) {
        audioElement.pause()
        audioElement.src = ""
      }
    }
  }, [recitationId])

  const togglePlayback = () => {
    if (!audioElement) return

    if (isPlaying) {
      audioElement.pause()
    } else {
      audioElement.play()
    }
  }

  const formatAccuracy = (accuracy: number) => {
    return `${Math.round(accuracy * 100)}%`
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex justify-center">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center text-red-600">
            <AlertCircle className="h-5 w-5 mr-2" />
            <p>{error}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!recitation) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">Recitation not found</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-foreground">Recitation Feedback</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Audio Player */}
        <div className="bg-muted/30 p-4 rounded-md">
          <div className="flex items-center">
            <Button
              onClick={togglePlayback}
              variant="outline"
              size="icon"
              className="mr-4"
              disabled={!recitation.audio_url}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Your Recitation</p>
              <p className="text-xs text-muted-foreground">
                Submitted on {new Date(recitation.submitted_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>

        {/* Processing Status */}
        {recitation.processing_status === "pending" && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-md flex items-start">
            <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mr-2 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-yellow-800 dark:text-yellow-300">Processing Your Recitation</p>
              <p className="text-sm text-yellow-700 dark:text-yellow-400">
                Our AI is analyzing your recitation. This may take a few moments.
              </p>
            </div>
          </div>
        )}

        {/* Error Status */}
        {recitation.processing_status === "error" && (
          <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-md flex items-start">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mr-2 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-800 dark:text-red-300">Processing Error</p>
              <p className="text-sm text-red-700 dark:text-red-400">
                We encountered an error while analyzing your recitation. Please try submitting again.
              </p>
            </div>
          </div>
        )}

        {/* Feedback Results */}
        {feedback && recitation.processing_status === "completed" && (
          <div className="space-y-4">
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-md flex items-start">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 mr-2 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-green-800 dark:text-green-300">Analysis Complete</p>
                <p className="text-sm text-green-700 dark:text-green-400">
                  Your recitation has been analyzed successfully.
                </p>
              </div>
            </div>

            <div className="border rounded-md p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-medium text-foreground">Accuracy Score</h3>
                <div className="text-2xl font-bold text-primary">{formatAccuracy(feedback.accuracy)}</div>
              </div>

              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 mb-4">
                <div
                  className="bg-primary h-2.5 rounded-full"
                  style={{ width: formatAccuracy(feedback.accuracy) }}
                ></div>
              </div>

              {feedback.notes && (
                <div className="mt-4">
                  <h4 className="font-medium text-foreground mb-2">Feedback Notes</h4>
                  <p className="text-muted-foreground">{feedback.notes}</p>
                </div>
              )}

              {feedback.transcript && feedback.expected_text && (
                <div className="mt-4 space-y-2">
                  <h4 className="font-medium text-foreground mb-2">Transcript Comparison</h4>

                  <div className="bg-muted/30 p-3 rounded-md">
                    <p className="text-xs text-muted-foreground mb-1">Expected Text:</p>
                    <p className="text-sm text-foreground font-arabic" dir="rtl">
                      {feedback.expected_text}
                    </p>
                  </div>

                  <div className="bg-muted/30 p-3 rounded-md">
                    <p className="text-xs text-muted-foreground mb-1">Your Recitation:</p>
                    <p className="text-sm text-foreground font-arabic" dir="rtl">
                      {feedback.transcript}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
