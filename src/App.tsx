import React, { useState, useEffect } from "react";
import { 
  Key, Mail, ShieldCheck, Moon, Sun, ServerCrash 
} from "lucide-react";
import { UserProfile } from "./types";
import TeacherDashboard from "./components/TeacherDashboard";
import StudentDashboard from "./components/StudentDashboard";
import ActiveExamView from "./components/ActiveExamView";

export default function App() {
  // Authentication & session variables
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null); // simple userId mock session token
  
  // Active exam window
  const [activeExamId, setActiveExamId] = useState<string | null>(null);

  // Authentication gateway inputs
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  
  // Custom Dark theme toggle
  const [darkTheme, setDarkTheme] = useState(false);

  // Dynamic theme syncing hook
  useEffect(() => {
    const root = window.document.documentElement;
    if (darkTheme) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [darkTheme]);

  // Attempt login check current token on mount
  useEffect(() => {
    const cachedToken = localStorage.getItem("exam_token");
    if (cachedToken) {
      restoreSession(cachedToken);
    }
  }, []);

  const restoreSession = async (savedToken: string) => {
    try {
      const res = await fetch("/api/auth/me", {
        headers: { "Authorization": `Bearer ${savedToken}` }
      });
      if (res.ok) {
        const uProfile = await res.json();
        setUser(uProfile);
        setToken(savedToken);
      } else {
        localStorage.removeItem("exam_token");
      }
    } catch {
      localStorage.removeItem("exam_token");
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    try {
      const trimmedEmail = email ? email.trim() : "";
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, password })
      });

      let data: any = {};
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        if (!res.ok) {
          throw new Error(text || `Server error (${res.status})`);
        }
      }

      if (!res.ok) {
        throw new Error(data.error || "Authentication transaction failed");
      }

      // Successful auth
      setUser(data.user);
      const userToken = data.token || data.user.id;
      setToken(userToken);
      localStorage.setItem("exam_token", userToken);
      
      // Cleanup
      setEmail("");
      setPassword("");
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    setActiveExamId(null);
    localStorage.removeItem("exam_token");
  };

  // ==========================================
  // DECISION MAP ROUTER
  // ==========================================

  // 1. Is student actively taking an exam - mount dedicated pure workspace
  if (user && token && activeExamId) {
    return (
      <ActiveExamView
        examId={activeExamId}
        token={token}
        onFinished={() => setActiveExamId(null)}
        onLogout={handleLogout}
      />
    );
  }

  // 2. Is logged in as Admin or Teacher - mount Teacher dashboard
  if (user && token && (user.role === "admin" || user.role === "teacher")) {
    return (
      <TeacherDashboard
        user={user}
        token={token}
        onLogout={handleLogout}
        darkTheme={darkTheme}
        setDarkTheme={setDarkTheme}
        onUpdateUser={(updated) => setUser(updated)}
      />
    );
  }

  // 4. Is logged in as Student - mount Student dashboard
  if (user && token && user.role === "student") {
    return (
      <StudentDashboard
        user={user}
        token={token}
        onLogout={handleLogout}
        onStartExam={(examId) => setActiveExamId(examId)}
        darkTheme={darkTheme}
        setDarkTheme={setDarkTheme}
        onUpdateUser={(updated) => setUser(updated)}
      />
    );
  }

  // 5. Default Gateway: Sign-In portal card
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col justify-between transition-colors duration-200 selection-none">
      
      {/* Sleek Header */}
      <header className="px-8 py-5 border-b border-slate-200 dark:border-slate-900 flex justify-between items-center bg-white dark:bg-slate-900 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-base shadow-md">
            EX
          </div>
          <span className="text-sm font-bold font-display tracking-wide text-slate-800 dark:text-slate-200">
            Informatics Practices (IP) Exam Portal
          </span>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 tracking-wider">SYSTEM ONLINE</span>
          </div>
          
          {/* Toggle Theme Control */}
          <button
            onClick={() => setDarkTheme(!darkTheme)}
            className="p-2 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition text-slate-500 dark:text-slate-400 cursor-pointer"
          >
            {darkTheme ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-indigo-600" />}
          </button>
        </div>
      </header>

      {/* Main card viewport */}
      <main className="flex-1 flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl relative space-y-6">
          
          <div className="text-center space-y-2">
            <div className="inline-flex p-3.5 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 rounded-full mb-1">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h2 className="text-2xl font-black font-display text-slate-900 dark:text-slate-50 tracking-tight">
              Sign In to IP Portal
            </h2>
            <p className="text-slate-400 dark:text-slate-505 text-xs">
              Class 11 & 12 CBSE Informatics Practices Preparation & Exam Portal
            </p>
          </div>

          {/* Error Notification strip */}
          {authError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/20 border border-rose-300 dark:border-rose-950 text-rose-700 dark:text-rose-450 text-xs rounded-xl flex items-center gap-2">
              <ServerCrash className="w-4 h-4 shrink-0 text-rose-500" />
              <span className="font-sans">{authError}</span>
            </div>
          )}

          {/* Gateway form */}
          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block font-sans">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-550" />
                <input
                  type="email"
                  required
                  placeholder="name@exam.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full text-sm pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 focus:border-indigo-550 dark:bg-slate-950 dark:border-slate-800 dark:focus:border-indigo-600 rounded-xl focus:outline-none text-slate-900 dark:text-slate-100 font-sans"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block font-sans">Password</label>
              <div className="relative">
                <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-550" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full text-sm pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 focus:border-indigo-550 dark:bg-slate-950 dark:border-slate-800 dark:focus:border-indigo-600 rounded-xl focus:outline-none text-slate-900 dark:text-slate-100 font-sans"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition duration-150 cursor-pointer text-xs uppercase tracking-wider shadow-md active:scale-98"
            >
              {authLoading ? "Synchronizing..." : "Sign In"}
            </button>
          </form>

        </div>
      </main>

      {/* Footer */}
      <footer className="px-8 py-5 border-t border-slate-200 dark:border-slate-900 text-center text-xs text-slate-500 dark:text-slate-500 select-none bg-white dark:bg-slate-900">
        CBSE Class 11 & 12 Informatics Practices (Subject Code: 065) Preparation & Online Examination System.
      </footer>

    </div>
  );
}
