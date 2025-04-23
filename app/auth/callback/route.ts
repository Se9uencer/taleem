import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { cookies } from "next/headers"

// Add a comment to clarify that email confirmation is now optional
// This route still handles OAuth callbacks and password resets

export async function GET(request: Request) {
  // Note: Email confirmation is now optional, but this route still handles OAuth callbacks and password resets
  try {
    const requestUrl = new URL(request.url)
    const code = requestUrl.searchParams.get("code")
    const returnUrl = requestUrl.searchParams.get("returnUrl") || "/dashboard"

    console.log("Auth callback received", code ? "with code" : "without code")

    if (code) {
      const cookieStore = cookies()
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

      if (!supabaseUrl || !supabaseAnonKey) {
        console.error("Missing Supabase environment variables in auth callback")
        return NextResponse.redirect(new URL("/login?error=configuration", request.url))
      }

      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            cookieStore.set({ name, value, ...options })
          },
          remove(name: string, options: any) {
            cookieStore.set({ name, value: "", ...options })
          },
        },
      })

      try {
        // Add retry logic for code exchange
        let exchangeAttempt = 0
        const maxExchangeAttempts = 3
        let exchangeSuccess = false
        let exchangeError = null

        while (!exchangeSuccess && exchangeAttempt < maxExchangeAttempts) {
          exchangeAttempt++
          console.log(`Code exchange attempt ${exchangeAttempt}/${maxExchangeAttempts}`)

          try {
            const { data, error } = await supabase.auth.exchangeCodeForSession(code)

            if (error) {
              console.error(`Error on exchange attempt ${exchangeAttempt}:`, error)
              exchangeError = error
              // Wait before retrying
              if (exchangeAttempt < maxExchangeAttempts) {
                await new Promise((resolve) => setTimeout(resolve, 1000))
              }
            } else {
              exchangeSuccess = true
              console.log("Successfully exchanged code for session")
            }
          } catch (err) {
            console.error(`Exception on exchange attempt ${exchangeAttempt}:`, err)
            exchangeError = err
            // Wait before retrying
            if (exchangeAttempt < maxExchangeAttempts) {
              await new Promise((resolve) => setTimeout(resolve, 1000))
            }
          }
        }

        if (!exchangeSuccess) {
          console.error("Failed to exchange code after multiple attempts:", exchangeError)
          return NextResponse.redirect(new URL("/login?error=exchange", request.url))
        }

        // Verify session was created
        const { data: sessionData } = await supabase.auth.getSession()
        if (!sessionData.session) {
          console.error("Session not found after successful code exchange")
          return NextResponse.redirect(new URL("/login?error=session", request.url))
        }

        console.log("Session verified after code exchange")
      } catch (exchangeError) {
        console.error("Unhandled exception in code exchange:", exchangeError)
        return NextResponse.redirect(new URL("/login?error=exchange", request.url))
      }
    } else {
      console.log("No code provided in auth callback")
      return NextResponse.redirect(new URL("/login?error=no-code", request.url))
    }

    // URL to redirect to after sign in process completes
    const decodedReturnUrl = decodeURIComponent(returnUrl)
    const safeReturnUrl = decodedReturnUrl.startsWith("/") ? decodedReturnUrl : "/dashboard"

    console.log(`Auth callback completed, redirecting to: ${safeReturnUrl}`)
    return NextResponse.redirect(new URL(safeReturnUrl, request.url))
  } catch (error) {
    console.error("Unhandled error in auth callback:", error)
    return NextResponse.redirect(new URL("/login?error=unknown", request.url))
  }
}
