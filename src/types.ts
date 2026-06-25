export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: "teacher" | "student" | "admin";
  coins: number;
}

export interface Exam {
  id: string;
  title: string;
  subject?: string;
  description: string;
  durationMinutes: number;
  isPublished: boolean;
  createdAt: string;
  publishAt?: string; // Optional schedule for publishing
  isDeleted?: boolean;
}

export type QuestionType = "MCQ" | "SHORT" | "LONG";

export interface Question {
  id: string;
  examId: string;
  type: QuestionType;
  questionText: string;
  optionA?: string;
  optionB?: string;
  optionC?: string;
  optionD?: string;
  correctOption?: string; // 'A', 'B', 'C', 'D'
  modelAnswer?: string;
  relevantKeywords?: string;
  orderIndex: number;
  coinReward?: number;
}

export interface ExamSession {
  id: string;
  studentId: string;
  examId: string;
  currentQuestionId: string | null;
  tabSwitchCount: number;
  windowBlurCount: number;
  fullscreenExitCount: number;
  inactivityWarnings: number;
  status: "ACTIVE" | "SUBMITTED" | "EXPIRED";
  startedAt: string;
  lastActivityAt: string;
}

export interface SavedAnswer {
  questionId: string;
  answerText: string;
  isMarkedForReview: boolean;
}

export interface ResultSummary {
  id: string;
  examId?: string;
  examTitle?: string;
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  coinsEarned: number;
  submittedAt: string;
}

export interface LeaderboardEntry {
  studentId: string;
  studentName: string;
  totalScore: number;
  totalCoins: number;
  averagePercentage: number;
  examsAttempted: number;
  rank: number;
}

export interface TeacherGlobalStats {
  totalExams: number;
  totalQuestions: number;
  totalStudents: number;
  activeExamsCount: number;
  recentStudentActivity: {
    id: string;
    studentName: string;
    examTitle: string;
    eventType: string;
    details: string;
    timestamp: string;
  }[];
}

export interface MonitoringSessionInfo extends ExamSession {
  studentName: string;
  examTitle: string;
  recentEvent?: string;
  currentQuestionNum?: number;
  currentQuestionText?: string;
  totalQuestionsCount?: number;
  answeredCount?: number;
  timeLeftSec?: number;
}

export interface MonitoringLog {
  id: string;
  sessionId: string;
  studentId: string;
  examId: string;
  eventType: "TAB_SWITCH" | "WINDOW_BLUR" | "FULLSCREEN_EXIT" | "REFRESH" | "INACTIVITY" | "AUTO_SAVE" | "START" | "SUBMIT";
  details: string;
  timestamp: string;
}

export interface ExamAnalytics {
  totalAttempts: number;
  highestScore: number;
  lowestScore: number;
  averageScore: number;
  passPercentage: number;
  failPercentage: number;
  questionAnalysis: {
    id: string;
    questionText: string;
    type: string;
    correctPercentage: number;
    wrongPercentage: number;
    attempts: number;
  }[];
}

export interface ResultBreakdownItem {
  id: string;
  questionText: string;
  type: QuestionType;
  options: { A: string; B: string; C: string; D: string } | null;
  correctOption: string | null;
  studentAnswer: string;
  modelAnswer: string | null;
  relevantKeywords: string | null;
  isCorrect: boolean;
  scores: {
    keywordPercent: number;
    similarityPercent: number;
  };
  feedback?: string;
}
