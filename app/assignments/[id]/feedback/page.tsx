"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { createClientComponentClient } from "@/lib/supabase/client"
import AuthenticatedLayout from "@/components/authenticated-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { BookOpen, Calendar, Clock, ArrowLeft, Headphones, BarChart2, FileText, AlertTriangle } from "lucide-react"
import { formatDatePST } from "@/lib/date-utils"

export default function AssignmentFeedbackPage() {
  const [assignment, setAssignment] = useState<any>(null)
  const [recitation, setRecitation] = useState<any>(null)
  const [feedback, setFeedback] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<any>(null)

  const params = useParams()
  const router = useRouter()
  const assignmentId = params.id as string

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        const supabase = createClientComponentClient()

        // Check if user is authenticated
        const { data: sessionData } = await supabase.auth.getSession()

        if (!sessionData.session) {
          router.push("/login")
          return
        }

        const userId = sessionData.session.user.id

        // Get user profile
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .single()

        if (profileError || !profileData) {
          throw new Error("Failed to load profile")
        }

        // Verify user is a student
        if (profileData.role !== "student") {
          router.push("/dashboard")
          return
        }

        setProfile(profileData)

        // Fetch assignment details
        const { data: assignmentData, error: assignmentError } = await supabase
          .from("assignments")
          .select(`
            id, 
            title, 
            surah, 
            surah_name,
            start_ayah, 
            end_ayah, 
            due_date,
            created_at,
            class_id,
            classes(id, name, grade_level)
          `)
          .eq("id", assignmentId)
          .single()

        if (assignmentError || !assignmentData) {
          throw new Error("Assignment not found")
        }

        // Verify assignment is assigned to this student
        const { data: assignmentStudent, error: assignmentStudentError } = await supabase
          .from("assignment_students")
          .select("*")
          .eq("assignment_id", assignmentId)
          .eq("student_id", userId)
          .single()

        if (assignmentStudentError || !assignmentStudent) {
          throw new Error("You don't have access to this assignment")
        }

        setAssignment(assignmentData)

        // Fetch recitation - FIXED: Removed transcript from feedback selection
        const { data: recitationData, error: recitationError } = await supabase
          .from("recitations")
          .select(`
            id,
            assignment_id,
            submitted_at,
            audio_url,
            is_latest,
            feedback(id, accuracy, notes)
          `)
          .eq("assignment_id", assignmentId)
          .eq("student_id", userId)
          .eq("is_latest", true)
          .single()

        if (recitationError || !recitationData) {
          throw new Error("No submission found for this assignment")
        }

        setRecitation(recitationData)
        setFeedback(recitationData.feedback)
      } catch (error: any) {
        console.error("Error loading assignment feedback:", error)
        setError(error.message)
      } finally {
        setLoading(false)
      }
    }

    if (assignmentId) {
      loadData()
    }
  }, [assignmentId, router])

  // Helper function to generate assignment title
  const generateAssignmentTitle = (surahName: string, startAyah: number, endAyah: number) => {
    if (!surahName) return "Assignment"

    // Extract just the surah name without the number and parentheses
    const surahNameOnly = surahName.replace(/^\d+\.\s+/, "").split(" (")[0]

    if (startAyah === endAyah) {
      return `${surahNameOnly} - Ayah ${startAyah}`
    }
    return `${surahNameOnly} - Ayahs ${startAyah}-${endAyah}`
  }

  // Format date to display in a readable format
  const formatDate = (dateString: string) => {
    return formatDatePST(dateString)
  }

  if (loading) {
    return (
      <AuthenticatedLayout>
        <div className="flex justify-center items-center h-64">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        </div>
      </AuthenticatedLayout>
    )
  }

  if (error) {
    return (
      <AuthenticatedLayout>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Error</h2>
            <p className="text-muted-foreground mb-6">{error}</p>
            <Button onClick={() => router.push("/assignments")} variant="outline">
              Back to Assignments
            </Button>
          </div>
        </div>
      </AuthenticatedLayout>
    )
  }

  if (!assignment || !recitation) {
    return (
      <AuthenticatedLayout>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-muted rounded-lg p-6 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">Assignment Not Found</h2>
            <p className="text-muted-foreground mb-6">
              The assignment you're looking for doesn't exist or you haven't submitted it yet.
            </p>
            <Button onClick={() => router.push("/assignments")} variant="outline">
              Back to Assignments
            </Button>
          </div>
        </div>
      </AuthenticatedLayout>
    )
  }

  return (
    <AuthenticatedLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => router.push("/assignments")}
            className="mb-4 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Assignments
          </Button>

          <h1 className="text-2xl font-bold text-foreground">Recitation Feedback</h1>
          <p className="text-muted-foreground mt-1">Review your performance and feedback for this assignment</p>
        </div>

        <div className="space-y-6">
          {/* Assignment Details */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xl">Assignment Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <BookOpen className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h3 className="font-medium text-foreground">
                      {assignment.title ||
                        (assignment.surah_name && assignment.start_ayah && assignment.end_ayah
                          ? generateAssignmentTitle(assignment.surah_name, assignment.start_ayah, assignment.end_ayah)
                          : assignment.surah)}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {assignment.surah_name
                        ? assignment.surah_name.split(" (")[0].replace(/^\d+\.\s+/, "")
                        : assignment.surah}
                      {assignment.start_ayah && assignment.end_ayah && (
                        <>
                          , Ayahs {assignment.start_ayah}-{assignment.end_ayah}
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h3 className="font-medium text-foreground">Due Date</h3>
                    <p className="text-sm text-muted-foreground mt-1">{formatDate(assignment.due_date)}</p>
                  </div>
                </div>

                {assignment.classes && (
                  <div className="flex items-start gap-3">
                    <BookOpen className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <h3 className="font-medium text-foreground">Class</h3>
                      <p className="text-sm text-muted-foreground mt-1">{assignment.classes.name}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <h3 className="font-medium text-foreground">Submitted</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {formatDatePST(recitation.submitted_at, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recitation Audio */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xl">Your Recitation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                <div className="bg-primary/10 p-3 rounded-full mr-4">
                  <Headphones className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <audio controls src={recitation.audio_url} className="w-full">
                    Your browser does not support the audio element.
                  </audio>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Feedback */}
          {feedback ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-xl">Feedback Analysis</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Accuracy Score */}
                  <div className="bg-muted/50 p-4 rounded-lg">
                    <h3 className="font-medium text-foreground mb-2 flex items-center">
                      <BarChart2 className="h-5 w-5 mr-2 text-primary" />
                      Accuracy Score
                    </h3>
                    <div className="flex items-center mb-2">
                      <div className="flex-1 mr-4">
                        <div className="h-4 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${Math.round(feedback.accuracy * 100)}%` }}
                          ></div>
                        </div>
                      </div>
                      <div className="text-2xl font-bold text-foreground">{Math.round(feedback.accuracy * 100)}%</div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {feedback.accuracy >= 0.9
                        ? "Excellent! Your recitation is very accurate."
                        : feedback.accuracy >= 0.7
                          ? "Good job! Your recitation is mostly accurate with a few areas for improvement."
                          : feedback.accuracy >= 0.5
                            ? "Your recitation has some inaccuracies. Focus on the highlighted areas for improvement."
                            : "Your recitation needs significant improvement. Consider practicing more and trying again."}
                    </p>
                  </div>

                  {/* Teacher Notes */}
                  {feedback.notes && (
                    <div>
                      <h3 className="font-medium text-foreground mb-2 flex items-center">
                        <FileText className="h-5 w-5 mr-2 text-primary" />
                        Teacher Notes
                      </h3>
                      <div className="bg-muted/50 p-4 rounded-lg">
                        <p className="text-foreground">{feedback.notes}</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-6 text-center">
                <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No Feedback Available</h3>
                <p className="text-muted-foreground mb-4">
                  Feedback for this recitation is not available yet. Please check back later.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-end">
            <Button variant="outline" onClick={() => router.push("/assignments")} className="order-2 sm:order-1">
              Back to Assignments
            </Button>
            <Button
              onClick={() => router.push(`/recitations/new?assignment=${assignmentId}`)}
              className="order-1 sm:order-2"
            >
              Submit New Recitation
            </Button>
          </div>
        </div>
      </div>
    </AuthenticatedLayout>
  )
}
