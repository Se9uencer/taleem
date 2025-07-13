import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { supabaseConfig } from "@/lib/config";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  // 1. Require authentication
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  let accessToken: string | null = null;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    accessToken = authHeader.replace("Bearer ", "").trim();
  } else {
    const cookie = request.headers.get("cookie") || "";
    const match = cookie.match(/sb-access-token=([^;]+)/);
    if (match) accessToken = match[1];
  }
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Validate ID
  const recitationId = params.id;
  if (!recitationId) {
    return NextResponse.json({ error: "Missing recitation ID" }, { status: 400 });
  }

  // 3. Query recitation from Supabase
  const supabase = await createServiceRoleClient();
  const { data, error } = await supabase
    .from("recitations")
    .select("id, transcription_status, feedback, transcription_error")
    .eq("id", recitationId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Recitation not found" }, { status: 404 });
  }

  // 4. Build response
  const status = data.transcription_status || "processing";
  const feedback = data.feedback || undefined;
  const errorMsg = status === "error" ? (data.transcription_error || "An error occurred during processing.") : undefined;

  return NextResponse.json({ status, feedback, error: errorMsg });
} 