"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { TaleemLogo } from "@/components/taleem-logo"
import { createClientComponentClient } from "@/lib/supabase/client"
import { supabaseConfig } from "@/lib/config"
import { surahData, getAyahCount, generateAssignmentTitle } from "@/lib/quran-data"
// Import the date utility functions
import { getTomorrowDatePST } from "@/lib/date-utils"

export default function NewAssignmentPage() {
  const [surahName, setSurahName] = useState(surahData[0].name)
  const [startAyah, setStartAyah] = useState(1)
  const [endAyah, setEndAyah] = useState(surahData[0].ayahs)
  const [maxAyah, setMaxAyah] = useState(surahData[0].ayahs)
  const [dueDate, setDueDate] = useState(() => {
    // Set default due date to tomorrow
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    return tomorrow.toISOString().split("T")[0]
  })
  const [classId, setClassId] = useState("")
  const [classes, setClasses] = useState<any[]>([])
  const [students, setStudents] = useState<any[]>([])
  const [selectedStudents, setSelectedStudents] = useState<string[]>([])
  const [selectAll, setSelectAll] = useState(true)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [supabase, setSupabase] = useState<any>(null)

  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedClassId = searchParams.get("class")

  useEffect(() => {
    if (preselectedClassId) {
      setClassId(preselectedClassId)
    }
  }, [preselectedClassId])

  // Update max ayah when surah changes
  useEffect(() => {
    const ayahCount = getAyahCount(surahName)
    setMaxAyah(ayahCount)

    // Reset start and end ayah when surah changes
    setStartAyah(1)
    setEndAyah(Math.min(5, ayahCount)) // Default to first 5 ayahs or less if surah is shorter
  }, [surahName])

  useEffect(() => {
    // Initialize Supabase client
    if (!supabaseConfig.isValid()) {
      setError("Invalid Supabase configuration")
      setLoading(false)
      return
    }

    try {
      const client = createClientComponentClient()
      setSupabase(client)

      async function loadData() {
        try {
          // Check if user is authenticated
          const { data: sessionData, error: sessionError } = await client.auth.getSession()

          if (sessionError) {
            throw new Error(`Authentication error: ${sessionError.message}`)
          }

          if (!sessionData.session) {
            router.push("/login")
            return
          }

          const userId = sessionData.session.user.id

          // Get user profile
          const { data: profileData, error: profileError } = await client
            .from("profiles")
            .select("*")
            .eq("id", userId)
            .single()

          if (profileError) {
            throw new Error(`Failed to load profile: ${profileError.message}`)
          }

          if (!profileData) {
            throw new Error("Profile not found")
          }

          setProfile(profileData)

          // Check if user is a teacher
          if (profileData.role !== "teacher") {
            router.push("/dashboard")
            return
          }

          // Load teacher's classes - with RLS disabled, we need to filter manually
          const { data: allClasses, error: classesError } = await client
            .from("classes")
            .select("*")
            .order("created_at", { ascending: false })

          if (classesError) {
            throw new Error(`Failed to load classes: ${classesError.message}`)
          }

          // Filter classes to only include those created by this teacher
          const teacherClasses = allClasses?.filter((c) => c.teacher_id === userId) || []
          setClasses(teacherClasses)

          // If a class is preselected or there's only one class, load its students
          const initialClassId = preselectedClassId || (teacherClasses.length === 1 ? teacherClasses[0].id : "")
          if (initialClassId) {
            setClassId(initialClassId)
            await loadStudentsForClass(initialClassId, client)
          }

          setLoading(false)
        } catch (error: any) {
          console.error("Error loading data:", error)
          setError(error.message)
          setLoading(false)
        }
      }

      loadData()
    } catch (error: any) {
      console.error("Error initializing Supabase client:", error)
      setError(error.message)
      setLoading(false)
    }
  }, [router, preselectedClassId])

  // Update the loadStudentsForClass function to fetch first and last names
  const loadStudentsForClass = async (selectedClassId: string, client: any) => {
    if (!selectedClassId) return

    try {
      // Get students enrolled in this class
      const { data: enrollments, error: enrollmentsError } = await client
        .from("class_students")
        .select("student_id")
        .eq("class_id", selectedClassId)

      if (enrollmentsError) {
        throw new Error(`Failed to load enrollments: ${enrollmentsError.message}`)
      }

      if (!enrollments || enrollments.length === 0) {
        setStudents([])
        setSelectedStudents([])
        return
      }

      const studentIds = enrollments.map((enrollment: any) => enrollment.student_id)

      // Get student profiles with first and last names
      const { data: studentProfiles, error: studentsError } = await client
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", studentIds)

      if (studentsError) {
        throw new Error(`Failed to load students: ${studentsError.message}`)
      }

      setStudents(studentProfiles || [])

      // By default, select all students
      if (selectAll) {
        setSelectedStudents(studentProfiles?.map((student: any) => student.id) || [])
      } else {
        setSelectedStudents([])
      }
    } catch (error: any) {
      console.error("Error loading students:", error)
      setError(error.message)
    }
  }

  const handleClassChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedClassId = e.target.value
    setClassId(selectedClassId)

    if (supabase && selectedClassId) {
      await loadStudentsForClass(selectedClassId, supabase)
    } else {
      setStudents([])
      setSelectedStudents([])
    }
  }

  const handleSurahChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSurahName(e.target.value)
  }

  const handleStartAyahChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number.parseInt(e.target.value)
    if (isNaN(value) || value < 1) {
      setStartAyah(1)
    } else if (value > maxAyah) {
      setStartAyah(maxAyah)
    } else {
      setStartAyah(value)
      // Ensure end ayah is not less than start ayah
      if (value > endAyah) {
        setEndAyah(value)
      }
    }
  }

  const handleEndAyahChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number.parseInt(e.target.value)
    if (isNaN(value) || value < startAyah) {
      setEndAyah(startAyah)
    } else if (value > maxAyah) {
      setEndAyah(maxAyah)
    } else {
      setEndAyah(value)
    }
  }

  const toggleSelectAll = () => {
    if (!selectAll) {
      // Select all students
      setSelectedStudents(students.map((student) => student.id))
    } else {
      // Deselect all students
      setSelectedStudents([])
    }
    setSelectAll(!selectAll)
  }

  const toggleStudentSelection = (studentId: string) => {
    if (selectedStudents.includes(studentId)) {
      setSelectedStudents(selectedStudents.filter((id) => id !== studentId))
    } else {
      setSelectedStudents([...selectedStudents, studentId])
    }
  }

  // Calculate tomorrow's date for the min attribute
  const getTomorrowDate = () => {
    return getTomorrowDatePST()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!surahName || !dueDate || !classId || selectedStudents.length === 0) {
      setError("Please fill in all fields and select at least one student")
      return
    }

    // Validate ayah range
    if (startAyah < 1 || startAyah > maxAyah || endAyah < startAyah || endAyah > maxAyah) {
      setError(`Please enter a valid ayah range (1-${maxAyah})`)
      return
    }

    // Validate due date is in the future
    const selectedDate = new Date(dueDate)
    const today = new Date()
    today.setHours(0, 0, 0, 0) // Reset time to start of day for comparison

    if (selectedDate <= today) {
      setError("Due date must be in the future")
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      if (!supabase) {
        throw new Error("Supabase client not initialized")
      }

      if (!profile) {
        throw new Error("User profile not loaded")
      }

      // Generate a title from the surah and ayah range
      const title = generateAssignmentTitle(surahName, startAyah, endAyah)

      // Create the assignment
      const { data: assignment, error: assignmentError } = await supabase
        .from("assignments")
        .insert({
          title,
          surah: surahName, // Keep for backward compatibility
          surah_name: surahName,
          start_ayah: startAyah,
          end_ayah: endAyah,
          due_date: dueDate,
          teacher_id: profile.id,
          class_id: classId,
        })
        .select()
        .single()

      if (assignmentError) {
        throw new Error(`Failed to create assignment: ${assignmentError.message}`)
      }

      // Assign to selected students
      const assignmentStudents = selectedStudents.map((studentId) => ({
        assignment_id: assignment.id,
        student_id: studentId,
      }))

      const { error: assignStudentsError } = await supabase.from("assignment_students").insert(assignmentStudents)

      if (assignStudentsError) {
        throw new Error(`Failed to assign students: ${assignStudentsError.message}`)
      }

      // Redirect to dashboard
      router.push("/dashboard")
    } catch (error: any) {
      console.error("Error creating assignment:", error)
      setError(error.message)
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <TaleemLogo className="h-12 w-auto text-purple-600 mb-4" />
        <p className="text-gray-700 mb-2">Loading...</p>
        <div className="w-16 h-1 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-purple-600 animate-pulse"></div>
        </div>
      </div>
    )
  }

  if (error && !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-red-50 text-red-600 p-6 rounded-lg max-w-md w-full">
          <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
          <p className="mb-4">{error}</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
            >
              Refresh Page
            </button>
            <button
              onClick={() => router.push("/dashboard")}
              className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
            >
              Return to Dashboard
            </button>
          </div>
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
            <h1 className="text-2xl font-bold text-gray-900">Create Assignment</h1>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-700">
              {profile?.email} ({profile?.role})
            </span>
            <Link href="/dashboard" className="text-sm text-purple-600 hover:text-purple-800">
              Dashboard
            </Link>
            <Link href="/classes" className="text-sm text-purple-600 hover:text-purple-800">
              Classes
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white shadow rounded-lg p-6">
          <form onSubmit={handleSubmit}>
            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md">
                <p>{error}</p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label htmlFor="surah" className="block text-sm font-medium text-gray-700">
                  Surah
                </label>
                <select
                  id="surah"
                  value={surahName}
                  onChange={handleSurahChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                  required
                >
                  {surahData.map((surah) => (
                    <option key={surah.number} value={surah.name}>
                      {surah.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="startAyah" className="block text-sm font-medium text-gray-700">
                    Start Ayah
                  </label>
                  <input
                    type="number"
                    id="startAyah"
                    value={startAyah}
                    onChange={handleStartAyahChange}
                    min={1}
                    max={maxAyah}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="endAyah" className="block text-sm font-medium text-gray-700">
                    End Ayah
                  </label>
                  <input
                    type="number"
                    id="endAyah"
                    value={endAyah}
                    onChange={handleEndAyahChange}
                    min={startAyah}
                    max={maxAyah}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                    required
                  />
                </div>
              </div>

              <div className="bg-gray-50 p-3 rounded-md">
                <p className="text-sm text-gray-700">
                  Assignment:{" "}
                  <span className="font-medium">{generateAssignmentTitle(surahName, startAyah, endAyah)}</span>
                </p>
                <p className="text-xs text-gray-500 mt-1">This surah has {maxAyah} ayahs in total.</p>
              </div>

              <div>
                <label htmlFor="dueDate" className="block text-sm font-medium text-gray-700">
                  Due Date
                </label>
                <input
                  type="date"
                  id="dueDate"
                  value={dueDate}
                  min={getTomorrowDate()}
                  onChange={(e) => {
                    // Validate that the selected date is not in the past
                    const selectedDate = new Date(e.target.value)
                    const today = new Date()
                    today.setHours(0, 0, 0, 0) // Reset time to start of day for comparison

                    if (selectedDate <= today) {
                      setError("Due date must be in the future")
                    } else {
                      setError(null)
                      setDueDate(e.target.value)
                    }
                  }}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                  required
                />
                <p className="mt-1 text-xs text-gray-500">Due date must be at least tomorrow or later</p>
              </div>

              <div>
                <label htmlFor="class" className="block text-sm font-medium text-gray-700">
                  Class
                </label>
                <select
                  id="class"
                  value={classId}
                  onChange={handleClassChange}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                  required
                >
                  <option value="">Select a class</option>
                  {classes.map((classItem) => (
                    <option key={classItem.id} value={classItem.id}>
                      {classItem.name}
                    </option>
                  ))}
                </select>
              </div>

              {classId && students.length > 0 && (
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-700">Assign to Students</label>
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="text-sm text-purple-600 hover:text-purple-800"
                    >
                      {selectAll ? "Deselect All" : "Select All"}
                    </button>
                  </div>
                  <div className="max-h-60 overflow-y-auto border border-gray-300 rounded-md p-2">
                    {students.map((student) => (
                      <div key={student.id} className="flex items-center py-2 border-b border-gray-200 last:border-b-0">
                        <input
                          type="checkbox"
                          id={`student-${student.id}`}
                          checked={selectedStudents.includes(student.id)}
                          onChange={() => toggleStudentSelection(student.id)}
                          className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                        />
                        <label htmlFor={`student-${student.id}`} className="ml-2 block text-sm text-gray-700">
                          {student.first_name} {student.last_name}
                        </label>
                      </div>
                    ))}
                  </div>
                  {students.length > 0 && (
                    <p className="mt-1 text-sm text-gray-500">
                      {selectedStudents.length} of {students.length} students selected
                    </p>
                  )}
                </div>
              )}

              {classId && students.length === 0 && (
                <div className="p-3 bg-yellow-50 text-yellow-700 rounded-md">
                  <p>No students are enrolled in this class yet.</p>
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-4">
                <Link
                  href="/dashboard"
                  className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={submitting || !classId || selectedStudents.length === 0}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50"
                >
                  {submitting ? "Creating..." : "Create Assignment"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
