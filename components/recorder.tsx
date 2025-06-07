"use client"

import { useRef, useState } from "react"
import { createClientComponentClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { AlertCircle } from "lucide-react"

interface RecorderProps {
  assignmentId: string
  studentId: string
  dueDate?: string
  onRecitationSubmitted: (recitationId: string) => void
}

export default function Recorder({ assignmentId, studentId, dueDate, onRecitationSubmitted }: RecorderProps) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [audioUrl, setAudioUrl] = useState("")
  const [duration, setDuration] = useState<number | null>(null)
  const [error, setError] = useState("")
  const [isUploading, setIsUploading] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const recordingStartRef = useRef<number | null>(null)

  const chunksRef = useRef<Blob[]>([])

  const startRecording = async () => {
    setError("")
    chunksRef.current = []

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      let mimeType = "audio/webm"
      let options = { mimeType }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        options = {}
      }
      
      const mediaRecorder = new MediaRecorder(stream, options)

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType || "audio/webm" })
        if (blob.size === 0) {
          setError("Recording failed: empty audio captured. Please try again.")
          return
        }
        const url = URL.createObjectURL(blob)
        setAudioUrl(url)
        setAudioBlob(blob)
        
        const audio = new Audio(url)
        
        const fallbackDuration =
          recordingStartRef.current !== null
            ? (Date.now() - recordingStartRef.current) / 1000
            : null;

        audio.onloadedmetadata = () => {
          const metaDuration = audio.duration;
          const finalDuration = isNaN(metaDuration) || metaDuration === Infinity
            ? fallbackDuration || 0
            : metaDuration;
          setDuration(finalDuration);
          recordingStartRef.current = null;
        };

        audio.onerror = () => {
            console.error("Audio metadata could not be loaded. Using fallback duration.");
            setDuration(fallbackDuration || 0);
            recordingStartRef.current = null;
        };
      }

      mediaRecorder.start(250)
      recordingStartRef.current = Date.now()
      mediaRecorderRef.current = mediaRecorder
      setIsRecording(true)
    } catch (err) {
      console.error(err)
      setError("Could not start recording. Please allow microphone access.")
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop())
      setIsRecording(false)
    }
  }

  const handleSubmit = async () => {
    if (!audioBlob || duration === null) {
      setError("Please record audio before submitting.")
      return
    }

    setIsUploading(true)
    setError("")

    try {
      const supabase = createClientComponentClient()
      const mimeType = audioBlob.type || "audio/webm"
      const fileExtension = mimeType.split('/')[1] || 'webm'
      const fileName = `recitations/${studentId}/${Date.now()}.${fileExtension}`

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("recitations")
        .upload(fileName, audioBlob, {
          contentType: mimeType,
          upsert: false,
        })

      if (uploadError) {
        throw new Error(`Storage Error: ${uploadError.message}`)
      }
      
      const { data: urlData } = supabase.storage
        .from("recitations")
        .getPublicUrl(fileName)

      const publicUrl = urlData.publicUrl

      await supabase
        .from("recitations")
        .update({ is_latest: false })
        .eq("student_id", studentId)
        .eq("assignment_id", assignmentId)

      const { data: recitationData, error: recitationError } = await supabase
        .from("recitations")
        .insert({
          assignment_id: assignmentId,
          student_id: studentId,
          audio_url: publicUrl,
          submitted_at: new Date().toISOString(),
          is_latest: true,
          transcription_status: 'pending', // FIX: Set the initial status
        })
        .select()
        .single()

      if (recitationError) {
        throw new Error(`Failed to save recitation: ${recitationError.message}`)
      }

      await fetch("/api/speech-recognition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recitationId: recitationData.id }),
      })

      onRecitationSubmitted(recitationData.id)
    } catch (err: any) {
      console.error("Error submitting recitation:", err)
      setError(err.message || "Failed to submit recitation")
    } finally {
      setIsUploading(false)
    }
  }

  const resetRecording = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
    }
    setAudioUrl("")
    setAudioBlob(null)
    setDuration(null)
    recordingStartRef.current = null
    setError("")
  }

  return (
    <Card className="w-full">
      <CardContent className="p-6 space-y-4">
        <div className="flex flex-col items-center">
          <h3 className="text-lg font-medium text-foreground mb-4">Record Your Recitation</h3>

          {error && (
            <div className="w-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-md mb-4 flex items-start">
              <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Error</p>
                <p className="text-sm">{error}</p>
              </div>
            </div>
          )}

          <div className="w-full space-y-4">
            <div>
              {isRecording ? (
                <Button onClick={stopRecording} variant="destructive" size="lg" className="w-full">
                  Stop Recording
                </Button>
              ) : (
                <Button onClick={startRecording} variant="default" size="lg" className="w-full">
                  Start Recording
                </Button>
              )}
            </div>

            {audioUrl && (
              <div className="space-y-4">
                <audio controls src={audioUrl} className="w-full" />
                {duration !== null && (
                  <p className="text-sm text-center text-muted-foreground">Duration: {duration.toFixed(2)} seconds</p>
                )}

                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <Button onClick={resetRecording} variant="outline">
                    Record Again
                  </Button>
                  <Button onClick={handleSubmit} disabled={isUploading || duration === null}>
                    {isUploading ? "Submitting..." : "Submit Recitation"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}