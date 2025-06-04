"use server"

import { createServerClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

// The syncUserSettings function has been removed as it's redundant
// and was causing an error by trying to use localStorage on the server.
// Theme and color settings are handled by SettingsProvider on the client-side.

export async function signIn(formData: FormData) {
  const supabase = await createServerClient()

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
  // Ensure data.user exists before trying to access its properties
  if (data && data.user) {
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).single()

    if (!profile) {
      // Create a profile if it doesn't exist
      await supabase.from("profiles").insert({
        id: data.user.id,
        email: data.user.email, // Make sure email is available from data.user
        role: "student", // Default role
      })
    }
  } else {
    // Handle case where data.user is null, though signInWithPassword error should catch this
    return { error: "Login failed, user data not available." }
  }

  // The call to syncUserSettings has been removed.
  // SettingsProvider will handle loading settings from Supabase on the client-side after redirect.

  redirect("/dashboard")
}

export async function signOut() {
  const supabase = await createServerClient()
  await supabase.auth.signOut()
  redirect("/login")
}
