"use client"

import { useState, useEffect } from "react"
import AuthenticatedLayout from "@/components/authenticated-layout"
import { useSettings } from "@/contexts/settings-context"
import { createClientComponentClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Moon, Sun, Monitor, LogOut, User, Mail, Shield, FileText, Check } from "lucide-react"
import { toast } from "@/components/ui/use-toast"

export default function SettingsPage() {
  const { theme, setTheme, colorAccent, setColorAccent, saveSettingsToSupabase, resolvedTheme } = useSettings()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [termsOpen, setTermsOpen] = useState(false)
  const router = useRouter()

  // Fetch user data
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        setLoading(true)
        const supabase = createClientComponentClient()

        // Get session
        const { data: sessionData } = await supabase.auth.getSession()

        if (!sessionData.session) {
          router.push("/login")
          return
        }

        // Get user profile
        const { data: profileData } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", sessionData.session.user.id)
          .single()

        if (profileData) {
          setUser(profileData)
        }
      } catch (error) {
        console.error("Error fetching user data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchUserData()
  }, [router])

  const handleSaveSettings = async () => {
    setSaving(true)
    try {
      await saveSettingsToSupabase()
      toast({
        title: "Settings saved",
        description: "Your preferences have been updated successfully.",
        variant: "default",
      })
    } catch (error) {
      toast({
        title: "Error saving settings",
        description: "There was a problem saving your preferences.",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleSignOut = async () => {
    try {
      const supabase = createClientComponentClient()
      await supabase.auth.signOut()
      router.push("/login")
    } catch (error) {
      console.error("Error signing out:", error)
      toast({
        title: "Error signing out",
        description: "There was a problem signing out. Please try again.",
        variant: "destructive",
      })
    }
  }

  return (
    <AuthenticatedLayout>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6 text-foreground">Settings</h1>

        <div className="space-y-6">
          {/* Theme & Appearance */}
          <Card className="border border-border bg-card shadow-sm">
            <CardHeader className="border-b border-border">
              <CardTitle className="text-card-foreground">Theme & Appearance</CardTitle>
              <CardDescription className="text-muted-foreground">Customize how Taleem looks and feels</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              {/* Theme Selection */}
              <div>
                <h3 className="text-sm font-medium text-foreground mb-4">Theme</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div
                    className={`relative rounded-lg border ${
                      theme === "light"
                        ? "border-primary ring-2 ring-primary ring-offset-2"
                        : "border-border hover:border-primary/50"
                    } p-4 cursor-pointer transition-all`}
                    onClick={() => setTheme("light")}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <Sun className="h-5 w-5 text-foreground" />
                      {theme === "light" && (
                        <div className="bg-primary text-primary-foreground rounded-full p-1">
                          <Check className="h-3 w-3" />
                        </div>
                      )}
                    </div>
                    <div className="h-24 rounded-md bg-white border border-gray-200 mb-2 flex items-center justify-center dark:bg-gray-100">
                      <div className="w-12 h-4 bg-gray-800 rounded"></div>
                    </div>
                    <p className="text-sm font-medium text-foreground">Light</p>
                    <p className="text-xs text-muted-foreground">Light background with dark text</p>
                  </div>

                  <div
                    className={`relative rounded-lg border ${
                      theme === "dark"
                        ? "border-primary ring-2 ring-primary ring-offset-2"
                        : "border-border hover:border-primary/50"
                    } p-4 cursor-pointer transition-all`}
                    onClick={() => setTheme("dark")}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <Moon className="h-5 w-5 text-foreground" />
                      {theme === "dark" && (
                        <div className="bg-primary text-primary-foreground rounded-full p-1">
                          <Check className="h-3 w-3" />
                        </div>
                      )}
                    </div>
                    <div className="h-24 rounded-md bg-gray-900 border border-gray-700 mb-2 flex items-center justify-center">
                      <div className="w-12 h-4 bg-gray-100 rounded"></div>
                    </div>
                    <p className="text-sm font-medium text-foreground">Dark</p>
                    <p className="text-xs text-muted-foreground">Dark background with light text</p>
                  </div>

                  <div
                    className={`relative rounded-lg border ${
                      theme === "system"
                        ? "border-primary ring-2 ring-primary ring-offset-2"
                        : "border-border hover:border-primary/50"
                    } p-4 cursor-pointer transition-all`}
                    onClick={() => setTheme("system")}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <Monitor className="h-5 w-5 text-foreground" />
                      {theme === "system" && (
                        <div className="bg-primary text-primary-foreground rounded-full p-1">
                          <Check className="h-3 w-3" />
                        </div>
                      )}
                    </div>
                    <div className="h-24 rounded-md bg-gradient-to-r from-white to-gray-900 border border-gray-300 mb-2 flex items-center justify-center">
                      <div className="w-12 h-4 bg-gradient-to-r from-gray-800 to-gray-100 rounded"></div>
                    </div>
                    <p className="text-sm font-medium text-foreground">System</p>
                    <p className="text-xs text-muted-foreground">Follows your device settings</p>
                    <p className="text-xs text-primary mt-1">
                      Currently: {resolvedTheme === "dark" ? "Dark" : "Light"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Color Accent Selection */}
              <div className="pt-4 border-t border-border">
                <h3 className="text-sm font-medium text-foreground mb-4">Color Accent</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div
                    className={`relative rounded-lg border ${
                      colorAccent === "purple"
                        ? "border-primary ring-2 ring-primary ring-offset-2"
                        : "border-border hover:border-primary/50"
                    } p-4 cursor-pointer transition-all`}
                    onClick={() => setColorAccent("purple")}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="color-sample color-sample-purple"></div>
                      {colorAccent === "purple" && (
                        <div className="bg-primary text-primary-foreground rounded-full p-1">
                          <Check className="h-3 w-3" />
                        </div>
                      )}
                    </div>
                    <p className="text-sm font-medium text-foreground">Purple</p>
                  </div>

                  <div
                    className={`relative rounded-lg border ${
                      colorAccent === "blue"
                        ? "border-primary ring-2 ring-primary ring-offset-2"
                        : "border-border hover:border-primary/50"
                    } p-4 cursor-pointer transition-all`}
                    onClick={() => setColorAccent("blue")}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="color-sample color-sample-blue"></div>
                      {colorAccent === "blue" && (
                        <div className="bg-primary text-primary-foreground rounded-full p-1">
                          <Check className="h-3 w-3" />
                        </div>
                      )}
                    </div>
                    <p className="text-sm font-medium text-foreground">Blue</p>
                  </div>

                  <div
                    className={`relative rounded-lg border ${
                      colorAccent === "teal"
                        ? "border-primary ring-2 ring-primary ring-offset-2"
                        : "border-border hover:border-primary/50"
                    } p-4 cursor-pointer transition-all`}
                    onClick={() => setColorAccent("teal")}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="color-sample color-sample-teal"></div>
                      {colorAccent === "teal" && (
                        <div className="bg-primary text-primary-foreground rounded-full p-1">
                          <Check className="h-3 w-3" />
                        </div>
                      )}
                    </div>
                    <p className="text-sm font-medium text-foreground">Teal</p>
                  </div>

                  <div
                    className={`relative rounded-lg border ${
                      colorAccent === "green"
                        ? "border-primary ring-2 ring-primary ring-offset-2"
                        : "border-border hover:border-primary/50"
                    } p-4 cursor-pointer transition-all`}
                    onClick={() => setColorAccent("green")}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="color-sample color-sample-green"></div>
                      {colorAccent === "green" && (
                        <div className="bg-primary text-primary-foreground rounded-full p-1">
                          <Check className="h-3 w-3" />
                        </div>
                      )}
                    </div>
                    <p className="text-sm font-medium text-foreground">Green</p>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleSaveSettings}
                disabled={saving}
                className="mt-4 bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {saving ? "Saving..." : "Save Preferences"}
              </Button>
            </CardContent>
          </Card>

          {/* User Information */}
          <Card className="border border-border bg-card shadow-sm">
            <CardHeader className="border-b border-border">
              <CardTitle className="text-card-foreground">User Information</CardTitle>
              <CardDescription className="text-muted-foreground">Your account details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {loading ? (
                <div className="animate-pulse space-y-3">
                  <div className="h-5 bg-muted rounded w-1/3"></div>
                  <div className="h-5 bg-muted rounded w-1/2"></div>
                  <div className="h-5 bg-muted rounded w-1/4"></div>
                </div>
              ) : (
                <>
                  <div className="flex items-start space-x-3">
                    <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Name</p>
                      <p className="text-sm text-muted-foreground">
                        {user?.first_name && user?.last_name ? `${user.first_name} ${user.last_name}` : "Not provided"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Email</p>
                      <p className="text-sm text-muted-foreground">{user?.email}</p>
                    </div>
                  </div>

                  <div className="flex items-start space-x-3">
                    <Shield className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-foreground">Role</p>
                      <p className="text-sm text-muted-foreground capitalize">{user?.role || "Unknown"}</p>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Privacy & Legal */}
          <Card className="border border-border bg-card shadow-sm">
            <CardHeader className="border-b border-border">
              <CardTitle className="text-card-foreground">Privacy & Legal</CardTitle>
              <CardDescription className="text-muted-foreground">Review our policies and terms</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <Dialog open={privacyOpen} onOpenChange={setPrivacyOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start border-border hover:bg-accent hover:text-accent-foreground"
                  >
                    <Shield className="h-4 w-4 mr-2" />
                    Privacy Policy
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto bg-background border-border">
                  <DialogHeader>
                    <DialogTitle className="text-foreground">Privacy Policy</DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                      Last updated: April 15, 2024
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 text-sm text-foreground">
                    <h3 className="text-base font-medium text-foreground">1. Introduction</h3>
                    <p>
                      Welcome to Taleem ("we," "our," or "us"). We are committed to protecting your privacy and personal
                      information. This Privacy Policy explains how we collect, use, disclose, and safeguard your
                      information when you use our platform.
                    </p>

                    {/* Additional privacy policy content omitted for brevity */}
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={termsOpen} onOpenChange={setTermsOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start border-border hover:bg-accent hover:text-accent-foreground"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Terms of Use
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto bg-background border-border">
                  <DialogHeader>
                    <DialogTitle className="text-foreground">Terms of Use</DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                      Last updated: April 15, 2024
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 text-sm text-foreground">
                    <h3 className="text-base font-medium text-foreground">1. Acceptance of Terms</h3>
                    <p>
                      By accessing or using Taleem, you agree to be bound by these Terms of Use and all applicable laws
                      and regulations. If you do not agree with any of these terms, you are prohibited from using or
                      accessing this platform.
                    </p>

                    {/* Additional terms of use content omitted for brevity */}
                  </div>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>

          {/* Logout */}
          <Card className="border border-border bg-card shadow-sm">
            <CardHeader className="border-b border-border">
              <CardTitle className="text-card-foreground">Account</CardTitle>
              <CardDescription className="text-muted-foreground">Manage your account access</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <Button
                variant="destructive"
                onClick={handleSignOut}
                className="flex items-center focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AuthenticatedLayout>
  )
}
