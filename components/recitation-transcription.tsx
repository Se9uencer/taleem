"use client"

import { useState, useEffect } from "react"
import { createClientComponentClient } from "@/lib/supabase/client"
import { Card, CardContent } from "@/components/ui/card"
import { AlertCircle } from "lucide-react"

interface RecitationTranscriptionProps {
  recitationId: string
}

export function RecitationTranscription({ recitationId }: RecitationTranscriptionProps) {
  const [transcript, setTranscript] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string>("pending")

  useEffect(() => {
    const fetchTranscription = async () => {
      if (!recitationId) return

      try {
        setLoading(true)
        const supabase = createClientComponentClient()

        const { data, error } = await supabase
          .from("recitations")
          .select("transcription, transcription_status, transcription_error")
          .eq("id", recitationId)
          .single()

        if (error) {
          throw error
        }

        if (data) {
          setTranscript(data.transcription)
          setStatus(data.transcription_status)
          setError(data.transcription_error)
        }
      } catch (err: any) {
        console.error("Error fetching transcription:", err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchTranscription()
  }, [recitationId])

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin h-5 w-5 border-2 border-purple-600 border-t-transparent rounded-full mr-2"></div>
            <span className="text-sm text-muted-foreground">Loading transcription...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error && status === "error") {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start text-red-600 dark:text-red-400">
            <AlertCircle className="h-5 w-5 mr-2 mt-0.5" />
            <div>
              <p className="font-medium">Transcription Error</p>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!transcript && status === "pending") {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="text-center py-2">
            <p className="text-sm text-muted-foreground">Transcription is being processed...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!transcript) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="text-center py-2">
            <p className="text-sm text-muted-foreground">No transcription available</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-4">
        <h4 className="text-sm font-medium mb-2 text-purple-700 dark:text-purple-400">Transcription</h4>
        <div className="p-3 border border-purple-200 dark:border-purple-800 rounded-md bg-purple-50 dark:bg-purple-900/10">
          <p className="text-right font-arabic text-lg" dir="rtl">
            {transcript}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
