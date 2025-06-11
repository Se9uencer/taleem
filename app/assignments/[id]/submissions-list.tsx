"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { createClientComponentClient } from "@/lib/supabase/client"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { CheckCircleIcon, XCircleIcon, ClockIcon, PencilIcon, PlayIcon, PauseIcon, HistoryIcon, BrainCircuitIcon, AlertTriangleIcon } from "lucide-react"
import { formatDateTimePST } from "@/lib/date-utils"

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
  transcription_error?: string;
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
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null)
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null)
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map())

  // Define loadSubmissions so it can be reused by the real-time subscription
  const loadSubmissions = async () => {
    try {
      const supabase = createClientComponentClient()

      const { data: assignedStudents, error: assignedError } = await supabase
        .from("assignment_students")
        .select("student_id")
        .eq("assignment_id", assignmentId)

      if (assignedError) throw assignedError;
      const studentIds = assignedStudents?.map((s) => s.student_id) || []
      
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .in("id", studentIds);

      if (profilesError) throw profilesError;

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
      
      const submissionsByStudent = profiles.map(profile => {
          const studentRecitations = recitations?.filter(r => r.student_id === profile.id) || [];
          const latestSubmission = studentRecitations.find(r => r.is_latest) || studentRecitations[0] || null;

          return {
              student_id: profile.id,
              student_name: `${profile.first_name} ${profile.last_name}`,
              student_email: profile.email,
              submissions: studentRecitations,
              latest_submission: latestSubmission,
              has_submitted: studentRecitations.length > 0,
          };
      });

      setStudentSubmissions(submissionsByStudent);
      
    } catch (err: any) {
      console.error("Error loading submissions:", err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (assignmentId) {
      // Initial data load
      loadSubmissions()

      // Set up real-time subscription
      const supabase = createClientComponentClient()
      const channel = supabase
        .channel(`submissions-for-assignment-${assignmentId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'recitations', filter: `assignment_id=eq.${assignmentId}` },
          (payload) => {
            console.log('Real-time update received!', payload)
            // When an update is received, reload all submission data
            loadSubmissions()
          }
        )
        .subscribe()

      // Cleanup subscription on component unmount
      return () => {
        supabase.removeChannel(channel)
      }
    }
  }, [assignmentId]);

  const handlePlayToggle = (submissionId: string, url: string) => {
    const currentAudio = audioRefs.current.get(submissionId);
    
    if (playingAudioId === submissionId && currentAudio) {
      currentAudio.pause();
      setPlayingAudioId(null);
    } else {
      if (playingAudioId) {
        const previousAudio = audioRefs.current.get(playingAudioId);
        previousAudio?.pause();
      }

      if (currentAudio) {
        currentAudio.currentTime = 0;
        currentAudio.play();
        setPlayingAudioId(submissionId);
      } else {
        const newAudio = new Audio(url);
        audioRefs.current.set(submissionId, newAudio);
        newAudio.play();
        setPlayingAudioId(submissionId);
        newAudio.onended = () => setPlayingAudioId(null);
      }
    }
  };

  if (loading) {
     return (
        <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
        </div>
     )
  }

  if (error) {
    return <div className="bg-red-50 text-red-600 p-4 rounded-md">Error: {error}</div>
  }

  return (
    <div className="space-y-6">
      {studentSubmissions.map((student) => (
        <div key={student.student_id} className="border dark:border-gray-700 rounded-lg overflow-hidden shadow-sm">
          <div className="p-4 bg-white dark:bg-gray-800/50 flex justify-between items-center">
            <div>
                <h4 className="font-medium text-foreground">{student.student_name}</h4>
                <p className="text-xs text-muted-foreground">{student.student_email}</p>
            </div>
            <div className={`flex items-center text-xs font-medium px-2 py-1 rounded-full ${
                student.has_submitted ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 
                new Date(dueDate) < new Date() ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' : 
                'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
            }`}>
                {student.has_submitted ? <CheckCircleIcon className="h-3 w-3 mr-1"/> : new Date(dueDate) < new Date() ? <XCircleIcon className="h-3 w-3 mr-1"/> : <ClockIcon className="h-3 w-3 mr-1"/>}
                {student.has_submitted ? 'Submitted' : new Date(dueDate) < new Date() ? 'Overdue' : 'Pending'}
            </div>
          </div>
          
          {student.has_submitted && student.latest_submission && (
            <div className="p-4 space-y-4">
              <div className="flex items-center bg-gray-100 dark:bg-gray-700/50 p-3 rounded-md">
                  <Button variant="ghost" size="icon" onClick={() => handlePlayToggle(student.latest_submission!.id, student.latest_submission!.audio_url)} className="mr-3">
                      {playingAudioId === student.latest_submission!.id ? <PauseIcon className="h-4 w-4"/> : <PlayIcon className="h-4 w-4"/>}
                  </Button>
                  <div className="text-sm">
                      <p className="font-medium text-foreground">Latest Recitation</p>
                      <p className="text-xs text-muted-foreground">Submitted: {formatDateTimePST(student.latest_submission.submitted_at)}</p>
                  </div>
              </div>

              <div className="border-t dark:border-gray-700 pt-4">
                 <h5 className="text-sm font-medium text-foreground mb-2 flex items-center"><BrainCircuitIcon className="h-4 w-4 mr-2 text-primary"/>AI Feedback</h5>
                 
                 {student.latest_submission.transcription_status === 'completed' && (
                    <div className="space-y-4">
                        {student.latest_submission.feedback && typeof student.latest_submission.feedback.accuracy === 'number' && (
                          <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-md">
                            <h6 className="text-xs font-semibold text-muted-foreground mb-1">ACCURACY SCORE</h6>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-muted rounded-full h-2.5">
                                <div
                                  className="bg-green-500 h-2.5 rounded-full"
                                  style={{ width: `${Math.round(student.latest_submission.feedback.accuracy * 100)}%` }}
                                ></div>
                              </div>
                              <span className="font-semibold text-lg">{Math.round(student.latest_submission.feedback.accuracy * 100)}%</span>
                            </div>
                          </div>
                        )}

                        {student.latest_submission.transcription && (
                          <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-md">
                            <h6 className="text-xs font-semibold text-muted-foreground mb-1">TRANSCRIPTION</h6>
                            <p className="text-right font-arabic text-lg" dir="rtl">
                              {student.latest_submission.transcription}
                            </p>
                          </div>
                        )}
                    </div>
                 )}

                 {student.latest_submission.transcription_status === 'pending' && (
                    <div className="space-y-4">
                        <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-md animate-pulse">
                            <Skeleton className="h-4 w-1/4 mb-2" />
                            <div className="flex items-center gap-2">
                                <Skeleton className="h-2.5 w-full rounded-full" />
                                <Skeleton className="h-4 w-10" />
                            </div>
                        </div>
                        <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-md animate-pulse">
                            <Skeleton className="h-4 w-1/3 mb-2" />
                            <Skeleton className="h-6 w-full" />
                            <Skeleton className="h-6 w-3/4 mt-1" />
                        </div>
                    </div>
                 )}
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