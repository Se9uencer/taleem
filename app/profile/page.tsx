"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClientComponentClient } from "@/lib/supabase/client"
import AuthenticatedLayout from "@/components/authenticated-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle, AlertCircle, Copy } from "lucide-react"

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    grade: "",
    parent_email: "",
    parent_phone: "",
  })
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [codeCopied, setCodeCopied] = useState(false)

  const router = useRouter()

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true)
        const supabase = createClientComponentClient()

        // Check if user is authenticated
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

        if (sessionError) {
          throw new Error(`Authentication error: ${sessionError.message}`)
        }

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

        if (profileError) {
          throw new Error(`Failed to load profile: ${profileError.message}`)
        }

        if (!profileData) {
          throw new Error("Profile not found")
        }

        // If student_id doesn't exist and role is student, generate one
        if (profileData.role === "student" && !profileData.student_id) {
          const studentId = await generateAndSaveStudentId(supabase, userId)
          if (studentId) {
            profileData.student_id = studentId
          }
        }

        setProfile(profileData)
        setFormData({
          first_name: profileData.first_name || "",
          last_name: profileData.last_name || "",
          email: profileData.email || "",
          grade: profileData.grade || "",
          parent_email: profileData.parent_email || "",
          parent_phone: profileData.parent_phone || "",
        })
      } catch (error: any) {
        console.error("Error loading profile:", error)
        setError(error.message || "An unexpected error occurred")
      } finally {
        setLoading(false)
      }
    }

    loadProfile()
  }, [router])

  // Generate a unique student ID and save it to the profile
  const generateAndSaveStudentId = async (supabase: any, userId: string) => {
    try {
      // Generate a student ID in format TLM-XXX-XXX (where X is alphanumeric)
      const generateCode = () => {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // Removed similar looking characters
        let code = "TLM-"

        // First segment (3 chars)
        for (let i = 0; i < 3; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length))
        }

        code += "-"

        // Second segment (3 chars)
        for (let i = 0; i < 3; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length))
        }

        return code
      }

      const studentId = generateCode()

      // Save the student ID to the profile
      const { error } = await supabase.from("profiles").update({ student_id: studentId }).eq("id", userId)

      if (error) {
        console.error("Error saving student ID:", error)
        return null
      }

      return studentId
    } catch (error) {
      console.error("Error generating student ID:", error)
      return null
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profile) return

    try {
      setSaving(true)
      setError(null)
      setSuccessMessage(null)

      const supabase = createClientComponentClient()
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: formData.first_name,
          last_name: formData.last_name,
          grade: formData.grade,
          parent_email: formData.parent_email,
          parent_phone: formData.parent_phone,
        })
        .eq("id", profile.id)

      if (error) {
        throw new Error(`Failed to update profile: ${error.message}`)
      }

      setSuccessMessage("Profile updated successfully!")
    } catch (error: any) {
      console.error("Error updating profile:", error)
      setError(error.message || "Failed to update profile")
    } finally {
      setSaving(false)
    }
  }

  const copyStudentId = () => {
    if (profile?.student_id) {
      navigator.clipboard.writeText(profile.student_id)
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    }
  }

  if (loading) {
    return (
      <AuthenticatedLayout>
        <div className="flex justify-center items-center h-64">
          <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
        </div>
      </AuthenticatedLayout>
    )
  }

  return (
    <AuthenticatedLayout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card className="border border-gray-200 shadow-sm">
          <CardHeader className="border-b border-gray-100 bg-gray-50">
            <CardTitle className="text-xl font-semibold">Edit Profile</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {successMessage && (
              <div className="mb-6 p-3 bg-green-50 text-green-700 rounded-md flex items-start">
                <CheckCircle className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
                <p>{successMessage}</p>
              </div>
            )}

            {error && (
              <div className="mb-6 p-3 bg-red-50 text-red-600 rounded-md flex items-start">
                <AlertCircle className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {/* Student ID Display */}
            {profile?.role === "student" && profile?.student_id && (
              <div className="mb-6 p-4 bg-purple-50 rounded-lg border border-purple-100">
                <h3 className="text-sm font-medium text-purple-800 mb-2">Your Student ID</h3>
                <div className="flex items-center">
                  <code className="bg-white px-3 py-1.5 rounded border border-purple-200 text-purple-700 font-mono text-sm flex-grow">
                    {profile.student_id}
                  </code>
                  <button
                    onClick={copyStudentId}
                    className="ml-2 p-2 text-purple-600 hover:text-purple-800 focus:outline-none"
                    title="Copy to clipboard"
                  >
                    {codeCopied ? <CheckCircle className="h-5 w-5 text-green-500" /> : <Copy className="h-5 w-5" />}
                  </button>
                </div>
                <p className="text-xs text-purple-600 mt-2">Share this ID with your parent to link your account</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <label htmlFor="first_name" className="block text-sm font-medium text-gray-700 mb-1">
                    First Name
                  </label>
                  <input
                    type="text"
                    id="first_name"
                    name="first_name"
                    value={formData.first_name}
                    onChange={handleChange}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>

                <div>
                  <label htmlFor="last_name" className="block text-sm font-medium text-gray-700 mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    id="last_name"
                    name="last_name"
                    value={formData.last_name}
                    onChange={handleChange}
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    disabled
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-50"
                  />
                  <p className="mt-1 text-xs text-gray-500">Email cannot be changed</p>
                </div>

                {profile?.role === "student" && (
                  <div>
                    <label htmlFor="grade" className="block text-sm font-medium text-gray-700 mb-1">
                      Grade
                    </label>
                    <input
                      type="text"
                      id="grade"
                      name="grade"
                      value={formData.grade}
                      onChange={handleChange}
                      className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                      placeholder="e.g., 8th Grade"
                    />
                  </div>
                )}

                {profile?.role === "student" && (
                  <>
                    <div>
                      <label htmlFor="parent_email" className="block text-sm font-medium text-gray-700 mb-1">
                        Parent Email
                      </label>
                      <input
                        type="email"
                        id="parent_email"
                        name="parent_email"
                        value={formData.parent_email}
                        onChange={handleChange}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                        placeholder="parent@example.com"
                      />
                    </div>

                    <div>
                      <label htmlFor="parent_phone" className="block text-sm font-medium text-gray-700 mb-1">
                        Parent Phone
                      </label>
                      <input
                        type="tel"
                        id="parent_phone"
                        name="parent_phone"
                        value={formData.parent_phone}
                        onChange={handleChange}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                        placeholder="(123) 456-7890"
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100">
                <Button type="button" variant="outline" onClick={() => router.push("/dashboard")} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AuthenticatedLayout>
  )
}
