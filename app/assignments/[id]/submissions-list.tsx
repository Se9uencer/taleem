"use client"

import { useState, useEffect } from "react"
import { createClientComponentClient } from "@/lib/supabase/client"
import { CheckCircleIcon, XCircleIcon, ClockIcon, PencilIcon, PlayIcon, PauseIcon, HistoryIcon } from "lucide-react"
// Import the date utility functions
import { formatDateTimePST } from "@/lib/date-utils"

interface Submission {
  id: string
  student_id: string
  assignment_id: string
  audio_url: string
  submitted_at: string
  is_latest: boolean
  student_name: string
  student_email: string
  feedback?: {
    id: string
    accuracy: number
    notes: string
  }
}

interface StudentSubmissions {
  student_id: string
  student_name: string
  student_email: string
  submissions: Submission[]
  latest_submission: Submission
  has_submitted: boolean
}

export default function SubmissionsList({
  assignmentId,
  dueDate,
}: {
  assignmentId: string
  dueDate: string
}) {
  const [studentSubmissions, setStudentSubmissions] = useState<StudentSubmissions[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingFeedback, setEditingFeedback] = useState<string | null>(null)
  const [feedbackData, setFeedbackData] = useState<{ accuracy: number; notes: string }>({
    accuracy: 0,
    notes: "",
  })
  const [savingFeedback, setSavingFeedback] = useState(false)
  const [playingAudio, setPlayingAudio] = useState<string | null>(null)
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null)
  const [totalStudents, setTotalStudents] = useState(0)
  const [uniqueSubmissions, setUniqueSubmissions] = useState(0)

  // Fix the query in the useEffect to remove the non-existent transcript column
  useEffect(() => {
    const loadSubmissions = async () => {
      try {
        setLoading(true)
        const supabase = createClientComponentClient()

        // First, get all students assigned to this assignment
        const { data: assignedStudents, error: assignedError } = await supabase
          .from("assignment_students")
          .select("student_id")
          .eq("assignment_id", assignmentId)

        if (assignedError) {
          throw assignedError
        }

        setTotalStudents(assignedStudents?.length || 0)

        // Get all student IDs
        const studentIds = assignedStudents?.map((s) => s.student_id) || []

        // Fetch student profiles
        const { data: studentProfiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, email")
          .in("id", studentIds)

        if (profilesError) {
          throw profilesError
        }

        // Create a map of student IDs to names
        const studentMap = (studentProfiles || []).reduce((map, student) => {
          map[student.id] = {
            name: `${student.first_name} ${student.last_name}`,
            email: student.email,
          }
          return map
        }, {})

        // Fetch all recitations for this assignment with feedback
        // FIXED: Removed transcript from feedback selection
        const { data: recitations, error: recitationsError } = await supabase
          .from("recitations")
          .select(`
          id, 
          student_id, 
          assignment_id, 
          audio_url, 
          submitted_at,
          is_latest,
          feedback (
            id,
            accuracy,
            notes
          )
        `)
          .eq("assignment_id", assignmentId)
          .order("submitted_at", { ascending: false })

        if (recitationsError) {
          throw recitationsError
        }

        // Group submissions by student
        const submissionsByStudent: Record<string, Submission[]> = {}

        // Process all recitations
        recitations?.forEach((submission) => {
          if (!submissionsByStudent[submission.student_id]) {
            submissionsByStudent[submission.student_id] = []
          }

          submissionsByStudent[submission.student_id].push({
            ...submission,
            student_name: studentMap[submission.student_id]?.name || "Unknown Student",
            student_email: studentMap[submission.student_id]?.email || "",
          })
        })

        // Count unique students who submitted
        const uniqueStudentCount = Object.keys(submissionsByStudent).length
        setUniqueSubmissions(uniqueStudentCount)

        // Create the final student submissions array
        const studentSubmissionsArray: StudentSubmissions[] = []

        // First add students who have submitted
        Object.keys(submissionsByStudent).forEach((studentId) => {
          const submissions = submissionsByStudent[studentId]
          const latestSubmission = submissions.find((s) => s.is_latest) || submissions[0]

          studentSubmissionsArray.push({
            student_id: studentId,
            student_name: studentMap[studentId]?.name || "Unknown Student",
            student_email: studentMap[studentId]?.email || "",
            submissions: submissions,
            latest_submission: latestSubmission,
            has_submitted: true,
          })
        })

        // Then add students who haven't submitted
        studentIds.forEach((studentId) => {
          if (!submissionsByStudent[studentId]) {
            studentSubmissionsArray.push({
              student_id: studentId,
              student_name: studentMap[studentId]?.name || "Unknown Student",
              student_email: studentMap[studentId]?.email || "",
              submissions: [],
              latest_submission: null,
              has_submitted: false,
            })
          }
        })

        // Sort by submission status (submitted first) and then by name
        studentSubmissionsArray.sort((a, b) => {
          if (a.has_submitted && !b.has_submitted) return -1
          if (!a.has_submitted && b.has_submitted) return 1
          return a.student_name.localeCompare(b.student_name)
        })

        setStudentSubmissions(studentSubmissionsArray)
      } catch (err: any) {
        console.error("Error loading submissions:", err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    if (assignmentId) {
      loadSubmissions()
    }
  }, [assignmentId])

  const isSubmissionLate = (submittedAt: string) => {
    // Convert both dates to PST for comparison
    const submittedDate = new Date(submittedAt)
    const dueDateTime = new Date(dueDate)

    // Convert both dates to PST strings and then back to Date objects for comparison
    const submittedPST = new Date(submittedDate.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }))
    const duePST = new Date(dueDateTime.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }))

    return submittedPST > duePST
  }

  const formatDate = (dateString: string) => {
    return formatDateTimePST(dateString)
  }

  const handleEditFeedback = (submission: Submission) => {
    setEditingFeedback(submission.id)
    setFeedbackData({
      accuracy: submission.feedback?.accuracy || 0,
      notes: submission.feedback?.notes || "",
    })
  }

  const handleSaveFeedback = async (submissionId: string, studentId: string) => {
    try {
      setSavingFeedback(true)
      const supabase = createClientComponentClient()

      // Find the student and submission
      const studentIndex = studentSubmissions.findIndex((s) => s.student_id === studentId)
      if (studentIndex === -1) return

      const student = studentSubmissions[studentIndex]
      const submission = student.submissions.find((s) => s.id === submissionId)
      if (!submission) return

      if (submission.feedback) {
        // Update existing feedback
        const { error } = await supabase
          .from("feedback")
          .update({
            accuracy: feedbackData.accuracy,
            notes: feedbackData.notes,
          })
          .eq("id", submission.feedback.id)

        if (error) throw error
      } else {
        // Create new feedback
        const { error } = await supabase.from("feedback").insert({
          recitation_id: submissionId,
          accuracy: feedbackData.accuracy,
          notes: feedbackData.notes,
        })

        if (error) throw error
      }

      // Update the local state
      const updatedStudentSubmissions = [...studentSubmissions]
      const updatedStudent = { ...student }

      // Update the submission in the submissions array
      updatedStudent.submissions = updatedStudent.submissions.map((s) => {
        if (s.id === submissionId) {
          return {
            ...s,
            feedback: {
              id: s.feedback?.id || "temp-id",
              accuracy: feedbackData.accuracy,
              notes: feedbackData.notes,
            },
          }
        }
        return s
      })

      // If this is the latest submission, update that too
      if (updatedStudent.latest_submission?.id === submissionId) {
        updatedStudent.latest_submission = {
          ...updatedStudent.latest_submission,
          feedback: {
            id: updatedStudent.latest_submission.feedback?.id || "temp-id",
            accuracy: feedbackData.accuracy,
            notes: feedbackData.notes,
          },
        }
      }

      updatedStudentSubmissions[studentIndex] = updatedStudent
      setStudentSubmissions(updatedStudentSubmissions)

      setEditingFeedback(null)
    } catch (err: any) {
      console.error("Error saving feedback:", err)
      alert("Failed to save feedback. Please try again.")
    } finally {
      setSavingFeedback(false)
    }
  }

  const handleCancelEdit = () => {
    setEditingFeedback(null)
  }

  const handlePlayAudio = (submissionId: string) => {
    if (playingAudio === submissionId) {
      // Pause the currently playing audio
      const audioElement = document.getElementById(`audio-${submissionId}`) as HTMLAudioElement
      if (audioElement) {
        audioElement.pause()
      }
      setPlayingAudio(null)
    } else {
      // Pause any currently playing audio
      if (playingAudio) {
        const currentAudio = document.getElementById(`audio-${playingAudio}`) as HTMLAudioElement
        if (currentAudio) {
          currentAudio.pause()
        }
      }

      // Play the new audio
      const audioElement = document.getElementById(`audio-${submissionId}`) as HTMLAudioElement
      if (audioElement) {
        audioElement.play()

        // Set up event listener to update state when audio ends
        audioElement.onended = () => {
          setPlayingAudio(null)
        }
      }
      setPlayingAudio(submissionId)
    }
  }

  const toggleStudentHistory = (studentId: string) => {
    if (expandedStudent === studentId) {
      setExpandedStudent(null)
    } else {
      setExpandedStudent(studentId)
    }
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-purple-500 border-r-transparent"></div>
        <p className="mt-2 text-gray-600">Loading submissions...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-600 p-4 rounded-md">
        <p>Error loading submissions: {error}</p>
      </div>
    )
  }

  if (studentSubmissions.length === 0) {
    return (
      <div className="text-center py-8 bg-gray-50 rounded-lg">
        <p className="text-gray-500">No students assigned to this assignment yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-gray-50 p-4 rounded-lg mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="font-medium">Submission Status</h3>
            <p className="text-sm text-gray-600 mt-1">
              {uniqueSubmissions} of {totalStudents} students have submitted (
              {Math.round((uniqueSubmissions / totalStudents) * 100)}% completion)
            </p>
          </div>
        </div>
      </div>

      {studentSubmissions.map((student) => (
        <div key={student.student_id} className="border rounded-lg overflow-hidden shadow-sm">
          <div
            className={`p-4 ${student.has_submitted ? "bg-gray-50" : "bg-red-50"} border-b flex justify-between items-center`}
          >
            <div>
              <h4 className="font-medium text-lg">{student.student_name}</h4>
              <p className="text-sm text-gray-600">{student.student_email}</p>
            </div>
            <div className="flex flex-col items-end">
              {student.has_submitted ? (
                <>
                  <div className="flex items-center">
                    <ClockIcon className="h-4 w-4 text-gray-500 mr-1" />
                    <span className="text-sm text-gray-600">
                      Latest: {formatDate(student.latest_submission.submitted_at)}
                    </span>
                  </div>
                  <div className="flex items-center mt-1">
                    {isSubmissionLate(student.latest_submission.submitted_at) ? (
                      <>
                        <XCircleIcon className="h-4 w-4 text-red-500 mr-1" />
                        <span className="text-xs text-red-600">Late submission</span>
                      </>
                    ) : (
                      <>
                        <CheckCircleIcon className="h-4 w-4 text-green-500 mr-1" />
                        <span className="text-xs text-green-600">On time</span>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex items-center">
                  <XCircleIcon className="h-4 w-4 text-red-500 mr-1" />
                  <span className="text-sm text-red-600">Not submitted</span>
                </div>
              )}
            </div>
          </div>

          {student.has_submitted && (
            <div className="p-4">
              {/* Latest submission */}
              <div className="mb-4">
                <div className="flex justify-between items-center mb-2">
                  <h5 className="text-sm font-medium text-gray-700">Latest Recitation</h5>
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
                <div className="flex items-center bg-gray-100 p-3 rounded-md">
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
                  <span className="text-sm text-gray-600">
                    {playingAudio === student.latest_submission.id ? "Playing..." : "Click to play recording"}
                  </span>
                </div>
              </div>

              {/* Submission history */}
              {expandedStudent === student.student_id && student.submissions.length > 1 && (
                <div className="mb-4 border-t pt-4">
                  <h5 className="text-sm font-medium text-gray-700 mb-2">Submission History</h5>
                  <div className="space-y-3">
                    {student.submissions
                      .filter((s) => s.id !== student.latest_submission.id)
                      .map((submission) => (
                        <div key={submission.id} className="bg-gray-50 p-3 rounded-md border">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs text-gray-600">
                              Submitted: {formatDate(submission.submitted_at)}
                            </span>
                            <span
                              className={`text-xs ${isSubmissionLate(submission.submitted_at) ? "text-red-600" : "text-green-600"}`}
                            >
                              {isSubmissionLate(submission.submitted_at) ? "Late" : "On time"}
                            </span>
                          </div>
                          <div className="flex items-center">
                            <button
                              onClick={() => handlePlayAudio(submission.id)}
                              className="mr-3 p-2 bg-gray-300 text-gray-700 rounded-full hover:bg-gray-400 focus:outline-none"
                              aria-label={playingAudio === submission.id ? "Pause audio" : "Play audio"}
                            >
                              {playingAudio === submission.id ? (
                                <PauseIcon className="h-3 w-3" />
                              ) : (
                                <PlayIcon className="h-3 w-3" />
                              )}
                            </button>
                            <audio
                              id={`audio-${submission.id}`}
                              src={submission.audio_url}
                              className="hidden"
                              onEnded={() => setPlayingAudio(null)}
                            />
                            <span className="text-xs text-gray-600">
                              {playingAudio === submission.id ? "Playing..." : "Previous version"}
                            </span>
                          </div>
                          {submission.feedback && (
                            <div className="mt-2 pt-2 border-t border-gray-200">
                              <div className="flex items-center mb-1">
                                <span className="text-xs font-medium">Previous Feedback:</span>
                                <span className="ml-2 text-xs">{Math.round(submission.feedback.accuracy * 100)}%</span>
                              </div>
                              {submission.feedback.notes && (
                                <p className="text-xs text-gray-700">{submission.feedback.notes}</p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Feedback section */}
              <div className="border-t pt-4">
                <div className="flex justify-between items-center mb-2">
                  <h5 className="text-sm font-medium text-gray-700">Feedback</h5>
                  {editingFeedback !== student.latest_submission.id && (
                    <button
                      onClick={() => handleEditFeedback(student.latest_submission)}
                      className="text-purple-600 hover:text-purple-800 text-sm flex items-center"
                    >
                      <PencilIcon className="h-3 w-3 mr-1" />
                      {student.latest_submission.feedback ? "Edit Feedback" : "Add Feedback"}
                    </button>
                  )}
                </div>

                {editingFeedback === student.latest_submission.id ? (
                  <div className="bg-gray-50 p-3 rounded-md">
                    <div className="mb-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Accuracy (0-100%)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={Math.round(feedbackData.accuracy * 100)}
                        onChange={(e) =>
                          setFeedbackData({
                            ...feedbackData,
                            accuracy: Number(e.target.value) / 100,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                      />
                    </div>
                    <div className="mb-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                      <textarea
                        value={feedbackData.notes}
                        onChange={(e) =>
                          setFeedbackData({
                            ...feedbackData,
                            notes: e.target.value,
                          })
                        }
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                      />
                    </div>
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={handleCancelEdit}
                        className="px-3 py-1 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50"
                        disabled={savingFeedback}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSaveFeedback(student.latest_submission.id, student.student_id)}
                        className="px-3 py-1 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
                        disabled={savingFeedback}
                      >
                        {savingFeedback ? "Saving..." : "Save Feedback"}
                      </button>
                    </div>
                  </div>
                ) : student.latest_submission.feedback ? (
                  <div className="bg-gray-50 p-3 rounded-md">
                    <div className="flex items-center mb-2">
                      <span className="font-medium text-sm">Accuracy:</span>
                      <div className="ml-2 bg-gray-200 h-2 rounded-full w-full max-w-xs">
                        <div
                          className="bg-purple-600 h-2 rounded-full"
                          style={{ width: `${Math.round(student.latest_submission.feedback.accuracy * 100)}%` }}
                        ></div>
                      </div>
                      <span className="ml-2 text-sm">
                        {Math.round(student.latest_submission.feedback.accuracy * 100)}%
                      </span>
                    </div>
                    {student.latest_submission.feedback.notes && (
                      <div>
                        <span className="font-medium text-sm">Notes:</span>
                        <p className="text-sm mt-1 text-gray-700">{student.latest_submission.feedback.notes}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 italic">No feedback provided yet.</p>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
