"use server"

import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { supabaseConfig } from "../config"

// Change to async function to comply with Server Actions requirements
export const createServerClient = async () => {
  try {
    const cookieStore = cookies()

    // Check if we have valid configuration
    if (!supabaseConfig.isValid()) {
      console.error("Invalid Supabase configuration in server client")
    }

    // Ensure we have values for URL and key
    if (!supabaseConfig.url || !supabaseConfig.anonKey) {
      throw new Error("Missing Supabase URL or anon key in server client")
    }

    return createClient(supabaseConfig.url, supabaseConfig.anonKey, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set() {
          // This is a read-only cookie in a server component
        },
        remove() {
          // This is a read-only cookie in a server component
        },
      },
    })
  } catch (error) {
    console.error("Error creating Supabase server client:", error)
    throw new Error("Failed to initialize Supabase server client. Please check your configuration.")
  }
}
