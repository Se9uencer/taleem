"use server"

import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

async function syncUserSettings(supabase, userId) {
  try {
    // Get user's theme preferences
    const { data } = await supabase.from("profiles").select("theme, color_accent").eq("id", userId).single()

    if (data) {
      // Save to localStorage for immediate access on next page load
      if (data.theme) {
        localStorage.setItem("taleem-theme", data.theme)
      }

      if (data.color_accent) {
        localStorage.setItem("taleem-color", data.color_accent)
      }
    }
  } catch (error) {
    console.error("Error syncing user settings:", error)
  }
}

export async function signIn(formData: FormData) {
  const supabase = createServerClient()

  const email = formData.get("email") as string
  const password = formData.get("password") as string

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { error: error.message }
  }

  // Check if user has a profile
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).single()

  if (!profile) {
    // Create a profile if it doesn't exist
    await supabase.from("profiles").insert({
      id: data.user.id,
      email: data.user.email,
      role: "student", // Default role
    })
  }

  // Sync user settings to localStorage
  await syncUserSettings(supabase, data.user.id)

  redirect("/dashboard")
}

export async function signOut() {
  const supabase = createServerClient()
  await supabase.auth.signOut()
  redirect("/login")
}
