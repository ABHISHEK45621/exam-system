import React, { useState, useEffect } from "react";
import { 
  LayoutDashboard, PlayCircle, History, Trophy, BarChart3, 
  User, LogOut, RefreshCw, Clock, Award, HelpCircle, 
  Check, X, Sparkles, BookOpen, AlertCircle, Sun, Moon
} from "lucide-react";
import { 
  UserProfile, Exam, LeaderboardEntry, ResultSummary, 
  ResultBreakdownItem 
} from "../types";
import { QuestionTextRenderer } from "./QuestionTextRenderer";

interface StudentDashboardProps {
  user: UserProfile;
  token: string;
  onLogout: () => void;
  onStartExam: (examId: string) => void;
  darkTheme: boolean;
  setDarkTheme: (v: boolean) => void;
  onUpdateUser?: (updated: UserProfile) => void;
}

type TabType = "DASHBOARD" | "AVAILABLE_EXAMS" | "HISTORY" | "LEADERBOARD" | "STATISTICS" | "PROFILE" | "ACHIEVEMENTS";

export default function StudentDashboard({ 
  user, token, onLogout, onStartExam, darkTheme, setDarkTheme, onUpdateUser 
}: StudentDashboardProps) {
  // Navigation
  const [activeTab, setActiveTab] = useState<TabType>("DASHBOARD");

  // Two-step verification logout states
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [logoutStep1, setLogoutStep1] = useState(false);
  const [logoutStep2, setLogoutStep2] = useState(false);

  // Leaderboard filters
  const [classFilter, setClassFilter] = useState("All");
  const [sectionFilter, setSectionFilter] = useState("All");
  const [streamFilter, setStreamFilter] = useState("All");

  // Profile update states
  const [profileName, setProfileName] = useState(user.name);
  const [profileEmail, setProfileEmail] = useState(user.email);
  const [profilePassword, setProfilePassword] = useState("");
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // Sync state if user changes externally
  useEffect(() => {
    setProfileName(user.name);
    setProfileEmail(user.email);
    setProfilePassword("");
    setProfileSuccess(null);
    setProfileError(null);
  }, [user]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    setProfileSuccess(null);
    setProfileLoading(true);

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
          password: profilePassword || undefined
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update profile information");
      }
      setProfileSuccess("Profile updated successfully!");
      setProfilePassword("");
      if (onUpdateUser) {
        onUpdateUser(data);
      }
    } catch (err: any) {
      setProfileError(err.message || "An error occurred during update.");
    } finally {
      setProfileLoading(false);
    }
  };

  // Listings data state
  const [availableExams, setAvailableExams] = useState<Exam[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [historyList, setHistoryList] = useState<ResultSummary[]>([]);
  const [studentStats, setStudentStats] = useState<any>(null);

  // Detail View Result item
  const [detailResultExamId, setDetailResultExamId] = useState<string | null>(null);
  const [detailBreakdown, setDetailBreakdown] = useState<{ exam: Exam; result: any; breakdown: ResultBreakdownItem[] } | null>(null);

  // Loaders
  const [loadingExams, setLoadingExams] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Firestore Live Diagnostic Connection States
  const [firebaseOnline, setFirebaseOnline] = useState(true);
  const [checkingFirebase, setCheckingFirebase] = useState(false);

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
      console.log("[EventSource] Student live sync connected.");
      setFirebaseOnline(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === "connected") {
          setFirebaseOnline(payload.online);
        } else if (payload.type === "change") {
          console.log(`[EventSource] Student cabinet received remote DB update for collection "${payload.collection}", triggering silent refresh...`);
          if (payload.collection === "exams" || payload.collection === "questions") {
            fetchAvailableExams?.(true);
          } else if (payload.collection === "results") {
            fetchStudentStatsAndHistory?.(true);
          } else if (payload.collection === "users") {
            fetchLeaderboard?.();
            fetchStudentStatsAndHistory?.(true);
          }
        }
      } catch (err) {
        console.error("[EventSource] Failed to process student real-time payload:", err);
      }
    };

    eventSource.onerror = (err) => {
      console.warn("[EventSource] Student stream disconnected, monitoring local status stats...", err);
      setFirebaseOnline(false);
    };

    return () => {
      eventSource.close();
    };
  }, [token]);

  useEffect(() => {
    fetchGlobalStudentData();
    checkFirebaseStatus();

    // Auto-refresh student cabinet every 3 seconds to pull newly created exams, grade updates, and coins balances
    const interval = setInterval(() => {
      fetchAvailableExams(true);
      fetchLeaderboard();
      fetchStudentStatsAndHistory(true);
    }, 3000);

    return () => clearInterval(interval);
  }, [token]);

  // Auto-refresh detailed report card every 10 seconds if grading is in progress
  useEffect(() => {
    if (!detailResultExamId || !detailBreakdown || !(detailBreakdown as any).gradingInProgress) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/student/exam/${detailResultExamId}/result`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setDetailBreakdown(data);
        }
      } catch (err) {
        console.error("Failed to poll result breakdown status:", err);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [detailResultExamId, detailBreakdown, token]);

  const fetchGlobalStudentData = () => {
    fetchAvailableExams(false);
    fetchLeaderboard();
    fetchStudentStatsAndHistory(false);
  };

  const fetchAvailableExams = async (silent: boolean = false) => {
    try {
      if (!silent) setLoadingExams(true);
      const res = await fetch("/api/exams", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        setAvailableExams(await res.json());
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

  const fetchStudentStatsAndHistory = async (silent: boolean = false) => {
    try {
      if (!silent) {
        setLoadingHistory(true);
        setLoadingStats(true);
      }
      const resStats = await fetch("/api/student/dashboard-stats", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (resStats.ok) {
        const data = await resStats.json();
        setStudentStats(data);
        setHistoryList(data.performanceSummary || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (!silent) {
        setLoadingHistory(false);
        setLoadingStats(false);
      }
    }
  };

  // Detailed examination checking breakdown report
  const handleViewResultDetails = async (examId: string) => {
    setDetailResultExamId(examId);
    setDetailBreakdown(null);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/student/exam/${examId}/result`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDetailBreakdown(data);
      }
    } catch (e) {
      console.error("Failed to load result breakdown", e);
    } finally {
      setLoadingDetail(false);
    }
  };

  const closeDetailedReport = () => {
    setDetailResultExamId(null);
    setDetailBreakdown(null);
  };

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 font-sans transition-colors duration-200">
      
      {/* SIDEBAR NAVIGATION CONTROL */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0 select-none">
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
                Student Panel
              </span>
            </div>
          </div>

          <nav className="p-4 space-y-1">
            {[
              { id: "DASHBOARD", label: "Dashboard", Icon: LayoutDashboard },
              { id: "AVAILABLE_EXAMS", label: "Available Exams", Icon: PlayCircle },
              { id: "HISTORY", label: "History & Results", Icon: History },
              { id: "LEADERBOARD", label: "Leaderboard", Icon: Trophy },
              { id: "ACHIEVEMENTS", label: "Achievements", Icon: Award },
              { id: "STATISTICS", label: "Statistics", Icon: BarChart3 },
              { id: "PROFILE", label: "Profile", Icon: User }
            ].map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => { 
                    setActiveTab(item.id as TabType); 
                    closeDetailedReport();
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition cursor-pointer select-none ${
                    active 
                      ? "bg-blue-600 text-white font-bold shadow-md shadow-blue-600/10" 
                      : "text-slate-400 hover:text-white hover:bg-slate-800"
                  }`}
                >
                  <item.Icon className={`w-4 h-4 ${active ? "text-white" : "text-slate-400"}`} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* User Stats Summary Footer */}
        <div className="p-4 border-t border-slate-800">
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-800/80 flex justify-between items-center mb-4 text-xs font-mono select-none">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-500 leading-none">Coins</p>
              <p className="text-blue-500 font-black text-sm mt-1">🪙 {studentStats?.coinsEarned ?? user.coins}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase font-bold text-slate-500 leading-none">Rank</p>
              <p className="text-white font-black text-sm mt-1">#{studentStats?.currentRank ?? "-"}</p>
            </div>
          </div>

          {/* Sidebar theme quick switch */}
          <button
            type="button"
            onClick={() => setDarkTheme(!darkTheme)}
            className="w-full flex items-center justify-between gap-3 px-4 py-2.5 mb-4 rounded-xl border border-slate-800 hover:bg-slate-800 hover:text-white transition cursor-pointer text-xs font-semibold text-slate-400"
          >
            <div className="flex items-center gap-2">
              {darkTheme ? <Sun className="w-3.5 h-3.5 text-amber-500" /> : <Moon className="w-3.5 h-3.5 text-indigo-400" />}
              <span>{darkTheme ? "Light" : "Dark"} Mode</span>
            </div>
            <span className="text-[9px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-500 font-mono">PREFS</span>
          </button>

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

      {/* CENTER WORKSPACE WINDOW */}
      <main className="flex-1 overflow-y-auto px-8 py-8 scrollbar">
        
        {/* VIEW SEGMENT: DETAILED EVALUATION REPORT */}
        {detailResultExamId && (
          <div className="space-y-8 animate-fade-in text-xs selection-none">
            <button 
              onClick={closeDetailedReport}
              className="flex items-center gap-2 text-xs font-bold text-blue-600 hover:underline cursor-pointer"
            >
              &larr; Exit Report & Return to History
            </button>

            {loadingDetail ? (
              <div className="text-center py-12 text-gray-500">Retrieving NLP checking weights & mapping correctness results...</div>
            ) : detailBreakdown && (detailBreakdown as any).gradingInProgress ? (
              <div className="text-center py-24 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 space-y-6 max-w-md mx-auto shadow-md">
                <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                <div className="space-y-2">
                  <h3 className="text-base font-black text-slate-900 dark:text-slate-100 uppercase tracking-wider font-display">Grading in Progress...</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-sans">
                    Your exam sheet has been submitted successfully and is being graded by our AI evaluator. Your detailed report card will appear here automatically.
                  </p>
                </div>
                <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-4">
                  Auto-refreshing queue status every 10 seconds
                </div>
              </div>
            ) : !detailBreakdown ? (
              <div className="text-center py-12 text-slate-400">Failed to render report breakdown details. Try again.</div>
            ) : (
              <div className="space-y-8 animate-fade-in">
                {detailBreakdown.result?.gradingFailed && (
                  <div className="bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 p-4 rounded-xl text-rose-700 dark:text-rose-400 flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shrink-0"></span>
                    <p className="font-bold text-xs">
                      AI Grading Failed - Please contact your teacher to manually grade this assessment.
                    </p>
                  </div>
                )}
                
                {/* Score Report Header */}
                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800/80 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-sm">
                  <div>
                    <span className="bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                      Evaluation Complete
                    </span>
                    <h2 className="text-lg font-black font-display text-gray-900 dark:text-slate-100 mt-2">
                      {detailBreakdown.exam.title}
                    </h2>
                    <p className="text-gray-400 mt-1 max-w-xl text-[11px] leading-relaxed">
                      {detailBreakdown.exam.description}
                    </p>
                  </div>
                  
                  {/* Score indicators */}
                  <div className="grid grid-cols-3 gap-6 font-mono text-center shrink-0">
                    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-800">
                      <span className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Grade</span>
                      <span className={`text-base font-black ${detailBreakdown.result?.passed ? "text-blue-600" : "text-rose-500"}`}>
                        {detailBreakdown.result?.passed ? "PASS" : "FAIL"}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-800">
                      <span className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Score</span>
                      <span className="text-base font-black text-gray-900 dark:text-slate-100">
                        {detailBreakdown.result?.score}/{detailBreakdown.result?.maxScore}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-800">
                      <span className="text-[9px] uppercase font-bold text-gray-400 block mb-0.5">Coins Balance</span>
                      <span className="text-base font-black text-blue-600 block">
                        🪙 {detailBreakdown.result?.coinsEarned}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Items Question list layout */}
                <div className="space-y-6">
                  <h3 className="font-bold text-gray-900 dark:text-slate-200 text-sm border-b border-slate-100 dark:border-slate-800 pb-3">
                    Question-by-Question Grading Audit Report
                  </h3>

                  {detailBreakdown.breakdown.map((item, idx) => {
                    const hasAnswered = item.studentAnswer && item.studentAnswer.trim().length > 0;
                    
                    return (
                      <div key={item.id} className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800/80 space-y-4 shadow-sm">
                                           {/* Header card indicator */}
                        <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
                          <span className="font-bold text-gray-500 font-mono">
                            Q.{idx + 1} &rarr; <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px] text-gray-600 dark:text-slate-400">{item.type === "MCQ" ? "MCQ" : "WRITTEN"}</span>
                          </span>

                          <span className={`px-2.5 py-1 text-[10px] rounded-md font-bold uppercase flex items-center gap-1 leading-none ${
                            !hasAnswered 
                              ? "bg-slate-100 text-slate-500 dark:bg-slate-800" 
                              : item.isCorrect 
                                ? "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400" 
                                : "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400"
                          }`}>
                            {!hasAnswered ? <X className="w-3.5 h-3.5" /> : item.isCorrect ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                            {!hasAnswered ? "Unanswered" : item.isCorrect ? "Correct" : "Incorrect"}
                          </span>
                        </div>

                        {/* Statement */}
                        <div className="text-gray-900 dark:text-slate-100 font-medium text-sm">
                          <QuestionTextRenderer text={item.questionText || ""} />
                        </div>

                        {/* MCQ choices breakdown */}
                        {item.type === "MCQ" && item.options && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pl-3">
                            {Object.entries(item.options).map(([optKey, optText]) => {
                              const isSelected = item.studentAnswer === optKey;
                              const isCorrectOption = item.correctOption === optKey;
                              
                              let borderCols = "border-slate-100 dark:border-slate-800";
                              if (isCorrectOption) borderCols = "border-blue-500 bg-blue-50/40 dark:bg-blue-950/15 text-blue-800 dark:text-blue-400 font-bold";
                              if (isSelected && !isCorrectOption) borderCols = "border-rose-500 bg-rose-50/40 dark:bg-rose-950/15 text-rose-800 dark:text-rose-400";

                              return (
                                <div key={optKey} className={`flex items-start gap-3 p-3 rounded-xl border text-slate-600 dark:text-slate-300 text-xs ${borderCols}`}>
                                  <span className="font-mono">{optKey}.</span>
                                  <span className="flex-1">{optText}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Text Short-Long analytical correctness matching breakdown */}
                        {item.type !== "MCQ" && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Student Actual input text */}
                            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 space-y-2">
                              <span className="font-bold text-gray-400 uppercase text-[9px] block">Your Answer Input:</span>
                              <p className="text-gray-900 dark:text-slate-200 whitespace-pre-wrap text-[11px] leading-relaxed">
                                {item.studentAnswer || <em className="text-gray-400">Question left blank</em>}
                              </p>
                            </div>

                            {/* Reference system model solution evaluation targets */}
                            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 space-y-3">
                              <span className="font-bold text-gray-400 uppercase text-[9px] block">System Model Reference:</span>
                              <p className="text-gray-900 dark:text-slate-200 whitespace-pre-wrap text-[11px] leading-relaxed">
                                {item.modelAnswer}
                              </p>

                              {/* Evaluation metrics row */}
                              {hasAnswered && (
                                <div className="grid grid-cols-2 gap-3 pt-2 text-[10px] font-mono border-t border-slate-200 dark:border-slate-800">
                                  <div className="flex flex-col">
                                    <span className="text-gray-400 uppercase">Concept Grade</span>
                                    <span className={`text-xs font-bold mt-0.5 ${item.scores.keywordPercent >= 50 ? "text-blue-600 dark:text-blue-400" : "text-rose-600 dark:text-rose-400"}`}>
                                      {item.scores.keywordPercent}% (Requires &ge; 50%)
                                    </span>
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-gray-400 uppercase">Evaluation Model</span>
                                    <span className="text-xs font-bold mt-0.5 text-slate-500">
                                      System Engine
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Tutor Feedback row */}
                        {item.feedback && (
                          <div className="p-4 rounded-xl bg-blue-50/40 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40 space-y-1">
                            <span className="font-bold text-blue-600 dark:text-blue-400 uppercase text-[9px] block">Tutor Feedback:</span>
                            <p className="text-gray-700 dark:text-slate-300 text-xs leading-relaxed whitespace-pre-wrap">{item.feedback}</p>
                          </div>
                        )}

                      </div>
                    );
                  })}
                </div>

              </div>
            )}
          </div>
        )}

        {/* VIEW SEGMENT: DEFAULT PORTALS */}
        {!detailResultExamId && (
          <div className="space-y-8 animate-fade-in text-xs">
            
            {/* Header Area */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <div>
                <p className="text-xs text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider">Evaluation terminal</p>
                <h1 className="text-2xl font-black font-display text-gray-900 dark:text-slate-100 mt-1">Student Dashboard</h1>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg select-none text-[10px] font-bold text-slate-600 dark:text-slate-400">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                  <span>ACTIVE</span>
                </div>
                <button
                  type="button"
                  onClick={() => setDarkTheme(!darkTheme)}
                  className="p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition text-slate-500 dark:text-slate-400 cursor-pointer text-xs flex items-center justify-center gap-1.5 font-bold shadow-xs bg-slate-50 dark:bg-slate-900"
                  aria-label="Toggle Theme"
                >
                  {darkTheme ? <Sun className="w-3.5 h-3.5 text-amber-500" /> : <Moon className="w-3.5 h-3.5 text-indigo-600" />}
                  <span>{darkTheme ? "Light" : "Dark"} Mode</span>
                </button>
              </div>
            </div>

            {/* Metrics cards row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 select-none font-mono text-center">
              {[
                { label: "Coins Balance", value: `🪙 ${studentStats?.coinsEarned ?? user.coins}`, desc: "Earned from question coin rewards" },
                { label: "Core Global Rank", value: `#${studentStats?.currentRank ?? "-"}`, desc: "Update dynamically on sync" },
                { label: "Attempted Sessions", value: studentStats?.examsAttempted ?? 0, desc: "Completed examinations" },
                { label: "Assessed Subjects", value: `${new Set(availableExams.map(e => e.subject || "General")).size || 1} Subject(s)`, desc: "Categorized under unique subjects" }
              ].map((card, i) => (
                <div key={i} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <p className="text-[9px] uppercase font-bold text-gray-400">{card.label}</p>
                  <p className="text-2xl font-black text-gray-900 dark:text-slate-100 mt-2">{card.value}</p>
                  <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-1.5">{card.desc}</p>
                </div>
              ))}
            </div>

            {/* ==========================================
                TAB CONTENT SPECIFIC SEGMENTS
               ====================================== */}
            {activeTab === "DASHBOARD" && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Left side: Personalized Analytics, Recommendations, Achievements */}
                <div className="lg:col-span-2 space-y-8">
                  {/* Greeting & Quick Action Hero Block */}
                  <div className="bg-gradient-to-r from-blue-600 to-indigo-700 dark:from-blue-950 dark:to-slate-900 p-6 rounded-3xl text-white shadow-md relative overflow-hidden">
                    <div className="absolute right-0 bottom-0 top-0 opacity-10 flex items-center justify-center p-6">
                      <Sparkles className="w-48 h-48 rotate-12" />
                    </div>
                    <div className="relative z-10 space-y-3">
                      <span className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                        Personal Study Portal
                      </span>
                      <h2 className="text-xl md:text-2xl font-black font-display tracking-tight">
                        Welcome back, {user.name}!
                      </h2>
                      <p className="text-blue-100 dark:text-blue-200 text-xs max-w-xl leading-relaxed font-medium">
                        Your assessment desk is fully loaded. Check available exams under the dedicated catalog to challenge yourself and accumulate student score coins!
                      </p>
                      
                      <div className="pt-2 flex items-center gap-3">
                        <button
                          onClick={() => setActiveTab("AVAILABLE_EXAMS")}
                          className="py-2.5 px-5 bg-white hover:bg-slate-100 text-blue-700 dark:text-slate-900 font-bold rounded-xl text-xs transition duration-150 shadow-sm cursor-pointer"
                        >
                          Explore Available Exams ({availableExams.length})
                        </button>
                        <button
                          onClick={() => setActiveTab("LEADERBOARD")}
                          className="py-2.5 px-4 bg-transparent hover:bg-white/10 border border-white/30 text-white font-bold rounded-xl text-xs transition duration-150 cursor-pointer"
                        >
                          View Leaderboard
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Recent Achievements */}
                  <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                    <div className="border-b border-slate-200 dark:border-slate-800 pb-3 flex justify-between items-center select-none">
                      <h3 className="font-bold text-sm tracking-wide text-gray-900 dark:text-slate-100 flex items-center gap-1.5 uppercase font-display">
                        <Award className="w-4 h-4 text-amber-500 animate-bounce" /> Recent Unlocked Achievements
                      </h3>
                      <button
                        onClick={() => setActiveTab("ACHIEVEMENTS")}
                        className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        View All Achievements &rarr;
                      </button>
                    </div>

                    {(() => {
                      const scoreCoins = studentStats?.coinsEarned ?? user.coins;
                      const examsDone = studentStats?.examsAttempted ?? 0;
                      const perfectScored = historyList.some(r => r.score === r.maxScore && r.maxScore > 0);
                      const totalCheats = historyList.reduce((sum, r) => sum + (r.tabSwitchCount || 0) + (r.windowBlurCount || 0), 0);
                      const zeroCheats = examsDone > 0 && totalCheats === 0;

                      const achievementsList = [
                        {
                          id: "first_ascent",
                          title: "First Steps",
                          desc: "Complete your first exam attempt.",
                          unlocked: examsDone > 0,
                          icon: <Trophy className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
                          bg: "bg-amber-50 dark:bg-amber-950/20",
                          border: "border-amber-200 dark:border-amber-900/40"
                        },
                        {
                          id: "coin_collector",
                          title: "Coin Collector",
                          desc: "Earn 10+ coins from exam answers.",
                          unlocked: scoreCoins >= 10,
                          icon: <Sparkles className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />,
                          bg: "bg-emerald-50 dark:bg-emerald-950/20",
                          border: "border-emerald-200 dark:border-emerald-900/40"
                        },
                        {
                          id: "hoarder_of_coins",
                          title: "Hoarder of Coins",
                          desc: "Amass a wealth of 30+ score coins.",
                          unlocked: scoreCoins >= 30,
                          icon: <Award className="w-5 h-5 text-purple-600 dark:text-purple-400" />,
                          bg: "bg-purple-50 dark:bg-purple-950/20",
                          border: "border-purple-200 dark:border-purple-900/40"
                        },
                        {
                          id: "elite_scholar",
                          title: "Elite Scholar",
                          desc: "Achieve a perfect 100% score.",
                          unlocked: perfectScored,
                          icon: <BookOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />,
                          bg: "bg-blue-50 dark:bg-blue-950/20",
                          border: "border-blue-200 dark:border-blue-900/40"
                        }
                      ];

                      const unlocked = achievementsList.filter(a => a.unlocked);

                      if (unlocked.length === 0) {
                        return (
                          <div className="py-8 text-center text-slate-400 dark:text-slate-500 flex flex-col items-center justify-center space-y-2">
                            <Award className="w-8 h-8 opacity-40 text-slate-400" />
                            <div>
                              <p className="font-bold text-xs">No Achievements Unlocked Yet</p>
                              <p className="text-[10px] mt-0.5 max-w-xs mx-auto leading-relaxed">Challenge yourself with an exam and earn coins to unlock your first academic milestone badge!</p>
                            </div>
                          </div>
                        );
                      }

                      // Only show top 2-3 most recent ones
                      return (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {unlocked.slice(0, 2).map((ach) => (
                            <div key={ach.id} className={`p-4 rounded-2xl border ${ach.bg} ${ach.border} flex items-center gap-3.5 transition hover:scale-[1.01] duration-150`}>
                              <div className="p-2.5 rounded-full bg-white dark:bg-slate-900 shadow-xs border border-slate-100 dark:border-slate-800">
                                {ach.icon}
                              </div>
                              <div>
                                <h4 className="font-bold text-slate-800 dark:text-slate-200 text-xs">{ach.title}</h4>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-normal">{ach.desc}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Right Segment: Performance Summary History Widget */}
                <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                  <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
                    <h3 className="font-bold text-sm tracking-wide text-gray-900 dark:text-slate-100 flex items-center gap-1.5 uppercase font-display">
                      <History className="w-4 h-4 text-blue-500" /> Recent Exam Results
                    </h3>
                  </div>

                  <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2 scrollbar text-[11px]">
                    {loadingHistory ? (
                      <div className="text-center py-6 text-slate-500">Retrieving scores summary cards...</div>
                    ) : historyList.length === 0 ? (
                      <div className="text-center py-12 text-slate-400">No active attempts recorded yet. Launch your first exam from the catalog!</div>
                    ) : (
                      historyList.map((res) => (
                        <div key={res.id} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-800 flex justify-between items-center animate-fade-in">
                          <div className="min-w-0 flex-1 pr-4">
                            <span className="font-bold text-slate-800 dark:text-slate-200 block truncate">{res.examTitle}</span>
                            <span className="text-slate-400 mt-0.5 block font-mono text-[10px]">{new Date(res.submittedAt).toLocaleDateString()}</span>
                          </div>
                          
                          <div className="text-right shrink-0">
                            {res.gradingInProgress ? (
                              <span className="text-[10px] text-amber-500 font-bold flex items-center gap-1 justify-end leading-none mb-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                Grading...
                              </span>
                            ) : (
                              <span className={`font-mono font-bold block text-xs ${res.passed ? "text-emerald-600" : "text-rose-500"}`}>
                                {res.score}/{res.maxScore}
                              </span>
                            )}
                            <button
                              onClick={() => handleViewResultDetails(res.examId || res.id)}
                              className="text-[10px] text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer"
                            >
                              {res.gradingInProgress ? "View Queue" : "Check Details"}
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>
            )}

            {/* TAB: AVAILABLE_EXAMS */}
            {activeTab === "AVAILABLE_EXAMS" && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden select-none">
                <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 font-bold text-gray-800 dark:text-slate-200 text-sm">
                  Available Published Examinations
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loadingExams ? (
                    <div className="p-12 text-center text-slate-500">Retrieving published roster bounds...</div>
                  ) : availableExams.length === 0 ? (
                    <div className="p-12 text-center text-slate-400">There are no published exam sessions available inside this system. Check back later!</div>
                  ) : (
                    [...availableExams]
                      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
                      .map((exam) => (
                        <div key={exam.id} className="p-6 flex justify-between items-center gap-6">
                        <div className="min-w-0 flex-1">
                          <h3 className="text-sm font-bold text-gray-900 dark:text-slate-100 truncate">{exam.title}</h3>
                          <p className="text-gray-400 text-[11px] mt-1 max-w-2xl">{exam.description}</p>
                          <span className="text-gray-400 font-semibold font-mono text-[10px] mt-2 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" /> Allocated Duration: {exam.durationMinutes} Minutes
                          </span>
                        </div>
                        
                        <div className="shrink-0">
                          <button
                            onClick={() => onStartExam(exam.id)}
                            className="py-2.5 px-5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition cursor-pointer"
                          >
                            Launch Secure Exam View
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* TAB: HISTORY */}
            {activeTab === "HISTORY" && (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden select-none">
                <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 font-bold text-gray-800 dark:text-slate-200 text-sm">
                  Active Grading Attempts
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-[11px]">
                  {loadingHistory ? (
                    <div className="p-12 text-center text-slate-500">Fetching scoring history indexes...</div>
                  ) : historyList.length === 0 ? (
                    <div className="p-12 text-center text-slate-400">There are no completed records found. Complete an exam session to view results!</div>
                  ) : (
                    historyList.map((res) => (
                      <div key={res.id} className="p-6 flex justify-between items-center gap-6 animate-fade-in">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-bold text-gray-900 dark:text-slate-100">{res.examTitle}</h3>
                          <p className="text-gray-400 font-semibold font-mono text-[10px] mt-1 flex items-center gap-1.5 text-xxs">
                            Attempted on: {new Date(res.submittedAt).toLocaleDateString()} {new Date(res.submittedAt).toLocaleTimeString()}
                          </p>
                        </div>
                        
                        <div className="text-right shrink-0 space-y-1 bg-slate-50 dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800/80 min-w-[120px]">
                          {res.gradingInProgress ? (
                            <>
                              <span className="text-[10px] text-amber-500 font-bold block flex items-center gap-1 justify-end leading-none">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                Grading...
                              </span>
                              <span className="text-[8px] uppercase font-bold text-slate-400 block tracking-wider mt-1 text-right">In Queue</span>
                              <button
                                onClick={() => handleViewResultDetails(res.examId || res.id)}
                                className="text-[10px] text-blue-600 font-bold hover:underline block text-right w-full cursor-pointer mt-1"
                              >
                                View Queue Status
                              </button>
                            </>
                          ) : res.gradingFailed ? (
                            <>
                              <span className="font-mono font-bold block text-sm text-rose-500 leading-none">
                                0/{res.maxScore}
                              </span>
                              <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase text-center block bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-400">
                                Failed
                              </span>
                              <button
                                onClick={() => handleViewResultDetails(res.examId || res.id)}
                                className="text-[10px] text-blue-600 font-bold hover:underline block text-right w-full cursor-pointer mt-1"
                              >
                                View Failure Report
                              </button>
                            </>
                          ) : (
                            <>
                              <span className={`font-mono font-bold block text-sm ${res.passed ? "text-blue-600" : "text-rose-500"}`}>
                                {res.score}/{res.maxScore} ({res.percentage}%)
                              </span>
                              <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase text-center block ${
                                res.passed 
                                  ? "bg-blue-50 text-blue-800 dark:bg-blue-950/40" 
                                  : "bg-rose-100 text-rose-800 dark:bg-rose-950/40"
                              }`}>
                                {res.passed ? "Passed" : "Failed"}
                              </span>
                              <button
                                onClick={() => handleViewResultDetails(res.examId || res.id)}
                                className="text-[10px] text-blue-600 font-bold hover:underline lg:block text-right w-full cursor-pointer mt-1"
                              >
                                Detailed Report Card
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* TAB: LEADERBOARD */}
            {activeTab === "LEADERBOARD" && (() => {
              const filteredLeaderboard = leaderboard.filter((entry) => {
                if (classFilter !== "All" && entry.studentClass !== classFilter) return false;
                if (sectionFilter !== "All" && entry.studentSection !== sectionFilter) return false;
                if (streamFilter !== "All" && entry.studentStream !== streamFilter) return false;
                return true;
              });

              // Re-rank dynamically based on filtered list
              const sortedAndRankedLeaderboard = [...filteredLeaderboard].map((entry, idx) => ({
                ...entry,
                rank: idx + 1
              }));

              return (
                <div className="space-y-8 select-none">
                  {/* Leaderboard Filters Bar */}
                  <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-xs flex flex-col md:flex-row gap-3">
                    <div className="flex-1">
                      <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-1">Filter Class</label>
                      <select
                        value={classFilter}
                        onChange={(e) => setClassFilter(e.target.value)}
                        className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none"
                      >
                        <option value="All">All Classes (11th & 12th)</option>
                        <option value="11th">11th Class</option>
                        <option value="12th">12th Class</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-1">Filter Section</label>
                      <select
                        value={sectionFilter}
                        onChange={(e) => {
                          setSectionFilter(e.target.value);
                          setStreamFilter("All");
                        }}
                        className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none"
                      >
                        <option value="All">All Sections (MPC, BIPC, CEC)</option>
                        <option value="MPC">MPC</option>
                        <option value="BIPC">BIPC</option>
                        <option value="CEC">CEC</option>
                      </select>
                    </div>
                    {(sectionFilter === "MPC" || sectionFilter === "BIPC" || sectionFilter === "All") && (
                      <div className="flex-1">
                        <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase block mb-1">Filter Stream</label>
                        <select
                          value={streamFilter}
                          onChange={(e) => setStreamFilter(e.target.value)}
                          className="w-full text-xs p-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-200 focus:outline-none"
                        >
                          <option value="All">All Streams</option>
                          {sectionFilter === "MPC" && (
                            <>
                              <option value="JEE">JEE</option>
                              <option value="EAMCET">EAMCET</option>
                            </>
                          )}
                          {sectionFilter === "BIPC" && (
                            <>
                              <option value="NEET">NEET</option>
                              <option value="EAMCET">EAMCET</option>
                            </>
                          )}
                          {sectionFilter === "All" && (
                            <>
                              <option value="JEE">JEE (MPC)</option>
                              <option value="NEET">NEET (BIPC)</option>
                              <option value="EAMCET">EAMCET (MPC/BIPC)</option>
                            </>
                          )}
                        </select>
                      </div>
                    )}
                  </div>
                
                {/* Visual Top 3 podium header */}
                {sortedAndRankedLeaderboard.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    
                    {/* 2nd Place Card */}
                    {sortedAndRankedLeaderboard[1] && (
                      <div className="bg-gradient-to-b from-slate-100 to-white dark:from-slate-800/40 dark:to-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-3xl p-6 flex flex-col items-center justify-center text-center relative order-2 md:order-1 mt-0 md:mt-8 shadow-xs">
                        <div className="absolute top-4 left-4 bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border border-slate-300 dark:border-slate-700">2</div>
                        <div className="w-14 h-14 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 rounded-full flex items-center justify-center text-xl font-bold border-4 border-slate-300 dark:border-slate-700 shadow-md">
                          🥈
                        </div>
                        <h4 className="font-extrabold text-sm text-slate-800 dark:text-slate-100 mt-4 leading-tight">{sortedAndRankedLeaderboard[1].studentName}</h4>
                        <p className="text-[10px] text-slate-400 uppercase font-mono tracking-wider font-semibold mt-1">Silver Runner</p>
                        {sortedAndRankedLeaderboard[1].studentClass && (
                          <span className="mt-1 text-[9px] font-bold bg-slate-200/50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-full uppercase">
                            {sortedAndRankedLeaderboard[1].studentClass} {sortedAndRankedLeaderboard[1].studentSection} {sortedAndRankedLeaderboard[1].studentStream && `(${sortedAndRankedLeaderboard[1].studentStream})`}
                          </span>
                        )}
                        
                        <div className="mt-4 flex flex-col items-center bg-slate-50 dark:bg-slate-950/40 px-4 py-2 rounded-xl border border-slate-100 dark:border-slate-800/60 w-full">
                          <span className="text-sm font-black text-blue-600 dark:text-blue-400 font-mono">🪙 {sortedAndRankedLeaderboard[1].totalCoins} Coins</span>
                          <span className="text-[10px] text-slate-400 mt-0.5 font-mono">Accuracy: {sortedAndRankedLeaderboard[1].averagePercentage}%</span>
                        </div>
                      </div>
                    )}

                    {/* 1st Place Card - Main Focus */}
                    {sortedAndRankedLeaderboard[0] && (
                      <div className="bg-gradient-to-b from-amber-50 to-white dark:from-amber-950/25 dark:to-slate-900 border-2 border-amber-300 dark:border-amber-800/50 rounded-3xl p-8 flex flex-col items-center justify-center text-center relative order-1 md:order-2 shadow-sm shadow-amber-500/5 hover:scale-[1.01] transition-all duration-300">
                        <div className="absolute top-4 left-4 bg-amber-500 text-white w-7 h-7 rounded-full flex items-center justify-center text-xs font-black border-2 border-white dark:border-slate-900 shadow-md">1</div>
                        <div className="w-18 h-18 bg-amber-100 text-amber-600 dark:bg-amber-900/30 rounded-full flex items-center justify-center text-2xl font-bold border-4 border-amber-400 dark:border-amber-700/60 shadow-md">
                          👑
                        </div>
                        <h4 className="font-black text-base text-slate-900 dark:text-slate-100 mt-4 leading-tight">{sortedAndRankedLeaderboard[0].studentName}</h4>
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 uppercase font-mono tracking-widest font-extrabold mt-1">Grand Champion</p>
                        {sortedAndRankedLeaderboard[0].studentClass && (
                          <span className="mt-1 text-[9px] font-bold bg-amber-100/40 dark:bg-amber-950/30 text-amber-700 dark:text-amber-450 px-2 py-0.5 rounded-full uppercase">
                            {sortedAndRankedLeaderboard[0].studentClass} {sortedAndRankedLeaderboard[0].studentSection} {sortedAndRankedLeaderboard[0].studentStream && `(${sortedAndRankedLeaderboard[0].studentStream})`}
                          </span>
                        )}
                        
                        <div className="mt-5 flex flex-col items-center bg-amber-500/5 dark:bg-amber-500/10 px-6 py-2.5 rounded-2xl border border-amber-500/10 w-full">
                          <span className="text-base font-black text-amber-600 dark:text-amber-450 font-mono">🪙 {sortedAndRankedLeaderboard[0].totalCoins} Coins</span>
                          <span className="text-[10px] text-slate-400 mt-0.5 font-mono">Accuracy: {sortedAndRankedLeaderboard[0].averagePercentage}%</span>
                        </div>
                      </div>
                    )}

                    {/* 3rd Place Card */}
                    {sortedAndRankedLeaderboard[2] && (
                      <div className="bg-gradient-to-b from-amber-50/10 to-white dark:from-amber-950/5 dark:to-slate-900 border border-amber-600/10 dark:border-amber-900/10 rounded-3xl p-6 flex flex-col items-center justify-center text-center relative order-3 mt-0 md:mt-8 shadow-xs">
                        <div className="absolute top-4 left-4 bg-amber-700/15 text-amber-700 dark:text-amber-450 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border border-slate-300 dark:border-slate-750">3</div>
                        <div className="w-14 h-14 bg-amber-600/5 text-amber-705 dark:bg-amber-900/20 rounded-full flex items-center justify-center text-xl font-bold border-4 border-amber-600/20 dark:border-amber-900/20 shadow-md">
                          🥉
                        </div>
                        <h4 className="font-extrabold text-sm text-slate-800 dark:text-slate-100 mt-4 leading-tight">{sortedAndRankedLeaderboard[2].studentName}</h4>
                        <p className="text-[10px] text-slate-400 uppercase font-mono tracking-wider font-semibold mt-1">Bronze Scholar</p>
                        {sortedAndRankedLeaderboard[2].studentClass && (
                          <span className="mt-1 text-[9px] font-bold bg-amber-600/10 text-amber-700 border-amber-600/30 dark:bg-amber-700/20 dark:text-amber-450 px-2 py-0.5 rounded-full uppercase">
                            {sortedAndRankedLeaderboard[2].studentClass} {sortedAndRankedLeaderboard[2].studentSection} {sortedAndRankedLeaderboard[2].studentStream && `(${sortedAndRankedLeaderboard[2].studentStream})`}
                          </span>
                        )}
                        
                        <div className="mt-4 flex flex-col items-center bg-slate-50 dark:bg-slate-950/40 px-4 py-2 rounded-xl border border-slate-100 dark:border-slate-800/60 w-full">
                          <span className="text-sm font-black text-blue-600 dark:text-blue-400 font-mono">🪙 {sortedAndRankedLeaderboard[2].totalCoins} Coins</span>
                          <span className="text-[10px] text-slate-400 mt-0.5 font-mono">Accuracy: {sortedAndRankedLeaderboard[2].averagePercentage}%</span>
                        </div>
                      </div>
                    )}

                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 rounded-2xl">
                    No student records found matching this class/section filter.
                  </div>
                )}

                {/* Main Table for Standing List */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                  <div className="px-6 py-4.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex justify-between items-center">
                    <span className="font-bold text-gray-800 dark:text-slate-200 text-sm">Active Standings Leaderboard</span>
                    <button onClick={fetchLeaderboard} className="p-1.5 hover:bg-gray-100 dark:hover:bg-slate-850 rounded-lg transition text-slate-400 hover:text-slate-600 cursor-pointer">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="overflow-x-auto text-[11px]">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800 text-[10px] uppercase font-bold text-slate-400 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="px-6 py-4 text-center w-16">Rank</th>
                          <th className="px-6 py-4">Student Name</th>
                          <th className="px-6 py-4 text-center">Class / Section</th>
                          <th className="px-6 py-4 text-center">Exams Attempted</th>
                          <th className="px-6 py-4 text-center">Coins Balance</th>
                          <th className="px-6 py-4 text-center">Average Accuracy</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150 dark:divide-slate-800">
                        {sortedAndRankedLeaderboard.map((student, idx) => {
                          const isTop3 = idx < 3;
                          const isSelf = student.studentId === user.id;
                          const badgeCols = [
                            "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-450",
                            "bg-slate-200 text-slate-800 border-slate-300 dark:bg-slate-800/40 dark:text-slate-400",
                            "bg-amber-600/10 text-amber-700 border-amber-600/30 dark:bg-amber-700/20 dark:text-amber-400"
                          ];

                          return (
                            <tr key={student.studentId} className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/25 transition-all ${
                              isSelf ? "bg-blue-500/5 dark:bg-blue-950/10 font-bold" : ""
                            }`}>
                              <td className="px-6 py-4.5 font-mono font-bold text-center">
                                {isTop3 ? (
                                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full border text-xs font-black ${badgeCols[idx]}`}>
                                    {student.rank}
                                  </span>
                                ) : (
                                  <span className="text-slate-450">{student.rank}</span>
                                )}
                              </td>
                              <td className="px-6 py-4.5 text-slate-800 dark:text-slate-100 font-sans text-xs">
                                <span className={isSelf ? "font-bold text-blue-600 dark:text-blue-400" : ""}>
                                  {student.studentName}
                                </span>
                                {isSelf && <span className="ml-2 px-1.5 py-0.5 rounded text-[8px] uppercase bg-blue-600 text-white font-black font-sans tracking-wide">You</span>}
                              </td>
                              <td className="px-6 py-4.5 text-center text-slate-600 dark:text-slate-400 font-sans">
                                {student.studentClass ? (
                                  <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 font-semibold text-[10px] rounded">
                                    {student.studentClass} - {student.studentSection} {student.studentStream && `(${student.studentStream})`}
                                  </span>
                                ) : (
                                  <span className="text-slate-450 italic text-[10px]">General</span>
                                )}
                              </td>
                              <td className="px-6 py-4.5 font-mono text-center text-slate-500 dark:text-slate-400">{student.examsAttempted}</td>
                              <td className="px-6 py-4.5 font-mono font-bold text-center text-blue-600 dark:text-blue-400 text-sm">
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
            ) })()}

            {/* TAB: STATISTICS */}
            {activeTab === "STATISTICS" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 select-none">
                  
                  {/* Detailed Performance metrics list */}
                  <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                    <h3 className="font-bold uppercase font-display text-xs tracking-wide text-gray-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-3">
                      Core Academic Statistics
                    </h3>

                    <div className="space-y-4 font-mono text-xxs font-bold text-gray-400 lowercase">
                      <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                        <span className="uppercase">Global Scores rank</span>
                        <span className="text-gray-900 dark:text-slate-100">#{studentStats?.currentRank ?? "-"}</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                        <span className="uppercase">Completed examine attempts</span>
                        <span className="text-gray-900 dark:text-slate-100">{studentStats?.examsAttempted ?? 0} Attempts</span>
                      </div>
                      <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                        <span className="uppercase">Caches coins balance</span>
                        <span className="text-blue-600 font-extrabold">🪙 {studentStats?.coinsEarned ?? user.coins} Coins</span>
                      </div>
                      <div className="flex justify-between py-2">
                        <span className="uppercase">Subjects Assessed</span>
                        <span className="text-gray-900 dark:text-slate-100 font-sans">
                          {Array.from(new Set(availableExams.map(e => e.subject || "General"))).join(", ") || "General"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Achievements cards widgets */}
                  <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                    <h3 className="font-bold uppercase font-display text-xs tracking-wide text-gray-900 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-3">
                      Milestone Accomplishments
                    </h3>

                    <div className="space-y-3 shrink-0">
                      {[
                        { title: "First Ascent", desc: "Initiate secure fullscreen assessment session.", unlock: (studentStats?.examsAttempted ?? 0) > 0 },
                        { title: "Hoarder of Coins", desc: "Obtain standard wallet threshold score above 30 coins.", unlock: (studentStats?.coinsEarned ?? 0) >= 30 },
                        { title: "Honor Roll Compliance", desc: "Maintain zero focus-blur cheats across attempts.", unlock: true }
                      ].map((item, id) => (
                        <div key={id} className={`p-3 rounded-xl border flex gap-3 transition ${
                          item.unlock 
                            ? "bg-slate-50 border-slate-100 dark:bg-slate-800 dark:border-slate-800 opacity-100" 
                            : "bg-slate-50 bg-opacity-40 border-dashed border-slate-200 opacity-40 select-none"
                        }`}>
                          <Award className={`w-8 h-8 shrink-0 mt-0.5 ${item.unlock ? "text-blue-500" : "text-gray-300"}`} />
                          <div>
                            <span className="font-bold text-slate-800 dark:text-slate-200 block text-[11px] leading-tight">{item.title}</span>
                            <span className="text-[10px] text-gray-400 mt-1 leading-normal block">{item.desc}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* TAB: ACHIEVEMENTS */}
            {activeTab === "ACHIEVEMENTS" && (
              <div className="space-y-6">
                {(() => {
                  const scoreCoins = studentStats?.coinsEarned ?? user.coins;
                  const examsDone = studentStats?.examsAttempted ?? 0;
                  const perfectScored = historyList.some(r => r.score === r.maxScore && r.maxScore > 0);
                  const totalCheats = historyList.reduce((sum, r) => sum + (r.tabSwitchCount || 0) + (r.windowBlurCount || 0), 0);
                  const zeroCheats = examsDone > 0 && totalCheats === 0;

                  const allAchievements = [
                    {
                      id: "first_ascent",
                      title: "First Steps",
                      desc: "Submit your first exam and cross the starting line of evaluation.",
                      unlocked: examsDone > 0,
                      icon: <Trophy className="w-8 h-8 text-amber-500" />,
                      category: "Standard Milestones",
                      badgeName: "Starting Line",
                      color: "amber"
                    },
                    {
                      id: "coin_collector",
                      title: "Coin Collector",
                      desc: "Amass a balance of 10 or more score coins from correct written or MCQ answers.",
                      unlocked: scoreCoins >= 10,
                      icon: <Sparkles className="w-8 h-8 text-emerald-500" />,
                      category: "Coin Accumulator",
                      badgeName: "Bronze Vault",
                      color: "emerald"
                    },
                    {
                      id: "hoarder_of_coins",
                      title: "Hoarder of Coins",
                      desc: "Reach the ultimate threshold of 30 or more earned score coins.",
                      unlocked: scoreCoins >= 30,
                      icon: <Award className="w-8 h-8 text-purple-500" />,
                      category: "Coin Accumulator",
                      badgeName: "Legendary Chest",
                      color: "purple"
                    },
                    {
                      id: "elite_scholar",
                      title: "Elite Scholar",
                      desc: "Demonstrate academic perfection with a 100% score on any exam.",
                      unlocked: perfectScored,
                      icon: <BookOpen className="w-8 h-8 text-blue-500" />,
                      category: "Academic Excellence",
                      badgeName: "Flawless Score",
                      color: "blue"
                    },
                    {
                      id: "honor_roll",
                      title: "Honor Roll Compliance",
                      desc: "Maintain absolute focus integrity with zero screen switches across all completed exams.",
                      unlocked: zeroCheats,
                      icon: <Check className="w-8 h-8 text-rose-500" />,
                      category: "Academic Excellence",
                      badgeName: "Zero Infractions",
                      color: "rose"
                    }
                  ];

                  const countUnlocked = allAchievements.filter(a => a.unlocked).length;
                  const pct = Math.round((countUnlocked / allAchievements.length) * 100);

                  return (
                    <div className="space-y-6">
                      {/* Achievements Progression Header Card */}
                      <div className="bg-gradient-to-r from-blue-600 to-teal-500 dark:from-slate-900 dark:to-slate-800 p-6 rounded-3xl text-white shadow-md flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                        <div className="space-y-1">
                          <span className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                            Personal Achievement Desk
                          </span>
                          <h2 className="text-xl md:text-2xl font-black font-display tracking-tight">
                            Academic Badge Showcase
                          </h2>
                          <p className="text-blue-100 text-xs max-w-md">
                            Acquire accomplishments, secure coin milestones, and display your academic achievements.
                          </p>
                        </div>
                        <div className="shrink-0 text-right space-y-2 bg-white/15 p-4 rounded-2xl border border-white/10 w-full md:w-auto">
                          <div className="flex justify-between items-center gap-6">
                            <span className="text-xs font-bold text-blue-100 uppercase font-sans">Unlocked Badges:</span>
                            <span className="text-lg font-black font-mono">{countUnlocked} / {allAchievements.length}</span>
                          </div>
                          <div className="w-full md:w-48 bg-white/20 h-2 rounded-full overflow-hidden">
                            <div className="bg-emerald-400 h-full transition-all duration-300" style={{ width: `${pct}%` }}></div>
                          </div>
                        </div>
                      </div>

                      {/* Achievements Bento-Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {allAchievements.map((ach) => (
                          <div 
                            key={ach.id} 
                            className={`p-6 rounded-3xl border transition-all duration-300 flex flex-col justify-between ${
                              ach.unlocked 
                                ? "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm hover:translate-y-[-2px] hover:shadow-md" 
                                : "bg-slate-50 dark:bg-slate-900/40 border-slate-100 dark:border-slate-800 opacity-60"
                            }`}
                          >
                            <div className="space-y-4">
                              <div className="flex justify-between items-start">
                                <span className="text-[9px] uppercase font-mono font-bold tracking-wider text-slate-400">
                                  {ach.category}
                                </span>
                                <span className={`px-2 py-0.5 rounded-full text-[8px] uppercase tracking-wider font-extrabold ${
                                  ach.unlocked 
                                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" 
                                    : "bg-slate-200 dark:bg-slate-800 text-slate-500"
                                }`}>
                                  {ach.unlocked ? "Unlocked" : "Locked"}
                                </span>
                              </div>

                              <div className="flex items-center gap-4">
                                <div className={`p-3.5 rounded-2xl ${ach.unlocked ? "bg-slate-100 dark:bg-slate-800" : "bg-slate-200/50 dark:bg-slate-800/30"}`}>
                                  {ach.icon}
                                </div>
                                <div>
                                  <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">{ach.title}</h3>
                                  <span className="text-[10px] font-mono font-bold text-slate-400">{ach.badgeName}</span>
                                </div>
                              </div>

                              <p className="text-xxs text-slate-500 dark:text-slate-400 leading-relaxed">
                                {ach.desc}
                              </p>
                            </div>

                            {/* Reward Display Bar */}
                            <div className="border-t border-slate-100 dark:border-slate-800 mt-5 pt-3 flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase select-none font-mono">
                              <span>Requirement Status:</span>
                              <span className={ach.unlocked ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}>
                                {ach.unlocked ? "Qualified" : "Pending"}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* TAB: PROFILE */}
            {activeTab === "PROFILE" && (
              <div className="max-w-md mx-auto bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm space-y-6">
                <div className="text-center select-none pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div className="w-16 h-16 bg-emerald-600 text-white rounded-full flex items-center justify-center font-bold text-xl mx-auto shadow-md mb-3">
                    {user.name.substring(0, 2).toUpperCase()}
                  </div>
                  <h2 className="text-lg font-bold text-gray-950 dark:text-slate-50">{user.name}</h2>
                  <p className="text-gray-400 text-xs mt-0.5">{user.email}</p>
                  
                  {/* Premium easy theme toggle */}
                  <div className="mt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setDarkTheme(!darkTheme)}
                      className="px-4 py-2 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition text-slate-700 dark:text-slate-300 cursor-pointer text-xs flex items-center gap-2 font-bold shadow-xs bg-slate-50 dark:bg-slate-900"
                    >
                      {darkTheme ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-indigo-600" />}
                      <span>Theme: {darkTheme ? "Dark" : "Light"} Mode</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-4 text-left">
                  <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 text-amber-800 dark:text-amber-400 text-xs rounded-xl flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Profile Registry Locked</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed opacity-90">To maintain strict exam integrity, students are not permitted to change their names, email credentials, or security passwords. Please reach out to your instructor or administrator if adjustments are required.</p>
                    </div>
                  </div>

                  <div className="space-y-1.5 opacity-60">
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Full Name (Managed by Admin)</label>
                    <input
                      type="text"
                      disabled
                      value={profileName}
                      className="w-full text-sm p-3.5 bg-slate-100 border border-slate-200 dark:bg-slate-900 dark:border-slate-800 rounded-xl focus:outline-none text-slate-500 dark:text-slate-400 font-sans font-medium cursor-not-allowed"
                    />
                  </div>

                  <div className="space-y-1.5 opacity-60">
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Email Address (Managed by Admin)</label>
                    <input
                      type="email"
                      disabled
                      value={profileEmail}
                      className="w-full text-sm p-3.5 bg-slate-100 border border-slate-200 dark:bg-slate-900 dark:border-slate-800 rounded-xl focus:outline-none text-slate-500 dark:text-slate-400 font-sans font-medium cursor-not-allowed"
                    />
                  </div>

                  {user.studentClass && (
                    <div className="grid grid-cols-3 gap-3 pt-2">
                      <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-center shadow-xs">
                        <p className="text-[9px] uppercase font-bold text-slate-400 dark:text-slate-500">Class</p>
                        <p className="text-sm font-black text-slate-800 dark:text-slate-100 mt-1">{user.studentClass}</p>
                      </div>
                      <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-center shadow-xs">
                        <p className="text-[9px] uppercase font-bold text-slate-400 dark:text-slate-500">Section</p>
                        <p className="text-sm font-black text-slate-800 dark:text-slate-100 mt-1">{user.studentSection || "N/A"}</p>
                      </div>
                      <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl text-center shadow-xs">
                        <p className="text-[9px] uppercase font-bold text-slate-400 dark:text-slate-500">Stream</p>
                        <p className="text-sm font-black text-slate-800 dark:text-slate-100 mt-1">{user.studentStream || "General"}</p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5 opacity-60">
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Password (Managed by Admin)</label>
                    <input
                      type="text"
                      disabled
                      placeholder="Contact administrator to change passwords"
                      className="w-full text-sm p-3.5 bg-slate-100 border border-slate-200 dark:bg-slate-900 dark:border-slate-800 rounded-xl focus:outline-none text-slate-500 dark:text-slate-400 font-sans cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400 leading-relaxed font-semibold">
                  <div>
                    <span className="text-[9px] uppercase font-bold text-gray-400 block mb-1">Registration Role</span>
                    <span className="text-slate-800 dark:text-slate-200 py-0.5 font-bold uppercase">{user.role}</span>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase font-bold text-gray-400 block mb-1">Assessed Coins</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">🪙 {studentStats?.coinsEarned ?? user.coins}</span>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}

      </main>

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
    </div>
  );
}
