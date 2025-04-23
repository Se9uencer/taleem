"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { TaleemLogo } from "@/components/taleem-logo"
import { createClientComponentClient } from "@/lib/supabase/client"
import { supabaseConfig } from "@/lib/config"

export default function JoinClassPage() {
  const [classCode, setClassCode] = useState("")
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [supabase, setSupabase] = useState<any>(null)

  const router = useRouter()

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

      async function loadUserData() {
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

          // Check if user is a student
          if (profileData.role !== "student") {
            setError("Only students can join classes")
          }

          setLoading(false)
        } catch (error: any) {
          console.error("Error loading data:", error)
          setError(error.message)
          setLoading(false)
        }
      }

      loadUserData()
    } catch (error: any) {
      console.error("Error initializing Supabase client:", error)
      setError(error.message)
      setLoading(false)
    }
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!classCode.trim()) {
      setError("Please enter a class code")
      return
    }

    setJoining(true)
    setError(null)
    setSuccess(null)

    try {
      if (!supabase) {
        throw new Error("Supabase client not initialized")
      }

      if (!profile) {
        throw new Error("User profile not loaded")
      }

      // Find the class with this code
      const { data: classData, error: classError } = await supabase
        .from("classes")
        .select("*")
        .eq("class_code", classCode.trim())
        .single()

      if (classError) {
        if (classError.code === "PGRST116") {
          throw new Error("Invalid class code. Please check and try again.")
        }
        throw new Error(`Failed to find class: ${classError.message}`)
      }

      if (!classData) {
        throw new Error("Class not found")
      }

      // Check if student is already enrolled in this class
      const { data: existingEnrollment, error: enrollmentCheckError } = await supabase
        .from("class_students")
        .select("*")
        .eq("class_id", classData.id)
        .eq("student_id", profile.id)
        .single()

      if (existingEnrollment) {
        throw new Error("You are already enrolled in this class")
      }

      if (enrollmentCheckError && enrollmentCheckError.code !== "PGRST116") {
        throw new Error(`Failed to check enrollment: ${enrollmentCheckError.message}`)
      }

      // Enroll the student in the class
      const { error: joinError } = await supabase.from("class_students").insert({
        class_id: classData.id,
        student_id: profile.id,
        joined_at: new Date().toISOString(),
      })

      if (joinError) {
        console.error("Join error details:", joinError)
        throw new Error(`Error joining class: ${joinError.message}`)
      }

      setSuccess(`Successfully joined ${classData.name}!`)

      // Clear the form
      setClassCode("")

      // Redirect to dashboard after a short delay
      setTimeout(() => {
        router.push("/dashboard")
      }, 2000)
    } catch (error: any) {
      console.error("Error joining class:", error)
      setError(error.message)
    } finally {
      setJoining(false)
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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center">
            <TaleemLogo className="h-8 w-auto text-purple-600 mr-2" />
            <h1 className="text-2xl font-bold text-gray-900">Join a Class</h1>
          </div>
          <div className="flex items-center space-x-4">
            {profile && (
              <span className="text-sm text-gray-700">
                {profile.email} ({profile.role})
              </span>
            )}
            <Link href="/dashboard" className="text-sm text-purple-600 hover:text-purple-800">
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white shadow rounded-lg p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md">
              <p>{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-md">
              <p>{success}</p>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label htmlFor="classCode" className="block text-sm font-medium text-gray-700">
                  Class Code
                </label>
                <input
                  type="text"
                  id="classCode"
                  value={classCode}
                  onChange={(e) => {
                    // Just convert to uppercase without auto-formatting
                    const value = e.target.value.toUpperCase()
                    setClassCode(value)
                  }}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                  placeholder="ABC123XYZ"
                  required
                />
                <p className="mt-1 text-xs text-gray-500">
                  Enter the class code provided by your teacher (e.g., ABC123XYZ)
                </p>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <Link
                  href="/dashboard"
                  className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={joining || !classCode.trim()}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50"
                >
                  {joining ? "Joining..." : "Join Class"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
