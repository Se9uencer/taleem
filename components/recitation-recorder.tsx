// File: components/recitation-recorder.tsx
"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Mic, Square, Play, Pause, Upload, AlertCircle } from "lucide-react"
import { createClientComponentClient } from "@/lib/supabase/client"
import { toast } from "@/components/ui/use-toast"
import { isPastDuePST } from "@/lib/date-utils"

interface RecitationRecorderProps {
  assignmentId: string
  studentId: string
  onRecitationSubmitted: (recitationId: string) => void
  assignmentDueDate: string; 
}

export function RecitationRecorder({ assignmentId, studentId, onRecitationSubmitted, assignmentDueDate }: RecitationRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0); // UI timer, increments every second
  const [processedAudioDuration, setProcessedAudioDuration] = useState<number | null>(null); // Accurate duration from metadata
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
        // addDebugLog(`Stopped track: ${track.kind}`) // Can be noisy
      })
      streamRef.current = null
    }
  }

  const clearTimerInterval = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
      // addDebugLog("Timer interval cleared") // Can be noisy
    }
  }

  const releaseAudioUrl = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl)
      setAudioUrl(null)
      addDebugLog("Previous audio URL released")
    }
  }

  const resetRecordingStates = () => { 
    addDebugLog("Resetting recording states...")
    stopMediaTracks()
    clearTimerInterval()
    releaseAudioUrl()
    setAudioBlob(null)
    setRecordingDuration(0)
    setProcessedAudioDuration(null); 
    setError(null) // Clear previous errors
    setTranscript(null);
    setTranscriptionError(null);
    setIsPlaying(false);
    if (audioRef.current) {
        audioRef.current.src = ""; // Clear src
        audioRef.current.load(); // Attempt to reset audio element state
        audioRef.current.currentTime = 0;
    }
    audioChunksRef.current = []; // Ensure chunks are cleared
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        addDebugLog(`MediaRecorder was in state ${mediaRecorderRef.current.state}, attempting to stop during reset.`);
        mediaRecorderRef.current.stop(); // Attempt to stop if it was somehow active
    }
    mediaRecorderRef.current = null;
    setIsRecording(false); // Ensure recording flag is false
    setIsUploading(false); // Ensure uploading flag is false
  }

  const startRecording = async () => {
    resetRecordingStates(); // Call reset at the very beginning
    try {
      addDebugLog("Attempting to start recording...")
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      addDebugLog(`Media stream acquired. Tracks: ${stream.getAudioTracks().length}`)
      
      let recorder: MediaRecorder | null = null;
      const mimeTypesToTry = [
        "audio/webm;codecs=opus", 
        "audio/webm", 
        "audio/ogg;codecs=opus", 
        "audio/mp4", // Some browsers might support this for MediaRecorder
      ];
      for (const mimeType of mimeTypesToTry) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          try {
            recorder = new MediaRecorder(stream, { mimeType });
            addDebugLog(`Successfully created MediaRecorder with MIME type: ${mimeType}`);
            break;
          } catch (e) {
            addDebugLog(`Failed to create MediaRecorder with ${mimeType}: ${e instanceof Error ? e.message : String(e)}`);
          }
        } else {
            addDebugLog(`MIME type not supported: ${mimeType}`);
        }
      }
      if (!recorder) {
         // Fallback to default if no preferred types work
         try {
            recorder = new MediaRecorder(stream);
            addDebugLog(`Created MediaRecorder with browser default settings. MIME type: ${recorder.mimeType}`);
         } catch (e) {
            addDebugLog(`Failed to create MediaRecorder even with default settings: ${e instanceof Error ? e.message : String(e)}`);
            throw new Error("MediaRecorder could not be initialized.");
         }
      }
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          // addDebugLog(`Received chunk: ${event.data.size} bytes, type: ${event.data.type}`) // Can be very noisy
          audioChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => {
        addDebugLog(`MediaRecorder.onstop triggered. UI Duration was ~${recordingDuration}s. Processing ${audioChunksRef.current.length} chunks.`)
        processRecording()
      }
      recorder.onerror = (event: Event) => { // Generic Event, cast to MediaRecorderErrorEvent
        const mediaErrorEvent = event as MediaRecorderErrorEvent;
        const err = mediaErrorEvent.error;
        addDebugLog(`MediaRecorder error event: ${err?.name} - ${err?.message}`)
        setError(`Recording system error: ${err?.name} - ${err?.message || "Unknown recording error"}`)
        resetRecordingStates(); // Reset on critical recorder error
      }
      
      recorder.start(250); // Collect data every 250ms
      
      addDebugLog(`MediaRecorder started successfully (state: ${recorder.state}) with 250ms timeslice`)
      setIsRecording(true) // This should trigger UI change to "Stop Recording"

      setRecordingDuration(0); 
      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => {
          const newDuration = prev + 1
          if (newDuration >= 180) {
            addDebugLog("Max recording time reached (180s), stopping")
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
                stopRecording(); // Ensure stopRecording is called
            }
            return 180
          }
          return newDuration
        })
      }, 1000)
      addDebugLog("UI Timer started")
    } catch (err: any) {
      console.error("Error starting recording:", err)
      addDebugLog(`Error starting recording: ${err.message}`)
      setError(`Could not start recording: ${err.message}. Please ensure microphone access is allowed and try again.`)
      resetRecordingStates()
    }
  }

  const stopRecording = () => {
    addDebugLog("Stop button clicked or max time reached. Attempting to stop recording...");
    setIsRecording(false); 
    clearTimerInterval(); 
    
    if (mediaRecorderRef.current) {
      const state = mediaRecorderRef.current.state;
      addDebugLog(`MediaRecorder state before explicit stop: ${state}`);
      if (state === "recording" || state === "paused") {
        try {
          // ondataavailable is implicitly called one last time before onstop by mediaRecorder.stop()
          mediaRecorderRef.current.stop(); 
          addDebugLog("MediaRecorder.stop() successfully called. Waiting for onstop event.");
        } catch (err: any) {
          addDebugLog(`Error calling MediaRecorder.stop(): ${err.message}`);
          setError(`Error stopping recording: ${err.message}`);
          // If stop fails, try to process what we have and then stop tracks
          if (audioChunksRef.current.length > 0) {
            addDebugLog("Forcing processing of existing chunks due to stop() error.");
            processRecording();
          }
          stopMediaTracks(); 
        }
      } else {
        addDebugLog(`MediaRecorder was not in 'recording' or 'paused' state (current state: ${state}). Will process existing chunks if any.`);
        if (audioChunksRef.current.length > 0) {
          processRecording(); 
        } else {
          addDebugLog("No chunks to process, and recorder was not active.");
          stopMediaTracks();
        }
      }
    } else {
      addDebugLog("MediaRecorder ref is null. No active recording to stop.");
      stopMediaTracks(); // Ensure cleanup if ref is null
    }
  }

  const processRecording = () => {
    addDebugLog(`Processing audio. Number of chunks: ${audioChunksRef.current.length}. Blob type from recorder: ${mediaRecorderRef.current?.mimeType}`);
    
    if (audioChunksRef.current.length === 0) {
        addDebugLog("No audio chunks were collected during recording.");
        setError("No audio data was recorded. Please try again.");
        resetRecordingStates(); 
        return;
    }

    try {
      const mimeType = mediaRecorderRef.current?.mimeType || audioChunksRef.current[0]?.type || "audio/webm";
      addDebugLog(`Using MIME type for blob: ${mimeType}`);
      const blob = new Blob(audioChunksRef.current, { type: mimeType });
      addDebugLog(`Blob created successfully. Size: ${blob.size} bytes, Type: ${blob.type}`);
      
      if (blob.size === 0) {
        setError("Recording resulted in an empty audio file. Please try again.");
        resetRecordingStates();
        return;
      }

      // Revoke old URL if it exists
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        addDebugLog("Revoked old object URL");
      }
      
      const newAudioUrl = URL.createObjectURL(blob);
      addDebugLog(`New Object URL created: ${newAudioUrl}`);
      setAudioUrl(newAudioUrl); // Set URL for the <audio> element
      
      const audio = new Audio(newAudioUrl);
      addDebugLog("HTMLAudioElement created for metadata.")
      
      audio.onloadedmetadata = () => {
        const durationFromMetadata = audio.duration;
        addDebugLog(`onloadedmetadata: audio.duration = ${durationFromMetadata}`);

        if (durationFromMetadata && !isNaN(durationFromMetadata) && durationFromMetadata !== Infinity && durationFromMetadata >= 0.5) {
          setAudioBlob(blob); // Set blob only if duration is valid
          setProcessedAudioDuration(durationFromMetadata);
          setError(null); 
          addDebugLog(`Audio processed successfully. Accurate duration: ${durationFromMetadata}s`);
        } else {
          addDebugLog(`Invalid duration from metadata: ${durationFromMetadata}. Minimum 0.5s required.`);
          setError("Recording is too short, duration is invalid, or couldn't be processed (min 0.5s). Please try again.");
          URL.revokeObjectURL(newAudioUrl); // Clean up new URL
          setAudioUrl(null);
          setAudioBlob(null);
          setProcessedAudioDuration(null);
        }
      };
      audio.onerror = (e) => {
        const errorTarget = e.target as HTMLAudioElement;
        const errorDetails = errorTarget.error ? `Code: ${errorTarget.error.code}, Message: ${errorTarget.error.message}` : "Unknown audio element error";
        addDebugLog(`HTMLAudioElement error during metadata load: ${errorDetails}`);
        setError(`Failed to read audio metadata. File might be corrupted. Details: ${errorDetails}`);
        URL.revokeObjectURL(newAudioUrl); // Clean up new URL
        setAudioUrl(null);
        setAudioBlob(null);
        setProcessedAudioDuration(null);
      };

      // Explicitly load to trigger metadata event for some browsers
      audio.load(); 

    } catch (err: any) {
      console.error("Critical error in processRecording:", err);
      addDebugLog(`Critical error in processRecording: ${err.message}`);
      setError(`Failed to process recording: ${err.message}`);
      resetRecordingStates();
    } finally {
        // Clean up stream tracks after processing is done or if it failed
        stopMediaTracks();
        // Clear chunks for the next recording
        audioChunksRef.current = [];
    }
  }

  const togglePlayback = () => {
    if (!audioRef.current || !audioUrl) {
        addDebugLog("Cannot toggle playback: No audio element ref or URL.");
        return;
    }
    if (isPlaying) {
      audioRef.current.pause();
      addDebugLog("Playback paused.");
    } else {
      audioRef.current.currentTime = 0; 
      audioRef.current.play().then(() => {
        addDebugLog("Playback started.");
      }).catch((err) => {
        console.error("Error playing audio:", err);
        addDebugLog(`Error starting playback: ${err.message}`);
        setError(`Could not play audio: ${err.message}`);
      });
    }
    // isPlaying state is managed by onPlay/onPause handlers of the audio element
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    resetRecordingStates(); 
    const file = event.target.files?.[0];
    if (!file) {
        addDebugLog("No file selected for upload.");
        return;
    }
    addDebugLog(`File selected: ${file.name}, type: ${file.type}, size: ${file.size} bytes`);
    const validTypes = ["audio/wav", "audio/mpeg", "audio/mp3", "audio/ogg", "audio/webm", "audio/aac", "audio/mp4", "audio/x-m4a"];
    if (!validTypes.some((type) => file.type.startsWith(type.split("/")[0]))) {
      setError("Please upload a valid audio file (e.g., WAV, MP3, M4A, OGG, WebM)");
      event.target.value = ""; // Reset file input
      return;
    }
    if (file.size > 10 * 1024 * 1024) { // 10MB
      setError("File size must be less than 10MB");
      event.target.value = ""; 
      return;
    }
    
    const url = URL.createObjectURL(file);
    addDebugLog(`Created Object URL for uploaded file: ${url}`);
    setAudioUrl(url); // Set URL for the <audio> element
    
    const audio = new Audio(url);
    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      addDebugLog(`Uploaded file metadata loaded, duration: ${duration} seconds`);
      if (!duration || isNaN(duration) || duration === Infinity || duration < 0.5) {
        setError("Uploaded audio file is too short (min 0.5s), duration is invalid, or couldn't be processed.");
        URL.revokeObjectURL(url);
        setAudioUrl(null);
        setAudioBlob(null);
        setProcessedAudioDuration(null);
        event.target.value = ""; 
        return;
      }
      setAudioBlob(file); // Set blob for submission
      setProcessedAudioDuration(duration);
      setError(null);
      addDebugLog(`File processed successfully. Accurate duration: ${duration}s`);
    };
    audio.onerror = () => {
      addDebugLog("Error loading uploaded file metadata.");
      setError("Failed to process uploaded audio file. It may be corrupted or an unsupported format.");
      URL.revokeObjectURL(url);
      setAudioUrl(null);
      setAudioBlob(null);
      setProcessedAudioDuration(null);
      event.target.value = ""; 
    };
  }

  const formatTime = (seconds: number | null) => {
    if (seconds === null || typeof seconds !== 'number' || isNaN(seconds)) return "00:00";
    const totalSeconds = Math.max(0, seconds); // Ensure non-negative
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.round(totalSeconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  
  // Display recordingDuration (UI timer) when recording, otherwise processedAudioDuration
  const displayDuration = isRecording ? recordingDuration : processedAudioDuration;


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
      formData.append("file", audioBlob, audioBlob.name || `recording-${Date.now()}.${audioBlob.type.split('/')[1] || 'webm'}`)
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
      const supabase = createClientComponentClient();
      const { error: updateError } = await supabase
        .from("recitations")
        .update({
          transcription: transcriptionText,
          transcription_status: "completed",
          transcription_date: new Date().toISOString(),
        })
        .eq("id", id)
      if (updateError) {
        addDebugLog(`Error updating transcription in database: ${updateError.message}`)
      } else {
        addDebugLog(`Successfully updated transcription in database for recitation ${id}`)
      }
    } catch (err: any) {
      addDebugLog(`Exception updating transcription: ${err.message}`)
    }
  }

  const updateRecitationTranscriptionError = async (id: string, errorMessage: string) => {
    try {
      const supabase = createClientComponentClient();
      const { error: updateError } = await supabase
        .from("recitations")
        .update({
          transcription_status: "error",
          transcription_error: errorMessage,
          transcription_date: new Date().toISOString(),
        })
        .eq("id", id)
      if (updateError) {
        addDebugLog(`Error updating transcription error in database: ${updateError.message}`)
      } else {
        addDebugLog(`Successfully updated transcription error in database for recitation ${id}`)
      }
    } catch (err: any) {
      addDebugLog(`Exception updating transcription error: ${err.message}`)
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
    if (processedAudioDuration === null || processedAudioDuration < 0.5) { 
      setError("Recording is too short (min 0.5s) or duration is invalid. Please record or upload a valid audio file.")
      return
    }

    setIsUploading(true)
    setError(null)
    addDebugLog(`Submitting audio: ${audioBlob.size} bytes, type: ${audioBlob.type}, duration: ${processedAudioDuration}s`)

    const submissionTime = new Date();
    const isLate = isPastDuePST(assignmentDueDate, submissionTime.toISOString());
    addDebugLog(`Submission time (UTC): ${submissionTime.toISOString()}, Due date: ${assignmentDueDate}, Is late: ${isLate}`);

    try {
      const supabase = createClientComponentClient();
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
      const publicAudioUrl = urlData.publicUrl
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
          audio_url: publicAudioUrl,
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
        const response = await fetch("/api/speech-recognition", {
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

      toast({
        title: "Recitation Submitted",
        description: `Your recitation has been submitted${isLate ? " (late)" : ""}.`,
      })
      onRecitationSubmitted(recitationData.id)
    } catch (err: any) {
      console.error("Error submitting recitation:", err)
      addDebugLog(`Submission error: ${err.message}`)
      setError(err.message || "Failed to submit recitation")
      setIsUploading(false) 
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
                  src={audioUrl} // This URL is from createObjectURL
                  className="hidden" 
                  onEnded={() => setIsPlaying(false)}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  // onError event added in processRecording and handleFileUpload
                />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">
                    {isPlaying ? "Playing..." : "Ready to play"} Duration: {formatTime(processedAudioDuration)}
                  </p>
                </div>
              </div>

              <div className="w-full">
                {!transcript && !transcriptionError && !isTranscribing && audioBlob && ( 
                  <Button onClick={transcribeAudio} variant="outline" className="w-full" disabled={isTranscribing}>
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
                <Button 
                  onClick={resetRecordingStates}
                  variant="outline"
                >
                  Record/Upload Again
                </Button>
                <Button onClick={handleSubmit} disabled={isUploading || !audioBlob || (processedAudioDuration === null || processedAudioDuration < 0.5)}>
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