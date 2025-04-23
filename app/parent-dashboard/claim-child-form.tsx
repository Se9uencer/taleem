"use client"

import type React from "react"

import { useState } from "react"
import { createClientComponentClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertCircle, CheckCircle2, HelpCircle } from "lucide-react"

interface ClaimChildFormProps {
  parentId: string
  onSuccess: () => void
}

export function ClaimChildForm({ parentId, onSuccess }: ClaimChildFormProps) {
  const [studentId, setStudentId] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    if (!studentId.trim()) {
      setError("Please enter a student ID")
      setLoading(false)
      return
    }

    try {
      const supabase = createClientComponentClient()

      // First find the student by their student_id to get their actual UUID
      const { data: student, error: studentError } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, role")
        .eq("student_id", studentId.trim())
        .eq("role", "student")
        .single()

      if (studentError) {
        if (studentError.code === "PGRST116") {
          setError("No student found with this ID. Please check and try again.")
        } else {
          setError(`Error finding student: ${studentError.message}`)
        }
        setLoading(false)
        return
      }

      if (!student) {
        setError("No student found with this ID. Please check and try again.")
        setLoading(false)
        return
      }

      // Now check if this link already exists using the actual UUID
      const { data: existingLink, error: linkCheckError } = await supabase
        .from("parent_child_link")
        .select("*")
        .eq("parent_id", parentId)
        .eq("child_id", student.id)
        .single()

      if (linkCheckError && linkCheckError.code !== "PGRST116") {
        // PGRST116 means no rows returned, which is what we want
        throw new Error(`Error checking existing link: ${linkCheckError.message}`)
      }

      if (existingLink) {
        setError("You have already claimed this child")
        setLoading(false)
        return
      }

      // Create the parent-child link using the student's UUID
      const { error: insertError } = await supabase.from("parent_child_link").insert({
        parent_id: parentId,
        child_id: student.id, // Use the UUID, not the student_id
      })

      if (insertError) {
        throw new Error(`Error linking child: ${insertError.message}`)
      }

      // Success!
      setSuccess(`Successfully linked to ${student.first_name} ${student.last_name}`)
      setStudentId("")
      onSuccess()
    } catch (err: any) {
      console.error("Error claiming child:", err)
      setError(err.message || "An unexpected error occurred")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="student-id">Enter Student ID to Claim Your Child</Label>
          <div className="relative group">
            <HelpCircle className="h-4 w-4 text-gray-400 cursor-help" />
            <div className="absolute right-0 w-64 p-2 mt-2 text-xs bg-gray-100 rounded shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 z-10">
              Ask your child for their Student ID from their profile page, or request it from their teacher.
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Input
            id="student-id"
            placeholder="e.g. TLM-92X-1A7"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value.toUpperCase())}
            disabled={loading}
            className="flex-1"
          />
          <Button type="submit" disabled={loading}>
            {loading ? "Claiming..." : "Claim"}
          </Button>
        </div>
        <p className="text-xs text-gray-500">Enter the unique student ID provided by your child's teacher</p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-3 rounded-md flex items-start gap-2">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 text-green-700 p-3 rounded-md flex items-start gap-2">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <p>{success}</p>
        </div>
      )}
    </form>
  )
}
