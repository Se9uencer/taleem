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
  // FIX: Make the due date prop optional to prevent render crashes
  assignmentDueDate?: string; 
}

export function RecitationRecorder({ assignmentId, studentId, onRecitationSubmitted, assignmentDueDate }: RecitationRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [recordingDuration, setRecordingDuration] = useState(0); 
  const [processedAudioDuration, setProcessedAudioDuration] = useState<number | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const recordingStartRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      stopMediaTracks()
      clearTimerInterval()
      releaseAudioUrl()
    }
  }, [])

  const stopMediaTracks = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }

  const clearTimerInterval = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
  }

  const releaseAudioUrl = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioUrl(null)
  }

  const resetRecordingStates = (isStartingNewRecording = false) => { 
    if (!isStartingNewRecording) {
        stopMediaTracks();
    }
    clearTimerInterval();
    releaseAudioUrl();
    setAudioBlob(null);
    setRecordingDuration(0);
    setProcessedAudioDuration(null); 
    if (!isStartingNewRecording || error) setError(null);
    setIsPlaying(false);
    if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = ""; 
        audioRef.current.load(); 
        audioRef.current.currentTime = 0;
    }
    audioChunksRef.current = [];
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try { mediaRecorderRef.current.stop(); } catch (e) { console.error("Error stopping recorder in reset:", e); }
    }
    mediaRecorderRef.current = null;
    if (!isStartingNewRecording) setIsRecording(false);
    setIsUploading(false);
  }

  const startRecording = async () => {
    resetRecordingStates(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: {
        sampleRate: 48000,
        channelCount: 1,
      } })
      streamRef.current = stream
      
      let recorder: MediaRecorder | null = null;
      const mimeTypesToTry = [ "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus" ];
      for (const mimeType of mimeTypesToTry) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          try {
            recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 96000 });
            break;
          } catch (e) {
            console.error(`Failed to create MediaRecorder with ${mimeType}`);
          }
        }
      }
      if (!recorder) {
         try {
            recorder = new MediaRecorder(stream);
         } catch (e) {
            throw new Error("MediaRecorder could not be initialized. Please check browser permissions and compatibility.");
         }
      }
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = () => processRecording();
      recorder.onerror = (event: Event) => {
        const mediaErrorEvent = event as MediaRecorderErrorEvent;
        setError(`Recording system error: ${mediaErrorEvent.error?.name} - ${mediaErrorEvent.error?.message || "Unknown recording error"}`)
        resetRecordingStates(); 
      }
      
      recorder.start(250);
      recordingStartRef.current = Date.now();
      setIsRecording(true) 

      setRecordingDuration(0); 
      timerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1)
      }, 1000)
    } catch (err: any) {
      setError(`Could not start recording: ${err.message}. Please ensure microphone access is allowed and try again.`)
      resetRecordingStates()
    }
  }

  const stopRecording = () => {
    setIsRecording(false); 
    clearTimerInterval(); 
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
    } else {
      if (audioChunksRef.current.length > 0) processRecording(); else stopMediaTracks();
    }
  }

  const processRecording = () => {
    const fallbackDuration = recordingStartRef.current !== null ? (Date.now() - recordingStartRef.current) / 1000 : null;

    if (audioChunksRef.current.length === 0) {
        setError("No audio data was recorded. Please try recording for a longer duration.");
        resetRecordingStates(); 
        return;
    }

    try {
      const mimeType = mediaRecorderRef.current?.mimeType || audioChunksRef.current[0]?.type || "audio/webm";
      const blob = new Blob(audioChunksRef.current, { type: mimeType });
      
      if (blob.size === 0) {
        setError("Recording resulted in an empty audio file. Please try again.");
        resetRecordingStates();
        return;
      }

      if (audioUrl) URL.revokeObjectURL(audioUrl);
      const newAudioUrl = URL.createObjectURL(blob);
      setAudioUrl(newAudioUrl); 
      
      const audio = new Audio();
      audio.onloadedmetadata = () => {
        const durationFromMetadata = audio.duration;
        const finalDuration = (isNaN(durationFromMetadata) || !isFinite(durationFromMetadata)) ? fallbackDuration : durationFromMetadata;

        if (finalDuration !== null && finalDuration >= 0.5) {
          setAudioBlob(blob);
          setProcessedAudioDuration(finalDuration);
          setError(null);
        } else {
          setError(`Recording too short or invalid (duration: ${finalDuration?.toFixed(2) || 'N/A'}s, min 0.5s). Please try again.`);
          URL.revokeObjectURL(newAudioUrl);
          setAudioUrl(null);
        }
        recordingStartRef.current = null;
      };

      audio.onerror = () => {
        if (fallbackDuration !== null && fallbackDuration >= 0.5) {
            setAudioBlob(blob);
            setProcessedAudioDuration(fallbackDuration);
            setError(null);
        } else {
            setError(`Failed to read audio properties and fallback duration was invalid. Please try re-recording.`);
            URL.revokeObjectURL(newAudioUrl);
            setAudioUrl(null);
        }
        recordingStartRef.current = null;
      };
      
      audio.src = newAudioUrl;
      audio.load();

    } catch (err: any) {
      setError(`Failed to process recording: ${err.message}`);
    } finally {
        stopMediaTracks();
        audioChunksRef.current = [];
    }
  }

  const togglePlayback = () => {
    if (!audioRef.current || !audioUrl) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.currentTime = 0; 
      audioRef.current.play().catch((err) => setError(`Could not play audio: ${err.message}`));
    }
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    resetRecordingStates(); 
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("audio/")) {
      setError("Please upload a valid audio file.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) { // 10MB
      setError("File size must be less than 10MB");
      return;
    }
    
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    const newUrl = URL.createObjectURL(file);
    setAudioUrl(newUrl); 
    
    const audio = new Audio(newUrl);
    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      if (!duration || isNaN(duration) || duration < 0.5) {
        setError("Uploaded audio file is too short (min 0.5s) or invalid.");
        URL.revokeObjectURL(newUrl);
        setAudioUrl(null);
        return;
      }
      setAudioBlob(file); 
      setProcessedAudioDuration(duration);
      setError(null);
    };
    audio.onerror = () => {
      setError("Failed to process uploaded audio file. It may be corrupted.");
      URL.revokeObjectURL(newUrl);
      setAudioUrl(null);
    };
  }

  const formatTime = (seconds: number | null) => {
    if (seconds === null || isNaN(seconds)) return "00:00";
    const totalSeconds = Math.max(0, seconds);
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.round(totalSeconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  
  const handleSubmit = async () => {
    if (!audioBlob || processedAudioDuration === null || processedAudioDuration < 0.5) {
      setError("A valid audio recording is required for submission.");
      return
    }

    setIsUploading(true)
    setError(null)
    const submissionTime = new Date();
    const isLate = assignmentDueDate ? isPastDuePST(assignmentDueDate, submissionTime.toISOString()) : false;

    try {
      const supabase = createClientComponentClient();
      let fileExtension = audioBlob.type.split('/')[1] || "webm";
      const fileName = `recitations/${studentId}/${assignmentId}/${Date.now()}.${fileExtension}`

      const { error: uploadError } = await supabase.storage.from("recitations").upload(fileName, audioBlob, {
        contentType: audioBlob.type,
        upsert: false, 
      });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("recitations").getPublicUrl(fileName)
      
      await supabase
        .from("recitations")
        .update({ is_latest: false })
        .eq("student_id", studentId)
        .eq("assignment_id", assignmentId);

      const { data: recitationData, error: recitationError } = await supabase
        .from("recitations")
        .insert({
          assignment_id: assignmentId,
          student_id: studentId,
          audio_url: urlData.publicUrl,
          submitted_at: submissionTime.toISOString(),
          is_latest: true,
          transcription_status: "pending",
          is_late_submission: isLate,
        })
        .select()
        .single()

      if (recitationError) throw recitationError;
      
      // FIX: The API call is now made BEFORE telling the parent page to switch components.
      const formData = new FormData();
      formData.append("file", audioBlob);
      formData.append("recitationId", recitationData.id);

      // Trigger the AI processing
      await fetch("/api/speech-recognition", {
        method: "POST",
        body: formData,
      });

      toast({
        title: "Recitation Submitted",
        description: `Your recitation is now being processed by the AI.`,
      })

      // NOW, update the parent component's state as the very last step.
      onRecitationSubmitted(recitationData.id)

    } catch (err: any) {
      setError(err.message || "Failed to submit recitation")
      setIsUploading(false) 
      toast({
        title: "Submission Failed",
        description: err.message || "An unknown error occurred.",
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
            </div>
          ) : audioUrl ? (
            <div className="w-full space-y-4">
              <div className="flex items-center justify-center bg-gray-100 dark:bg-gray-800 p-4 rounded-md">
                <Button onClick={togglePlayback} variant="outline" size="icon" className="mr-4" disabled={!processedAudioDuration}>
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
                  <p className="text-xs text-muted-foreground">
                    {isPlaying ? "Playing..." : "Ready to play"} Duration: {formatTime(processedAudioDuration)}
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <Button 
                  onClick={() => resetRecordingStates(false)}
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
        </div>
      </CardContent>
    </Card>
  )
}