"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Mic, StopCircle, Pause, Play, Trash2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

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
  basePath?: string;
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
  basePath = "/ffmpeg", // Default base path for ffmpeg core
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(initialBlob);
  const [recordingDuration, setRecordingDuration] = useState<number>(initialDuration || 0);
  const [elapsedTime, setElapsedTime] = useState<number>(0); // Elapsed time in seconds

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0); // Time when paused
  const totalPausedDurationRef = useRef<number>(0); // Total duration recording was paused

  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [ffmpeg, setFfmpeg] = useState<FFmpeg | null>(ffmpegInstance || null);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(!!ffmpegInstance);


  const loadFFmpeg = useCallback(async () => {
    if (ffmpeg) return; // Already loaded or provided

    console.log("Loading FFmpeg...");
    const newFfmpeg = new FFmpeg();
    newFfmpeg.on("log", ({ message }) => {
      console.log("FFmpeg log:", message);
    });

    try {
        // Dynamically determine the base URL for loading FFmpeg assets
        const baseURL = await toBlobURL(`${basePath}/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js`, 'text/javascript');
        const coreURL = await toBlobURL(`${basePath}/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm`, 'application/wasm');
        const workerURL = await toBlobURL(`${basePath}/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.worker.js`, 'text/javascript');

        await newFfmpeg.load({
            coreURL: baseURL, //This seems to be the correct one for the main js
            wasmURL: coreURL,
            workerURL: workerURL,
        });
        console.log("FFmpeg loaded successfully.");
        setFfmpeg(newFfmpeg);
        setFfmpegLoaded(true);
    } catch (error) {
        console.error("Failed to load FFmpeg:", error);
        // Handle error (e.g., show a message to the user)
    }
  }, [ffmpeg, basePath]);


  useEffect(() => {
    if (!ffmpegInstance) { // Only load if not provided
        loadFFmpeg();
    }
  }, [loadFFmpeg, ffmpegInstance]);


  const convertToMp3 = useCallback(async (inputBlob: Blob): Promise<Blob | null> => {
    if (!ffmpeg || !ffmpegLoaded) {
      console.error("FFmpeg not loaded yet.");
      return null;
    }
    if (!inputBlob || inputBlob.size === 0) {
        console.error("Input blob is null or empty.");
        return null;
    }

    console.log("Starting MP3 conversion...");
    try {
      const inputFileName = "input.webm"; // Or whatever the input format is, e.g., .ogg
      const outputFileName = "output.mp3";

      console.log("Writing file to FFmpeg FS...");
      await ffmpeg.writeFile(inputFileName, await fetchFile(inputBlob));
      console.log("File written. Running FFmpeg command...");

      // Execute FFmpeg command
      // -i: input file
      // -acodec libmp3lame: specify mp3 codec
      // -b:a 192k: set audio bitrate to 192 kbps (adjust as needed)
      // -y: overwrite output file if it exists
      const result = await ffmpeg.exec(["-i", inputFileName, "-acodec", "libmp3lame", "-b:a", "192k", outputFileName, "-y"]);
      console.log("FFmpeg command executed. Result:", result);


      console.log("Reading output file from FFmpeg FS...");
      const outputData = await ffmpeg.readFile(outputFileName);
      console.log("Output file read. Creating blob...");

      const mp3Blob = new Blob([outputData], { type: "audio/mpeg" });
      console.log("MP3 blob created. Size:", mp3Blob.size);

      // Clean up files from FFmpeg's virtual file system
      // It's good practice but might not be strictly necessary if re-using filenames
      // await ffmpeg.deleteFile(inputFileName);
      // await ffmpeg.deleteFile(outputFileName);


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
      if (startTimeRef.current > 0 && !isPaused) { // Ensure startTime is set and not paused
        const currentElapsedTime = (Date.now() - startTimeRef.current - totalPausedDurationRef.current) / 1000;
        setElapsedTime(currentElapsedTime);
      }
    }, 100); // Update every 100ms for smoother display
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
      stopTimer(); // Cleanup timer on component unmount or when recording stops
    };
  }, [isRecording, isPaused, startTimer, stopTimer]);


  const handleStartRecording = async () => {
    if (!ffmpegLoaded && !ffmpegInstance) {
        console.warn("FFmpeg is not loaded yet. Attempting to load now...");
        await loadFFmpeg(); // Attempt to load if not already
        if (!ffmpeg && !ffmpegInstance) { // Check again after attempt
            alert("Recorder is not ready. Please wait for FFmpeg to load.");
            return;
        }
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: "audio/webm" }); // Standardize to webm
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        stopTimer();
        const finalElapsedTime = (Date.now() - startTimeRef.current - totalPausedDurationRef.current) / 1000;
        // Ensure elapsedTime is a non-negative number, default to 0 if NaN or negative
        const validElapsedTime = Math.max(0, finalElapsedTime);
        setElapsedTime(validElapsedTime);
        setRecordingDuration(validElapsedTime);

        const audioBlobOriginal = new Blob(audioChunksRef.current, { type: "audio/webm" });

        if (ffmpeg && ffmpegLoaded && audioBlobOriginal.size > 0) {
            console.log("Attempting to convert to MP3");
            const mp3Blob = await convertToMp3(audioBlobOriginal);
            if (mp3Blob) {
                setAudioBlob(mp3Blob);
                onRecordingComplete(mp3Blob, validElapsedTime);
                if (autoSubmit) {
                    handleUpload(mp3Blob, validElapsedTime);
                }
            } else {
                console.warn("MP3 conversion failed. Using original WebM blob.");
                setAudioBlob(audioBlobOriginal);
                onRecordingComplete(audioBlobOriginal, validElapsedTime);
                 if (autoSubmit) {
                    handleUpload(audioBlobOriginal, validElapsedTime);
                }
            }
        } else {
            console.log("FFmpeg not available or blob empty, using original WebM blob");
            setAudioBlob(audioBlobOriginal);
            onRecordingComplete(audioBlobOriginal, validElapsedTime);
             if (autoSubmit) {
                handleUpload(audioBlobOriginal, validElapsedTime);
            }
        }


        // Clean up media stream tracks
        stream.getTracks().forEach(track => track.stop());
      };

      startTimeRef.current = Date.now();
      totalPausedDurationRef.current = 0; // Reset paused duration
      pausedTimeRef.current = 0; // Reset pause time
      setElapsedTime(0); // Reset elapsed time
      setRecordingDuration(0); // Reset recording duration
      setAudioBlob(null); // Clear previous recording
      mediaRecorderRef.current.start();
      setIsRecording(true);
      setIsPaused(false);
    } catch (error) {
      console.error("Error starting recording:", error);
      alert("Could not start recording. Please ensure microphone access is allowed.");
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      // Duration is now set in onstop
    }
  };

  const handlePauseRecording = () => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      pausedTimeRef.current = Date.now(); // Record time when paused
      stopTimer(); // Stop the timer display while paused
    }
  };

  const handleResumeRecording = () => {
    if (mediaRecorderRef.current && isRecording && isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      // Add the duration of the pause to the total paused duration
      if (pausedTimeRef.current > 0) {
        totalPausedDurationRef.current += (Date.now() - pausedTimeRef.current);
        pausedTimeRef.current = 0; // Reset pause time
      }
      startTimer(); // Restart the timer display
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
      audioRef.current.src = ""; // Clear audio player source
    }
    // No need to call stopTimer explicitly as useEffect handles it
  };

  const handleUpload = async (blobToUpload?: Blob, durationToUpload?: number) => {
    const currentBlob = blobToUpload || audioBlob;
    const currentDuration = durationToUpload || recordingDuration;

    if (currentBlob && onUpload && typeof currentDuration === 'number' && currentDuration > 0) {
      await onUpload(currentBlob, currentDuration);
    } else if (currentDuration === 0) {
        console.warn("Attempted to upload a zero-duration recording.");
        alert("Cannot upload an empty recording.");
    } else {
      console.warn("No recording available to upload or onUpload not provided.");
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

  return (
    <Card className="w-full max-w-md mx-auto shadow-lg">
      <CardContent className="pt-6">
        <div className="flex flex-col items-center space-y-4">
          {!ffmpegLoaded && !ffmpegInstance && (
            <div className="text-sm text-yellow-500">FFmpeg loading... please wait.</div>
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
              className="rounded-full w-20 h-20 bg-green-500 hover:bg-green-600"
              disabled={!ffmpegLoaded && !ffmpegInstance}
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
      <CardFooter className="text-xs text-gray-500 dark:text-gray-400 justify-center">
        {isRecording
          ? isPaused ? "Recording paused. Press play to resume." : "Recording in progress..."
          : audioBlob
          ? "Recording complete. Review or retake."
          : "Press the mic to start recording."}
      </CardFooter>
    </Card>
  );
};

export default Recorder;
