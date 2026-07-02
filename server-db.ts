import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { initializeApp } from "firebase/app";
import * as standardFirestore from "firebase/firestore";
import * as liteFirestore from "firebase/firestore/lite";
const IS_VERCEL = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const fstore = (IS_VERCEL ? liteFirestore : standardFirestore) as any;
import { getAuth } from "firebase/auth";
import { GoogleGenAI, Type } from "@google/genai";

// Initialize Gemini AI SDK lazily to prevent server crashes on boot if keys are not yet configured
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const aiAPIKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!aiAPIKey) {
      console.warn("WARNING: GEMINI_API_KEY / API_KEY is not configured. Gemini API will run using default lookup.");
    }
    aiClient = new GoogleGenAI({
      apiKey: aiAPIKey || "TEMPORARY_STUB_KEY",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });
  }
  return aiClient;
}

// Suppress benign internal gRPC/Firestore idle stream timeout warns from cluttering logs
try {
  standardFirestore.setLogLevel("error");
} catch (e) {
  // safe fallback
}

let firebaseConfig: any = null;
let fbApp: any = null;
let firestoreDb: any = null;
let firebaseAuth: any = null;

const ADMIN_EMAIL = "admin@examportal.com";
const ADMIN_PASSWORD = "Admin@1234";

try {
  firebaseConfig = require("./firebase-applet-config.json");
} catch (e) {
  const CONFIG_FILE = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      firebaseConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    } catch (err) {
      console.error("Failed to read local firebase config:", err);
    }
  }
}

if (firebaseConfig) {
  try {
    fbApp = initializeApp(firebaseConfig);
    const dbId = firebaseConfig.firestoreDatabaseId;
    firestoreDb = dbId ? fstore.getFirestore(fbApp, dbId) : fstore.getFirestore(fbApp);
    firebaseAuth = getAuth(fbApp);
    console.log("Firebase initialized successfully on server-side with project ID:", firebaseConfig.projectId, "and DB ID:", dbId || "default");
  } catch (error) {
    console.error("Failed to initialize Firebase:", error);
  }
}

// Helper to remove any undefined values so they don't break Firestore write operations
function cleanUndefined(obj: any): any {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) {
    return obj.map(cleanUndefined);
  }
  if (typeof obj === "object") {
    const clean: any = {};
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val !== undefined) {
        clean[key] = cleanUndefined(val);
      }
    }
    return clean;
  }
  return obj;
}

// ==========================================
// DATA DICTIONARY / TYPES FOR SIMULATED DB
// ==========================================

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string; // plain text for ease of admin/dev lookup, or simple string
  role: "teacher" | "student" | "admin";
  coins: number;
  createdAt: string;
  studentClass?: string;
  studentSection?: string;
  studentStream?: string;
}

export interface Exam {
  id: string;
  title: string;
  subject: string;
  description: string;
  durationMinutes: number;
  isPublished: boolean;
  createdAt: string;
  publishAt?: string;
  isDeleted?: boolean;
  examClass?: string;
  examSection?: string;
  examStream?: string;
}

export interface Question {
  id: string;
  examId: string;
  type: "MCQ" | "SHORT" | "LONG";
  questionText: string;
  optionA?: string;
  optionB?: string;
  optionC?: string;
  optionD?: string;
  correctOption?: string; // 'A', 'B', 'C', 'D'
  modelAnswer?: string;
  relevantKeywords?: string; // comma-separated keywords
  orderIndex: number;
  createdAt: string;
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

export interface StudentAnswer {
  id: string;
  sessionId: string;
  studentId: string;
  examId: string;
  questionId: string;
  answerText: string;
  isMarkedForReview: boolean;
  updatedAt: string;
  aiScore?: number;
  aiFeedback?: string;
  aiIsCorrect?: boolean;
}

export interface Result {
  id: string;
  sessionId: string;
  studentId: string;
  examId: string;
  score: number; // calculated score
  maxScore: number; // total questions
  percentage: number;
  coinsEarned: number;
  passed: boolean;
  submittedAt: string;
  examTitle?: string;
  examSubject?: string;
  gradingFailed?: boolean;
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

export interface LeaderboardEntry {
  studentId: string;
  studentName: string;
  totalScore: number; // cumulative score
  totalCoins: number;
  averagePercentage: number;
  examsAttempted: number;
  rank: number;
}

// Full Scheme Representation
export interface DBStructure {
  users: User[];
  exams: Exam[];
  questions: Question[];
  examSessions: ExamSession[];
  studentAnswers: StudentAnswer[];
  results: Result[];
  monitoringLogs: MonitoringLog[];
}

// Already defined at top

const DB_FILE = IS_VERCEL
  ? path.join("/tmp", "db.json")
  : path.join(process.cwd(), "db.json");

// Default initial state & dynamic Seeding
function getInitialDB(): DBStructure {
  const users: User[] = [
    {
      id: "u-student-1",
      name: "Alex Mercer",
      email: "student@exam.com",
      passwordHash: "password123",
      role: "student",
      coins: 25,
      createdAt: new Date().toISOString(),
    },
    {
      id: "u-student-2",
      name: "Elena Rostova",
      email: "elena@exam.com",
      passwordHash: "password123",
      role: "student",
      coins: 42,
      createdAt: new Date().toISOString(),
    },
    {
      id: "u-admin-1",
      name: "System Admin",
      email: ADMIN_EMAIL,
      passwordHash: ADMIN_PASSWORD,
      role: "admin",
      coins: 0,
      createdAt: new Date().toISOString()
    }
  ];

  const exams: Exam[] = [
    {
      id: "e-ip-pandas-12",
      title: "Unit 1: Data Handling using Pandas & Plotting",
      subject: "Informatics Practices (Class 12)",
      description: "Class 12 CBSE IP Assessment covering pandas series, dataframes and data visualization with pyplot line, bar and histogram charts.",
      durationMinutes: 45,
      isPublished: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: "e-ip-sql-11-12",
      title: "Unit 2: Database Query & SQL Joins",
      subject: "Informatics Practices (Class 11/12)",
      description: "Assessments testing Single Row Functions, Group By aggregate operations, Having condition matching, and Join conditions across tables.",
      durationMinutes: 30,
      isPublished: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: "e-ip-networks-12",
      title: "Unit 3: Computer Networks & Societal Impacts",
      subject: "Informatics Practices (Class 12)",
      description: "Evaluates Network Topologies, dynamic protocols (HTTP/FTP), digital footprint analysis, e-waste, plagiarism, open source, and web safety.",
      durationMinutes: 30,
      isPublished: true,
      createdAt: new Date().toISOString(),
    }
  ];

  const questions: Question[] = [
    // Pandas & Plotting
    {
      id: "q-pandas-1",
      examId: "e-ip-pandas-12",
      type: "MCQ",
      questionText: "Which of the following is correct to create an empty pandas DataFrame?",
      optionA: "import pandas as pd; df = pd.DataFrame()",
      optionB: "import pandas as pd; df = pd.DataFrame([])",
      optionC: "import pandas as pd; df = pd.DataFrame(None)",
      optionD: "All of the above",
      correctOption: "D",
      orderIndex: 0,
      createdAt: new Date().toISOString(),
    },
    {
      id: "q-pandas-2",
      examId: "e-ip-pandas-12",
      type: "SHORT",
      questionText: "Explain the main differences between a Series and a DataFrame in Pandas.",
      modelAnswer: "A pandas Series is a one-dimensional array-like object representing a single column of homogeneous elements. A pandas DataFrame is a two-dimensional, size-mutable tabular structure representing rows and columns of heterogeneous element types.",
      relevantKeywords: "one-dimensional, homogeneous, two-dimensional, tabular, heterogeneous, rows and columns",
      orderIndex: 1,
      createdAt: new Date().toISOString(),
    },
    {
      id: "q-pandas-3",
      examId: "e-ip-pandas-12",
      type: "SHORT",
      questionText: "What is the role of the Matplotlib Pyplot 'show()' function when designing charts?",
      modelAnswer: "The plt.show() function is used to render and display all active figures, generating the graphic window or saving the generated charts on the UI runtime.",
      relevantKeywords: "display, show, figures, render, chart, picture",
      orderIndex: 2,
      createdAt: new Date().toISOString(),
    },

    // Database / SQL
    {
      id: "q-sql-1",
      examId: "e-ip-sql-11-12",
      type: "MCQ",
      questionText: "What will the following SQL query return: SELECT ROUND(345.678, 1)?",
      optionA: "345",
      optionB: "345.6",
      optionC: "345.7",
      optionD: "346",
      correctOption: "C",
      orderIndex: 0,
      createdAt: new Date().toISOString(),
    },
    {
      id: "q-sql-2",
      examId: "e-ip-sql-11-12",
      type: "SHORT",
      questionText: "What is the function of the GROUP BY clause and how to filter groups based on conditions?",
      modelAnswer: "The GROUP BY clause is used to group table rows with identical column values into single summary rows. Group conditions are filtered using the HAVING clause, whereas WHERE operates before groups are formed.",
      relevantKeywords: "group, group by, identical column values, filter groups, having clause, aggregation, summary",
      orderIndex: 1,
      createdAt: new Date().toISOString(),
    },
    {
      id: "q-sql-3",
      examId: "e-ip-sql-11-12",
      type: "LONG",
      questionText: "Why is a Primary Key constraint critical in RDBMS and how does it relate to Referential Integrity (Foreign Key Constraints)?",
      modelAnswer: "A Primary Key is critical because it enforces entity integrity by uniquely identifying each row and prohibiting NULL values. Referential integrity refers to the preservation of consistent links between tables; a Foreign Key ensures children rows reference a valid Primary Key parent element, stopping deletion of critical dependencies and preventing mismatched rows in relational structures.",
      relevantKeywords: "primary key, uniquely identifies, unique, entity integrity, null values, referential integrity, foreign key references, consistency, relational links",
      orderIndex: 2,
      createdAt: new Date().toISOString(),
    },

    // Networks
    {
      id: "q-networks-1",
      examId: "e-ip-networks-12",
      type: "MCQ",
      questionText: "Which topology uses a central controller device (Hub/Switch) connecting all local nodes individually?",
      optionA: "Bus Topology",
      optionB: "Ring Topology",
      optionC: "Star Topology",
      optionD: "Mesh Topology",
      correctOption: "C",
      orderIndex: 0,
      createdAt: new Date().toISOString(),
    },
    {
      id: "q-networks-2",
      examId: "e-ip-networks-12",
      type: "SHORT",
      questionText: "Explain what is a digital footprint and how your online activity contributes to it.",
      modelAnswer: "A digital footprint is the unique data trail created by a user's activities, actions, and uploads across the internet. It accumulates through direct contributions (posts, cookies, messages) and passive ones.",
      relevantKeywords: "data trail, digital trace, online activity, footprints, permanent, internet history",
      orderIndex: 1,
      createdAt: new Date().toISOString(),
    }
  ];

  return {
    users,
    exams,
    questions,
    examSessions: [],
    studentAnswers: [],
    results: [
      {
        id: "res-seed-1",
        sessionId: "sess-seed-1",
        studentId: "u-student-2",
        examId: "e-cyber-101",
        score: 3.0,
        maxScore: 3,
        percentage: 100,
        coinsEarned: 3,
        passed: true,
        submittedAt: new Date(Date.now() - 3600000).toISOString()
      },
      {
        id: "res-seed-2",
        sessionId: "sess-seed-2",
        studentId: "u-student-1",
        examId: "e-js-ds",
        score: 1.0,
        maxScore: 2,
        percentage: 50.0,
        coinsEarned: 1,
        passed: false,
        submittedAt: new Date(Date.now() - 1800000).toISOString()
      }
    ],
    monitoringLogs: []
  };
}

// Core DB Access Operations
export class Database {
  private static cache: DBStructure | null = null;
  private static listenersInitialized = false;
  private static hasCompletedInitialSync = false;
  private static isSeeding = new Map<string, boolean>();
  private static initialSyncPromise: Promise<void> | null = null;
  private static isFirebaseOnline = true;
  private static changeListeners: Array<(collectionName: string) => void> = [];
  private static pollingIntervalId: NodeJS.Timeout | null = null;

  private static knownFirestoreIds: Record<string, Set<string>> = {
    users: new Set(),
    exams: new Set(),
    questions: new Set(),
    examSessions: new Set(),
    studentAnswers: new Set(),
    results: new Set(),
    monitoringLogs: new Set()
  };

  private static deletedDocIds: Record<string, Set<string>> = {
    users: new Set(),
    exams: new Set(),
    questions: new Set(),
    examSessions: new Set(),
    studentAnswers: new Set(),
    results: new Set(),
    monitoringLogs: new Set()
  };

  private static lastFetchTime: Record<string, number> = {
    users: 0,
    exams: 0,
    questions: 0,
    examSessions: 0,
    studentAnswers: 0,
    results: 0,
    monitoringLogs: 0
  };

  public static isOnline(): boolean {
    return this.isFirebaseOnline;
  }

  public static getFirebaseStatus() {
    return {
      online: this.isFirebaseOnline,
      lastFetchTime: this.lastFetchTime,
      counts: this.cache ? {
        users: this.cache.users?.length || 0,
        exams: this.cache.exams?.length || 0,
        questions: this.cache.questions?.length || 0,
        examSessions: this.cache.examSessions?.length || 0,
        studentAnswers: this.cache.studentAnswers?.length || 0,
        results: this.cache.results?.length || 0,
        monitoringLogs: this.cache.monitoringLogs?.length || 0
      } : null
    };
  }

  public static subscribeToChanges(listener: (collectionName: string) => void): () => void {
    this.changeListeners.push(listener);
    return () => {
      this.changeListeners = this.changeListeners.filter((l) => l !== listener);
    };
  }

  private static notifyDbChanged(collectionName: string): void {
    console.log(`[Database] Triggering database change notification for stream: "${collectionName}"`);
    this.changeListeners.forEach((listener) => {
      try {
        listener(collectionName);
      } catch (err) {
        console.error(`[Database] Error calling DB change listener:`, err);
      }
    });
  }

  public static getFirebaseAuth() {
    return firebaseAuth;
  }

  private static initFirebaseSync(): void {
    if (!firestoreDb || this.listenersInitialized) return;
    this.listenersInitialized = true;

    const collectionsToSync = [
      "users",
      "exams",
      "questions",
      "examSessions",
      "studentAnswers",
      "results",
      "monitoringLogs"
    ];

    if (IS_VERCEL) {
      console.log("[FirebaseSync] Serverless/Vercel environment detected. Performing a fast, stateless one-time parallel synchronization...");
      const syncPromises = collectionsToSync.map(async (colName) => {
        try {
          await this.forceSyncCollection(colName);
        } catch (err) {
          console.error(`[FirebaseSync] Stateless initial fetch failed for "${colName}":`, err);
        }
      });
      this.initialSyncPromise = Promise.all(syncPromises)
        .then(() => {
          console.log("[FirebaseSync] Serverless database sync from Firestore completed successfully.");
        });
      return;
    }

    console.log("Initializing real-time Firebase Cloud Firestore synchronization listeners...");

    const syncPromises = collectionsToSync.map((colName) => {
      return new Promise<void>((resolve) => {
        const colRef = fstore.collection(firestoreDb, colName);
        let firstResolveHappened = false;

        const maybeResolve = () => {
          if (!firstResolveHappened) {
            firstResolveHappened = true;
            resolve();
          }
        };

        standardFirestore.onSnapshot(colRef, { includeMetadataChanges: true }, (snapshot: any) => {
          const items: any[] = [];
          const currentIds = new Set<string>();

          snapshot.forEach((docSnapshot) => {
            items.push({ id: docSnapshot.id, ...docSnapshot.data() });
            currentIds.add(docSnapshot.id);
          });

          // Check and handle Firebase online/offline connection state
          const fromCache = snapshot.metadata.fromCache;
          if (Database.isFirebaseOnline === fromCache) {
            Database.isFirebaseOnline = !fromCache;
            console.log(`[FirebaseSync] Connection status update: Online = ${Database.isFirebaseOnline} (via collection "${colName}")`);
          }

          // Track what IDs are actively loaded on Firestore
          this.knownFirestoreIds[colName] = currentIds;
          this.lastFetchTime[colName] = Date.now();

          if (snapshot.empty) {
            // Guard against multiple concurrent seed trigger runs
            if (Database.isSeeding.get(colName)) {
              console.log(`[FirebaseSync] Already seeding "${colName}", skipping duplicate seed...`);
              maybeResolve();
              return;
            }
            Database.isSeeding.set(colName, true);

            // Firestore is empty for this collection.
            // Seed the empty Firestore tables async using the local/seed dataset
            if (this.cache) {
              const localItems = (this.cache as any)[colName] || [];
              if (localItems.length > 0) {
                console.log(`[FirebaseSync] Firestore collection "${colName}" is empty. Seeding ${localItems.length} items from local cache...`);
                let completedCount = 0;
                localItems.forEach((item: any) => {
                  const docId = item.id;
                  if (docId) {
                    fstore.setDoc(fstore.doc(firestoreDb, colName, docId), cleanUndefined(item))
                      .then(() => {
                        completedCount++;
                        if (completedCount === localItems.length) {
                          console.log(`[FirebaseSync] Completed seeding all ${localItems.length} items of "${colName}" successfully to Firestore.`);
                          setTimeout(() => {
                            Database.isSeeding.set(colName, false);
                          }, 1200);
                          Database.notifyDbChanged(colName);
                          maybeResolve();
                        }
                      })
                      .catch((err) => {
                        console.error(`[FirebaseSync] Failed to seed item ${colName}/${docId}:`, err);
                        Database.isSeeding.set(colName, false); // safety fallback reset
                        maybeResolve();
                      });
                  } else {
                    completedCount++;
                  }
                });
              } else {
                Database.isSeeding.set(colName, false);
                maybeResolve();
              }
            } else {
              Database.isSeeding.set(colName, false);
              maybeResolve();
            }
          } else {
            // If we are currently actively writing seed data to Firestore, ignore intermediate callbacks
            if (Database.isSeeding.get(colName)) {
              console.log(`[FirebaseSync] Skipping intermediate snapshot for "${colName}" during seed execution...`);
              maybeResolve();
              return;
            }

            // Received latest remote snapshot from Firestore. Update local memory cache!
            if (!this.cache) {
              this.cache = getInitialDB();
            }

            if (colName === "users") {
              // Protect local default accounts from being truncated/deleted by empty remote or partial snapshots
              const localUsers = (this.cache.users || []) as User[];
              const remoteUsers = items as User[];
              const usersMap = new Map<string, User>();
              
              // 1. Maintain in-memory users
              localUsers.forEach((u) => usersMap.set(u.id, u));
              // 2. Overwrite or insert updated remote users, ensuring they are hashed
              remoteUsers.forEach((ru) => {
                if (ru.passwordHash && !ru.passwordHash.startsWith("$2a$") && !ru.passwordHash.startsWith("$2b$") && !ru.passwordHash.startsWith("$2y$")) {
                  ru.passwordHash = bcrypt.hashSync(ru.passwordHash, 10);
                }
                usersMap.set(ru.id, ru);
              });

              // Enforce valid user roles: students, teachers, and admins
              this.cache.users = Array.from(usersMap.values()).filter(
                (u) => (u.role === "student" || u.role === "teacher" || u.role === "admin") && !Database.deletedDocIds.users.has(u.id)
              );
              console.log(`[FirebaseSync] Synced users payload. Merged count is now ${this.cache.users.length}`);
            } else if (colName === "results") {
              const unfiltered = items.filter((item: any) => !Database.deletedDocIds.results?.has(item.id)) as Result[];
              const uniqueMap = new Map<string, Result>();
              unfiltered.forEach((r) => {
                const existing = uniqueMap.get(r.sessionId);
                if (!existing) {
                  uniqueMap.set(r.sessionId, r);
                } else {
                  const rIsDeterministic = r.id === `res-${r.sessionId}`;
                  const existingIsDeterministic = existing.id === `res-${existing.sessionId}`;
                  if (rIsDeterministic && !existingIsDeterministic) {
                    uniqueMap.set(r.sessionId, r);
                  } else if (rIsDeterministic === existingIsDeterministic) {
                    if (new Date(r.submittedAt).getTime() > new Date(existing.submittedAt).getTime()) {
                      uniqueMap.set(r.sessionId, r);
                    }
                  }
                }
              });
              this.cache.results = Array.from(uniqueMap.values());
            } else {
              (this.cache as any)[colName] = items.filter((item: any) => !Database.deletedDocIds[colName]?.has(item.id));
            }

            // Sync back to db.json file dynamically to retain consistency
            try {
              fs.writeFileSync(DB_FILE, JSON.stringify(this.cache, null, 2), "utf8");
            } catch (e) {
              console.error(`[FirebaseSync] Failed to write local cache block to disk:`, e);
            }

            // Fire real-time notification to active polling streams
            Database.notifyDbChanged(colName);
            maybeResolve();
          }
        }, (error) => {
          console.error(`[FirebaseSync] Error in snapshot listener for collection "${colName}":`, error);
          Database.isFirebaseOnline = false;
          maybeResolve();
        });
      });
    });

    this.initialSyncPromise = Promise.all(syncPromises)
      .then(() => {
        console.log("[FirebaseSync] Initial database synchronization from Firestore completed successfully.");
        
        // Start automatic periodic polling to circumvent throttled/frozen socket connection channels in high-availability serverless containers
        if (!Database.pollingIntervalId) {
          Database.pollingIntervalId = setInterval(() => {
            Database.refreshStaleCollections().catch((err) => {
              console.error("[Database Background Syncer] Failed to poll collections:", err);
            });
          }, 3000);
          if (Database.pollingIntervalId.unref) {
            Database.pollingIntervalId.unref();
          }
        }
      })
      .catch((err) => {
        console.error("[FirebaseSync] Error during database synchronization:", err);
      });
  }

  public static async forceSyncCollection(colName: string): Promise<void> {
    if (!firestoreDb) return;
    try {
      const colRef = fstore.collection(firestoreDb, colName);
      const snapshot = await fstore.getDocs(colRef);
      const items: any[] = [];
      const currentIds = new Set<string>();
      
      snapshot.forEach((docSnapshot) => {
        items.push({ id: docSnapshot.id, ...docSnapshot.data() });
        currentIds.add(docSnapshot.id);
      });
      
      this.knownFirestoreIds[colName] = currentIds;
      this.lastFetchTime[colName] = Date.now();
      
      if (!this.cache) {
        this.cache = getInitialDB();
      }
      
      if (colName === "users") {
        const localUsers = (this.cache.users || []) as User[];
        const remoteUsers = items as User[];
        const usersMap = new Map<string, User>();
        localUsers.forEach((u) => usersMap.set(u.id, u));
        remoteUsers.forEach((ru) => usersMap.set(ru.id, ru));
        
        this.cache.users = Array.from(usersMap.values()).filter(
          (u) => (u.role === "student" || u.role === "teacher" || u.role === "admin") && !Database.deletedDocIds.users.has(u.id)
        );
      } else if (colName === "results") {
        const unfiltered = items.filter((item: any) => !Database.deletedDocIds.results?.has(item.id)) as Result[];
        const uniqueMap = new Map<string, Result>();
        unfiltered.forEach((r) => {
          const existing = uniqueMap.get(r.sessionId);
          if (!existing) {
            uniqueMap.set(r.sessionId, r);
          } else {
            const rIsDeterministic = r.id === `res-${r.sessionId}`;
            const existingIsDeterministic = existing.id === `res-${existing.sessionId}`;
            if (rIsDeterministic && !existingIsDeterministic) {
              uniqueMap.set(r.sessionId, r);
            } else if (rIsDeterministic === existingIsDeterministic) {
              if (new Date(r.submittedAt).getTime() > new Date(existing.submittedAt).getTime()) {
                uniqueMap.set(r.sessionId, r);
              }
            }
          }
        });
        this.cache.results = Array.from(uniqueMap.values());
      } else {
        (this.cache as any)[colName] = items.filter((item: any) => !Database.deletedDocIds[colName]?.has(item.id));
      }
      
      try {
        fs.writeFileSync(DB_FILE, JSON.stringify(this.cache, null, 2), "utf8");
      } catch (e) {
        // ignore
      }
    } catch (err) {
      console.error(`[FirebaseSync] Error forcing sync for collection ${colName}:`, err);
    }
  }

  private static async refreshStaleCollections(): Promise<void> {
    if (!firestoreDb) return;
    const now = Date.now();
    const collectionsToSync = [
      "users",
      "exams",
      "questions",
      "examSessions",
      "studentAnswers",
      "results",
      "monitoringLogs"
    ];

    for (const colName of collectionsToSync) {
      const last = this.lastFetchTime[colName] || 0;
      // Under serverless CPU-throttled states, active snapshot socket channels can miss transitions.
      // Periodically trigger a lightweight direct read fallback if we haven't seen an update in >= 2500ms
      if (now - last > 2500) {
        if (Database.isSeeding.get(colName)) {
          continue;
        }
        try {
          const colRef = fstore.collection(firestoreDb, colName);
          const snapshot = await fstore.getDocs(colRef);
          
          const items: any[] = [];
          const currentIds = new Set<string>();
          
          snapshot.forEach((docSnapshot) => {
            items.push({ id: docSnapshot.id, ...docSnapshot.data() });
            currentIds.add(docSnapshot.id);
          });
          
          this.knownFirestoreIds[colName] = currentIds;
          this.lastFetchTime[colName] = Date.now();
          
          if (!snapshot.empty) {
            if (!this.cache) {
              this.cache = getInitialDB();
            }
            
            if (colName === "users") {
              const localUsers = (this.cache.users || []) as User[];
              const remoteUsers = items as User[];
              const usersMap = new Map<string, User>();
              localUsers.forEach((u) => usersMap.set(u.id, u));
              remoteUsers.forEach((ru) => {
                if (ru.passwordHash && !ru.passwordHash.startsWith("$2a$") && !ru.passwordHash.startsWith("$2b$") && !ru.passwordHash.startsWith("$2y$")) {
                  ru.passwordHash = bcrypt.hashSync(ru.passwordHash, 10);
                }
                usersMap.set(ru.id, ru);
              });
              
              this.cache.users = Array.from(usersMap.values()).filter(
                (u) => (u.role === "student" || u.role === "teacher" || u.role === "admin") &&
                       !Database.deletedDocIds.users.has(u.id)
              );
            } else if (colName === "results") {
              const unfiltered = items.filter((item: any) => !Database.deletedDocIds.results?.has(item.id)) as Result[];
              const uniqueMap = new Map<string, Result>();
              unfiltered.forEach((r) => {
                const existing = uniqueMap.get(r.sessionId);
                if (!existing) {
                  uniqueMap.set(r.sessionId, r);
                } else {
                  const rIsDeterministic = r.id === `res-${r.sessionId}`;
                  const existingIsDeterministic = existing.id === `res-${existing.sessionId}`;
                  if (rIsDeterministic && !existingIsDeterministic) {
                    uniqueMap.set(r.sessionId, r);
                  } else if (rIsDeterministic === existingIsDeterministic) {
                    if (new Date(r.submittedAt).getTime() > new Date(existing.submittedAt).getTime()) {
                      uniqueMap.set(r.sessionId, r);
                    }
                  }
                }
              });
              this.cache.results = Array.from(uniqueMap.values());
            } else {
              (this.cache as any)[colName] = items.filter((item: any) => !Database.deletedDocIds[colName]?.has(item.id));
            }
          } else {
            // Firestore collection has been emptied
            if (this.cache) {
              if (colName === "users") {
                const localUsers = (this.cache.users || []) as User[];
                this.cache.users = localUsers.filter((u) => u.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
              } else {
                (this.cache as any)[colName] = [];
              }
            }
          }

          if (this.cache) {
            try {
              fs.writeFileSync(DB_FILE, JSON.stringify(this.cache, null, 2), "utf8");
            } catch (e) {
              // ignore
            }
          }

          Database.isFirebaseOnline = true;
          Database.notifyDbChanged(colName);
        } catch (err) {
          console.error(`[FirebaseSync] Direct cache-refresh fallback for "${colName}" failed:`, err);
          Database.isFirebaseOnline = false;
        }
      }
    }
  }

  public static async ensureSync(): Promise<void> {
    this.load();
    if (this.hasCompletedInitialSync) {
      return;
    }
    if (this.initialSyncPromise) {
      const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, 1200));
      await Promise.race([this.initialSyncPromise, timeoutPromise]);
    }
    this.hasCompletedInitialSync = true;
    console.log(`[Database] Initial database synchronization check complete (offline-safe timeout resolved).`);
  }

  public static load(): DBStructure {
    if (this.cache) {
      return this.cache;
    }
    try {
      if (!fs.existsSync(DB_FILE)) {
        if (IS_VERCEL) {
          const localDbPath = path.join(process.cwd(), "db.json");
          if (fs.existsSync(localDbPath)) {
            try {
              fs.copyFileSync(localDbPath, DB_FILE);
              console.log("[Database load] Copied local db.json seed to writable /tmp/db.json");
            } catch (err) {
              console.error("[Database load] Failed to copy local db.json to /tmp/db.json, seeding manually...", err);
              const initial = getInitialDB();
              fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), "utf8");
            }
          } else {
            const initial = getInitialDB();
            fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), "utf8");
          }
        } else {
          const initial = getInitialDB();
          fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), "utf8");
        }
        const data = fs.readFileSync(DB_FILE, "utf8");
        this.cache = JSON.parse(data) as DBStructure;
      } else {
        const data = fs.readFileSync(DB_FILE, "utf8");
        this.cache = JSON.parse(data) as DBStructure;
      }
      
      const db = this.cache;
      let migrated = false;

      // Auto-deduplicate results on startup
      if (db.results && Array.isArray(db.results)) {
        const uniqueResultsMap = new Map<string, Result>();
        let hadDuplicates = false;
        db.results.forEach((r) => {
          const existing = uniqueResultsMap.get(r.sessionId);
          if (!existing) {
            uniqueResultsMap.set(r.sessionId, r);
          } else {
            hadDuplicates = true;
            const rIsDeterministic = r.id === `res-${r.sessionId}`;
            const existingIsDeterministic = existing.id === `res-${existing.sessionId}`;
            if (rIsDeterministic && !existingIsDeterministic) {
              uniqueResultsMap.set(r.sessionId, r);
            } else if (rIsDeterministic === existingIsDeterministic) {
              if (new Date(r.submittedAt).getTime() > new Date(existing.submittedAt).getTime()) {
                uniqueResultsMap.set(r.sessionId, r);
              }
            }
          }
        });
        if (hadDuplicates) {
          db.results = Array.from(uniqueResultsMap.values());
          migrated = true;
        }
      }

      // Ensure admin users exist
      let adminsAdded = false;
      if (!db.users) {
        db.users = [];
      }

      // Enforce valid user roles: students, teachers, and admins
      const originalCount = db.users.length;
      db.users = db.users.filter(
        (u) => u.role === "student" || u.role === "teacher" || u.role === "admin"
      );
      if (db.users.length !== originalCount) {
        adminsAdded = true;
      }

      if (!db.users.some(u => u.email.toLowerCase() === ADMIN_EMAIL.toLowerCase())) {
        const adminUser: User = {
          id: "u-admin-portal",
          name: "System Admin",
          email: ADMIN_EMAIL,
          passwordHash: ADMIN_PASSWORD,
          role: "admin",
          coins: 0,
          createdAt: new Date().toISOString()
        };
        db.users.push(adminUser);
        adminsAdded = true;

        // Directly write it to Firestore if possible to prevent delay-overwrite by snapshot listeners
        if (firestoreDb) {
          fstore.setDoc(fstore.doc(firestoreDb, "users", adminUser.id), cleanUndefined(adminUser)).catch((err) => {
            console.error("[Database load] Failed to sync new secure admin to Firestore:", err);
          });
        }
      }

      // Auto-migrate any legacy plain text user passwords to secure bcrypt hashes
      let passwordsMigrated = false;
      if (db.users && Array.isArray(db.users)) {
        db.users.forEach((u) => {
          if (u.passwordHash && !u.passwordHash.startsWith("$2a$") && !u.passwordHash.startsWith("$2b$") && !u.passwordHash.startsWith("$2y$")) {
            u.passwordHash = bcrypt.hashSync(u.passwordHash, 10);
            passwordsMigrated = true;
          }
        });
      }
      
      // Auto-migrate any existing legacy exams in db.json lacking subject attribute
      migrated = false;
      if (db.exams && Array.isArray(db.exams)) {
        db.exams.forEach((exam: any) => {
          if (!exam.subject) {
            exam.subject = "General";
            migrated = true;
          }
          if (exam.examClass === "12") {
            exam.examClass = "12th";
            migrated = true;
          } else if (exam.examClass === "11") {
            exam.examClass = "11th";
            migrated = true;
          }
        });
      }

      // Auto-migrate student class strings like "12" to "12th" and "11" to "11th"
      let classesMigrated = false;
      if (db.users && Array.isArray(db.users)) {
        db.users.forEach((u) => {
          if (u.role === "student") {
            if (u.studentClass === "12") {
              u.studentClass = "12th";
              classesMigrated = true;
            } else if (u.studentClass === "11") {
              u.studentClass = "11th";
              classesMigrated = true;
            }
          }
        });
      }

      if (migrated || adminsAdded || passwordsMigrated || classesMigrated) {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
      }
      
      // Initialize real-time listeners asynchronously
      this.initFirebaseSync();

      return db;
    } catch (e) {
      console.error("Failed to load simulated database, falling back to seed structure:", e);
      this.cache = getInitialDB();
      this.initFirebaseSync();
      return this.cache;
    }
  }

  private static save(db: DBStructure, collectionName?: string, itemsToSync?: any | any[]): void {
    this.cache = db;
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), "utf8");
    } catch (e) {
      console.error("Failed to persist simulated database changes:", e);
    }

    if (collectionName) {
      this.lastFetchTime[collectionName] = Date.now();
      this.notifyDbChanged(collectionName);
    }

    // Asynchronously sync specific updates/saves to live Firestore Database with fine-grained precision
    if (firestoreDb && collectionName && itemsToSync !== undefined) {
      const items = Array.isArray(itemsToSync) ? itemsToSync : [itemsToSync];
      items.forEach((item: any) => {
        if (item && item.id) {
          fstore.setDoc(fstore.doc(firestoreDb, collectionName, item.id), cleanUndefined(item)).catch((err) => {
            console.error(`[FirebaseSync] Failed to set document ${collectionName}/${item.id}:`, err);
          });
        }
      });
    }
  }

  // Users Helper
  public static getUsers(): User[] {
    return this.load().users;
  }

  public static getUserById(id: string): User | undefined {
    return this.getUsers().find((u) => u.id === id);
  }

  public static getUserByEmail(email: string): User | undefined {
    if (!email) return undefined;
    const cleanEmail = email.trim().toLowerCase();
    return this.getUsers().find((u) => u.email.trim().toLowerCase() === cleanEmail);
  }

  public static createUser(name: string, email: string, passwordHash: string, role: "teacher" | "student" | "admin", studentClass?: string, studentSection?: string, studentStream?: string): User {
    const db = this.load();
    const isHashed = passwordHash.startsWith("$2a$") || passwordHash.startsWith("$2b$") || passwordHash.startsWith("$2y$");
    const hashedPassword = isHashed ? passwordHash : bcrypt.hashSync(passwordHash, 10);
    const newUser: User = {
      id: "u-" + Math.random().toString(36).substring(2, 11),
      name,
      email: email.trim().toLowerCase(),
      passwordHash: hashedPassword,
      role,
      coins: 0,
      createdAt: new Date().toISOString(),
      studentClass,
      studentSection,
      studentStream,
    };
    db.users.push(newUser);
    this.save(db, "users", newUser);
    return newUser;
  }

  public static updateUser(id: string, name: string, email: string, passwordHash?: string): User | undefined {
    const db = this.load();
    const idx = db.users.findIndex((u) => u.id === id);
    if (idx !== -1) {
      // Check for email conflicts
      const cleanEmail = email.trim().toLowerCase();
      const conflict = db.users.find((u) => u.email.trim().toLowerCase() === cleanEmail && u.id !== id);
      if (conflict) {
        throw new Error("Email address is already in use by another account.");
      }
      db.users[idx].name = name;
      db.users[idx].email = cleanEmail;
      if (passwordHash) {
        const isHashed = passwordHash.startsWith("$2a$") || passwordHash.startsWith("$2b$") || passwordHash.startsWith("$2y$");
        db.users[idx].passwordHash = isHashed ? passwordHash : bcrypt.hashSync(passwordHash, 10);
      }
      this.save(db, "users", db.users[idx]);
      return db.users[idx];
    }
    return undefined;
  }

  public static updateUserByAdmin(id: string, name: string, email: string, role: "student" | "teacher" | "admin", passwordHash?: string, studentClass?: string, studentSection?: string, studentStream?: string): User | undefined {
    const db = this.load();
    const idx = db.users.findIndex((u) => u.id === id);
    if (idx !== -1) {
      const cleanEmail = email.trim().toLowerCase();
      const conflict = db.users.find((u) => u.email.trim().toLowerCase() === cleanEmail && u.id !== id);
      if (conflict) {
        throw new Error("Email address is already in use by another account.");
      }
      db.users[idx].name = name;
      db.users[idx].email = cleanEmail;
      db.users[idx].role = role;
      if (studentClass !== undefined) db.users[idx].studentClass = studentClass;
      if (studentSection !== undefined) db.users[idx].studentSection = studentSection;
      if (studentStream !== undefined) db.users[idx].studentStream = studentStream;
      if (passwordHash) {
        const isHashed = passwordHash.startsWith("$2a$") || passwordHash.startsWith("$2b$") || passwordHash.startsWith("$2y$");
        db.users[idx].passwordHash = isHashed ? passwordHash : bcrypt.hashSync(passwordHash, 10);
      }
      this.save(db, "users", db.users[idx]);
      return db.users[idx];
    }
    return undefined;
  }

  public static deleteUser(id: string): void {
    const db = this.load();
    const idx = db.users.findIndex((u) => u.id === id);
    if (idx !== -1) {
      Database.deletedDocIds.users.add(id);
      db.users.splice(idx, 1);
      this.save(db, "users");
      
      // Explicitly delete from Firestore to avoid accidental resurrects or deletions
      if (firestoreDb) {
        fstore.deleteDoc(fstore.doc(firestoreDb, "users", id)).catch((err) => {
          console.error(`[FirebaseSync] Failed to delete user ${id} from Firestore:`, err);
        });
      }
    }
  }

  public static addCoins(studentId: string, coinsToAdd: number): void {
    const db = this.load();
    const idx = db.users.findIndex((u) => u.id === studentId);
    if (idx !== -1) {
      db.users[idx].coins = Math.max(0, db.users[idx].coins + coinsToAdd);
      this.save(db, "users", db.users[idx]);
    }
  }

  // Exams Helper (1 subject absolute rule)
  public static getExams(): Exam[] {
    return this.load().exams;
  }

  public static getExamById(id: string): Exam | undefined {
    return this.getExams().find((e) => e.id === id);
  }

  public static createExam(title: string, subject: string, description: string, durationMinutes: number): Exam {
    const db = this.load();
    const newExam: Exam = {
      id: "e-" + Math.random().toString(36).substring(2, 11),
      title,
      subject: subject || "General",
      description,
      durationMinutes,
      isPublished: false,
      createdAt: new Date().toISOString(),
    };
    db.exams.push(newExam);
    this.save(db, "exams", newExam);
    return newExam;
  }

  public static updateExam(id: string, updates: Partial<Omit<Exam, "id" | "createdAt">>): Exam | undefined {
    const db = this.load();
    const idx = db.exams.findIndex((e) => e.id === id);
    if (idx === -1) return undefined;
    db.exams[idx] = { ...db.exams[idx], ...updates };
    this.save(db, "exams", db.exams[idx]);
    return db.exams[idx];
  }

  public static deleteExam(id: string): boolean {
    const db = this.load();
    const idx = db.exams.findIndex((e) => e.id === id);
    if (idx === -1) {
      console.log(`[Database.deleteExam] Exam not found ID: "${id}"`);
      return false;
    }

    console.log(`[Database.deleteExam] Soft deleting exam ID: "${id}".`);

    // Flag as deleted and unpublish so it's not visible in available list
    db.exams[idx].isDeleted = true;
    db.exams[idx].isPublished = false;

    this.save(db, "exams", db.exams[idx]);

    // Explicitly update Firestore with isDeleted: true
    if (firestoreDb) {
      console.log(`[Database.deleteExam] Syncing soft deletion on Firestore for exam: ${id}`);
      fstore.setDoc(fstore.doc(firestoreDb, "exams", id), cleanUndefined(db.exams[idx])).catch((err) => {
        console.error(`[Database.deleteExam] Error updating Firestore soft-deleted exam "${id}":`, err);
      });
    }

    console.log(`[Database.deleteExam] Soft deletion outcome: SUCCESS`);
    return true;
  }

  // Questions Helper
  public static getQuestions(examId?: string): Question[] {
    const questions = this.load().questions;
    if (examId) {
      return questions
        .filter((q) => q.examId === examId)
        .sort((a, b) => a.orderIndex - b.orderIndex);
    }
    return questions;
  }

  public static getQuestionById(id: string): Question | undefined {
    return this.load().questions.find((q) => q.id === id);
  }

  public static createQuestion(examId: string, data: Omit<Question, "id" | "examId" | "orderIndex" | "createdAt">): Question {
    const db = this.load();
    const siblings = db.questions.filter((q) => q.examId === examId);
    const maxOrder = siblings.reduce((max, cur) => cur.orderIndex > max ? cur.orderIndex : max, -1);
    
    const newQuestion: Question = {
      ...data,
      id: "q-" + Math.random().toString(36).substring(2, 11),
      examId,
      orderIndex: maxOrder + 1,
      createdAt: new Date().toISOString()
    };
    db.questions.push(newQuestion);
    this.save(db, "questions", newQuestion);
    return newQuestion;
  }

  public static updateQuestion(id: string, updates: Partial<Omit<Question, "id" | "examId" | "createdAt">>): Question | undefined {
    const db = this.load();
    const idx = db.questions.findIndex((q) => q.id === id);
    if (idx === -1) return undefined;
    db.questions[idx] = { ...db.questions[idx], ...updates };
    this.save(db, "questions", db.questions[idx]);
    return db.questions[idx];
  }

  public static deleteQuestion(id: string): boolean {
    const db = this.load();
    const idx = db.questions.findIndex((q) => q.id === id);
    if (idx === -1) return false;
    
    // Register deleted ID
    Database.deletedDocIds.questions.add(id);

    const examId = db.questions[idx].examId;
    db.questions.splice(idx, 1);
    
    // Fix ordering indexes for remaining questions in that exam
    const siblings = db.questions
      .filter((q) => q.examId === examId)
      .sort((a, b) => a.orderIndex - b.orderIndex);
    
    siblings.forEach((q, i) => {
      q.orderIndex = i;
    });
    
    this.save(db, "questions", siblings);

    // Explicitly delete from Firestore
    if (firestoreDb) {
      fstore.deleteDoc(fstore.doc(firestoreDb, "questions", id)).catch((err) => {
        console.error(`[FirebaseSync] Failed to delete question ${id} from Firestore:`, err);
      });
    }

    return true;
  }

  public static reorderQuestions(examId: string, orderedIds: string[]): boolean {
    const db = this.load();
    const lookup = new Set(orderedIds);
    // Find all questions for this exam
    db.questions.forEach((q) => {
      if (q.examId === examId) {
        const index = orderedIds.indexOf(q.id);
        if (index !== -1) {
          q.orderIndex = index;
        }
      }
    });
    const updatedQuestions = db.questions.filter((q) => q.examId === examId);
    this.save(db, "questions", updatedQuestions);
    return true;
  }

  // Exam Sessions / Autosave / Session Recovery
  public static getOrCreateSession(studentId: string, examId: string): ExamSession {
    const db = this.load();
    let session = db.examSessions.find((s) => s.studentId === studentId && s.examId === examId);
    if (!session) {
      session = {
        id: "sess-" + Math.random().toString(36).substring(2, 11),
        studentId,
        examId,
        currentQuestionId: null,
        tabSwitchCount: 0,
        windowBlurCount: 0,
        fullscreenExitCount: 0,
        inactivityWarnings: 0,
        status: "ACTIVE",
        startedAt: new Date().toISOString(),
        lastActivityAt: new Date().toISOString(),
      };
      db.examSessions.push(session);
      
      // Create a starting log
      const startLog = {
        id: "log-" + Math.random().toString(36).substring(2, 11),
        sessionId: session.id,
        studentId,
        examId,
        eventType: "START" as const,
        details: `Exam session initiated. Autorescue enabled.`,
        timestamp: new Date().toISOString()
      };
      db.monitoringLogs.push(startLog);

      this.save(db, "examSessions");
      if (firestoreDb) {
        fstore.setDoc(fstore.doc(firestoreDb, "examSessions", session.id), cleanUndefined(session)).catch(() => {});
        fstore.setDoc(fstore.doc(firestoreDb, "monitoringLogs", startLog.id), cleanUndefined(startLog)).catch(() => {});
      }
    }
    return session;
  }

  public static getActiveSession(studentId: string, examId: string): ExamSession | undefined {
    return this.load().examSessions.find(
      (s) => s.studentId === studentId && s.examId === examId
    );
  }

  public static getLiveSessions(): (ExamSession & { 
    studentName: string; 
    examTitle: string; 
    recentEvent?: string;
    currentQuestionNum?: number;
    currentQuestionText?: string;
    totalQuestionsCount?: number;
    answeredCount?: number;
    timeLeftSec?: number;
  })[] {
    const db = this.load();
    const activeRaw = db.examSessions;
    return activeRaw.map((sess) => {
      const student = db.users.find((u) => u.id === sess.studentId);
      const exam = db.exams.find((e) => e.id === sess.examId);
      const logs = db.monitoringLogs
        .filter((l) => l.sessionId === sess.id)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      const examQuestions = db.questions
        .filter((q) => q.examId === sess.examId)
        .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
      
      const currentQuestionIndex = examQuestions.findIndex((q) => q.id === sess.currentQuestionId);
      const currentQuestionNum = currentQuestionIndex !== -1 ? currentQuestionIndex + 1 : 1;
      const currentQuestionText = currentQuestionIndex !== -1 ? examQuestions[currentQuestionIndex].questionText : "Not loaded";
      
      const totalQuestionsCount = examQuestions.length;
      const answeredCount = db.studentAnswers.filter((a) => a.sessionId === sess.id && a.answerText && a.answerText.trim() !== "").length;
      
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(sess.startedAt).getTime()) / 1000));
      const durationSeconds = (exam ? exam.durationMinutes : 0) * 60;
      const timeLeftSec = Math.max(0, durationSeconds - elapsedSeconds);

      return {
        ...sess,
        studentName: student ? student.name : "Unknown Student",
        examTitle: exam ? exam.title : "Deleted Exam",
        recentEvent: logs.length > 0 ? `${logs[0].eventType}: ${logs[0].details}` : undefined,
        currentQuestionNum,
        currentQuestionText,
        totalQuestionsCount,
        answeredCount,
        timeLeftSec
      };
    }).sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());
  }

  public static updateSessionState(
    sessionId: string, 
    data: Partial<Pick<ExamSession, "currentQuestionId" | "tabSwitchCount" | "windowBlurCount" | "fullscreenExitCount" | "inactivityWarnings" | "status">>
  ): ExamSession | undefined {
    const db = this.load();
    const idx = db.examSessions.findIndex((s) => s.id === sessionId);
    if (idx === -1) return undefined;
    
    db.examSessions[idx] = {
      ...db.examSessions[idx],
      ...data,
      lastActivityAt: new Date().toISOString()
    };
    this.save(db, "examSessions", db.examSessions[idx]);
    return db.examSessions[idx];
  }

  // Answers & Autosave
  public static saveStudentAnswer(
    studentId: string, 
    examId: string, 
    questionId: string, 
    answerText: string, 
    isMarkedForReview: boolean
  ): StudentAnswer {
    const db = this.load();
    const session = db.examSessions.find((s) => s.studentId === studentId && s.examId === examId);
    if (!session) {
      throw new Error("Active exam session does not exist");
    }

    let answer = db.studentAnswers.find((a) => a.sessionId === session.id && a.questionId === questionId);
    if (answer) {
      answer.answerText = answerText;
      answer.isMarkedForReview = isMarkedForReview;
      answer.updatedAt = new Date().toISOString();
    } else {
      answer = {
        id: "ans-" + Math.random().toString(36).substring(2, 11),
        sessionId: session.id,
        studentId,
        examId,
        questionId,
        answerText,
        isMarkedForReview,
        updatedAt: new Date().toISOString(),
      };
      db.studentAnswers.push(answer);
    }

    // Refresh last activity of the session
    const sessIdx = db.examSessions.findIndex((s) => s.id === session.id);
    if (sessIdx !== -1) {
      db.examSessions[sessIdx].lastActivityAt = new Date().toISOString();
      db.examSessions[sessIdx].currentQuestionId = questionId;
      this.save(db, "examSessions", db.examSessions[sessIdx]);
    }

    this.save(db, "studentAnswers", answer);
    return answer;
  }

  public static getAnswersForSession(sessionId: string): StudentAnswer[] {
    return this.load().studentAnswers.filter((a) => a.sessionId === sessionId);
  }

  // Cheating & Live Monitoring Logging
  public static logCheatingEvent(
    sessionId: string,
    eventType: MonitoringLog["eventType"],
    details: string
  ): MonitoringLog | undefined {
    const db = this.load();
    const session = db.examSessions.find((s) => s.id === sessionId);
    if (!session) return undefined;

    const newLog: MonitoringLog = {
      id: "log-" + Math.random().toString(36).substring(2, 11),
      sessionId,
      studentId: session.studentId,
      examId: session.examId,
      eventType,
      details,
      timestamp: new Date().toISOString(),
    };
    db.monitoringLogs.push(newLog);

    // Increment counter in session
    const sIdx = db.examSessions.findIndex((s) => s.id === sessionId);
    if (sIdx !== -1) {
      if (eventType === "TAB_SWITCH") db.examSessions[sIdx].tabSwitchCount++;
      if (eventType === "WINDOW_BLUR") db.examSessions[sIdx].windowBlurCount++;
      if (eventType === "FULLSCREEN_EXIT") db.examSessions[sIdx].fullscreenExitCount++;
      if (eventType === "INACTIVITY") db.examSessions[sIdx].inactivityWarnings++;
      db.examSessions[sIdx].lastActivityAt = new Date().toISOString();
    }

    this.save(db, "monitoringLogs", newLog);
    if (sIdx !== -1) {
      this.save(db, "examSessions", db.examSessions[sIdx]);
    }
  }

  public static getSessionLogs(sessionId: string): MonitoringLog[] {
    return this.load().monitoringLogs
      .filter((l) => l.sessionId === sessionId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  // EVALUATION & SUBMISSION SYSTEM
  // High-efficiency Batch Gemini API grading engine
  public static async evaluateExamSheet(
    sheet: {
      questionIndex: number;
      type: "MCQ" | "SHORT" | "LONG";
      questionText: string;
      modelAnswer: string;
      keywords: string;
      studentAnswer: string;
    }[]
  ): Promise<{ questionIndex: number; isCorrect: boolean; score: number; feedback: string }[]> {
    try {
      const prompt = `Please grade the following student exam answers based on the provided questions and model answers.

Exam Sheet:
${JSON.stringify(sheet, null, 2)}

Produce a response in JSON format.`;

      const response = await getGeminiClient().models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: `You are an advanced academic corrector. Your task is to process the incoming list of answers, evaluate the conceptual accuracy of each response leniently (prioritizing overall meaning and correct understanding of technical key concepts over rigid vocabulary matching, exact spelling, or punctuation), ignore minor grammar or spelling errors, and assign a proportional grade (0-100%).

For MCQ (multiple choice) questions, compare the student's answer text directly to the correct option string or option letter. If they match, assign a score of 100, isCorrect as true, and helpful feedback. Otherwise, assign a score of 0 and isCorrect as false.
For SHORT and LONG text questions, be an expert and fair educator. Award partial credit proportional to their degree of correct concepts explained.

Returned output must be a root JSON object containing a structured array with the key "grades" that exactly matches the sequence and total count of the incoming list of questions. Each item in the returned array must contain:
- "questionIndex": number (matching the input questionIndex)
- "isCorrect": boolean (true if score is 50 or higher, otherwise false)
- "score": number (proportional integer from 0 to 100)
- "feedback": string (a short constructive, polite explanation describing why marks were awarded or where they missed a key point)`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              grades: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    questionIndex: { type: Type.INTEGER },
                    isCorrect: { type: Type.BOOLEAN },
                    score: { type: Type.INTEGER },
                    feedback: { type: Type.STRING }
                  },
                  required: ["questionIndex", "isCorrect", "score", "feedback"]
                }
              }
            },
            required: ["grades"]
          }
        }
      });

      const textOutput = response.text || "";
      const parsed = JSON.parse(textOutput.trim());
      if (parsed && Array.isArray(parsed.grades)) {
        return parsed.grades;
      }
      throw new Error("Invalid schema structure returned from Gemini API");
    } catch (error: any) {
      const isRateLimit = error && (
        error.status === 429 ||
        error.statusCode === 429 ||
        String(error.message || "").toLowerCase().includes("429") ||
        String(error.message || "").toLowerCase().includes("resource_exhausted") ||
        String(error.message || "").toLowerCase().includes("rate limit") ||
        String(error.message || "").toLowerCase().includes("quota")
      );
      if (isRateLimit) {
        throw error;
      }

      console.error("Gemini batch grading failed, running secure fallback:", error);
      // Clean fail-safe fallback: no manual keywords loops, tokenizers, regex, or manual calculations
      return sheet.map((item) => {
        const hasTypedAnswer = !!(item.studentAnswer && item.studentAnswer.trim());
        const isMcq = item.type === "MCQ";
        const isMcqCorrect = isMcq && (item.studentAnswer.trim().toUpperCase() === item.modelAnswer.trim().toUpperCase());

        return {
          questionIndex: item.questionIndex,
          isCorrect: isMcq ? isMcqCorrect : false,
          score: isMcq ? (isMcqCorrect ? 100 : 0) : 0,
          feedback: isMcq
            ? (isMcqCorrect ? "Correct MCQ answer." : (hasTypedAnswer ? "Incorrect MCQ answer." : "No answer was provided."))
            : (hasTypedAnswer ? "Fallback: Evaluation failed. Answer scored 0." : "No answer was provided.")
        };
      });
    }
  }

  public static async terminateExamWithPenalty(studentId: string, examId: string): Promise<Result> {
    if (firestoreDb) {
      await this.forceSyncCollection("examSessions");
      await this.forceSyncCollection("studentAnswers");
      await this.forceSyncCollection("users");
    }

    const db = this.load();
    const session = db.examSessions.find((s) => s.studentId === studentId && s.examId === examId);
    if (!session) {
      throw new Error("No active exam session found to terminate.");
    }

    // Always ensure the session is marked as SUBMITTED with the current timestamp
    session.status = "SUBMITTED";
    session.lastActivityAt = new Date().toISOString();

    const questions = db.questions.filter((q) => q.examId === examId);
    const maxScore = questions.length;

    // Set all student answer records to score 0 with a conceptual violation explanation
    questions.forEach((q) => {
      const studentAnsIdx = db.studentAnswers.findIndex(
        (a) => a.sessionId === session.id && a.questionId === q.id
      );
      if (studentAnsIdx !== -1) {
        db.studentAnswers[studentAnsIdx].aiScore = 0;
        db.studentAnswers[studentAnsIdx].aiFeedback = "Exam terminated instantly due to secure window/tab switch or fullscreen exit violation.";
        db.studentAnswers[studentAnsIdx].aiIsCorrect = false;
        db.studentAnswers[studentAnsIdx].updatedAt = new Date().toISOString();
      } else {
        const blankAns = {
          id: "ans-" + Math.random().toString(36).substring(2, 11),
          sessionId: session.id,
          studentId,
          examId,
          questionId: q.id,
          answerText: "",
          isMarkedForReview: false,
          updatedAt: new Date().toISOString(),
          aiScore: 0,
          aiFeedback: "Exam terminated instantly due to secure window/tab switch or fullscreen exit violation.",
          aiIsCorrect: false
        };
        db.studentAnswers.push(blankAns);
      }
    });

    // Deduct exactly 1 coin from the student total coins balance.
    // If student already has 0 coins, subtracting 1 gets -1.
    const sIdx = db.users.findIndex((u) => u.id === studentId);
    if (sIdx !== -1) {
      const currentCoins = typeof db.users[sIdx].coins === "number" ? db.users[sIdx].coins : 0;
      db.users[sIdx].coins = currentCoins - 1;
    }

    const examItem = db.exams.find((e) => e.id === examId);
    const examTitle = examItem ? examItem.title : "Exam";
    const examSubject = examItem ? (examItem.subject || "General") : "General";

    // Create a Result of 0 score and 0 coins earned
    const newResult: Result = {
      id: `res-${session.id}`,
      sessionId: session.id,
      studentId,
      examId,
      score: 0,
      maxScore,
      percentage: 0,
      coinsEarned: 0,
      passed: false,
      submittedAt: new Date().toISOString(),
      examTitle,
      examSubject
    };

    db.results = db.results.filter((r) => r.sessionId !== session.id);
    db.results.push(newResult);

    // Create precise monitoring log
    const finalLog = {
      id: "log-" + Math.random().toString(36).substring(2, 11),
      sessionId: session.id,
      studentId,
      examId,
      eventType: "SUBMIT" as const,
      details: "Exam terminated instantly due to secure window/tab switch or fullscreen exit violation. Score set to zero. 1 coin has been deducted from total balance.",
      timestamp: new Date().toISOString()
    };
    db.monitoringLogs.push(finalLog);

    this.save(db, "examSessions");

    if (firestoreDb) {
      fstore.setDoc(fstore.doc(firestoreDb, "examSessions", session.id), cleanUndefined(session)).catch(() => {});
      fstore.setDoc(fstore.doc(firestoreDb, "results", newResult.id), cleanUndefined(newResult)).catch(() => {});
      fstore.setDoc(fstore.doc(firestoreDb, "monitoringLogs", finalLog.id), cleanUndefined(finalLog)).catch(() => {});
      
      const sessAnswers = db.studentAnswers.filter((a) => a.sessionId === session.id);
      for (const ans of sessAnswers) {
        fstore.setDoc(fstore.doc(firestoreDb, "studentAnswers", ans.id), cleanUndefined(ans)).catch(() => {});
      }

      const user = db.users.find((u) => u.id === studentId);
      if (user) {
        fstore.setDoc(fstore.doc(firestoreDb, "users", user.id), cleanUndefined(user)).catch(() => {});
      }
    }

    return newResult;
  }

  public static async evaluateExam(studentId: string, examId: string, isTimerExpired: boolean = false): Promise<Result> {
    if (firestoreDb) {
      await this.forceSyncCollection("examSessions");
      await this.forceSyncCollection("studentAnswers");
      await this.forceSyncCollection("users");
    }

    const db = this.load();
    const session = db.examSessions.find((s) => s.studentId === studentId && s.examId === examId);
    if (!session) {
      throw new Error("No exam session found to evaluate. Please ensure you have initiated the exam session on this account.");
    }

    // Double submission prevention: check if session is already evaluated/submitted
    if (session.status === "SUBMITTED" || session.status === "EXPIRED") {
      if (firestoreDb) {
        await this.forceSyncCollection("results");
      }
      const existingResult = db.results.find((r) => r.sessionId === session.id);
      if (existingResult) {
        console.log(`[evaluateExam] Session ${session.id} is already evaluated. Returning existing result.`);
        return existingResult;
      }
    }

    // Set session as submitted
    session.status = isTimerExpired ? "EXPIRED" : "SUBMITTED";
    session.lastActivityAt = new Date().toISOString();

    const questions = db.questions.filter((q) => q.examId === examId);
    const answers = db.studentAnswers.filter((a) => a.sessionId === session.id);

    // Build the sheet array representing all questions on the exam
    const sheet = questions.map((q, idx) => {
      const studentAns = answers.find((a) => a.questionId === q.id);
      const studentAnswer = (studentAns && studentAns.answerText) ? String(studentAns.answerText).trim() : "";
      return {
        questionIndex: idx,
        questionId: q.id,
        type: q.type,
        questionText: q.questionText,
        modelAnswer: q.type === "MCQ" ? (q.correctOption || "") : (q.modelAnswer || ""),
        keywords: q.type === "MCQ" ? "" : (q.relevantKeywords || ""),
        studentAnswer
      };
    });

    // Solve batch-wise using our highly efficient Gemini grader or fallback
    const gradingResults = await this.evaluateExamSheet(sheet);

    let score = 0;
    const maxScore = questions.length;

    // Apply scores back to the database studentAnswers persistent elements
    gradingResults.forEach((resItem) => {
      const sheetItem = sheet.find((s) => s.questionIndex === resItem.questionIndex);
      if (!sheetItem) return;

      // Add actual partial score (scaled to 1.0 maximum point per question index)
      score += resItem.score / 100;

      const studentAnsIdx = db.studentAnswers.findIndex(
        (a) => a.sessionId === session.id && a.questionId === sheetItem.questionId
      );

      if (studentAnsIdx !== -1) {
        db.studentAnswers[studentAnsIdx].aiScore = resItem.score;
        db.studentAnswers[studentAnsIdx].aiFeedback = resItem.feedback;
        db.studentAnswers[studentAnsIdx].aiIsCorrect = resItem.isCorrect;
        db.studentAnswers[studentAnsIdx].updatedAt = new Date().toISOString();
      } else {
        // Create an answer record to hold the 0 / blank score + AI feedback
        const blankAns = {
          id: "ans-" + Math.random().toString(36).substring(2, 11),
          sessionId: session.id,
          studentId,
          examId,
          questionId: sheetItem.questionId,
          answerText: "",
          isMarkedForReview: false,
          updatedAt: new Date().toISOString(),
          aiScore: resItem.score,
          aiFeedback: resItem.feedback,
          aiIsCorrect: resItem.isCorrect
        };
        db.studentAnswers.push(blankAns);
      }
    });

    // Score calculations
    const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100 * 100) / 100 : 0;
    const passed = percentage >= 50.0;

    // Coins system:
    // Student gets coins proportional to the custom coinReward of each question.
    let coinsEarned = 0;
    gradingResults.forEach((resItem) => {
      const sheetItem = sheet.find((s) => s.questionIndex === resItem.questionIndex);
      if (!sheetItem) return;
      const q = questions.find((qi) => qi.id === sheetItem.questionId);
      const qCoinReward = (q && typeof q.coinReward === "number") ? q.coinReward : 5;
      
      let earnedForQ = 0;
      if (q && q.type === "MCQ") {
        earnedForQ = resItem.isCorrect ? qCoinReward : 0;
      } else {
        earnedForQ = Math.round((resItem.score / 100) * qCoinReward);
      }
      
      coinsEarned += earnedForQ;
    });

    if (isTimerExpired && session.status === "EXPIRED") {
      coinsEarned = Math.max(0, coinsEarned - 1);
    }

    // Save user coins permanently
    const sIdx = db.users.findIndex((u) => u.id === studentId);
    if (sIdx !== -1) {
      const currentCoins = typeof db.users[sIdx].coins === "number" ? db.users[sIdx].coins : 0;
      db.users[sIdx].coins = currentCoins + coinsEarned;
    }

    const examItem = db.exams.find((e) => e.id === examId);
    const examTitle = examItem ? examItem.title : "Exam";
    const examSubject = examItem ? (examItem.subject || "General") : "General";

    // Create Result (deterministic, unique id matching session.id exactly)
    const newResult: Result = {
      id: `res-${session.id}`,
      sessionId: session.id,
      studentId,
      examId,
      score: Math.round(score * 10) / 10, // keep decimal point if partial points
      maxScore,
      percentage,
      coinsEarned,
      passed,
      submittedAt: new Date().toISOString(),
      examTitle,
      examSubject
    };

    // Remove existing results for this session just in case
    db.results = db.results.filter((r) => r.sessionId !== session.id);
    db.results.push(newResult);

    // Save final logging entry
    const finalLog = {
      id: "log-" + Math.random().toString(36).substring(2, 11),
      sessionId: session.id,
      studentId,
      examId,
      eventType: "SUBMIT" as const,
      details: `Exam submitted and evaluated via batch evaluation engine. Score: ${newResult.score}/${maxScore} (${percentage}%), Coins Earned: ${coinsEarned}. Reason: ${isTimerExpired ? "Timer Expired" : "Manual Submission"}`,
      timestamp: new Date().toISOString()
    };
    db.monitoringLogs.push(finalLog);

    this.save(db, "examSessions");

    if (firestoreDb) {
      fstore.setDoc(fstore.doc(firestoreDb, "examSessions", session.id), cleanUndefined(session)).catch(() => {});
      fstore.setDoc(fstore.doc(firestoreDb, "results", newResult.id), cleanUndefined(newResult)).catch(() => {});
      fstore.setDoc(fstore.doc(firestoreDb, "monitoringLogs", finalLog.id), cleanUndefined(finalLog)).catch(() => {});
      
      // Update student updated scores
      const sessAnswers = db.studentAnswers.filter((a) => a.sessionId === session.id);
      for (const ans of sessAnswers) {
        fstore.setDoc(fstore.doc(firestoreDb, "studentAnswers", ans.id), cleanUndefined(ans)).catch(() => {});
      }

      const user = db.users.find((u) => u.id === studentId);
      if (user) {
        fstore.setDoc(fstore.doc(firestoreDb, "users", user.id), cleanUndefined(user)).catch(() => {});
      }
    }
    return newResult;
  }

  // ADVANCED ANALYTICS ENGINE
  public static getExamAnalytics(examId: string) {
    const db = this.load();
    const results = db.results.filter((r) => r.examId === examId);
    
    if (results.length === 0) {
      return {
        totalAttempts: 0,
        highestScore: 0,
        lowestScore: 0,
        averageScore: 0,
        passPercentage: 0,
        failPercentage: 0,
        questionAnalysis: []
      };
    }

    const totalAttempts = results.length;
    const scores = results.map((r) => r.score);
    const highestScore = Math.max(...scores);
    const lowestScore = Math.min(...scores);
    const averageScore = Math.round((scores.reduce((a, b) => a + b, 0) / totalAttempts) * 10) / 10;

    const passes = results.filter((r) => r.passed).length;
    const passPercentage = Math.round((passes / totalAttempts) * 100);
    const failPercentage = 100 - passPercentage;

    // Question Analysis: Hardest and Easiest Questions
    const questions = db.questions.filter((q) => q.examId === examId);
    const sessions = db.examSessions.filter((s) => s.examId === examId && s.status !== "ACTIVE");
    const activeSessionIds = new Set(sessions.map((s) => s.id));
    
    // For each question, calculate how many were answered correctly
    const questionAnalysis = questions.map((q) => {
      const answersForQ = db.studentAnswers.filter(
        (a) => a.questionId === q.id && activeSessionIds.has(a.sessionId)
      );
      
      let correctAttempts = 0;
      let totalQAttempts = answersForQ.length;

      answersForQ.forEach((ans) => {
        if (q.type === "MCQ") {
          if (ans.answerText.trim().toUpperCase() === (q.correctOption || "").toUpperCase()) {
            correctAttempts++;
          }
        } else {
          if (typeof ans.aiIsCorrect === "boolean") {
            if (ans.aiIsCorrect) {
              correctAttempts++;
            }
          } else {
            // Default check conceptual correctness if aiIsCorrect is not filled
            const isCorrect = ans.answerText.trim().toLowerCase() === (q.modelAnswer || "").trim().toLowerCase();
            if (isCorrect) {
              correctAttempts++;
            }
          }
        }
      });

      const passRate = totalQAttempts > 0 ? Math.round((correctAttempts / totalQAttempts) * 100) : 100;
      const wrongRate = 100 - passRate;

      return {
        id: q.id,
        questionText: q.questionText.length > 60 ? q.questionText.substring(0, 60) + "..." : q.questionText,
        type: q.type,
        correctPercentage: passRate,
        wrongPercentage: wrongRate,
        attempts: totalQAttempts
      };
    }).sort((a, b) => a.correctPercentage - b.correctPercentage); // Hardest first

    return {
      totalAttempts,
      highestScore,
      lowestScore,
      averageScore,
      passPercentage,
      failPercentage,
      questionAnalysis
    };
  }

  // Dashboard Analytics
  public static getTeacherGlobalStats() {
    const db = this.load();
    const activeSessions = db.examSessions.filter((s) => s.status === "ACTIVE");
    const submissionsList = db.results;
    
    // Recents activities of students
    const recentActivities = db.monitoringLogs
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 8)
      .map((log) => {
        const student = db.users.find((u) => u.id === log.studentId);
        const exam = db.exams.find((e) => e.id === log.examId);
        return {
          id: log.id,
          studentName: student ? student.name : "Student",
          examTitle: exam ? exam.title : "Exam",
          eventType: log.eventType,
          details: log.details,
          timestamp: log.timestamp
        };
      });

    return {
      totalExams: db.exams.filter((e) => !e.isDeleted).length,
      totalQuestions: db.questions.filter((q) => {
        const ex = db.exams.find((e) => e.id === q.examId);
        return ex ? !ex.isDeleted : true;
      }).length,
      totalStudents: db.users.filter((u) => u.role === "student").length,
      activeExamsCount: activeSessions.length,
      recentStudentActivity: recentActivities
    };
  }

  // Dynamic Leaderboard (Combined across all attempts)
  public static getGlobalLeaderboard(): LeaderboardEntry[] {
    const db = this.load();
    const students = db.users.filter((u) => u.role === "student");
    const results = db.results;

    const entries: LeaderboardEntry[] = students.map((std) => {
      const studentResults = results.filter((r) => r.studentId === std.id);
      const totalScore = studentResults.reduce((sum, r) => sum + r.score, 0);
      const averagePercentage = studentResults.length > 0 
        ? Math.round((studentResults.reduce((sum, r) => sum + r.percentage, 0) / studentResults.length) * 100) / 100
        : 0;

      return {
        studentId: std.id,
        studentName: std.name,
        totalScore,
        totalCoins: std.coins,
        averagePercentage,
        examsAttempted: studentResults.length,
        rank: 0, // Will assign below
        studentClass: std.studentClass,
        studentSection: std.studentSection,
        studentStream: std.studentStream
      };
    });

    // Sort by Total Coins desc, then Total Score desc
    const sorted = entries.sort((a, b) => {
      if (b.totalCoins !== a.totalCoins) {
        return b.totalCoins - a.totalCoins;
      }
      return b.totalScore - a.totalScore;
    });

    // Assign rank
    sorted.forEach((item, i) => {
      item.rank = i + 1;
    });

    return sorted;
  }

  public static getResultByStudentAndExam(studentId: string, examId: string): any | undefined {
    const db = this.load();
    const result = db.results.find((r) => r.studentId === studentId && r.examId === examId);
    return result;
  }

  public static updateResultScoreManual(studentId: string, examId: string, newScore: number): any {
    const db = this.load();
    const result = db.results.find((r) => r.studentId === studentId && r.examId === examId);
    const student = db.users.find((u) => u.id === studentId);
    
    if (!student) {
      throw new Error("Student profile registry key not found.");
    }

    if (result) {
      const oldCoins = typeof result.coinsEarned === "number" ? result.coinsEarned : 0;
      const newCoins = Math.round(newScore);
      
      // Update result details
      result.score = newScore;
      result.coinsEarned = newCoins;
      result.percentage = Math.round((newScore / (result.maxScore || 10)) * 100);
      result.passed = result.percentage >= 50;

      // Update student wallet balance instantly and automatically!
      const userCoinsDiff = newCoins - oldCoins;
      student.coins = Math.max(0, (student.coins || 0) + userCoinsDiff);

      this.save(db, "results", result);
      this.save(db, "users", student);
      
      // Clean Sync if active
      if (firestoreDb) {
        fstore.setDoc(fstore.doc(firestoreDb, "results", result.id), cleanUndefined(result)).catch(() => {});
        fstore.setDoc(fstore.doc(firestoreDb, "users", student.id), cleanUndefined(student)).catch(() => {});
      }
      
      // Notify custom local observers
      this.notifyDbChanged("results");
      this.notifyDbChanged("users");
      return result;
    } else {
      const exam = db.exams?.find(e => e.id === examId);
      const examTitle = exam ? exam.title : "Direct Manual Evaluation Assessment";
      const maxScore = exam ? 10 : 10;
      
      const newCoins = Math.round(newScore);
      const percentage = Math.round((newScore / maxScore) * 100);
      
      const newResult: any = {
        id: "manual-" + Math.random().toString(36).substring(2, 9),
        examId,
        examTitle,
        studentId,
        score: newScore,
        maxScore,
        percentage,
        passed: percentage >= 50,
        coinsEarned: newCoins,
        submittedAt: new Date().toISOString()
      };

      db.results.push(newResult);
      student.coins = Math.max(0, (student.coins || 0) + newCoins);
      
      this.save(db, "results", newResult);
      this.save(db, "users", student);

      if (firestoreDb) {
        fstore.setDoc(fstore.doc(firestoreDb, "results", newResult.id), cleanUndefined(newResult)).catch(() => {});
        fstore.setDoc(fstore.doc(firestoreDb, "users", student.id), cleanUndefined(student)).catch(() => {});
      }

      this.notifyDbChanged("results");
      this.notifyDbChanged("users");
      return newResult;
    }
  }

  public static getStudentStats(studentId: string) {
    const db = this.load();
    const student = db.users.find((u) => u.id === studentId);
    if (!student) return null;

    const results = db.results.filter((r) => r.studentId === studentId);
    const leaderboard = this.getGlobalLeaderboard();
    const currentRank = leaderboard.findIndex((item) => item.studentId === studentId) + 1;

    // Calculate pass / fail ratios, recent scores
    const examsAttempted = results.length;
    const totalCoins = student.coins;
    
    // Find completed sessions that are not yet graded (do not have a result record yet)
    const pendingSessions = db.examSessions.filter(
      (s) => s.studentId === studentId && (s.status === "SUBMITTED" || s.status === "EXPIRED") && !results.some(r => r.sessionId === s.id)
    );

    const pendingSummary = pendingSessions.map((s) => {
      const exam = db.exams.find((e) => e.id === s.examId);
      return {
        id: `pending-${s.id}`,
        examId: s.examId,
        examTitle: exam ? exam.title : "Exam",
        score: 0,
        maxScore: 0,
        percentage: 0,
        passed: false,
        coinsEarned: 0,
        submittedAt: s.lastActivityAt || new Date().toISOString(),
        gradingInProgress: true
      };
    });

    const performanceSummary = [
      ...results.map((r) => {
        const exam = db.exams.find((e) => e.id === r.examId);
        return {
          id: r.id,
          examId: r.examId,
          examTitle: exam ? exam.title : (r.examTitle || "Exam"),
          score: r.score,
          maxScore: r.maxScore,
          percentage: r.percentage,
          passed: r.passed,
          coinsEarned: r.coinsEarned,
          submittedAt: r.submittedAt,
          gradingInProgress: false,
          gradingFailed: r.gradingFailed
        };
      }),
      ...pendingSummary
    ].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

    return {
      coinsEarned: totalCoins,
      currentRank: currentRank || "-",
      examsAttempted,
      performanceSummary
    };
  }

  public static markGradingFailed(studentId: string, examId: string): void {
    const db = this.load();
    const session = db.examSessions.find((s) => s.studentId === studentId && s.examId === examId);
    if (!session) return;

    session.status = "SUBMITTED";
    session.lastActivityAt = new Date().toISOString();

    const questions = db.questions.filter((q) => q.examId === examId);
    const maxScore = questions.length;

    questions.forEach((q) => {
      const studentAnsIdx = db.studentAnswers.findIndex(
        (a) => a.sessionId === session.id && a.questionId === q.id
      );
      if (studentAnsIdx !== -1) {
        db.studentAnswers[studentAnsIdx].aiScore = 0;
        db.studentAnswers[studentAnsIdx].aiFeedback = "Grading Failed - Please contact teacher";
        db.studentAnswers[studentAnsIdx].aiIsCorrect = false;
        db.studentAnswers[studentAnsIdx].updatedAt = new Date().toISOString();
      } else {
        const blankAns = {
          id: "ans-" + Math.random().toString(36).substring(2, 11),
          sessionId: session.id,
          studentId,
          examId,
          questionId: q.id,
          answerText: "",
          isMarkedForReview: false,
          updatedAt: new Date().toISOString(),
          aiScore: 0,
          aiFeedback: "Grading Failed - Please contact teacher",
          aiIsCorrect: false
        };
        db.studentAnswers.push(blankAns);
      }
    });

    const examItem = db.exams.find((e) => e.id === examId);
    const examTitle = examItem ? examItem.title : "Exam";
    const examSubject = examItem ? (examItem.subject || "General") : "General";

    const newResult: Result = {
      id: `res-${session.id}`,
      sessionId: session.id,
      studentId,
      examId,
      score: 0,
      maxScore,
      percentage: 0,
      coinsEarned: 0,
      passed: false,
      submittedAt: new Date().toISOString(),
      examTitle,
      examSubject,
      gradingFailed: true
    };

    db.results = db.results.filter((r) => r.sessionId !== session.id);
    db.results.push(newResult);

    const finalLog = {
      id: "log-" + Math.random().toString(36).substring(2, 11),
      sessionId: session.id,
      studentId,
      examId,
      eventType: "SUBMIT" as const,
      details: "AI grading failed permanently after multiple retries. Result score set to 0. Error feedback registered.",
      timestamp: new Date().toISOString()
    };
    db.monitoringLogs.push(finalLog);

    this.save(db, "examSessions");
    this.save(db, "results", newResult);
    this.save(db, "monitoringLogs", finalLog);

    const sessAnswers = db.studentAnswers.filter((a) => a.sessionId === session.id);
    this.save(db, "studentAnswers", sessAnswers);

    if (firestoreDb) {
      fstore.setDoc(fstore.doc(firestoreDb, "examSessions", session.id), cleanUndefined(session)).catch(() => {});
      fstore.setDoc(fstore.doc(firestoreDb, "results", newResult.id), cleanUndefined(newResult)).catch(() => {});
      fstore.setDoc(fstore.doc(firestoreDb, "monitoringLogs", finalLog.id), cleanUndefined(finalLog)).catch(() => {});
      
      for (const ans of sessAnswers) {
        fstore.setDoc(fstore.doc(firestoreDb, "studentAnswers", ans.id), cleanUndefined(ans)).catch(() => {});
      }
    }

    this.notifyDbChanged("examSessions");
    this.notifyDbChanged("results");
  }

  public static async closeSessionImmediately(studentId: string, examId: string, isTimerExpired: boolean = false): Promise<any> {
    if (firestoreDb) {
      await this.forceSyncCollection("examSessions");
    }

    const db = this.load();
    const session = db.examSessions.find((s) => s.studentId === studentId && s.examId === examId);
    if (!session) {
      throw new Error("No active exam session found for this exam.");
    }

    if (session.status === "ACTIVE") {
      session.status = isTimerExpired ? "EXPIRED" : "SUBMITTED";
      session.lastActivityAt = new Date().toISOString();
      this.save(db, "examSessions");

      if (firestoreDb) {
        fstore.setDoc(fstore.doc(firestoreDb, "examSessions", session.id), cleanUndefined(session)).catch(() => {});
      }
      this.notifyDbChanged("examSessions");
    }

    return session;
  }
}
