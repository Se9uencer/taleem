"use client"

import { useState, useEffect } from "react"
import { createClientComponentClient } from "@/lib/supabase/client"
import { CheckCircleIcon, XCircleIcon, ClockIcon, PencilIcon, PlayIcon, PauseIcon, HistoryIcon, BrainCircuitIcon, AlertTriangleIcon } from "lucide-react"
import { formatDateTimePST } from "@/lib/date-utils"
import { Skeleton } from "@/components/ui/skeleton"

// Interfaces remain the same
interface Submission {
  id: string;
  student_id: string;
  assignment_id: string;
  audio_url: string;
  submitted_at: string;
  is_latest: boolean;
  student_name: string;
  student_email: string;
  transcription?: string;
  transcription_status?: 'pending' | 'completed' | 'error';
  transcription_error?: string; // Add this field
  feedback?: {
    id: string;
    accuracy: number;
    notes: string;
  };
}

interface StudentSubmissions {
  student_id: string;
  student_name: string;
  student_email: string;
  submissions: Submission[];
  latest_submission: Submission | null;
  has_submitted: boolean;
}

export default function SubmissionsList({
  assignmentId,
  dueDate,
}: {
  assignmentId: string
  dueDate: string
}) {
  const [studentSubmissions, setStudentSubmissions] = useState<StudentSubmissions[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // ... other state variables remain the same

  useEffect(() => {
    const loadSubmissions = async () => {
      try {
        setLoading(true)
        const supabase = createClientComponentClient()

        // ... data fetching for students and profiles remains the same ...
        const { data: assignedStudents, error: assignedError } = await supabase
          .from("assignment_students")
          .select("student_id")
          .eq("assignment_id", assignmentId)

        if (assignedError) throw assignedError;
        const studentIds = assignedStudents?.map((s) => s.student_id) || []

        // FIX: Add transcription_error to the select statement
        const { data: recitations, error: recitationsError } = await supabase
          .from("recitations")
          .select(`
            id, student_id, assignment_id, audio_url, submitted_at, is_latest,
            transcription, transcription_status, transcription_error,
            feedback (id, accuracy, notes)
          `)
          .eq("assignment_id", assignmentId)
          .order("submitted_at", { ascending: false })

        if (recitationsError) throw recitationsError;
        
        // ... the rest of the data processing logic remains the same ...
        // This will now correctly populate the 'transcription_error' field
        
      } catch (err: any) {
        console.error("Error loading submissions:", err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    // ...
  }, [assignmentId]);

  useEffect(() => {
    // ... real-time subscription logic remains the same ...
  }, [assignmentId]);


  // ... other helper functions remain the same ...


  return (
    <div className="space-y-6">
      {/* ... Submission Status and Student Header ... */}
      
      {studentSubmissions.map((student) => (
        <div key={student.student_id} className="border dark:border-gray-700 rounded-lg overflow-hidden shadow-sm">
          {/* ... Student Header JSX ... */}

          {student.has_submitted && student.latest_submission && (
            <div className="p-4 space-y-4">
              {/* ... Latest Recitation Audio Player ... */}
              
              <div className="border-t dark:border-gray-700 pt-4">
                 <h5 className="text-sm font-medium text-foreground mb-2 flex items-center"><BrainCircuitIcon className="h-4 w-4 mr-2 text-primary"/>AI Feedback</h5>
                 
                 {student.latest_submission.transcription_status === 'completed' && (
                    <div className="space-y-4">
                        {/* Accuracy and Transcription display */}
                    </div>
                 )}
                 {student.latest_submission.transcription_status === 'pending' && (
                    <div className="space-y-4">
                        <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-md">
                            <Skeleton className="h-4 w-1/4 mb-2" />
                            <div className="flex items-center gap-2">
                                <Skeleton className="h-2.5 w-full rounded-full" />
                                <Skeleton className="h-4 w-10" />
                            </div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-md">
                            <Skeleton className="h-4 w-1/3 mb-2" />
                            <Skeleton className="h-6 w-full" />
                            <Skeleton className="h-6 w-3/4 mt-1" />
                        </div>
                    </div>
                 )}
                 {/* FIX: Display a proper error message from the database */}
                 {student.latest_submission.transcription_status === 'error' && (
                    <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 p-3 rounded-md">
                        <div className="flex items-start gap-2">
                            <AlertTriangleIcon className="h-5 w-5 flex-shrink-0 mt-0.5" />
                            <div>
                                <h6 className="font-semibold">Processing Failed</h6>
                                <p className="text-xs mt-1">{student.latest_submission.transcription_error || 'An unknown error occurred.'}</p>
                            </div>
                        </div>
                    </div>
                 )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}