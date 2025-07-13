// Recitation: represents a recitation record in the database
export interface Recitation {
  id: string;
  student_id: string;
  assignment_id: string;
  audio_url: string;
  transcription: string | null;
  feedback: string | null;
  status: 'pending' | 'processing' | 'completed' | 'error';
  created_at: string;
  updated_at: string;
}

// Assignment: represents an assignment record
export interface Assignment {
  id: string;
  class_id: string;
  title: string;
  description: string;
  due_date: string;
  created_at: string;
  updated_at: string;
}

// Feedback: represents feedback on a recitation
export interface Feedback {
  id: string;
  recitation_id: string;
  teacher_id: string;
  feedback: string;
  created_at: string;
}

// Surah: represents a surah in the Quran
type SurahType = 'Meccan' | 'Medinan';
export interface Surah {
  number: number;
  name: string;
  ayahs: number; // number of ayahs in the surah
  // Optionally, you can add:
  // englishName?: string;
  // englishNameTranslation?: string;
  // numberOfAyahs?: number;
  // revelationType?: SurahType;
}

// UpdateErrorStatusParams: for updating error status in the API
export interface UpdateErrorStatusParams {
  supabase: any; // Will be replaced with the correct Supabase client type if available
  recitationId: string;
  error: string;
}

// SignedUploadUrlRequest: request body for signed upload URL
export interface SignedUploadUrlRequest {
  assignmentId: string;
  studentId: string;
  fileType: string;
}

// SignedUploadUrlResponse: response from signed upload URL endpoint
export interface SignedUploadUrlResponse {
  signedUrl: string;
  path: string;
  expiresIn: number;
} 