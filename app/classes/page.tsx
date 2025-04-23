"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { TaleemLogo } from "@/components/taleem-logo"
import { createClientComponentClient } from "@/lib/supabase/client"
import { supabaseConfig } from "@/lib/config"
import { PlusIcon, UsersIcon } from "lucide-react"
import NewClassModal from "./new-class-modal"

// Define the Class type
interface Class {
  id: string
  teacher_id: string
  name: string
  description: string
  grade_level: string
  created_at: string
  school_id: string | null
  student_count: number
  class_code: string
}

// Define the Profile type
interface Profile {
  id: string
  school_id: string | null
  role: string
  email: string
  first_name: string
  last_name: string
}

export default function ClassesPage() {
  const [classes, setClasses] = useState<Class[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [supabase, setSupabase] = useState<any>(null)

  const router = useRouter()

  useEffect(() => {
    // Initialize Supabase client
    if (!supabaseConfig.isValid()) {
      setError("Invalid Supabase configuration")
      setLoading(false)
      return
    }

    const client = createClientComponentClient()
    setSupabase(client)

    // Load user data
    const loadUserData = async () => {
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

        setUser(sessionData.session.user)

        // Get user profile
        const { data: profileData, error: profileError } = await client
          .from("profiles")
          .select("*")
          .eq("id", sessionData.session.user.id)
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

        // Fetch teacher's classes
        const { data: classesData, error: classesError } = await client
          .from("classes")
          .select("*")
          .eq("teacher_id", sessionData.session.user.id)
          .order("created_at", { ascending: false })

        if (classesError) {
          throw new Error(`Failed to load classes: ${classesError.message}`)
        }

        // For each class, get the student count
        const classesWithStudentCount = await Promise.all(
          (classesData || []).map(async (classItem) => {
            // Count students in the class_students junction table
            const { count, error: countError } = await client
              .from("class_students")
              .select("*", { count: "exact", head: true })
              .eq("class_id", classItem.id)

            if (countError) {
              console.error("Error counting students:", countError)
              return { ...classItem, student_count: 0 }
            }

            return {
              ...classItem,
              student_count: count || 0,
            }
          }),
        )

        setClasses(classesWithStudentCount)
      } catch (error: any) {
        console.error("Error loading data:", error)
        setError(error.message)
      } finally {
        setLoading(false)
      }
    }

    loadUserData()
  }, [router])

  const handleNewClassCreated = async (newClass: {
    name: string
    description: string
    grade_level: string
  }) => {
    if (!supabase || !user || !profile) return

    try {
      setLoading(true)

      // Generate a formatted class code (e.g., ABC-123-XYZ)
      const generateCode = () => {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // Removed similar looking characters
        let code = ""

        // First segment (3 letters)
        for (let i = 0; i < 3; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length))
        }

        code += "-"

        // Second segment (3 digits)
        for (let i = 0; i < 3; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length))
        }

        code += "-"

        // Third segment (3 letters)
        for (let i = 0; i < 3; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length))
        }

        return code
      }

      const classCode = generateCode()

      // Insert the new class
      const { data, error } = await supabase
        .from("classes")
        .insert({
          teacher_id: user.id,
          name: newClass.name,
          description: newClass.description,
          grade_level: newClass.grade_level,
          created_at: new Date().toISOString(),
          school_id: profile.school_id, // Associate with teacher's school
          class_code: classCode,
        })
        .select()

      if (error) {
        throw error
      }

      // Add the new class to the state
      setClasses((prevClasses) => [{ ...data[0], student_count: 0 }, ...prevClasses])
      setIsModalOpen(false)
    } catch (error: any) {
      console.error("Error creating class:", error)
      setError(`Failed to create class: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <TaleemLogo className="h-12 w-auto text-purple-600 mb-4" />
        <p className="text-gray-700 mb-2">Loading your classes...</p>
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
            <h1 className="text-2xl font-bold text-foreground">My Classes</h1>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-700">
              {profile?.first_name && profile?.last_name
                ? `${profile.first_name} ${profile.last_name}`
                : profile?.email}{" "}
              ({profile?.role})
            </span>
            <Link href="/dashboard" className="text-sm text-purple-600 hover:text-purple-800">
              Dashboard
            </Link>
            <Link href="/profile" className="text-sm text-purple-600 hover:text-purple-800">
              My Profile
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex justify-between items-center">
          <h2 className="text-xl font-semibold">Your Classes</h2>
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-purple-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-purple-700 flex items-center"
          >
            <PlusIcon className="h-4 w-4 mr-1" />
            Create New Class
          </button>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-50 text-red-600 rounded-md">
            <p>{error}</p>
          </div>
        )}

        {classes.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {classes.map((classItem) => (
              <div key={classItem.id} className="bg-white rounded-lg shadow overflow-hidden">
                <div className="p-6">
                  <h3 className="text-lg font-medium text-gray-900">{classItem.name}</h3>
                  <p className="mt-1 text-sm text-gray-600">Grade: {classItem.grade_level}</p>
                  {classItem.description && (
                    <p className="mt-2 text-sm text-gray-600 line-clamp-2">{classItem.description}</p>
                  )}
                  <div className="mt-4 flex items-center text-sm text-gray-500">
                    <UsersIcon className="h-4 w-4 mr-1" />
                    <span>
                      {classItem.student_count} {classItem.student_count === 1 ? "Student" : "Students"}
                    </span>
                  </div>
                  <div className="mt-4 flex flex-col sm:flex-row gap-2">
                    <Link
                      href={`/classes/${classItem.id}`}
                      className="text-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 flex-1"
                    >
                      View Class
                    </Link>
                    <Link
                      href={`/assignments/new?class=${classItem.id}`}
                      className="text-center px-4 py-2 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700 flex-1"
                    >
                      Create Assignment
                    </Link>
                  </div>
                </div>
                <div className="bg-gray-50 px-6 py-3 border-t">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">Class Code:</span>
                    <span className="font-mono text-sm">{classItem.class_code}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Classes Yet</h3>
            <p className="text-gray-600 mb-4">Create your first class to get started.</p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-purple-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-purple-700 inline-flex items-center"
            >
              <PlusIcon className="h-4 w-4 mr-1" />
              Create New Class
            </button>
          </div>
        )}
      </main>

      <NewClassModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSubmit={handleNewClassCreated} />
    </div>
  )
}
