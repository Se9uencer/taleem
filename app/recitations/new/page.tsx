"use client"

import { Button } from "@/components/ui/button"
import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClientComponentClient } from "@/lib/supabase/client"
import Link from "next/link"
import { TaleemLogo } from "@/components/taleem-logo"
import { AlertCircle } from "lucide-react"
import { RecitationRecorder } from "@/components/recitation-recorder"
import { RecitationFeedback } from "@/components/recitation-feedback"

export default function NewRecitationPage() {
  const [assignment, setAssignment] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<any>(null)
  const [previousSubmission, setPreviousSubmission] = useState<any>(null)
  const [submittedRecitationId, setSubmittedRecitationId] = useState<string | null>(null)

  const router = useRouter()
  const searchParams = useSearchParams()
  const assignmentId = searchParams.get("assignment")

  useEffect(() => {
    const supabase = createClientComponentClient()

    const loadData = async () => {
      try {
        setLoading(true);
        const { data: sessionData } = await supabase.auth.getSession()

        if (!sessionData.session) {
          router.push("/login")
          return
        }

        setUser(sessionData.session.user)

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

        if (profileData.role !== "student") {
          router.push("/dashboard")
          return
        }

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

        const { data: existingSubmissions, error: submissionsError } = await supabase
          .from("recitations")
          .select("*")
          .eq("assignment_id", assignmentId)
          .eq("student_id", sessionData.session.user.id)
          .eq("is_latest", true)
          .order("submitted_at", { ascending: false })
          .limit(1)

        if (!submissionsError && existingSubmissions && existingSubmissions.length > 0) {
          setPreviousSubmission(existingSubmissions[0])
          setSubmittedRecitationId(existingSubmissions[0].id)
        }

        setAssignment(assignmentData)
        
      } catch (err: any) {
        console.error("Error loading data:", err)
        setError("An unexpected error occurred")
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [assignmentId, router])

  const handleRecitationSubmitted = (recitationId: string) => {
    setSubmittedRecitationId(recitationId)
  }

  const generateAssignmentTitle = (surahName: string, startAyah: number, endAyah: number) => {
    const surahNameOnly = surahName.replace(/^\d+\.\s+/, "").split(" (")[0];
    if (startAyah === endAyah) {
        return `${surahNameOnly} - Ayah ${startAyah}`;
    }
    return `${surahNameOnly} - Ayahs ${startAyah}-${endAyah}`;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  if (error) {
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow">
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
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
          {assignment && (
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-foreground">
                {assignment.title ||
                  (assignment.surah_name && assignment.start_ayah && assignment.end_ayah
                    ? generateAssignmentTitle(assignment.surah_name, assignment.start_ayah, assignment.end_ayah)
                    : assignment.surah)}
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mt-1">
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
              <p className="text-gray-600 dark:text-gray-300">
                Due: {new Date(assignment.due_date).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" })}
              </p>
            </div>
          )}

          {previousSubmission && !submittedRecitationId && (
            <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-start">
                <AlertCircle className="h-5 w-5 text-blue-500 mt-0.5 mr-2" />
                <div>
                  <h3 className="font-medium text-blue-800 dark:text-blue-300">
                    You have already submitted this assignment
                  </h3>
                  <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
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

          <div className="space-y-6">
            {submittedRecitationId ? (
              <RecitationFeedback recitationId={submittedRecitationId} />
            ) : (
              // This is the updated section
              assignment && user && (
                <RecitationRecorder
                  assignmentId={assignmentId!}
                  studentId={user.id}
                  onRecitationSubmitted={handleRecitationSubmitted}
                  assignmentDueDate={assignment.due_date}
                />
              )
            )}

            {submittedRecitationId && (
              <div className="flex justify-center">
                <Button onClick={() => setSubmittedRecitationId(null)} variant="outline">
                  Submit Another Recitation
                </Button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}