"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { createClientComponentClient } from "@/lib/supabase/client"
import AuthenticatedLayout from "@/components/authenticated-layout"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/use-toast"
import {
  BookOpen,
  CheckCircle,
  Clock,
  FileText,
  Headphones,
  AlertCircle,
  ChevronRight,
  BarChart2,
  RefreshCw,
} from "lucide-react"
import { formatDatePST, isPastDuePST } from "@/lib/date-utils"

export default function AssignmentsPage() {
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [assignments, setAssignments] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState("all")
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialTab = searchParams.get("tab")
  const message = searchParams.get("message")
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (initialTab && ["all", "pending", "completed", "overdue"].includes(initialTab)) {
      setActiveTab(initialTab)
    }

    // Show success message if present
    if (message) {
      toast({
        title: "Success",
        description: message,
      })
    }
  }, [initialTab, message])

  // Fetch student assignments function
  const fetchStudentAssignments = async (supabase: any, userId: string) => {
    try {
      console.log("Fetching assignments for student:", userId)

      // Step 1: Get all assignment IDs assigned to this student
      const { data: assignmentStudents, error: assignmentStudentsError } = await supabase
        .from("assignment_students")
        .select("assignment_id")
        .eq("student_id", userId)

      if (assignmentStudentsError) {
        throw new Error(`Failed to load assignments: ${assignmentStudentsError.message}`)
      }

      if (!assignmentStudents || assignmentStudents.length === 0) {
        console.log("No assignments found for student")
        return []
      }

      const assignmentIds = assignmentStudents.map((item) => item.assignment_id)
      console.log(`Found ${assignmentIds.length} assignments for student:`, assignmentIds)

      // Step 2: Fetch full assignment details
      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from("assignments")
        .select(`
        id, 
        title, 
        surah, 
        surah_name,
        start_ayah, 
        end_ayah, 
        due_date,
        created_at,
        class_id,
        classes(id, name, grade_level)
      `)
        .in("id", assignmentIds)
        .order("due_date", { ascending: false })

      if (assignmentsError) {
        throw new Error(`Failed to load assignment details: ${assignmentsError.message}`)
      }

      console.log(`Fetched ${assignmentsData?.length || 0} assignment details`)

      // Step 3: Fetch recitations (submissions) for these assignments
      // IMPORTANT: We're explicitly NOT using is_latest here to get ALL recitations
      // FIXED: Removed transcript from feedback selection as it doesn't exist
      const { data: recitationsData, error: recitationsError } = await supabase
        .from("recitations")
        .select(`
        id,
        assignment_id,
        submitted_at,
        audio_url,
        is_latest,
        feedback(id, accuracy, notes)
      `)
        .eq("student_id", userId)
        .in("assignment_id", assignmentIds)

      if (recitationsError) {
        console.error("Error fetching recitations:", recitationsError)
        // Continue even if there's an error fetching recitations
      }

      console.log(`Fetched ${recitationsData?.length || 0} recitations`)

      // Step 4: Create a map of assignment IDs to recitations
      const recitationMap = new Map()
      if (recitationsData && recitationsData.length > 0) {
        // First, group recitations by assignment_id
        const recitationsByAssignment = recitationsData.reduce((acc, recitation) => {
          if (!acc[recitation.assignment_id]) {
            acc[recitation.assignment_id] = []
          }
          acc[recitation.assignment_id].push(recitation)
          return acc
        }, {})

        // For each assignment, find the latest recitation
        Object.keys(recitationsByAssignment).forEach((assignmentId) => {
          const assignmentRecitations = recitationsByAssignment[assignmentId]

          // Find the recitation marked as latest
          const latestRecitation = assignmentRecitations.find((r) => r.is_latest)

          // If none is marked as latest, sort by submitted_at and take the most recent
          if (!latestRecitation && assignmentRecitations.length > 0) {
            assignmentRecitations.sort(
              (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime(),
            )
            recitationMap.set(assignmentId, assignmentRecitations[0])
          } else if (latestRecitation) {
            recitationMap.set(assignmentId, latestRecitation)
          }
        })
      }

      console.log(`Created recitation map with ${recitationMap.size} entries`)

      // Step 5: Process assignments with submission status
      return assignmentsData.map((assignment) => {
        const recitation = recitationMap.get(assignment.id)
        const isOverdue = isPastDuePST(assignment.due_date)

        // Log the status determination for debugging
        console.log(`Assignment ${assignment.id}: recitation=${!!recitation}, isOverdue=${isOverdue}`)

        return {
          ...assignment,
          recitation,
          status: recitation ? "completed" : isOverdue ? "overdue" : "pending",
          feedback: recitation?.feedback || null,
        }
      })
    } catch (error) {
      console.error("Error in fetchStudentAssignments:", error)
      throw error
    }
  }

  // Load data function
  const loadData = async () => {
    try {
      setLoading(true)
      const supabase = createClientComponentClient()

      // Check if user is authenticated
      const { data: sessionData } = await supabase.auth.getSession()

      if (!sessionData.session) {
        router.push("/login")
        return
      }

      const userId = sessionData.session.user.id

      // Get user profile
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single()

      if (profileError || !profileData) {
        throw new Error("Failed to load profile")
      }

      // Verify user is a student
      if (profileData.role !== "student") {
        router.push("/dashboard")
        return
      }

      setProfile(profileData)

      // Fetch assignments using our dedicated function
      const processedAssignments = await fetchStudentAssignments(supabase, userId)
      console.log(`Setting ${processedAssignments.length} assignments to state`)
      setAssignments(processedAssignments)
    } catch (error: any) {
      console.error("Error loading assignments:", error)
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [router])

  // Helper function to generate assignment title
  const generateAssignmentTitle = (surahName: string, startAyah: number, endAyah: number) => {
    if (!surahName) return "Assignment"

    // Extract just the surah name without the number and parentheses
    const surahNameOnly = surahName.replace(/^\d+\.\s+/, "").split(" (")[0]

    if (startAyah === endAyah) {
      return `${surahNameOnly} - Ayah ${startAyah}`
    }
    return `${surahNameOnly} - Ayahs ${startAyah}-${endAyah}`
  }

  // Format date to display in a readable format
  const formatDate = (dateString: string) => {
    return formatDatePST(dateString)
  }

  // Filter assignments based on active tab
  const getFilteredAssignments = () => {
    if (!assignments || assignments.length === 0) {
      return []
    }

    switch (activeTab) {
      case "pending":
        return assignments.filter((a) => a.status === "pending")
      case "completed":
        return assignments.filter((a) => a.status === "completed")
      case "overdue":
        return assignments.filter((a) => a.status === "overdue")
      default:
        return assignments
    }
  }

  // Get status badge color
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
            <CheckCircle className="w-3 h-3 mr-1" />
            Completed
          </span>
        )
      case "pending":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </span>
        )
      case "overdue":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
            <AlertCircle className="w-3 h-3 mr-1" />
            Overdue
          </span>
        )
      default:
        return null
    }
  }

  // Refresh function
  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const supabase = createClientComponentClient()
      const { data: sessionData } = await supabase.auth.getSession()

      if (sessionData.session) {
        const userId = sessionData.session.user.id
        const processedAssignments = await fetchStudentAssignments(supabase, userId)
        setAssignments(processedAssignments)
        toast({
          title: "Refreshed",
          description: "Your assignments have been refreshed",
        })
      }
    } catch (error) {
      console.error("Error refreshing assignments:", error)
      toast({
        title: "Error",
        description: "Failed to refresh assignments",
        variant: "destructive",
      })
    } finally {
      setRefreshing(false)
    }
  }

  if (loading) {
    return (
      <AuthenticatedLayout>
        <div className="flex justify-center items-center h-64">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        </div>
      </AuthenticatedLayout>
    )
  }

  const filteredAssignments = getFilteredAssignments()

  return (
    <AuthenticatedLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">My Assignments</h1>
            <p className="mt-1 text-sm text-muted-foreground">View and manage all your Quran recitation assignments</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="mt-2 md:mt-0">
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing..." : "Refresh"}
          </Button>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg mb-6">
            <h3 className="text-red-800 dark:text-red-300 font-medium">Error Loading Assignments</h3>
            <p className="text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        <Tabs defaultValue={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="bg-card border rounded-lg p-1 inline-block">
            <TabsList className="grid grid-cols-4 w-full md:w-auto">
              <TabsTrigger value="all" className="px-4 py-2">
                All ({assignments.length})
              </TabsTrigger>
              <TabsTrigger value="pending" className="px-4 py-2">
                Pending ({assignments.filter((a) => a.status === "pending").length})
              </TabsTrigger>
              <TabsTrigger value="completed" className="px-4 py-2">
                Completed ({assignments.filter((a) => a.status === "completed").length})
              </TabsTrigger>
              <TabsTrigger value="overdue" className="px-4 py-2">
                Overdue ({assignments.filter((a) => a.status === "overdue").length})
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value={activeTab} className="space-y-6">
            {filteredAssignments.length === 0 ? (
              <div className="bg-card border rounded-lg p-8 text-center">
                <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">No assignments found</h3>
                <p className="text-muted-foreground max-w-md mx-auto mb-6">
                  {activeTab === "all"
                    ? assignments.length === 0
                      ? "You don't have any assignments yet. Your teacher will assign work to you soon."
                      : "No assignments match the current filters. Try changing your filter settings."
                    : activeTab === "pending"
                      ? "You don't have any pending assignments. Check the other tabs to see your completed or overdue assignments."
                      : activeTab === "completed"
                        ? "You haven't completed any assignments yet. Complete your pending assignments to see them here."
                        : "You don't have any overdue assignments. Keep up the good work!"}
                </p>
                {activeTab !== "pending" && assignments.filter((a) => a.status === "pending").length > 0 && (
                  <Button onClick={() => setActiveTab("pending")} variant="outline">
                    View Pending Assignments
                  </Button>
                )}
              </div>
            ) : (
              filteredAssignments.map((assignment) => (
                <Card key={assignment.id} className="overflow-hidden">
                  <CardContent className="p-0">
                    <div className="p-6 border-b border-border">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-start gap-2">
                            <div className="mt-1">
                              <BookOpen className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <h3 className="text-lg font-semibold text-foreground">
                                {assignment.title ||
                                  (assignment.surah_name && assignment.start_ayah && assignment.end_ayah
                                    ? generateAssignmentTitle(
                                        assignment.surah_name,
                                        assignment.start_ayah,
                                        assignment.end_ayah,
                                      )
                                    : assignment.surah)}
                              </h3>
                              <div className="mt-1 text-sm text-muted-foreground">
                                {assignment.classes?.name && (
                                  <span className="inline-block mr-3">Class: {assignment.classes.name}</span>
                                )}
                                <span className="inline-block">Due: {formatDate(assignment.due_date)}</span>
                              </div>
                            </div>
                          </div>

                          <div className="mt-4">
                            <p className="text-sm text-foreground">
                              <span className="font-medium">Surah:</span>{" "}
                              {assignment.surah_name
                                ? assignment.surah_name.split(" (")[0].replace(/^\d+\.\s+/, "")
                                : assignment.surah}
                              {assignment.start_ayah && assignment.end_ayah && (
                                <>
                                  , <span className="font-medium">Ayahs:</span> {assignment.start_ayah}-
                                  {assignment.end_ayah}
                                </>
                              )}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col items-start md:items-end gap-2">
                          <div>{getStatusBadge(assignment.status)}</div>
                          {assignment.status === "completed" ? (
                            <Link
                              href={`/assignments/${assignment.id}/feedback`}
                              className="inline-flex items-center text-sm font-medium text-primary hover:text-primary/80"
                            >
                              View Feedback
                              <ChevronRight className="ml-1 h-4 w-4" />
                            </Link>
                          ) : (
                            <Link
                              href={`/recitations/new?assignment=${assignment.id}`}
                              className="inline-flex items-center text-sm font-medium text-primary hover:text-primary/80"
                            >
                              {assignment.status === "overdue" ? "Submit Late" : "Submit Recitation"}
                              <ChevronRight className="ml-1 h-4 w-4" />
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>

                    {assignment.status === "completed" && assignment.recitation && (
                      <div className="p-6 bg-muted/30">
                        <h4 className="text-sm font-medium text-foreground mb-3">Your Submission</h4>
                        <div className="space-y-4">
                          <div className="flex items-center">
                            <div className="bg-primary/10 p-2 rounded-full mr-3">
                              <Headphones className="h-5 w-5 text-primary" />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm text-foreground mb-1">Recitation Audio</p>
                              <audio controls src={assignment.recitation.audio_url} className="w-full h-10 max-w-md">
                                Your browser does not support the audio element.
                              </audio>
                            </div>
                          </div>

                          {assignment.feedback && (
                            <div className="flex items-start">
                              <div className="bg-primary/10 p-2 rounded-full mr-3 mt-1">
                                <BarChart2 className="h-5 w-5 text-primary" />
                              </div>
                              <div>
                                <p className="text-sm text-foreground mb-1">Feedback Summary</p>
                                <div className="flex items-center mb-2">
                                  <div className="text-sm font-medium mr-2">Accuracy:</div>
                                  <div className="bg-muted h-2 rounded-full flex-1 max-w-xs">
                                    <div
                                      className="bg-primary h-2 rounded-full"
                                      style={{
                                        width: `${Math.round(assignment.feedback.accuracy * 100)}%`,
                                      }}
                                    ></div>
                                  </div>
                                  <div className="ml-2 text-sm">{Math.round(assignment.feedback.accuracy * 100)}%</div>
                                </div>
                                {assignment.feedback.notes && (
                                  <p className="text-sm text-muted-foreground">{assignment.feedback.notes}</p>
                                )}
                                <Link
                                  href={`/assignments/${assignment.id}/feedback`}
                                  className="text-sm font-medium text-primary hover:text-primary/80 mt-2 inline-block"
                                >
                                  View Detailed Feedback
                                </Link>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AuthenticatedLayout>
  )
}
