import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import firebaseConfig from "@/firebase-applet-config.json";
import { sendHourlyReminderEmail, TaskItem } from "@/lib/emailService";

// Prevent static compilation of this API route during build time
export const dynamic = "force-dynamic";

// Initialize Firebase Admin SDK lazily with highly resilient fallbacks
function getAdminDb() {
  if (getApps().length === 0) {
    try {
      // First, attempt standard automatic environment detection (recommended for Cloud Run)
      initializeApp();
    } catch (defaultInitErr) {
      console.warn("[Hourly Reminders Cron] Standard auto-init failed, falling back to explicit project ID initialization:", defaultInitErr);
      try {
        initializeApp({
          projectId: firebaseConfig.projectId,
        });
      } catch (explicitInitErr) {
        console.error("[Hourly Reminders Cron] Critical: Failed all Firebase Admin initializations:", explicitInitErr);
        throw explicitInitErr;
      }
    }
  }

  // Resiliently retrieve Firestore. If the named database fails or is not provisioned on the target, fallback to default.
  try {
    if (firebaseConfig.firestoreDatabaseId) {
      return getFirestore(getApp(), firebaseConfig.firestoreDatabaseId);
    }
  } catch (dbErr) {
    console.warn(`[Hourly Reminders Cron] Failed to access configured database '${firebaseConfig.firestoreDatabaseId}', falling back to default database:`, dbErr);
  }
  
  return getFirestore(getApp());
}

export async function GET(req: NextRequest) {
  try {
    console.log("[Hourly Reminders Cron] Starting trigger process...");

    // Basic authorization protection using an optional CRON_SECRET environment variable
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      console.warn("[Hourly Reminders Cron] Unauthorized trigger attempt blocked.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminDb = getAdminDb();

    // 1. Get all registered users from our Firestore users directory
    const usersSnapshot = await adminDb.collection("users").get();
    if (usersSnapshot.empty) {
      console.log("[Hourly Reminders Cron] No users found in Firestore users directory.");
      return NextResponse.json({ message: "No registered users found." }, { status: 200 });
    }

    const users = usersSnapshot.docs.map(doc => ({
      uid: doc.id,
      email: doc.data().email as string,
    }));

    console.log(`[Hourly Reminders Cron] Found ${users.length} registered users. Querying active tasks...`);

    const results = [];

    // 2. Fetch active tasks for each user and dispatch notifications if they have pending tasks
    for (const user of users) {
      if (!user.email) {
        console.warn(`[Hourly Reminders Cron] User ${user.uid} is missing an email address. Skipping.`);
        continue;
      }

      const tasksSnapshot = await adminDb.collection("tasks")
        .where("userId", "==", user.uid)
        .get();

      const tasks: TaskItem[] = [];
      tasksSnapshot.forEach(doc => {
        tasks.push(doc.data() as TaskItem);
      });

      const pendingTasks = tasks.filter(t => t.status !== "completed");

      if (pendingTasks.length === 0) {
        console.log(`[Hourly Reminders Cron] User ${user.email} has 0 pending tasks. Skipping.`);
        continue;
      }

      try {
        console.log(`[Hourly Reminders Cron] Sending reminder to ${user.email} for ${pendingTasks.length} pending tasks...`);
        await sendHourlyReminderEmail(user.email, pendingTasks);
        results.push({ email: user.email, status: "sent", count: pendingTasks.length });
      } catch (emailErr: any) {
        console.error(`[Hourly Reminders Cron] Failed to send email to ${user.email}:`, emailErr);
        results.push({ email: user.email, status: "error", error: emailErr.message || String(emailErr) });
      }
    }

    console.log("[Hourly Reminders Cron] Hourly execution finished.", results);
    return NextResponse.json({
      message: "Hourly reminders processing complete.",
      results,
    }, { status: 200 });

  } catch (err: any) {
    console.error("[Hourly Reminders Cron] Critical failure in reminder service:", err);
    return NextResponse.json({
      error: "Internal server error in reminder service.",
      details: err.message || String(err),
    }, { status: 500 });
  }
}

// Support POST triggers as well to ensure total routing compatibility
export async function POST(req: NextRequest) {
  return GET(req);
}
