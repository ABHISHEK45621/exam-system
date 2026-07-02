import React, { useState, useEffect } from "react";
import { 
  LayoutDashboard, PlusCircle, ClipboardList, Activity, 
  BarChart3, Trophy, Settings, LogOut, Check, X, Edit, 
  Trash2, ArrowUp, ArrowDown, Sparkles, RefreshCw, Eye, BookOpen, Clock, HelpCircle, ShieldAlert, Sun, Moon,
  Users, UserPlus, Edit3, Search, Shield, Lock, Calendar, FileSpreadsheet, UploadCloud
} from "lucide-react";
import { 
  UserProfile, Exam, Question, TeacherGlobalStats, 
  MonitoringSessionInfo, LeaderboardEntry, ExamAnalytics, MonitoringLog 
} from "../types";

interface TeacherDashboardProps {
  user: UserProfile;
  token: string;
  onLogout: () => void;
  darkTheme: boolean;
  setDarkTheme: (v: boolean) => void;
  onUpdateUser?: (updated: UserProfile) => void;
}

type TabType = "DASHBOARD" | "CREATE_EXAM" | "MANAGE_EXAMS" | "ANALYTICS" | "LIVE_MONITOR" | "LEADERBOARD" | "SETTINGS" | "USERS_DIR";

export default function TeacherDashboard({ 
  user, token, onLogout, darkTheme, setDarkTheme, onUpdateUser 
}: TeacherDashboardProps) {
  // Navigation
  const [activeTab, setActiveTab] = useState<TabType>("DASHBOARD");

  // Two-step verification logout states
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [logoutStep1, setLogoutStep1] = useState(false);
  const [logoutStep2, setLogoutStep2] = useState(false);

  // Time-zone and remaining time formatting helper functions
  const formatISOToLocalDatetime = (isoStr?: string) => {
    if (!isoStr) return "";
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return "";
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch (err) {
      return "";
    }
  };

  const formatRemainingTimeSec = (seconds?: number) => {
    if (seconds === undefined || seconds < 0) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  // Exam scheduling states
  const [newPublishAt, setNewPublishAt] = useState("");
  const [editPublishAt, setEditPublishAt] = useState("");

  // Exam preview states
  const [previewExam, setPreviewExam] = useState<Exam | null>(null);
  const [previewQuestions, setPreviewQuestions] = useState<Question[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Users management lists (Admin powers merged directly in Teacher Dashboard)
  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");

  // Student directory filters
  const [userDirClassFilter, setUserDirClassFilter] = useState<string>("ALL");
  const [userDirSectionFilter, setUserDirSectionFilter] = useState<string>("ALL");
  const [userDirStreamFilter, setUserDirStreamFilter] = useState<string>("ALL");

  // Leaderboard filters
  const [leaderboardClassFilter, setLeaderboardClassFilter] = useState<string>("ALL");
  const [leaderboardSectionFilter, setLeaderboardSectionFilter] = useState<string>("ALL");
  const [leaderboardStreamFilter, setLeaderboardStreamFilter] = useState<string>("ALL");

  // New Student registration Class, Section, Stream details
  const [createStudentClass, setCreateStudentClass] = useState("");
  const [createStudentSection, setCreateStudentSection] = useState("");
  const [createStudentStream, setCreateStudentStream] = useState("");

  // Edit Student details
  const [editStudentClass, setEditStudentClass] = useState("");
  const [editStudentSection, setEditStudentSection] = useState("");
  const [editStudentStream, setEditStudentStream] = useState("");

  // User Modals (Create & Edit)
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState<"student" | "teacher" | "admin">("student");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState<"student" | "teacher" | "admin">("student");
  const [editError, setEditError] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingUser, setDeletingUser] = useState<any | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Bulk Import CSV states
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkCSVText, setBulkCSVText] = useState("");
  const [bulkParsedStudents, setBulkParsedStudents] = useState<any[]>([]);
  const [bulkImportLoading, setBulkImportLoading] = useState(false);
  const [bulkImportResult, setBulkImportResult] = useState<{ success: boolean; count: number; errors: string[] } | null>(null);
  const [bulkImportFileError, setBulkImportFileError] = useState<string | null>(null);

  // Custom modal states for deleting exams and questions
  const [deletingExam, setDeletingExam] = useState<Exam | null>(null);
  const [deletingQuestion, setDeletingQuestion] = useState<Question | null>(null);

  // Profile update states
  const [profileName, setProfileName] = useState(user.name);
  const [profileEmail, setProfileEmail] = useState(user.email);
  const [profileOldPassword, setProfileOldPassword] = useState("");
  const [profileNewPassword, setProfileNewPassword] = useState("");
  const [profileConfirmPassword, setProfileConfirmPassword] = useState("");
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Sync state if user changes externally
  useEffect(() => {
    setProfileName(user.name);
    setProfileEmail(user.email);
    setProfileOldPassword("");
    setProfileNewPassword("");
    setProfileConfirmPassword("");
    setProfileSuccess(null);
    setProfileError(null);
  }, [user]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);
    setProfileLoading(true);

    if (profileNewPassword && !profileOldPassword) {
      setProfileError("Old password is required to change to a new password.");
      setProfileLoading(false);
      return;
    }

    if (profileNewPassword !== profileConfirmPassword) {
      setProfileError("New password and confirm password do not match.");
      setProfileLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/update-profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          name: profileName,
          email: profileEmail,
          oldPassword: profileOldPassword || undefined,
          newPassword: profileNewPassword || undefined,
          confirmPassword: profileConfirmPassword || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update profile information");
      }
      setProfileSuccess("Profile updated successfully!");
      setProfileOldPassword("");
      setProfileNewPassword("");
      setProfileConfirmPassword("");
      if (onUpdateUser) {
        onUpdateUser(data);
      }
    } catch (err: any) {
      setProfileError(err.message || "An error occurred during update.");
    } finally {
      setProfileLoading(false);
    }
  };

  // Load users if academic controls or USERS_DIR is shown
  useEffect(() => {
    if (activeTab === "USERS_DIR") {
      fetchUsers();
    }
  }, [activeTab, token]);

  const fetchUsers = async (silent: boolean = false) => {
    if (!silent) setLoadingUsers(true);
    try {
      const res = await fetch("/api/admin/users", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (e) {
      console.error("Failed to fetch user index", e);
    } finally {
      if (!silent) setLoadingUsers(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateLoading(true);

    if (!createPassword || createPassword.trim().length === 0) {
      setCreateError("Initial password is required.");
      setCreateLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          name: createName,
          email: createEmail,
          password: createPassword,
          role: createRole,
          studentClass: createStudentClass || undefined,
          studentSection: createStudentSection || undefined,
          studentStream: createStudentStream || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create user account.");
      }
      setShowCreateModal(false);
      setCreateName("");
      setCreateEmail("");
      setCreatePassword("");
      setCreateRole("student");
      setCreateStudentClass("");
      setCreateStudentSection("");
      setCreateStudentStream("");
      fetchUsers();
    } catch (err: any) {
      setCreateError(err.message);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleBulkCSVParse = (text: string) => {
    setBulkCSVText(text);
    setBulkImportFileError(null);
    setBulkImportResult(null);

    const lines = text.split(/\r?\n/);
    if (lines.length === 0 || (lines.length === 1 && !lines[0].trim())) {
      setBulkParsedStudents([]);
      setBulkImportFileError("The file seems to be empty.");
      return;
    }

    // Try to find headers
    const firstLine = lines[0].toLowerCase();
    const isHeaderRow = firstLine.includes("name") || firstLine.includes("email") || firstLine.includes("password");

    const parsed: any[] = [];
    const startIndex = isHeaderRow ? 1 : 0;

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Simple CSV parser supporting double quotes
      const values: string[] = [];
      let current = "";
      let inQuotes = false;
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
          values.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      values.push(current.trim());

      let name = "";
      let email = "";
      let password = "";
      let studentClass = "";
      let studentSection = "";
      let studentStream = "";

      if (isHeaderRow) {
        const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
        headers.forEach((header, index) => {
          const val = (values[index] || "").replace(/^"|"$/g, "").trim();
          if (header.includes("name")) name = val;
          else if (header.includes("email")) email = val;
          else if (header.includes("password")) password = val;
          else if (header.includes("class")) studentClass = val;
          else if (header.includes("section")) studentSection = val;
          else if (header.includes("stream") || header.includes("target") || header.includes("group")) studentStream = val;
        });
      }

      // Fallback/direct index matching if header was not matched fully or it's not a header row
      if (!name && values[0]) name = values[0].replace(/^"|"$/g, "").trim();
      if (!email && values[1]) email = values[1].replace(/^"|"$/g, "").trim();
      if (!password && values[2]) password = values[2].replace(/^"|"$/g, "").trim();
      if (!studentClass && values[3]) studentClass = values[3].replace(/^"|"$/g, "").trim();
      if (!studentSection && values[4]) studentSection = values[4].replace(/^"|"$/g, "").trim();
      if (!studentStream && values[5]) studentStream = values[5].replace(/^"|"$/g, "").trim();

      if (name && email) {
        let rowError = "";
        const allowedClasses = ["11th", "12th"];
        const allowedSections = ["MPC", "BIPC", "CEC"];
        const allowedStreams = ["JEE", "NEET", "EAMCET"];

        if (studentClass && !allowedClasses.includes(studentClass)) {
          rowError += `Class must be '11th' or '12th' (Case-sensitive). `;
        }
        if (studentSection && !allowedSections.includes(studentSection)) {
          rowError += `Section must be 'MPC', 'BIPC', or 'CEC' (Case-sensitive). `;
        }
        if (studentStream && studentStream.trim() !== "" && !allowedStreams.includes(studentStream)) {
          rowError += `Stream must be 'JEE', 'NEET', or 'EAMCET' (Case-sensitive). `;
        }

        parsed.push({
          name,
          email,
          password: password || "123456", // default fallback password
          studentClass,
          studentSection,
          studentStream,
          error: rowError || undefined
        });
      }
    }

    if (parsed.length === 0) {
      setBulkImportFileError("No valid rows could be parsed. Ensure you have Name and Email columns.");
    }
    setBulkParsedStudents(parsed);
  };

  const handleBulkImportSubmit = async () => {
    if (bulkParsedStudents.length === 0) return;
    setBulkImportLoading(true);
    setBulkImportResult(null);

    try {
      const res = await fetch("/api/admin/users/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ users: bulkParsedStudents })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit bulk users.");
      }
      setBulkImportResult({
        success: data.success,
        count: data.count,
        errors: data.errors || []
      });
      // Clear current file/parsed list if success
      setBulkParsedStudents([]);
      setBulkCSVText("");
      fetchUsers();
    } catch (err: any) {
      setBulkImportFileError(err.message || "An unexpected error occurred during import.");
    } finally {
      setBulkImportLoading(false);
    }
  };

  const handleImagePaste = (
    e: React.ClipboardEvent<HTMLTextAreaElement>,
    setValue: (val: string) => void,
    currentValue: string
  ) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf("image") !== -1) {
        // Prevent default paste behavior
        e.preventDefault();

        const file = item.getAsFile();
        if (!file) continue;

        const reader = new FileReader();
        reader.onload = (event) => {
          const base64 = event.target?.result as string;
          if (base64) {
            const markdownImage = `\n![Pasted Image](${base64})\n`;
            
            // Insert at cursor selection point
            const target = e.target as HTMLTextAreaElement;
            const startPos = target.selectionStart;
            const endPos = target.selectionEnd;
            const newValue = 
              currentValue.substring(0, startPos) +
              markdownImage +
              currentValue.substring(endPos, currentValue.length);

            setValue(newValue);

            // Set cursor position right after the inserted markdown
            setTimeout(() => {
              target.focus();
              const newCursorPos = startPos + markdownImage.length;
              target.setSelectionRange(newCursorPos, newCursorPos);
            }, 50);
          }
        };
        reader.readAsDataURL(file);
        break; // Process only the first image found
      }
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUserId) return;
    setEditError(null);
    setEditLoading(true);

    try {
      const res = await fetch(`/api/admin/users/${editingUserId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          name: editName,
          email: editEmail,
          password: editPassword || undefined,
          role: editRole,
          studentClass: editStudentClass || undefined,
          studentSection: editStudentSection || undefined,
          studentStream: editStudentStream || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to edit user credentials.");
      }
      setShowEditModal(false);
      setEditingUserId(null);
      setEditName("");
      setEditEmail("");
      setEditPassword("");
      setEditStudentClass("");
      setEditStudentSection("");
      setEditStudentStream("");
      fetchUsers();
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${deletingUser.id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        setShowDeleteModal(false);
        setDeletingUser(null);
        fetchUsers();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to delete user.");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDeleteLoading(false);
    }
  };

  const openEditModal = (targetUser: any) => {
    setEditingUserId(targetUser.id);
    setEditName(targetUser.name);
    setEditEmail(targetUser.email);
    setEditRole(targetUser.role);
    setEditPassword("");
    setEditStudentClass(targetUser.studentClass || "");
    setEditStudentSection(targetUser.studentSection || "");
    setEditStudentStream(targetUser.studentStream || "");
    setEditError(null);
    setShowEditModal(true);
  };
  
  // Stats & listings
  const [globalStats, setGlobalStats] = useState<TeacherGlobalStats | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [liveSessions, setLiveSessions] = useState<MonitoringSessionInfo[]>([]);
  
  // Selection states
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [examQuestions, setExamQuestions] = useState<Question[]>([]);
  
  // Analytics state
  const [analyticsExamId, setAnalyticsExamId] = useState<string | null>(null);
  const [examAnalytics, setExamAnalytics] = useState<ExamAnalytics | null>(null);

  // Modal logs detail
  const [viewingSessionLogs, setViewingSessionLogs] = useState<MonitoringSessionInfo | null>(null);
  const [sessionLogs, setSessionLogs] = useState<MonitoringLog[]>([]);

  // Form states - Create Exam
  const [newTitle, setNewTitle] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newDuration, setNewDuration] = useState("45");
  const [newExamClass, setNewExamClass] = useState("");
  const [newExamSection, setNewExamSection] = useState("");
  const [newExamStream, setNewExamStream] = useState("");

  // Form states - Edit Exam
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editDuration, setEditDuration] = useState("45");
  const [editExamClass, setEditExamClass] = useState("");
  const [editExamSection, setEditExamSection] = useState("");
  const [editExamStream, setEditExamStream] = useState("");

  // Form states - Add/Edit Question
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [qType, setQType] = useState<"MCQ" | "SHORT" | "LONG">("MCQ");
  const [qText, setQText] = useState("");
  const [optA, setOptA] = useState("");
  const [optB, setOptB] = useState("");
  const [optC, setOptC] = useState("");
  const [optD, setOptD] = useState("");
  const [correctOpt, setCorrectOpt] = useState("A");
  const [modelAns, setModelAns] = useState("");
  const [keywords, setKeywords] = useState("");
  const [qCoinReward, setQCoinReward] = useState<string>("5");

  // Loading States
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingExams, setLoadingExams] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [loadingLive, setLoadingLive] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Firestore Live Diagnostic Connection States
  const [firebaseOnline, setFirebaseOnline] = useState(true);
  const [checkingFirebase, setCheckingFirebase] = useState(false);

  // Manual Score Correction States
  const [allResults, setAllResults] = useState<any[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [selectedStudentForGrading, setSelectedStudentForGrading] = useState<any | null>(null);
  const [submittingGrade, setSubmittingGrade] = useState(false);
  const [gradingError, setGradingError] = useState<string | null>(null);
  const [editingScoreId, setEditingScoreId] = useState<string | null>(null);
  const [editingScoreValue, setEditingScoreValue] = useState<string>("");
  const [manualGradingExamId, setManualGradingExamId] = useState<string>("");
  const [manualGradingScore, setManualGradingScore] = useState<string>("");

  const checkFirebaseStatus = async () => {
    try {
      setCheckingFirebase(true);
      const res = await fetch("/api/firebase/status");
      if (res.ok) {
        const data = await res.json();
        setFirebaseOnline(data.online);
      }
    } catch (e) {
      setFirebaseOnline(false);
    } finally {
      setCheckingFirebase(false);
    }
  };

  // Real-time EventSource synchronization
  useEffect(() => {
    const eventSource = new EventSource("/api/sync/stream");

    eventSource.onopen = () => {
      console.log("[EventSource] Teacher live sync connected.");
      setFirebaseOnline(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "connected") {
          setFirebaseOnline(payload.online);
        } else if (payload.type === "change") {
          console.log(`[EventSource] Received remote DB update for collection "${payload.collection}", triggering silent refresh...`);
          // Trigger silent refreshing of corresponding states
          if (payload.collection === "exams") {
            fetchExams?.(true);
            fetchStats?.(true);
          } else if (payload.collection === "examSessions") {
            fetchLiveTelemetrySessions?.(true);
            fetchStats?.(true);
          } else if (payload.collection === "users") {
            fetchUsers?.(true);
            fetchLeaderboard?.();
          }
        }
      } catch (err) {
        console.error("[EventSource] Failed to process real-time payload:", err);
      }
    };

    eventSource.onerror = (err) => {
      console.warn("[EventSource] Conn info/recon. Falling back to active local offline tracking...", err);
      setFirebaseOnline(false);
    };

    return () => {
      eventSource.close();
    };
  }, [token]);

  // Standard Auto-refresher for Teacher Live Monitor
  useEffect(() => {
    fetchGlobalData();
    checkFirebaseStatus();
    
    // Live survey poller: каждые 5 сек для синхронизации журнала списываний, лидерборда, статов и списка учеников
    const interval = setInterval(() => {
      fetchStats(true);
      fetchLeaderboard();
      fetchExams(true);
      fetchLiveTelemetrySessions(true);
      fetchUsers(true); // always fetch silently to keep metrics/coins wallet stats updated
      fetchResults(true);
      
      // Auto-refresh detailed exam performance analytics if currently open
      if (activeTab === "ANALYTICS" && analyticsExamId) {
        refreshAnalyticsSilent(analyticsExamId);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [token, activeTab, analyticsExamId]);

  const fetchGlobalData = () => {
    fetchStats(false);
    fetchExams(false);
    fetchLeaderboard();
    fetchLiveTelemetrySessions(false);
    fetchUsers(true); // populate user counts and coins wallet initially
    fetchResults(true);
  };

  const fetchResults = async (silent: boolean = false) => {
    try {
      if (!silent) setLoadingResults(true);
      const res = await fetch("/api/teacher/results", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAllResults(data);
      }
    } catch (e) {
      console.error("Failed to load student results registry", e);
    } finally {
      if (!silent) setLoadingResults(false);
    }
  };

  const handleUpdateMarks = async (studentId: string, examId: string, newScore: number) => {
    setSubmittingGrade(true);
    setGradingError(null);
    try {
      const res = await fetch("/api/teacher/update-marks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ studentId, examId, score: newScore })
      });
      if (res.ok) {
        // Refresh all local data so that leaderboards, user lists, results and stats are completely in sync
        fetchResults(true);
        fetchUsers(true);
        fetchLeaderboard();
        fetchStats(true);
        setEditingScoreId(null);
      } else {
        const data = await res.json();
        setGradingError(data.error || "Failed to submit score update.");
      }
    } catch (e: any) {
      setGradingError(e.message || "Network error occurred.");
    } finally {
      setSubmittingGrade(false);
    }
  };

  const fetchStats = async (silent: boolean = false) => {
    try {
      if (!silent) setLoadingStats(true);
      const res = await fetch("/api/teacher/stats", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setGlobalStats(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (!silent) setLoadingStats(false);
    }
  };

  const fetchExams = async (silent: boolean = false) => {
    try {
      if (!silent) setLoadingExams(true);
      const res = await fetch("/api/exams", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setExams(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (!silent) setLoadingExams(false);
    }
  };

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch("/api/leaderboard");
      if (res.ok) {
        setLeaderboard(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchLiveTelemetrySessions = async (silent: boolean = false) => {
    try {
      if (!silent) setLoadingLive(true);
      const res = await fetch("/api/teacher/monitor", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        setLiveSessions(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (!silent) setLoadingLive(false);
    }
  };

  const fetchExamDetailedLogs = async (session: MonitoringSessionInfo) => {
    try {
      const res = await fetch(`/api/sessions/${session.id}/logs`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        setSessionLogs(await res.json());
        setViewingSessionLogs(session);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // ==========================================
  // EXAM CRUD ADMIN ACTIONS
  // ==========================================

  const handleCreateExamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDuration) return;
    
    setActionLoading(true);
    try {
      const res = await fetch("/api/exams", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          title: newTitle,
          subject: newSubject.trim() || "General",
          description: newDesc,
          durationMinutes: Number(newDuration),
          publishAt: newPublishAt ? new Date(newPublishAt).toISOString() : "",
          examClass: newExamClass || undefined,
          examSection: newExamSection || undefined,
          examStream: newExamStream || undefined
        })
      });
      if (res.ok) {
        alert("Exam setup successfully! Opening Exam Builder to write questions.");
        setNewTitle("");
        setNewSubject("");
        setNewDesc("");
        setNewDuration("45");
        setNewPublishAt("");
        setNewExamClass("");
        setNewExamSection("");
        setNewExamStream("");
        const newlyCreated = await res.json();
        fetchExams();
        // Redirect to Manage tab and open builder immediately
        openBuilder(newlyCreated);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveDraftAndReturn = async () => {
    if (!newTitle.trim()) {
      alert("Please enter an Exam Title to save as a draft.");
      return;
    }
    const durationVal = Number(newDuration) || 45;
    if (durationVal < 5 || durationVal > 300) {
      alert("Please enter a valid duration between 5 and 300 minutes.");
      return;
    }
    
    setActionLoading(true);
    try {
      const res = await fetch("/api/exams", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          title: newTitle,
          subject: newSubject.trim() || "General",
          description: newDesc,
          durationMinutes: durationVal,
          publishAt: newPublishAt ? new Date(newPublishAt).toISOString() : "",
          examClass: newExamClass || undefined,
          examSection: newExamSection || undefined,
          examStream: newExamStream || undefined
        })
      });
      if (res.ok) {
        alert("Exam draft saved successfully!");
        setNewTitle("");
        setNewSubject("");
        setNewDesc("");
        setNewDuration("45");
        setNewPublishAt("");
        setNewExamClass("");
        setNewExamSection("");
        setNewExamStream("");
        fetchExams();
        setActiveTab("MANAGE_EXAMS");
      } else {
        const data = await res.json();
        alert(data.error || "Failed to save exam draft.");
      }
    } catch (e) {
      console.error(e);
      alert("An error occurred while saving the exam draft.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelAndReturn = () => {
    setNewTitle("");
    setNewSubject("");
    setNewDesc("");
    setNewDuration("45");
    setNewPublishAt("");
    setNewExamClass("");
    setNewExamSection("");
    setNewExamStream("");
    setActiveTab("DASHBOARD");
  };

  const startEditingExam = (exam: Exam) => {
    setEditingExamId(exam.id);
    setEditTitle(exam.title);
    setEditSubject(exam.subject || "General");
    setEditDesc(exam.description);
    setEditDuration(String(exam.durationMinutes));
    setEditPublishAt(formatISOToLocalDatetime(exam.publishAt));
    setEditExamClass(exam.examClass || "");
    setEditExamSection(exam.examSection || "");
    setEditExamStream(exam.examStream || "");
  };

  const handleUpdateExam = async (examId: string) => {
    if (!editTitle.trim() || !editDuration) return;
    
    try {
      const res = await fetch(`/api/exams/${examId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          title: editTitle,
          subject: editSubject.trim() || "General",
          description: editDesc,
          durationMinutes: Number(editDuration),
          publishAt: editPublishAt ? new Date(editPublishAt).toISOString() : "",
          examClass: editExamClass || undefined,
          examSection: editExamSection || undefined,
          examStream: editExamStream || undefined
        })
      });
      if (res.ok) {
        setEditingExamId(null);
        setEditTitle("");
        setEditSubject("");
        setEditDesc("");
        setEditDuration("45");
        setEditPublishAt("");
        setEditExamClass("");
        setEditExamSection("");
        setEditExamStream("");
        fetchExams();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenPreview = async (exam: Exam) => {
    setPreviewExam(exam);
    setLoadingPreview(true);
    setPreviewQuestions([]);
    try {
      const res = await fetch(`/api/exams/${exam.id}/questions`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const questionsList = Array.isArray(data) ? data : data.questions || [];
        questionsList.sort((a: any, b: any) => (a.orderIndex || 0) - (b.orderIndex || 0));
        setPreviewQuestions(questionsList);
      }
    } catch (err) {
      console.error("Failed to load preview questions:", err);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleDeleteExam = (examId: string) => {
    const found = exams.find((e) => e.id === examId);
    if (found) setDeletingExam(found);
  };

  const handleConfirmDeleteExam = async () => {
    if (!deletingExam) return;
    try {
      const res = await fetch(`/api/exams/${deletingExam.id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        fetchExams();
        fetchStats();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to delete exam session.");
      }
    } catch (e: any) {
      console.error(e);
      alert(e.message || "An unexpected error occurred while deleting the exam.");
    } finally {
      setDeletingExam(null);
    }
  };

  const handlePublishToggle = async (exam: Exam) => {
    try {
      const res = await fetch(`/api/exams/${exam.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ isPublished: !exam.isPublished })
      });
      if (res.ok) {
        const updated = await res.json();
        if (selectedExam && selectedExam.id === exam.id) {
          setSelectedExam(updated);
        }
        fetchExams();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // ==========================================
  // EXAM BUILDER: QUESTION MANAGEMENT
  // ==========================================

  const openBuilder = async (exam: Exam) => {
    setSelectedExamId(exam.id);
    setSelectedExam(exam);
    setActiveTab("MANAGE_EXAMS"); // Stay in manage exams tab
    fetchExamQuestions(exam.id);
  };

  const fetchExamQuestions = async (examId: string) => {
    try {
      setLoadingQuestions(true);
      const res = await fetch(`/api/exams/${examId}`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setExamQuestions(data.questions || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingQuestions(false);
    }
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qText.trim()) return;

    const payload: any = {
      type: qType,
      questionText: qText,
      coinReward: Number(qCoinReward || "5")
    };

    if (qType === "MCQ") {
      payload.optionA = optA;
      payload.optionB = optB;
      payload.optionC = optC;
      payload.optionD = optD;
      payload.correctOption = correctOpt;
    } else {
      payload.modelAnswer = modelAns;
      payload.relevantKeywords = keywords;
    }

    try {
      let res;
      if (editingQuestionId) {
        // Edit Mode
        res = await fetch(`/api/questions/${editingQuestionId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });
      } else {
        // Create Mode
        res = await fetch(`/api/exams/${selectedExamId}/questions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });
      }

      if (res.ok) {
        resetQuestionForm();
        fetchExamQuestions(selectedExamId!);
        fetchStats();
      } else {
        const err = await res.json();
        alert("Error saving question: " + err.error);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const startEditingQuestion = (q: Question) => {
    setEditingQuestionId(q.id);
    setQType(q.type);
    setQText(q.questionText);
    setOptA(q.optionA || "");
    setOptB(q.optionB || "");
    setOptC(q.optionC || "");
    setOptD(q.optionD || "");
    setCorrectOpt(q.correctOption || "A");
    setModelAns(q.modelAnswer || "");
    setKeywords(q.relevantKeywords || "");
    setQCoinReward(String(q.coinReward !== undefined ? q.coinReward : 5));
  };

  const handleDeleteQuestion = (qId: string) => {
    const found = examQuestions.find((q) => q.id === qId);
    if (found) setDeletingQuestion(found);
  };

  const handleConfirmDeleteQuestion = async () => {
    if (!deletingQuestion) return;
    try {
      const res = await fetch(`/api/questions/${deletingQuestion.id}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        fetchExamQuestions(selectedExamId!);
        fetchStats();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDeletingQuestion(null);
    }
  };

  const moveQuestionOrder = async (index: number, direction: "UP" | "DOWN") => {
    const nextIndex = direction === "UP" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= examQuestions.length) return;

    const newList = [...examQuestions];
    const temp = newList[index];
    newList[index] = newList[nextIndex];
    newList[nextIndex] = temp;

    // Local reorder instantly to improve UX
    setExamQuestions(newList);

    // Save list indexes on server
    try {
      const orderedIds = newList.map((q) => q.id);
      await fetch(`/api/exams/${selectedExamId}/questions/reorder`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ orderedIds })
      });
    } catch (e) {
      console.error("Order syncing error", e);
    }
  };

  const resetQuestionForm = () => {
    setEditingQuestionId(null);
    setQText("");
    setOptA("");
    setOptB("");
    setOptC("");
    setOptD("");
    setCorrectOpt("A");
    setModelAns("");
    setKeywords("");
    setQCoinReward("5");
  };

  // ==========================================
  // VIEW ANALYTICS TAB ACTIONS
  // ==========================================

  const viewDetailedAnalytics = async (examId: string) => {
    setAnalyticsExamId(examId);
    setActiveTab("ANALYTICS");
    try {
      const res = await fetch(`/api/exams/${examId}/analytics`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        setExamAnalytics(await res.json());
      }
    } catch (e) {
      console.error("Failed to load exam analytics", e);
    }
  };

  const refreshAnalyticsSilent = async (examId: string) => {
    try {
      const res = await fetch(`/api/exams/${examId}/analytics`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        setExamAnalytics(await res.json());
      }
    } catch (e) {
      console.error("Silent analytics refresh failed:", e);
    }
  };

  // Reset helper
  const closeBuilderAndReturn = () => {
    setSelectedExamId(null);
    setSelectedExam(null);
    setExamQuestions([]);
    resetQuestionForm();
  };

  // Predefined lists of options provided/allowed in the system
  const PREDEFINED_CLASSES = ["11th", "12th"];
  const PREDEFINED_SECTIONS = ["MPC", "BIPC", "CEC"];
  const PREDEFINED_STREAMS = ["JEE", "NEET", "EAMCET"];

  // Dynamically extract active student Class/Section/Stream attributes combined with predefined ones
  const availableClasses = Array.from(new Set([...PREDEFINED_CLASSES, ...users.filter((u: any) => u.role === "student").map((u: any) => u.studentClass).filter(Boolean)])) as string[];
  const availableSections = Array.from(new Set([...PREDEFINED_SECTIONS, ...users.filter((u: any) => u.role === "student").map((u: any) => u.studentSection).filter(Boolean)])) as string[];
  const availableStreams = Array.from(new Set([...PREDEFINED_STREAMS, ...users.filter((u: any) => u.role === "student").map((u: any) => u.studentStream).filter(Boolean)])) as string[];

  const hasBulkErrors = bulkParsedStudents.some((s: any) => s.error);

  // Filter accounts list to only show student logins
  const filteredUsers = users.filter((u: any) => {
    if (u.role !== "student") return false;
    const query = searchQuery.toLowerCase();
    const matchesSearch = u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query);
    if (!matchesSearch) return false;

    if (userDirClassFilter !== "ALL" && u.studentClass !== userDirClassFilter) return false;
    if (userDirSectionFilter !== "ALL" && u.studentSection !== userDirSectionFilter) return false;
    if (userDirStreamFilter !== "ALL" && u.studentStream !== userDirStreamFilter) return false;

    return true;
  });

  const leaderboardClasses = Array.from(new Set(leaderboard.map((student: any) => student.studentClass).filter(Boolean))) as string[];
  const leaderboardSections = Array.from(new Set(leaderboard.map((student: any) => student.studentSection).filter(Boolean))) as string[];
  const leaderboardStreams = Array.from(new Set(leaderboard.map((student: any) => student.studentStream).filter(Boolean))) as string[];

  const filteredLeaderboard = leaderboard.filter((student: any) => {
    if (leaderboardClassFilter !== "ALL" && student.studentClass !== leaderboardClassFilter) return false;
    if (leaderboardSectionFilter !== "ALL" && student.studentSection !== leaderboardSectionFilter) return false;
    if (leaderboardStreamFilter !== "ALL" && student.studentStream !== leaderboardStreamFilter) return false;
    return true;
  });

  const studentCount = users.filter((u: any) => u.role === "student").length;
  const totalStudentCoins = users.filter((u: any) => u.role === "student").reduce((sum: number, u: any) => sum + (u.coins || 0), 0);
  const avgStudentCoins = studentCount > 0 ? Math.round(totalStudentCoins / studentCount) : 0;
  const publishedExamCount = exams.filter((e: any) => e.isPublished).length;

  const isFullScreenMode = activeTab === "CREATE_EXAM" || selectedExamId !== null;

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 font-sans transition-colors duration-200">
      
      {/* SIDEBAR NAVIGATION PANEL */}
      {!isFullScreenMode && (
        <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0 select-none text-slate-300 animate-fade-in">
        <div>
          {/* Header Icon Brand */}
          <div className="px-6 py-6 border-b border-slate-800 flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white font-bold text-base shadow-md">
              EX
            </div>
            <div>
              <span className="text-sm font-bold font-display tracking-wide text-white block">
                Exam Portal
              </span>
              <span className="text-[10px] text-slate-400 font-bold tracking-wider uppercase">
                Teacher Panel
              </span>
            </div>
          </div>

          <nav className="p-4 space-y-1">
            {[
              { id: "DASHBOARD", label: "Dashboard", Icon: LayoutDashboard },
              { id: "CREATE_EXAM", label: "Create Exam", Icon: PlusCircle },
              { id: "MANAGE_EXAMS", label: "Manage Exams", Icon: ClipboardList },
              { id: "LIVE_MONITOR", label: "Live Monitor", Icon: Activity },
              { id: "LEADERBOARD", label: "Leaderboard", Icon: Trophy },
              { id: "USERS_DIR", label: "Manage Students", Icon: Users },
              { id: "SETTINGS", label: "Settings", Icon: Settings }
            ].map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => { 
                    setActiveTab(item.id as TabType); 
                    if (item.id !== "MANAGE_EXAMS") {
                      closeBuilderAndReturn();
                    }
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold transition cursor-pointer select-none ${
                    active 
                      ? "bg-slate-800 text-white border-l-4 border-blue-500" 
                      : "text-slate-400 hover:text-white hover:bg-slate-800/40"
                  }`}
                >
                  <item.Icon className={`w-4 h-4 ${active ? "text-blue-500" : "text-slate-400"}`} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* User Card & Logout Footer */}
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center justify-between gap-3 px-2 mb-4">
            <div className="flex items-center gap-3 truncate">
              <div className="w-9 h-9 bg-emerald-600 border border-emerald-550 rounded-full flex items-center justify-center font-bold text-white text-sm shrink-0">
                {user.name.substring(0, 2).toUpperCase()}
              </div>
              <div className="truncate">
                <p className="text-xs font-bold text-white leading-none">{user.name}</p>
                <p className="text-[10px] text-slate-500 mt-1 leading-none">{user.email}</p>
              </div>
            </div>

            {/* Quick mini toggle theme */}
            <button
              type="button"
              onClick={() => setDarkTheme(!darkTheme)}
              title={darkTheme ? "Switch to Light Mode" : "Switch to Dark Mode"}
              className="p-1.5 bg-slate-800 hover:bg-slate-750 text-slate-400 hover:text-red-100 rounded-lg cursor-pointer transition shrink-0"
              aria-label="Toggle Theme"
            >
              {darkTheme ? <Sun className="w-3.5 h-3.5 text-amber-405" /> : <Moon className="w-3.5 h-3.5 text-indigo-405" />}
            </button>
          </div>
          
          <button
            onClick={() => {
              setLogoutStep1(false);
              setLogoutStep2(false);
              setShowLogoutModal(true);
            }}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-xs font-semibold text-rose-500 hover:bg-rose-950/20 transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" /> Log out of account
          </button>
        </div>
      </aside>
      )}

      {/* CENTER WORKSPACE AREA */}
      <main className="flex-1 overflow-y-auto px-8 py-8 scrollbar">
        
        {/* ==========================================
            TAB: DASHBOARD
           ========================================== */}
        {activeTab === "DASHBOARD" && (
          <div className="space-y-8 animate-fade-in">
            
            {/* Elegant Premium Welcome Header Hero Banner */}
            <div className="bg-gradient-to-r from-teal-600 via-emerald-600 to-indigo-700 dark:from-slate-900 dark:to-emerald-950 p-8 rounded-3xl text-white shadow-lg relative overflow-hidden">
              <div className="absolute right-0 bottom-0 top-0 opacity-10 flex items-center justify-center p-6">
                <Sparkles className="w-56 h-56 rotate-45" />
              </div>
              <div className="relative z-10 space-y-4">
                <span className="bg-white/20 dark:bg-emerald-800/40 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                  Operational Control Center
                </span>
                <h1 className="text-2xl md:text-3xl font-black font-display tracking-tight leading-tight">
                  Welcome Back, Instructor {user.name}!
                </h1>
                <p className="text-emerald-50 dark:text-emerald-200 text-xs max-w-xl leading-relaxed font-sans">
                  The examination monitoring array is active and secure. You can draft exams, evaluate student grade performance logs, and perform live supervisor auditting from the control panel.
                </p>
                
                <div className="pt-2 flex items-center gap-3">
                  <button
                    onClick={() => setActiveTab("CREATE_EXAM")}
                    className="py-2.5 px-5 bg-white hover:bg-slate-100 text-emerald-700 dark:text-slate-900 font-bold rounded-xl text-xs transition duration-150 shadow-sm cursor-pointer"
                  >
                    + Setup New Examination
                  </button>
                  <button
                    onClick={() => setActiveTab("LIVE_MONITOR")}
                    className="py-2.5 px-4 bg-transparent hover:bg-white/10 border border-white/30 text-white font-bold rounded-xl text-xs transition duration-150 cursor-pointer animate-pulse"
                  >
                    View Live Audits Console
                  </button>
                </div>
              </div>
            </div>

            {/* Statistics Row Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 select-none font-mono">
              {[
                { label: "Total Exams Roster", count: globalStats?.totalExams ?? 0, desc: "Subject integrity enforced", icon: <ClipboardList className="w-5 h-5 text-emerald-500" /> },
                { label: "Total Assessment Items", count: globalStats?.totalQuestions ?? 0, desc: "Verified items", icon: <HelpCircle className="w-5 h-5 text-blue-500" /> },
                { label: "Registered Examinees", count: globalStats?.totalStudents ?? 0, desc: "Assigned active candidates", icon: <Users className="w-5 h-5 text-purple-500" /> },
                { label: "Active Live Rooms", count: globalStats?.activeExamsCount ?? 0, desc: "Undergoing examinations", icon: <Activity className="w-5 h-5 text-rose-500 animate-pulse" /> }
              ].map((card, i) => (
                <div key={i} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between h-36">
                  <div className="flex justify-between items-start">
                    <p className="text-[10px] font-bold uppercase text-gray-400 dark:text-slate-500 tracking-wider font-sans">{card.label}</p>
                    <div className="p-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg">{card.icon}</div>
                  </div>
                  <div>
                    <p className="text-3xl font-black text-slate-800 dark:text-slate-100">{card.count}</p>
                    <p className="text-[9px] font-sans font-medium text-gray-400 dark:text-slate-500 mt-1">{card.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Two-Column split: Recent Activities vs. Recent Exams */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Left Segment: Student Live audit Feed (2 cols) */}
              <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
                    <h3 className="text-xs font-bold uppercase font-display tracking-widest text-gray-900 dark:text-slate-100 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-emerald-500 animate-pulse" /> Real-time Audit Timeline
                    </h3>
                    <button 
                      onClick={fetchStats}
                      className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition"
                      title="Sync Stats Feed"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                  </div>

                  <div className="space-y-4 max-h-[385px] overflow-y-auto pr-2 scrollbar text-xs">
                    {globalStats?.recentStudentActivity && globalStats.recentStudentActivity.length > 0 ? (
                      globalStats.recentStudentActivity.map((act) => {
                        let badgeBg = "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";
                        if (act.eventType.includes("ALERT") || act.eventType.includes("SWITCH") || act.eventType.includes("BLUR") || act.eventType.includes("EXIT")) {
                          badgeBg = "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-450 font-bold border border-rose-200 dark:border-rose-900/10";
                        } else if (act.eventType === "SUBMIT") {
                          badgeBg = "bg-emerald-150 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-405 font-bold border border-emerald-200 dark:border-emerald-900/10";
                        } else if (act.eventType === "START") {
                          badgeBg = "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
                        }

                        return (
                          <div key={act.id} className="flex gap-4 items-start p-3 bg-slate-50/50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800 font-sans hover:bg-slate-50 dark:hover:bg-slate-800 transition">
                            <span className={`px-2 py-0.5 text-[9px] rounded-md uppercase font-mono tracking-wider shrink-0 ${badgeBg}`}>
                              {act.eventType}
                            </span>
                            <div className="flex-1">
                              <p className="text-gray-900 dark:text-slate-100 leading-relaxed">
                                <span className="font-bold underline text-slate-905 dark:text-white">{act.studentName}</span> &rarr; {act.details}
                              </p>
                              <div className="flex items-center gap-2 mt-1.5 text-[9px] text-gray-405 dark:text-slate-505 font-mono">
                                <span className="bg-slate-200/50 dark:bg-slate-800 px-1 py-0.5 rounded text-gray-500">{act.examTitle}</span>
                                <span>•</span>
                                <span>{new Date(act.timestamp).toLocaleTimeString()}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-center py-20 text-slate-400">
                        <ClipboardList className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        No activities logged yet. Activity triggers will stream live here.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Segment: Fast Shortcuts info Panel (1 col) */}
              <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 space-y-6">
                <h3 className="text-xs font-bold uppercase font-display tracking-widest text-gray-900 dark:text-slate-100 pb-3 border-b border-slate-100 dark:border-slate-800">
                  Interactive Quick Tasks
                </h3>

                <div className="space-y-3">
                  <button 
                    onClick={() => setActiveTab("CREATE_EXAM")}
                    className="w-full p-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-left font-bold transition duration-150 flex items-center justify-between cursor-pointer shadow-sm hover:shadow-md"
                  >
                    <div>
                      <p className="text-sm">Initiate New Exam</p>
                      <p className="text-[10px] text-emerald-100 font-medium mt-0.5">Setup timing & credentials</p>
                    </div>
                    <PlusCircle className="w-5 h-5 text-white" />
                  </button>

                  <button 
                    onClick={() => setActiveTab("LIVE_MONITOR")}
                    className="w-full p-4 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 text-gray-900 dark:text-slate-100 rounded-2xl text-left font-bold transition duration-150 flex items-center justify-between cursor-pointer border border-slate-200 dark:border-slate-800"
                  >
                    <div>
                      <p className="text-sm">Live Supervisors Room</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">Observe focus blur cheaters live</p>
                    </div>
                    <Activity className="w-5 h-5 text-rose-500 animate-pulse" />
                  </button>

                  <button 
                    onClick={() => setActiveTab("MANAGE_EXAMS")}
                    className="w-full p-4 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-750 text-gray-900 dark:text-slate-100 rounded-2xl text-left font-bold transition duration-150 flex items-center justify-between cursor-pointer border border-slate-200 dark:border-slate-800"
                  >
                    <div>
                      <p className="text-sm">Manage Existing Exams</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">Edit or cancel active rooms</p>
                    </div>
                    <ClipboardList className="w-5 h-5 text-blue-500" />
                  </button>
                </div>

                <div className="bg-emerald-50/50 dark:bg-emerald-950/10 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-900/30 text-[10px]">
                  <span className="font-bold text-emerald-800 dark:text-emerald-400 block mb-1">Single Subject Framework</span>
                  <p className="text-slate-500 dark:text-slate-400 leading-normal">
                    This platform enforces unified class curriculum alignment to protect assessment focus variables. Class rosters sync automatically.
                  </p>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ==========================================
            TAB: CREATE EXAM
           ========================================== */}
        {activeTab === "CREATE_EXAM" && (
          <div className="max-w-4xl mx-auto space-y-8 animate-fade-in select-none">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-gray-150 dark:border-slate-800 shadow-sm">
              <div>
                <p className="text-xs text-emerald-600 font-bold uppercase tracking-wider">Exam Configuration Gateway</p>
                <h1 className="text-2xl font-black font-display text-gray-900 dark:text-slate-50 mt-1">Create Brand New Examination</h1>
              </div>
            </div>

            <form onSubmit={handleCreateExamSubmit} className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-gray-150 dark:border-slate-800/80 space-y-6 shadow-sm">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block">Exam Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Cybersecurity Advanced Directives, Data Structures Final Assessment"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full text-sm p-4 bg-gray-50 border border-gray-200 focus:border-emerald-500 dark:bg-slate-950 dark:border-slate-800 dark:focus:border-emerald-600 rounded-xl focus:outline-none text-slate-900 dark:text-slate-100 font-sans"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block">Duration (Minutes)</label>
                  <input
                    type="number"
                    required
                    min="5"
                    max="300"
                    placeholder="45"
                    value={newDuration}
                    onChange={(e) => setNewDuration(e.target.value)}
                    className="w-full text-sm p-4 bg-gray-50 border border-gray-200 focus:border-emerald-500 dark:bg-slate-950 dark:border-slate-800 dark:focus:border-emerald-600 rounded-xl focus:outline-none font-mono text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block">Subject Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Cybersecurity, Software Engineering, Chemistry"
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    className="w-full text-sm p-4 bg-gray-50 border border-gray-200 focus:border-emerald-500 dark:bg-slate-950 dark:border-slate-800 dark:focus:border-emerald-600 rounded-xl focus:outline-none text-slate-900 dark:text-slate-100 font-sans"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-50 dark:bg-slate-950/40 p-5 rounded-2xl border border-gray-150 dark:border-slate-850">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block">Target Class (Optional)</label>
                  <select
                    value={newExamClass}
                    onChange={(e) => setNewExamClass(e.target.value)}
                    className="w-full text-sm p-4 bg-white border border-gray-200 focus:border-emerald-500 dark:bg-slate-900 dark:border-slate-800 dark:focus:border-emerald-600 rounded-xl focus:outline-none text-slate-900 dark:text-slate-100 font-sans"
                  >
                    <option value="All">All Classes (11th & 12th)</option>
                    <option value="11th">11th</option>
                    <option value="12th">12th</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block">Target Section (Optional)</label>
                  <select
                    value={newExamSection}
                    onChange={(e) => setNewExamSection(e.target.value)}
                    className="w-full text-sm p-4 bg-white border border-gray-200 focus:border-emerald-500 dark:bg-slate-900 dark:border-slate-800 dark:focus:border-emerald-600 rounded-xl focus:outline-none text-slate-900 dark:text-slate-100 font-sans"
                  >
                    <option value="All">All Sections (MPC, BIPC, CEC)</option>
                    <option value="MPC">MPC</option>
                    <option value="BIPC">BIPC</option>
                    <option value="CEC">CEC</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block">Target Stream/Group (Optional)</label>
                  <select
                    value={newExamStream}
                    onChange={(e) => setNewExamStream(e.target.value)}
                    className="w-full text-sm p-4 bg-white border border-gray-200 focus:border-emerald-500 dark:bg-slate-900 dark:border-slate-800 dark:focus:border-emerald-600 rounded-xl focus:outline-none text-slate-900 dark:text-slate-100 font-sans"
                  >
                    <option value="All">All Streams (JEE, NEET, EAMCET)</option>
                    <option value="JEE">JEE</option>
                    <option value="NEET">NEET</option>
                    <option value="EAMCET">EAMCET</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block">Description and Instructions</label>
                <textarea
                  placeholder="Review material boundaries, cheating penalties (tab switching registers warnings), and grading criteria..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  ref={(el) => {
                    if (el) {
                      el.style.height = "auto";
                      el.style.height = `${el.scrollHeight}px`;
                    }
                  }}
                  className="w-full text-sm p-4 bg-gray-50 border border-gray-200 focus:border-emerald-500 dark:bg-slate-950 dark:border-slate-800 dark:focus:border-emerald-600 rounded-xl focus:outline-none text-slate-900 dark:text-slate-100 font-sans resize-none overflow-hidden min-h-[100px]"
                />
              </div>

              <div className="space-y-2 bg-slate-50 dark:bg-slate-950/40 p-5 rounded-2xl border border-gray-150 dark:border-slate-850">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-indigo-500" /> Scheduled Publish Date & Time (Optional)
                </label>
                <input
                  type="datetime-local"
                  value={newPublishAt}
                  onChange={(e) => setNewPublishAt(e.target.value)}
                  className="w-full text-xs p-3.5 bg-white border border-gray-200 focus:border-indigo-500 dark:bg-slate-900 dark:border-slate-800 dark:focus:border-indigo-600 rounded-xl focus:outline-none text-slate-900 dark:text-slate-100 font-sans"
                />
                <p className="text-[10px] text-gray-400">
                  If set, students cannot see or start this exam until this scheduling boundary arrives. Stays completely hidden otherwise.
                </p>
              </div>

              <div className="flex flex-col md:flex-row gap-4 pt-2">
                <button
                  type="button"
                  onClick={handleCancelAndReturn}
                  disabled={actionLoading}
                  className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 font-bold rounded-xl transition duration-150 cursor-pointer text-sm font-sans"
                >
                  Cancel and Return
                </button>
                <button
                  type="button"
                  onClick={handleSaveDraftAndReturn}
                  disabled={actionLoading}
                  className="flex-1 py-4 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/20 dark:hover:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 font-bold rounded-xl border border-indigo-200 dark:border-indigo-900/40 transition duration-150 cursor-pointer text-sm font-sans"
                >
                  {actionLoading ? "Saving draft..." : "Save and Return (Draft)"}
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition duration-150 cursor-pointer text-sm shadow-lg shadow-emerald-600/10 active:scale-98"
                >
                  {actionLoading ? "Saving configuration..." : "Create and Open Question Builder Workspace"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ==========================================
            TAB: MANAGE EXAMS (& INNER EXAM BUILDER WORKSPACE)
           ========================================== */}
        {activeTab === "MANAGE_EXAMS" && (
          <div className="space-y-8 animate-fade-in selection-none text-xs">
            
            {/* BUILDER MODE INNER VIEW */}
            {selectedExamId && selectedExam ? (
              <div className="space-y-6">
                
                {/* Back control on top-right */}
                <div className="flex justify-between items-center bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800/80 p-4 rounded-2xl shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></span>
                    <span className="font-mono text-[10px] font-bold text-gray-400 uppercase tracking-widest">Question Customization Workspace</span>
                  </div>
                  <button 
                    onClick={closeBuilderAndReturn}
                    className="flex items-center gap-2 text-xs font-bold text-slate-705 dark:text-slate-300 hover:text-rose-600 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700/60 cursor-pointer transition"
                  >
                    Exit Workspace & Return &rarr;
                  </button>
                </div>

                {/* Exam properties outline card */}
                <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 p-6 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="bg-blue-100 text-blue-850 dark:bg-blue-950/40 dark:text-blue-400 text-[10px] px-2 py-0.5 rounded-full font-bold">
                        Subject Universal Core
                      </span>
                      <span className="text-gray-400 font-mono text-[10px]">{selectedExam.durationMinutes} Minutes</span>
                    </div>
                    <h2 className="text-lg font-black font-display text-gray-900 dark:text-slate-50">{selectedExam.title}</h2>
                    <p className="text-gray-500 dark:text-slate-400 text-[11px] mt-1 pr-6 max-w-2xl">{selectedExam.description}</p>
                  </div>
                  
                  {/* Status Toggle control */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleOpenPreview(selectedExam)}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-100 hover:bg-indigo-150 text-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-400 border border-indigo-200/50 cursor-pointer transition flex items-center gap-1.5"
                    >
                      <Eye className="w-4 h-4" /> Preview Exam
                    </button>
                    <button
                      onClick={() => handlePublishToggle(selectedExam)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition ${
                        selectedExam.isPublished 
                          ? "bg-amber-100 hover:bg-amber-150 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400 border border-amber-200" 
                          : "bg-emerald-600 hover:bg-emerald-500 text-white"
                      }`}
                    >
                      {selectedExam.isPublished ? "Unpublish Exam" : "Publish to Roster"}
                    </button>
                  </div>
                </div>

                {/* Splits: Left is existing questions, Right is adding form */}
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                  
                  {/* Left Column: Existing questions list */}
                  <div className="lg:col-span-3 space-y-4">
                    <div className="flex justify-between items-center bg-slate-100 dark:bg-slate-900 p-3 rounded-lg border border-gray-200 dark:border-slate-800">
                      <span className="font-bold text-gray-800 dark:text-slate-200">
                        Exam Questions ({examQuestions.length})
                      </span>
                      <span className="text-[10px] text-gray-400 font-semibold font-mono">Sorted by orderIndex</span>
                    </div>

                    <div className="space-y-4 max-h-[700px] overflow-y-auto pr-2 scrollbar text-xs">
                      {loadingQuestions ? (
                        <div className="text-center py-12">Loading questions core...</div>
                      ) : examQuestions.length === 0 ? (
                        <div className="text-center py-12 text-slate-400 bg-white dark:bg-slate-900 p-8 rounded-2xl border border-gray-150 border-dashed">
                          No questions exist inside this exam yet. Use the question setup workspace on the right to append MCQs, Short or Long answers.
                        </div>
                      ) : (
                        examQuestions.map((q, qIdx) => (
                          <div key={q.id} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-gray-200 dark:border-slate-800/80 relative space-y-4">
                            
                            {/* Question control row */}
                            <div className="flex justify-between items-center border-b border-gray-100 dark:border-slate-800 pb-3">
                              <span className="font-bold text-slate-500 font-mono">
                                Q.{qIdx + 1} &rarr; <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px] text-gray-600 dark:text-slate-400">{q.type === "MCQ" ? "MCQ" : "WRITTEN"}</span>
                              </span>
                              
                              <div className="flex items-center gap-1">
                                {/* Order up down */}
                                <button 
                                  onClick={() => moveQuestionOrder(qIdx, "UP")}
                                  disabled={qIdx === 0}
                                  className="p-1 text-gray-400 hover:text-gray-900 disabled:opacity-30 rounded cursor-pointer"
                                  title="Move Up"
                                >
                                  <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => moveQuestionOrder(qIdx, "DOWN")}
                                  disabled={qIdx === examQuestions.length - 1}
                                  className="p-1 text-gray-400 hover:text-gray-900 disabled:opacity-30 rounded cursor-pointer"
                                  title="Move Down"
                                >
                                  <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                                <span className="text-gray-200 mx-1">|</span>
                                <button 
                                  onClick={() => startEditingQuestion(q)}
                                  className="p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-slate-800 rounded cursor-pointer"
                                  title="Edit"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => handleDeleteQuestion(q.id)}
                                  className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-slate-800 rounded cursor-pointer"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Question Body Text */}
                            <p className="text-gray-900 dark:text-slate-100 font-medium text-sm whitespace-pre-wrap leading-normal">
                              {q.questionText}
                            </p>

                            {/* Details based on Question Type */}
                            {q.type === "MCQ" ? (
                              <div className="grid grid-cols-2 gap-3 pl-3 text-[11px] select-none text-slate-500">
                                {["A", "B", "C", "D"].map((key) => {
                                  const isCorrect = q.correctOption === key;
                                  return (
                                    <div key={key} className={`flex gap-2 items-start p-2 rounded-lg border ${
                                      isCorrect 
                                        ? "border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-400 font-bold" 
                                        : "border-gray-100 dark:border-slate-800"
                                    }`}>
                                      <span className="font-mono">{key}.</span> 
                                      <span className="truncate">{q[`option${key}` as keyof Question]}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-gray-100 dark:border-slate-800 space-y-2 text-[11px]">
                                <p className="text-gray-800 dark:text-slate-200 whitespace-pre-wrap">
                                  <span className="font-bold block text-gray-500 mb-0.5">Model Eval Answer:</span>
                                  {q.modelAnswer}
                                </p>
                              </div>
                            )}

                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Right Column: Add/Edit Question Form Workspace */}
                  <div className="lg:col-span-2">
                    <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-gray-150 dark:border-slate-800 space-y-6 shadow-sm">
                      <div className="border-b border-gray-100 dark:border-slate-800 pb-3 flex justify-between items-center">
                        <span className="font-bold text-gray-900 dark:text-slate-100 flex items-center gap-1.5">
                          <ClipboardList className="w-4 h-4 text-emerald-500" /> 
                          {editingQuestionId ? "Edit Question" : "Add Question"}
                        </span>
                        {editingQuestionId && (
                          <button onClick={resetQuestionForm} className="text-[10px] text-rose-500 hover:underline">
                            Cancel Edit
                          </button>
                        )}
                      </div>

                      <form onSubmit={handleSaveQuestion} className="space-y-4">
                        {/* Selector of Question Types */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Question Type</label>
                          <div className="grid grid-cols-2 gap-2">
                            {["MCQ", "SHORT"].map((type) => (
                              <button
                                key={type}
                                type="button"
                                onClick={() => { setQType(type as any); resetQuestionForm(); if (editingQuestionId) setEditingQuestionId(null); }}
                                className={`py-2 px-1 text-center font-bold rounded-lg cursor-pointer transition select-none ${
                                  (qType === type || (type === "SHORT" && qType === "LONG"))
                                    ? "bg-emerald-600 text-white" 
                                    : "bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-400"
                                }`}
                              >
                                {type === "MCQ" ? "MCQ" : "Written Answer"}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Question Text */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Question Statement</label>
                          <textarea
                            required
                            placeholder="Enter the question statement clearly..."
                            value={qText}
                            onChange={(e) => setQText(e.target.value)}
                            onPaste={(e) => handleImagePaste(e, setQText, qText)}
                            ref={(el) => {
                              if (el) {
                                  el.style.height = "auto";
                                  el.style.height = `${el.scrollHeight}px`;
                              }
                            }}
                            className="w-full text-xs p-3 bg-gray-50 border border-gray-200 focus:border-emerald-500 dark:bg-slate-950 dark:border-slate-800 dark:focus:border-emerald-600 rounded-lg focus:outline-none text-slate-900 dark:text-slate-100 resize-none overflow-hidden min-h-[80px]"
                          />
                          <p className="text-[10px] text-slate-400 dark:text-slate-500">
                            💡 <span className="font-semibold">Tip:</span> You can paste images directly (<span className="font-mono">Ctrl+V / Cmd+V</span>) from your clipboard into the question statement.
                          </p>
                        </div>

                        {/* Custom Coin Reward option */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Coin Reward</label>
                          <input
                            type="number"
                            required
                            min="1"
                            max="100"
                            placeholder="Enter coin value rewarded for correct answer (e.g. 5)"
                            value={qCoinReward}
                            onChange={(e) => setQCoinReward(e.target.value)}
                            className="w-full text-xs p-3 bg-gray-50 border border-gray-200 focus:border-emerald-500 dark:bg-slate-950 dark:border-slate-800 rounded-lg focus:outline-none text-slate-900 dark:text-slate-100"
                          />
                        </div>

                        {/* MCQ Specifics */}
                        {qType === "MCQ" && (
                          <div className="space-y-3">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">MCQ Options (Provide Exactly 4)</label>
                            
                            {["A", "B", "C", "D"].map((key) => {
                              const valueMap = { A: optA, B: optB, C: optC, D: optD };
                              const setMap = { A: setOptA, B: setOptB, C: setOptC, D: setOptD };
                              return (
                                <div key={key} className="flex gap-2 items-center">
                                  <span className="font-mono text-slate-400 font-bold">{key}</span>
                                  <input
                                    type="text"
                                    required={qType === "MCQ"}
                                    placeholder={`Option value ${key}`}
                                    value={valueMap[key as keyof typeof valueMap]}
                                    onChange={(e) => setMap[key as keyof typeof setMap](e.target.value)}
                                    className="flex-1 text-xs p-2.5 bg-gray-50 border border-gray-200 focus:border-emerald-500 dark:bg-slate-950 dark:border-slate-800 rounded-lg focus:outline-none text-slate-900 dark:text-slate-100"
                                  />
                                </div>
                              );
                            })}

                            <div className="space-y-1.5 pt-2">
                              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Correct Option Answer</label>
                              <select
                                value={correctOpt}
                                onChange={(e) => setCorrectOpt(e.target.value)}
                                className="w-full text-xs p-3 bg-gray-50 border border-gray-200 dark:bg-slate-950 dark:border-slate-800 rounded-lg focus:outline-none text-slate-900 dark:text-slate-100"
                              >
                                {["A", "B", "C", "D"].map((key) => (
                                  <option key={key} value={key}>Option {key}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )}

                        {/* SHORT / LONG Text Specifics */}
                        {qType !== "MCQ" && (
                          <div className="space-y-3">
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Model Reference Answer</label>
                              <textarea
                                required={qType !== "MCQ"}
                                placeholder="Write the model conceptual answer for correct similarity grading matches..."
                                value={modelAns}
                                onChange={(e) => setModelAns(e.target.value)}
                                ref={(el) => {
                                  if (el) {
                                    el.style.height = "auto";
                                    el.style.height = `${el.scrollHeight}px`;
                                  }
                                }}
                                className="w-full text-xs p-3 bg-gray-50 border border-gray-200 focus:border-emerald-500 dark:bg-slate-950 dark:border-slate-800 dark:focus:border-emerald-600 rounded-lg focus:outline-none font-sans text-slate-900 dark:text-slate-100 resize-none overflow-hidden min-h-[100px]"
                              />
                              <span className="text-[9px] text-gray-400 dark:text-slate-500 block mt-1 leading-relaxed font-sans">
                                Our evaluation engine uses standard grading parameters to conceptually grade student answers based on your model answer, prioritizing overall meaning over rigid vocabulary matching.
                              </span>
                            </div>
                          </div>
                        )}

                        <button
                          type="submit"
                          className="w-full py-3 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white font-bold rounded-xl transition cursor-pointer font-sans"
                        >
                          {editingQuestionId ? "Save Question Updates" : "Append Question to Exam"}
                        </button>
                      </form>
                    </div>
                  </div>

                </div>

              </div>
            ) : (
              /* THE LIST OF EXAMS TABLE VIEW */
              <div className="space-y-6">
                <div>
                  <p className="text-xs text-emerald-600 font-bold uppercase tracking-wider">Exam Sessions control</p>
                  <h1 className="text-2xl font-black font-display text-gray-900 dark:text-slate-50 mt-1">Manage Examinations</h1>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden select-none">
                  <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
                    <span className="font-bold text-gray-800 dark:text-slate-200 text-sm">Configured Roster</span>
                    <button onClick={fetchExams} className="p-1 hover:bg-gray-100 dark:hover:bg-slate-800 rounded transition">
                      <RefreshCw className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                  </div>

                  <div className="divide-y divide-gray-100 dark:divide-slate-800">
                    {loadingExams ? (
                      <div className="p-12 text-center text-slate-500">Retrieving exams list...</div>
                    ) : exams.length === 0 ? (
                      <div className="p-12 text-center text-slate-400">No exams configured in the system. Create one on the dedicated exam creation tab!</div>
                    ) : (
                      [...exams]
                        .sort((a, b) => {
                          if (a.isPublished !== b.isPublished) {
                            return a.isPublished ? -1 : 1;
                          }
                          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
                        })
                        .map((exam) => {
                          const isEditing = editingExamId === exam.id;
                        return (
                          <div key={exam.id} className="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                            
                            {/* Left part: Details or Inline Editor */}
                            <div className="flex-1 space-y-2">
                              {isEditing ? (
                                <div className="space-y-3">
                                  <input 
                                    type="text" 
                                    className="p-2 border border-gray-200 dark:border-slate-750 bg-gray-50 dark:bg-slate-950 font-bold block w-full rounded focus:outline-none text-slate-900 dark:text-slate-100"
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    placeholder="Exam Title"
                                  />
                                  <div className="flex gap-4">
                                    <input 
                                      type="number" 
                                      className="p-2 border border-gray-200 dark:border-slate-750 bg-gray-50 dark:bg-slate-950 text-xs font-mono rounded focus:outline-none text-slate-900 dark:text-slate-100"
                                      value={editDuration}
                                      onChange={(e) => setEditDuration(e.target.value)}
                                      placeholder="Duration (Minutes)"
                                    />
                                    <input 
                                      type="text" 
                                      className="p-2 border border-gray-200 dark:border-slate-750 bg-gray-50 dark:bg-slate-950 text-xs block rounded focus:outline-none text-slate-900 dark:text-slate-100 flex-1 font-sans"
                                      value={editSubject}
                                      onChange={(e) => setEditSubject(e.target.value)}
                                      placeholder="Subject Name"
                                    />
                                  </div>
                                  <div className="grid grid-cols-3 gap-2">
                                    <select 
                                      className="p-2 border border-gray-200 dark:border-slate-750 bg-gray-50 dark:bg-slate-950 text-xs block rounded focus:outline-none text-slate-900 dark:text-slate-100 font-sans flex-1"
                                      value={editExamClass}
                                      onChange={(e) => setEditExamClass(e.target.value)}
                                    >
                                      <option value="All">All Classes</option>
                                      <option value="11th">11th</option>
                                      <option value="12th">12th</option>
                                    </select>
                                    <select 
                                      className="p-2 border border-gray-200 dark:border-slate-750 bg-gray-50 dark:bg-slate-950 text-xs block rounded focus:outline-none text-slate-900 dark:text-slate-100 font-sans flex-1"
                                      value={editExamSection}
                                      onChange={(e) => setEditExamSection(e.target.value)}
                                    >
                                      <option value="All">All Sections</option>
                                      <option value="MPC">MPC</option>
                                      <option value="BIPC">BIPC</option>
                                      <option value="CEC">CEC</option>
                                    </select>
                                    <select 
                                      className="p-2 border border-gray-200 dark:border-slate-750 bg-gray-50 dark:bg-slate-950 text-xs block rounded focus:outline-none text-slate-900 dark:text-slate-100 font-sans flex-1"
                                      value={editExamStream}
                                      onChange={(e) => setEditExamStream(e.target.value)}
                                    >
                                      <option value="All">All Streams</option>
                                      <option value="JEE">JEE</option>
                                      <option value="NEET">NEET</option>
                                      <option value="EAMCET">EAMCET</option>
                                    </select>
                                  </div>
                                  <textarea 
                                    className="p-2 border border-slate-200 dark:border-slate-750 bg-gray-50 dark:bg-slate-950 text-xs block w-full rounded focus:outline-none text-slate-900 dark:text-slate-100 resize-none overflow-hidden min-h-[60px]"
                                    value={editDesc}
                                    onChange={(e) => setEditDesc(e.target.value)}
                                    ref={(el) => {
                                      if (el) {
                                        el.style.height = "auto";
                                        el.style.height = `${el.scrollHeight}px`;
                                      }
                                    }}
                                    placeholder="Description"
                                  />
                                  <div className="space-y-1 bg-slate-50 dark:bg-slate-950/40 p-3.5 rounded-xl border border-gray-150 dark:border-slate-800">
                                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block flex items-center gap-1">
                                      <Calendar className="w-3 h-3 text-indigo-500" /> Scheduled Publish Date & Time
                                    </label>
                                    <input 
                                      type="datetime-local" 
                                      className="p-2 border border-gray-200 dark:border-slate-750 bg-white dark:bg-slate-900 text-xs font-sans rounded focus:outline-none text-slate-900 dark:text-slate-100"
                                      value={editPublishAt}
                                      onChange={(e) => setEditPublishAt(e.target.value)}
                                    />
                                  </div>
                                  <div className="flex gap-2">
                                    <button 
                                      onClick={() => handleUpdateExam(exam.id)}
                                      className="py-1 px-3 bg-emerald-600 text-white rounded text-[10px] font-bold"
                                    >
                                      Save Updates
                                    </button>
                                    <button 
                                      onClick={() => setEditingExamId(null)}
                                      className="py-1 px-3 bg-gray-300 text-slate-800 rounded text-[10px] font-bold"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-center gap-2">
                                    <h3 className="text-sm font-bold text-gray-900 dark:text-slate-100">{exam.title}</h3>
                                    {exam.publishAt && new Date(exam.publishAt) > new Date() ? (
                                      <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 animate-pulse flex items-center gap-1">
                                        <Calendar className="w-3 h-3 text-amber-500" /> Scheduled
                                      </span>
                                    ) : (
                                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
                                        exam.isPublished 
                                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400" 
                                          : "bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400"
                                      }`}>
                                        {exam.isPublished ? "Published" : "Draft"}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-gray-400 dark:text-slate-500 text-[11px] leading-relaxed max-w-2xl">{exam.description}</p>
                                  <div className="flex flex-wrap gap-4 text-[10px] font-mono text-gray-400 items-center">
                                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {exam.durationMinutes} Minutes</span>
                                    <span>Subject: {exam.subject || "General"}</span>
                                    {exam.examClass && (
                                      <span className="px-2 py-0.5 bg-blue-100/50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-350 font-bold rounded text-[9px]">
                                        Class {exam.examClass}{exam.examSection && ` - ${exam.examSection}`}{exam.examStream && ` (${exam.examStream})`}
                                      </span>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>

                            {/* Right part: Action Buttons */}
                            {!isEditing && (
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  onClick={() => handleOpenPreview(exam)}
                                  className="py-2 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl cursor-pointer transition text-xs flex items-center gap-1.5 shadow-sm"
                                  title="Launch student view simulation"
                                >
                                  <Eye className="w-3.5 h-3.5" /> Preview
                                </button>
                                <button
                                  onClick={() => openBuilder(exam)}
                                  className="py-2 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl cursor-pointer transition text-xs flex items-center gap-1.5"
                                >
                                  <HelpCircle className="w-3.5 h-3.5" /> Exam Builder
                                </button>
                                <button
                                  onClick={() => viewDetailedAnalytics(exam.id)}
                                  className="py-2 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-gray-900 dark:text-slate-100 font-bold rounded-xl cursor-pointer transition text-xs flex items-center gap-1.5"
                                >
                                  <BarChart3 className="w-3.5 h-3.5 text-emerald-500 animate-pulse" /> Analytics
                                </button>
                                <button
                                  onClick={() => startEditingExam(exam)}
                                  className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                                  title="Edit properties"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteExam(exam.id)}
                                  className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                                  title="Delete exam session"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}

                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}
            
          </div>
        )}

        {/* ==========================================
            TAB: ANALYTICS (EXAM SPECIFIC INSIGHTS)
           ========================================== */}
        {activeTab === "ANALYTICS" && (
          <div className="space-y-8 animate-fade-in text-xs selection-none">
            
            {/* Header selection trigger if none selected */}
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs text-emerald-600 font-bold uppercase tracking-wider">Metrics and NLP similarity Analysis</p>
                <h1 className="text-2xl font-black font-display text-gray-900 dark:text-slate-50 mt-1">
                  {analyticsExamId ? "Selected Exam Analytics" : "Examination Performance Analysis"}
                </h1>
              </div>
              
              {analyticsExamId && (
                <button
                  onClick={() => { setAnalyticsExamId(null); setExamAnalytics(null); }}
                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-200 rounded-lg"
                >
                  Choose Different Exam
                </button>
              )}
            </div>

            {!analyticsExamId ? (
              <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-gray-200 dark:border-slate-800/60 text-center text-slate-400">
                <BarChart3 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="mb-4 text-sm font-medium">Please select an exam inside the "Manage Exams" control grid to retrieve its advanced grading metrics summaries.</p>
                <button
                  onClick={() => setActiveTab("MANAGE_EXAMS")}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold"
                >
                  Navigate to Manage Exams
                </button>
              </div>
            ) : !examAnalytics ? (
              <div>Calculating cosine weights & fetching historical exam analytics...</div>
            ) : (
              <div className="space-y-8">
                
                {/* Visual Cards Grid */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-6">
                  {[
                    { label: "Total Attempts", val: examAnalytics.totalAttempts, col: "text-gray-900 dark:text-slate-100" },
                    { label: "Highest Score", val: `${examAnalytics.highestScore} pts`, col: "text-emerald-500" },
                    { label: "Lowest Score", val: `${examAnalytics.lowestScore} pts`, col: "text-rose-500" },
                    { label: "Average Score", val: `${examAnalytics.averageScore} pts`, col: "text-blue-500" },
                    { label: "Pass Percentage", val: `${examAnalytics.passPercentage}%`, col: "text-emerald-500 font-black" },
                    { label: "Fail Percentage", val: `${examAnalytics.failPercentage}%`, col: "text-rose-500" }
                  ].map((card, idx) => (
                    <div key={idx} className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
                      <p className="text-[9px] uppercase font-bold text-gray-400">{card.label}</p>
                      <p className={`text-xl font-bold mt-1 shadow-sm ${card.col}`}>{card.val}</p>
                    </div>
                  ))}
                </div>

                {/* Question Pass Rate difficulty ratios */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  
                  {/* Detailed question pass statistics mapping */}
                  <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-4">
                    <h3 className="font-bold uppercase font-display text-sm tracking-wide text-gray-900 dark:text-slate-100 border-b border-gray-100 dark:border-slate-800 pb-3">
                      Easiest & Hardest Question Ratio Audit
                    </h3>

                    <div className="space-y-4">
                      {examAnalytics.questionAnalysis.map((item, index) => {
                        const isHardest = index === 0 && item.wrongPercentage > 50;
                        const isEasiest = index === examAnalytics.questionAnalysis.length - 1 && item.correctPercentage > 70;
                        
                        return (
                          <div key={item.id} className="space-y-1.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800">
                            <div className="flex justify-between items-start gap-3">
                              <span className="font-bold text-gray-800 dark:text-slate-200">
                                Q.{index + 1}: <span className="font-mono text-gray-400 text-[10px] whitespace-pre-wrap block mt-1 leading-relaxed bg-slate-100/50 dark:bg-slate-900/30 p-1.5 rounded border border-gray-200/20">{item.questionText}</span>
                              </span>
                              
                              {/* Highlight badges */}
                              {isHardest && (
                                <span className="bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400 px-1.5 py-0.5 rounded text-[8px] font-black uppercase">
                                  Hardest Segment
                                </span>
                              )}
                              {isEasiest && (
                                <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400 px-1.5 py-0.5 rounded text-[8px] font-black uppercase">
                                  Easiest Segment
                                </span>
                              )}
                            </div>

                            {/* Percentage progress representation bar */}
                            <div className="space-y-1">
                              <div className="w-full bg-gray-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden flex">
                                <div 
                                  style={{ width: `${item.correctPercentage}%` }}
                                  className="bg-emerald-500 h-full"
                                  title="Correct Percent"
                                />
                                <div 
                                  style={{ width: `${item.wrongPercentage}%` }}
                                  className="bg-rose-500 h-full"
                                  title="Wrong Percent"
                                />
                              </div>
                              <div className="flex justify-between text-[9px] text-gray-400 font-mono">
                                <span>Correct: {item.correctPercentage}%</span>
                                <span>Wrong: {item.wrongPercentage}%</span>
                                <span>Total Answers: {item.attempts}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Summary context panel instruction card */}
                  <div className="bg-slate-800 text-slate-100 p-8 rounded-3xl border border-slate-700 space-y-6 flex flex-col justify-between">
                    <div>
                      <h3 className="font-bold font-display text-lg tracking-wide text-emerald-400">Automated Grading Core</h3>
                      <p className="text-slate-400 leading-relaxed mt-3 text-sm">
                        This system automatically parses student answers using the advanced evaluation core model to evaluate conceptual accuracy and general understanding.
                        Your model answer and key target concepts are used as guidelines. Marks are awarded leniently for partial correctness and proper explanations.
                      </p>
                    </div>
                    
                    <div className="bg-slate-900 p-4 rounded-xl space-y-2 border border-slate-700">
                      <span className="font-bold text-xs text-white block">Grading Parameters</span>
                      <ul className="space-y-1.5 text-xs text-slate-400 font-mono leading-normal">
                        <li>• Complete MCQ checks</li>
                        <li>• Conceptual correctness match</li>
                        <li>• Clear, tailored Tutor feedback</li>
                      </ul>
                    </div>
                  </div>

                </div>

                {/* Submitted Results & Manual Corrector inside Exam Analytics panel */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
                  <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-850 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
                    <div>
                      <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100 font-display">Student Grading Corrections Index</h3>
                      <p className="text-[10px] text-slate-500 font-medium">Verify individual evaluation answers and manually correct scores as required.</p>
                    </div>
                    <button 
                      onClick={() => fetchResults(false)}
                      className="px-3 py-1 bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-[10px] font-bold uppercase tracking-wider rounded-lg border border-slate-200 dark:border-slate-700"
                    >
                      Sync Submissions
                    </button>
                  </div>

                  {(() => {
                    const filteredSubmissions = allResults.filter(r => r.examId === analyticsExamId);
                    if (filteredSubmissions.length === 0) {
                      return (
                        <div className="text-center py-12 text-slate-400">
                          No student completions or grading results found for this exam.
                        </div>
                      );
                    }

                    return (
                      <div className="overflow-x-auto text-xs">
                        <table className="w-full text-left border-collapse">
                          <thead className="bg-slate-50 dark:bg-slate-800/50 text-[10px] uppercase font-bold text-slate-440 border-b border-slate-200 dark:border-slate-800/80">
                            <tr>
                              <th className="px-6 py-4 font-display">Student</th>
                              <th className="px-6 py-4 font-display">Email</th>
                              <th className="px-6 py-4 text-center font-display">Percentage</th>
                              <th className="px-6 py-4 text-center font-display">Score Point</th>
                              <th className="px-6 py-4 text-right font-display">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-150 dark:divide-slate-850 font-sans">
                            {filteredSubmissions.map((sub) => {
                              const isEditing = editingScoreId === sub.id;
                              return (
                                <tr key={sub.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/15 transition-colors">
                                  <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-100 font-display">
                                    {sub.studentName}
                                  </td>
                                  <td className="px-6 py-4 font-mono text-xs text-slate-500 dark:text-slate-400">
                                    {sub.studentEmail || "No Email Anchor"}
                                  </td>
                                  <td className="px-6 py-4 text-center font-mono font-semibold text-slate-800 dark:text-slate-300">
                                    {sub.percentage}%
                                  </td>
                                  <td className="px-6 py-4 text-center font-mono font-bold text-slate-900 dark:text-slate-100">
                                    {isEditing ? (
                                      <div className="inline-flex items-center gap-1.5 justify-center">
                                        <input
                                          type="number"
                                          step="1"
                                          min="0"
                                          max={sub.maxScore || 100}
                                          value={editingScoreValue}
                                          onChange={(e) => setEditingScoreValue(e.target.value)}
                                          className="w-16 text-center text-xs p-1 bg-slate-50 border border-slate-300 dark:bg-slate-950 dark:border-slate-800 rounded font-bold focus:outline-none"
                                        />
                                        <span className="text-slate-400 font-normal">/ {sub.maxScore || 10}</span>
                                      </div>
                                    ) : (
                                      <span>{sub.score} / {sub.maxScore || 10}</span>
                                    )}
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                    {isEditing ? (
                                      <div className="inline-flex gap-2">
                                        <button
                                          disabled={submittingGrade}
                                          onClick={() => handleUpdateMarks(sub.studentId, sub.examId, Number(editingScoreValue))}
                                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[10px] uppercase cursor-pointer transition active:scale-98"
                                        >
                                          {submittingGrade ? "Saving" : "Confirm"}
                                        </button>
                                        <button
                                          onClick={() => setEditingScoreId(null)}
                                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-250 dark:bg-slate-850 text-slate-700 dark:text-slate-300 font-bold rounded-lg text-[10px]"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          setEditingScoreId(sub.id);
                                          setEditingScoreValue(sub.score.toString());
                                        }}
                                        className="py-1 px-3.5 bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 font-bold rounded-lg text-[10px] transition cursor-pointer"
                                      >
                                        Correct Score
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </div>

              </div>
            )}

          </div>
        )}

        {/* ==========================================
            TAB: LIVE MONITOR
           ========================================== */}
        {activeTab === "LIVE_MONITOR" && (
          <div className="space-y-8 animate-fade-in text-xs">
            <div>
              <p className="text-xs text-emerald-600 font-bold uppercase tracking-wider">Live Monitoring</p>
              <h1 className="text-2xl font-black font-display text-gray-900 dark:text-slate-50 mt-1">Live Student Progress</h1>
            </div>

            {/* Telemetry info row */}
            <div className="bg-amber-50 dark:bg-amber-950/10 p-4 rounded-2xl border border-amber-200 dark:border-amber-900/30 flex justify-between items-center gap-4">
              <span className="text-amber-800 dark:text-amber-400 font-medium">
                Live monitor check is active. If any student navigates away, exits fullscreen, switches tabs, or goes inactive, alerts trigger instantly inside this panel.
              </span>
              <button 
                onClick={fetchLiveTelemetrySessions}
                className="flex items-center gap-1.5 py-1.5 px-3 bg-amber-200 dark:bg-amber-900/30 text-amber-950 dark:text-amber-300 font-semibold rounded-lg hover:bg-amber-250 transition cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Force Sync
              </button>
            </div>

            {/* Monitor list Grid */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-200 dark:border-slate-800 overflow-hidden shadow-sm select-none">
              <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 font-bold text-gray-800 dark:text-slate-200 text-sm">
                Active Student Sessions
              </div>

              <div className="divide-y divide-gray-100 dark:divide-slate-800">
                {liveSessions.length === 0 ? (
                  <div className="p-12 text-center text-slate-400">No active examination sessions are currently open in the student registry.</div>
                ) : (
                  liveSessions.map((sess) => {
                    const isLeakingCheating = sess.tabSwitchCount > 0 || sess.windowBlurCount > 0 || sess.fullscreenExitCount > 0;
                    
                    return (
                      <div key={sess.id} className="p-6 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                        
                        {/* Student Name & Status */}
                        <div className="flex-1 space-y-3 min-w-0">
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-sm text-gray-900 dark:text-slate-100">{sess.studentName}</span>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                              sess.status === "ACTIVE" 
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 animate-pulse" 
                                : "bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400"
                            }`}>
                              {sess.status}
                            </span>
                          </div>

                          <p className="text-gray-400 dark:text-slate-500 font-semibold text-xs">Exam: {sess.examTitle}</p>
                          
                          {/* Live Student Progress Tracker Section */}
                          <div className="bg-slate-50/50 dark:bg-slate-950/25 p-4 rounded-2xl border border-gray-150 dark:border-slate-850 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[10px] leading-relaxed">
                              
                              {/* 1. Current Question */}
                              <div className="space-y-0.5">
                                <span className="text-gray-400 font-bold uppercase tracking-wider block">Current Question</span>
                                <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">
                                  {sess.currentQuestionNum !== undefined && sess.totalQuestionsCount ? (
                                    `Question ${sess.currentQuestionNum} of ${sess.totalQuestionsCount}`
                                  ) : (
                                    "Initializing Setup..."
                                  )}
                                </span>
                                {sess.currentQuestionText && (
                                  <p className="text-[9px] text-gray-400 max-w-[220px] truncate" title={sess.currentQuestionText}>
                                    &ldquo;{sess.currentQuestionText}&rdquo;
                                  </p>
                                )}
                              </div>

                              {/* 2. Answered count & Progress bar */}
                              <div className="space-y-0.5">
                                <span className="text-gray-400 font-bold uppercase tracking-wider block">Student Completeness</span>
                                <span className="font-bold text-slate-800 dark:text-slate-200">
                                  {sess.answeredCount || 0} / {sess.totalQuestionsCount || 0} Answered
                                </span>
                                <div className="flex items-center gap-2 mt-1">
                                  <div className="w-full bg-gray-250 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                    <div 
                                      className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                                      style={{ 
                                        width: `${(sess.totalQuestionsCount || 0) > 0 ? Math.round(((sess.answeredCount || 0) / (sess.totalQuestionsCount || 1)) * 100) : 0}%` 
                                      }}
                                    />
                                  </div>
                                  <span className="text-[9px] font-mono font-bold text-gray-400">
                                    {Math.round(((sess.answeredCount || 0) / (sess.totalQuestionsCount || 1)) * 100)}%
                                  </span>
                                </div>
                              </div>

                            </div>
                          </div>

                          {sess.recentEvent && (
                            <p className="text-[10px] font-mono text-gray-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 p-2 rounded border border-gray-100 dark:border-slate-800 truncate">
                              Trace: {sess.recentEvent}
                            </p>
                          )}
                        </div>

                        {/* Cheating Telemetry Markers Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[10px] font-mono">
                          <div className="bg-slate-50 dark:bg-slate-800 p-2.5 rounded-xl border border-gray-100 dark:border-slate-800 flex flex-col text-center">
                            <span className="text-gray-400 uppercase">Tab Switches</span>
                            <span className={`text-base font-bold mt-1 ${sess.tabSwitchCount > 2 ? "text-rose-500 font-extrabold" : "text-gray-900 dark:text-slate-100"}`}>
                              {sess.tabSwitchCount}
                            </span>
                          </div>
                          <div className="bg-slate-50 dark:bg-slate-800 p-2.5 rounded-xl border border-gray-100 dark:border-slate-800 flex flex-col text-center">
                            <span className="text-gray-400 uppercase">Window Blur</span>
                            <span className={`text-base font-bold mt-1 ${sess.windowBlurCount > 2 ? "text-rose-500 font-extrabold" : "text-gray-900 dark:text-slate-100"}`}>
                              {sess.windowBlurCount}
                            </span>
                          </div>
                          <div className="bg-slate-50 dark:bg-slate-800 p-2.5 rounded-xl border border-gray-100 dark:border-slate-800 flex flex-col text-center">
                            <span className="text-gray-400 uppercase">FS Exits</span>
                            <span className={`text-base font-bold mt-1 ${sess.fullscreenExitCount > 0 ? "text-rose-500 font-extrabold" : "text-gray-900 dark:text-slate-100"}`}>
                              {sess.fullscreenExitCount}
                            </span>
                          </div>
                          <div className="bg-slate-50 dark:bg-slate-800 p-2.5 rounded-xl border border-gray-100 dark:border-slate-800 flex flex-col text-center">
                            <span className="text-gray-400 uppercase">Inactivity</span>
                            <span className={`text-base font-bold mt-1 ${sess.inactivityWarnings > 1 ? "text-rose-500 font-extrabold" : "text-gray-900 dark:text-slate-100"}`}>
                              {sess.inactivityWarnings}
                            </span>
                          </div>
                        </div>

                        {/* Action details logs view */}
                        <div>
                          <button
                            onClick={() => fetchExamDetailedLogs(sess)}
                            className="w-full lg:w-auto py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <ShieldAlert className="w-4 h-4" /> View Activity Logs
                          </button>
                        </div>

                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* DETAILED LOGBOOK MODAL POPUP */}
            {viewingSessionLogs && (
              <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <div className="bg-white dark:bg-slate-900 max-w-2xl w-full p-6 rounded-3xl border border-gray-200 dark:border-slate-800 shadow-2xl space-y-4">
                  <div className="flex justify-between items-center border-b border-gray-100 dark:border-slate-800 pb-3">
                    <div>
                      <h3 className="font-bold text-sm text-gray-900 dark:text-slate-100">
                        Detailed Student Activity Log
                      </h3>
                      <p className="text-[10px] text-gray-400 font-semibold mt-0.5">Student: {viewingSessionLogs.studentName}</p>
                    </div>
                    <button 
                      onClick={() => setViewingSessionLogs(null)}
                      className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-full"
                    >
                      <X className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>

                  <div className="space-y-2 max-h-[350px] overflow-y-auto pr-2 scrollbar text-xxs font-mono">
                    {sessionLogs.length === 0 ? (
                      <div className="text-center py-12 text-slate-400">No monitoring logs captured. Student is in full compliance.</div>
                    ) : (
                      sessionLogs.map((log) => {
                        let col = "text-gray-600 dark:text-slate-300";
                        if (log.eventType !== "START" && log.eventType !== "SUBMIT" && log.eventType !== "AUTO_SAVE") {
                          col = "text-rose-500 font-bold block bg-rose-50 dark:bg-rose-950/20 p-2 rounded border border-rose-500/20";
                        }
                        return (
                          <div key={log.id} className={`p-2.5 rounded bg-slate-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-800 flex items-start gap-4 ${col}`}>
                            <span className="font-bold uppercase shrink-0 text-emerald-600 dark:text-emerald-400 text-[10px]">
                              [{log.eventType}]
                            </span>
                            <div className="flex-1">
                              <p className="leading-relaxed">{log.details}</p>
                              <p className="text-[9px] text-gray-400 mt-1">{new Date(log.timestamp).toLocaleTimeString()} ({new Date(log.timestamp).toLocaleDateString()})</p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="pt-3 border-t border-gray-150 dark:border-slate-800 flex justify-end">
                    <button 
                      onClick={() => setViewingSessionLogs(null)}
                      className="py-2 px-5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold cursor-pointer text-xs"
                    >
                      Close Log
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

        {/* ==========================================
            TAB: LEADERBOARD
           ========================================== */}
        {activeTab === "LEADERBOARD" && (
          <div className="space-y-8 animate-fade-in text-xs selection-none">
            <div>
              <p className="text-xs text-emerald-600 font-bold uppercase tracking-wider">Dynamic Score Rankings Cache</p>
              <h1 className="text-2xl font-black font-display text-gray-900 dark:text-slate-50 mt-1">Global Leaderboard</h1>
            </div>

            {/* Dynamic Class/Section/Stream Leaderboard Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Filter Class</label>
                <select
                  value={leaderboardClassFilter}
                  onChange={(e) => setLeaderboardClassFilter(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none text-slate-850 dark:text-slate-200"
                >
                  <option value="ALL">All Classes (11th, 12th, etc)</option>
                  {availableClasses.map((cls) => (
                    <option key={cls} value={cls}>Class {cls}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Filter Section</label>
                <select
                  value={leaderboardSectionFilter}
                  onChange={(e) => setLeaderboardSectionFilter(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none text-slate-850 dark:text-slate-200"
                >
                  <option value="ALL">All Sections (MPC, BIPC, CEC, etc)</option>
                  {availableSections.map((sec) => (
                    <option key={sec} value={sec}>Section {sec}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Filter Stream/Target</label>
                <select
                  value={leaderboardStreamFilter}
                  onChange={(e) => setLeaderboardStreamFilter(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none text-slate-850 dark:text-slate-200"
                >
                  <option value="ALL">All Streams (JEE, NEET, EAMCET, etc)</option>
                  {availableStreams.map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* TAB: LEADERBOARD CONTENT */}
            <div className="space-y-8 select-none">
              
              {/* Visual Top 3 podium header */}
              {filteredLeaderboard.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  
                  {/* 2nd Place Card */}
                  {filteredLeaderboard[1] && (
                    <div className="bg-gradient-to-b from-slate-100 to-white dark:from-slate-800/40 dark:to-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-3xl p-6 flex flex-col items-center justify-center text-center relative order-2 md:order-1 mt-0 md:mt-8 shadow-xs">
                      <div className="absolute top-4 left-4 bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border border-slate-300 dark:border-slate-700">2</div>
                      <div className="w-14 h-14 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 rounded-full flex items-center justify-center text-xl font-bold border-4 border-slate-300 dark:border-slate-700 shadow-md">
                        🥈
                      </div>
                      <h4 className="font-extrabold text-sm text-slate-800 dark:text-slate-100 mt-4 leading-tight">{filteredLeaderboard[1].studentName}</h4>
                      <p className="text-[10px] text-slate-400 uppercase font-mono tracking-wider font-semibold mt-1">Silver Runner</p>
                      
                      <div className="mt-4 flex flex-col items-center bg-slate-50 dark:bg-slate-950/40 px-4 py-2 rounded-xl border border-slate-100 dark:border-slate-800/60 w-full">
                        <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono">🪙 {filteredLeaderboard[1].totalCoins} Coins</span>
                        <span className="text-[10px] text-slate-400 mt-0.5 font-mono">Accuracy: {filteredLeaderboard[1].averagePercentage}%</span>
                      </div>
                    </div>
                  )}

                  {/* 1st Place Card - Main Focus */}
                  {filteredLeaderboard[0] && (
                    <div className="bg-gradient-to-b from-amber-50 to-white dark:from-amber-950/25 dark:to-slate-900 border-2 border-amber-300 dark:border-amber-800/50 rounded-3xl p-8 flex flex-col items-center justify-center text-center relative order-1 md:order-2 shadow-sm shadow-amber-500/5 hover:scale-[1.01] transition-all duration-300">
                      <div className="absolute top-4 left-4 bg-amber-500 text-white w-7 h-7 rounded-full flex items-center justify-center text-xs font-black border-2 border-white dark:border-slate-900 shadow-md">1</div>
                      <div className="w-18 h-18 bg-amber-100 text-amber-600 dark:bg-amber-900/30 rounded-full flex items-center justify-center text-2xl font-bold border-4 border-amber-400 dark:border-amber-700/60 shadow-md">
                        👑
                      </div>
                      <h4 className="font-black text-base text-slate-900 dark:text-slate-100 mt-4 leading-tight">{filteredLeaderboard[0].studentName}</h4>
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 uppercase font-mono tracking-widest font-extrabold mt-1">Grand Champion</p>
                      
                      <div className="mt-5 flex flex-col items-center bg-amber-500/5 dark:bg-amber-500/10 px-6 py-2.5 rounded-2xl border border-amber-500/10 w-full">
                        <span className="text-base font-black text-amber-600 dark:text-amber-400 font-mono">🪙 {filteredLeaderboard[0].totalCoins} Coins</span>
                        <span className="text-[10px] text-slate-400 mt-0.5 font-mono">Accuracy: {filteredLeaderboard[0].averagePercentage}%</span>
                      </div>
                    </div>
                  )}

                  {/* 3rd Place Card */}
                  {filteredLeaderboard[2] && (
                    <div className="bg-gradient-to-b from-amber-50/10 to-white dark:from-amber-950/5 dark:to-slate-900 border border-amber-600/10 dark:border-amber-900/10 rounded-3xl p-6 flex flex-col items-center justify-center text-center relative order-3 mt-0 md:mt-8 shadow-xs">
                      <div className="absolute top-4 left-4 bg-amber-700/15 text-amber-700 dark:text-amber-400 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border border-amber-600/20 dark:border-amber-900/10">3</div>
                      <div className="w-14 h-14 bg-amber-600/5 text-amber-700 dark:bg-amber-900/20 rounded-full flex items-center justify-center text-xl font-bold border-4 border-amber-600/20 dark:border-amber-900/20 shadow-md">
                        🥉
                      </div>
                      <h4 className="font-extrabold text-sm text-slate-800 dark:text-slate-100 mt-4 leading-tight">{filteredLeaderboard[2].studentName}</h4>
                      <p className="text-[10px] text-slate-400 uppercase font-mono tracking-wider font-semibold mt-1">Bronze Scholar</p>
                      
                      <div className="mt-4 flex flex-col items-center bg-slate-50 dark:bg-slate-950/40 px-4 py-2 rounded-xl border border-slate-100 dark:border-slate-800/60 w-full">
                        <span className="text-sm font-black text-blue-600 dark:text-blue-400 font-mono">🪙 {filteredLeaderboard[2].totalCoins} Coins</span>
                        <span className="text-[10px] text-slate-400 mt-0.5 font-mono">Accuracy: {filteredLeaderboard[2].averagePercentage}%</span>
                      </div>
                    </div>
                  )}

                </div>
              )}

              {/* Main Table for Standing List */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden animate-fade-in">
                <div className="px-6 py-4.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex justify-between items-center">
                  <span className="font-bold text-gray-800 dark:text-slate-200 text-sm">Active Standings Leaderboard</span>
                  <button onClick={fetchLeaderboard} className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-850 rounded-lg transition text-slate-400 hover:text-slate-600 cursor-pointer">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="overflow-x-auto text-[11px]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-[10px] uppercase font-bold text-slate-440 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-6 py-4 text-center w-16">Rank</th>
                        <th className="px-6 py-4">Student Name</th>
                        <th className="px-6 py-4 text-center font-display">Class / Section</th>
                        <th className="px-6 py-4 text-center font-display">Exams Attempted</th>
                        <th className="px-6 py-4 text-center font-display">Coins Balance</th>
                        <th className="px-6 py-4 text-center font-display">Average Accuracy</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150 dark:divide-slate-800">
                      {filteredLeaderboard.map((student, idx) => {
                        const relRank = idx + 1;
                        const isTop3 = idx < 3;
                        const badgeCols = [
                          "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-450",
                          "bg-slate-200 text-slate-800 border-slate-300 dark:bg-slate-800/40 dark:text-slate-400",
                          "bg-amber-600/10 text-amber-700 border-amber-600/30 dark:bg-amber-700/20 dark:text-amber-400"
                        ];

                        return (
                          <tr key={student.studentId} className="hover:bg-slate-50/50 dark:hover:bg-slate-805/25 transition">
                            <td className="px-6 py-4.5 font-mono font-bold text-center">
                              {isTop3 ? (
                                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full border text-xs font-black ${badgeCols[idx]}`}>
                                  {relRank}
                                </span>
                              ) : (
                                <span className="text-slate-450">{relRank}</span>
                              )}
                            </td>
                            <td className="px-6 py-4.5 font-bold text-slate-900 dark:text-slate-100 font-sans text-xs">
                              {student.studentName}
                            </td>
                            <td className="px-6 py-4.5 text-center font-sans">
                              {student.studentClass ? (
                                <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 font-semibold text-[10px] rounded text-slate-700 dark:text-slate-300">
                                  Class {student.studentClass}{student.studentSection && ` - ${student.studentSection}`}{student.studentStream && ` (${student.studentStream})`}
                                </span>
                              ) : (
                                <span className="text-slate-450 italic text-[10px]">General</span>
                              )}
                            </td>
                            <td className="px-6 py-4.5 font-mono text-center text-slate-500 dark:text-slate-400">{student.examsAttempted}</td>
                            <td className="px-6 py-4.5 font-mono font-bold text-center text-emerald-600 dark:text-emerald-400 text-sm">
                              🪙 {student.totalCoins}
                            </td>
                            <td className="px-6 py-4.5 text-center font-mono font-bold">
                              <span className="bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 px-2 py-0.5 rounded">
                                {student.averagePercentage}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==========================================
            TAB: USERS DIRECTORY (Admin powers merged directly)
           ========================================== */}
        {activeTab === "USERS_DIR" && (
          <div className="space-y-6 animate-fade-in text-xs">
            
            {/* Header Block */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm mb-2">
              <div>
                <p className="text-xs text-emerald-600 font-bold uppercase tracking-wider">Institution Workspace Manager</p>
                <h1 className="text-2xl font-black font-display text-gray-900 dark:text-slate-50 mt-1">Student Logins Directory</h1>
              </div>
            </div>

            {/* METRICS ROW */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono text-center">
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm">
                <p className="text-[9px] uppercase font-bold text-gray-400 dark:text-gray-500">Total Registered Students</p>
                <p className="text-3xl font-black text-gray-950 dark:text-white mt-1">{studentCount} Students</p>
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1.5">&#9679; Active student profiles ready</p>
              </div>
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm">
                <p className="text-[9px] uppercase font-bold text-gray-400 dark:text-gray-500">Average Wallet Coins</p>
                <p className="text-3xl font-black text-gray-950 dark:text-white mt-1">🪙 {avgStudentCoins}</p>
                <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-1.5">&#9679; Earned through examination performance</p>
              </div>
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm border-emerald-500/10">
                <p className="text-[9px] uppercase font-bold text-gray-400 dark:text-gray-500">Published Active Exams</p>
                <p className="text-3xl font-black text-emerald-650 dark:text-emerald-300 mt-1">{publishedExamCount} Exams</p>
                <p className="text-[10px] text-slate-500 mt-1.5">&#9679; Fully available to students</p>
              </div>
            </div>

            {/* Search and Filters & Create button */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm">
              <div className="flex flex-1 flex-col sm:flex-row gap-3 w-full">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search students index by email, name..."
                    className="w-full text-xs p-3 pl-10 bg-slate-50 border border-slate-200 dark:bg-slate-950 dark:border-slate-800 rounded-xl focus:outline-none focus:border-emerald-500 text-slate-950 dark:text-slate-100 font-sans"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto shrink-0">
                <button
                  onClick={() => {
                    setShowBulkImport(!showBulkImport);
                    setBulkImportResult(null);
                    setBulkImportFileError(null);
                    setBulkParsedStudents([]);
                  }}
                  className={`py-3 px-5 border font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-98 w-full md:w-auto ${
                    showBulkImport 
                      ? "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200" 
                      : "bg-blue-600 hover:bg-blue-500 border-blue-600 hover:border-blue-500 text-white"
                  }`}
                >
                  <FileSpreadsheet className="w-4 h-4" /> Bulk Import Logins
                </button>

                <button
                  onClick={() => {
                    setCreateError(null);
                    setShowCreateModal(true);
                  }}
                  className="py-3 px-5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-98 w-full md:w-auto"
                >
                  <UserPlus className="w-4 h-4" /> Create Student Login
                </button>
              </div>
            </div>

            {/* BULK IMPORT COLLAPSIBLE PANEL */}
            {showBulkImport && (
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6 animate-fade-in text-xs">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-50 font-display">Bulk Student Login Importer</h3>
                    <p className="text-slate-400 dark:text-slate-500 text-xxs mt-0.5">Upload a CSV/Excel CSV file or paste spreadsheet data to create accounts instantly.</p>
                  </div>
                  
                  {/* Download Template Button */}
                  <button
                    onClick={() => {
                      const headers = "Name, Email, Password, Class, Section, Stream\n";
                      const row1 = "Alice Johnson, alice@school.edu, pass123, 11, MPC, JEE\n";
                      const row2 = "Bob Smith, bob@school.edu, pass456, 12, BIPC, NEET\n";
                      const blob = new Blob([headers + row1 + row2], { type: "text/csv;charset=utf-8;" });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement("a");
                      link.setAttribute("href", url);
                      link.setAttribute("download", "student_import_template.csv");
                      link.style.visibility = "hidden";
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                    className="py-2 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 font-bold rounded-xl transition text-xxs flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    Download CSV Template
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* File Upload Trigger Drop Area */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-slate-400 uppercase block">Step 1: Choose CSV File or Paste Data</label>
                    <div 
                      className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-6 hover:border-emerald-500/50 dark:hover:border-emerald-500/30 transition flex flex-col items-center justify-center text-center bg-slate-50/50 dark:bg-slate-950/10 cursor-pointer group min-h-[140px]"
                      onClick={() => document.getElementById("bulk-file-input")?.click()}
                    >
                      <input 
                        type="file" 
                        id="bulk-file-input" 
                        accept=".csv,.txt"
                        className="hidden" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (evt) => {
                              const text = evt.target?.result as string;
                              handleBulkCSVParse(text);
                            };
                            reader.readAsText(file);
                          }
                        }}
                      />
                      <UploadCloud className="w-8 h-8 text-slate-400 group-hover:text-emerald-500 transition mb-3" />
                      <p className="text-slate-800 dark:text-slate-200 font-bold text-xxs">Click to browse your device</p>
                      <p className="text-slate-400 dark:text-slate-500 text-[10px] mt-1 font-mono">Supports standard comma-separated .csv exports</p>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Or Paste Raw CSV Lines</label>
                        {bulkCSVText && (
                          <button 
                            type="button" 
                            onClick={() => handleBulkCSVParse("")} 
                            className="text-[10px] text-rose-500 hover:underline font-semibold"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <textarea
                        value={bulkCSVText}
                        onChange={(e) => handleBulkCSVParse(e.target.value)}
                        placeholder="Name, Email, Password, Class, Section, Stream&#10;Alice Johnson, alice@school.edu, pass123, 11, MPC, JEE&#10;Bob Smith, bob@school.edu, pass456, 12, BIPC, NEET"
                        rows={5}
                        className="w-full text-xs p-3 bg-slate-50 border border-slate-200 dark:bg-slate-950 dark:border-slate-800 rounded-xl focus:outline-none focus:border-emerald-500 text-slate-950 dark:text-slate-100 font-mono"
                      />
                    </div>
                  </div>

                  {/* Preview Area */}
                  <div className="space-y-3 flex flex-col justify-between">
                    <div className="flex-1">
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase block">Step 2: Preview Logins ({bulkParsedStudents.length} entries parsed)</label>
                        {bulkParsedStudents.length > 0 && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-450 px-2 py-0.5 rounded font-black font-mono">Ready to Seed</span>
                        )}
                      </div>

                      {bulkImportFileError && (
                        <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-300 dark:border-rose-900/40 text-rose-700 dark:text-rose-400 text-xs rounded-xl">
                          {bulkImportFileError}
                        </div>
                      )}

                      {bulkImportResult && (
                        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 text-emerald-800 dark:text-emerald-300 space-y-2">
                          <p className="font-bold text-xxs uppercase tracking-wider">🚀 Seed Execution Completed Successfully!</p>
                          <p className="font-mono text-xs">● Created: {bulkImportResult.count} student logins</p>
                          {bulkImportResult.errors && bulkImportResult.errors.length > 0 && (
                            <div className="pt-2 border-t border-emerald-200/50 dark:border-emerald-900/30 text-[10px] text-slate-500 dark:text-slate-400 max-h-24 overflow-y-auto font-mono space-y-1">
                              <p className="font-bold text-rose-500">Omits & Failures:</p>
                              {bulkImportResult.errors.map((err, i) => (
                                <p key={i}>⚠️ {err}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {bulkParsedStudents.length > 0 ? (
                        <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden max-h-56 overflow-y-auto">
                          <table className="w-full text-left border-collapse text-[10px]">
                            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-400 font-bold uppercase sticky top-0 border-b border-slate-200 dark:border-slate-800">
                              <tr>
                                <th className="p-2">Name</th>
                                <th className="p-2">Email</th>
                                <th className="p-2">Password</th>
                                <th className="p-2">Class/Sec/Stream</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans text-slate-650 dark:text-slate-350">
                              {bulkParsedStudents.map((stud, idx) => (
                                <tr key={idx} className={stud.error ? "bg-rose-50/50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400" : "hover:bg-slate-50/50 dark:hover:bg-slate-900/30"}>
                                  <td className="p-2 font-bold">{stud.name}</td>
                                  <td className="p-2 font-mono">{stud.email}</td>
                                  <td className="p-2 font-mono">{stud.password}</td>
                                  <td className="p-2">
                                    <div>
                                      {stud.studentClass ? `${stud.studentClass}` : "No Class"}
                                      {stud.studentSection && ` - ${stud.studentSection}`}
                                      {stud.studentStream && ` (${stud.studentStream})`}
                                    </div>
                                    {stud.error && (
                                      <p className="text-[9px] font-semibold text-rose-500 mt-0.5">{stud.error}</p>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        !bulkImportResult && (
                          <div className="border-2 border-dashed border-slate-150 dark:border-slate-800 rounded-2xl p-6 text-center text-slate-400 dark:text-slate-500 italic min-h-[140px] flex items-center justify-center">
                            No student profiles parsed. Select a CSV template file to preview details.
                          </div>
                        )
                      )}
                    </div>

                    {/* Step 3 action */}
                    {bulkParsedStudents.length > 0 && (
                      <div className="pt-2">
                        {hasBulkErrors && (
                          <p className="text-[10px] text-rose-500 font-bold mb-2 text-center">
                            ⚠️ Cannot import: Please fix the Class, Section, or Stream case-sensitive errors shown in red above.
                          </p>
                        )}
                        <button
                          type="button"
                          disabled={bulkImportLoading || hasBulkErrors}
                          onClick={handleBulkImportSubmit}
                          className={`w-full py-3 text-white font-bold rounded-xl transition text-xs cursor-pointer text-center uppercase tracking-wider shadow-md flex items-center justify-center gap-2 ${
                            hasBulkErrors
                              ? "bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed"
                              : "bg-emerald-600 hover:bg-emerald-500"
                          }`}
                        >
                          {bulkImportLoading ? "Registering Students..." : "Commit Seeding & Import Now"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Student Directory Class/Section/Stream filters */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Filter Class</label>
                <select
                  value={userDirClassFilter}
                  onChange={(e) => setUserDirClassFilter(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none text-slate-850 dark:text-slate-200"
                >
                  <option value="ALL">All Classes (11th, 12th, etc)</option>
                  {availableClasses.map((cls) => (
                    <option key={cls} value={cls}>Class {cls}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Filter Section</label>
                <select
                  value={userDirSectionFilter}
                  onChange={(e) => setUserDirSectionFilter(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none text-slate-850 dark:text-slate-200"
                >
                  <option value="ALL">All Sections (MPC, BIPC, CEC, etc)</option>
                  {availableSections.map((sec) => (
                    <option key={sec} value={sec}>Section {sec}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Filter Stream/Target</label>
                <select
                  value={userDirStreamFilter}
                  onChange={(e) => setUserDirStreamFilter(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none text-slate-850 dark:text-slate-200"
                >
                  <option value="ALL">All Streams (JEE, NEET, EAMCET, etc)</option>
                  {availableStreams.map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* USERS INDEX TABLE CARD */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800/80 overflow-hidden shadow-sm">
              <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/20 flex justify-between items-center">
                <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">Registered Students Index</span>
                <button 
                  onClick={fetchUsers} 
                  className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition text-slate-400 hover:text-slate-650 cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingUsers ? "animate-spin" : ""}`} />
                </button>
              </div>

              {loadingUsers ? (
                <div className="text-center py-16 text-slate-450 dark:text-slate-500 font-mono text-xs">
                  Querying database index keys...
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-center py-16 text-slate-450 dark:text-slate-550 font-mono text-xs">
                  No registered logins found matching search query filters.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 text-[10px] uppercase font-bold text-slate-440 border-b border-slate-200 dark:border-slate-800/80">
                      <tr>
                        <th className="px-6 py-4 font-display">Student Name</th>
                        <th className="px-6 py-4 font-display">Auth Email Anchor</th>
                        <th className="px-6 py-4 text-center font-display">Class / Section</th>
                        <th className="px-6 py-4 text-center font-display">Coins Wallet</th>
                        <th className="px-6 py-4 text-right font-display">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800/80 text-xs font-sans">
                      {filteredUsers.map((u) => {
                        return (
                          <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition">
                            <td className="px-6 py-4 font-bold text-slate-900 dark:text-slate-100 font-display">
                              {u.name}
                            </td>
                            <td className="px-6 py-4 font-mono text-xs text-slate-500 dark:text-slate-400">
                              {u.email}
                            </td>
                            <td className="px-6 py-4 text-center font-sans">
                              {u.studentClass ? (
                                <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 font-semibold text-[10px] rounded text-slate-700 dark:text-slate-300">
                                  Class {u.studentClass}{u.studentSection && ` - ${u.studentSection}`}{u.studentStream && ` (${u.studentStream})`}
                                </span>
                              ) : (
                                <span className="text-slate-450 italic text-[10px]">General</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">
                              🪙 {u.coins || 0}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="inline-flex gap-2">
                                <button
                                  onClick={() => {
                                    setSelectedStudentForGrading(u);
                                    fetchResults(false);
                                  }}
                                  className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/20 rounded-lg transition cursor-pointer"
                                  title="Assess Student Results & Edit Scores"
                                >
                                  <ClipboardList className="w-4 h-4" />
                                </button>

                                <button
                                  onClick={() => openEditModal(u)}
                                  className="p-1.5 text-slate-450 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition cursor-pointer"
                                  title="Edit Student Credentials"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                
                                {u.id !== user.id && (
                                  <button
                                    onClick={() => {
                                      setDeletingUser(u);
                                      setShowDeleteModal(true);
                                    }}
                                    className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-lg transition cursor-pointer"
                                    title="Revoke Student Access"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==========================================
            TAB: SETTINGS
           ========================================== */}
        {activeTab === "SETTINGS" && (
          <div className="max-w-xl mx-auto space-y-8 animate-fade-in text-xs selection-none">
            <div>
              <p className="text-xs text-emerald-600 font-bold uppercase tracking-wider">System Preferences</p>
              <h1 className="text-2xl font-black font-display text-gray-900 dark:text-slate-50 mt-1">Console Settings</h1>
            </div>

            <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-gray-100 dark:border-slate-800/80 space-y-6 shadow-sm">
              <h3 className="text-sm font-bold uppercase font-display tracking-widest text-gray-900 dark:text-slate-100 border-b border-gray-100 dark:border-slate-800 pb-3">
                Profile Information
              </h3>

              <form onSubmit={handleUpdateProfile} className="space-y-4">
                {profileSuccess && (
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-300 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-xs rounded-xl">
                    {profileSuccess}
                  </div>
                )}
                {profileError && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-300 dark:border-rose-900/40 text-rose-700 dark:text-rose-400 text-xs rounded-xl">
                    {profileError}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Full Name</label>
                  <input
                    type="text"
                    required
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="w-full text-sm p-3.5 bg-slate-50 border border-slate-200 focus:border-emerald-500 dark:bg-slate-950 dark:border-slate-800 dark:focus:border-emerald-600 rounded-xl focus:outline-none text-slate-900 dark:text-slate-100 font-sans font-medium"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Email Address Anchor</label>
                  <input
                    type="email"
                    required
                    value={profileEmail}
                    onChange={(e) => setProfileEmail(e.target.value)}
                    className="w-full text-sm p-3.5 bg-slate-50 border border-slate-200 focus:border-emerald-500 dark:bg-slate-950 dark:border-slate-800 dark:focus:border-emerald-600 rounded-xl focus:outline-none text-slate-900 dark:text-slate-100 font-sans font-medium"
                  />
                </div>

                <div className="space-y-1.5 p-4 border border-dashed border-slate-250 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-slate-950/20">
                  <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-2">Change Account Password (Optional)</p>
                  
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase">Current (Old) Password</label>
                      <input
                        type="password"
                        placeholder="Required if changing password"
                        value={profileOldPassword}
                        onChange={(e) => setProfileOldPassword(e.target.value)}
                        className="w-full text-xs p-2.5 bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 rounded-xl focus:outline-none focus:border-emerald-500 text-slate-900 dark:text-slate-100 font-sans"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase">New Password</label>
                        <input
                          type="password"
                          placeholder="New password"
                          value={profileNewPassword}
                          onChange={(e) => setProfileNewPassword(e.target.value)}
                          className="w-full text-xs p-2.5 bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 rounded-xl focus:outline-none focus:border-emerald-500 text-slate-900 dark:text-slate-100 font-sans"
                        />
                      </div>
                      
                      <div className="space-y-1">
                        <label className="text-[9px] font-bold text-slate-400 uppercase">Confirm Password</label>
                        <input
                          type="password"
                          placeholder="Confirm password"
                          value={profileConfirmPassword}
                          onChange={(e) => setProfileConfirmPassword(e.target.value)}
                          className="w-full text-xs p-2.5 bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-800 rounded-xl focus:outline-none focus:border-emerald-500 text-slate-900 dark:text-slate-100 font-sans"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={profileLoading}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition duration-150 cursor-pointer text-xs uppercase tracking-wider active:scale-98 shadow-md"
                >
                  {profileLoading ? "Updating Profile..." : "Update Profile"}
                </button>
              </form>
            </div>

            <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-gray-100 dark:border-slate-800/80 space-y-6 shadow-sm">
              <h3 className="text-sm font-bold uppercase font-display tracking-widest text-gray-900 dark:text-slate-100 border-b border-gray-100 dark:border-slate-800 pb-3">
                Interface Layout Controls
              </h3>

              {/* Theme toggle row */}
              <div className="flex justify-between items-center py-2">
                <div>
                  <p className="font-bold text-gray-900 dark:text-slate-100">Interface Colors Mode</p>
                  <p className="text-[10px] text-gray-400 mt-1">Light and dark mode adjustments</p>
                </div>
                
                <button
                  type="button"
                  onClick={() => setDarkTheme(!darkTheme)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-gray-900 dark:text-slate-100 font-bold rounded-lg cursor-pointer transition select-none text-[11px]"
                >
                  {darkTheme ? "Switch to Light Mode" : "Switch to Dark Mode"}
                </button>
              </div>

              {/* Subject restrictions notification info */}
              <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-gray-100 dark:border-slate-800/80">
                <span className="font-bold text-slate-800 dark:text-slate-200 block mb-1">Architecture Bounds Policy</span>
                <p className="text-gray-500 dark:text-slate-400 leading-normal">
                  Our system aligns strictly with custom database constraints: only 1 subject exists. 
                  Multiple subject directories, teacher-subject mappings, or school class allocations are restricted server-side to guarantee core platform performant stability.
                </p>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* CREATE LOGIN MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in font-sans text-xs">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl space-y-6">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-50 font-display">Create Brand-New Student Login</h3>
              <p className="text-slate-400 dark:text-slate-500 text-xxs mt-1">Provide standard credentials and details to register an active student account.</p>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4 text-left">
              {createError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-300 dark:border-rose-900/40 text-rose-700 dark:text-rose-400 text-xs rounded-xl">
                  {createError}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase block">Account Owner Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. John Doe"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full text-xs p-3 bg-slate-50 border border-slate-200 focus:border-emerald-500 dark:bg-slate-950 dark:border-slate-800 rounded-xl focus:outline-none text-slate-900 dark:text-slate-100 font-sans"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase block">User Email Anchor</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. user@test.com"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  className="w-full text-xs p-3 bg-slate-50 border border-slate-200 focus:border-emerald-500 dark:bg-slate-950 dark:border-slate-800 rounded-xl focus:outline-none text-slate-900 dark:text-slate-100 font-sans"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase block">Initial Access Password</label>
                <input
                  type="password"
                  required
                  placeholder="At least 6 characters"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  className="w-full text-xs p-3 bg-slate-50 border border-slate-200 focus:border-emerald-500 dark:bg-slate-950 dark:border-slate-800 rounded-xl focus:outline-none text-slate-900 dark:text-slate-100 font-sans"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase block">Class</label>
                  <select
                    value={createStudentClass}
                    onChange={(e) => setCreateStudentClass(e.target.value)}
                    className="w-full text-xs p-3 bg-slate-50 border border-slate-200 focus:border-emerald-500 dark:bg-slate-950 dark:border-slate-800 rounded-xl focus:outline-none text-slate-900 dark:text-slate-100 font-sans"
                  >
                    <option value="">-- Class --</option>
                    <option value="11th">11th</option>
                    <option value="12th">12th</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase block">Section</label>
                  <select
                    value={createStudentSection}
                    onChange={(e) => setCreateStudentSection(e.target.value)}
                    className="w-full text-xs p-3 bg-slate-50 border border-slate-200 focus:border-emerald-500 dark:bg-slate-950 dark:border-slate-800 rounded-xl focus:outline-none text-slate-900 dark:text-slate-100 font-sans"
                  >
                    <option value="">-- Section --</option>
                    <option value="MPC">MPC</option>
                    <option value="BIPC">BIPC</option>
                    <option value="CEC">CEC</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase block">Stream/Target</label>
                  <select
                    value={createStudentStream}
                    onChange={(e) => setCreateStudentStream(e.target.value)}
                    className="w-full text-xs p-3 bg-slate-50 border border-slate-200 focus:border-emerald-500 dark:bg-slate-950 dark:border-slate-800 rounded-xl focus:outline-none text-slate-900 dark:text-slate-100 font-sans"
                  >
                    <option value="">-- Stream --</option>
                    <option value="JEE">JEE</option>
                    <option value="NEET">NEET</option>
                    <option value="EAMCET">EAMCET</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 font-bold rounded-xl transition text-xs cursor-pointer text-center uppercase tracking-wider"
                >
                  Dismiss
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition text-xs cursor-pointer text-center uppercase tracking-wider shadow-md"
                >
                  {createLoading ? "Seeding..." : "Assign Login"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT LOGIN MODAL */}
      {showEditModal && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in font-sans text-xs">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl space-y-6">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-50 font-display">Revise Student Account Details</h3>
              <p className="text-slate-400 dark:text-slate-500 text-xxs mt-1">Modify details for registered student accounts. Leave password empty to keep unmodified.</p>
            </div>

            <form onSubmit={handleEditUser} className="space-y-4 text-left">
              {editError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-300 dark:border-rose-900/40 text-rose-700 dark:text-rose-400 text-xs rounded-xl">
                  {editError}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase block">Full Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full text-xs p-3 bg-slate-50 border border-slate-200 focus:border-emerald-500/50 dark:bg-slate-950 dark:border-slate-800 rounded-xl focus:outline-none text-slate-900 dark:text-slate-100 font-sans"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase block">Email Anchor (Sign In ID)</label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full text-xs p-3 bg-slate-50 border border-slate-200 focus:border-emerald-500/50 dark:bg-slate-950 dark:border-slate-800 rounded-xl focus:outline-none text-slate-900 dark:text-slate-100 font-sans"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase block">Override Login Password (Optional)</label>
                <input
                  type="password"
                  placeholder="Leave completely empty to keep current"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  className="w-full text-xs p-3 bg-slate-50 border border-slate-200 focus:border-emerald-500/50 dark:bg-slate-950 dark:border-slate-800 rounded-xl focus:outline-none text-slate-900 dark:text-slate-100 font-sans"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase block">Class</label>
                  <select
                    value={editStudentClass}
                    onChange={(e) => setEditStudentClass(e.target.value)}
                    className="w-full text-xs p-3 bg-slate-50 border border-slate-200 focus:border-emerald-500/50 dark:bg-slate-950 dark:border-slate-800 rounded-xl focus:outline-none text-slate-900 dark:text-slate-100 font-sans"
                  >
                    <option value="">-- Class --</option>
                    <option value="11th">11th</option>
                    <option value="12th">12th</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase block">Section</label>
                  <select
                    value={editStudentSection}
                    onChange={(e) => setEditStudentSection(e.target.value)}
                    className="w-full text-xs p-3 bg-slate-50 border border-slate-200 focus:border-emerald-500/50 dark:bg-slate-950 dark:border-slate-800 rounded-xl focus:outline-none text-slate-900 dark:text-slate-100 font-sans"
                  >
                    <option value="">-- Section --</option>
                    <option value="MPC">MPC</option>
                    <option value="BIPC">BIPC</option>
                    <option value="CEC">CEC</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase block">Stream/Target</label>
                  <select
                    value={editStudentStream}
                    onChange={(e) => setEditStudentStream(e.target.value)}
                    className="w-full text-xs p-3 bg-slate-50 border border-slate-200 focus:border-emerald-500/50 dark:bg-slate-950 dark:border-slate-800 rounded-xl focus:outline-none text-slate-900 dark:text-slate-100 font-sans"
                  >
                    <option value="">-- Stream --</option>
                    <option value="JEE">JEE</option>
                    <option value="NEET">NEET</option>
                    <option value="EAMCET">EAMCET</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl transition text-xs cursor-pointer text-center uppercase tracking-wider"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition text-xs cursor-pointer text-center uppercase tracking-wider shadow-md"
                >
                  {editLoading ? "Rewriting..." : "Update Credentials"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      {showDeleteModal && deletingUser && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in font-sans text-xs">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex p-3 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 rounded-full">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-50 font-display">
                Revoke Credentials / Delete Account?
              </h3>
              <p className="text-slate-400 dark:text-slate-500 text-xxs leading-relaxed text-center">
                You are about to permanently delete <strong className="text-slate-800 dark:text-slate-100">{deletingUser.name}</strong> ({deletingUser.email}).
                This will sever all active telemetry sandboxes, score registries, and delete their access. This action cannot be undone.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeletingUser(null);
                }}
                className="py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 font-bold rounded-xl transition text-xs cursor-pointer text-center uppercase tracking-wider"
              >
                No, Retain
              </button>
              <button
                type="button"
                disabled={deleteLoading}
                onClick={handleDeleteUser}
                className="py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl transition text-xs cursor-pointer text-center uppercase tracking-wider shadow-md"
              >
                {deleteLoading ? "Revoking..." : "Force Deletion"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Elegant Logout Verification Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-fade-in font-sans">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex p-3 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 rounded-full">
                <LogOut className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-50 font-display">
                Confirm Logout
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                Are you sure that you want to logout?
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowLogoutModal(false)}
                className="py-3 bg-slate-100 hover:bg-slate-250 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 font-bold rounded-xl transition text-xs cursor-pointer text-center uppercase tracking-wider selection-none"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl transition text-xs text-center uppercase tracking-wider selection-none flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
              >
                <LogOut className="w-3.5 h-3.5" /> Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM CONFIRM EXAM DELETE MODAL */}
      {deletingExam && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in font-sans text-xs">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex p-3 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 rounded-full">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-50 font-display">
                Confirm Exam Deletion?
              </h3>
              <p className="text-slate-505 dark:text-slate-400 text-xs leading-relaxed text-center">
                Are you absolutely sure you want to delete <strong className="text-slate-800 dark:text-slate-200">{deletingExam.title}</strong>?
              </p>
              <p className="text-rose-600 dark:text-rose-400 text-[11px] font-bold tracking-normal leading-normal select-none">
                CRITICAL ACTION: deleting this exam removes ALL questions, student answers, and results permanently! Proceed?
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingExam(null)}
                className="py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl transition text-xs cursor-pointer text-center uppercase tracking-wider"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteExam}
                className="py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl transition text-xs cursor-pointer text-center uppercase tracking-wider shadow-md font-sans"
              >
                Delete Exam
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM CONFIRM QUESTION DELETE MODAL */}
      {deletingQuestion && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in font-sans text-xs">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex p-3 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 rounded-full">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-50 font-display">
                Delete Question?
              </h3>
              <p className="text-slate-500 dark:text-slate-400 text-xs leading-relaxed text-center">
                Are you sure you want to permanently delete this question from the exam?
              </p>
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 text-left overflow-hidden text-ellipsis max-h-32 overflow-y-auto">
                <p className="font-mono text-[10px] text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{deletingQuestion.questionText}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingQuestion(null)}
                className="py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl transition text-xs cursor-pointer text-center uppercase tracking-wider"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteQuestion}
                className="py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl transition text-xs cursor-pointer text-center uppercase tracking-wider shadow-md"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TEACHER EXAM PREVIEW MODAL */}
      {previewExam && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in font-sans text-xs">
          <div className="bg-white dark:bg-slate-900 w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 md:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl space-y-6">
            
            {/* Header / Top banner */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-gray-100 dark:border-slate-800">
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-400 mb-2">
                  <Eye className="w-3.5 h-3.5" /> Student-View Simulation (Active Preview)
                </span>
                <h3 className="text-xl font-black text-slate-900 dark:text-slate-50 font-display">
                  {previewExam.title}
                </h3>
                <p className="text-gray-400 text-xs mt-1">Subject: {previewExam.subject || "General"}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewExam(null)}
                className="py-2.5 px-5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl transition text-xs cursor-pointer flex items-center gap-1.5 shadow-md self-stretch md:self-auto justify-center"
              >
                <X className="w-4 h-4" /> Close Preview
              </button>
            </div>

            {/* Exam duration & Instructions Box */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 dark:bg-slate-950/50 p-5 rounded-2xl border border-gray-150 dark:border-slate-800">
              <div className="md:col-span-1 space-y-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Assessment Length</span>
                <span className="text-base font-black text-slate-800 dark:text-slate-200 flex items-center gap-1 font-mono">
                  <Clock className="w-4.5 h-4.5 text-emerald-500" /> {previewExam.durationMinutes} min
                </span>
              </div>
              <div className="md:col-span-3 space-y-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Instructions for Students</span>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-sans whitespace-pre-wrap">
                  {previewExam.description || "No customized instructions specified."}
                </p>
              </div>
            </div>

            {/* Loading questions indicator */}
            {loadingPreview ? (
              <div className="py-20 text-center text-sm font-semibold text-gray-500 animate-pulse">
                Fetching compiled question papers...
              </div>
            ) : previewQuestions.length === 0 ? (
              <div className="py-20 text-center text-slate-400 border border-dashed border-gray-200 dark:border-slate-800 rounded-3xl">
                There are no questions configured in this assessment yet. Open <strong>Exam Builder</strong> to populate questions.
              </div>
            ) : (
              <div className="space-y-6">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest pb-2 border-b border-gray-100 dark:border-slate-800">
                  Question Catalog ({previewQuestions.length} Questions)
                </h4>

                <div className="space-y-6 max-h-[45vh] overflow-y-auto pr-3 scrollbar">
                  {previewQuestions.map((q, idx) => (
                    <div key={q.id} className="p-6 bg-white dark:bg-slate-900 border border-gray-150 dark:border-slate-800 rounded-2xl shadow-xs space-y-4">
                      <div className="flex justify-between items-center bg-slate-50 dark:bg-slate-950 py-1.5 px-3 rounded-lg text-[10px] font-bold font-mono">
                        <span className="text-slate-555 dark:text-slate-355">Question {idx + 1} of {previewQuestions.length}</span>
                        <span className="text-indigo-600 dark:text-indigo-400 uppercase tracking-widget">{q.type === "MCQ" ? "MCQ" : "WRITTEN"} Type</span>
                      </div>

                      <h5 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-sans whitespace-pre-wrap leading-relaxed">
                        {q.questionText}
                      </h5>

                      {/* Display MCQ Options if applicable */}
                      {q.type === "MCQ" && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                          {[
                            { key: "A", text: q.optionA },
                            { key: "B", text: q.optionB },
                            { key: "C", text: q.optionC },
                            { key: "D", text: q.optionD }
                          ].map((opt) => (
                            <div 
                              key={opt.key}
                              className={`p-3.5 rounded-xl border border-gray-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 flex items-start gap-3 transition`}
                            >
                              <span className="w-5 h-5 flex items-center justify-center rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-[10px] text-indigo-600 dark:text-indigo-400 font-bold font-mono shrink-0">
                                {opt.key}
                              </span>
                              <span className="text-xs text-slate-700 dark:text-slate-300 font-sans leading-tight">
                                {opt.text || <em className="text-rose-500 font-mono text-[9px] font-bold">Unconfigured label option</em>}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Displays placeholders for short or long answer inputs */}
                      {q.type !== "MCQ" && (
                        <div className="pt-1">
                          <textarea 
                            disabled 
                            placeholder="Type progress assessment or written response here..."
                            className="w-full text-xs p-4 bg-gray-50 border border-gray-200 dark:bg-slate-950 dark:border-slate-800 rounded-xl focus:outline-none placeholder-gray-400 dark:placeholder-slate-600 italic h-24 select-none resize-none"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setPreviewExam(null)}
                className="py-3 px-6 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 hover:text-slate-800 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Exit Simulator
              </button>
            </div>
          </div>
        </div>
      )}
      {/* STUDENT EXAMS ATTEMPTS VIEW AND GRADING MODAL */}
      {selectedStudentForGrading && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in font-sans text-xs">
          <div className="bg-white dark:bg-slate-900 max-w-4xl w-full p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl space-y-6">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-50 font-display">
                  Exam Progress & Grade Corrections Registry
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                  Selected Student: <strong className="text-slate-750 dark:text-slate-300 font-bold">{selectedStudentForGrading.name}</strong> ({selectedStudentForGrading.email})
                </p>
              </div>
              <button 
                onClick={() => {
                  setSelectedStudentForGrading(null);
                  setEditingScoreId(null);
                  setGradingError(null);
                }}
                className="p-2 hover:bg-slate-150 dark:hover:bg-slate-800 rounded-full cursor-pointer text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Attempts List */}
            <div className="space-y-4 max-h-[420px] overflow-y-auto pr-2 scrollbar text-xs">
              {(() => {
                const studentSubmissions = allResults.filter(
                  (r) => r.studentId === selectedStudentForGrading.id
                );
                
                if (studentSubmissions.length === 0) {
                  return (
                    <div className="text-center py-16 text-slate-400">
                      No exam submissions or completions recorded for this student yet.
                    </div>
                  );
                }

                return (
                  <div className="border border-slate-150 dark:border-slate-850 rounded-2xl overflow-hidden shadow-xs">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800 text-[10px] font-bold uppercase text-slate-400 border-b border-slate-150 dark:border-slate-800/80">
                        <tr>
                          <th className="px-6 py-4">Assessment Title</th>
                          <th className="px-6 py-4 text-center">Score Accuracy</th>
                          <th className="px-6 py-4 text-center">Coins Earned</th>
                          <th className="px-6 py-4 text-center">Total Score (pts)</th>
                          <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150 dark:divide-slate-850 text-slate-700 dark:text-slate-300">
                        {studentSubmissions.map((sub) => {
                          const isEditing = editingScoreId === sub.id;
                          return (
                            <tr key={sub.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/15 transition-colors">
                              <td className="px-6 py-4 font-bold text-slate-800 dark:text-slate-200">
                                {sub.examTitle}
                              </td>
                              <td className="px-6 py-4 text-center font-mono font-semibold">
                                {sub.percentage}%
                              </td>
                              <td className="px-6 py-4 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                                🪙 {sub.coinsEarned ?? Math.round(sub.score)}
                              </td>
                              <td className="px-6 py-4 text-center font-mono font-bold text-slate-900 dark:text-slate-100 text-sm">
                                {isEditing ? (
                                  <div className="inline-flex items-center gap-1.5 justify-center">
                                    <input
                                      type="number"
                                      step="1"
                                      min="0"
                                      max={sub.maxScore || 100}
                                      value={editingScoreValue}
                                      onChange={(e) => setEditingScoreValue(e.target.value)}
                                      className="w-16 text-center text-xs p-1 bg-slate-50 border border-slate-300 dark:bg-slate-950 dark:border-slate-800 rounded font-bold focus:outline-none"
                                    />
                                    <span className="text-slate-400 font-normal">/ {sub.maxScore || 10}</span>
                                  </div>
                                ) : (
                                  <span>{sub.score} / {sub.maxScore || 10}</span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-right">
                                {isEditing ? (
                                  <div className="inline-flex gap-2">
                                    <button
                                      disabled={submittingGrade}
                                      onClick={() => handleUpdateMarks(sub.studentId, sub.examId, Number(editingScoreValue))}
                                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[10px] uppercase cursor-pointer transition active:scale-98"
                                    >
                                      {submittingGrade ? "Saving" : "Confirm"}
                                    </button>
                                    <button
                                      onClick={() => setEditingScoreId(null)}
                                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-250 dark:bg-slate-850 text-slate-700 dark:text-slate-300 font-bold rounded-lg text-[10px]"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setEditingScoreId(sub.id);
                                      setEditingScoreValue(sub.score.toString());
                                    }}
                                    className="py-1 px-3.5 bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 font-bold rounded-lg text-[10px] transition cursor-pointer"
                                  >
                                    Correct Marks
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>

            {/* Manual Exam Grade Assign / Override Workspace */}
            <div className="bg-slate-50 dark:bg-slate-950 p-5 rounded-2xl border border-slate-150 dark:border-slate-850/80 space-y-4">
              <h4 className="text-xs font-extrabold text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse"></span>
                Instant Grade Override & Manual Evaluation
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                Need to override a specific student's score, or manually evaluate an exam they haven't submitted yet? 
                Select an assessment from the dropdown, assign custom marks, and submit. The system will automatically compute their correct answer rates, reward coins instantly, and sync the results catalog.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-slate-450 dark:text-slate-400 uppercase tracking-widest mb-1.5 font-mono">
                    Select Assessment
                  </label>
                  <select
                    value={manualGradingExamId}
                    onChange={(e) => setManualGradingExamId(e.target.value)}
                    className="w-full text-xs p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-200 font-semibold"
                  >
                    <option value="">-- Choose Exam --</option>
                    {exams.map((ex) => (
                      <option key={ex.id} value={ex.id}>
                        {ex.title} {ex.subject ? `[${ex.subject}]` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-450 dark:text-slate-400 uppercase tracking-widest mb-1.5 font-mono">
                    Assign Marks (out of 10)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    step="1"
                    placeholder="e.g. 8"
                    value={manualGradingScore}
                    onChange={(e) => setManualGradingScore(e.target.value)}
                    className="w-full text-xs p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans font-bold dark:text-slate-200"
                  />
                </div>

                <div>
                  <button
                    type="button"
                    disabled={submittingGrade || !manualGradingExamId || manualGradingScore === ""}
                    onClick={async () => {
                      await handleUpdateMarks(selectedStudentForGrading.id, manualGradingExamId, Number(manualGradingScore));
                      setManualGradingExamId("");
                      setManualGradingScore("");
                    }}
                    className="w-full py-2.5 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white font-extrabold rounded-xl transition cursor-pointer text-xs disabled:opacity-40 flex items-center justify-center gap-1.5"
                  >
                    {submittingGrade ? "Applying Marks..." : "Overwrite Grade"}
                  </button>
                </div>
              </div>
            </div>

            {gradingError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-905/10 text-rose-500 rounded-xl font-mono text-center">
                Error: {gradingError}
              </div>
            )}

            {/* Modal Footer */}
            <div className="pt-4 border-t border-slate-150 dark:border-slate-850 flex justify-between items-center text-xs text-slate-500">
              <span>* Correcting exam scores updates leaderboard standing coefficients.</span>
              <button 
                onClick={() => {
                  setSelectedStudentForGrading(null);
                  setEditingScoreId(null);
                  setGradingError(null);
                }}
                className="py-2 px-6 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold cursor-pointer text-xs"
              >
                Close Registry
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
