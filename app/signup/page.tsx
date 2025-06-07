"use client"

import "../auth-styles.css"
import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { TaleemLogo } from "@/components/taleem-logo"
import { createClientComponentClient } from "@/lib/supabase/client"
import { supabaseConfig } from "@/lib/config"
import { Card, CardContent } from "@/components/ui/card"


export default function SignupPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [role, setRole] = useState("student")
  const [grade, setGrade] = useState("")
  const [parentEmail, setParentEmail] = useState("")
  const [parentPhone, setParentPhone] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<string[]>([])
  const router = useRouter()

  const addDebugInfo = (info: string) => {
    console.log(info)
    setDebugInfo((prev) => [...prev, info])
  }

  // Generate a unique student ID
  const generateStudentId = () => {
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

  const createProfileDirectly = async (supabase: any, userId: string, userData: any) => {
    addDebugInfo(`Attempting to create profile directly for user ${userId}`)

    try {
      // Generate student ID if role is student
      const studentId = userData.role === "student" ? generateStudentId() : null

      // First try to create the profile
      const { error: insertError } = await supabase.from("profiles").insert({
        id: userId,
        email: userData.email.toLowerCase().trim(),
        first_name: userData.firstName || "",
        last_name: userData.lastName || "",
        role: userData.role,
        grade: userData.grade || null,
        parent_email: userData.parentEmail || null,
        parent_phone: userData.parentPhone || null,
        student_id: studentId,
        created_at: new Date().toISOString(),
        school_id: null, // Explicitly set to null
      })

      if (insertError) {
        addDebugInfo(`Error creating profile: ${insertError.message}`)
        return false
      }

      addDebugInfo("Profile created successfully")
      return true
    } catch (error: any) {
      addDebugInfo(`Exception creating profile: ${error.message}`)
      return false
    }
  }

  const verifyProfileExists = async (supabase: any, userId: string, userData: any) => {
    addDebugInfo(`Verifying profile exists for user ${userId}`)

    // Check if profile exists
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle()

    if (profileError) {
      addDebugInfo(`Error checking profile: ${profileError.message}`)
      return false
    }

    if (!profile) {
      addDebugInfo("No profile found, creating one")
      return await createProfileDirectly(supabase, userId, userData)
    }

    // Profile exists, check if role is correct
    if (profile.role !== userData.role) {
      addDebugInfo(`Profile exists but role is ${profile.role}, updating to ${userData.role}`)

      const { error: updateError } = await supabase.from("profiles").update({ role: userData.role }).eq("id", userId)

      if (updateError) {
        addDebugInfo(`Error updating profile role: ${updateError.message}`)
        return false
      }

      addDebugInfo("Profile role updated successfully")
    } else {
      addDebugInfo(`Profile exists with correct role: ${profile.role}`)
    }

    // Check if student_id exists for student role
    if (userData.role === "student" && !profile.student_id) {
      addDebugInfo("Student profile missing student_id, generating one")

      const studentId = generateStudentId()
      const { error: updateError } = await supabase.from("profiles").update({ student_id: studentId }).eq("id", userId)

      if (updateError) {
        addDebugInfo(`Error updating student_id: ${updateError.message}`)
      } else {
        addDebugInfo(`Student ID generated and saved: ${studentId}`)
      }
    }

    return true
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate required fields
    if (!email || !password || !firstName || !lastName) {
      setError("All fields are required")
      return
    }

    setLoading(true)
    setError(null)
    setDebugInfo([])

    try {
      if (!supabaseConfig.isValid()) {
        throw new Error("Invalid Supabase configuration")
      }

      const supabase = createClientComponentClient()
      const normalizedEmail = email.toLowerCase().trim()

      addDebugInfo(`Starting signup process for ${normalizedEmail} with role: ${role}`)

      // Check if email is already in use
      const { data: existingUser, error: checkError } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", normalizedEmail)
        .maybeSingle()

      if (checkError) {
        addDebugInfo(`Error checking existing user: ${checkError.message}`)
      }

      if (existingUser) {
        setError("This email is already in use. Please use a different email or sign in.")
        setLoading(false)
        return
      }

      // Sign up the user with auto-confirmation
      addDebugInfo(`Creating auth user with role: ${role}`)
      const { data, error: signupError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            role: role, // Ensure role is passed correctly
          },
          // Don't require email verification
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      })

      if (signupError) {
        addDebugInfo(`Signup error: ${signupError.message}`)
        throw signupError
      }

      if (!data.user) {
        addDebugInfo("No user returned from signup")
        throw new Error("Signup failed")
      }

      addDebugInfo(`User created with ID: ${data.user.id}`)
      addDebugInfo(`User metadata: ${JSON.stringify(data.user.user_metadata)}`)

      // Wait a moment for any triggers to run
      addDebugInfo("Waiting for database triggers to run...")
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Verify and ensure profile exists
      const userData = {
        email: normalizedEmail,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role: role,
        grade: grade,
        parentEmail: parentEmail,
        parentPhone: parentPhone,
      }

      const profileCreated = await verifyProfileExists(supabase, data.user.id, userData)

      if (!profileCreated) {
        addDebugInfo("Failed to verify or create profile, but continuing with login attempt")
      }

      // Sign in the user directly without email verification
      addDebugInfo("No session, attempting to sign in")
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      })

      if (signInError) {
        addDebugInfo(`Sign in error: ${signInError.message}`)
        throw signInError
      }

      if (signInData.session) {
        // Successfully signed in, redirect to dashboard
        addDebugInfo("Sign in successful, redirecting to dashboard")

        // One final check to ensure profile exists
        await verifyProfileExists(supabase, signInData.user.id, userData)

        router.push("/dashboard")
      } else {
        // Redirect to login page with message
        addDebugInfo("No session after sign in, redirecting to login page")
        router.push("/login?message=Account created successfully! Please sign in.")
      }
    } catch (error: any) {
      console.error("Signup error:", error)
      setError(error.message || "An error occurred during signup")
      addDebugInfo(`Caught error: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 auth-page"
    >
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <TaleemLogo className="h-12 w-auto mx-auto text-purple-600" />
        <h2 className="mt-6 text-center text-3xl font-extrabold">Create your account</h2>
        <p className="mt-2 text-center text-sm">
          Or{" "}
          <Link href="/login" className="font-medium">
            sign in to your existing account
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <Card className="shadow sm:rounded-lg">
            <CardContent className="py-8 px-4 sm:px-10">
                {error && (
                    <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md">
                    <p>{error}</p>
                    </div>
                )}

                <form className="space-y-6" onSubmit={handleSignup}>
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <div>
                        <label htmlFor="firstName" className="block text-sm font-medium">
                        First Name
                        </label>
                        <div className="mt-1">
                        <input
                            id="firstName"
                            name="firstName"
                            type="text"
                            required
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            placeholder="Ahmed"
                            className="appearance-none block w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                        />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="lastName" className="block text-sm font-medium">
                        Last Name
                        </label>
                        <div className="mt-1">
                        <input
                            id="lastName"
                            name="lastName"
                            type="text"
                            required
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            placeholder="Khan"
                            className="appearance-none block w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                        />
                        </div>
                    </div>
                    </div>

                    <div>
                    <label htmlFor="email" className="block text-sm font-medium">
                        Email address
                    </label>
                    <div className="mt-1">
                        <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="ahmed.khan@example.com"
                        className="appearance-none block w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                        />
                    </div>
                    </div>

                    <div>
                    <label htmlFor="password" className="block text-sm font-medium">
                        Password
                    </label>
                    <div className="mt-1">
                        <input
                        id="password"
                        name="password"
                        type="password"
                        autoComplete="new-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="appearance-none block w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                        />
                    </div>
                    </div>

                    <div>
                    <label htmlFor="role" className="block text-sm font-medium">
                        I am a
                    </label>
                    <div className="mt-1">
                        <select
                        id="role"
                        name="role"
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        className="appearance-none block w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                        >
                        <option value="student">Student</option>
                        <option value="teacher">Teacher</option>
                        <option value="parent">Parent</option>
                        </select>
                    </div>
                    </div>

                    {role === "student" && (
                    <>
                        <div>
                        <label htmlFor="grade" className="block text-sm font-medium">
                            Grade
                        </label>
                        <div className="mt-1">
                            <select
                            id="grade"
                            name="grade"
                            value={grade}
                            onChange={(e) => setGrade(e.target.value)}
                            className="appearance-none block w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                            >
                            <option value="">Select Grade</option>
                            <option value="Pre-K">Pre-K</option>
                            <option value="Kindergarten">Kindergarten</option>
                            <option value="1st Grade">1st Grade</option>
                            <option value="2nd Grade">2nd Grade</option>
                            <option value="3rd Grade">3rd Grade</option>
                            <option value="4th Grade">4th Grade</option>
                            <option value="5th Grade">5th Grade</option>
                            <option value="6th Grade">6th Grade</option>
                            <option value="7th Grade">7th Grade</option>
                            <option value="8th Grade">8th Grade</option>
                            <option value="9th Grade">9th Grade</option>
                            <option value="10th Grade">10th Grade</option>
                            <option value="11th Grade">11th Grade</option>
                            <option value="12th Grade">12th Grade</option>
                            <option value="College">College</option>
                            <option value="Adult">Adult</option>
                            </select>
                        </div>
                        </div>

                        <div>
                        <label htmlFor="parentEmail" className="block text-sm font-medium">
                            Parent Email (Optional)
                        </label>
                        <div className="mt-1">
                            <input
                            id="parentEmail"
                            name="parentEmail"
                            type="email"
                            value={parentEmail}
                            onChange={(e) => setParentEmail(e.target.value)}
                            placeholder="parent@example.com"
                            className="appearance-none block w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                            />
                        </div>
                        </div>

                        <div>
                        <label htmlFor="parentPhone" className="block text-sm font-medium">
                            Parent Phone (Optional)
                        </label>
                        <div className="mt-1">
                            <input
                            id="parentPhone"
                            name="parentPhone"
                            type="tel"
                            value={parentPhone}
                            onChange={(e) => setParentPhone(e.target.value)}
                            placeholder="(123) 456-7890"
                            className="appearance-none block w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                            />
                        </div>
                        </div>
                    </>
                    )}

                    <div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50"
                    >
                        {loading ? "Creating account..." : "Sign up"}
                    </button>
                    </div>
                </form>
            </CardContent>
        </Card>
      </div>
    </div>
  )
}