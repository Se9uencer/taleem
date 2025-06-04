"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Mic, StopCircle, Pause, Play, Trash2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util"; // toBlobURL is removed as we'll use direct paths

interface RecorderProps {
  onRecordingComplete: (blob: Blob, duration: number) => void;
  onUpload?: (blob: Blob, duration: number) => Promise<void>;
  showUploadButton?: boolean;
  uploadButtonText?: string;
  initialBlob?: Blob | null;
  initialDuration?: number | null;
  isUploading?: boolean;
  autoSubmit?: boolean;
  ffmpegInstance?: FFmpeg | null;
  basePath?: string; // Path in 'public' folder where FFmpeg core assets are stored
}

const Recorder: React.FC<RecorderProps> = ({
  onRecordingComplete,
  onUpload,
  showUploadButton = true,
  uploadButtonText = "Upload Recording",
  initialBlob = null,
  initialDuration = null,
  isUploading = false,
  autoSubmit = false,
  ffmpegInstance,
  basePath = "/ffmpeg", // Default base path for FFmpeg core assets in the public folder
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(initialBlob);
  const [recordingDuration, setRecordingDuration] = useState<number>(initialDuration || 0);
  const [elapsedTime, setElapsedTime] = useState<number>(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);
  const totalPausedDurationRef = useRef<number>(0);

  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [ffmpeg, setFfmpeg] = useState<FFmpeg | null>(ffmpegInstance || null);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(!!ffmpegInstance);
  const [ffmpegLoadingError, setFfmpegLoadingError] = useState<string | null>(null);


  const loadFFmpeg = useCallback(async () => {
    if (ffmpeg || ffmpegLoaded) return; // Already loaded or provided, or already attempted

    console.log("Loading FFmpeg using direct paths...");
    setFfmpegLoadingError(null);
    const newFfmpeg = new FFmpeg();
    newFfmpeg.on("log", ({ message }) => {
      // Avoid excessive logging in production, or make it conditional
      // console.log("FFmpeg log:", message);
    });

    try {
      // Construct direct paths to FFmpeg core files.
      // These files MUST be available in your `public` folder under the `basePath` directory.
      // For example, if basePath is "/ffmpeg", then:
      // public/ffmpeg/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js
      // public/ffmpeg/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm
      // public/ffmpeg/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.worker.js
      const coreJsPath = `${basePath}/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js`;
      const coreWasmPath = `${basePath}/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm`;
      const coreWorkerPath = `${basePath}/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.worker.js`;

      await newFfmpeg.load({
        coreURL: coreJsPath,
        wasmURL: coreWasmPath,
        workerURL: coreWorkerPath,
      });
      console.log("FFmpeg loaded successfully using direct paths.");
      setFfmpeg(newFfmpeg);
      setFfmpegLoaded(true);
    } catch (error) {
      console.error("Failed to load FFmpeg using direct paths:", error);
      setFfmpegLoadingError("Failed to load FFmpeg. Recorder will not function.");
      // Consider providing more specific user feedback or retry mechanisms
    }
  }, [ffmpeg, ffmpegLoaded, basePath]);


  useEffect(() => {
    if (!ffmpegInstance && !ffmpegLoaded && !ffmpeg) { // Only load if not provided and not already loaded/attempted
        loadFFmpeg();
    }
  }, [loadFFmpeg, ffmpegInstance, ffmpegLoaded, ffmpeg]);


  const convertToMp3 = useCallback(async (inputBlob: Blob): Promise<Blob | null> => {
    if (!ffmpeg || !ffmpegLoaded) {
      console.error("FFmpeg not loaded yet. Cannot convert to MP3.");
      setFfmpegLoadingError("FFmpeg not loaded. MP3 conversion failed.");
      return null;
    }
    if (!inputBlob || inputBlob.size === 0) {
        console.error("Input blob is null or empty for MP3 conversion.");
        return null;
    }

    console.log("Starting MP3 conversion...");
    try {
      const inputFileName = "input.webm";
      const outputFileName = "output.mp3";

      await ffmpeg.writeFile(inputFileName, await fetchFile(inputBlob));
      // -y overwrites output file if it exists
      await ffmpeg.exec(["-i", inputFileName, "-acodec", "libmp3lame", "-b:a", "192k", outputFileName, "-y"]);
      const outputData = await ffmpeg.readFile(outputFileName);
      const mp3Blob = new Blob([outputData], { type: "audio/mpeg" });
      console.log("MP3 blob created. Size:", mp3Blob.size);
      // Optional: await ffmpeg.deleteFile(inputFileName);
      // Optional: await ffmpeg.deleteFile(outputFileName);
      return mp3Blob;
    } catch (error) {
      console.error("Error during MP3 conversion:", error);
      return null;
    }
  }, [ffmpeg, ffmpegLoaded]);


  const startTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    timerIntervalRef.current = setInterval(() => {
      if (startTimeRef.current > 0 && !isPaused) {
        const currentElapsedTime = (Date.now() - startTimeRef.current - totalPausedDurationRef.current) / 1000;
        setElapsedTime(currentElapsedTime);
      }
    }, 100);
  }, [isPaused]);

  const stopTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isRecording && !isPaused) {
      startTimer();
    } else {
      stopTimer();
    }
    return () => {
      stopTimer();
    };
  }, [isRecording, isPaused, startTimer, stopTimer]);


  const handleStartRecording = async () => {
    if (!ffmpegLoaded && !ffmpegInstance) {
        console.warn("FFmpeg is not loaded yet. Attempting to load now if not already trying...");
        if (!ffmpeg && !ffmpegLoadingError) { // Avoid re-triggering if already failed or loading
            await loadFFmpeg();
        }
        if (!ffmpegLoaded && !ffmpegInstance) { // Check again
            console.error("Recorder is not ready. FFmpeg is still loading or failed to load. Please check console for errors.");
            // You might want to show this error in the UI
            setFfmpegLoadingError("Recorder not ready. Please wait or check console.");
            return;
        }
    }
    setFfmpegLoadingError(null); // Clear any previous loading error message on new attempt
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: "audio/webm" });
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        stopTimer();
        const finalElapsedTime = (Date.now() - startTimeRef.current - totalPausedDurationRef.current) / 1000;
        const validElapsedTime = Math.max(0, finalElapsedTime);
        setElapsedTime(validElapsedTime);
        setRecordingDuration(validElapsedTime);

        const audioBlobOriginal = new Blob(audioChunksRef.current, { type: "audio/webm" });

        if (ffmpeg && ffmpegLoaded && audioBlobOriginal.size > 0) {
            const mp3Blob = await convertToMp3(audioBlobOriginal);
            if (mp3Blob) {
                setAudioBlob(mp3Blob);
                onRecordingComplete(mp3Blob, validElapsedTime);
                if (autoSubmit) handleUpload(mp3Blob, validElapsedTime);
            } else {
                console.warn("MP3 conversion failed. Using original WebM blob.");
                setAudioBlob(audioBlobOriginal);
                onRecordingComplete(audioBlobOriginal, validElapsedTime);
                if (autoSubmit) handleUpload(audioBlobOriginal, validElapsedTime);
            }
        } else {
            setAudioBlob(audioBlobOriginal);
            onRecordingComplete(audioBlobOriginal, validElapsedTime);
            if (autoSubmit) handleUpload(audioBlobOriginal, validElapsedTime);
        }
        stream.getTracks().forEach(track => track.stop());
      };

      startTimeRef.current = Date.now();
      totalPausedDurationRef.current = 0;
      pausedTimeRef.current = 0;
      setElapsedTime(0);
      setRecordingDuration(0);
      setAudioBlob(null);
      mediaRecorderRef.current.start();
      setIsRecording(true);
      setIsPaused(false);
    } catch (error) {
      console.error("Error starting recording:", error, "Ensure microphone access is allowed.");
      // Update UI to show this error
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
    }
  };

  const handlePauseRecording = () => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      pausedTimeRef.current = Date.now();
      stopTimer();
    }
  };

  const handleResumeRecording = () => {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      if (pausedTimeRef.current > 0) {
        totalPausedDurationRef.current += (Date.now() - pausedTimeRef.current);
        pausedTimeRef.current = 0;
      }
      startTimer();
    }
  };

  const handleRetakeRecording = () => {
    setAudioBlob(null);
    setRecordingDuration(0);
    setElapsedTime(0);
    setIsRecording(false);
    setIsPaused(false);
    audioChunksRef.current = [];
    startTimeRef.current = 0;
    pausedTimeRef.current = 0;
    totalPausedDurationRef.current = 0;
    if (audioRef.current) {
      audioRef.current.src = "";
    }
    setFfmpegLoadingError(null); // Clear ffmpeg error on retake
  };

  const handleUpload = async (blobToUpload?: Blob, durationToUpload?: number) => {
    const currentBlob = blobToUpload || audioBlob;
    const currentDuration = durationToUpload || recordingDuration;

    if (currentBlob && onUpload && typeof currentDuration === 'number' && currentDuration > 0) {
      await onUpload(currentBlob, currentDuration);
    } else if (currentDuration === 0) {
        console.warn("Attempted to upload a zero-duration recording. Upload prevented.");
        // Update UI to show this error
    } else {
      console.warn("No recording available to upload or onUpload handler not provided.");
    }
  };


  useEffect(() => {
    if (audioBlob && audioRef.current) {
      audioRef.current.src = URL.createObjectURL(audioBlob);
    }
  }, [audioBlob]);

  const formatTime = (timeInSeconds: number): string => {
    if (isNaN(timeInSeconds) || timeInSeconds < 0) {
        return "00:00";
    }
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
      2,
      "0"
    )}`;
  };

  const startButtonDisabled = (!ffmpegLoaded && !ffmpegInstance) || !!ffmpegLoadingError;

  return (
    <Card className="w-full max-w-md mx-auto shadow-lg">
      <CardContent className="pt-6">
        <div className="flex flex-col items-center space-y-4">
          {(!ffmpegLoaded && !ffmpegInstance && !ffmpegLoadingError) && (
            <div className="text-sm text-yellow-500">FFmpeg loading... please wait.</div>
          )}
          {ffmpegLoadingError && (
            <div className="text-sm text-red-500 p-2 bg-red-100 border border-red-300 rounded-md">{ffmpegLoadingError}</div>
          )}
          <div
            className={cn(
              "text-4xl font-mono",
              isRecording && !isPaused ? "text-red-500 animate-pulse" : "text-gray-700 dark:text-gray-300"
            )}
          >
            {formatTime(isRecording ? elapsedTime : recordingDuration)}
          </div>

          {!isRecording && !audioBlob && (
            <Button
              onClick={handleStartRecording}
              size="lg"
              className="rounded-full w-20 h-20 bg-green-500 hover:bg-green-600 disabled:bg-gray-400"
              disabled={startButtonDisabled}
              title={startButtonDisabled ? ffmpegLoadingError || "FFmpeg not loaded" : "Start Recording"}
            >
              <Mic size={32} />
            </Button>
          )}

          {isRecording && (
            <div className="flex space-x-3">
              <Button
                onClick={isPaused ? handleResumeRecording : handlePauseRecording}
                variant="outline"
                size="icon"
                className="rounded-full"
              >
                {isPaused ? <Play size={20} /> : <Pause size={20} />}
              </Button>
              <Button
                onClick={handleStopRecording}
                variant="destructive"
                size="icon"
                className="rounded-full"
              >
                <StopCircle size={20} />
              </Button>
            </div>
          )}

          {audioBlob && !isRecording && (
            <div className="w-full space-y-3">
              <audio ref={audioRef} controls className="w-full" />
              <div className="flex justify-around space-x-2">
                <Button
                  onClick={handleRetakeRecording}
                  variant="outline"
                  className="flex-1"
                >
                  <Trash2 className="mr-2 h-4 w-4" /> Retake
                </Button>
                {showUploadButton && onUpload && (
                  <Button
                    onClick={() => handleUpload()}
                    className="flex-1 bg-blue-500 hover:bg-blue-600"
                    disabled={isUploading || recordingDuration === 0}
                  >
                    {isUploading ? "Uploading..." : <> <Check className="mr-2 h-4 w-4" /> {uploadButtonText} </>}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="text-xs text-gray-500 dark:text-gray-400 justify-center min-h-[20px]">
        {isRecording
          ? isPaused ? "Recording paused. Press play to resume." : "Recording in progress..."
          : audioBlob
          ? "Recording complete. Review or retake."
          : startButtonDisabled ? "Recorder disabled until FFmpeg loads." : "Press the mic to start recording."}
      </CardFooter>
    </Card>
  );
};

export default Recorder;
