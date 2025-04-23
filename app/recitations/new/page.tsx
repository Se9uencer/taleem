"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClientComponentClient } from "@/lib/supabase/client"
import Link from "next/link"
import { TaleemLogo } from "@/components/taleem-logo"
import { AlertCircleIcon } from "lucide-react"

export default function NewRecitationPage() {
  // Existing state variables remain the same
  const [assignment, setAssignment] = useState<any>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioURL, setAudioURL] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<any>(null)
  const [recordingTime, setRecordingTime] = useState(0)
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(null)
  const [availableBuckets, setAvailableBuckets] = useState<string[]>([])
  const [debugLog, setDebugLog] = useState<string[]>([])
  const [recordingStatus, setRecordingStatus] = useState<string>("idle")
  const [previousSubmission, setPreviousSubmission] = useState<any>(null)
  const [submissionSuccess, setSubmissionSuccess] = useState(false)

  // Refs for recording
  const streamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const router = useRouter()
  const searchParams = useSearchParams()
  const assignmentId = searchParams.get("assignment")

  // Define storage bucket options - we'll try these in order
  const storageBucketOptions = ["audio", "recitations", "uploads", "public"]

  // Helper function to add debug logs
  const addDebugLog = (message: string) => {
    console.log(message)
    setDebugLog((prev) => [...prev, `${new Date().toISOString().slice(11, 19)} - ${message}`])
  }

  useEffect(() => {
    const supabase = createClientComponentClient()

    const loadData = async () => {
      try {
        // Check if user is authenticated
        const { data: sessionData } = await supabase.auth.getSession()

        if (!sessionData.session) {
          router.push("/login")
          return
        }

        setUser(sessionData.session.user)

        // Get user profile to check if student
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", sessionData.session.user.id)
          .single()

        if (profileError || !profileData) {
          setError("Failed to load profile")
          setLoading(false)
          return
        }

        // Only students can submit recitations
        if (profileData.role !== "student") {
          router.push("/dashboard")
          return
        }

        // Check if assignment exists and student is enrolled in the class
        if (!assignmentId) {
          setError("No assignment specified")
          setLoading(false)
          return
        }

        const { data: assignmentData, error: assignmentError } = await supabase
          .from("assignments")
          .select("*, classes(*)")
          .eq("id", assignmentId)
          .single()

        if (assignmentError || !assignmentData) {
          setError("Assignment not found")
          setLoading(false)
          return
        }

        // Check if assignment is past due in PST
        const dueDate = new Date(assignmentData.due_date)
        const nowPST = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }))
        const dueDatePST = new Date(dueDate.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }))

        if (dueDatePST < nowPST) {
          setError("This assignment is past due and cannot be submitted")
          setLoading(false)
          return
        }

        // Check if student is enrolled in the class
        const { data: enrollment, error: enrollmentError } = await supabase
          .from("class_students")
          .select("*")
          .eq("class_id", assignmentData.class_id)
          .eq("student_id", sessionData.session.user.id)
          .single()

        if (enrollmentError || !enrollment) {
          setError("You are not enrolled in this class")
          setLoading(false)
          return
        }

        // Check if assignment is assigned to this student
        const { data: assignmentStudent, error: assignmentStudentError } = await supabase
          .from("assignment_students")
          .select("*")
          .eq("assignment_id", assignmentId)
          .eq("student_id", sessionData.session.user.id)
          .single()

        if (assignmentStudentError || !assignmentStudent) {
          setError("This assignment is not assigned to you")
          setLoading(false)
          return
        }

        // Check if student has already submitted this assignment
        const { data: existingSubmissions, error: submissionsError } = await supabase
          .from("recitations")
          .select("*")
          .eq("assignment_id", assignmentId)
          .eq("student_id", sessionData.session.user.id)
          .order("submitted_at", { ascending: false })

        if (!submissionsError && existingSubmissions && existingSubmissions.length > 0) {
          setPreviousSubmission(existingSubmissions[0])
          addDebugLog(
            `Found previous submission from ${new Date(existingSubmissions[0].submitted_at).toLocaleString()}`,
          )
        }

        // Check available storage buckets
        try {
          const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets()

          if (bucketsError) {
            console.error("Error listing buckets:", bucketsError)
          } else if (buckets) {
            const bucketNames = buckets.map((bucket) => bucket.name)
            setAvailableBuckets(bucketNames)
            console.log("Available storage buckets:", bucketNames)
          }
        } catch (bucketError) {
          console.error("Error checking buckets:", bucketError)
        }

        setAssignment(assignmentData)
        setLoading(false)
      } catch (err) {
        console.error("Error loading data:", err)
        setError("An unexpected error occurred")
        setLoading(false)
      }
    }

    loadData()
  }, [assignmentId, router])

  // Create a test tone audio file
  const createTestToneAudio = async () => {
    try {
      addDebugLog("Creating test tone audio...")
      setRecordingStatus("creating-test-tone")

      // Create an audio context
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()

      // Create an oscillator for a test tone
      const oscillator = audioContext.createOscillator()
      oscillator.type = "sine"
      oscillator.frequency.setValueAtTime(440, audioContext.currentTime) // 440 Hz - A4 note

      // Create a gain node to control volume
      const gainNode = audioContext.createGain()
      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime) // Lower volume

      // Connect oscillator to gain node and gain node to destination
      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      // Create a media stream destination to capture the audio
      const destination = audioContext.createMediaStreamDestination()
      gainNode.connect(destination)

      // Create a media recorder to record the audio
      const recorder = new MediaRecorder(destination.stream)
      const chunks: Blob[] = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data)
          addDebugLog(`Test tone chunk received: ${e.data.size} bytes`)
        }
      }

      recorder.onstop = () => {
        // Stop the oscillator
        oscillator.stop()

        // Create a blob from the chunks
        const blob = new Blob(chunks, { type: "audio/webm" })
        addDebugLog(`Test tone blob created: ${blob.size} bytes`)

        // Create a URL for the blob
        const url = URL.createObjectURL(blob)

        // Set the audio blob and URL
        setAudioBlob(blob)
        setAudioURL(url)
        setRecordingStatus("test-tone-created")

        // Close the audio context
        audioContext.close()
      }

      // Start the oscillator and recorder
      oscillator.start()
      recorder.start()

      // Record for 3 seconds
      setTimeout(() => {
        recorder.stop()
      }, 3000)
    } catch (err) {
      console.error("Error creating test tone:", err)
      setError(`Could not create test tone: ${err.message || "Unknown error"}`)
      setRecordingStatus("error")
      createStaticAudioFile()
    }
  }

  // Create a static audio file as a last resort
  const createStaticAudioFile = () => {
    try {
      addDebugLog("Creating static audio file...")
      setRecordingStatus("creating-static-file")

      // Create a simple audio file with a single sample
      const sampleRate = 44100
      const duration = 3 // seconds

      // Create an audio context
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()

      // Create a buffer for the audio data
      const buffer = audioContext.createBuffer(1, sampleRate * duration, sampleRate)

      // Fill the buffer with a simple sine wave
      const channelData = buffer.getChannelData(0)
      for (let i = 0; i < buffer.length; i++) {
        channelData[i] = Math.sin(i * 0.01) * 0.5
      }

      // Convert the buffer to a wav file
      const wavFile = bufferToWav(buffer, sampleRate)

      // Create a blob from the wav file
      const blob = new Blob([wavFile], { type: "audio/wav" })
      addDebugLog(`Static audio blob created: ${blob.size} bytes`)

      // Create a URL for the blob
      const url = URL.createObjectURL(blob)

      // Set the audio blob and URL
      setAudioBlob(blob)
      setAudioURL(url)
      setRecordingStatus("static-file-created")
    } catch (err) {
      console.error("Error creating static audio file:", err)
      setError(`Could not create audio file: ${err.message || "Unknown error"}`)
      setRecordingStatus("error")
    }
  }

  // Convert an audio buffer to a wav file
  const bufferToWav = (buffer: AudioBuffer, sampleRate: number) => {
    const numChannels = buffer.numberOfChannels
    const length = buffer.length * numChannels * 2
    const result = new ArrayBuffer(44 + length)
    const view = new DataView(result)

    // RIFF identifier
    writeString(view, 0, "RIFF")
    // file length
    view.setUint32(4, 36 + length, true)
    // RIFF type
    writeString(view, 8, "WAVE")
    // format chunk identifier
    writeString(view, 12, "fmt ")
    // format chunk length
    view.setUint32(16, 16, true)
    // sample format (raw)
    view.setUint16(20, 1, true)
    // channel count
    view.setUint16(22, numChannels, true)
    // sample rate
    view.setUint32(24, sampleRate, true)
    // byte rate (sample rate * block align)
    view.setUint32(28, sampleRate * 4, true)
    // block align (channel count * bytes per sample)
    view.setUint16(32, numChannels * 2, true)
    // bits per sample
    view.setUint16(34, 16, true)
    // data chunk identifier
    writeString(view, 36, "data")
    // data chunk length
    view.setUint32(40, length, true)

    // Write the PCM samples
    const channelData = []
    for (let i = 0; i < numChannels; i++) {
      channelData.push(buffer.getChannelData(i))
    }

    let offset = 44
    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < numChannels; channel++) {
        // Clamp the value to the 16-bit range
        const sample = Math.max(-1, Math.min(1, channelData[channel][i]))
        // Convert to 16-bit signed integer
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
        offset += 2
      }
    }

    return result
  }

  // Helper function to write a string to a DataView
  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i))
    }
  }

  // Start recording
  const startRecording = async () => {
    try {
      setError(null)
      setRecordingStatus("starting")
      addDebugLog("Starting recording...")

      // Reset any previous recording state
      audioChunksRef.current = []

      // Get audio stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })

      addDebugLog("Audio stream obtained")
      streamRef.current = stream

      // Create a recorder with specific mime type for better compatibility
      const options = { mimeType: "audio/webm" }
      let recorder

      try {
        recorder = new MediaRecorder(stream, options)
        addDebugLog("MediaRecorder created with audio/webm")
      } catch (e) {
        // Fallback if the preferred mime type is not supported
        addDebugLog("audio/webm not supported, trying without mime type")
        recorder = new MediaRecorder(stream)
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
        processAudioChunks()
      }

      // Set up error handling
      recorder.onerror = (event) => {
        addDebugLog(`MediaRecorder error: ${event.error}`)
        setError(`Recording error: ${event.error}`)
        setRecordingStatus("error")
      }

      // Start recording - request data every 100ms for smoother chunks
      recorder.start(100)
      addDebugLog("MediaRecorder started")
      setIsRecording(true)
      setRecordingStatus("recording")

      // Start timer for UI
      const interval = setInterval(() => {
        setRecordingTime((prev) => prev + 1)
      }, 1000)
      setTimerInterval(interval)
    } catch (err) {
      console.error("Error starting recording:", err)
      setError(`Could not start recording: ${err.message || "Unknown error"}`)
      setRecordingStatus("error")

      // Fall back to creating a test tone
      createTestToneAudio()
    }
  }

  // Stop recording
  const stopRecording = () => {
    try {
      addDebugLog("Stopping recording...")
      setRecordingStatus("stopping")

      // Clear timer
      if (timerInterval) {
        clearInterval(timerInterval)
        setTimerInterval(null)
      }

      setIsRecording(false)

      // Stop recorder if it exists and is recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        addDebugLog(`Stopping MediaRecorder in state: ${mediaRecorderRef.current.state}`)

        // Request final data chunk
        mediaRecorderRef.current.requestData()

        // Stop the recorder - this will trigger the onstop event
        mediaRecorderRef.current.stop()
        addDebugLog("MediaRecorder stop() called")
      } else {
        addDebugLog(`MediaRecorder was not in recording state: ${mediaRecorderRef.current?.state || "undefined"}`)
        // If recorder isn't in recording state, manually process chunks
        processAudioChunks()
      }

      // Stop all tracks in the stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          track.stop()
          addDebugLog(`Audio track stopped: ${track.kind}`)
        })
      }
    } catch (err) {
      console.error("Error stopping recording:", err)
      setError(`Error stopping recording: ${err.message || "Unknown error"}`)
      setRecordingStatus("error")

      // Fall back to creating a test tone
      createTestToneAudio()
    }
  }

  // Process the collected audio chunks
  const processAudioChunks = () => {
    try {
      addDebugLog(`Processing ${audioChunksRef.current.length} audio chunks`)
      setRecordingStatus("processing")

      // Check if we have any chunks
      if (audioChunksRef.current.length === 0) {
        addDebugLog("No audio chunks collected, creating test tone")
        createTestToneAudio()
        return
      }

      // Create blob from chunks with proper MIME type
      const mimeType = mediaRecorderRef.current?.mimeType || "audio/webm"
      const blob = new Blob(audioChunksRef.current, { type: mimeType })
      addDebugLog(`Created blob: ${blob.size} bytes, type: ${blob.type}`)

      // Validate the blob
      if (blob.size === 0) {
        addDebugLog("Created audio blob is empty, creating test tone")
        createTestToneAudio()
        return
      }

      // Create URL and set state
      const url = URL.createObjectURL(blob)
      setAudioBlob(blob)
      setAudioURL(url)
      addDebugLog("Audio URL created successfully")
      setRecordingStatus("ready")

      // Verify the recording duration matches what we tracked
      if (recordingTime > 0) {
        addDebugLog(`Recording duration: ${recordingTime} seconds`)
      } else {
        addDebugLog("Warning: Recording duration is 0 seconds")
      }
    } catch (err) {
      console.error("Error processing audio chunks:", err)
      setError(`Error processing recording: ${err.message || "Unknown error"}`)
      setRecordingStatus("error")

      // Fall back to creating a test tone
      createTestToneAudio()
    }
  }

  const resetRecording = () => {
    try {
      if (audioURL) {
        URL.revokeObjectURL(audioURL)
      }

      // Clean up any remaining resources
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }

      mediaRecorderRef.current = null
      audioChunksRef.current = []
    } catch (error) {
      console.error("Error resetting recording:", error)
    } finally {
      setAudioBlob(null)
      setAudioURL(null)
      setRecordingTime(0)
      setError(null)
      setDebugLog([])
      setRecordingStatus("idle")
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const handleSubmit = async () => {
    if (!audioBlob || !user || !assignment) {
      setError("Please record your recitation before submitting")
      return
    }

    // Verify the audio blob has content
    try {
      // Validate the audio blob
      if (!audioBlob) {
        setError("Please record or upload audio first")
        return
      }

      if (audioBlob.size === 0) {
        setError("The recording is empty. Please record your recitation again.")
        return
      }

      // Additional validation to ensure it's actually an audio blob
      const validAudioTypes = ["audio/webm", "audio/ogg", "audio/mp3", "audio/mpeg", "audio/wav"]
      const isValidAudioType = validAudioTypes.some(
        (type) => audioBlob.type.includes(type) || audioBlob.type.includes(type.split("/")[1]),
      )

      if (!isValidAudioType && audioBlob.type !== "") {
        addDebugLog(`Warning: Potentially invalid audio type: ${audioBlob.type}`)
        // We'll continue anyway but log the warning
      }
    } catch (validationError) {
      addDebugLog(`Error validating audio blob: ${validationError}`)
      setError("Invalid audio recording. Please try again.")
      return
    }

    console.log(`Submitting audio blob: ${audioBlob.size} bytes, type: ${audioBlob.type}`)
    setSubmitting(true)
    setError(null)

    try {
      const supabase = createClientComponentClient()

      // Find a valid bucket to use
      let bucketToUse = null
      let publicUrl = null

      // First check if we have any available buckets from our earlier check
      if (availableBuckets.length > 0) {
        // Use the first available bucket
        bucketToUse = availableBuckets[0]
      } else {
        // Try each bucket option until one works
        for (const bucketName of storageBucketOptions) {
          try {
            // Try to get bucket info to see if it exists
            const { data, error } = await supabase.storage.getBucket(bucketName)

            if (!error && data) {
              bucketToUse = bucketName
              break
            }
          } catch (err) {
            console.log(`Bucket ${bucketName} not available`)
          }
        }
      }

      if (!bucketToUse) {
        // If no bucket is available, try to save without storage
        console.warn("No storage buckets available, saving recitation without audio file")

        // Create recitation record in database without audio URL
        const { error: recitationError } = await supabase.from("recitations").insert({
          assignment_id: assignment.id,
          student_id: user.id,
          audio_url: null, // No audio URL since we couldn't upload
          submitted_at: new Date().toISOString(),
          is_latest: true, // Mark as the latest submission
        })

        if (recitationError) {
          throw new Error(`Failed to save recitation: ${recitationError.message}`)
        }

        // Set success state
        setSubmissionSuccess(true)

        // Redirect to dashboard with a message after a short delay
        setTimeout(() => {
          router.push("/dashboard?message=Recitation submitted without audio due to storage issues")
        }, 2000)
        return
      }

      // We have a valid bucket, proceed with upload
      console.log(`Using storage bucket: ${bucketToUse}`)

      // Determine file extension based on blob type
      let fileExtension = "webm"
      if (audioBlob.type.includes("mp4")) {
        fileExtension = "mp4"
      } else if (audioBlob.type.includes("ogg")) {
        fileExtension = "ogg"
      } else if (audioBlob.type.includes("wav")) {
        fileExtension = "wav"
      }

      // Upload audio file to Supabase Storage
      const fileName = `recitations/${user.id}/${assignment.id}/${Date.now()}.${fileExtension}`

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucketToUse)
        .upload(fileName, audioBlob, {
          contentType: audioBlob.type || "audio/webm",
        })

      if (uploadError) {
        throw new Error(`Failed to upload audio: ${uploadError.message}`)
      }

      // Get public URL for the uploaded file
      const { data } = supabase.storage.from(bucketToUse).getPublicUrl(fileName)
      publicUrl = data.publicUrl

      // If this is a resubmission, update all previous submissions to not be the latest
      if (previousSubmission) {
        const { error: updateError } = await supabase
          .from("recitations")
          .update({ is_latest: false })
          .eq("student_id", user.id)
          .eq("assignment_id", assignment.id)

        if (updateError) {
          console.error("Error updating previous submissions:", updateError)
        }
      }

      // Create recitation record in database
      const { error: recitationError } = await supabase.from("recitations").insert({
        assignment_id: assignment.id,
        student_id: user.id,
        audio_url: publicUrl,
        submitted_at: new Date().toISOString(),
        is_latest: true, // Mark as the latest submission
      })

      if (recitationError) {
        throw new Error(`Failed to save recitation: ${recitationError.message}`)
      }

      // Set success state
      setSubmissionSuccess(true)

      // Redirect to dashboard after a short delay
      setTimeout(() => {
        router.push("/assignments?message=Recitation submitted successfully")
      }, 2000)
    } catch (err: any) {
      console.error("Error submitting recitation:", err)
      setError(err.message || "Failed to submit recitation")
      setSubmitting(false)
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Stop any ongoing recording
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        try {
          mediaRecorderRef.current.stop()
        } catch (error) {
          console.error("Error stopping recording during cleanup:", error)
        }
      }

      // Stop any active media tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
      }

      // Clear any intervals
      if (timerInterval) {
        clearInterval(timerInterval)
      }

      // Release audio URL if it exists
      if (audioURL) {
        URL.revokeObjectURL(audioURL)
      }
    }
  }, [timerInterval, audioURL])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  if (error && !assignment) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-red-50 text-red-600 p-6 rounded-lg max-w-md w-full">
          <h2 className="text-lg font-semibold mb-2">Error</h2>
          <p className="mb-4">{error}</p>
          <Link
            href="/dashboard"
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors inline-block"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  const generateAssignmentTitle = (surahName: string, startAyah: number, endAyah: number) => {
    return `${surahName}, Ayah ${startAyah}-${endAyah}`
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center">
            <TaleemLogo className="h-8 w-auto text-purple-600 mr-2" />
            <h1 className="text-2xl font-bold text-foreground">Submit Recitation</h1>
          </div>
          <Link href="/dashboard" className="text-purple-600 hover:text-purple-800">
            Back to Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white shadow rounded-lg p-6">
          {assignment && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-foreground">
                {assignment.title ||
                  (assignment.surah_name && assignment.start_ayah && assignment.end_ayah
                    ? generateAssignmentTitle(assignment.surah_name, assignment.start_ayah, assignment.end_ayah)
                    : assignment.surah)}
              </h2>
              <p className="text-gray-600 mt-1">
                {assignment.surah_name ? (
                  <>
                    Surah: {assignment.surah_name.split(" (")[0].replace(/^\d+\.\s+/, "")}
                    {assignment.start_ayah && assignment.end_ayah && (
                      <>
                        , Ayahs: {assignment.start_ayah}-{assignment.end_ayah}
                      </>
                    )}
                  </>
                ) : (
                  <>Surah: {assignment.surah}</>
                )}
              </p>
              <p className="text-gray-600">
                Due: {new Date(assignment.due_date).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" })}
              </p>
            </div>
          )}

          {previousSubmission && (
            <div className="mb-6 bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div className="flex items-start">
                <AlertCircleIcon className="h-5 w-5 text-blue-500 mt-0.5 mr-2" />
                <div>
                  <h3 className="font-medium text-blue-800">You have already submitted this assignment</h3>
                  <p className="text-sm text-blue-700 mt-1">
                    Your previous submission was on{" "}
                    {new Date(previousSubmission.submitted_at).toLocaleString("en-US", {
                      timeZone: "America/Los_Angeles",
                    })}
                    . You can submit again to replace your previous submission.
                  </p>
                </div>
              </div>
            </div>
          )}

          {submissionSuccess && (
            <div className="mb-6 bg-green-50 p-4 rounded-lg border border-green-200">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-green-400"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-green-800">Submission Successful!</h3>
                  <div className="mt-2 text-sm text-green-700">
                    <p>Your recitation has been submitted successfully. Redirecting to assignments page...</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm mb-4">{error}</div>}

          <div className="space-y-6">
            <div className="bg-gray-50 p-6 rounded-lg">
              <h3 className="text-lg font-medium mb-4">Record Your Recitation</h3>

              {isRecording ? (
                <div className="text-center">
                  <div className="text-2xl font-mono mb-4 text-red-600">{formatTime(recordingTime)}</div>
                  <div className="animate-pulse mb-4 h-16 flex items-center justify-center">
                    <div className="bg-red-600 h-8 w-8 rounded-full"></div>
                  </div>
                  <button
                    onClick={stopRecording}
                    className="bg-red-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
                  >
                    Stop Recording
                  </button>
                </div>
              ) : audioURL ? (
                <div className="space-y-4">
                  <audio controls src={audioURL} className="w-full"></audio>
                  <div className="flex justify-center space-x-4">
                    <button
                      onClick={resetRecording}
                      className="bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
                    >
                      Record Again
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="bg-purple-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors disabled:opacity-70"
                    >
                      {submitting ? "Submitting..." : previousSubmission ? "Submit New Version" : "Submit Recitation"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-gray-600 mb-4">Click the button below to start recording your recitation</p>
                  <div className="space-y-4">
                    <button
                      onClick={startRecording}
                      className="bg-purple-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors"
                    >
                      Start Recording
                    </button>
                    <div>
                      <p className="text-sm text-gray-500">
                        Having trouble with recording? Try the alternatives below:
                      </p>
                      <div className="mt-2 flex justify-center space-x-4">
                        <button
                          onClick={createTestToneAudio}
                          className="text-purple-600 hover:text-purple-800 text-sm font-medium"
                        >
                          Create Test Tone
                        </button>
                        <button
                          onClick={createStaticAudioFile}
                          className="text-purple-600 hover:text-purple-800 text-sm font-medium"
                        >
                          Create Empty Audio
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-gray-50 p-6 rounded-lg">
              <h3 className="text-lg font-medium mb-2">Upload Audio File</h3>
              <p className="text-gray-600 mb-4">
                Alternatively, you can upload a pre-recorded audio file of your recitation
              </p>
              <input
                type="file"
                accept="audio/*"
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    // Reset any recording
                    if (audioURL) {
                      URL.revokeObjectURL(audioURL)
                    }

                    const url = URL.createObjectURL(file)
                    setAudioBlob(file)
                    setAudioURL(url)
                    setRecordingTime(0)
                    setRecordingStatus("ready")
                  }
                }}
              />
            </div>

            {/* Recording status indicator */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium mb-2">Recording Status</h3>
              <div className="flex items-center">
                <div
                  className={`w-3 h-3 rounded-full mr-2 ${
                    recordingStatus === "idle"
                      ? "bg-gray-400"
                      : recordingStatus === "recording"
                        ? "bg-red-500 animate-pulse"
                        : recordingStatus === "ready"
                          ? "bg-green-500"
                          : recordingStatus === "error"
                            ? "bg-red-500"
                            : "bg-yellow-500"
                  }`}
                ></div>
                <span className="text-sm text-gray-700">
                  {recordingStatus === "idle"
                    ? "Ready to record"
                    : recordingStatus === "starting"
                      ? "Starting recording..."
                      : recordingStatus === "recording"
                        ? "Recording in progress"
                        : recordingStatus === "stopping"
                          ? "Stopping recording..."
                          : recordingStatus === "processing"
                            ? "Processing audio..."
                            : recordingStatus === "ready"
                              ? "Audio ready"
                              : recordingStatus === "creating-test-tone"
                                ? "Creating test tone..."
                                : recordingStatus === "test-tone-created"
                                  ? "Test tone created"
                                  : recordingStatus === "creating-static-file"
                                    ? "Creating static audio..."
                                    : recordingStatus === "static-file-created"
                                      ? "Static audio created"
                                      : recordingStatus === "error"
                                        ? "Error recording audio"
                                        : "Unknown status"}
                </span>
              </div>
            </div>

            {/* Debug log display */}
            {debugLog.length > 0 && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <details>
                  <summary className="text-sm font-medium cursor-pointer">Debug Information</summary>
                  <div className="mt-2 text-xs font-mono whitespace-pre-wrap max-h-60 overflow-y-auto">
                    {debugLog.map((log, index) => (
                      <div key={index} className="py-1 border-b border-gray-100">
                        {log}
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
