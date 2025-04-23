"use client"

import type React from "react"

import { useState } from "react"
import { XIcon } from "lucide-react"

interface NewClassModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (classData: {
    name: string
    description: string
    grade_level: string
  }) => void
}

// Grade level options
const gradeOptions = [
  "Pre-K",
  "Kindergarten",
  "1st Grade",
  "2nd Grade",
  "3rd Grade",
  "4th Grade",
  "5th Grade",
  "6th Grade",
  "7th Grade",
  "8th Grade",
  "9th Grade",
  "10th Grade",
  "11th Grade",
  "12th Grade",
  "Adult Beginner",
  "Adult Intermediate",
  "Adult Advanced",
]

export default function NewClassModal({ isOpen, onClose, onSubmit }: NewClassModalProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [gradeLevel, setGradeLevel] = useState(gradeOptions[0])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!name) {
      setError("Class name is required")
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      await onSubmit({
        name,
        description,
        grade_level: gradeLevel,
      })

      // Reset form
      setName("")
      setDescription("")
      setGradeLevel(gradeOptions[0])
    } catch (err: any) {
      setError(err.message || "Failed to create class")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex justify-between items-center p-6 border-b">
          <h3 className="text-xl font-semibold text-gray-900">Create New Class</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500 focus:outline-none">
            <XIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {error && <div className="mb-4 bg-red-50 text-red-600 p-3 rounded-md text-sm">{error}</div>}

          <div className="space-y-4">
            <div>
              <label htmlFor="class-name" className="block text-sm font-medium text-gray-700">
                Class Name*
              </label>
              <input
                type="text"
                id="class-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                placeholder="e.g., Quran Memorization"
                required
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500"
                placeholder="Brief description of the class"
              />
            </div>

            <div>
              <label htmlFor="grade-level" className="block text-sm font-medium text-gray-700">
                Grade/Level
              </label>
              <select
                id="grade-level"
                value={gradeLevel}
                onChange={(e) => setGradeLevel(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500"
              >
                {gradeOptions.map((grade) => (
                  <option key={grade} value={grade}>
                    {grade}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="mr-3 px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700 disabled:opacity-70"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Creating..." : "Create Class"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
