"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClientComponentClient } from "@/lib/supabase/client"
import { AcademicHeader } from "@/components/academic-header"
import { useSettings } from "@/contexts/settings-context"

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const { isLoading: settingsLoading, resolvedTheme } = useSettings()

  useEffect(() => {
    const checkAuth = async () => {
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
        console.error("Error loading profile:", profileError)
        // Still set the user with basic info from auth
        setUser({
          id: sessionData.session.user.id,
          email: sessionData.session.user.email,
          role: sessionData.session.user.user_metadata?.role || "student",
        })
      } else {
        setUser(profileData)
      }

      setLoading(false)
    }

    checkAuth()
  }, [router])

  if (loading || settingsLoading) {
    // Get the current theme from localStorage to show correct loading state
    const currentTheme = typeof window !== "undefined" ? localStorage.getItem("taleem-theme") || "system" : "system"

    const isDarkMode =
      currentTheme === "dark" ||
      (currentTheme === "system" &&
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches)

    return (
      <div className={`min-h-screen flex items-center justify-center ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}>
        <div className="w-16 h-16 border-4 border-muted border-t-primary rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <AcademicHeader user={user} />
      <main className="flex-1">{children}</main>
    </div>
  )
}
