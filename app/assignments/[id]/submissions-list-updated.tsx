"use client"

import { useState } from "react"
import { PlayIcon, PauseIcon, HistoryIcon, BrainIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { RecitationFeedback } from "@/components/recitation-feedback"

// ... [keep the existing interfaces] ...

export default function SubmissionsList({
  assignmentId,
  dueDate,
}: {
  assignmentId: string
  dueDate: string
}) {
  // ... [keep the existing state variables] ...
  const [viewingFeedback, setViewingFeedback] = useState<string | null>(null)
  const [studentSubmissions, setStudentSubmissions] = useState([])
  const [expandedStudent, setExpandedStudent] = useState(null)
  const [playingAudio, setPlayingAudio] = useState(null)

  const toggleStudentHistory = (studentId) => {
    setExpandedStudent(expandedStudent === studentId ? null : studentId)
  }

  const handlePlayAudio = (submissionId) => {
    if (playingAudio === submissionId) {
      const audio = document.getElementById(`audio-${submissionId}`) as HTMLAudioElement
      audio.pause()
      setPlayingAudio(null)
    } else {
      if (playingAudio) {
        const prevAudio = document.getElementById(`audio-${playingAudio}`) as HTMLAudioElement
        prevAudio.pause()
      }
      const audio = document.getElementById(`audio-${submissionId}`) as HTMLAudioElement
      audio.play()
      setPlayingAudio(submissionId)
    }
  }

  // ... [keep the existing useEffect and helper functions] ...

  return (
    <div className="space-y-6">
      {/* ... [keep the existing status section] ... */}

      {studentSubmissions.map((student) => (
        <div key={student.student_id} className="border rounded-lg overflow-hidden shadow-sm">
          {/* ... [keep the existing student header section] ... */}

          {student.has_submitted && (
            <div className="p-4">
              {/* Latest submission */}
              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <h5 className="text-sm font-medium text-foreground">Latest Recitation</h5>
                  {student.submissions.length > 1 && (
                    <button
                      onClick={() => toggleStudentHistory(student.student_id)}
                      className="text-purple-600 hover:text-purple-800 text-sm flex items-center"
                    >
                      <HistoryIcon className="h-3 w-3 mr-1" />
                      {expandedStudent === student.student_id ? "Hide History" : "Show History"} (
                      {student.submissions.length} versions)
                    </button>
                  )}
                </div>
                <div className="flex items-center bg-gray-100 dark:bg-gray-800 p-3 rounded-md">
                  <button
                    onClick={() => handlePlayAudio(student.latest_submission.id)}
                    className="mr-3 p-2 bg-purple-600 text-white rounded-full hover:bg-purple-700 focus:outline-none"
                    aria-label={playingAudio === student.latest_submission.id ? "Pause audio" : "Play audio"}
                  >
                    {playingAudio === student.latest_submission.id ? (
                      <PauseIcon className="h-4 w-4" />
                    ) : (
                      <PlayIcon className="h-4 w-4" />
                    )}
                  </button>
                  <audio
                    id={`audio-${student.latest_submission.id}`}
                    src={student.latest_submission.audio_url}
                    className="hidden"
                    onEnded={() => setPlayingAudio(null)}
                  />
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {playingAudio === student.latest_submission.id ? "Playing..." : "Click to play recording"}
                  </span>

                  {/* AI Feedback Button */}
                  <div className="ml-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex items-center"
                      onClick={() =>
                        setViewingFeedback(
                          viewingFeedback === student.latest_submission.id ? null : student.latest_submission.id,
                        )
                      }
                    >
                      <BrainIcon className="h-3 w-3 mr-1" />
                      {viewingFeedback === student.latest_submission.id ? "Hide AI Feedback" : "View AI Feedback"}
                    </Button>
                  </div>
                </div>

                {/* AI Feedback Display */}
                {viewingFeedback === student.latest_submission.id && (
                  <div className="mt-4">
                    <RecitationFeedback recitationId={student.latest_submission.id} />
                  </div>
                )}
              </div>

              {/* ... [keep the existing submission history section] ... */}

              {/* ... [keep the existing feedback section] ... */}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
