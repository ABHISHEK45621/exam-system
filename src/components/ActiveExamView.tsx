import React, { useState, useEffect, useRef } from "react";
import { 
  Timer, ChevronLeft, ChevronRight, AlertTriangle, Maximize, 
  Check, Save, Eye, ShieldAlert, Sparkles 
} from "lucide-react";
import { Question, ExamSession, SavedAnswer } from "../types";

function xorshift(seedStr: string) {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(31, h) + seedStr.charCodeAt(i) | 0;
  }
  return function() {
    let t = h += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function deterministicShuffle<T>(array: T[], seed: string): T[] {
  const nextRandom = xorshift(seed);
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(nextRandom() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

interface ActiveExamViewProps {
  examId: string;
  token: string;
  onFinished: (examId: string) => void;
  onLogout: () => void;
}

export default function ActiveExamView({ examId, token, onFinished, onLogout }: ActiveExamViewProps) {
  // App state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exam, setExam] = useState<any>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [reviewSet, setReviewSet] = useState<Set<string>>(new Set());
  
  // Stats and monitoring state
  const [session, setSession] = useState<ExamSession | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFullscreenWarning, setShowFullscreenWarning] = useState(false);
  const [blurred, setBlurred] = useState(false);
  const [showFocusWarning, setShowFocusWarning] = useState(false);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dialog, confirmation, and notification states
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [notification, setNotification] = useState<{ title: string; message: string; onAction?: () => void } | null>(null);
  const [isTerminated, setIsTerminated] = useState(false);
  
  // References
  const containerRef = useRef<HTMLDivElement>(null);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autosaveTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasEnteredFullscreenOnce = useRef(false);
  const isTerminatingRef = useRef(false);
  const focusWarningCountRef = useRef(0);

  const triggerInstantViolationPenalty = async () => {
    if (isTerminatingRef.current) return;
    isTerminatingRef.current = true;

    // 1. Stop the exam timer immediately
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    // 2. Set states immediately with zero delay
    setIsTerminated(true);
    setIsSubmitting(true);

    // 3. Auto submit the exam with score zero and deduct 1 coin
    try {
      await fetch(`/api/student/exam/${examId}/terminate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        }
      });
    } catch (err) {
      console.error("Instant violation penalty auto-submit failed:", err);
    }
  };

  // Load Exam and Session Recovery data
  useEffect(() => {
    fetchExamAndSession();
    return () => {
      // Clear timers
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current as any);
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current as any);
      // Clear any pending autosave timers
      Object.values(autosaveTimeoutRef.current).forEach((t) => clearTimeout(t as any));
    };
  }, [examId]);

  const fetchExamAndSession = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/student/exam/${examId}/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        }
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to start exam session");
      }
      const data = await res.json();
      setExam(data.exam);
      setSession(data.session);

      let examQuestions = data.questions || [];
      if (data.session && data.session.id && examQuestions.length > 0) {
        examQuestions = deterministicShuffle(examQuestions, data.session.id);
      }
      setQuestions(examQuestions);

      // Restore session answers automatically
      const restoredAnswers: Record<string, string> = {};
      const restoredReviews = new Set<string>();
      if (data.savedAnswers) {
        data.savedAnswers.forEach((ans: SavedAnswer) => {
          restoredAnswers[ans.questionId] = ans.answerText;
          if (ans.isMarkedForReview) {
            restoredReviews.add(ans.questionId);
          }
        });
      }
      setAnswers(restoredAnswers);
      setReviewSet(restoredReviews);

      // Find current restored question index
      if (data.session.currentQuestionId && examQuestions.length > 0) {
        const sIndex = examQuestions.findIndex((q: Question) => q.id === data.session.currentQuestionId);
        if (sIndex !== -1) {
          setCurrentIndex(sIndex);
        }
      }

      // Calculate time remaining with absolute fallback (preferring the clock-drift-immune server-authoritative calculation)
      let remainingSecs = 0;
      if (data.timeLeftSec !== undefined) {
        remainingSecs = data.timeLeftSec;
      } else {
        const startTime = new Date(data.session.startedAt).getTime();
        const durationMs = data.exam.durationMinutes * 60 * 1000;
        const elapsedMs = Date.now() - startTime;
        remainingSecs = Math.max(0, Math.floor((durationMs - elapsedMs) / 1000));
      }
      setTimeLeft(remainingSecs);
      setLoading(false);

      if (remainingSecs <= 0) {
        handleTimeExpired();
      }

    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  };

  // Countdown interval - starts only when they start the exam (in fullscreen) and are not submitting or terminated
  useEffect(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (!loading && isFullscreen && timeLeft > 0 && !isSubmitting && !isTerminated) {
      timerIntervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            if (timerIntervalRef.current) {
              clearInterval(timerIntervalRef.current);
              timerIntervalRef.current = null;
            }
            handleTimeExpired();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [isFullscreen, loading, isSubmitting, isTerminated]);

  // ==========================================
  // CHEATING DETECTION LOGIC & LISTENERS
  // ==========================================
  
  // Enter Fullscreen securely
  const enterFullscreen = async () => {
    try {
      const element = document.documentElement;
      if (element.requestFullscreen) {
        await element.requestFullscreen();
      }
      setIsFullscreen(true);
      setShowFullscreenWarning(false);
      hasEnteredFullscreenOnce.current = true;
      setWarningMessage(null);
    } catch (err) {
      console.error("Failed to request fullscreen:", err);
    }
  };

  // Check state list of fullscreen change
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isCurrentlyFull = !!document.fullscreenElement;
      setIsFullscreen(isCurrentlyFull);
      if (!isCurrentlyFull && hasEnteredFullscreenOnce.current && !loading && !isSubmitting && !isTerminated) {
        // Show exit-fullscreen warning dialog first so the user can choose to resume or proceed to exit
        setShowFullscreenWarning(true);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [loading, isSubmitting, isTerminated]);

  // Tab change / Window Blur checks
  useEffect(() => {
    let blurTimeout: NodeJS.Timeout | null = null;

    const handleWindowBlur = () => {
      if (!loading && !isSubmitting && !isTerminated) {
        setBlurred(true);
        // Delay checking the visibility state to avoid double counting tab switch as blur
        blurTimeout = setTimeout(() => {
          if (document.visibilityState !== "hidden") {
            if (focusWarningCountRef.current === 0) {
              focusWarningCountRef.current = 1;
              setShowFocusWarning(true);
              logCheatingEvent("WINDOW_BLUR_WARNING", "Browser window blurred (clicked outside or Alt-tabbed). Security warning overlay shown.");
            } else {
              triggerInstantViolationPenalty();
            }
          }
        }, 80);
      }
    };

    const handleWindowFocus = () => {
      setBlurred(false);
      if (blurTimeout) clearTimeout(blurTimeout);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (!loading && !isSubmitting && !isTerminated) {
          if (focusWarningCountRef.current === 0) {
            focusWarningCountRef.current = 1;
            setShowFocusWarning(true);
            logCheatingEvent("TAB_SWITCH_WARNING", "Student switched tab or minimized window (Alt-Tab). Security warning overlay shown.");
          } else {
            triggerInstantViolationPenalty();
          }
        }
      }
    };

    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      if (blurTimeout) clearTimeout(blurTimeout);
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loading, isSubmitting, session, isTerminated]);

  // Track user interaction to detect inactivity (90s inactivity limit)
  useEffect(() => {
    const resetInactivityTimer = () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current as any);
      
      inactivityTimerRef.current = setTimeout(() => {
        if (!loading && !isSubmitting) {
          logCheatingEvent("INACTIVITY", "Student has been inactive for over 90 seconds.");
          setNotification({
            title: "Inactivity Flagged",
            message: "Your exam interaction state has been flagged due to lack of motion. This event has been dispatched to live monitoring logs."
          });
        }
      }, 90000); // 90 seconds inactivity check
    };

    window.addEventListener("mousemove", resetInactivityTimer);
    window.addEventListener("keydown", resetInactivityTimer);
    window.addEventListener("click", resetInactivityTimer);
    window.addEventListener("scroll", resetInactivityTimer);

    resetInactivityTimer();

    return () => {
      window.removeEventListener("mousemove", resetInactivityTimer);
      window.removeEventListener("keydown", resetInactivityTimer);
      window.removeEventListener("click", resetInactivityTimer);
      window.removeEventListener("scroll", resetInactivityTimer);
    };
  }, [loading, isSubmitting]);

  // Copy, Cut, and Paste blockers with popup messages and real-time security tracking
  useEffect(() => {
    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      logCheatingEvent("BLOCK_COPY", "Student attempted to copy text context from the assessment sheet.");
      setNotification({
        title: "Security Violation Check",
        message: "Selecting and copying exam text is strictly disabled to maintain assessment integrity. All actions are logged."
      });
    };

    const handleCut = (e: ClipboardEvent) => {
      e.preventDefault();
      logCheatingEvent("BLOCK_CUT", "Student attempted to cut text context from the assessment sheet.");
      setNotification({
        title: "Security Violation Check",
        message: "Cutting content from this assessment window is strictly disabled."
      });
    };

    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      logCheatingEvent("BLOCK_PASTE", "Student attempted to paste external answers into the assessment response box.");
      setNotification({
        title: "Security Violation Check",
        message: "Pasting text from external files or clipboards is strictly disabled. You are required to input your answers manually."
      });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.ctrlKey || e.metaKey;
      if (isCmdOrCtrl) {
        const key = e.key.toLowerCase();
        if (key === 'c' || key === 'v' || key === 'x') {
          e.preventDefault();
          if (key === 'c') {
            logCheatingEvent("BLOCK_COPY_SHORTCUT", "Student triggered copy keyboard shortcut (Ctrl+C / Cmd+C).");
            setNotification({
              title: "Copy Shortcut Blocked",
              message: "Copying text during the exam is prohibited."
            });
          } else if (key === 'v') {
            logCheatingEvent("BLOCK_PASTE_SHORTCUT", "Student triggered paste keyboard shortcut (Ctrl+V / Cmd+V).");
            setNotification({
              title: "Paste Shortcut Blocked",
              message: "Pasting text/answers during the exam is prohibited. Please type your responses manually."
            });
          } else if (key === 'x') {
            logCheatingEvent("BLOCK_CUT_SHORTCUT", "Student triggered cut keyboard shortcut (Ctrl+X / Cmd+X).");
            setNotification({
              title: "Cut Shortcut Blocked",
              message: "Cutting text during the exam is prohibited."
            });
          }
        }
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      setNotification({
        title: "Context Menu Disabled",
        message: "Right-click context menus are locked during active assessment sessions to prevent external tool integration."
      });
    };

    document.addEventListener("copy", handleCopy);
    document.addEventListener("cut", handleCut);
    document.addEventListener("paste", handlePaste);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      document.removeEventListener("copy", handleCopy);
      document.removeEventListener("cut", handleCut);
      document.removeEventListener("paste", handlePaste);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [loading, isSubmitting, isTerminated, session]);

  // Helper to log telemetry alerts with server
  const logCheatingEvent = async (type: string, details: string) => {
    if (!session) return;
    try {
      const res = await fetch(`/api/student/exam/${examId}/telemetry`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          eventType: type,
          details
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.session) {
          setSession(data.session);
        }
      }
    } catch (err) {
      console.error("Failed to log cheating event:", err);
    }
  };

  // ==========================================
  // AUTOSAVE IMPLEMENTATION
  // ==========================================

  const handleAnswerChange = (qId: string, value: string) => {
    // 1. Immediately update client-side React UI state
    setAnswers((prev) => ({
      ...prev,
      [qId]: value
    }));

    // 2. Clear any prior pending debounced autosaves for this question
    if (autosaveTimeoutRef.current[qId]) {
      clearTimeout(autosaveTimeoutRef.current[qId]);
    }

    // 3. Initiate a 1 second debounced background save
    autosaveTimeoutRef.current[qId] = setTimeout(() => {
      triggerBackgroundAutosave(qId, value, reviewSet.has(qId));
    }, 1000);
  };

  const toggleReview = async (qId: string) => {
    let nextReviewState = false;
    setReviewSet((prev) => {
      const updated = new Set(prev);
      if (updated.has(qId)) {
        updated.delete(qId);
        nextReviewState = false;
      } else {
        updated.add(qId);
        nextReviewState = true;
      }
      return updated;
    });

    // Save review toggle instantly
    const value = answers[qId] || "";
    await triggerBackgroundAutosave(qId, value, nextReviewState);
  };

  const triggerBackgroundAutosave = async (questionId: string, value: string, isReviewed: boolean) => {
    const currentQId = questions[currentIndex]?.id || null;
    try {
      const res = await fetch(`/api/student/exam/${examId}/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          questionId,
          answerText: value,
          isMarkedForReview: isReviewed,
          currentQuestionId: currentQId
        })
      });
      if (res.ok) {
        console.log(`[AUTOSAVE] Saved question ${questionId}`);
        // Log telemetry as a trace occasionally
      }
    } catch (err) {
      console.error("Autosave connection error:", err);
    }
  };

  // Explicitly trigger saves when moving between steps
  const syncStepChange = async (targetIndex: number) => {
    if (questions[currentIndex]) {
      const q = questions[currentIndex];
      // Cancel any debounced timeouts
      if (autosaveTimeoutRef.current[q.id]) {
        clearTimeout(autosaveTimeoutRef.current[q.id]);
      }
      // Save synchronously immediately
      await triggerBackgroundAutosave(q.id, answers[q.id] || "", reviewSet.has(q.id));
    }
    setCurrentIndex(targetIndex);
  };

  // ==========================================
  // EVALUATION & SUBMISSION FLOWS
  // ==========================================

  const executeQuit = () => {
    setShowQuitConfirm(false);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    onFinished(examId);
  };

  const executeLeave = () => {
    setShowLeaveConfirm(false);
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    onFinished(examId);
  };

  const executeSubmission = async () => {
    setIsSubmitting(true);
    // Explicitly sync final step
    if (questions[currentIndex]) {
      const q = questions[currentIndex];
      try {
        await triggerBackgroundAutosave(q.id, answers[q.id] || "", reviewSet.has(q.id));
      } catch (err) {
        console.error("Autosave failed before submission:", err);
      }
    }

    try {
      const res = await fetch(`/api/student/exam/${examId}/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ isExpired: false })
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Submission failed");
      }
      
      setShowSubmitConfirm(false);
      setNotification({
        title: "Exam Submitted!",
        message: "Exam submitted! Results will be ready in a few minutes.",
        onAction: () => {
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          }
          onFinished(examId);
        }
      });
    } catch (err: any) {
      setShowSubmitConfirm(false);
      setNotification({
        title: "Submission Error",
        message: err.message || "An error occurred during submission."
      });
      setIsSubmitting(false);
    }
  };

  const handleTimeExpired = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/student/exam/${examId}/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ isExpired: true })
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Automated submission failed");
      }

      setNotification({
        title: "Time Limit Expired!",
        message: "Your Answers had to be compiled and submitted automatically. Exam submitted! Results will be ready in a few minutes. (Note: 1 coin penalty has been assessed for late submission)",
        onAction: () => {
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          }
          onFinished(examId);
        }
      });
    } catch (e: any) {
      console.error(e);
      setNotification({
        title: "Auto-Submission Error",
        message: e.message || "Failed to automatically submit your exam session."
      });
      setIsSubmitting(false);
      // Fallback transition to dashboard if submission completely fails
      setTimeout(() => {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
        onFinished(examId);
      }, 3500);
    }
  };

  const handleSubmitExam = () => {
    setShowSubmitConfirm(true);
  };

  // Format countdown clock
  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  if (isTerminated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-xl border border-rose-200 dark:border-rose-950/45 text-center relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-1.5 bg-rose-600"></div>

          <ShieldAlert className="w-16 h-16 text-rose-600 mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50 font-display mb-3">Exam Terminated</h2>
          <p className="text-rose-600 dark:text-rose-400 text-xs font-mono font-bold tracking-wider uppercase mb-4">Security Violation Detected</p>
          
          <div className="bg-rose-50 dark:bg-rose-950/20 rounded-xl p-4 mb-6 border border-rose-100 dark:border-rose-950/30">
            <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed text-left font-sans">
              Exam Terminated - Violation Detected. You switched tabs or exited fullscreen. Your exam has been automatically submitted with zero score and 1 coin has been deducted from your account.
            </p>
          </div>

          <button 
            onClick={() => {
              if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => {});
              }
              onFinished(examId);
            }}
            className="w-full bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-semibold py-3 rounded-xl transition cursor-pointer font-sans"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-slate-50 dark:bg-slate-900 transition-colors">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-600 dark:text-slate-400 font-medium text-xs font-mono">Securing connection & recovering session data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-rose-100 dark:border-rose-950/20">
        <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 text-center mb-2">Failed to Restore Session</h3>
        <p className="text-slate-600 dark:text-slate-400 text-sm text-center mb-6">{error}</p>
        <button 
          onClick={onFinished.bind(null, examId)}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2.5 rounded-xl transition cursor-pointer"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];
  const totalQuestions = questions.length;
  const isMcq = currentQuestion?.type === "MCQ";
  const answerText = answers[currentQuestion?.id] || "";
  const isMarkedReview = reviewSet.has(currentQuestion?.id);

  return (
    <div ref={containerRef} className="min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 transition-colors select-none">
      
      {/* 2. STRICT FULLSCREEN FORCED PORTAL GATES */}
      {!isFullscreen && (
        hasEnteredFullscreenOnce.current ? (
          <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 max-w-lg w-full p-8 rounded-3xl shadow-2xl border-2 border-amber-500/50 text-center animate-fade-in relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-1.5 bg-amber-500 animate-pulse"></div>
              
              <AlertTriangle className="w-16 h-16 text-amber-500 mx-auto mb-5 animate-bounce" />
              <h2 className="text-2xl font-black font-display text-slate-900 dark:text-slate-50 mb-3">Accidental Exit Detected!</h2>
              <p className="text-slate-650 dark:text-slate-350 mb-6 text-sm leading-relaxed font-sans">
                You have exited secure fullscreen mode. Your progress has been temporarily paused.
                <br />
                <span className="text-amber-600 dark:text-amber-400 font-bold block mt-3">To avoid automatic exam termination and grade penalty, please resume fullscreen mode immediately.</span>
              </p>
              
              <div className="flex flex-col gap-3">
                <button
                  onClick={enterFullscreen}
                  className="w-full px-6 py-3.5 bg-amber-500 hover:bg-amber-400 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-97 transition cursor-pointer text-sm"
                >
                  <Maximize className="w-4 h-4" /> Resume Secure Fullscreen Mode
                </button>
                
                <button 
                  onClick={triggerInstantViolationPenalty}
                  className="w-full px-6 py-3 text-xs text-rose-500 hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 border border-transparent hover:border-rose-200 dark:hover:border-rose-900/30 rounded-xl transition cursor-pointer font-bold"
                >
                  Yes, Proceed to Exit & Terminate Exam
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 max-w-lg w-full p-8 rounded-2xl shadow-2xl border border-rose-500/30 text-center animate-fade-in unique-card-fs">
              <ShieldAlert className="w-16 h-16 text-rose-500 mx-auto mb-5 animate-pulse" />
              <h2 className="text-2xl font-bold font-display text-slate-900 dark:text-slate-50 mb-3">Secure Assessment Mode</h2>
              <p className="text-slate-600 dark:text-slate-400 mb-6 text-sm leading-relaxed">
                This assessment requires a dedicated, monitored full-screen layout to maintain examination authenticity. 
                Windows-blur event listeners are active. Exiting this screen logs a warning violation index directly into the teacher's supervisor control monitor.
              </p>
              <button
                onClick={enterFullscreen}
                className="px-8 py-3 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 mx-auto shadow-lg shadow-rose-600/20 active:scale-95 transition-all text-sm w-full sm:w-auto"
              >
                <Maximize className="w-4 h-4" /> Start Secure Fullscreen Mode
              </button>
              <button 
                onClick={() => setShowQuitConfirm(true)}
                className="mt-4 text-xs text-slate-400 hover:text-slate-300 underline cursor-pointer"
              >
                Cancel Registration & Quit
              </button>
            </div>
          </div>
        )
      )}

      {/* Security alert strip */}
      {warningMessage && isFullscreen && (
        <div className="bg-rose-600 text-white px-4 py-2 flex items-center justify-between text-xs font-semibold select-none">
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 animate-bounce" /> {warningMessage}
          </span>
          <button 
            onClick={() => setWarningMessage(null)} 
            className="hover:underline bg-rose-700 px-2 py-1 rounded"
          >
            Acknowledge warning
          </button>
        </div>
      )}

      {/* Focus Violation / Tab Switch Warning Overlay */}
      {showFocusWarning && !isTerminated && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 max-w-lg w-full p-8 rounded-3xl shadow-2xl border-2 border-rose-500/50 text-center animate-fade-in relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-1.5 bg-rose-500 animate-pulse"></div>
            
            <ShieldAlert className="w-16 h-16 text-rose-500 mx-auto mb-5 animate-bounce" />
            <h2 className="text-2xl font-black font-display text-slate-900 dark:text-slate-50 mb-3">Alt-Tab / Focus Loss Warning!</h2>
            
            <p className="text-slate-650 dark:text-slate-350 mb-6 text-sm leading-relaxed font-sans">
              You switched tabs, minimized, or lost active window focus from the secure assessment workspace.
              <br />
              <span className="text-rose-600 dark:text-rose-400 font-bold block mt-3">
                ATTENTION: This is your ONLY warning. If you press Alt-Tab, switch tabs, click outside, or violate focus rules again, your exam session will be IMMEDIATELY TERMINATED, progress set to zero, and a coin penalty applied.
              </span>
            </p>
            
            <div className="flex flex-col gap-3">
              <button
                onClick={async () => {
                  setShowFocusWarning(false);
                  // Also automate re-entering secure fullscreen mode
                  await enterFullscreen();
                }}
                className="w-full px-6 py-3.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20 active:scale-97 transition cursor-pointer text-sm"
              >
                I Understand, Resume Exam
              </button>
              
              <button 
                onClick={triggerInstantViolationPenalty}
                className="w-full px-6 py-3 text-xs text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 transition cursor-pointer font-bold"
              >
                Proceed to Exit & Terminate Exam
              </button>
            </div>
          </div>
        </div>
      )}

      {/* top exam branding area */}
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-4 dark:bg-slate-900 dark:border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400 text-xs px-2 py-0.5 rounded-full font-bold">
              Secure Session Enabled
            </span>
            <span className="text-slate-450 text-xs font-mono">
              SESS-{session?.id.substring(5, 12).toUpperCase()}
            </span>
          </div>
          <h1 className="text-lg font-bold font-display text-slate-900 dark:text-slate-50 mt-1 truncate max-w-xl">
            {exam?.title}
          </h1>
        </div>

        <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
          {/* Active Timer Box */}
          <div className="flex items-center gap-2.5 bg-slate-100 dark:bg-slate-800 py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 font-mono">
            <Timer className={`w-5 h-5 ${timeLeft < 600 ? "text-rose-600 dark:text-rose-400 animate-pulse" : "text-slate-500 dark:text-slate-400"}`} />
            <span className={`text-base font-black tracking-wider ${timeLeft < 600 ? "text-rose-600 dark:text-rose-400 font-black animate-pulse" : "text-slate-800 dark:text-slate-100"}`}>
              {formatTimer(timeLeft)}
            </span>
          </div>

          <button
            onClick={handleSubmitExam}
            disabled={isSubmitting}
            className="bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 px-5 rounded-xl text-sm transition-all shadow-md shadow-blue-600/10 active:scale-95 cursor-pointer font-semibold"
          >
            Submit Examination
          </button>
        </div>
      </header>

      {/* Major View Layout Grid */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-4 gap-6 select-none">
        
        {/* LEFT COLUMN: ACTIVE WORKSPACE (3 cols) */}
        <div className="lg:col-span-3 flex flex-col gap-6">
          
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 md:p-8 flex-1 flex flex-col justify-between">
            {/* Question Header */}
            <div>
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4 mb-6">
                <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                  Question {currentIndex + 1} of {totalQuestions}
                  {currentQuestion?.coinReward !== undefined && (
                    <span className="ml-3 font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                      🪙 {currentQuestion.coinReward} {currentQuestion.coinReward === 1 ? 'coin' : 'coins'}
                    </span>
                  )}
                </span>

                <span className="bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400 text-xs px-2.5 py-1 rounded-md font-bold uppercase tracking-wider">
                  {currentQuestion?.type === "MCQ" ? "MCQ" : "WRITTEN"}
                </span>
              </div>

              {/* Question Text styling */}
              <h2 className="text-lg md:text-xl font-medium leading-relaxed text-slate-900 dark:text-slate-100 mb-8 whitespace-pre-wrap">
                {currentQuestion?.questionText}
              </h2>

              {/* Answer Canvas Container */}
              <div className="my-6">
                {isMcq ? (
                  /* Multiple Choices Layout */
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(() => {
                      const validKeys = ["A", "B", "C", "D"].filter((k) => {
                        const val = currentQuestion[`option${k}` as keyof Question];
                        return val !== undefined && val !== null && val !== "";
                      });
                      const seed = (session?.id || "") + "_" + currentQuestion.id;
                      return deterministicShuffle(validKeys, seed);
                    })().map((optKey) => {
                      const optText = currentQuestion[`option${optKey}` as keyof Question] as string;
                      const isSelected = answerText === optKey;
                      
                      return (
                        <button
                           key={optKey}
                           onClick={() => handleAnswerChange(currentQuestion.id, optKey)}
                           className={`flex items-start gap-4 p-5 rounded-2xl border text-left cursor-pointer transition-all duration-150 ${
                             isSelected 
                               ? "bg-blue-50/50 border-blue-500 dark:bg-blue-950/20 dark:border-blue-500 shadow-sm" 
                               : "border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
                           }`}
                        >
                          <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold border transition-colors ${
                            isSelected 
                              ? "bg-blue-600 border-blue-600 text-white" 
                              : "border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400"
                          }`}>
                            {optKey}
                          </span>
                          <span className="text-sm md:text-base text-slate-700 dark:text-slate-300 leading-normal">
                            {optText}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  /* Open-text Layout with Auto Save indicators */
                  <div className="space-y-2">
                    <label className="text-xs text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1.5 mb-2">
                      <Sparkles className="w-3.5 h-3.5 text-blue-500 animate-spin" /> Auto-evaluating answer box
                    </label>
                    <textarea
                      value={answerText}
                      onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                      onPaste={(e) => {
                        e.preventDefault();
                        setNotification({
                          title: "Paste Blocked",
                          message: "Pasting answers into the exam sheet is strictly prohibited. Please type your answer manually."
                        });
                        logCheatingEvent("BLOCK_PASTE", "Student attempted inline paste in textarea.");
                      }}
                      onCopy={(e) => {
                        e.preventDefault();
                        setNotification({
                          title: "Copy Blocked",
                          message: "Copying text during the exam is strictly prohibited."
                        });
                        logCheatingEvent("BLOCK_COPY", "Student attempted inline copy from textarea.");
                      }}
                      onCut={(e) => {
                        e.preventDefault();
                        setNotification({
                          title: "Cut Blocked",
                          message: "Cutting text during the exam is strictly prohibited."
                        });
                        logCheatingEvent("BLOCK_CUT", "Student attempted inline cut from textarea.");
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        setNotification({
                          title: "Drop Blocked",
                          message: "Dragging and dropping answers is strictly disabled."
                        });
                      }}
                      placeholder="Enter your written answer here. Focus on conceptual correctness and general understanding. Our evaluation core evaluates your explanation conceptually..."
                      ref={(el) => {
                        if (el) {
                          el.style.height = "auto";
                          el.style.height = `${el.scrollHeight}px`;
                        }
                      }}
                      className="w-full text-sm md:text-base p-5 bg-white border border-slate-200 hover:border-slate-300 focus:border-blue-500 dark:bg-slate-900 dark:border-slate-800 dark:hover:border-slate-750 dark:focus:border-blue-600 rounded-2xl shadow-inner focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans tracking-wide leading-relaxed text-slate-900 dark:text-slate-100 resize-none overflow-hidden min-h-[220px]"
                    />
                    <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400 select-none">
                      <span>Characters: {answerText.length} | Words: {answerText.split(/\s+/).filter(Boolean).length}</span>
                      <span className="flex items-center gap-1.5 text-blue-500 dark:text-blue-400">
                        <Check className="w-3.5 h-3.5 animate-pulse" /> Live Autosave Working
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Actions Row */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => toggleReview(currentQuestion.id)}
                className={`py-2 px-5 rounded-xl font-medium text-xs md:text-sm shadow-sm cursor-pointer border flex items-center gap-2 transition ${
                  isMarkedReview 
                    ? "bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-400" 
                    : "bg-white hover:bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                <Eye className="w-4 h-4" /> 
                {isMarkedReview ? "Unmark Review Item" : "Mark Question for Review"}
              </button>

              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                <button
                  onClick={() => syncStepChange(currentIndex - 1)}
                  disabled={currentIndex === 0}
                  className="p-2.5 sm:py-2 sm:px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 disabled:opacity-50 disabled:pointer-events-none cursor-pointer text-sm flex items-center gap-2 transition"
                >
                  <ChevronLeft className="w-4 h-4" /> <span className="hidden sm:inline">Previous</span>
                </button>

                <button
                  onClick={() => syncStepChange(currentIndex + 1)}
                  disabled={currentIndex === totalQuestions - 1}
                  className="p-2.5 sm:py-2 sm:px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 disabled:opacity-50 disabled:pointer-events-none cursor-pointer text-sm flex items-center gap-2 transition"
                >
                  <span className="hidden sm:inline">Next</span> <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Secure Monitoring parameters metadata */}
          <div className="bg-slate-100 dark:bg-slate-900/50 rounded-xl p-4 border border-slate-200/50 dark:border-slate-800/60 flex flex-wrap justify-between items-center gap-4 text-xs font-mono text-slate-400 select-none">
            <span className="flex items-center gap-1"><ShieldAlert className="w-3.5 h-3.5 text-blue-500" /> Secure Sandbox Active</span>
            <span>Tab switches: {session?.tabSwitchCount || 0}</span>
            <span>Focus leaks: {session?.windowBlurCount || 0}</span>
            <span>Fullscreen warning exits: {session?.fullscreenExitCount || 0}</span>
          </div>

        </div>

        {/* RIGHT COLUMN: QUESTION NAVIGATOR (1 col) */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold font-display uppercase tracking-wider text-slate-900 dark:text-slate-300 mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
                Question Grid Map
              </h3>

              {/* Status Legends */}
              <div className="grid grid-cols-2 gap-2 text-xs font-medium mb-6">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                  <span className="text-slate-600 dark:text-slate-400">Answered</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-amber-400"></span>
                  <span className="text-slate-600 dark:text-slate-400">Reviewing</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-slate-200 dark:bg-slate-800"></span>
                  <span className="text-slate-600 dark:text-slate-400">Unanswered</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-900 bg-white dark:bg-slate-900"></span>
                  <span className="text-slate-600 dark:text-slate-400">Current</span>
                </div>
              </div>

              {/* Grid Layout of Navigator */}
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-4 gap-2.5">
                {questions.map((q, idx) => {
                  const isCurrent = idx === currentIndex;
                  const hasAnswered = answers[q.id]?.trim().length > 0;
                  const isReviewed = reviewSet.has(q.id);

                  let btnBg = "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400";
                  if (hasAnswered) btnBg = "bg-blue-500 text-white";
                  if (isReviewed) btnBg = "bg-amber-400 text-slate-950";

                  return (
                    <button
                      key={q.id}
                      onClick={() => syncStepChange(idx)}
                      className={`relative w-full aspect-square flex items-center justify-center font-mono font-bold text-sm rounded-lg transition-all active:scale-90 cursor-pointer ${btnBg} ${
                        isCurrent 
                          ? "ring-2 ring-blue-400 ring-offset-2 dark:ring-offset-slate-950 shadow-md" 
                          : "hover:bg-opacity-80"
                      }`}
                    >
                      {idx + 1}
                    </button>
                    );
                })}
              </div>
            </div>

            {/* Quick exit block */}
            <div className="mt-8 pt-4 border-t border-slate-200 dark:border-slate-800/80">
              <p className="text-xxs text-slate-400 dark:text-slate-500 leading-normal mb-3 font-mono">
                Autosave synchronizes answers automatically onto secure Cloud Run containers. Connection drops auto-recover from where you left off.
              </p>
              
              <button 
                onClick={() => setShowLeaveConfirm(true)}
                className="w-full text-center text-xs py-2 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 font-medium rounded-lg cursor-pointer"
              >
                Save and Return to Panel
              </button>
            </div>

          </div>
        </div>

      </main>

      {/* Custom Notification Modal */}
      {notification && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 max-w-sm w-full p-6 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 text-center space-y-4">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 rounded-full flex items-center justify-center mx-auto">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">{notification.title}</h3>
              <p className="text-slate-600 dark:text-slate-400 text-xs mt-2 leading-relaxed">
                {notification.message}
              </p>
            </div>
            <button
              onClick={() => {
                const action = notification.onAction;
                setNotification(null);
                if (action) action();
              }}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs transition cursor-pointer"
            >
              Acknowledge
            </button>
          </div>
        </div>
      )}

      {/* Custom Quit Confirm Modal */}
      {showQuitConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 max-w-sm w-full p-6 rounded-2xl shadow-xl border border-rose-100 dark:border-rose-950/20 text-center space-y-4">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-450 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">Quit Examination?</h3>
              <p className="text-slate-600 dark:text-slate-400 text-xs mt-2 leading-relaxed">
                Are you sure you wish to quit this active exam? It will count as unsubmitted with no result score.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowQuitConfirm(false)}
                className="py-2 px-4 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold rounded-xl text-xs transition cursor-pointer"
              >
                Resume
              </button>
              <button
                onClick={executeQuit}
                className="py-2 px-4 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-xl text-xs transition cursor-pointer"
              >
                Quit and Forfeit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Leave Confirm Modal */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 max-w-sm w-full p-6 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 text-center space-y-4">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 rounded-full flex items-center justify-center mx-auto">
              <Save className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">Save & Pause Session?</h3>
              <p className="text-slate-600 dark:text-slate-400 text-xs mt-2 leading-relaxed">
                Do you wish to leave this exam session temporarily? Your current progress is saved, and time remaining is paused.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="py-2 px-4 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold rounded-xl text-xs transition cursor-pointer"
              >
                Stay Here
              </button>
              <button
                onClick={executeLeave}
                className="py-2 px-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl text-xs transition cursor-pointer"
              >
                Save & Exit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Submit Confirm Modal */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 max-w-md w-full p-6 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 rounded-full flex items-center justify-center">
              <Check className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">Submit Examination</h3>
              <p className="text-slate-600 dark:text-slate-400 text-xs mt-2 leading-relaxed">
                Are you absolutely sure you want to finish the examination? This will lock your answers and trigger automated NLP grading.
              </p>
              
              {(() => {
                const unfilledCount = questions.length - Object.keys(answers).filter((k) => answers[k] && answers[k].trim().length > 0).length;
                if (unfilledCount > 0) {
                  return (
                    <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 flex items-start gap-2 text-left">
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold text-amber-800 dark:text-amber-400">Unanswered Questions</p>
                        <p className="text-[10px] text-amber-600 dark:text-amber-500 mt-1">
                          Warning: You have {unfilledCount} unanswered question{unfilledCount > 1 ? "s" : ""} out of {questions.length} total.
                        </p>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                disabled={isSubmitting}
                onClick={() => !isSubmitting && setShowSubmitConfirm(false)}
                className="py-2 px-4 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold rounded-xl text-xs transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Keep Working
              </button>
              <button
                disabled={isSubmitting}
                onClick={executeSubmission}
                className="py-2 px-5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-400 text-white font-semibold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-75 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Submitting your exam...</span>
                  </>
                ) : (
                  "Confirm Submit"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
