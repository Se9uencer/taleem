// This file centralizes all configuration values and provides fallbacks

// Supabase configuration
export const supabaseConfig = {
  // Use hardcoded values as fallbacks when environment variables are not available
  // These will be used during development or when environment variables fail to load
  url: process.env.NEXT_PUBLIC_SUPABASE_URL || "https://vxhmxmjptctqakpswsvs.supabase.co",
  anonKey:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4aG14bWpwdGN0cWFrcHN3c3ZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ1ODYzNTIsImV4cCI6MjA2MDE2MjM1Mn0.RWK6vW0JFeOfKY8XQZBbZGIiFYcp766bwFK9f2Gag2U",

  // Helper function to check if the configuration is valid
  isValid: function () {
    return (
      this.url.includes("supabase.co") &&
      this.anonKey.length > 10 &&
      !this.url.includes("your-project-ref") &&
      !this.anonKey.includes("your-anon-key")
    )
  },
}

// Log configuration status during development
if (process.env.NODE_ENV === "development") {
  console.log("Supabase config status:", {
    url: supabaseConfig.url ? "defined" : "undefined",
    anonKey: supabaseConfig.anonKey ? "defined" : "undefined",
    isValid: supabaseConfig.isValid(),
  })
}
