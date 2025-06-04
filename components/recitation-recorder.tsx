// File: components/recitation-recorder.tsx
"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button" //
import { Card, CardContent } from "@/components/ui/card" //
import { Mic, Square, Play, Pause, Upload, AlertCircle } from "lucide-react"
import { createClientComponentClient } from "@/lib/supabase/client" //
import { toast } from "@/components/ui/use-toast" //
import { isPastDuePST } from "@/lib/date-utils" //

interface RecitationRecorderProps {
  assignmentId: string
  studentId: string
  onRecitationSubmitted: (recitationId: string) => void
  assignmentDueDate: string; 
}

export function RecitationRecorder({ assignmentId, studentId, onRecitationSubmitted, assignmentDueDate }: RecitationRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [debug, setDebug] = useState<string[]>([])
  const [transcript, setTranscript] = useState<string | null>(null)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null)
  const [recitationIdState, setRecitationIdState] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const addDebugLog = (message: string) => {
    console.log(`[RecitationRecorder] ${message}`)
    setDebug((prev) => [...prev, `${new Date().toISOString().slice(11, 19)} - ${message}`])
  }

  useEffect(() => {
    return () => {
      stopMediaTracks()
      clearTimerInterval()
      releaseAudioUrl()
    }
  }, [])

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

  const resetRecordingStates = () => { 
    stopMediaTracks()
    clearTimerInterval()
    releaseAudioUrl()
    setAudioBlob(null)
    setRecordingDuration(0)
    setError(null)
    setTranscript(null);
    setTranscriptionError(null);
    setIsPlaying(false);
    if (audioRef.current) {
        audioRef.current.currentTime = 0;
    }
    addDebugLog("Recording state reset")
  }

  const startRecording = async () => {
    try {
      resetRecordingStates()
      audioChunksRef.current = []
      addDebugLog("Starting recording...")
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, })
      streamRef.current = stream
      addDebugLog(`Got media stream with ${stream.getAudioTracks().length} audio tracks`)
      
      let recorder: MediaRecorder | null = null;
      const mimeTypesToTry = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
      for (const mimeType of mimeTypesToTry) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          try {
            recorder = new MediaRecorder(stream, { mimeType });
            addDebugLog(`Created MediaRecorder with ${mimeType}`);
            break;
          } catch (e) {
            addDebugLog(`Failed to create MediaRecorder with ${mimeType}: ${e}`);
          }
        }
      }
      if (!recorder) {
         recorder = new MediaRecorder(stream); // Fallback to default
         addDebugLog(`Created MediaRecorder with default settings: ${recorder.mimeType}`);
      }
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          addDebugLog(`Received chunk: ${event.data.size} bytes, type: ${event.data.type}`)
          audioChunksRef.current.push(event.data)
        } else {
          addDebugLog("Received empty data event")
        }
      }

      recorder.onstop = () => {
        addDebugLog(`Recording stopped. Processing ${audioChunksRef.current.length} chunks`)
        processRecording()
      }
      recorder.onerror = (event: any) => { // MediaRecorderErrorEvent
        const err = (event as MediaRecorderErrorEvent).error;
        addDebugLog(`MediaRecorder error: ${err?.name} - ${err?.message}`)
        setError(`Recording error: ${err?.name} - ${err?.message || "Unknown error"}`)
      }
      
      // MODIFICATION: Use a smaller timeslice to get data chunks more frequently.
      // This can help capture initial audio more reliably.
      // The timer for UI duration will still update every second independently.
      recorder.start(250); // Collect data every 250ms
      
      addDebugLog("MediaRecorder started with 250ms timeslice")
      setIsRecording(true)

      // Start UI timer
      setRecordingDuration(0); // Explicitly reset duration display
      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => {
          const newDuration = prev + 1
          // addDebugLog(`Timer tick: ${newDuration}s`) // Can be noisy, uncomment if needed
          if (newDuration >= 180) {
            addDebugLog("Max recording time reached (180s), stopping")
            stopRecording()
            return 180
          }
          return newDuration
        })
      }, 1000)
      addDebugLog("UI Timer started")
    } catch (err: any) {
      console.error("Error starting recording:", err)
      addDebugLog(`Error starting recording: ${err.message}`)
      setError(`Could not start recording: ${err.message}. Please ensure microphone access is allowed.`)
      resetRecordingStates()
    }
  }

  const stopRecording = () => {
    addDebugLog("Attempting to stop recording...")
    setIsRecording(false); // Update UI immediately
    clearTimerInterval(); // Stop the UI timer first
    
    if (mediaRecorderRef.current) {
      const state = mediaRecorderRef.current.state;
      addDebugLog(`MediaRecorder state before stopping: ${state}`);
      if (state === "recording" || state === "paused") {
        try {
          mediaRecorderRef.current.stop(); // This will trigger onstop and then processRecording
          addDebugLog("MediaRecorder.stop() called");
        } catch (err: any) {
          addDebugLog(`Error calling MediaRecorder.stop(): ${err.message}`);
          setError(`Error stopping recording: ${err.message}`);
          // Try to process any chunks we might have
          if (audioChunksRef.current.length > 0) {
            processRecording();
          }
        }
      } else {
        addDebugLog(`MediaRecorder not in 'recording' or 'paused' state (current state: ${state}). Processing existing chunks if any.`);
        if (audioChunksRef.current.length > 0) {
          processRecording(); // If already stopped or inactive, try processing what's there
        }
      }
    } else {
      addDebugLog("MediaRecorder ref is null, cannot stop.");
    }
    // Tracks are stopped after processing, or if processing fails
    stopMediaTracks(); // This should ideally be called after ensuring onstop has fired and processed.
                     // Or if stop fails critically.
  }

  const processRecording = () => {
    addDebugLog(`Processing recording with ${audioChunksRef.current.length} chunks`)
    if (audioChunksRef.current.length === 0) {
        addDebugLog("No audio chunks to process.");
        setError("No audio data was recorded. Please try again.");
        resetRecordingStates(); // Ensure a clean state
        return;
    }

    try {
      const mimeType = mediaRecorderRef.current?.mimeType || audioChunksRef.current[0]?.type || "audio/webm"
      addDebugLog(`Using MIME type for blob: ${mimeType}`)
      const blob = new Blob(audioChunksRef.current, { type: mimeType })
      addDebugLog(`Created blob: ${blob.size} bytes, type: ${blob.type}`)
      
      if (blob.size === 0) {
        setError("Created audio blob is empty. Please try recording again.")
        resetRecordingStates();
        return
      }

      const url = URL.createObjectURL(blob)
      addDebugLog(`Created URL for blob: ${url}`)
      
      const audio = new Audio(url)
      addDebugLog("Created audio element for duration check")
      
      audio.onloadedmetadata = () => {
        const duration = audio.duration;
        addDebugLog(`Audio metadata loaded, duration: ${duration} seconds`)
        if (!duration || duration === Infinity || duration < 0.5) {
          addDebugLog(`Audio duration invalid or too short: ${duration}s. Minimum 0.5s required.`)
          setError("Recording is too short or couldn't be processed (min 0.5s). Please try again.")
          URL.revokeObjectURL(url)
          resetRecordingStates();
          setAudioBlob(null); // Explicitly nullify blob if duration is invalid
          setAudioUrl(null);
          return
        }
        setAudioBlob(blob)
        setAudioUrl(url)
        setRecordingDuration(Math.round(duration)) // Set duration from metadata
        setError(null); // Clear any previous errors if processing is successful
        addDebugLog(`Audio processed successfully, duration: ${Math.round(duration)}s`)
      }
      audio.onerror = (e) => {
        addDebugLog(`Error loading audio metadata: ${e}`)
        setError("Failed to process recording. The audio file may be corrupted or an unknown error occurred.")
        URL.revokeObjectURL(url)
        resetRecordingStates();
      }
    } catch (err: any) {
      console.error("Error processing recording:", err)
      addDebugLog(`Error processing recording: ${err.message}`)
      setError(`Failed to process recording: ${err.message}`)
      resetRecordingStates();
    }
    // Clean up stream tracks after processing is initiated
    stopMediaTracks();
  }

  const togglePlayback = () => {
    if (!audioRef.current || !audioUrl) return

    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.currentTime = 0; // Reset to start before playing
      audioRef.current.play().catch((err) => {
        console.error("Error playing audio:", err)
        addDebugLog(`Error playing audio: ${err.message}`)
        setError(`Could not play audio: ${err.message}`)
      })
    }
    // The onPlay and onPause events on the audio element will toggle isPlaying state
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    resetRecordingStates(); // Reset before processing new file
    const file = event.target.files?.[0]
    if (!file) return
    addDebugLog(`File selected: ${file.name}, type: ${file.type}, size: ${file.size} bytes`)
    const validTypes = ["audio/wav", "audio/mpeg", "audio/mp3", "audio/ogg", "audio/webm", "audio/aac", "audio/mp4", "audio/x-m4a"]
    if (!validTypes.some((type) => file.type.startsWith(type.split("/")[0]))) { // Broader check
      setError("Please upload a valid audio file (e.g., WAV, MP3, M4A, OGG, WebM)")
      return
    }
    if (file.size > 10 * 1024 * 1024) { // 10MB
      setError("File size must be less than 10MB")
      return
    }
    
    const url = URL.createObjectURL(file)
    addDebugLog(`Created URL for uploaded file: ${url}`)
    const audio = new Audio(url)
    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      addDebugLog(`Uploaded file metadata loaded, duration: ${duration} seconds`)
      if (!duration || duration === Infinity || duration < 0.5) {
        setError("Uploaded audio file is too short (min 0.5s) or duration is invalid.")
        URL.revokeObjectURL(url)
        return
      }
      setAudioBlob(file)
      setAudioUrl(url)
      setRecordingDuration(Math.round(duration))
      setError(null)
      addDebugLog(`File processed successfully: ${url}`)
    }
    audio.onerror = () => {
      addDebugLog("Error loading uploaded file metadata")
      setError("Failed to process uploaded audio file. It may be corrupted.")
      URL.revokeObjectURL(url)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60) // Round seconds
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const transcribeAudio = async () => {
    if (!audioBlob) {
      setTranscriptionError("No audio recording available to transcribe")
      return
    }
    setIsTranscribing(true)
    setTranscriptionError(null)
    setTranscript(null)
    addDebugLog("Starting transcription process")
    try {
      const formData = new FormData()
      formData.append("file", audioBlob, audioBlob.name || "recording.webm") // Ensure filename is passed
      const response = await fetch("https://taleem-ai-backend-production.up.railway.app/transcribe", {
        method: "POST",
        body: formData,
      })
      if (!response.ok) {
        let errorMessage = `Failed to transcribe audio (${response.status})`
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorData.detail || errorMessage
        } catch (e) {
          errorMessage = `${errorMessage}: ${response.statusText}`
        }
        throw new Error(errorMessage)
      }
      const data = await response.json()
      const transcriptionText = data.transcription
      addDebugLog(`Transcription API response: ${JSON.stringify(data)}`)
      if (typeof transcriptionText === 'string') {
        setTranscript(transcriptionText)
        if (recitationIdState) {
          await updateRecitationTranscription(recitationIdState, transcriptionText)
        }
      } else {
        addDebugLog(`Transcription result was not a string: ${transcriptionText}`)
        setTranscript(null)
        setTranscriptionError("Transcription service returned an invalid format.");
        if (recitationIdState) {
          await updateRecitationTranscriptionError(recitationIdState, "Transcription service returned an invalid format.")
        }
      }
    } catch (error: any) {
      console.error("Transcription error:", error)
      addDebugLog(`Transcription error: ${error.message}`)
      setTranscriptionError(error.message || "Failed to transcribe audio")
      if (recitationIdState) {
        await updateRecitationTranscriptionError(recitationIdState, error.message || "Failed to transcribe audio")
      }
    } finally {
      setIsTranscribing(false)
    }
  }

  const updateRecitationTranscription = async (id: string, transcriptionText: string) => {
    try {
      const supabase = createClientComponentClient(); //
      const { error: updateError } = await supabase // Renamed error to avoid conflict
        .from("recitations")
        .update({
          transcription: transcriptionText,
          transcription_status: "completed",
          transcription_date: new Date().toISOString(),
        })
        .eq("id", id)
      if (updateError) {
        addDebugLog(`Error updating transcription in database: ${updateError.message}`)
        console.error("Error updating transcription:", updateError)
      } else {
        addDebugLog(`Successfully updated transcription in database for recitation ${id}`)
      }
    } catch (err: any) {
      addDebugLog(`Exception updating transcription: ${err.message}`)
      console.error("Exception updating transcription:", err)
    }
  }

  const updateRecitationTranscriptionError = async (id: string, errorMessage: string) => {
    try {
      const supabase = createClientComponentClient(); //
      const { error: updateError } = await supabase // Renamed error
        .from("recitations")
        .update({
          transcription_status: "error",
          transcription_error: errorMessage,
          transcription_date: new Date().toISOString(),
        })
        .eq("id", id)
      if (updateError) {
        addDebugLog(`Error updating transcription error in database: ${updateError.message}`)
        console.error("Error updating transcription error:", updateError)
      } else {
        addDebugLog(`Successfully updated transcription error in database for recitation ${id}`)
      }
    } catch (err: any) {
      addDebugLog(`Exception updating transcription error: ${err.message}`)
      console.error("Exception updating transcription error:", err)
    }
  }

  const handleSubmit = async () => {
    if (!audioBlob) {
      setError("Please record or upload audio first.")
      return
    }
    if (audioBlob.size === 0) {
      setError("The recording is empty. Please record again.")
      return
    }
    // Use the state `recordingDuration` which is updated from metadata
    if (recordingDuration < 0.5) { 
      setError("Recording is too short (min 0.5s). Please record a longer recitation.")
      return
    }

    setIsUploading(true)
    setError(null) // Clear previous errors before new submission
    addDebugLog(`Submitting audio: ${audioBlob.size} bytes, type: ${audioBlob.type}, duration: ${recordingDuration}s`)

    const submissionTime = new Date();
    const isLate = isPastDuePST(assignmentDueDate, submissionTime.toISOString()); //
    addDebugLog(`Submission time (UTC): ${submissionTime.toISOString()}, Due date: ${assignmentDueDate}, Is late: ${isLate}`);

    try {
      const supabase = createClientComponentClient(); //
      let fileExtension = "webm"
      const mimeType = audioBlob.type.toLowerCase()
      if (mimeType.includes("mp3") || mimeType.includes("mpeg")) fileExtension = "mp3"
      else if (mimeType.includes("wav")) fileExtension = "wav"
      else if (mimeType.includes("ogg")) fileExtension = "ogg"
      else if (mimeType.includes("mp4") || mimeType.includes("x-m4a")) fileExtension = "m4a"
      
      const fileName = `recitations/${studentId}/${assignmentId}/${Date.now()}.${fileExtension}`
      addDebugLog(`Uploading to storage: ${fileName}`)

      const { data: uploadData, error: uploadError } = await supabase.storage.from("recitations").upload(fileName, audioBlob, {
        contentType: audioBlob.type || `audio/${fileExtension}`,
        cacheControl: "3600",
        upsert: false, 
      });

      if (uploadError) {
        addDebugLog(`Upload error: ${uploadError.message}`);
        throw new Error(`Failed to upload audio: ${uploadError.message}`);
      }
      
      addDebugLog(`Upload successful: ${JSON.stringify(uploadData)}`);

      const { data: urlData } = supabase.storage.from("recitations").getPublicUrl(fileName)
      const publicAudioUrl = urlData.publicUrl // Renamed to avoid conflict
      addDebugLog(`Got public URL: ${publicAudioUrl}`)

      const { error: updateError } = await supabase
        .from("recitations")
        .update({ is_latest: false })
        .eq("student_id", studentId)
        .eq("assignment_id", assignmentId)
      if (updateError) {
        addDebugLog(`Warning: Error updating previous submissions: ${updateError.message}`)
      }

      addDebugLog("Creating recitation record in database")
      const { data: recitationData, error: recitationError } = await supabase
        .from("recitations")
        .insert({
          assignment_id: assignmentId,
          student_id: studentId,
          audio_url: publicAudioUrl, // Use renamed variable
          submitted_at: submissionTime.toISOString(),
          is_latest: true,
          transcription: transcript || null,
          transcription_status: transcript ? "completed" : "pending",
          transcription_date: transcript ? submissionTime.toISOString() : null,
          transcription_error: transcriptionError || null,
          is_late_submission: isLate,
        })
        .select()
        .single()

      if (recitationError) {
        throw new Error(`Failed to save recitation: ${recitationError.message}`)
      }
      
      setRecitationIdState(recitationData.id)
      addDebugLog(`Recitation record created with ID: ${recitationData.id}`)

      try {
        addDebugLog("Triggering speech recognition processing via API call")
        const response = await fetch("/api/speech-recognition", { //
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recitationId: recitationData.id }),
        })
        if (!response.ok) {
          const errorData = await response.json()
          addDebugLog(`Speech recognition API error: ${errorData.error || response.statusText}`)
        } else {
          addDebugLog("Speech recognition processing triggered successfully")
        }
      } catch (apiError: any) {
        addDebugLog(`Error triggering speech recognition: ${apiError.message}`)
      }

      toast({ //
        title: "Recitation Submitted",
        description: `Your recitation has been submitted${isLate ? " (late)" : ""}.`,
      })
      onRecitationSubmitted(recitationData.id)
      // No setIsUploading(false) here as the component will likely be replaced by RecitationFeedback
    } catch (err: any) {
      console.error("Error submitting recitation:", err)
      addDebugLog(`Submission error: ${err.message}`)
      setError(err.message || "Failed to submit recitation")
      setIsUploading(false) // Set to false on error so user can try again
      toast({ //
        title: "Submission Failed",
        description: err.message || "Failed to submit recitation",
        variant: "destructive",
      })
    }
  }
  // ... (rest of the component JSX, ensure the Submit button uses recordingDuration for its disabled check)
  return (
    <Card className="w-full"> {/* */}
      <CardContent className="p-6 space-y-4"> {/* */}
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

          {isRecording ? (
            <div className="text-center w-full">
              <div className="text-2xl font-mono mb-4 text-red-600">{formatTime(recordingDuration)}</div>
              <div className="animate-pulse mb-4 h-16 flex items-center justify-center">
                <div className="bg-red-600 h-8 w-8 rounded-full"></div>
              </div>
              <Button onClick={stopRecording} variant="destructive" size="lg" className="w-full sm:w-auto"> {/* */}
                <Square className="mr-2 h-4 w-4" />
                Stop Recording
              </Button>
              <p className="text-xs text-muted-foreground mt-2">Maximum recording time: 3 minutes</p>
            </div>
          ) : audioUrl ? (
            <div className="w-full space-y-4">
              <div className="flex items-center justify-center bg-gray-100 dark:bg-gray-800 p-4 rounded-md">
                <Button onClick={togglePlayback} variant="outline" size="icon" className="mr-4"> {/* */}
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                <audio
                  ref={audioRef}
                  src={audioUrl}
                  className="hidden" // Keep hidden, control via button
                  onEnded={() => setIsPlaying(false)}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />
                <div className="flex-1">
                  {/* Optional: Progress bar for playback */}
                  <p className="text-xs text-muted-foreground">
                    {isPlaying ? "Playing..." : "Ready to play"} Duration: {formatTime(recordingDuration)}
                  </p>
                </div>
              </div>

              {/* Transcription section */}
              <div className="w-full">
                {!transcript && !transcriptionError && !isTranscribing && audioBlob && ( // Only show if blob exists
                  <Button onClick={transcribeAudio} variant="outline" className="w-full" disabled={isTranscribing}> {/* */}
                    Transcribe Recitation (Optional)
                  </Button>
                )}
                {isTranscribing && (
                  <div className="flex items-center justify-center p-4 border border-gray-200 dark:border-gray-700 rounded-md">
                    <div className="animate-spin mr-2 h-4 w-4 border-2 border-purple-600 border-t-transparent rounded-full"></div>
                    <span>Transcribing...</span>
                  </div>
                )}
                {transcriptionError && (
                  <div className="p-4 border border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800 rounded-md text-red-600 dark:text-red-400 text-sm">
                    <p className="font-medium">Transcription Error</p>
                    <p>{transcriptionError}</p>
                  </div>
                )}
                {transcript && (
                  <div className="p-4 border border-purple-200 dark:border-purple-800 rounded-md bg-purple-50 dark:bg-purple-900/10">
                    <h4 className="text-sm font-medium mb-2 text-purple-700 dark:text-purple-400">Transcription</h4>
                    <p className="text-right font-arabic text-lg" dir="rtl">
                      {transcript}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <Button //
                  onClick={resetRecordingStates}
                  variant="outline"
                >
                  Record/Upload Again
                </Button>
                <Button onClick={handleSubmit} disabled={isUploading || !audioBlob || recordingDuration < 0.5}> {/* */}
                  {isUploading ? "Submitting..." : "Submit Recitation"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="w-full space-y-6">
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button onClick={startRecording} variant="default" size="lg" className="w-full sm:w-auto"> {/* */}
                  <Mic className="mr-2 h-4 w-4" />
                  Start Recording
                </Button>
                <div className="relative w-full sm:w-auto">
                  <Button //
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
                <p>Supported formats: .wav, .mp3, .m4a, .ogg, .webm</p>
                <p>Maximum file size: 10MB. Minimum duration: 0.5 seconds.</p>
              </div>
            </div>
          )}

          {debug.length > 0 && (
            <details className="w-full mt-6 text-xs border dark:border-gray-700 rounded-md p-2">
              <summary className="cursor-pointer font-medium text-muted-foreground">Debug Information</summary>
              <div className="mt-2 max-h-40 overflow-y-auto font-mono whitespace-pre-wrap text-gray-600 dark:text-gray-400">
                {debug.map((log, i) => (
                  <div key={i} className="border-b dark:border-gray-700 border-gray-100 py-1">
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