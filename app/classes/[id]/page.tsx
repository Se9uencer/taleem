"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import { TaleemLogo } from "@/components/taleem-logo"
import { createClientComponentClient } from "@/lib/supabase/client"
import {
  CopyIcon,
  CheckIcon,
  UsersIcon,
  XIcon,
  UserIcon,
  BookOpenIcon,
  MailIcon,
  PhoneIcon,
  CreditCardIcon as IdCardIcon,
} from "lucide-react"
import AssignmentsList from "./assignments-list"

interface StudentProfile {
  id: string
  email: string
  first_name: string
  last_name: string
  role: string
  grade?: string
  parent_email?: string
  parent_phone?: string
  student_id?: string
}

interface StudentAssignment {
  id: string
  title: string
  surah_name: string
  start_ayah: number
  end_ayah: number
  due_date: string
  submitted: boolean
}

export default function ClassDetailsPage() {
  const [classData, setClassData] = useState<any>(null)
  const [students, setStudents] = useState<StudentProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [supabase, setSupabase] = useState<any>(null)
  const [copied, setCopied] = useState(false)
  const [copiedStudentId, setCopiedStudentId] = useState<string | null>(null)
  const [showConfirmRemove, setShowConfirmRemove] = useState<string | null>(null)
  const [showStudentProfile, setShowStudentProfile] = useState<string | null>(null)
  const [showExtraInfo, setShowExtraInfo] = useState<string | null>(null)
  const [studentAssignments, setStudentAssignments] = useState<StudentAssignment[]>([])
  const [loadingAssignments, setLoadingAssignments] = useState(false)

  const router = useRouter()
  const params = useParams()
  const classId = params.id as string

  useEffect(() => {
    const client = createClientComponentClient()
    setSupabase(client)

    const loadData = async () => {
      try {
        // Check if user is authenticated
        const { data: sessionData, error: sessionError } = await client.auth.getSession()

        if (sessionError || !sessionData.session) {
          router.push("/login")
          return
        }

        setUser(sessionData.session.user)

        // Get user profile
        const { data: profileData, error: profileError } = await client
          .from("profiles")
          .select("*")
          .eq("id", sessionData.session.user.id)
          .single()

        if (profileError || !profileData) {
          router.push("/login")
          return
        }

        setProfile(profileData)

        // Fetch class details
        const { data: classDetails, error: classDetailsError } = await client
          .from("classes")
          .select("*, schools(name)")
          .eq("id", classId)
          .single()

        if (classDetailsError || !classDetails) {
          setError("Class not found.")
          setLoading(false)
          return
        }

        setClassData(classDetails)

        // Check if user is the teacher of this class or a student enrolled in it
        const isTeacher = classDetails.teacher_id === sessionData.session.user.id

        if (!isTeacher) {
          // Check if student is enrolled
          const { data: enrollment, error: enrollmentError } = await client
            .from("class_students")
            .select("*")
            .eq("class_id", classId)
            .eq("student_id", sessionData.session.user.id)
            .single()

          if (enrollmentError || !enrollment) {
            setError("You do not have access to this class")
            setLoading(false)
            return
          }
        }

        // First get all student IDs enrolled in this class
        const { data: enrollments, error: enrollmentsError } = await client
          .from("class_students")
          .select("student_id")
          .eq("class_id", classId)

        if (enrollmentsError) {
          console.error("Error fetching enrollments:", enrollmentsError)
          setLoading(false)
          return
        }

        if (!enrollments || enrollments.length === 0) {
          setStudents([])
          setLoading(false)
          return
        }

        // Get the student IDs
        const studentIds = enrollments.map((enrollment) => enrollment.student_id)

        // Now fetch the actual student profiles with more details
        const { data: studentProfiles, error: profilesError } = await client
          .from("profiles")
          .select("id, email, first_name, last_name, role, grade, parent_email, parent_phone, student_id")
          .in("id", studentIds)
          .eq("role", "student")

        if (profilesError) {
          console.error("Error fetching student profiles:", profilesError)
        } else {
          setStudents(studentProfiles || [])
        }

        setLoading(false)
      } catch (err) {
        console.error("Error loading data:", err)
        setError("An unexpected error occurred")
        setLoading(false)
      }
    }

    if (classId) {
      loadData()
    }
  }, [classId, router])

  const copyClassCode = () => {
    if (classData?.class_code) {
      navigator.clipboard.writeText(classData.class_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const copyStudentId = (studentId: string) => {
    if (studentId) {
      navigator.clipboard.writeText(studentId)
      setCopiedStudentId(studentId)
      setTimeout(() => setCopiedStudentId(null), 2000)
    }
  }

  const loadStudentAssignments = async (studentId: string) => {
    if (!supabase || !classId) return

    setLoadingAssignments(true)
    setStudentAssignments([])

    try {
      // Get assignments for this class that are assigned to this student
      const { data: assignmentStudents, error: assignmentStudentsError } = await supabase
        .from("assignment_students")
        .select("assignment_id")
        .eq("student_id", studentId)

      if (assignmentStudentsError) {
        console.error("Error fetching assignment students:", assignmentStudentsError)
        setLoadingAssignments(false)
        return
      }

      if (!assignmentStudents || assignmentStudents.length === 0) {
        setLoadingAssignments(false)
        return
      }

      const assignmentIds = assignmentStudents.map((as: any) => as.assignment_id)

      // Get the assignments
      const { data: assignments, error: assignmentsError } = await supabase
        .from("assignments")
        .select("id, title, surah_name, start_ayah, end_ayah, due_date")
        .in("id", assignmentIds)
        .eq("class_id", classId)
        .order("due_date", { ascending: false })

      if (assignmentsError) {
        console.error("Error fetching assignments:", assignmentsError)
        setLoadingAssignments(false)
        return
      }

      // Check which assignments have been submitted
      const { data: recitations, error: recitationsError } = await supabase
        .from("recitations")
        .select("assignment_id")
        .eq("student_id", studentId)
        .in("assignment_id", assignmentIds)

      if (recitationsError) {
        console.error("Error fetching recitations:", recitationsError)
      }

      // Create a set of submitted assignment IDs for quick lookup
      const submittedAssignmentIds = new Set(recitations?.map((r: any) => r.assignment_id) || [])

      // Add submission status to each assignment
      const assignmentsWithStatus = assignments.map((assignment: any) => ({
        ...assignment,
        submitted: submittedAssignmentIds.has(assignment.id),
      }))

      setStudentAssignments(assignmentsWithStatus)
    } catch (error) {
      console.error("Error loading student assignments:", error)
    } finally {
      setLoadingAssignments(false)
    }
  }

  const handleRemoveStudent = async (studentId: string) => {
    if (!supabase || !classId) return

    try {
      // Remove the student from the class
      const { error } = await supabase
        .from("class_students")
        .delete()
        .eq("class_id", classId)
        .eq("student_id", studentId)

      if (error) {
        throw error
      }

      // Update the UI by removing the student from the list
      setStudents(students.filter((student) => student.id !== studentId))
      setShowConfirmRemove(null)
    } catch (error: any) {
      console.error("Error removing student:", error)
      alert(`Failed to remove student: ${error.message}`)
    }
  }

  const handleViewProfile = async (studentId: string) => {
    setShowStudentProfile(studentId)
    await loadStudentAssignments(studentId)
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

  if (!classData) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <h2 className="text-lg font-semibold mb-2">Class Not Found</h2>
          <p className="mb-4">The class you're looking for doesn't exist or you don't have access to it.</p>
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

  const isTeacher = classData.teacher_id === user?.id

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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center">
            <TaleemLogo className="h-8 w-auto text-purple-600 mr-2" />
            <h1 className="text-2xl font-bold text-gray-900">Class Details</h1>
          </div>
          <Link href="/dashboard" className="text-purple-600 hover:text-purple-800">
            Back to Dashboard
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="p-6 border-b">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{classData.name}</h2>
                <p className="text-gray-600 mt-1">Grade: {classData.grade_level}</p>
                {classData.schools?.name && <p className="text-gray-600">School: {classData.schools.name}</p>}
              </div>
              {isTeacher && (
                <Link
                  href={`/assignments/new?class=${classData.id}`}
                  className="bg-purple-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-purple-700"
                >
                  Create Assignment
                </Link>
              )}
            </div>
            {classData.description && <p className="text-gray-700 mt-4">{classData.description}</p>}
          </div>

          {isTeacher && (
            <div className="p-6 bg-gray-50 border-b">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Class Code</h3>
              <p className="text-gray-600 mb-3">Share this code with students so they can join your class.</p>
              <div className="flex items-center">
                <div className="bg-white border border-gray-300 rounded-md px-4 py-2 font-mono text-lg">
                  {classData.class_code}
                </div>
                <button
                  onClick={copyClassCode}
                  className="ml-2 p-2 text-gray-500 hover:text-purple-600 focus:outline-none"
                  aria-label="Copy class code"
                >
                  {copied ? <CheckIcon className="h-5 w-5 text-green-500" /> : <CopyIcon className="h-5 w-5" />}
                </button>
              </div>
            </div>
          )}

          <div className="p-6">
            <div className="flex items-center mb-6">
              <UsersIcon className="h-5 w-5 text-gray-500 mr-2" />
              <h3 className="text-lg font-medium text-gray-900">Students ({students.length})</h3>
            </div>

            {students.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {students.map((student) => (
                  <div key={student.id} className="border rounded-lg shadow-sm relative">
                    {isTeacher && (
                      <button
                        onClick={() => setShowConfirmRemove(student.id)}
                        className="absolute top-2 right-2 text-gray-400 hover:text-red-500 p-1 rounded-full hover:bg-gray-100"
                        aria-label="Remove student"
                      >
                        <XIcon className="h-5 w-5" />
                      </button>
                    )}
                    <div className="p-4">
                      <div className="flex items-center mb-3">
                        <div className="bg-purple-100 text-purple-600 p-2 rounded-full mr-3">
                          <UserIcon className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-900">
                            {student.first_name} {student.last_name}
                          </h4>
                          <p className="text-sm text-gray-500">{student.email}</p>
                        </div>
                      </div>

                      {/* Student ID display for teachers */}
                      {isTeacher && student.student_id && (
                        <div className="mb-3 flex items-center">
                          <div className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs font-mono flex-grow">
                            ID: {student.student_id}
                          </div>
                          <button
                            onClick={() => copyStudentId(student.student_id!)}
                            className="ml-1 p-1 text-gray-500 hover:text-purple-600 focus:outline-none"
                            title="Copy student ID"
                          >
                            {copiedStudentId === student.student_id ? (
                              <CheckIcon className="h-4 w-4 text-green-500" />
                            ) : (
                              <CopyIcon className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      )}

                      <div className="mt-4 flex space-x-2">
                        <button
                          onClick={() => handleViewProfile(student.id)}
                          className="flex-1 text-center px-3 py-1.5 bg-purple-600 text-white text-sm rounded hover:bg-purple-700"
                        >
                          View Profile
                        </button>
                        <button
                          onClick={() => setShowExtraInfo(student.id)}
                          className="flex-1 text-center px-3 py-1.5 border border-gray-300 text-gray-700 text-sm rounded hover:bg-gray-50"
                        >
                          Contact Info
                        </button>
                      </div>
                    </div>

                    {/* Confirmation Modal for Removing Student */}
                    {showConfirmRemove === student.id && (
                      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg p-6 max-w-md w-full">
                          <h3 className="text-lg font-medium text-gray-900 mb-4">Remove Student</h3>
                          <p className="text-gray-600 mb-6">
                            Are you sure you want to remove {student.first_name} {student.last_name} from this class?
                          </p>
                          <div className="flex justify-end space-x-3">
                            <button
                              onClick={() => setShowConfirmRemove(null)}
                              className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleRemoveStudent(student.id)}
                              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Student Profile Modal */}
                    {showStudentProfile === student.id && (
                      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
                          <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-medium text-gray-900">
                              {student.first_name} {student.last_name}'s Profile
                            </h3>
                            <button
                              onClick={() => setShowStudentProfile(null)}
                              className="text-gray-400 hover:text-gray-500"
                            >
                              <XIcon className="h-5 w-5" />
                            </button>
                          </div>

                          {/* Student ID display in profile modal */}
                          {isTeacher && student.student_id && (
                            <div className="mb-4 p-3 bg-gray-50 rounded-md">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center">
                                  <IdCardIcon className="h-5 w-5 text-purple-600 mr-2" />
                                  <h4 className="text-sm font-medium text-gray-700">Student ID</h4>
                                </div>
                                <div className="flex items-center">
                                  <code className="bg-white px-3 py-1 rounded border text-purple-700 font-mono text-sm">
                                    {student.student_id}
                                  </code>
                                  <button
                                    onClick={() => copyStudentId(student.student_id!)}
                                    className="ml-1 p-1 text-gray-500 hover:text-purple-600 focus:outline-none"
                                    title="Copy student ID"
                                  >
                                    {copiedStudentId === student.student_id ? (
                                      <CheckIcon className="h-4 w-4 text-green-500" />
                                    ) : (
                                      <CopyIcon className="h-4 w-4" />
                                    )}
                                  </button>
                                </div>
                              </div>
                              <p className="text-xs text-gray-500 mt-1">
                                This ID can be shared with parents to link their accounts
                              </p>
                            </div>
                          )}

                          <div className="mb-6">
                            <h4 className="text-lg font-medium text-gray-800 mb-2 flex items-center">
                              <BookOpenIcon className="h-5 w-5 mr-2 text-purple-600" />
                              Assignments
                            </h4>

                            {loadingAssignments ? (
                              <p className="text-gray-500 text-center py-4">Loading assignments...</p>
                            ) : studentAssignments.length > 0 ? (
                              <div className="space-y-3">
                                {studentAssignments.map((assignment) => (
                                  <div key={assignment.id} className="border rounded-lg p-3">
                                    <div className="flex justify-between items-start">
                                      <div>
                                        <h5 className="font-medium">
                                          {assignment.title ||
                                            generateAssignmentTitle(
                                              assignment.surah_name,
                                              assignment.start_ayah,
                                              assignment.end_ayah,
                                            )}
                                        </h5>
                                        <p className="text-sm text-gray-600">
                                          Due: {new Date(assignment.due_date).toLocaleDateString()}
                                        </p>
                                      </div>
                                      <span
                                        className={`text-sm px-2 py-1 rounded ${
                                          assignment.submitted
                                            ? "bg-green-100 text-green-800"
                                            : new Date(assignment.due_date) < new Date()
                                              ? "bg-red-100 text-red-800"
                                              : "bg-yellow-100 text-yellow-800"
                                        }`}
                                      >
                                        {assignment.submitted
                                          ? "Submitted"
                                          : new Date(assignment.due_date) < new Date()
                                            ? "Overdue"
                                            : "Pending"}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-gray-500 text-center py-4">No assignments found for this student.</p>
                            )}
                          </div>

                          <div className="flex justify-end">
                            <button
                              onClick={() => setShowStudentProfile(null)}
                              className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Extra Info Modal */}
                    {showExtraInfo === student.id && (
                      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg p-6 max-w-md w-full">
                          <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-medium text-gray-900">Contact Information</h3>
                            <button
                              onClick={() => setShowExtraInfo(null)}
                              className="text-gray-400 hover:text-gray-500"
                            >
                              <XIcon className="h-5 w-5" />
                            </button>
                          </div>

                          <div className="space-y-4">
                            <div>
                              <h4 className="text-sm font-medium text-gray-700 mb-1">Student Email</h4>
                              <div className="flex items-center">
                                <MailIcon className="h-4 w-4 text-gray-500 mr-2" />
                                <a href={`mailto:${student.email}`} className="text-purple-600 hover:underline">
                                  {student.email}
                                </a>
                              </div>
                            </div>

                            {student.parent_email && (
                              <div>
                                <h4 className="text-sm font-medium text-gray-700 mb-1">Parent Email</h4>
                                <div className="flex items-center">
                                  <MailIcon className="h-4 w-4 text-gray-500 mr-2" />
                                  <a
                                    href={`mailto:${student.parent_email}`}
                                    className="text-purple-600 hover:underline"
                                  >
                                    {student.parent_email}
                                  </a>
                                </div>
                              </div>
                            )}

                            {student.parent_phone && (
                              <div>
                                <h4 className="text-sm font-medium text-gray-700 mb-1">Parent Phone</h4>
                                <div className="flex items-center">
                                  <PhoneIcon className="h-4 w-4 text-gray-500 mr-2" />
                                  <a href={`tel:${student.parent_phone}`} className="text-purple-600 hover:underline">
                                    {student.parent_phone}
                                  </a>
                                </div>
                              </div>
                            )}

                            {!student.parent_email && !student.parent_phone && (
                              <p className="text-gray-500 italic">No parent contact information available.</p>
                            )}
                          </div>

                          <div className="mt-6 flex justify-end">
                            <button
                              onClick={() => setShowExtraInfo(null)}
                              className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No students enrolled yet.</p>
            )}
          </div>

          {/* Class Assignments Section */}
          {isTeacher && (
            <div className="p-6 border-t">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center">
                  <BookOpenIcon className="h-5 w-5 text-gray-500 mr-2" />
                  <h3 className="text-lg font-medium text-gray-900">Class Assignments</h3>
                </div>
                <Link
                  href={`/assignments/new?class=${classId}`}
                  className="bg-purple-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-purple-700"
                >
                  Create Assignment
                </Link>
              </div>

              <AssignmentsList classId={classId} />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
