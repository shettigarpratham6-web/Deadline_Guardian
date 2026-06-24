"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Shield,
  Plus,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  LogOut,
  User,
  Trash2,
  ChevronRight,
  TrendingUp,
  Brain,
  ListTodo,
  Sparkles,
  Bell,
  Sliders,
  Check,
  X,
  RefreshCw,
  Zap,
  Info,
  Layers,
  CheckSquare
} from "lucide-react";
import {
  auth,
  db,
  loginWithGoogle,
  logout,
  handleFirestoreError,
  OperationType
} from "@/lib/firebase";
import {
  onAuthStateChanged,
  User as FirebaseUser
} from "firebase/auth";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  setDoc
} from "firebase/firestore";

// Types
interface Subtask {
  title: string;
  completed: boolean;
}

interface Task {
  id: string;
  userId: string;
  title: string;
  description: string;
  deadline: string;
  priority: "low" | "medium" | "high";
  status: "pending" | "active" | "completed";
  subtasks: Subtask[];
  createdAt: string;
  updatedAt: string;
}

interface PlannerData {
  todayPath: string;
  workloadAssessment: "relaxed" | "moderate" | "intense";
  recommendations: string[];
  productivityScore: number;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: "warning" | "success" | "info" | "alert";
  createdAt: string;
  read: boolean;
}

export default function Page() {
  // Authentication & Loading
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Active View / Navigation Tab
  const [activeTab, setActiveTab] = useState<"dashboard" | "vault" | "planner" | "security">("dashboard");

  // Data States
  const [tasks, setTasks] = useState<Task[]>([]);
  const [planner, setPlanner] = useState<PlannerData | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isSyncingPlanner, setIsSyncingPlanner] = useState(false);

  // Modals & Forms
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Form Fields
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskDeadline, setTaskDeadline] = useState("");
  const [taskPriority, setTaskPriority] = useState<"low" | "medium" | "high">("medium");
  const [taskStatus, setTaskStatus] = useState<"pending" | "active" | "completed">("pending");
  const [tempSubtasks, setTempSubtasks] = useState<Subtask[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [isBreakingDown, setIsBreakingDown] = useState(false);

  // Alerts state for toast or top banners
  const [systemMessage, setSystemMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  // Monitor Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      if (currentUser && currentUser.email) {
        try {
          await setDoc(doc(db, "users", currentUser.uid), {
            email: currentUser.email,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}`);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Fetch user specific data from Firestore when logged in
  useEffect(() => {
    if (!user) {
      setTasks([]);
      setPlanner(null);
      setNotifications([]);
      return;
    }

    // 1. Listen to Tasks
    const tasksRef = collection(db, "tasks");
    const tasksQuery = query(
      tasksRef,
      where("userId", "==", user.uid)
    );

    const unsubTasks = onSnapshot(tasksQuery, (snapshot) => {
      const taskList: Task[] = [];
      snapshot.forEach((docSnap) => {
        taskList.push({ id: docSnap.id, ...docSnap.data() } as Task);
      });
      // Sort client-side by deadline asc, fallback to createdAt asc
      taskList.sort((a, b) => {
        const timeA = a.deadline ? new Date(a.deadline).getTime() : 0;
        const timeB = b.deadline ? new Date(b.deadline).getTime() : 0;
        if (timeA !== timeB) return timeA - timeB;
        
        const createA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const createB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return createA - createB;
      });
      setTasks(taskList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "tasks");
    });

    // 2. Listen to Planner
    const plannerRef = collection(db, "planners");
    const plannerQuery = query(
      plannerRef,
      where("userId", "==", user.uid)
    );

    const unsubPlanner = onSnapshot(plannerQuery, (snapshot) => {
      if (!snapshot.empty) {
        const plannerList: PlannerData[] = [];
        snapshot.forEach((docSnap) => {
          plannerList.push(docSnap.data() as PlannerData);
        });
        // Sort client-side by createdAt descending to find the latest
        plannerList.sort((a, b) => {
          const timeA = (a as any).createdAt ? new Date((a as any).createdAt).getTime() : 0;
          const timeB = (b as any).createdAt ? new Date((b as any).createdAt).getTime() : 0;
          return timeB - timeA;
        });
        setPlanner(plannerList[0]);
      } else {
        setPlanner(null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "planners");
    });

    // 3. Listen to Notifications
    const notifRef = collection(db, "notifications");
    const notifQuery = query(
      notifRef,
      where("userId", "==", user.uid)
    );

    const unsubNotif = onSnapshot(notifQuery, (snapshot) => {
      const list: Notification[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Notification);
      });
      // Sort client-side by createdAt descending
      list.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });
      setNotifications(list.slice(0, 15));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "notifications");
    });

    return () => {
      unsubTasks();
      unsubPlanner();
      unsubNotif();
    };
  }, [user]);

  // Show status banner temporarily
  const triggerBanner = (text: string, type: "success" | "error" | "info" = "info") => {
    setSystemMessage({ text, type });
    setTimeout(() => {
      setSystemMessage(null);
    }, 4500);
  };

  // Google Sign In handler
  const handleSignIn = async () => {
    try {
      const loggedUser = await loginWithGoogle();
      triggerBanner(`Welcome back, ${loggedUser.displayName || "Guardian"}`, "success");
    } catch (err: any) {
      triggerBanner("Authentication failed. Please try again.", "error");
    }
  };

  // Sign Out handler
  const handleSignOut = async () => {
    try {
      await logout();
      triggerBanner("Successfully locked workspace. Session ended.", "info");
    } catch (err: any) {
      triggerBanner("Logout failed.", "error");
    }
  };

  // Add subtask manually in form
  const handleAddManualSubtask = () => {
    if (!newSubtaskTitle.trim()) return;
    setTempSubtasks([...tempSubtasks, { title: newSubtaskTitle.trim(), completed: false }]);
    setNewSubtaskTitle("");
  };

  // Remove subtask from form
  const handleRemoveSubtask = (index: number) => {
    setTempSubtasks(tempSubtasks.filter((_, i) => i !== index));
  };

  // Call Gemini breakdown API route
  const handleAIBreakdown = async () => {
    if (!taskTitle.trim()) {
      triggerBanner("Please provide a task title first.", "error");
      return;
    }
    setIsBreakingDown(true);
    try {
      const res = await fetch("/api/gemini/breakdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: taskTitle, description: taskDesc }),
      });
      const data = await res.json();
      if (data.subtasks) {
        setTempSubtasks(data.subtasks);
        triggerBanner("Strategic steps synthesized successfully.", "success");
      } else if (data.error) {
        triggerBanner(data.error, "error");
      }
    } catch (err) {
      triggerBanner("AI analysis failed.", "error");
    } finally {
      setIsBreakingDown(false);
    }
  };

  // Open task creator/editor
  const openTaskModal = (task: Task | null = null) => {
    if (task) {
      setEditingTask(task);
      setTaskTitle(task.title);
      setTaskDesc(task.description);
      setTaskDeadline(task.deadline);
      setTaskPriority(task.priority);
      setTaskStatus(task.status);
      setTempSubtasks(task.subtasks || []);
    } else {
      setEditingTask(null);
      setTaskTitle("");
      setTaskDesc("");
      // Default tomorrow date/time
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(12, 0, 0, 0);
      setTaskDeadline(tomorrow.toISOString().slice(0, 16));
      setTaskPriority("medium");
      setTaskStatus("pending");
      setTempSubtasks([]);
    }
    setIsAddModalOpen(true);
  };

  // Save Task to Firestore
  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!taskTitle.trim() || !taskDeadline) {
      triggerBanner("Title and Deadline are required.", "error");
      return;
    }

    try {
      const taskData = {
        userId: user.uid,
        title: taskTitle.trim(),
        description: taskDesc.trim(),
        deadline: taskDeadline,
        priority: taskPriority,
        status: taskStatus,
        subtasks: tempSubtasks,
        updatedAt: new Date().toISOString()
      };

      if (editingTask) {
        // Edit existing
        const taskDocRef = doc(db, "tasks", editingTask.id);
        await updateDoc(taskDocRef, {
          ...taskData,
          createdAt: editingTask.createdAt // keep original
        });
        triggerBanner(`Updated task: "${taskTitle}"`, "success");
        
        // Add log / notification
        await addDoc(collection(db, "notifications"), {
          userId: user.uid,
          title: "Task Modified",
          message: `The parameters for task "${taskTitle}" were re-evaluated.`,
          type: "info",
          read: false,
          createdAt: new Date().toISOString()
        });
      } else {
        // Create new
        const newTaskRef = doc(collection(db, "tasks"));
        await setDoc(newTaskRef, {
          ...taskData,
          id: newTaskRef.id,
          createdAt: new Date().toISOString()
        });
        triggerBanner(`Task guarded: "${taskTitle}"`, "success");

        // Add initial system alert
        await addDoc(collection(db, "notifications"), {
          userId: user.uid,
          title: "New Target Set",
          message: `AI Guardian is now monitoring deadline for "${taskTitle}".`,
          type: "success",
          read: false,
          createdAt: new Date().toISOString()
        });
      }

      setIsAddModalOpen(false);
      // Automatically refresh strategic plan if we changed/added a task
      triggerAutoRegeneratePlanner();
    } catch (err: any) {
      handleFirestoreError(err, editingTask ? OperationType.UPDATE : OperationType.CREATE, "tasks");
    }
  };

  // Delete Task
  const handleDeleteTask = async (taskId: string, title: string) => {
    if (!user) return;
    if (!confirm(`Are you sure you want to remove "${title}"?`)) return;

    try {
      await deleteDoc(doc(db, "tasks", taskId));
      triggerBanner(`Removed "${title}"`, "info");

      await addDoc(collection(db, "notifications"), {
        userId: user.uid,
        title: "Target Deleted",
        message: `Task "${title}" has been removed from active shields.`,
        type: "warning",
        read: false,
        createdAt: new Date().toISOString()
      });

      triggerAutoRegeneratePlanner();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `tasks/${taskId}`);
    }
  };

  // Quickly toggle task status
  const handleToggleStatus = async (task: Task) => {
    if (!user) return;
    const newStatus = task.status === "completed" ? "pending" : "completed";
    try {
      await updateDoc(doc(db, "tasks", task.id), {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
      triggerBanner(
        newStatus === "completed" 
          ? `Archived target as COMPLETED: "${task.title}"` 
          : `Re-opened target: "${task.title}"`,
        newStatus === "completed" ? "success" : "info"
      );

      // Log notification
      await addDoc(collection(db, "notifications"), {
        userId: user.uid,
        title: newStatus === "completed" ? "Objective Secured" : "Objective Re-opened",
        message: newStatus === "completed" 
          ? `All parameters for "${task.title}" have been successfully validated and completed.`
          : `Shields restored for "${task.title}" after manual reactivation.`,
        type: newStatus === "completed" ? "success" : "info",
        read: false,
        createdAt: new Date().toISOString()
      });

      triggerAutoRegeneratePlanner();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `tasks/${task.id}`);
    }
  };

  // Toggle single subtask completion state
  const handleToggleSubtask = async (task: Task, subtaskIndex: number) => {
    if (!user) return;
    const updatedSubtasks = [...task.subtasks];
    updatedSubtasks[subtaskIndex].completed = !updatedSubtasks[subtaskIndex].completed;

    try {
      await updateDoc(doc(db, "tasks", task.id), {
        subtasks: updatedSubtasks,
        updatedAt: new Date().toISOString()
      });
      triggerBanner(`Subtask "${updatedSubtasks[subtaskIndex].title}" status modified.`, "info");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `tasks/${task.id}`);
    }
  };

  // Call Gemini planner API and update Firestore
  const triggerAutoRegeneratePlanner = async () => {
    // Hidden auto-planner helper
    if (!user) return;
    // Debounce/lazy load planner in background
    setTimeout(async () => {
      try {
        const activeTasks = tasks.map(t => ({
          title: t.title,
          description: t.description,
          priority: t.priority,
          deadline: t.deadline,
          status: t.status
        }));
        if (activeTasks.length === 0) return;

        const res = await fetch("/api/gemini/planner", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tasks: activeTasks }),
        });
        const data = await res.json();
        if (data.todayPath) {
          const plannerId = user.uid + "_" + new Date().toISOString().slice(0, 10);
          await setDoc(doc(db, "planners", plannerId), {
            userId: user.uid,
            date: new Date().toISOString().slice(0, 10),
            todayPath: data.todayPath,
            workloadAssessment: data.workloadAssessment,
            recommendations: data.recommendations,
            productivityScore: data.productivityScore,
            createdAt: new Date().toISOString()
          });
        }
      } catch (err) {
        console.error("Auto planner failed in background:", err);
      }
    }, 1500);
  };

  // Explicit Planner trigger
  const handleRegeneratePlanner = async () => {
    if (!user) return;
    if (tasks.length === 0) {
      triggerBanner("Please configure active targets (tasks) first to allow strategic planning.", "error");
      return;
    }
    setIsSyncingPlanner(true);
    try {
      const activeTasks = tasks.map(t => ({
        title: t.title,
        description: t.description,
        priority: t.priority,
        deadline: t.deadline,
        status: t.status
      }));

      const res = await fetch("/api/gemini/planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks: activeTasks }),
      });
      const data = await res.json();
      if (data.todayPath) {
        const plannerId = user.uid + "_" + new Date().toISOString().slice(0, 10);
        await setDoc(doc(db, "planners", plannerId), {
          userId: user.uid,
          date: new Date().toISOString().slice(0, 10),
          todayPath: data.todayPath,
          workloadAssessment: data.workloadAssessment,
          recommendations: data.recommendations,
          productivityScore: data.productivityScore,
          createdAt: new Date().toISOString()
        });
        triggerBanner("Daily strategic path synthesized.", "success");
      } else if (data.error) {
        triggerBanner(data.error, "error");
      }
    } catch (err) {
      triggerBanner("Strategic analysis failed.", "error");
    } finally {
      setIsSyncingPlanner(false);
    }
  };

  // Clear all notifications (permanently delete from database)
  const handleClearAllNotifications = async () => {
    if (!user) return;
    try {
      const deletePromises = notifications.map(notif => 
        deleteDoc(doc(db, "notifications", notif.id))
      );
      await Promise.all(deletePromises);
      triggerBanner("Intelligence logs permanently cleared.", "success");
    } catch (err) {
      console.error("Failed to clear notifications:", err);
      triggerBanner("Failed to clear security logs.", "error");
    }
  };

  // Calculate upcoming critical status
  const pendingTasks = tasks.filter(t => t.status !== "completed");
  const completedTasksCount = tasks.filter(t => t.status === "completed").length;
  const criticalTasksCount = pendingTasks.filter(t => {
    const isHigh = t.priority === "high";
    const hoursRemaining = (new Date(t.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60);
    return isHigh || hoursRemaining < 24;
  }).length;

  const completionRate = tasks.length > 0 ? Math.round((completedTasksCount / tasks.length) * 100) : 0;

  // Render Authentication Screen
  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#08090b] text-white">
        <div className="relative flex flex-col items-center">
          <Shield className="w-16 h-16 text-emerald-500 animate-pulse" />
          <div className="mt-4 text-xs font-mono tracking-[0.2em] text-neutral-500">INIT_GUARDIAN_SECURE_CORES...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen bg-[#08090b] items-center justify-center p-4">
        <div className="w-full max-w-5xl grid md:grid-cols-2 gap-8 items-center bg-[#0d0e12] rounded-2xl border border-neutral-900 p-8 relative overflow-hidden shadow-2xl">
          {/* Accent light decoration */}
          <div className="absolute -top-12 -left-12 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-12 -right-12 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Left Column: Graphics and Marketing */}
          <div className="flex flex-col justify-center space-y-6 relative z-10">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-emerald-950/50 border border-emerald-500/20 rounded-lg">
                <Shield className="w-8 h-8 text-emerald-500" />
              </div>
              <div>
                <span className="font-mono text-xs tracking-widest text-emerald-500 uppercase">SYS_ACTIVE</span>
                <h1 className="text-xl font-bold tracking-tight text-white">Deadline Guardian</h1>
              </div>
            </div>

            <div className="space-y-3">
              <h2 className="text-3xl font-extrabold tracking-tight text-white leading-tight">
                Your Strategic <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-200">AI Shield</span> Against Deadlines.
              </h2>
              <p className="text-neutral-400 text-sm leading-relaxed">
                An elite productivity system engineered with Next-Gen cognitive analytics. Automatically orchestrates workflows, drafts optimized strategic paths, and guards critical deadlines in real-time.
              </p>
            </div>

            {/* Feature small bullets */}
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="flex items-start space-x-2">
                <Brain className="w-4 h-4 text-emerald-500 mt-1" />
                <div className="text-xs text-neutral-300">
                  <span className="font-bold block">Cognitive Breakdowns</span>
                  Auto-explodes tasks into clear actionable steps.
                </div>
              </div>
              <div className="flex items-start space-x-2">
                <Sliders className="w-4 h-4 text-emerald-500 mt-1" />
                <div className="text-xs text-neutral-300">
                  <span className="font-bold block">Dynamic Prioritization</span>
                  Workloads assessed with high precision.
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Authentication Card */}
          <div className="bg-[#111216] rounded-xl border border-neutral-800 p-8 flex flex-col space-y-6 relative z-10 shadow-lg">
            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold tracking-tight text-white">Initialize Workstation</h3>
              <p className="text-xs text-neutral-500 font-mono">SECURE ACCESS TO SHIELD MATRIX</p>
            </div>

            <div className="space-y-4">
              <button
                onClick={handleSignIn}
                className="w-full flex items-center justify-center space-x-3 bg-white hover:bg-neutral-100 text-neutral-900 font-medium py-3 px-4 rounded-lg transition duration-200 cursor-pointer shadow-md"
              >
                {/* SVG Google icon */}
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span>Authorize with Google Sign-In</span>
              </button>
            </div>

            <div className="text-center font-mono text-[9px] text-neutral-600">
              BY LAUNCHING THE GUARDIAN INTERFACE YOU ACCEPT HIGH_ACCURACY METRIC POLICIES
            </div>
          </div>
        </div>
      </div>
    );
  }

  // MAIN SECURE WORKSPACE FOR LOGGED IN USERS
  return (
    <div className="flex h-screen bg-[#08090b] text-[#f3f4f6] relative overflow-hidden font-sans">
      {/* Toast Notification Banner */}
      <AnimatePresence>
        {systemMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-lg border flex items-center space-x-3 shadow-2xl"
            style={{
              backgroundColor:
                systemMessage.type === "success"
                  ? "#064e3b"
                  : systemMessage.type === "error"
                  ? "#7f1d1d"
                  : "#1e1b4b",
              borderColor:
                systemMessage.type === "success"
                  ? "#059669"
                  : systemMessage.type === "error"
                  ? "#dc2626"
                  : "#4f46e5"
            }}
          >
            {systemMessage.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : systemMessage.type === "error" ? (
              <AlertTriangle className="w-5 h-5 text-rose-400" />
            ) : (
              <Info className="w-5 h-5 text-indigo-400" />
            )}
            <span className="text-xs font-medium text-white">{systemMessage.text}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar Navigation */}
      <aside className="w-64 bg-[#0a0b0e] border-r border-neutral-900 flex flex-col justify-between relative z-20">
        <div className="flex flex-col">
          {/* Logo Brand Panel */}
          <div className="p-6 border-b border-neutral-900 flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-950/60 border border-emerald-500/40 flex items-center justify-center">
              <Shield className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <div className="text-sm font-extrabold tracking-tight text-white">GUARDIAN AI</div>
              <div className="text-[9px] font-mono tracking-widest text-emerald-500 uppercase">SYS_ACTIVE</div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1.5 flex-1">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium transition duration-200 cursor-pointer ${
                activeTab === "dashboard"
                  ? "bg-neutral-900 border border-neutral-800 text-emerald-400"
                  : "text-neutral-400 hover:bg-neutral-900/50 hover:text-neutral-200"
              }`}
            >
              <Layers className="w-4.5 h-4.5" />
              <span>Dashboard Core</span>
            </button>

            <button
              onClick={() => setActiveTab("vault")}
              className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium transition duration-200 cursor-pointer ${
                activeTab === "vault"
                  ? "bg-neutral-900 border border-neutral-800 text-emerald-400"
                  : "text-neutral-400 hover:bg-neutral-900/50 hover:text-neutral-200"
              }`}
            >
              <ListTodo className="w-4.5 h-4.5" />
              <span>Task Ledger ({tasks.length})</span>
            </button>

            <button
              onClick={() => setActiveTab("planner")}
              className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium transition duration-200 cursor-pointer ${
                activeTab === "planner"
                  ? "bg-neutral-900 border border-neutral-800 text-emerald-400"
                  : "text-neutral-400 hover:bg-neutral-900/50 hover:text-neutral-200"
              }`}
            >
              <Brain className="w-4.5 h-4.5" />
              <span>AI Planner</span>
            </button>

            <button
              onClick={() => setActiveTab("security")}
              className={`w-full flex items-center space-x-3 px-4 py-2.5 rounded-lg text-sm font-medium transition duration-200 cursor-pointer ${
                activeTab === "security"
                  ? "bg-neutral-900 border border-neutral-800 text-emerald-400"
                  : "text-neutral-400 hover:bg-neutral-900/50 hover:text-neutral-200"
              }`}
            >
              <Bell className="w-4.5 h-4.5" />
              <div className="flex justify-between items-center w-full">
                <span>Intelligence Feed</span>
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="bg-emerald-500 text-black font-mono text-[9px] px-1.5 py-0.5 rounded-full font-bold">
                    {notifications.filter(n => !n.read).length}
                  </span>
                )}
              </div>
            </button>
          </nav>
        </div>

        {/* User Card & Sign Out Panel */}
        <div className="p-4 border-t border-neutral-900 space-y-4">
          <div className="flex items-center space-x-3 bg-neutral-900/40 p-2 rounded-lg border border-neutral-900">
            {user.photoURL ? (
              <img
                src={user.photoURL}
                alt="Profile"
                className="w-9 h-9 rounded-full border border-neutral-700"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-neutral-800 flex items-center justify-center text-emerald-400 font-bold border border-neutral-700">
                {user.displayName?.charAt(0) || "U"}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-white truncate">{user.displayName || "User Session"}</div>
              <div className="text-[9px] font-mono text-neutral-500 uppercase flex items-center">
                <Zap className="w-2.5 h-2.5 mr-0.5 text-emerald-500 fill-emerald-500" /> SHIELD PRO
              </div>
            </div>
          </div>

          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center space-x-2 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white text-xs font-mono py-2 rounded-lg transition duration-200 border border-neutral-800 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>DISCONNECT SESSION</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 relative z-10 overflow-y-auto">
        {/* Top Header Controls */}
        <header className="h-16 border-b border-neutral-900 px-8 flex items-center justify-between bg-[#08090b]/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center space-x-4">
            <span className="font-mono text-xs text-neutral-500 uppercase tracking-widest">WORKSTATION_MAIN</span>
            <span className="text-neutral-800">/</span>
            <span className="text-xs font-semibold text-white uppercase tracking-wider font-mono">
              {activeTab === "dashboard" && "DASHBOARD_CORE"}
              {activeTab === "vault" && "ACTIVE_TASK_LEDGER"}
              {activeTab === "planner" && "COGNITIVE_PLANNING_CENTER"}
              {activeTab === "security" && "INTELLIGENCE_ALERTS"}
            </span>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => openTaskModal()}
              className="flex items-center space-x-2 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs py-2 px-3.5 rounded-lg shadow-lg hover:shadow-emerald-500/20 transition duration-200 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>NEW OBJECTIVE</span>
            </button>
          </div>
        </header>

        {/* Tab content screens */}
        <div className="p-8 flex-1">
          {/* TAB 1: DASHBOARD VIEW */}
          {activeTab === "dashboard" && (
            <div className="space-y-6">
              {/* Strategic Path Banner */}
              <div className="bg-gradient-to-r from-neutral-900 via-[#0d0e12] to-neutral-900 border border-neutral-800 p-6 rounded-xl flex items-start space-x-4 relative overflow-hidden shadow-xl">
                <div className="absolute -right-4 -top-12 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl" />
                <div className="p-3 bg-emerald-950/50 border border-emerald-500/20 rounded-lg text-emerald-400 mt-1 flex-shrink-0 animate-pulse">
                  <Brain className="w-6 h-6" />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-[10px] tracking-widest text-emerald-500 uppercase">TODAY'S STRATEGIC PATH</span>
                    <button
                      onClick={handleRegeneratePlanner}
                      disabled={isSyncingPlanner}
                      className="text-neutral-500 hover:text-emerald-400 transition flex items-center space-x-1.5 text-xs cursor-pointer font-mono"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncingPlanner ? "animate-spin text-emerald-500" : ""}`} />
                      <span>{isSyncingPlanner ? "PLANNING..." : "RE-SYNTHESIZE"}</span>
                    </button>
                  </div>
                  <h3 className="text-sm font-medium text-neutral-300 italic leading-relaxed">
                    {planner ? `"${planner.todayPath}"` : '"Launch a re-synthesize or add active objectives to have the AI Guardian forge your customized tactical focus path."'}
                  </h3>
                </div>
              </div>

              {/* bento grid of dashboard metrics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Score */}
                <div className="bg-[#0d0e12] border border-neutral-900 p-5 rounded-xl flex flex-col justify-between relative overflow-hidden">
                  <div className="flex justify-between items-start">
                    <span className="text-xs text-neutral-400 font-medium">Guardian Score</span>
                    <Shield className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="mt-4 flex items-baseline space-x-2">
                    <span className="text-4xl font-extrabold tracking-tight text-white">
                      {planner ? planner.productivityScore : 100}
                    </span>
                    <span className="text-neutral-500 text-xs">/ 100</span>
                  </div>
                  <div className="mt-3 text-[10px] font-mono text-neutral-500">
                    Calculated focus level based on deadlines
                  </div>
                </div>

                {/* Workload */}
                <div className="bg-[#0d0e12] border border-neutral-900 p-5 rounded-xl flex flex-col justify-between relative overflow-hidden">
                  <div className="flex justify-between items-start">
                    <span className="text-xs text-neutral-400 font-medium">Workload Load</span>
                    <Layers className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="mt-4 flex items-baseline">
                    <span className="text-2xl font-bold tracking-tight text-white uppercase font-mono">
                      {planner ? planner.workloadAssessment : "N/A"}
                    </span>
                  </div>
                  <div className="mt-3 text-[10px] font-mono text-neutral-500 flex items-center">
                    <span className={`w-2 h-2 rounded-full mr-1.5 ${
                      planner?.workloadAssessment === "intense" ? "bg-rose-500 animate-ping" : 
                      planner?.workloadAssessment === "moderate" ? "bg-amber-500" : "bg-emerald-500"
                    }`} />
                    Active stress load state
                  </div>
                </div>

                {/* Completion Rate */}
                <div className="bg-[#0d0e12] border border-neutral-900 p-5 rounded-xl flex flex-col justify-between relative overflow-hidden">
                  <div className="flex justify-between items-start">
                    <span className="text-xs text-neutral-400 font-medium">Completion Rate</span>
                    <CheckSquare className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="mt-4 flex items-baseline space-x-2">
                    <span className="text-4xl font-extrabold tracking-tight text-white">
                      {completionRate}%
                    </span>
                  </div>
                  <div className="mt-3 text-[10px] font-mono text-neutral-500">
                    {completedTasksCount} of {tasks.length} objectives archived
                  </div>
                </div>

                {/* Critical Threats */}
                <div className="bg-[#0d0e12] border border-neutral-900 p-5 rounded-xl flex flex-col justify-between relative overflow-hidden">
                  <div className="flex justify-between items-start">
                    <span className="text-xs text-rose-400 font-medium font-mono">CRITICAL THREATS</span>
                    <AlertTriangle className="w-4 h-4 text-rose-500" />
                  </div>
                  <div className="mt-4 flex items-baseline">
                    <span className="text-4xl font-extrabold tracking-tight text-white">
                      {criticalTasksCount}
                    </span>
                  </div>
                  <div className="mt-3 text-[10px] font-mono text-rose-400/80">
                    High-priority or items due within 24 hours
                  </div>
                </div>
              </div>

              {/* Main Content Splitted Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Column 1 & 2: Urgently Guarded Tasks */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold tracking-tight text-white font-mono uppercase">ACTIVE TARGET LIST</h3>
                    <button
                      onClick={() => setActiveTab("vault")}
                      className="text-xs text-emerald-500 hover:underline flex items-center space-x-1"
                    >
                      <span>View ledger</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-3">
                    {pendingTasks.length === 0 ? (
                      <div className="bg-neutral-950 rounded-xl p-8 border border-neutral-900 text-center space-y-2">
                        <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto opacity-40" />
                        <p className="text-xs text-neutral-400 font-mono">NO ACTIVE TARGETS REMAINING. WORKSPACE IS SECURE.</p>
                      </div>
                    ) : (
                      pendingTasks.slice(0, 3).map((task) => {
                        const dateObj = new Date(task.deadline);
                        const isOverdue = dateObj.getTime() < new Date().getTime();
                        return (
                          <div
                            key={task.id}
                            className="bg-[#0d0e12] border border-neutral-900 hover:border-neutral-800 p-5 rounded-xl space-y-4 transition duration-200 flex flex-col"
                          >
                            <div className="flex justify-between items-start">
                              <div className="flex items-start space-x-3">
                                <button
                                  onClick={() => handleToggleStatus(task)}
                                  className="mt-1 w-5 h-5 rounded border border-neutral-700 hover:border-emerald-500 flex items-center justify-center transition cursor-pointer"
                                >
                                  {task.status === "completed" && (
                                    <Check className="w-4 h-4 text-emerald-500" />
                                  )}
                                </button>
                                <div>
                                  <h4 className="text-sm font-bold text-white leading-tight">{task.title}</h4>
                                  <p className="text-xs text-neutral-400 mt-1 line-clamp-1">{task.description}</p>
                                </div>
                              </div>

                              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                                task.priority === "high" ? "bg-rose-950/60 text-rose-400 border border-rose-900/40" :
                                task.priority === "medium" ? "bg-amber-950/60 text-amber-400 border border-amber-900/40" :
                                "bg-emerald-950/60 text-emerald-400 border border-emerald-900/40"
                              }`}>
                                {task.priority}
                              </span>
                            </div>

                            {/* Subtask list */}
                            {task.subtasks && task.subtasks.length > 0 && (
                              <div className="bg-neutral-950/80 rounded-lg p-3 border border-neutral-900 space-y-2">
                                <div className="text-[9px] font-mono tracking-wider text-neutral-500 uppercase flex items-center justify-between">
                                  <span>Cognitive Steps Breakdown</span>
                                  <span>
                                    {task.subtasks.filter(s => s.completed).length}/{task.subtasks.length}
                                  </span>
                                </div>
                                <div className="space-y-1.5">
                                  {task.subtasks.map((sub, idx) => (
                                    <div
                                      key={idx}
                                      onClick={() => handleToggleSubtask(task, idx)}
                                      className="flex items-center space-x-2 text-xs hover:text-white transition cursor-pointer"
                                    >
                                      <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                                        sub.completed ? "bg-emerald-950/60 border-emerald-500 text-emerald-400" : "border-neutral-800"
                                      }`}>
                                        {sub.completed && <Check className="w-2.5 h-2.5" />}
                                      </div>
                                      <span className={sub.completed ? "line-through text-neutral-500" : "text-neutral-300"}>
                                        {sub.title}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Deadline bottom info */}
                            <div className="flex justify-between items-center text-[11px] font-mono pt-2 border-t border-neutral-900/50">
                              <div className={`flex items-center space-x-1 ${isOverdue ? "text-rose-400" : "text-neutral-400"}`}>
                                <Clock className="w-3.5 h-3.5" />
                                <span>
                                  {isOverdue ? "OVERDUE: " : "DUE: "}
                                  {dateObj.toLocaleDateString()} {dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>

                              <div className="flex space-x-2">
                                <button
                                  onClick={() => openTaskModal(task)}
                                  className="text-xs text-neutral-400 hover:text-white transition cursor-pointer"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteTask(task.id, task.title)}
                                  className="text-xs text-neutral-500 hover:text-rose-400 transition cursor-pointer"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Column 3: Intelligence Alert Feed */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold tracking-tight text-white font-mono uppercase">SECURITY FEED</h3>
                    <button
                      onClick={handleClearAllNotifications}
                      className="text-xs text-neutral-500 hover:text-emerald-400 font-mono"
                    >
                      CLEAR_ALL
                    </button>
                  </div>

                  <div className="bg-[#0a0b0e] border border-neutral-900 rounded-xl p-4 divide-y divide-neutral-900 overflow-hidden">
                    {notifications.length === 0 ? (
                      <div className="text-center py-8 text-xs text-neutral-500 font-mono">
                        NO LOGS DETECTED. CHANNELS SAFE.
                      </div>
                    ) : (
                      notifications.slice(0, 5).map((notif) => (
                        <div key={notif.id} className={`py-3 flex items-start space-x-3 first:pt-0 last:pb-0 ${notif.read ? "opacity-60" : ""}`}>
                          <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                            notif.type === "warning" ? "bg-rose-500" :
                            notif.type === "success" ? "bg-emerald-500" :
                            "bg-indigo-500"
                          }`} />
                          <div className="flex-1 min-w-0">
                            <h5 className="text-xs font-bold text-white truncate">{notif.title}</h5>
                            <p className="text-[11px] text-neutral-400 mt-0.5 leading-relaxed">{notif.message}</p>
                            <span className="text-[9px] text-neutral-600 font-mono block mt-1">
                              {new Date(notif.createdAt).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TASK VAULT (LEDGER) */}
          {activeTab === "vault" && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-white">Objective Ledger</h2>
                  <p className="text-xs text-neutral-400 mt-1">Maintain your secure targets, priority classes, and sub-objectives.</p>
                </div>

                <div className="flex space-x-2">
                  <button
                    onClick={() => openTaskModal()}
                    className="flex items-center space-x-2 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs py-2 px-4 rounded-lg shadow transition cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>ADD TARGET</span>
                  </button>
                </div>
              </div>

              {/* Filtering summary count labels */}
              <div className="flex space-x-3 text-xs font-mono">
                <div className="bg-neutral-900 border border-neutral-800 px-3.5 py-1.5 rounded-lg">
                  <span className="text-neutral-500">PENDING: </span>
                  <span className="text-white font-bold">{pendingTasks.length}</span>
                </div>
                <div className="bg-neutral-900 border border-neutral-800 px-3.5 py-1.5 rounded-lg">
                  <span className="text-neutral-500">ARCHIVED_COMPLETED: </span>
                  <span className="text-emerald-400 font-bold">{completedTasksCount}</span>
                </div>
              </div>

              {/* Complete Task Grid Ledger */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tasks.map((task) => {
                  const dateObj = new Date(task.deadline);
                  const isOverdue = dateObj.getTime() < new Date().getTime() && task.status !== "completed";
                  return (
                    <div
                      key={task.id}
                      className={`border p-5 rounded-xl flex flex-col justify-between transition duration-200 relative ${
                        task.status === "completed"
                          ? "bg-neutral-900/20 border-neutral-950/60"
                          : "bg-[#0d0e12] border-neutral-900 hover:border-neutral-800"
                      }`}
                    >
                      <div className="space-y-4">
                        <div className="flex justify-between items-start">
                          <div className="flex items-start space-x-3">
                            <button
                              onClick={() => handleToggleStatus(task)}
                              className={`mt-1 w-5 h-5 rounded border flex items-center justify-center transition cursor-pointer ${
                                task.status === "completed"
                                  ? "bg-emerald-950/60 border-emerald-500 text-emerald-400"
                                  : "border-neutral-700 hover:border-emerald-500 text-transparent"
                              }`}
                            >
                              <Check className="w-4.5 h-4.5" />
                            </button>
                            <div>
                              <h4 className={`text-sm font-bold text-white leading-tight ${task.status === "completed" ? "line-through text-neutral-500" : ""}`}>
                                {task.title}
                              </h4>
                              <p className="text-xs text-neutral-400 mt-1 leading-relaxed">{task.description}</p>
                            </div>
                          </div>

                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                            task.priority === "high" ? "bg-rose-950/60 text-rose-400 border border-rose-900/40" :
                            task.priority === "medium" ? "bg-amber-950/60 text-amber-400 border border-amber-900/40" :
                            "bg-emerald-950/60 text-emerald-400 border border-emerald-900/40"
                          }`}>
                            {task.priority}
                          </span>
                        </div>

                        {/* Interactive subtask step system */}
                        {task.subtasks && task.subtasks.length > 0 && (
                          <div className="bg-neutral-950/80 rounded-lg p-3 border border-neutral-900 space-y-2">
                            <div className="text-[9px] font-mono tracking-wider text-neutral-500 uppercase flex justify-between items-center">
                              <span>Action Steps Checklist</span>
                              <span>
                                {task.subtasks.filter(s => s.completed).length}/{task.subtasks.length}
                              </span>
                            </div>
                            <div className="space-y-1.5">
                              {task.subtasks.map((sub, idx) => (
                                <div
                                  key={idx}
                                  onClick={() => handleToggleSubtask(task, idx)}
                                  className="flex items-center space-x-2 text-xs hover:text-white transition cursor-pointer"
                                >
                                  <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                                    sub.completed ? "bg-emerald-950/60 border-emerald-500 text-emerald-400" : "border-neutral-800"
                                  }`}>
                                    {sub.completed && <Check className="w-2.5 h-2.5" />}
                                  </div>
                                  <span className={sub.completed ? "line-through text-neutral-500" : "text-neutral-300"}>
                                    {sub.title}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Footer specs */}
                      <div className="flex justify-between items-center text-[11px] font-mono pt-4 mt-4 border-t border-neutral-900/60">
                        <div className={`flex items-center space-x-1 ${isOverdue ? "text-rose-400" : "text-neutral-500"}`}>
                          <Clock className="w-3.5 h-3.5" />
                          <span>
                            {isOverdue ? "OVERDUE: " : "DUE: "}
                            {dateObj.toLocaleDateString()} {dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <div className="flex space-x-2">
                          <button
                            onClick={() => openTaskModal(task)}
                            className="text-xs text-neutral-400 hover:text-white transition cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteTask(task.id, task.title)}
                            className="text-xs text-neutral-500 hover:text-rose-400 transition cursor-pointer"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: COGNITIVE PLANNER SCREEN */}
          {activeTab === "planner" && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-white">AI Cognitive Planner</h2>
                  <p className="text-xs text-neutral-400 mt-1">Harness advanced strategic analytics to structure your daily flow.</p>
                </div>

                <button
                  onClick={handleRegeneratePlanner}
                  disabled={isSyncingPlanner}
                  className="flex items-center space-x-2 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs py-2.5 px-4 rounded-lg shadow-lg cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncingPlanner ? "animate-spin" : ""}`} />
                  <span>{isSyncingPlanner ? "SYNTHESIZING..." : "SYNTHESIZE DAILY PLAN"}</span>
                </button>
              </div>

              {planner ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left Big Card: Today's Path */}
                  <div className="lg:col-span-2 bg-[#0d0e12] border border-neutral-900 p-6 rounded-xl space-y-6">
                    <div className="flex items-center space-x-3 text-emerald-500 font-mono text-xs tracking-wider uppercase">
                      <Brain className="w-5 h-5 animate-pulse" />
                      <span>Today's Strategic Path</span>
                    </div>

                    <p className="text-neutral-200 text-lg leading-relaxed italic border-l-2 border-emerald-500/40 pl-4 py-1">
                      "{planner.todayPath}"
                    </p>

                    <div className="pt-4 border-t border-neutral-900 space-y-4">
                      <span className="font-mono text-xs text-neutral-400 uppercase tracking-wide">SYSTEM REC_ANALYSIS (3 KEY LAUNCHERS)</span>
                      
                      <div className="space-y-3">
                        {planner.recommendations.map((rec, idx) => (
                          <div key={idx} className="flex items-start space-x-3 bg-neutral-950/60 p-3 rounded-lg border border-neutral-900">
                            <span className="w-5 h-5 bg-emerald-950/60 border border-emerald-500/20 rounded flex items-center justify-center font-mono text-xs text-emerald-400 font-bold">
                              0{idx + 1}
                            </span>
                            <p className="text-neutral-300 text-xs leading-relaxed">{rec}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Panel: Workload Metric Status */}
                  <div className="space-y-6">
                    <div className="bg-[#0d0e12] border border-neutral-900 p-6 rounded-xl space-y-6 text-center">
                      <span className="font-mono text-xs text-neutral-400 uppercase tracking-wider block">Guardian Protection Rating</span>
                      
                      <div className="relative inline-flex items-center justify-center">
                        {/* Circular graphic */}
                        <div className="text-5xl font-extrabold text-white tracking-tight">
                          {planner.productivityScore}
                          <span className="text-neutral-500 text-xs font-mono">/100</span>
                        </div>
                      </div>

                      <div className="text-xs text-neutral-400 leading-relaxed px-4">
                        Your strategic load is securely balanced. AI engines are shielding focus zones perfectly.
                      </div>

                      <div className="pt-4 border-t border-neutral-900 flex justify-between items-center text-xs font-mono text-neutral-400">
                        <span>STRESS INDEX</span>
                        <span className="font-bold text-white uppercase">{planner.workloadAssessment}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-[#0d0e12] border border-neutral-900 rounded-xl p-12 text-center max-w-2xl mx-auto space-y-4">
                  <Sparkles className="w-12 h-12 text-emerald-500 mx-auto opacity-30 animate-pulse" />
                  <h3 className="text-base font-bold text-white font-mono">WORKSPACE STRATEGY OFFLINE</h3>
                  <p className="text-xs text-neutral-400 max-w-md mx-auto leading-relaxed">
                    AI strategic planners formulate real-time task load diagnostics and synthesize focus metrics securely. Launch plan synthesis now to calibrate shields.
                  </p>
                  <button
                    onClick={handleRegeneratePlanner}
                    disabled={isSyncingPlanner}
                    className="mt-2 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs py-2 px-4 rounded-lg cursor-pointer"
                  >
                    SYNTHESIZE MATRIX NOW
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: SYSTEM NOTIFICATIONS (INTELLIGENCE FEED) */}
          {activeTab === "security" && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-white font-mono">SECURITY LOGS & ALERTS</h2>
                  <p className="text-xs text-neutral-400 mt-1">Real-time telemetry of target movements and AI shields.</p>
                </div>

                <button
                  onClick={handleClearAllNotifications}
                  className="bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-xs font-mono py-2 px-4 rounded-lg transition text-neutral-300 cursor-pointer"
                >
                  CLEAR_TELEMETRY
                </button>
              </div>

              <div className="bg-[#0d0e12] border border-neutral-900 rounded-xl divide-y divide-neutral-900 overflow-hidden shadow-lg">
                {notifications.length === 0 ? (
                  <div className="p-12 text-center text-xs text-neutral-500 font-mono space-y-2">
                    <Shield className="w-10 h-10 text-neutral-800 mx-auto" />
                    <span>LOGS CLEAN. SECURE MATRIX SAFE.</span>
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <div
                      key={notif.id}
                      className={`p-5 flex items-start space-x-4 transition ${
                        notif.read ? "opacity-60 bg-neutral-950/20" : "bg-[#0d0e12]/80"
                      }`}
                    >
                      <div className={`p-2 rounded-lg ${
                        notif.type === "warning" ? "bg-rose-950/40 text-rose-400 border border-rose-900/20" :
                        notif.type === "success" ? "bg-emerald-950/40 text-emerald-400 border border-emerald-500/20" :
                        "bg-indigo-950/40 text-indigo-400 border border-indigo-900/20"
                      }`}>
                        {notif.type === "warning" ? (
                          <AlertTriangle className="w-5 h-5" />
                        ) : notif.type === "success" ? (
                          <CheckCircle2 className="w-5 h-5" />
                        ) : (
                          <Bell className="w-5 h-5" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex justify-between items-start">
                          <h4 className="text-sm font-bold text-white">{notif.title}</h4>
                          <span className="text-[10px] text-neutral-500 font-mono">
                            {new Date(notif.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-xs text-neutral-300 leading-relaxed">{notif.message}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Add / Edit Objective Modal Overlay */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#0d0e12] border border-neutral-800 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col"
            >
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-neutral-900 flex justify-between items-center bg-[#0a0b0e]">
                <div className="flex items-center space-x-2 text-emerald-400 font-mono text-xs tracking-wider">
                  <Shield className="w-4.5 h-4.5" />
                  <span>{editingTask ? "CONFIGURE_OBJECTIVE_ID" : "INITIALIZE_NEW_OBJECTIVE"}</span>
                </div>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="text-neutral-500 hover:text-white transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body / Form */}
              <form onSubmit={handleSaveTask} className="p-6 space-y-4 overflow-y-auto max-h-[75vh]">
                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-neutral-400 uppercase tracking-wider">Objective Title</label>
                  <input
                    type="text"
                    required
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="e.g. Synthesize Code Refactor"
                    className="w-full bg-[#111216] border border-neutral-800 rounded-lg py-2.5 px-3.5 text-xs text-white placeholder-neutral-500 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-neutral-400 uppercase tracking-wider">Strategic Mission Description</label>
                  <textarea
                    rows={3}
                    value={taskDesc}
                    onChange={(e) => setTaskDesc(e.target.value)}
                    placeholder="Outline parameters, constraints, and dependencies..."
                    className="w-full bg-[#111216] border border-neutral-800 rounded-lg py-2.5 px-3.5 text-xs text-white placeholder-neutral-500 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                {/* Deadline & Priority splitted */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-mono text-neutral-400 uppercase tracking-wider">Secure Deadline</label>
                    <input
                      type="datetime-local"
                      required
                      value={taskDeadline}
                      onChange={(e) => setTaskDeadline(e.target.value)}
                      className="w-full bg-[#111216] border border-neutral-800 rounded-lg py-2 px-3 text-xs text-white focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-mono text-neutral-400 uppercase tracking-wider">Priority Classification</label>
                    <select
                      value={taskPriority}
                      onChange={(e) => setTaskPriority(e.target.value as any)}
                      className="w-full bg-[#111216] border border-neutral-800 rounded-lg py-2 px-3 text-xs text-white focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="low">LOW_LEVEL</option>
                      <option value="medium">MEDIUM_CORE</option>
                      <option value="high">HIGH_CRITICAL</option>
                    </select>
                  </div>
                </div>

                {/* status classification */}
                <div className="space-y-1.5">
                  <label className="text-xs font-mono text-neutral-400 uppercase tracking-wider">Status Matrix</label>
                  <select
                    value={taskStatus}
                    onChange={(e) => setTaskStatus(e.target.value as any)}
                    className="w-full bg-[#111216] border border-neutral-800 rounded-lg py-2 px-3 text-xs text-white focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="pending">PENDING_SHIELD</option>
                    <option value="active">ACTIVE_FOCUS</option>
                    <option value="completed">ARCHIVED_COMPLETED</option>
                  </select>
                </div>

                {/* AI steps generator area */}
                <div className="pt-4 border-t border-neutral-900 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-mono text-neutral-400 uppercase tracking-wider">COGNITIVE ACTION STEPS</span>
                    <button
                      type="button"
                      onClick={handleAIBreakdown}
                      disabled={isBreakingDown || !taskTitle.trim()}
                      className="text-xs text-emerald-500 hover:text-emerald-400 transition flex items-center space-x-1.5 font-mono cursor-pointer disabled:opacity-40"
                    >
                      <Brain className="w-3.5 h-3.5" />
                      <span>{isBreakingDown ? "COGNITIZING..." : "AI SYNTHESIZE STEPS"}</span>
                    </button>
                  </div>

                  {/* Manual Add Input */}
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={newSubtaskTitle}
                      onChange={(e) => setNewSubtaskTitle(e.target.value)}
                      placeholder="Add manual tactical step..."
                      className="flex-1 bg-[#111216] border border-neutral-800 rounded-lg py-1.5 px-3 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddManualSubtask}
                      className="bg-neutral-800 hover:bg-neutral-700 text-white px-3 rounded-lg text-xs font-bold cursor-pointer"
                    >
                      Add
                    </button>
                  </div>

                  {/* Steps breakdown rendering */}
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {tempSubtasks.map((sub, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-neutral-950 p-2.5 rounded-lg border border-neutral-900 text-xs">
                        <span className="text-neutral-300">{sub.title}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveSubtask(idx)}
                          className="text-neutral-500 hover:text-rose-400 transition cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Submit button */}
                <div className="pt-6 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="bg-neutral-900 hover:bg-neutral-800 text-neutral-400 font-mono text-xs py-2.5 px-4 rounded-lg border border-neutral-800 cursor-pointer"
                  >
                    CANCEL
                  </button>
                  <button
                    type="submit"
                    className="bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs py-2.5 px-5 rounded-lg shadow-lg cursor-pointer"
                  >
                    {editingTask ? "UPDATE TARGET" : "ACTIVATE TARGET"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
