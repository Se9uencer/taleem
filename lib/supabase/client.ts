"use client"

import { createClient } from "@supabase/supabase-js"
import { supabaseConfig } from "../config"

// Create a singleton instance for client-side usage
let clientInstance: ReturnType<typeof createClient> | null = null

export const createClientComponentClient = () => {
  if (clientInstance) return clientInstance

  // Check if configuration is valid
  if (!supabaseConfig.isValid()) {
    console.error("Invalid Supabase configuration. Using fallback values which won't work in production.")
  }

  try {
    // Add retry logic and better error handling
    const maxRetries = 3
    let retryCount = 0

    const createClientWithRetry = () => {
      try {
        console.log(`Attempting to create Supabase client (attempt ${retryCount + 1}/${maxRetries})`)

        // Ensure we have values for URL and key
        if (!supabaseConfig.url || !supabaseConfig.anonKey) {
          throw new Error("Missing Supabase URL or anon key")
        }

        clientInstance = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            storageKey: "taleem-auth-token",
            detectSessionInUrl: true,
          },
        })
        return clientInstance
      } catch (error) {
        console.error(`Error creating Supabase client (attempt ${retryCount + 1}):`, error)
        retryCount++

        if (retryCount < maxRetries) {
          console.log(`Retrying client creation...`)
          return createClientWithRetry()
        }

        throw new Error(
          "Failed to initialize Supabase client after multiple attempts. Please check your configuration.",
        )
      }
    }

    return createClientWithRetry()
  } catch (error) {
    console.error("Error creating Supabase client:", error)
    throw new Error("Failed to initialize Supabase client. Please check your configuration.")
  }
}
