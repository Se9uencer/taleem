"use client"

import type React from "react"
import { createContext, useContext, useEffect, useState } from "react"
import { createClientComponentClient } from "@/lib/supabase/client"

type Theme = "light" | "dark" | "system"
type ColorAccent = "purple" | "blue" | "teal" | "green"

interface SettingsContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  colorAccent: ColorAccent
  setColorAccent: (color: ColorAccent) => void
  saveSettingsToSupabase: () => Promise<void>
  isLoading: boolean
  resolvedTheme: "light" | "dark" // The actual theme after resolving system preference
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("system")
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light")
  const [colorAccent, setColorAccentState] = useState<ColorAccent>("purple")
  const [mounted, setMounted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Load settings from localStorage on mount
  useEffect(() => {
    // Set mounted state
    setMounted(true)

    // First, immediately apply any theme from localStorage to avoid flash
    const storedTheme = localStorage.getItem("taleem-theme") as Theme | null
    const storedColor = localStorage.getItem("taleem-color") as ColorAccent | null

    if (storedTheme) {
      setThemeState(storedTheme)
    }

    if (storedColor) {
      setColorAccentState(storedColor)
    }

    // Then load settings from user's profile in Supabase if they're logged in
    const loadSettingsFromSupabase = async () => {
      try {
        const supabase = createClientComponentClient()
        const { data: session } = await supabase.auth.getSession()

        if (session?.session?.user) {
          const { data } = await supabase
            .from("profiles")
            .select("theme, color_accent")
            .eq("id", session.session.user.id)
            .single()

          if (data) {
            // Only update if settings exist in the database
            if (data.theme) {
              setThemeState(data.theme as Theme)
              localStorage.setItem("taleem-theme", data.theme)
            }

            if (data.color_accent) {
              setColorAccentState(data.color_accent as ColorAccent)
              localStorage.setItem("taleem-color", data.color_accent)
            }
          }
        }
      } catch (error) {
        console.error("Error loading settings from Supabase:", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadSettingsFromSupabase()
  }, [])

  // Update the document with the current theme
  useEffect(() => {
    if (!mounted) return

    const root = window.document.documentElement
    root.classList.remove("light", "dark")

    // Handle system preference
    let resolvedMode: "light" | "dark"
    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
      root.classList.add(systemTheme)
      resolvedMode = systemTheme
    } else {
      root.classList.add(theme)
      resolvedMode = theme as "light" | "dark"
    }

    setResolvedTheme(resolvedMode)

    // Update CSS variable for primary color
    root.style.setProperty("--primary", `var(--color-${colorAccent})`)

    // Store in localStorage
    localStorage.setItem("taleem-theme", theme)
    localStorage.setItem("taleem-color", colorAccent)

    // Set data attribute for easier CSS targeting
    root.setAttribute("data-theme", resolvedMode)
    root.setAttribute("data-accent", colorAccent)

    setIsLoading(false)
  }, [theme, colorAccent, mounted])

  // Listen for system theme changes
  useEffect(() => {
    if (!mounted) return

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")

    const handleChange = () => {
      if (theme === "system") {
        const newTheme = mediaQuery.matches ? "dark" : "light"
        document.documentElement.classList.remove("light", "dark")
        document.documentElement.classList.add(newTheme)
        setResolvedTheme(newTheme)
        document.documentElement.setAttribute("data-theme", newTheme)
      }
    }

    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [theme, mounted])

  // Set theme function
  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme)
  }

  // Set color accent function
  const setColorAccent = (newColor: ColorAccent) => {
    setColorAccentState(newColor)
  }

  // Save theme and color accent preferences to the user's profile in Supabase
  const saveSettingsToSupabase = async () => {
    try {
      const supabase = createClientComponentClient()
      const { data: session } = await supabase.auth.getSession()

      if (session?.session?.user) {
        await supabase
          .from("profiles")
          .update({
            theme,
            color_accent: colorAccent,
            updated_at: new Date().toISOString(),
          })
          .eq("id", session.session.user.id)
      }

      return Promise.resolve()
    } catch (error) {
      console.error("Error saving settings to Supabase:", error)
      return Promise.reject(error)
    }
  }

  return (
    <SettingsContext.Provider
      value={{
        theme,
        setTheme,
        colorAccent,
        setColorAccent,
        saveSettingsToSupabase,
        isLoading,
        resolvedTheme,
      }}
    >
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider")
  }
  return context
}
