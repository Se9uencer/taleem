"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Mic, Square, Play, Pause, Upload, AlertCircle } from "lucide-react"
import { createClientComponentClient } from "@/lib/supabase/client"
import { toast } from "@/components/ui/use-toast"

interface RecitationRecorderProps {
  assignmentId: string
  studentId: string
  onRecitationSubmitted: (recitationId: string) => void
}

export function RecitationRecorder({ assignmentId, studentId, onRecitationSubmitted }: RecitationRecorderProps) {
  // Recording states
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isUploading, setIsUploading] = useState(isUploading)
  const [error, setError] = useState<string | null>(null)
  const [debug, setDebug] = useState<string[]>([])

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Add debug log function
  const addDebugLog = (message: string) => {
    console.log(`[RecitationRecorder] ${message}`)
    setDebug((prev) => [...prev, `${new Date().toISOString().slice(11, 19)} - ${message}`])
  }

  // Clean up resources on unmount
  useEffect(() => {
    return () => {
      stopMediaTracks()
      clearTimerInterval()
      releaseAudioUrl()
    }
  }, [])

  // Helper functions for cleanup
  const stopMediaTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop()
        addDebugLog(`Stopped track: ${track.kind}`)
      })
      streamRef.current = null
    }
  }

  const clearTimerInterval = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
      addDebugLog("Timer interval cleared")
    }
  }

  const releaseAudioUrl = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
      setAudioUrl(null)
      addDebugLog("Audio URL released")
    }
  }

  // Reset recording state
  const resetRecording = () => {
    stopMediaTracks()
    clearTimerInterval()
    releaseAudioUrl()
    setAudioBlob(null)
    setRecordingDuration(0)
    setError(null)
    addDebugLog("Recording state reset")
  }

  // Start recording
  const startRecording = async () => {
    try {
      // Reset state
      resetRecording()
      setError(null)
      audioChunksRef.current = []
      addDebugLog("Starting recording...")

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      })

      streamRef.current = stream
      addDebugLog(`Got media stream with ${stream.getAudioTracks().length} audio tracks`)

      // Create MediaRecorder with fallback options
      let recorder: MediaRecorder | null = null

      // Try to create with specific MIME type first
      try {
        recorder = new MediaRecorder(stream, { mimeType: "audio/webm" })
        addDebugLog("Created MediaRecorder with audio/webm")
      } catch (e) {
        // If that fails, try without specifying MIME type
        addDebugLog(`Failed with audio/webm, trying default: ${e}`)
        recorder = new MediaRecorder(stream)
        addDebugLog(`Created MediaRecorder with default settings: ${recorder.mimeType}`)
      }

      mediaRecorderRef.current = recorder

      // Set up data handling - CRITICAL for collecting audio chunks
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          addDebugLog(`Received chunk: ${event.data.size} bytes`)
          audioChunksRef.current.push(event.data)
        } else {
          addDebugLog("Received empty data event")
        }
      }

      // Set up stop handler - CRITICAL for finalizing the recording
      recorder.onstop = () => {
        addDebugLog(`Recording stopped. Processing ${audioChunksRef.current.length} chunks`)
        processRecording()
      }

      // Set up error handler
      recorder.onerror = (event: any) => {
        addDebugLog(`MediaRecorder error: ${event.error || "Unknown error"}`)
        setError(`Recording error: ${event.error || "Unknown error"}`)
      }

      // Start recording - request data every 1000ms (1 second)
      recorder.start(1000)
      addDebugLog("MediaRecorder started")
      setIsRecording(true)

      // Start timer for UI
      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => {
          const newDuration = prev + 1
          addDebugLog(`Timer tick: ${newDuration}s`)
          // Max recording time: 3 minutes (180 seconds)
          if (newDuration >= 180) {
            addDebugLog("Max recording time reached, stopping")
            stopRecording()
            return 180
          }
          return newDuration
        })
      }, 1000)

      addDebugLog("Timer started")
    } catch (err: any) {
      console.error("Error starting recording:", err)
      addDebugLog(`Error starting recording: ${err.message}`)
      setError(`Could not start recording: ${err.message}`)
      resetRecording()
    }
  }

  // Stop recording
  const stopRecording = () => {
    addDebugLog("Stopping recording...")

    try {
      // Clear timer first
      clearTimerInterval()
      setIsRecording(false)

      // Check if recorder exists and is recording
      if (mediaRecorderRef.current) {
        const state = mediaRecorderRef.current.state
        addDebugLog(`MediaRecorder state before stopping: ${state}`)

        if (state === "recording") {
          // Request final data chunk
          try {
            mediaRecorderRef.current.requestData()
            addDebugLog("Final data chunk requested")
          } catch (err) {
            addDebugLog(`Error requesting final data: ${err}`)
          }

          // Stop the recorder - this will trigger the onstop event
          try {
            mediaRecorderRef.current.stop()
            addDebugLog("MediaRecorder stop() called")
          } catch (err) {
            addDebugLog(`Error stopping MediaRecorder: ${err}`)
            throw err
          }
        } else {
          addDebugLog(`MediaRecorder not in recording state (current state: ${state})`)
          // Even if not in recording state, try to process what we have
          processRecording()
        }
      } else {
        addDebugLog("MediaRecorder not initialized")
        setError("Recording failed: recorder not properly initialized")
      }

      // Stop all tracks in the stream
      stopMediaTracks()
    } catch (err: any) {
      console.error("Error stopping recording:", err)
      addDebugLog(`Error in stopRecording: ${err.message}`)
      setError(`Error stopping recording: ${err.message}`)

      // Try to process what we have anyway
      if (audioChunksRef.current.length > 0) {
        addDebugLog("Attempting to process existing chunks despite error")
        processRecording()
      } else {
        resetRecording()
      }
    }
  }

  // Process the recording after stopping
  const processRecording = () => {
    addDebugLog(`Processing recording with ${audioChunksRef.current.length} chunks`)

    try {
      // Check if we have any chunks
      if (audioChunksRef.current.length === 0) {
        throw new Error("No audio data was collected during recording")
      }

      // Determine the correct MIME type for the blob
      const mimeType = mediaRecorderRef.current?.mimeType || "audio/webm"
      addDebugLog(`Using MIME type for blob: ${mimeType}`)

      // Create blob from chunks
      const blob = new Blob(audioChunksRef.current, { type: mimeType })
      addDebugLog(`Created blob: ${blob.size} bytes, type: ${blob.type}`)

      // Validate blob size
      if (blob.size === 0) {
        throw new Error("Created audio blob is empty")
      }

      // Create URL for the blob
      const url = URL.createObjectURL(blob)
      addDebugLog(`Created URL for blob: ${url}`)

      // Create an audio element to check duration
      const audio = new Audio(url)
      addDebugLog("Created audio element for duration check")

      // Wait for metadata to load to get duration
      audio.onloadedmetadata = () => {
        addDebugLog(`Audio metadata loaded, duration: ${audio.duration} seconds`)

        // Validate duration
        if (!audio.duration || audio.duration < 0.5) {
          addDebugLog(`Audio duration too short: ${audio.duration}s`)
          setError("Recording is too short (less than 0.5 seconds). Please try again.")
          URL.revokeObjectURL(url)
          return
        }

        // Set audio blob and URL only after validation
        setAudioBlob(blob)
        setAudioUrl(url)
        setRecordingDuration(Math.round(audio.duration))
        addDebugLog(`Audio processed successfully, duration: ${Math.round(audio.duration)}s`)
      }

      // Handle errors loading metadata
      audio.onerror = (e) => {
        addDebugLog(`Error loading audio metadata: ${e}`)
        setError("Failed to process recording. The audio file may be corrupted.")
        URL.revokeObjectURL(url)
      }
    } catch (err: any) {
      console.error("Error processing recording:", err)
      addDebugLog(`Error processing recording: ${err.message}`)
      setError(`Failed to process recording: ${err.message}`)
    }
  }

  // Toggle audio playback
  const togglePlayback = () => {
    if (!audioRef.current || !audioUrl) return

    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play().catch((err) => {
        console.error("Error playing audio:", err)
        addDebugLog(`Error playing audio: ${err.message}`)
        setError(`Could not play audio: ${err.message}`)
      })
    }
  }

  // Handle file upload
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    addDebugLog(`File selected: ${file.name}, type: ${file.type}, size: ${file.size} bytes`)

    // Validate file type
    const validTypes = ["audio/wav", "audio/mpeg", "audio/mp3", "audio/ogg", "audio/webm"]
    if (!validTypes.some((type) => file.type.includes(type.split("/")[1]))) {
      setError("Please upload a valid audio file (WAV, MP3, OGG, or WebM)")
      return
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError("File size must be less than 10MB")
      return
    }

    // Clean up previous audio URL if it exists
    releaseAudioUrl()

    // Create new URL
    const url = URL.createObjectURL(file)
    addDebugLog(`Created URL for uploaded file: ${url}`)

    // Create audio element to check duration
    const audio = new Audio(url)

    audio.onloadedmetadata = () => {
      addDebugLog(`Uploaded file metadata loaded, duration: ${audio.duration} seconds`)

      // Validate duration
      if (!audio.duration || audio.duration < 0.5) {
        setError("Audio file is too short (less than 0.5 seconds). Please upload a longer recording.")
        URL.revokeObjectURL(url)
        return
      }

      // Set audio blob and URL only after validation
      setAudioBlob(file)
      setAudioUrl(url)
      setRecordingDuration(Math.round(audio.duration))
      setError(null)
      addDebugLog(`File processed successfully: ${url}`)
    }

    audio.onerror = () => {
      addDebugLog("Error loading uploaded file metadata")
      setError("Failed to process audio file. The file may be corrupted.")
      URL.revokeObjectURL(url)
    }
  }

  // Format time display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  // Submit recording
  const handleSubmit = async () => {
    if (!audioBlob) {
      setError("Please record or upload audio first")
      return
    }

    // Validate the audio blob
    if (audioBlob.size === 0) {
      setError("The recording is empty. Please record your recitation again.")
      return
    }

    // Validate audio duration
    if (recordingDuration < 0.5) {
      setError("Recording is too short. Please record a longer recitation.")
      return
    }

    setIsUploading(true)
    setError(null)
    addDebugLog(`Submitting audio: ${audioBlob.size} bytes, type: ${audioBlob.type}, duration: ${recordingDuration}s`)

    try {
      const supabase = createClientComponentClient()

      // Determine file extension based on MIME type
      let fileExtension = "webm"
      const mimeType = audioBlob.type.toLowerCase()

      if (mimeType.includes("mp3") || mimeType.includes("mpeg")) {
        fileExtension = "mp3"
      } else if (mimeType.includes("wav")) {
        fileExtension = "wav"
      } else if (mimeType.includes("ogg")) {
        fileExtension = "ogg"
      }

      // Create a unique filename
      const fileName = `recitations/${studentId}/${assignmentId}/${Date.now()}.${fileExtension}`
      addDebugLog(`Uploading to storage: ${fileName}`)

      // Upload to Supabase Storage with retry logic
      let uploadSuccess = false
      let uploadAttempt = 0
      let uploadError = null
      let uploadData = null

      while (!uploadSuccess && uploadAttempt < 3) {
        uploadAttempt++
        addDebugLog(`Upload attempt ${uploadAttempt}/3`)

        try {
          const { data, error } = await supabase.storage.from("recitations").upload(fileName, audioBlob, {
            contentType: audioBlob.type || `audio/${fileExtension}`,
            cacheControl: "3600",
            upsert: false,
          })

          if (error) {
            uploadError = error
            addDebugLog(`Upload error on attempt ${uploadAttempt}: ${error.message}`)
            // Wait before retrying
            if (uploadAttempt < 3) {
              await new Promise((resolve) => setTimeout(resolve, 1000))
            }
          } else {
            uploadData = data
            uploadSuccess = true
            addDebugLog(`Upload successful on attempt ${uploadAttempt}`)
          }
        } catch (err: any) {
          uploadError = err
          addDebugLog(`Exception on upload attempt ${uploadAttempt}: ${err.message}`)
          // Wait before retrying
          if (uploadAttempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, 1000))
          }
        }
      }

      if (!uploadSuccess) {
        throw new Error(
          `Failed to upload audio after ${uploadAttempt} attempts: ${uploadError?.message || "Unknown error"}`,
        )
      }

      // Get public URL
      const { data: urlData } = supabase.storage.from("recitations").getPublicUrl(fileName)
      const audioUrl = urlData.publicUrl
      addDebugLog(`Got public URL: ${audioUrl}`)

      // Update previous submissions to not be latest
      const { error: updateError } = await supabase
        .from("recitations")
        .update({ is_latest: false })
        .eq("student_id", studentId)
        .eq("assignment_id", assignmentId)

      if (updateError) {
        addDebugLog(`Warning: Error updating previous submissions: ${updateError.message}`)
        // Continue despite this error
      }

      // Create recitation record
      addDebugLog("Creating recitation record in database")
      const { data: recitationData, error: recitationError } = await supabase
        .from("recitations")
        .insert({
          assignment_id: assignmentId,
          student_id: studentId,
          audio_url: audioUrl,
          submitted_at: new Date().toISOString(),
          is_latest: true,
          processing_status: "pending",
        })
        .select()
        .single()

      if (recitationError) {
        throw new Error(`Failed to save recitation: ${recitationError.message}`)
      }

      addDebugLog(`Recitation record created with ID: ${recitationData.id}`)

      // Trigger speech recognition processing
      try {
        addDebugLog("Triggering speech recognition processing")
        const response = await fetch("/api/speech-recognition", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recitationId: recitationData.id }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          addDebugLog(`Speech recognition API error: ${errorData.error || response.statusText}`)
          // Continue despite this error - it's not critical
        } else {
          addDebugLog("Speech recognition processing triggered successfully")
        }
      } catch (apiError: any) {
        addDebugLog(`Error triggering speech recognition: ${apiError.message}`)
        // Continue despite this error - it's not critical
      }

      // Show success message
      toast({
        title: "Recitation Submitted",
        description: "Your recitation has been submitted successfully.",
      })

      // Call the callback with the recitation ID
      onRecitationSubmitted(recitationData.id)
    } catch (err: any) {
      console.error("Error submitting recitation:", err)
      addDebugLog(`Submission error: ${err.message}`)
      setError(err.message || "Failed to submit recitation")
      setIsUploading(false)

      // Show error toast
      toast({
        title: "Submission Failed",
        description: err.message || "Failed to submit recitation",
        variant: "destructive",
      })
    }
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
                <p className="font-medium">Recording Error</p>
                <p className="text-sm">{error}</p>
              </div>
            </div>
          )}

          {isRecording ? (
            <div className="text-center w-full">
              <div className="text-2xl font-mono mb-4 text-red-600">{formatTime(recordingDuration)}</div>
              <div className="animate-pulse mb-4 h-16 flex items-center justify-center">
                <div className="bg-red-600 h-8 w-8 rounded-full"></div>
              </div>
              <Button onClick={stopRecording} variant="destructive" size="lg" className="w-full sm:w-auto">
                <Square className="mr-2 h-4 w-4" />
                Stop Recording
              </Button>
              <p className="text-xs text-muted-foreground mt-2">Maximum recording time: 3 minutes</p>
            </div>
          ) : audioUrl ? (
            <div className="w-full space-y-4">
              <div className="flex items-center justify-center bg-gray-100 dark:bg-gray-800 p-4 rounded-md">
                <Button onClick={togglePlayback} variant="outline" size="icon" className="mr-4">
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <audio
                  ref={audioRef}
                  src={audioUrl}
                  className="hidden"
                  onEnded={() => setIsPlaying(false)}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />
                <div className="flex-1">
                  <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="bg-purple-600 h-full transition-all duration-300"
                      style={{ width: isPlaying ? "100%" : "0" }}
                    ></div>
                  </div>
                  <p className="text-xs text-right mt-1 text-muted-foreground">Duration: {recordingDuration}s</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <Button
                  onClick={() => {
                    releaseAudioUrl()
                    setAudioBlob(null)
                    setRecordingDuration(0)
                    setError(null)
                  }}
                  variant="outline"
                >
                  Record Again
                </Button>
                <Button onClick={handleSubmit} disabled={isUploading || recordingDuration < 0.5}>
                  {isUploading ? "Submitting..." : "Submit Recitation"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="w-full space-y-6">
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button onClick={startRecording} variant="default" size="lg" className="w-full sm:w-auto">
                  <Mic className="mr-2 h-4 w-4" />
                  Start Recording
                </Button>

                <div className="relative w-full sm:w-auto">
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full"
                    onClick={() => document.getElementById("audio-upload")?.click()}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Audio
                  </Button>
                  <input
                    id="audio-upload"
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </div>
              </div>

              <div className="text-center text-sm text-muted-foreground">
                <p>Supported formats: .wav, .mp3, .ogg, .webm</p>
                <p>Maximum file size: 10MB</p>
              </div>
            </div>
          )}

          {/* Debug information (collapsible) */}
          {debug.length > 0 && (
            <details className="w-full mt-6 text-xs border rounded-md p-2">
              <summary className="cursor-pointer font-medium">Debug Information</summary>
              <div className="mt-2 max-h-40 overflow-y-auto font-mono whitespace-pre-wrap text-gray-600 dark:text-gray-400">
                {debug.map((log, i) => (
                  <div key={i} className="border-b border-gray-100 dark:border-gray-800 py-1">
                    {log}
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
