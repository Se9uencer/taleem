"use client"

import { useEffect, useState } from "react"
import { createClientComponentClient } from "@/lib/supabase/client"
import { formatDatePST } from "@/lib/date-utils"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertCircle, BookOpen, Calendar, CheckCircle, Clock, XCircle, School } from "lucide-react"

interface ChildProgressViewProps {
  childId: string
}

export function ChildProgressView({ childId }: ChildProgressViewProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [assignments, setAssignments] = useState<any[]>([])
  const [recitations, setRecitations] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState("all")

  useEffect(() => {
    async function fetchChildProgress() {
      setLoading(true)
      setError(null)

      try {
        const supabase = createClientComponentClient()

        // Fetch assignments for this child
        const { data: assignmentStudents, error: assignmentError } = await supabase
          .from("assignment_students")
          .select("assignment_id")
          .eq("student_id", childId)

        if (assignmentError) {
          throw new Error(`Error fetching assignments: ${assignmentError.message}`)
        }

        if (!assignmentStudents || assignmentStudents.length === 0) {
          setAssignments([])
          setRecitations([])
          setLoading(false)
          return
        }

        // Get assignment IDs
        const assignmentIds = assignmentStudents.map((as) => as.assignment_id)

        // Fetch assignment details
        const { data: assignmentsData, error: assignmentsDataError } = await supabase
          .from("assignments")
          .select(`
            id, 
            title, 
            surah, 
            surah_name,
            start_ayah, 
            end_ayah, 
            due_date,
            class_id,
            classes(name)
          `)
          .in("id", assignmentIds)
          .order("due_date", { ascending: false })

        if (assignmentsDataError) {
          throw new Error(`Error fetching assignment details: ${assignmentsDataError.message}`)
        }

        // Fetch recitations (submissions) for these assignments
        const { data: recitationsData, error: recitationsError } = await supabase
          .from("recitations")
          .select(`
            id,
            assignment_id,
            submitted_at,
            audio_url,
            is_latest,
            feedback(id, accuracy, notes)
          `)
          .eq("student_id", childId)
          .order("submitted_at", { ascending: false })

        if (recitationsError) {
          throw new Error(`Error fetching recitations: ${recitationsError.message}`)
        }

        // Process assignments with submission status
        const processedAssignments = assignmentsData.map((assignment) => {
          // Find all recitations for this assignment
          const assignmentRecitations = recitationsData.filter((r) => r.assignment_id === assignment.id)

          // Find the latest recitation
          const latestRecitation = assignmentRecitations.find((r) => r.is_latest)

          // Determine status
          let status = "Not Submitted"
          if (latestRecitation) {
            status = latestRecitation.feedback ? "Graded" : "Submitted"
          }

          return {
            ...assignment,
            status,
            latestRecitation,
            allRecitations: assignmentRecitations,
            isPastDue: new Date(assignment.due_date) < new Date(),
          }
        })

        setAssignments(processedAssignments)
        setRecitations(recitationsData)
      } catch (err: any) {
        console.error("Error fetching child progress:", err)
        setError(err.message || "An unexpected error occurred")
      } finally {
        setLoading(false)
      }
    }

    fetchChildProgress()
  }, [childId])

  const getFilteredAssignments = () => {
    switch (activeTab) {
      case "pending":
        return assignments.filter((a) => a.status === "Not Submitted" && !a.isPastDue)
      case "submitted":
        return assignments.filter((a) => a.status === "Submitted")
      case "graded":
        return assignments.filter((a) => a.status === "Graded")
      case "overdue":
        return assignments.filter((a) => a.status === "Not Submitted" && a.isPastDue)
      default:
        return assignments
    }
  }

  const getStatusIcon = (status: string, isPastDue: boolean) => {
    if (status === "Not Submitted" && isPastDue) {
      return <XCircle className="h-5 w-5 text-red-500" />
    }

    switch (status) {
      case "Graded":
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case "Submitted":
        return <Clock className="h-5 w-5 text-blue-500" />
      case "Not Submitted":
        return <AlertCircle className="h-5 w-5 text-amber-500" />
      default:
        return null
    }
  }

  const getStatusClass = (status: string, isPastDue: boolean) => {
    if (status === "Not Submitted" && isPastDue) {
      return "bg-red-50 text-red-700"
    }

    switch (status) {
      case "Graded":
        return "bg-green-50 text-green-700"
      case "Submitted":
        return "bg-blue-50 text-blue-700"
      case "Not Submitted":
        return "bg-amber-50 text-amber-700"
      default:
        return "bg-gray-50 text-gray-700"
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-700 p-4 rounded-md">
        <h3 className="font-medium mb-2">Error loading progress</h3>
        <p>{error}</p>
      </div>
    )
  }

  if (assignments.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No assignments found for this student.</p>
      </div>
    )
  }

  const filteredAssignments = getFilteredAssignments()

  return (
    <div className="space-y-6">
      <Tabs defaultValue="all" onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="all">All Assignments ({assignments.length})</TabsTrigger>
          <TabsTrigger value="pending">
            Pending ({assignments.filter((a) => a.status === "Not Submitted" && !a.isPastDue).length})
          </TabsTrigger>
          <TabsTrigger value="submitted">
            Submitted ({assignments.filter((a) => a.status === "Submitted").length})
          </TabsTrigger>
          <TabsTrigger value="graded">Graded ({assignments.filter((a) => a.status === "Graded").length})</TabsTrigger>
          <TabsTrigger value="overdue">
            Overdue ({assignments.filter((a) => a.status === "Not Submitted" && a.isPastDue).length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4">
          {filteredAssignments.length === 0 ? (
            <p className="text-center text-gray-500 py-4">No assignments in this category</p>
          ) : (
            filteredAssignments.map((assignment) => (
              <Card key={assignment.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="p-4 border-b">
                    <div className="flex justify-between items-start">
                      <h3 className="font-medium">
                        {assignment.title ||
                          `Memorize ${assignment.surah_name?.split(" (")[0].replace(/^\d+\.\s+/, "") || assignment.surah} ${
                            assignment.start_ayah && assignment.end_ayah
                              ? `Ayahs ${assignment.start_ayah}-${assignment.end_ayah}`
                              : ""
                          }`}
                      </h3>
                      <div
                        className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${getStatusClass(assignment.status, assignment.isPastDue)}`}
                      >
                        {getStatusIcon(assignment.status, assignment.isPastDue)}
                        <span>
                          {assignment.status === "Not Submitted" && assignment.isPastDue
                            ? "Overdue"
                            : assignment.status}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      <div className="flex items-center gap-1.5">
                        <BookOpen className="h-4 w-4 text-purple-500" />
                        <span>
                          {assignment.surah_name
                            ? `${assignment.surah_name.split(" (")[0].replace(/^\d+\.\s+/, "")}`
                            : assignment.surah}
                          {assignment.start_ayah &&
                            assignment.end_ayah &&
                            ` (Ayahs ${assignment.start_ayah}-${assignment.end_ayah})`}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-4 w-4 text-purple-500" />
                        <span>Due: {formatDatePST(assignment.due_date)}</span>
                      </div>

                      {assignment.classes && (
                        <div className="flex items-center gap-1.5">
                          <School className="h-4 w-4 text-purple-500" />
                          <span>Class: {assignment.classes.name}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {assignment.latestRecitation && (
                    <div className="p-4 bg-gray-50">
                      <h4 className="text-sm font-medium mb-2">Latest Submission</h4>
                      <div className="space-y-3">
                        <div className="text-sm">
                          Submitted:{" "}
                          {formatDatePST(assignment.latestRecitation.submitted_at, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </div>

                        {assignment.latestRecitation.audio_url && (
                          <div>
                            <audio controls src={assignment.latestRecitation.audio_url} className="w-full h-10">
                              Your browser does not support the audio element.
                            </audio>
                          </div>
                        )}

                        {assignment.latestRecitation.feedback && (
                          <div className="bg-white p-3 rounded-md border">
                            <h5 className="text-sm font-medium mb-1">Teacher Feedback</h5>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-sm font-medium">Accuracy:</span>
                              <div className="bg-gray-200 h-2 rounded-full flex-1 max-w-xs">
                                <div
                                  className="bg-green-500 h-2 rounded-full"
                                  style={{
                                    width: `${Math.round(assignment.latestRecitation.feedback.accuracy * 100)}%`,
                                  }}
                                ></div>
                              </div>
                              <span className="text-sm">
                                {Math.round(assignment.latestRecitation.feedback.accuracy * 100)}%
                              </span>
                            </div>

                            {assignment.latestRecitation.feedback.notes && (
                              <div className="text-sm">
                                <span className="font-medium">Notes:</span>
                                <p className="mt-1 text-gray-700">{assignment.latestRecitation.feedback.notes}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
