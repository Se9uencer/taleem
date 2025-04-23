"use client"

import "../auth-styles.css"
import type React from "react"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { TaleemLogo } from "@/components/taleem-logo"
import { createClientComponentClient } from "@/lib/supabase/client"
import { supabaseConfig } from "@/lib/config"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { AlertCircle, CheckCircle, Mail } from "lucide-react"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<string[]>([])
  const router = useRouter()
  const searchParams = useSearchParams()

  const [resendEmailVisible, setResendEmailVisible] = useState(false)
  const [currentEmail, setCurrentEmail] = useState("")
  const [resendingEmail, setResendingEmail] = useState(false)
  const [resendSuccess, setResendSuccess] = useState(false)

  // Force light mode on this page
  useEffect(() => {
    // Force light mode styling
    document.body.style.backgroundColor = "#f9fafb" // bg-gray-50
    document.body.style.color = "#111827" // text-gray-900

    // Remove any theme classes that might override our styles
    document.documentElement.classList.remove("dark")

    // Clean up when component unmounts
    return () => {
      document.body.style.backgroundColor = ""
      document.body.style.color = ""
    }
  }, [])

  useEffect(() => {
    // Check for message in URL
    const urlMessage = searchParams.get("message")
    if (urlMessage) {
      setMessage(urlMessage)
    }
  }, [searchParams])

  const addDebugInfo = (info: string) => {
    console.log(info)
    setDebugInfo((prev) => [...prev, info])
  }

  const createProfileIfNeeded = async (supabase: any, user: any) => {
    addDebugInfo(`Checking if profile exists for user ${user.id}`)

    // Check if profile exists
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle()

    if (profileError) {
      addDebugInfo(`Error checking profile: ${profileError.message}`)
      return false
    }

    if (!profile) {
      addDebugInfo("No profile found, creating one")

      // Extract user metadata
      const metadata = user.user_metadata || {}
      const role = metadata.role || "student"

      // Create profile
      const { error: insertError } = await supabase.from("profiles").insert({
        id: user.id,
        email: user.email.toLowerCase(),
        first_name: metadata.first_name || "",
        last_name: metadata.last_name || "",
        role: role,
        created_at: new Date().toISOString(),
        school_id: null, // Explicitly set to null
      })

      if (insertError) {
        addDebugInfo(`Error creating profile: ${insertError.message}`)
        return false
      }

      addDebugInfo(`Profile created with role: ${role}`)
      return true
    }

    addDebugInfo(`Profile exists with role: ${profile.role}`)
    return true
  }

  const handleResendConfirmationEmail = async () => {
    if (!currentEmail) return

    setResendingEmail(true)
    setResendSuccess(false)

    try {
      const supabase = createClientComponentClient()
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: currentEmail,
      })

      if (error) {
        throw error
      }

      setResendSuccess(true)
    } catch (error) {
      console.error("Error resending confirmation email:", error)
      setError(`Failed to resend confirmation email: ${error.message}`)
    } finally {
      setResendingEmail(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setDebugInfo([])
    setResendEmailVisible(false)

    try {
      if (!supabaseConfig.isValid()) {
        throw new Error("Invalid Supabase configuration")
      }

      const supabase = createClientComponentClient()

      // Normalize email (convert to lowercase and trim)
      const normalizedEmail = email.toLowerCase().trim()

      // Sign in the user
      addDebugInfo(`Attempting to sign in with email: ${normalizedEmail}`)

      // Add retry logic for authentication
      let authAttempt = 0
      const maxAuthAttempts = 3
      let authSuccess = false
      let data
      let signInError

      while (!authSuccess && authAttempt < maxAuthAttempts) {
        authAttempt++
        addDebugInfo(`Auth attempt ${authAttempt}/${maxAuthAttempts}`)

        try {
          const result = await supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password,
          })

          data = result.data
          signInError = result.error

          if (!signInError && data.user) {
            authSuccess = true
            addDebugInfo(`Auth successful on attempt ${authAttempt}`)
          } else {
            addDebugInfo(`Auth attempt ${authAttempt} failed: ${signInError?.message || "No user returned"}`)
            // Wait a bit before retrying
            if (authAttempt < maxAuthAttempts) {
              await new Promise((resolve) => setTimeout(resolve, 1000))
            }
          }
        } catch (err) {
          addDebugInfo(`Exception during auth attempt ${authAttempt}: ${err.message}`)
          // Wait a bit before retrying
          if (authAttempt < maxAuthAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 1000))
          }
        }
      }

      if (signInError) {
        // Just display the error message
        addDebugInfo(`Sign in error after ${authAttempt} attempts: ${signInError.message}`)
        throw signInError
      }

      if (!data.user) {
        addDebugInfo(`No user returned after ${authAttempt} attempts`)
        throw new Error("Login failed - no user returned")
      }

      addDebugInfo(`Sign in successful, user ID: ${data.user.id}`)

      // Ensure profile exists
      const profileCreated = await createProfileIfNeeded(supabase, data.user)
      addDebugInfo(`Profile check completed: ${profileCreated ? "Profile exists/created" : "Profile creation failed"}`)

      // Verify session is active
      const { data: sessionData } = await supabase.auth.getSession()
      addDebugInfo(`Session check: ${sessionData.session ? "Active" : "Not active"}`)

      // Add a small delay to ensure all database operations complete
      await new Promise((resolve) => setTimeout(resolve, 1000))

      addDebugInfo("Redirecting to dashboard...")

      // Use multiple redirect methods for redundancy
      try {
        // Store a flag in localStorage to indicate successful login
        localStorage.setItem("taleem-auth-success", "true")

        // Method 1: Next.js router
        router.push("/dashboard")

        // Method 2: Fallback to window.location after a delay
        setTimeout(() => {
          const redirected = localStorage.getItem("taleem-redirected")
          if (redirected !== "true") {
            addDebugInfo("Using fallback redirect method (window.location)")
            localStorage.setItem("taleem-redirected", "true")
            window.location.href = "/dashboard"
          }
        }, 1500)
      } catch (routerError) {
        addDebugInfo(`Router error: ${routerError}`)
        // Method 3: Direct location change if all else fails
        window.location.href = "/dashboard"
      }
    } catch (error: any) {
      console.error("Login error:", error)
      setError(error.message || "An error occurred during login")
      addDebugInfo(`Caught error: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8 bg-gray-50 auth-page"
      style={{ backgroundColor: "#f9fafb", color: "#111827" }}
    >
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <TaleemLogo className="h-12 w-auto mx-auto text-purple-600" />
        <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">Sign in to your account</h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Or{" "}
          <Link href="/signup" className="font-medium text-purple-600 hover:text-purple-500">
            create a new account
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <Card className="border border-gray-200 shadow-sm" style={{ backgroundColor: "white" }}>
          <CardContent className="p-6">
            {message && (
              <div className="mb-6 p-3 bg-green-50 text-green-700 rounded-md flex items-start">
                <CheckCircle className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
                <p>{message}</p>
              </div>
            )}

            {error && (
              <div className="mb-6 p-3 bg-red-50 text-red-700 rounded-md flex items-start">
                <AlertCircle className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}

            <form className="space-y-6" onSubmit={handleLogin}>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email address
                </label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ahmed.khan@example.com"
                  className="border-gray-300 focus:border-purple-500 focus:ring-purple-500"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="border-gray-300 focus:border-purple-500 focus:ring-purple-500"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <Link href="/forgot-password" className="font-medium text-purple-600 hover:text-purple-500">
                    Forgot your password?
                  </Link>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-purple-600 hover:bg-purple-700 focus:ring-purple-500"
                disabled={loading}
              >
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </form>

            {resendEmailVisible && (
              <div className="mt-6 p-4 bg-blue-50 rounded-md">
                <h3 className="text-sm font-medium text-blue-800 flex items-center">
                  <Mail className="h-4 w-4 mr-1.5" />
                  Email Confirmation Required
                </h3>
                <p className="text-sm text-blue-700 mt-1">
                  Please check your inbox and confirm your email before logging in.
                </p>
                {resendSuccess ? (
                  <div className="mt-2 p-2 bg-green-100 text-green-700 rounded-md text-sm flex items-center">
                    <CheckCircle className="h-4 w-4 mr-1.5" />
                    Confirmation email sent! Please check your inbox.
                  </div>
                ) : (
                  <Button
                    variant="link"
                    onClick={handleResendConfirmationEmail}
                    disabled={resendingEmail}
                    className="mt-2 p-0 h-auto text-blue-600 hover:text-blue-800 font-medium"
                  >
                    {resendingEmail ? "Sending..." : "Resend confirmation email"}
                  </Button>
                )}
              </div>
            )}

            {debugInfo.length > 0 && (
              <div className="mt-6 p-3 bg-gray-50 rounded-md">
                <details>
                  <summary className="text-sm font-medium cursor-pointer">Debug Information</summary>
                  <div className="mt-2 text-xs font-mono whitespace-pre-wrap max-h-60 overflow-y-auto">
                    {debugInfo.map((info, index) => (
                      <div key={index}>{info}</div>
                    ))}
                  </div>
                </details>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
