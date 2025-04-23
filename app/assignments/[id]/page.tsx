"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { TaleemLogo } from "@/components/taleem-logo"
import { createClientComponentClient } from "@/lib/supabase/client"
import { BookOpenIcon, CalendarIcon, UsersIcon, ClockIcon, CheckCircleIcon, ArrowLeftIcon } from "lucide-react"
import SubmissionsList from "./submissions-list"

// Import the date utility functions
import { formatDateTimePST, isPastDuePST } from "@/lib/date-utils"

interface Assignment {
  id: string
  title: string
  surah: string
  surah_name?: string
  start_ayah?: number
  end_ayah?: number
  due_date: string
  created_at: string
  class_id: string
  teacher_id: string
  class_name?: string
  submission_count?: number
}

export default function AssignmentDetailsPage() {
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [className, setClassName] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [submissionCount, setSubmissionCount] = useState(0)
  const [studentCount, setStudentCount] = useState(0)

  const params = useParams()
  const router = useRouter()
  const assignmentId = params.id as string

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        const supabase = createClientComponentClient()

        // Check if user is authenticated
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

        if (sessionError || !sessionData.session) {
          router.push("/login")
          return
        }

        // Get user profile
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", sessionData.session.user.id)
          .single()

        if (profileError || !profileData) {
          router.push("/login")
          return
        }

        setProfile(profileData)

        // Check if user is a teacher
        if (profileData.role !== "teacher") {
          setError("Only teachers can access this page")
          setLoading(false)
          return
        }

        // Fetch assignment details
        const { data: assignmentData, error: assignmentError } = await supabase
          .from("assignments")
          .select("*")
          .eq("id", assignmentId)
          .single()

        if (assignmentError || !assignmentData) {
          setError("Assignment not found")
          setLoading(false)
          return
        }

        // Check if the teacher owns this assignment
        if (assignmentData.teacher_id !== sessionData.session.user.id) {
          setError("You don't have permission to view this assignment")
          setLoading(false)
          return
        }

        setAssignment(assignmentData)

        // Get class name
        const { data: classData, error: classError } = await supabase
          .from("classes")
          .select("name")
          .eq("id", assignmentData.class_id)
          .single()

        if (!classError && classData) {
          setClassName(classData.name)
        }

        // Get submission count
        const { count: submissionCountData, error: submissionCountError } = await supabase
          .from("recitations")
          .select("*", { count: "exact", head: true })
          .eq("assignment_id", assignmentId)

        if (!submissionCountError) {
          setSubmissionCount(submissionCountData || 0)
        }

        // Get student count for this assignment
        const { count: studentCountData, error: studentCountError } = await supabase
          .from("assignment_students")
          .select("*", { count: "exact", head: true })
          .eq("assignment_id", assignmentId)

        if (!studentCountError) {
          setStudentCount(studentCountData || 0)
        }

        setLoading(false)
      } catch (err: any) {
        console.error("Error loading assignment:", err)
        setError(err.message || "An unexpected error occurred")
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
    return formatDateTimePST(dateString)
  }

  // Check if an assignment is past due
  const isPastDue = (dueDate: string) => {
    return isPastDuePST(dueDate)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-purple-500 border-r-transparent"></div>
          <p className="mt-2 text-gray-600">Loading assignment details...</p>
        </div>
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

  if (!assignment) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <h2 className="text-lg font-semibold mb-2">Assignment Not Found</h2>
          <p className="mb-4">The assignment you're looking for doesn't exist or you don't have access to it.</p>
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center">
            <TaleemLogo className="h-8 w-auto text-purple-600 mr-2" />
            <h1 className="text-2xl font-bold text-foreground">Assignment Details</h1>
          </div>
          <Link href="/dashboard" className="text-purple-600 hover:text-purple-800">
            Back to Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Link
            href={`/classes/${assignment.class_id}`}
            className="inline-flex items-center text-purple-600 hover:text-purple-800"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-1" />
            Back to {className || "Class"}
          </Link>
        </div>

        <div className="bg-white shadow rounded-lg overflow-hidden mb-8">
          <div className="p-6 border-b">
            <h2 className="text-2xl font-bold text-foreground">
              {assignment.title ||
                (assignment.surah_name && assignment.start_ayah && assignment.end_ayah
                  ? generateAssignmentTitle(assignment.surah_name, assignment.start_ayah, assignment.end_ayah)
                  : assignment.surah)}
            </h2>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center text-gray-600">
                <BookOpenIcon className="h-5 w-5 mr-2 text-purple-500" />
                <span>
                  {assignment.surah_name
                    ? `${assignment.surah_name.split(" (")[0].replace(/^\d+\.\s+/, "")}${
                        assignment.start_ayah && assignment.end_ayah
                          ? `, Ayahs ${assignment.start_ayah}-${assignment.end_ayah}`
                          : ""
                      }`
                    : `Surah: ${assignment.surah}`}
                </span>
              </div>

              <div className="flex items-center text-gray-600">
                <CalendarIcon className="h-5 w-5 mr-2 text-purple-500" />
                <span>Due: {formatDate(assignment.due_date)}</span>
              </div>

              <div className="flex items-center text-gray-600">
                <ClockIcon className="h-5 w-5 mr-2 text-purple-500" />
                <span className={isPastDue(assignment.due_date) ? "text-red-600" : "text-green-600"}>
                  {isPastDue(assignment.due_date) ? "Past Due" : "Active"}
                </span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="flex items-center">
                  <UsersIcon className="h-5 w-5 mr-2 text-purple-600" />
                  <h3 className="font-medium text-purple-800">Assigned To</h3>
                </div>
                <p className="text-3xl font-bold text-purple-900 mt-2">{studentCount}</p>
                <p className="text-sm text-purple-700">students</p>
              </div>

              <div className="bg-green-50 p-4 rounded-lg">
                <div className="flex items-center">
                  <CheckCircleIcon className="h-5 w-5 mr-2 text-green-600" />
                  <h3 className="font-medium text-green-800">Submissions</h3>
                </div>
                <p className="text-3xl font-bold text-green-900 mt-2">{submissionCount}</p>
                <p className="text-sm text-green-700">
                  {studentCount > 0
                    ? `${Math.round((submissionCount / studentCount) * 100)}% completion rate`
                    : "No students assigned"}
                </p>
              </div>
            </div>
          </div>

          <div className="p-6">
            <h3 className="text-xl font-semibold mb-6">Student Submissions</h3>
            <SubmissionsList assignmentId={assignmentId} dueDate={assignment.due_date} />
          </div>
        </div>
      </main>
    </div>
  )
}
