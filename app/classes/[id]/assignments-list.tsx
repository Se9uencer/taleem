"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { createClientComponentClient } from "@/lib/supabase/client"
import { CalendarIcon, CheckCircleIcon, XCircleIcon, ClockIcon, UsersIcon } from "lucide-react"
// Import the date utility functions
import { formatDatePST, isPastDuePST } from "@/lib/date-utils"

interface Assignment {
  id: string
  title: string
  surah: string
  surah_name?: string
  start_ayah?: number
  end_ayah?: number
  due_date: string
  created_at: string
  class_id: string
  teacher_id: string
  submission_count?: number
  student_count?: number
}

export default function AssignmentsList({ classId }: { classId: string }) {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadAssignments = async () => {
      try {
        setLoading(true)
        const supabase = createClientComponentClient()

        // Fetch assignments for this class
        const { data: assignmentsData, error: assignmentsError } = await supabase
          .from("assignments")
          .select("*")
          .eq("class_id", classId)
          .order("due_date", { ascending: false })

        if (assignmentsError) {
          throw assignmentsError
        }

        if (!assignmentsData || assignmentsData.length === 0) {
          setAssignments([])
          setLoading(false)
          return
        }

        // For each assignment, get the submission count and student count
        const assignmentsWithDetails = await Promise.all(
          assignmentsData.map(async (assignment) => {
            // Count recitations for this assignment
            const { count: submissionCount, error: submissionCountError } = await supabase
              .from("recitations")
              .select("*", { count: "exact", head: true })
              .eq("assignment_id", assignment.id)

            // Count students assigned to this assignment
            const { count: studentCount, error: studentCountError } = await supabase
              .from("assignment_students")
              .select("*", { count: "exact", head: true })
              .eq("assignment_id", assignment.id)

            if (submissionCountError) {
              console.error("Error counting submissions:", submissionCountError)
            }

            if (studentCountError) {
              console.error("Error counting students:", studentCountError)
            }

            return {
              ...assignment,
              submission_count: submissionCount || 0,
              student_count: studentCount || 0,
            }
          }),
        )

        setAssignments(assignmentsWithDetails)
      } catch (err: any) {
        console.error("Error loading assignments:", err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    if (classId) {
      loadAssignments()
    }
  }, [classId])

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

  // Check if an assignment is past due
  const isPastDue = (dueDate: string) => {
    return isPastDuePST(dueDate)
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-purple-500 border-r-transparent"></div>
        <p className="mt-2 text-gray-600">Loading assignments...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 text-red-600 p-4 rounded-md">
        <p>Error loading assignments: {error}</p>
      </div>
    )
  }

  if (assignments.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 mb-4">No assignments created for this class yet.</p>
        <Link
          href={`/assignments/new?class=${classId}`}
          className="bg-purple-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-purple-700"
        >
          Create First Assignment
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {assignments.map((assignment) => (
        <div
          key={assignment.id}
          className={`border rounded-lg p-4 ${
            isPastDue(assignment.due_date) ? "bg-gray-50 border-gray-300" : "bg-white"
          }`}
        >
          <div className="flex justify-between items-start">
            <div>
              <h4 className="font-medium text-lg">
                {assignment.title ||
                  (assignment.surah_name && assignment.start_ayah && assignment.end_ayah
                    ? generateAssignmentTitle(assignment.surah_name, assignment.start_ayah, assignment.end_ayah)
                    : assignment.surah)}
              </h4>
              <p className="text-gray-600 text-sm mt-1">
                {assignment.surah_name ? (
                  <>
                    Surah: {assignment.surah_name.split(" (")[0].replace(/^\d+\.\s+/, "")}
                    {assignment.start_ayah && assignment.end_ayah && (
                      <>
                        , Ayahs: {assignment.start_ayah}-{assignment.end_ayah}
                      </>
                    )}
                  </>
                ) : (
                  <>Surah: {assignment.surah}</>
                )}
              </p>
            </div>
            <div className="flex flex-col items-end">
              <div className="flex items-center">
                <CalendarIcon className="h-4 w-4 text-gray-500 mr-1" />
                <span className="text-sm text-gray-600">Due: {formatDate(assignment.due_date)}</span>
              </div>
              <div
                className={`flex items-center mt-1 ${
                  isPastDue(assignment.due_date) ? "text-red-600" : "text-green-600"
                }`}
              >
                {isPastDue(assignment.due_date) ? (
                  <XCircleIcon className="h-4 w-4 mr-1" />
                ) : (
                  <ClockIcon className="h-4 w-4 mr-1" />
                )}
                <span className="text-xs">{isPastDue(assignment.due_date) ? "Past due" : "Active"}</span>
              </div>
            </div>
          </div>

          <div className="mt-3 flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <div className="flex items-center">
                <CheckCircleIcon className="h-4 w-4 text-green-500 mr-1" />
                <span className="text-sm text-gray-600">{assignment.submission_count || 0} submissions</span>
              </div>
              <div className="flex items-center">
                <UsersIcon className="h-4 w-4 text-purple-500 mr-1" />
                <span className="text-sm text-gray-600">{assignment.student_count || 0} students assigned</span>
              </div>
            </div>
            <Link
              href={`/assignments/${assignment.id}`}
              className="text-purple-600 hover:text-purple-800 text-sm font-medium"
            >
              View Details
            </Link>
          </div>
        </div>
      ))}
    </div>
  )
}
