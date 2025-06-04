"use client"

import { useEffect, useState } from "react"
import { createClientComponentClient } from "@/lib/supabase/client"
import AuthenticatedLayout from "@/components/authenticated-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDatePST } from "@/lib/date-utils"
import { BookOpen, Calendar, CheckCircle, School, User, Users, XCircle } from "lucide-react"
import Link from "next/link"

export default function DashboardPage() {
  const [profile, setProfile] = useState<any>(null)
  const [classes, setClasses] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [completedAssignments, setCompletedAssignments] = useState<any[]>([])
  const [recitations, setRecitations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lateSubmissions, setLateSubmissions] = useState<any[]>([])
  const [showLateAlert, setShowLateAlert] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        const supabase = createClientComponentClient()

        // Check if user is authenticated
        const { data: sessionData } = await supabase.auth.getSession()

        if (!sessionData.session) {
          return
        }

        const userId = sessionData.session.user.id

        // Get user profile
        const { data: profileData } = await supabase.from("profiles").select("*").eq("id", userId).single()

        if (!profileData) {
          return
        }

        setProfile(profileData)

        // Fetch data based on user role
        if (profileData.role === "teacher") {
          await loadTeacherData(supabase, userId)
        } else if (profileData.role === "student") {
          await loadStudentData(supabase, userId)
        } else if (profileData.role === "parent") {
          // Parent data loading would go here
        }
      } catch (error: any) {
        console.error("Error loading dashboard:", error)
        setError(error.message || "An unexpected error occurred")
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const loadTeacherData = async (supabase: any, userId: string) => {
    try {
      // Fetch teacher's classes
      const { data: classesData } = await supabase
        .from("classes")
        .select("*")
        .eq("teacher_id", userId)
        .order("created_at", { ascending: false })

      // For each class, get the student count
      const classesWithDetails = await Promise.all(
        (classesData || []).map(async (classItem: any) => {
          const { count } = await supabase
            .from("class_students")
            .select("*", { count: "exact", head: true })
            .eq("class_id", classItem.id)

          return {
            ...classItem,
            student_count: count || 0,
          }
        }),
      )

      setClasses(classesWithDetails)

      // Fetch assignments
      const { data: assignmentsData } = await supabase
        .from("assignments")
        .select("id, title, surah, due_date, class_id, teacher_id, surah_name, start_ayah, end_ayah")
        .eq("teacher_id", userId)
        .gte("due_date", new Date().toISOString().split("T")[0])
        .order("due_date", { ascending: true })

      if (assignmentsData && assignmentsData.length > 0) {
        // Get unique class IDs
        const classIds = [...new Set(assignmentsData.map((a) => a.class_id).filter(Boolean))]

        // Fetch class names
        const { data: classesData } = await supabase.from("classes").select("id, name").in("id", classIds)

        // Create a map of class IDs to names
        const classMap = (classesData || []).reduce((map: any, c: any) => {
          map[c.id] = c.name
          return map
        }, {})

        // Add class names to assignments
        const formattedAssignments = assignmentsData.map((assignment) => ({
          ...assignment,
          class_name: assignment.class_id ? classMap[assignment.class_id] : undefined,
        }))

        setAssignments(formattedAssignments)
        // Fetch latest recitations for all assignments
        const assignmentIds = formattedAssignments.map((a: any) => a.id)
        if (assignmentIds.length > 0) {
          const { data: recitationsData } = await supabase
            .from("recitations")
            .select("id, assignment_id, student_id, submitted_at, is_latest, assignments(id, title, due_date), profiles(id, first_name, last_name)")
            .in("assignment_id", assignmentIds)
            .eq("is_latest", true)
          // Find late submissions
          const late = (recitationsData || []).filter((rec: any) => {
            const due = new Date(rec.assignments?.due_date)
            const submitted = new Date(rec.submitted_at)
            return submitted > due
          }).map((rec: any) => ({
            id: rec.id,
            student: rec.profiles ? `${rec.profiles.first_name} ${rec.profiles.last_name}` : rec.student_id,
            assignment: rec.assignments?.title || rec.assignment_id,
            submitted_at: rec.submitted_at,
            due_date: rec.assignments?.due_date,
          }))
          setLateSubmissions(late)
        }
      } else {
        setAssignments([])
      }
    } catch (error) {
      console.error("Error loading teacher data:", error)
    }
  }

  const loadStudentData = async (supabase: any, userId: string) => {
    try {
      // Fetch student's recitations
      const { data: recitationsData } = await supabase
        .from("recitations")
        .select("*, assignments(*), feedback(*)")
        .eq("student_id", userId)
        .eq("is_latest", true)
        .order("submitted_at", { ascending: false })

      setRecitations(recitationsData || [])

      // Fetch student's enrolled classes
      const { data: enrollmentsData } = await supabase
        .from("class_students")
        .select("class_id")
        .eq("student_id", userId)

      if (enrollmentsData && enrollmentsData.length > 0) {
        const classIds = enrollmentsData.map((e) => e.class_id)

        const { data: classesData } = await supabase.from("classes").select("*").in("id", classIds)

        setClasses(classesData || [])
      } else {
        setClasses([])
      }

      // Fetch assignments
      const { data: assignmentStudents } = await supabase
        .from("assignment_students")
        .select("assignment_id")
        .eq("student_id", userId)

      if (assignmentStudents && assignmentStudents.length > 0) {
        const assignmentIds = assignmentStudents.map((item) => item.assignment_id)

        const { data: studentAssignments } = await supabase
          .from("assignments")
          .select("*")
          .in("id", assignmentIds)
          .gte("due_date", new Date().toISOString().split("T")[0])
          .order("due_date", { ascending: true })

        if (studentAssignments && studentAssignments.length > 0) {
          // Get class names
          const classIds = [...new Set(studentAssignments.map((a) => a.class_id).filter(Boolean))]

          if (classIds.length > 0) {
            const { data: classesData } = await supabase.from("classes").select("id, name").in("id", classIds)

            const classMap = (classesData || []).reduce((map: any, c: any) => {
              map[c.id] = c.name
              return map
            }, {})

            const formattedAssignments = studentAssignments.map((assignment) => ({
              ...assignment,
              class_name: assignment.class_id ? classMap[assignment.class_id] : undefined,
            }))

            // Check which assignments have been submitted
            const { data: latestRecitations } = await supabase
              .from("recitations")
              .select("assignment_id")
              .eq("student_id", userId)
              .eq("is_latest", true)

            const submittedAssignmentIds = new Set(latestRecitations?.map((r: any) => r.assignment_id) || [])

            const pendingAssignments = []
            const completed = []

            for (const assignment of formattedAssignments || []) {
              if (submittedAssignmentIds.has(assignment.id)) {
                completed.push(assignment)
              } else {
                pendingAssignments.push(assignment)
              }
            }

            setAssignments(pendingAssignments)
            setCompletedAssignments(completed)
          } else {
            setAssignments(studentAssignments)
          }
        } else {
          setAssignments([])
        }
      } else {
        setAssignments([])
      }
    } catch (error) {
      console.error("Error loading student data:", error)
    }
  }

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
    return formatDatePST(dateString, { month: "short", day: "numeric" })
  }

  if (loading || !profile) {
    return (
      <AuthenticatedLayout>
        <div className="flex justify-center items-center h-64">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
        </div>
      </AuthenticatedLayout>
    )
  }

  return (
    <AuthenticatedLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Late Submissions Alert */}
        {profile?.role === "teacher" && showLateAlert && lateSubmissions.length > 0 && (
          <div className="bg-yellow-100 border border-yellow-300 text-yellow-900 rounded p-4 mb-6 relative">
            <button
              className="absolute top-2 right-2 text-yellow-700 hover:text-yellow-900"
              onClick={() => setShowLateAlert(false)}
              aria-label="Dismiss late submissions alert"
            >
              <XCircle className="h-5 w-5" />
            </button>
            <strong>Late Submissions:</strong>
            <ul className="mt-2 space-y-1">
              {lateSubmissions.map((rec) => (
                <li key={rec.id}>
                  <span className="font-semibold">{rec.student}</span> submitted <span className="font-semibold">{rec.assignment}</span> late (submitted {formatDatePST(rec.submitted_at)}; due {formatDatePST(rec.due_date)})
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Welcome, {profile.first_name || profile.email.split("@")[0]}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {profile.role === "teacher"
              ? "Manage your classes and assignments"
              : profile.role === "student"
                ? "Track your assignments and progress"
                : "Monitor your children's progress"}
          </p>
        </div>

        {/* Parent-specific content */}
        {profile.role === "parent" && (
          <div className="mb-8 bg-primary/5 p-6 rounded-lg border border-primary/10">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Parent Dashboard</h2>
            <p className="text-primary-foreground mb-4">
              Welcome to Taleem! As a parent, you can monitor your children's progress, view their assignments, and
              track their Quran recitation journey.
            </p>
            <Link
              href="/parent-dashboard"
              className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              <Users className="mr-2 h-4 w-4" />
              Go to Parent Dashboard
            </Link>
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Classes */}
          <div className="lg:col-span-2 space-y-6">
            {/* Classes Section */}
            {profile.role !== "parent" && (
              <section>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white border-b-2 border-primary/20 pb-1">
                    {profile.role === "teacher" ? "Your Classes" : "Enrolled Classes"}
                  </h2>
                  {profile.role === "teacher" ? (
                    <Link href="/classes" className="text-sm font-medium text-primary hover:text-primary/80">
                      Manage Classes
                    </Link>
                  ) : (
                    <Link href="/join-class" className="text-sm font-medium text-primary hover:text-primary/80">
                      Join a Class
                    </Link>
                  )}
                </div>

                {classes.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {classes.slice(0, 4).map((classItem: any) => (
                      <Card key={classItem.id} className="border border-gray-200 shadow-sm">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base font-semibold">{classItem.name}</CardTitle>
                          <p className="text-xs text-gray-500">Grade: {classItem.grade_level}</p>
                        </CardHeader>
                        <CardContent className="pt-0">
                          <div className="flex items-center text-sm text-gray-500 mt-2">
                            <Users className="h-4 w-4 mr-1 text-gray-400" />
                            <span>
                              {classItem.student_count || 0} {classItem.student_count === 1 ? "Student" : "Students"}
                            </span>
                          </div>
                          <div className="mt-4">
                            <Link
                              href={`/classes/${classItem.id}`}
                              className="text-sm font-medium text-primary hover:text-primary/80"
                            >
                              View Details
                            </Link>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card className="border border-gray-200 shadow-sm">
                    <CardContent className="p-6 text-center">
                      <p className="text-gray-500">
                        {profile.role === "teacher"
                          ? "You haven't created any classes yet."
                          : "You are not enrolled in any classes yet."}
                      </p>
                      <Link
                        href={profile.role === "teacher" ? "/classes" : "/join-class"}
                        className="mt-2 inline-block text-sm font-medium text-primary hover:text-primary/80"
                      >
                        {profile.role === "teacher" ? "Create Your First Class" : "Join a Class"}
                      </Link>
                    </CardContent>
                  </Card>
                )}

                {classes.length > 4 && (
                  <div className="mt-4 text-center">
                    <Link href="/classes" className="text-sm font-medium text-primary hover:text-primary/80">
                      View All Classes
                    </Link>
                  </div>
                )}
              </section>
            )}

            {/* Quick Links Section */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white border-b-2 border-primary/20 pb-1 mb-4">
                Quick Links
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {profile.role === "teacher" && (
                  <>
                    <Card className="border border-gray-200 shadow-sm">
                      <CardContent className="p-4 flex flex-col items-center text-center">
                        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
                          <Users className="h-6 w-6 text-primary" />
                        </div>
                        <h3 className="font-medium text-gray-900 dark:text-white mb-1">Manage Students</h3>
                        <p className="text-xs text-gray-500 mb-3">View and manage your students</p>
                        <Link href="/classes" className="text-xs font-medium text-primary hover:text-primary/80">
                          View Students
                        </Link>
                      </CardContent>
                    </Card>
                    <Card className="border border-gray-200 shadow-sm">
                      <CardContent className="p-4 flex flex-col items-center text-center">
                        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
                          <BookOpen className="h-6 w-6 text-primary" />
                        </div>
                        <h3 className="font-medium text-gray-900 dark:text-white mb-1">Create Assignment</h3>
                        <p className="text-xs text-gray-500 mb-3">Assign new work to your students</p>
                        <Link
                          href="/assignments/new"
                          className="text-xs font-medium text-primary hover:text-primary/80"
                        >
                          Create New
                        </Link>
                      </CardContent>
                    </Card>
                    <Card className="border border-gray-200 shadow-sm">
                      <CardContent className="p-4 flex flex-col items-center text-center">
                        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
                          <School className="h-6 w-6 text-primary" />
                        </div>
                        <h3 className="font-medium text-gray-900 dark:text-white mb-1">Create Class</h3>
                        <p className="text-xs text-gray-500 mb-3">Set up a new class for your students</p>
                        <Link href="/classes" className="text-xs font-medium text-primary hover:text-primary/80">
                          Create Class
                        </Link>
                      </CardContent>
                    </Card>
                  </>
                )}

                {profile.role === "student" && (
                  <>
                    <Card className="border border-gray-200 shadow-sm">
                      <CardContent className="p-4 flex flex-col items-center text-center">
                        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
                          <BookOpen className="h-6 w-6 text-primary" />
                        </div>
                        <h3 className="font-medium text-gray-900 dark:text-white mb-1">View Assignments</h3>
                        <p className="text-xs text-gray-500 mb-3">Check your current assignments</p>
                        <Link href="/assignments" className="text-xs font-medium text-primary hover:text-primary/80">
                          View All
                        </Link>
                      </CardContent>
                    </Card>
                    <Card className="border border-gray-200 shadow-sm">
                      <CardContent className="p-4 flex flex-col items-center text-center">
                        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
                          <CheckCircle className="h-6 w-6 text-primary" />
                        </div>
                        <h3 className="font-medium text-gray-900 dark:text-white mb-1">Completed Work</h3>
                        <p className="text-xs text-gray-500 mb-3">Review your submitted assignments</p>
                        <Link
                          href="/assignments?tab=completed"
                          className="text-xs font-medium text-primary hover:text-primary/80"
                        >
                          View Completed
                        </Link>
                      </CardContent>
                    </Card>
                    <Card className="border border-gray-200 shadow-sm">
                      <CardContent className="p-4 flex flex-col items-center text-center">
                        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
                          <User className="h-6 w-6 text-primary" />
                        </div>
                        <h3 className="font-medium text-gray-900 dark:text-white mb-1">Update Profile</h3>
                        <p className="text-xs text-gray-500 mb-3">Manage your account information</p>
                        <Link href="/profile" className="text-xs font-medium text-primary hover:text-primary/80">
                          Edit Profile
                        </Link>
                      </CardContent>
                    </Card>
                  </>
                )}

                {profile?.role === "parent" && (
                  <>
                    <Card className="border border-gray-200 shadow-sm">
                      <CardContent className="p-4 flex flex-col items-center text-center">
                        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
                          <Users className="h-6 w-6 text-primary" />
                        </div>
                        <h3 className="font-medium text-gray-900 dark:text-white mb-1">View Children</h3>
                        <p className="text-xs text-gray-500 mb-3">Monitor your children's progress</p>
                        <Link
                          href="/parent-dashboard"
                          className="text-xs font-medium text-primary hover:text-primary/80"
                        >
                          View Dashboard
                        </Link>
                      </CardContent>
                    </Card>
                    <Card className="border border-gray-200 shadow-sm">
                      <CardContent className="p-4 flex flex-col items-center text-center">
                        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
                          <BookOpen className="h-6 w-6 text-primary" />
                        </div>
                        <h3 className="font-medium text-gray-900 dark:text-white mb-1">Add Child</h3>
                        <p className="text-xs text-gray-500 mb-3">Link your child's account to your profile</p>
                        <Link
                          href="/parent-dashboard"
                          className="text-xs font-medium text-primary hover:text-primary/80"
                        >
                          Add Child
                        </Link>
                      </CardContent>
                    </Card>
                    <Card className="border border-gray-200 shadow-sm">
                      <CardContent className="p-4 flex flex-col items-center text-center">
                        <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-3">
                          <User className="h-6 w-6 text-primary" />
                        </div>
                        <h3 className="font-medium text-gray-900 dark:text-white mb-1">Update Profile</h3>
                        <p className="text-xs text-gray-500 mb-3">Manage your account information</p>
                        <Link href="/profile" className="text-xs font-medium text-primary hover:text-primary/80">
                          Edit Profile
                        </Link>
                      </CardContent>
                    </Card>
                  </>
                )}
              </div>
            </section>
          </div>

          {/* Right Column - Assignments & Activity */}
          <div className="space-y-6">
            {/* Assignments Section */}
            <section>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white border-b-2 border-primary/20 pb-1">
                  {profile.role === "teacher" ? "Upcoming Assignments" : "Your Assignments"}
                </h2>
                {profile.role === "teacher" ? (
                  <Link href="/assignments/new" className="text-sm font-medium text-primary hover:text-primary/80">
                    Create New
                  </Link>
                ) : (
                  <Link href="/assignments" className="text-sm font-medium text-primary hover:text-primary/80">
                    View All
                  </Link>
                )}
              </div>

              {assignments.length > 0 ? (
                <div className="space-y-3">
                  {assignments.slice(0, 5).map((assignment: any) => (
                    <Card key={assignment.id} className="border border-gray-200 shadow-sm">
                      <CardContent className="p-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-medium text-sm">
                              {assignment.title ||
                                (assignment.surah_name && assignment.start_ayah && assignment.end_ayah
                                  ? generateAssignmentTitle(
                                      assignment.surah_name,
                                      assignment.start_ayah,
                                      assignment.end_ayah,
                                    )
                                  : assignment.surah)}
                            </h3>
                            {assignment.class_name && (
                              <p className="text-xs text-gray-500 mt-0.5">Class: {assignment.class_name}</p>
                            )}
                          </div>
                          <div className="flex items-center text-xs text-gray-500">
                            <Calendar className="h-3 w-3 mr-1" />
                            <span>Due {formatDate(assignment.due_date)}</span>
                          </div>
                        </div>
                        <div className="mt-2 flex justify-between items-center">
                          <p className="text-xs text-gray-500">
                            {assignment.surah_name
                              ? `${assignment.surah_name.split(" (")[0].replace(/^\d+\.\s+/, "")}`
                              : assignment.surah}
                            {assignment.start_ayah && assignment.end_ayah
                              ? `, Ayahs ${assignment.start_ayah}-${assignment.end_ayah}`
                              : ""}
                          </p>
                          {profile.role === "student" && (
                            <Link
                              href={`/recitations/new?assignment=${assignment.id}`}
                              className="text-xs font-medium text-primary hover:text-primary/80"
                            >
                              Submit
                            </Link>
                          )}
                          {profile.role === "teacher" && (
                            <Link
                              href={`/assignments/${assignment.id}`}
                              className="text-xs font-medium text-primary hover:text-primary/80"
                            >
                              View Details
                            </Link>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="border border-gray-200 shadow-sm">
                  <CardContent className="p-6 text-center">
                    <p className="text-gray-500">
                      {profile.role === "teacher"
                        ? "You haven't created any assignments yet."
                        : "You don't have any pending assignments."}
                    </p>
                    {profile.role === "teacher" && (
                      <Link
                        href="/assignments/new"
                        className="mt-2 inline-block text-sm font-medium text-primary hover:text-primary/80"
                      >
                        Create Your First Assignment
                      </Link>
                    )}
                  </CardContent>
                </Card>
              )}
            </section>

            {/* Recent Activity Section */}
            {profile.role !== "parent" && (
              <section>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white border-b-2 border-primary/20 pb-1 mb-4">
                  Recent Activity
                </h2>
                <Card className="border border-gray-200 shadow-sm">
                  <CardContent className="p-0">
                    <div className="divide-y divide-gray-200">
                      {profile.role === "student" && recitations.length > 0 ? (
                        recitations.slice(0, 3).map((recitation: any) => (
                          <div key={recitation.id} className="p-3">
                            <div className="flex items-start">
                              <div className="flex-shrink-0 mt-0.5">
                                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                </div>
                              </div>
                              <div className="ml-3">
                                <p className="text-sm font-medium">
                                  Submitted recitation for{" "}
                                  <span className="text-gray-900 dark:text-white">
                                    {recitation.assignments?.title ||
                                      (recitation.assignments?.surah_name &&
                                      recitation.assignments?.start_ayah &&
                                      recitation.assignments?.end_ayah
                                        ? generateAssignmentTitle(
                                            recitation.assignments?.surah_name,
                                            recitation.assignments?.start_ayah,
                                            recitation.assignments?.end_ayah,
                                          )
                                        : recitation.assignments?.surah)}
                                  </span>
                                </p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  {new Date(recitation.submitted_at).toLocaleDateString()}
                                </p>
                                {recitation.feedback && (
                                  <div className="mt-1 text-xs">
                                    <span className="font-medium text-gray-700">Feedback:</span>{" "}
                                    <span className="text-green-600">
                                      {Math.round(recitation.feedback.accuracy * 100)}% accuracy
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      ) : profile.role === "teacher" ? (
                        <>
                          <div className="p-3">
                            <div className="flex items-start">
                              <div className="flex-shrink-0 mt-0.5">
                                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                  <Users className="h-4 w-4 text-blue-600" />
                                </div>
                              </div>
                              <div className="ml-3">
                                <p className="text-sm font-medium">
                                  New student joined{" "}
                                  <span className="text-gray-900 dark:text-white">Quran Memorization</span>
                                </p>
                                <p className="text-xs text-gray-500 mt-0.5">Today</p>
                              </div>
                            </div>
                          </div>
                          <div className="p-3">
                            <div className="flex items-start">
                              <div className="flex-shrink-0 mt-0.5">
                                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                                  <BookOpen className="h-4 w-4 text-primary" />
                                </div>
                              </div>
                              <div className="ml-3">
                                <p className="text-sm font-medium">
                                  Created assignment{" "}
                                  <span className="text-gray-900 dark:text-white">Al-Fatiha Memorization</span>
                                </p>
                                <p className="text-xs text-gray-500 mt-0.5">Yesterday</p>
                              </div>
                            </div>
                          </div>
                          <div className="p-3">
                            <div className="flex items-start">
                              <div className="flex-shrink-0 mt-0.5">
                                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                </div>
                              </div>
                              <div className="ml-3">
                                <p className="text-sm font-medium">
                                  Provided feedback on{" "}
                                  <span className="text-gray-900 dark:text-white">Ahmed's recitation</span>
                                </p>
                                <p className="text-xs text-gray-500 mt-0.5">2 days ago</p>
                              </div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="p-6 text-center">
                          <p className="text-gray-500">No recent activity to display.</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </section>
            )}

            {/* Stats Section */}
            {profile.role !== "parent" && (
              <section>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white border-b-2 border-primary/20 pb-1 mb-4">
                  {profile.role === "teacher" ? "Class Statistics" : "Your Progress"}
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  <Card className="border border-gray-200 shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex flex-col items-center">
                        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center mb-2">
                          {profile.role === "teacher" ? (
                            <Users className="h-5 w-5 text-primary" />
                          ) : (
                            <BookOpen className="h-5 w-5 text-primary" />
                          )}
                        </div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                          {profile.role === "teacher"
                            ? classes.length
                            : assignments.length + completedAssignments.length}
                        </p>
                        <p className="text-xs text-gray-500">
                          {profile.role === "teacher" ? "Total Classes" : "Total Assignments"}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border border-gray-200 shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex flex-col items-center">
                        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center mb-2">
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        </div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                          {profile.role === "teacher" ? assignments.length : completedAssignments.length}
                        </p>
                        <p className="text-xs text-gray-500">
                          {profile.role === "teacher" ? "Active Assignments" : "Completed"}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </AuthenticatedLayout>
  )
}
