import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import path from "path";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Database, User } from "./server-db";

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-exam-key-998811";

declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

const app = express();

function startServer() {
  const PORT = 3000;

  // Global parse and compression middlewares
  app.use(express.json());

  // Enable CORS for frontend deployments (such as Netlify or Vercel client-side apps)
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }
    next();
  });

  // Database Synchronization Middleware (ensures Firestore cache is fully resolved on container boot / cold start)
  const ensureDBSync = async (req: Request, res: Response, next: NextFunction) => {
    try {
      await Database.ensureSync();
    } catch (e) {
      console.error("[DbSyncMiddleware] Error synchronizing database with Firestore:", e);
    }
    next();
  };
  app.use(ensureDBSync);

  // Authentication Middleware
  // Expects 'Authorization: Bearer <token>'
  const authenticate = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized. Missing bearer token." });
    }
    const token = authHeader.split(" ")[1];
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { id: string };
      const userId = decoded.id;

      const user = Database.getUserById(userId);
      if (!user) {
        return res.status(401).json({ error: "Session invalid. User not found." });
      }
      req.user = user;
      next();
    } catch (err: any) {
      return res.status(401).json({ error: "Unauthorized. Invalid token.", details: err.message });
    }
  };

  // ==========================================
  // AUTHENTICATION APIs
  // ==========================================

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    const user = Database.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: "User account with this email does not exist." });
    }
    
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: "Incorrect password. Please verify and try again." });
    }

    // Dynamic Firebase Authentication lookup and creation
    try {
      const auth = Database.getFirebaseAuth();
      if (auth) {
        const { signInWithEmailAndPassword, createUserWithEmailAndPassword } = await import("firebase/auth");
        try {
          await signInWithEmailAndPassword(auth, email, password);
          console.log(`[Firebase Auth] Successfully verified password for email: ${email}`);
        } catch (authErr: any) {
          // Auto-migrate if user exists in database but not yet in Firebase Auth
          if (authErr.code === "auth/user-not-found" || authErr.code === "auth/invalid-credential") {
            try {
              await createUserWithEmailAndPassword(auth, email, password);
              console.log(`[Firebase Auth] Migrated/Created user account successfully in Firebase Auth for: ${email}`);
            } catch (createErr: any) {
              console.warn(`[Firebase Auth Migration Warning] Could not migrate user: ${createErr.message}`);
            }
          } else {
            console.warn(`[Firebase Auth Warning] Authentication system rejected email:`, authErr.message);
          }
        }
      }
    } catch (err) {
      console.error("[Firebase Auth Fatal] verification engine error:", err);
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        coins: user.coins
      }
    });
  });

  app.post("/api/auth/register", async (req: Request, res: Response) => {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: "All registration fields are required" });
    }
    
    // Validate role constraint
    if (role !== "student" && role !== "teacher") {
      return res.status(400).json({ error: "Role must be 'student' or 'teacher'" });
    }

    const existing = Database.getUserByEmail(email);
    if (existing) {
      return res.status(400).json({ error: "Email already registered in the system" });
    }

    // Try building user credential first on Firebase Auth
    try {
      const auth = Database.getFirebaseAuth();
      if (auth) {
        const { createUserWithEmailAndPassword } = await import("firebase/auth");
        await createUserWithEmailAndPassword(auth, email, password);
        console.log(`[Firebase Auth] User Registered successfully in Firebase Auth: ${email}`);
      }
    } catch (authError: any) {
      console.error(`[Firebase Auth Registration Error]:`, authError);
      return res.status(400).json({ error: authError.message || "Failed to register credentials in Firebase Auth." });
    }

    const newUser = Database.createUser(name, email, password, role);
    res.status(201).json({
      message: "User registered successfully",
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        coins: newUser.coins
      }
    });
  });

  // Current session validity checker
  app.get("/api/auth/me", authenticate, (req: Request, res: Response) => {
    const user = req.user!;
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      coins: user.coins
    });
  });

  // Edit/Update Profile details endpoint
  app.put("/api/auth/update-profile", authenticate, (req: Request, res: Response) => {
    const user = req.user!;
    const { name, email, oldPassword, newPassword, confirmPassword } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: "Name and email are required." });
    }
    
    // Strict requirement check: "only admin/teacher should be able to change their password and email of others and himself"
    // So normal students cannot change email or password.
    if (user.role !== "admin" && user.role !== "teacher") {
      if (email !== user.email) {
        return res.status(403).json({ error: "Only the administrator or teachers can change your email coordinate." });
      }
      if (name !== user.name) {
        return res.status(403).json({ error: "Only the administrator or teachers can change your name." });
      }
      if (oldPassword || newPassword || confirmPassword) {
        return res.status(403).json({ error: "Only the administrator or teachers can change your login password." });
      }
    }

    let finalPasswordHash: string | undefined = undefined;

    if (user.role === "admin" || user.role === "teacher") {
      if (newPassword) {
        if (!oldPassword) {
          return res.status(400).json({ error: "Old password is required to change to a new password." });
        }
        if (!bcrypt.compareSync(oldPassword, user.passwordHash)) {
          return res.status(400).json({ error: "Incorrect old password." });
        }
        if (newPassword !== confirmPassword) {
          return res.status(400).json({ error: "New password and password confirmation do not match." });
        }
        finalPasswordHash = newPassword;
      }
    }

    try {
      const updatedUser = Database.updateUser(user.id, name, email, finalPasswordHash);
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found." });
      }
      res.json({
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        coins: updatedUser.coins
      });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to update profile." });
    }
  });

  // ==========================================
  // ADMIN CONTROL MANAGEMENT ENDPOINTS
  // ==========================================

  // Get users catalog catalog
  app.get("/api/admin/users", authenticate, (req: Request, res: Response) => {
    if (req.user?.role !== "admin" && req.user?.role !== "teacher") {
      return res.status(403).json({ error: "Admin or Teacher authorization required." });
    }
    const allUsers = Database.getUsers().map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      coins: u.coins,
      createdAt: u.createdAt
    }));
    res.json(allUsers);
  });

  // Create login credentials for teachers/students
  app.post("/api/admin/users", authenticate, (req: Request, res: Response) => {
    if (req.user?.role !== "admin" && req.user?.role !== "teacher") {
      return res.status(403).json({ error: "Admin or Teacher authorization required." });
    }
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: "All login fields (name, email, password, role) are required." });
    }
    if (role !== "student" && role !== "teacher" && role !== "admin") {
      return res.status(400).json({ error: "Invalid role configured." });
    }
    const existing = Database.getUserByEmail(email);
    if (existing) {
      return res.status(400).json({ error: "Email address is already in use by another user account." });
    }
    const newUser = Database.createUser(name, email, password, role);
    res.status(201).json({
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      coins: newUser.coins
    });
  });

  // Update a student/teacher details or admin details
  app.put("/api/admin/users/:id", authenticate, (req: Request, res: Response) => {
    if (req.user?.role !== "admin" && req.user?.role !== "teacher") {
      return res.status(403).json({ error: "Admin or Teacher authorization required." });
    }
    const { id } = req.params;
    const { name, email, password, role } = req.body;
    if (!name || !email || !role) {
      return res.status(400).json({ error: "Name, email and role are required." });
    }
    try {
      const updated = Database.updateUserByAdmin(id, name, email, role, password || undefined);
      if (!updated) {
        return res.status(404).json({ error: "User not found." });
      }
      res.json({
        id: updated.id,
        name: updated.name,
        email: updated.email,
        role: updated.role,
        coins: updated.coins
      });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to edit user values." });
    }
  });

  // Delete student or teacher account
  app.delete("/api/admin/users/:id", authenticate, (req: Request, res: Response) => {
    if (req.user?.role !== "admin" && req.user?.role !== "teacher") {
      return res.status(403).json({ error: "Admin or Teacher authorization required." });
    }
    const { id } = req.params;
    if (id === req.user.id) {
      return res.status(400).json({ error: "You cannot terminate your own active account." });
    }
    try {
      Database.deleteUser(id);
      res.json({ success: true, message: "Credential account deleted." });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to delete user." });
    }
  });

  // ==========================================
  // GLOBAL STATS / LEADERBOARDS
  // ==========================================

  app.get("/api/leaderboard", (req: Request, res: Response) => {
    const list = Database.getGlobalLeaderboard();
    res.json(list);
  });

  // ==========================================
  // TEACHER EXAMS & QUESTION BUILDER APIs
  // ==========================================

  // SSE Streaming Connections list
  let sseClients: Response[] = [];

  // Register Database Subscription to pipe changes to all open streams
  Database.subscribeToChanges((collectionName) => {
    const payload = JSON.stringify({ type: "change", collection: collectionName, timestamp: Date.now() });
    console.log(`[SSE Broadcaster] Emitting db change event for "${collectionName}" to ${sseClients.length} clients`);
    sseClients.forEach((client) => {
      try {
        client.write(`data: ${payload}\n\n`);
      } catch (err) {
        // Handled via close event
      }
    });
  });

  // Real-Time Event Stream Endpoint (Server-Sent Events)
  app.get("/api/sync/stream", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders(); // Establish the connection immediately

    // Add client to active pool
    sseClients.push(res);
    console.log(`[SSE Router] Client connected. Total streaming clients: ${sseClients.length}`);

    // Immediately send connection handshake ping
    res.write(`data: ${JSON.stringify({ type: "connected", online: Database.isOnline() })}\n\n`);

    // Keep connection alive with silent periodic heartbeats (ping once every 15s)
    const heartbeatInterval = setInterval(() => {
      try {
        res.write(`data: ${JSON.stringify({ type: "heartbeat" })}\n\n`);
      } catch (err) {
        // socket closed
      }
    }, 15000);

    req.on("close", () => {
      clearInterval(heartbeatInterval);
      sseClients = sseClients.filter((client) => client !== res);
      console.log(`[SSE Router] Client disconnected. Total streaming clients remaining: ${sseClients.length}`);
    });
  });

  // Connection Connectivity Diagnostic Check
  app.get("/api/firebase/status", (req: Request, res: Response) => {
    res.json(Database.getFirebaseStatus());
  });

  // Dashboard High-Level Activity Stats
  app.get("/api/teacher/stats", authenticate, (req: Request, res: Response) => {
    if (req.user?.role !== "teacher" && req.user?.role !== "admin") {
      return res.status(403).json({ error: "Access Denied. Teachers only." });
    }
    const stats = Database.getTeacherGlobalStats();
    res.json(stats);
  });

  // Complete List of Exams
  app.get("/api/exams", authenticate, (req: Request, res: Response) => {
    const exams = Database.getExams();
    // For students, filter by isDeleted, isPublished and scheduled publishAt
    if (req.user?.role === "student") {
      const now = new Date();
      return res.json(exams.filter((e) => {
        if (e.isDeleted) return false;
        // If there is a scheduled publish date in the future, don't show it
        if (e.publishAt && new Date(e.publishAt) > now) return false;
        // If it is explicitly published, show it. Or, if it is scheduled of the past/present, consider it published.
        return e.isPublished || (e.publishAt && new Date(e.publishAt) <= now);
      }));
    }
    // For teachers, filter out deleted exams
    res.json(exams.filter((e) => !e.isDeleted));
  });

  // Create an Exam
  app.post("/api/exams", authenticate, (req: Request, res: Response) => {
    if (req.user?.role !== "teacher" && req.user?.role !== "admin") {
      return res.status(403).json({ error: "Access Denied. Teachers only." });
    }
    const { title, subject, description, durationMinutes, publishAt } = req.body;
    if (!title || !durationMinutes) {
      return res.status(400).json({ error: "Title and duration are required" });
    }
    const exam = Database.createExam(title, subject || "General", description || "", Number(durationMinutes));
    if (publishAt) {
      Database.updateExam(exam.id, { publishAt });
      exam.publishAt = publishAt;
    }
    res.status(201).json(exam);
  });

  // Get details + questions of a specific Exam
  app.get("/api/exams/:id", authenticate, (req: Request, res: Response) => {
    const examId = req.params.id;
    const exam = Database.getExamById(examId);
    if (!exam) {
      return res.status(404).json({ error: "Exam not found" });
    }
    
    // Verify visibility boundary
    const now = new Date();
    const isFutureScheduled = exam.publishAt && new Date(exam.publishAt) > now;
    const isCurrentlyPublished = exam.isPublished || (exam.publishAt && new Date(exam.publishAt) <= now);
    if (req.user?.role === "student" && (!isCurrentlyPublished || isFutureScheduled)) {
      return res.status(403).json({ error: "This exam is currently unpublished" });
    }

    const questions = Database.getQuestions(examId);

    // If client is student, strip answers to prevent cheating
    const cleanQuestions = questions.map((q) => {
      if (req.user?.role === "student") {
        return {
          id: q.id,
          examId: q.examId,
          type: q.type,
          questionText: q.questionText,
          optionA: q.optionA,
          optionB: q.optionB,
          optionC: q.optionC,
          optionD: q.optionD,
          orderIndex: q.orderIndex
        };
      }
      return q;
    });

    res.json({ exam, questions: cleanQuestions });
  });

  // Update Exam properties (includes publishing)
  app.put("/api/exams/:id", authenticate, (req: Request, res: Response) => {
    if (req.user?.role !== "teacher" && req.user?.role !== "admin") {
      return res.status(403).json({ error: "Access Denied. Teachers only." });
    }
    const examId = req.params.id;
    const { title, description, durationMinutes, isPublished, publishAt } = req.body;
    
    const updates: Partial<any> = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (durationMinutes !== undefined) updates.durationMinutes = Number(durationMinutes);
    if (isPublished !== undefined) {
      if (isPublished === true) {
        const qCount = Database.getQuestions(examId).length;
        if (qCount === 0) {
          return res.status(400).json({ error: "Cannot publish an exam with no questions. Please append at least one question first." });
        }
      }
      updates.isPublished = Boolean(isPublished);
    }
    if (publishAt !== undefined) updates.publishAt = publishAt; // Supplying empty string nullifies it

    const exam = Database.updateExam(examId, updates);
    if (!exam) {
      return res.status(404).json({ error: "Exam not found" });
    }
    res.json(exam);
  });

  // Delete Exam
  app.delete("/api/exams/:id", authenticate, (req: Request, res: Response) => {
    if (req.user?.role !== "teacher" && req.user?.role !== "admin") {
      return res.status(403).json({ error: "Access Denied. Teachers only." });
    }
    const deleted = Database.deleteExam(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: "Failed to delete exam. Not found." });
    }
    res.json({ message: "Exam and all associated questions / sessions deleted" });
  });

  // ==========================================
  // EXAM QUESTION CRUD BUILDER
  // ==========================================

  // Create Question in building scope
  app.post("/api/exams/:examId/questions", authenticate, (req: Request, res: Response) => {
    if (req.user?.role !== "teacher" && req.user?.role !== "admin") {
      return res.status(403).json({ error: "Access Denied. Teachers only." });
    }
    const examId = req.params.examId;
    const { type, questionText, optionA, optionB, optionC, optionD, correctOption, modelAnswer, relevantKeywords, coinReward } = req.body;

    if (!type || !questionText) {
      return res.status(400).json({ error: "Question type and text elements are required" });
    }

    let targetOption = correctOption;
    if (type === "MCQ") {
      if (!optionA || !optionB || !optionC || !optionD) {
        return res.status(400).json({ error: "MCQs require option A, B, C, D" });
      }
      if (!targetOption) {
        targetOption = "A";
      }
    } else {
      if (!modelAnswer) {
        return res.status(400).json({ error: "Short and long text layout requires model evaluation answers" });
      }
    }

    const question = Database.createQuestion(examId, {
      type,
      questionText,
      optionA,
      optionB,
      optionC,
      optionD,
      correctOption: targetOption,
      modelAnswer,
      relevantKeywords: relevantKeywords || "",
      coinReward: coinReward !== undefined ? Number(coinReward) : 5
    });

    res.status(201).json(question);
  });

  // Update a Question
  app.put("/api/questions/:id", authenticate, (req: Request, res: Response) => {
    if (req.user?.role !== "teacher" && req.user?.role !== "admin") {
      return res.status(403).json({ error: "Access Denied. Teachers only." });
    }
    const questionId = req.params.id;
    const { questionText, optionA, optionB, optionC, optionD, correctOption, modelAnswer, relevantKeywords, coinReward } = req.body;

    const updates: Partial<any> = {};
    if (questionText !== undefined) updates.questionText = questionText;
    if (optionA !== undefined) updates.optionA = optionA;
    if (optionB !== undefined) updates.optionB = optionB;
    if (optionC !== undefined) updates.optionC = optionC;
    if (optionD !== undefined) updates.optionD = optionD;
    if (correctOption !== undefined) updates.correctOption = correctOption;
    if (modelAnswer !== undefined) updates.modelAnswer = modelAnswer;
    if (relevantKeywords !== undefined) updates.relevantKeywords = relevantKeywords;
    if (coinReward !== undefined) updates.coinReward = Number(coinReward);

    const question = Database.updateQuestion(questionId, updates);
    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }
    res.json(question);
  });

  // Delete a Question
  app.delete("/api/questions/:id", authenticate, (req: Request, res: Response) => {
    if (req.user?.role !== "teacher" && req.user?.role !== "admin") {
      return res.status(403).json({ error: "Access Denied. Teachers only." });
    }
    const success = Database.deleteQuestion(req.params.id);
    if (!success) {
      return res.status(404).json({ error: "Question not found" });
    }
    res.json({ message: "Question successfully deleted and order index balanced" });
  });

  // Reordering of Questions inside Exam Builder
  app.post("/api/exams/:examId/questions/reorder", authenticate, (req: Request, res: Response) => {
    if (req.user?.role !== "teacher" && req.user?.role !== "admin") {
      return res.status(403).json({ error: "Access Denied. Teachers only." });
    }
    const examId = req.params.examId;
    const { orderedIds } = req.body; // array of question IDs in correct sorted order
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ error: "orderedIds array is required" });
    }
    
    Database.reorderQuestions(examId, orderedIds);
    res.json({ message: "Reordered successfully" });
  });

  // ==========================================
  // REAL-TIME LIVE MONITOR & ANALYTICS APIs
  // ==========================================

  // LIVE MONITOR: Live session streams for standard AJAX polling
  app.get("/api/teacher/monitor", authenticate, (req: Request, res: Response) => {
    if (req.user?.role !== "teacher" && req.user?.role !== "admin") {
      return res.status(403).json({ error: "Access Denied. Teachers only." });
    }
    const sessions = Database.getLiveSessions();
    res.json(sessions);
  });

  // Specific session logging logs
  app.get("/api/sessions/:sessionId/logs", authenticate, (req: Request, res: Response) => {
    if (req.user?.role !== "teacher" && req.user?.role !== "admin") {
      return res.status(403).json({ error: "Access Denied. Teachers only." });
    }
    const logs = Database.getSessionLogs(req.params.sessionId);
    res.json(logs);
  });

  // ANALYTICS: Analytics dashboard
  app.get("/api/exams/:examId/analytics", authenticate, (req: Request, res: Response) => {
    if (req.user?.role !== "teacher" && req.user?.role !== "admin") {
      return res.status(403).json({ error: "Access Denied. Teachers only." });
    }
    const analytics = Database.getExamAnalytics(req.params.examId);
    res.json(analytics);
  });

  // MANUAL EVALUATION MARKS CORRECTION: Updates a student's marks and automatically calculates/aligns their coins balance
  app.get("/api/teacher/results", authenticate, (req: Request, res: Response) => {
    if (req.user?.role !== "teacher" && req.user?.role !== "admin") {
      return res.status(403).json({ error: "Access Denied. Teachers only can view results list." });
    }
    try {
      const db = Database.load();
      const results = db.results.map((r) => {
        const student = db.users.find((u) => u.id === r.studentId);
        const exam = db.exams?.find((e) => e.id === r.examId);
        return {
          ...r,
          studentName: student ? student.name : "Unknown Student",
          examTitle: exam ? exam.title : (r.examTitle || "General Exam")
        };
      }).sort((a, b) => new Date(b.submittedAt || '').getTime() - new Date(a.submittedAt || '').getTime());
      res.json(results);
    } catch (e: any) {
      res.status(500).json({ error: e.message || "Failed to load results registry." });
    }
  });

  app.post("/api/teacher/update-marks", authenticate, (req: Request, res: Response) => {
    if (req.user?.role !== "teacher" && req.user?.role !== "admin") {
      return res.status(403).json({ error: "Access Denied. Teachers only can manually grade marks." });
    }
    const { studentId, examId, score } = req.body;
    if (!studentId || !examId || score === undefined) {
      return res.status(400).json({ error: "studentId, examId, and score (marks) are required query parameters." });
    }
    try {
      const updatedResult = Database.updateResultScoreManual(studentId, examId, Number(score));
      res.json({ message: "Student marks updated successfully!", result: updatedResult });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "Failed to update manual marks." });
    }
  });


  // ==========================================
  // STUDENT EXAMINEE CONTROLS APIs
  // ==========================================

  // 1. Start Exam
  app.post("/api/student/exam/:examId/start", authenticate, async (req: Request, res: Response) => {
    const examId = req.params.examId;
    const studentId = req.user!.id;

    // Force synchronize the cached collection state with active Firestore databases instantly
    await Database.forceSyncCollection("examSessions");
    await Database.forceSyncCollection("studentAnswers");

    const exam = Database.getExamById(examId);
    if (!exam || !exam.isPublished) {
      return res.status(400).json({ error: "Exam is currently unavailable" });
    }

    const session = Database.getOrCreateSession(studentId, examId);
    if (session.status !== "ACTIVE") {
      return res.status(400).json({ error: "Exam was already completed or session has lapsed.", status: session.status });
    }

    // Return the session + standard safe questions list
    const questions = Database.getQuestions(examId).map((q) => ({
      id: q.id,
      examId: q.examId,
      type: q.type,
      questionText: q.questionText,
      optionA: q.optionA,
      optionB: q.optionB,
      optionC: q.optionC,
      optionD: q.optionD,
      orderIndex: q.orderIndex,
      coinReward: q.coinReward
    }));

    // Fetch already saved student answers to support SESSION RECOVERY on refresh
    const answers = Database.getAnswersForSession(session.id);

    // Calculate a timezone & clock-drift-immune remaining time from the server-authoritative clock
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000));
    const durationSeconds = exam.durationMinutes * 60;
    const timeLeftSec = Math.max(0, durationSeconds - elapsedSeconds);

    res.json({
      exam,
      session,
      questions,
      timeLeftSec,
      savedAnswers: answers.map((a) => ({
        questionId: a.questionId,
        answerText: a.answerText,
        isMarkedForReview: a.isMarkedForReview
      }))
    });
  });

  // 2. AUTOSAVE SYSTEM Support: Auto saves single question response
  app.post("/api/student/exam/:examId/save", authenticate, (req: Request, res: Response) => {
    const examId = req.params.examId;
    const studentId = req.user!.id;
    const { questionId, answerText, isMarkedForReview, currentQuestionId } = req.body;

    if (!questionId) {
      return res.status(400).json({ error: "questionId is required" });
    }

    try {
      const saved = Database.saveStudentAnswer(
        studentId,
        examId,
        questionId,
        answerText || "",
        Boolean(isMarkedForReview)
      );

      // If passing explicit current position tracker
      if (currentQuestionId) {
        const session = Database.getActiveSession(studentId, examId);
        if (session) {
          Database.updateSessionState(session.id, { currentQuestionId });
        }
      }

      res.json({ message: "Autosaved successfully", answer: saved });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // 3. TELEMETRY / CHEATING LOGS: Tracks Blurs, Tab Switch, and Screen exits
  app.post("/api/student/exam/:examId/telemetry", authenticate, (req: Request, res: Response) => {
    const examId = req.params.examId;
    const studentId = req.user!.id;
    const { eventType, details } = req.body;

    if (!eventType) {
      return res.status(400).json({ error: "eventType is required" });
    }

    const session = Database.getActiveSession(studentId, examId);
    if (!session || session.status !== "ACTIVE") {
      return res.status(400).json({ error: "No active examination session is currently running." });
    }

    const log = Database.logCheatingEvent(session.id, eventType, details || "");
    const updatedSession = Database.getActiveSession(studentId, examId);
    
    res.json({ message: "Cheating telemetry tracked", log, session: updatedSession });
  });

  // ==========================================
  // BACKGROUND GRADING QUEUE
  // ==========================================
  interface GradingTask {
    studentId: string;
    examId: string;
    isExpired: boolean;
  }

  const gradingQueue: GradingTask[] = [];
  let isProcessingQueue = false;

  async function processGradingQueue() {
    if (isProcessingQueue) return;
    isProcessingQueue = true;

    while (gradingQueue.length > 0) {
      const task = gradingQueue.shift();
      if (!task) continue;

      console.log(`[GradingQueue] Starting grading for studentId: ${task.studentId}, examId: ${task.examId}, isExpired: ${task.isExpired}`);
      try {
        await Database.evaluateExam(task.studentId, task.examId, task.isExpired);
        console.log(`[GradingQueue] Successfully graded studentId: ${task.studentId}, examId: ${task.examId}`);
      } catch (err) {
        console.error(`[GradingQueue] Failed to grade studentId: ${task.studentId}, examId: ${task.examId}:`, err);
      }

      // Add a 2-second delay gap between each grading task to prevent overloading the Gemini API
      console.log(`[GradingQueue] Active queue size: ${gradingQueue.length}. Throttling for 2 seconds before the next task...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    isProcessingQueue = false;
    console.log(`[GradingQueue] Completed processing all active grading tasks.`);
  }

  function addGradingTask(studentId: string, examId: string, isExpired: boolean) {
    const alreadyQueued = gradingQueue.some(
      (task) => task.studentId === studentId && task.examId === examId
    );
    if (alreadyQueued) {
      console.log(`[GradingQueue] Duplicate grading job ignored. Already queued for student: ${studentId}, exam: ${examId}`);
      return;
    }

    gradingQueue.push({ studentId, examId, isExpired });
    console.log(`[GradingQueue] Registered new assessment task. Queue depth: ${gradingQueue.length}`);
    
    processGradingQueue().catch((err) => {
      console.error(`[GradingQueue] Error running background queue:`, err);
    });
  }

  // 4. SUBMIT EXAM: Saves answers/status immediately, results processed in background queue
  app.post("/api/student/exam/:examId/submit", authenticate, async (req: Request, res: Response) => {
    const examId = req.params.examId;
    const studentId = req.user!.id;
    const { isExpired } = req.body; // whether submitted automatically because of timer expiry

    try {
      const session = Database.getActiveSession(studentId, examId);
      const exam = Database.getExamById(examId);

      if (session && exam && session.status === "ACTIVE") {
        const startedTime = new Date(session.startedAt).getTime();
        const durationLimitMs = exam.durationMinutes * 60 * 1000;
        const graceLeewayMs = 30 * 1000; // 30 seconds network delay/latency tolerance buffer
        const timeElapsed = Date.now() - startedTime;

        if (timeElapsed > (durationLimitMs + graceLeewayMs)) {
          return res.status(403).json({
            error: `Submission rejected: Exam duration limit (${exam.durationMinutes} minutes) exceeded on the server. Please complete examinations on time.`
          });
        }
      }

      const closedSession = await Database.closeSessionImmediately(studentId, examId, Boolean(isExpired));
      addGradingTask(studentId, examId, Boolean(isExpired));

      res.json({
        message: "Exam submitted! Results will be ready in a few minutes.",
        session: closedSession
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // 4b. TERMINATE EXAM: Instantly terminates a session due to fullscreen exit or tab switch violation
  app.post("/api/student/exam/:examId/terminate", authenticate, async (req: Request, res: Response) => {
    const examId = req.params.examId;
    const studentId = req.user!.id;

    try {
      const result = await Database.terminateExamWithPenalty(studentId, examId);
      res.json({
        message: "Exam terminated due to security violation.",
        result
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // STUDENT DASHBOARD STATS
  app.get("/api/student/dashboard-stats", authenticate, async (req: Request, res: Response) => {
    const studentId = req.user!.id;

    // Force sync central database details so stats propagate instantly between active student devices
    await Database.forceSyncCollection("users");
    await Database.forceSyncCollection("results");
    await Database.forceSyncCollection("examSessions");

    const stats = Database.getStudentStats(studentId);
    if (!stats) {
      return res.status(404).json({ error: "Student not found" });
    }
    res.json(stats);
  });

  // Historical review of a single student results
  app.get("/api/student/results", authenticate, (req: Request, res: Response) => {
    const studentId = req.user!.id;
    const results = Database.getStudentStats(studentId)?.performanceSummary || [];
    res.json(results);
  });

  // Check results details with correct vs incorrect highlighting
  app.get("/api/student/exam/:examId/result", authenticate, (req: Request, res: Response) => {
    const examId = req.params.examId;
    const studentId = req.user!.id;

    const finalSession = Database.getActiveSession(studentId, examId) ||
      Database.load().examSessions.find(s => s.studentId === studentId && s.examId === examId);

    if (!finalSession) {
      return res.status(404).json({ error: "Session history not found" });
    }

    const mainResult = Database.getResultByStudentAndExam(studentId, examId) || {
      score: 0,
      maxScore: 0,
      passed: false,
      coinsEarned: 0,
      examTitle: "Examination",
      examSubject: "General",
      submittedAt: finalSession.lastActivityAt || new Date().toISOString()
    };

    const exam = Database.getExamById(examId) || {
      id: examId,
      title: mainResult.examTitle || "Deleted Examination",
      subject: mainResult.examSubject || "General",
      description: "This exam has been deleted by the teacher.",
      durationMinutes: 0,
      isPublished: false,
      createdAt: finalSession.startedAt
    };

    let questions = Database.getQuestions(examId);
    const answers = Database.getAnswersForSession(finalSession.id);

    // If the exam was deleted and questions cascade-deleted, build placeholder template questions using student answers
    if (questions.length === 0 && answers.length > 0) {
      questions = answers.map((ans, idx) => {
        const isMcq = ans.answerText.trim().length <= 2;
        return {
          id: ans.questionId,
          examId: examId,
          type: isMcq ? ("MCQ" as const) : ("SHORT" as const),
          questionText: `Question #${idx + 1} (Original question text is unavailable as this exam has been deleted)`,
          optionA: isMcq ? "Option A" : "",
          optionB: isMcq ? "Option B" : "",
          optionC: isMcq ? "Option C" : "",
          optionD: isMcq ? "Option D" : "",
          correctOption: isMcq ? (ans.answerText || "A") : "",
          modelAnswer: !isMcq ? (ans.answerText || "") : "",
          relevantKeywords: !isMcq ? "" : undefined,
          orderIndex: idx,
          coinReward: 1,
          createdAt: new Date().toISOString()
        };
      });
    }

    if (mainResult.maxScore === 0) {
      mainResult.maxScore = questions.length;
    }

    // Build question detail view with scores highlighting
    const breakdown = questions.map((q) => {
      const studentAns = answers.find((a) => a.questionId === q.id);
      const answerText = studentAns ? studentAns.answerText : "";
      
      let isCorrect = false;
      let keywordPercent = 0;
      let similarityPercent = 0;
      let feedback = "";

      if (answerText) {
        if (q.type === "MCQ") {
          isCorrect = answerText.toUpperCase() === (q.correctOption || "").toUpperCase();
          keywordPercent = isCorrect ? 100 : 0;
          similarityPercent = isCorrect ? 100 : 0;
          feedback = isCorrect ? "Correct choice." : `Incorrect. The correct option is ${q.correctOption}.`;
        } else {
          // Pull saved evaluation parameters from Batch Engine
          if (studentAns && typeof studentAns.aiScore === "number") {
            isCorrect = !!studentAns.aiIsCorrect;
            keywordPercent = studentAns.aiScore;
            similarityPercent = studentAns.aiScore;
            feedback = studentAns.aiFeedback || "";
          } else {
            isCorrect = false;
            keywordPercent = 0;
            similarityPercent = 0;
            feedback = "No evaluation feedback is available.";
          }
        }
      } else {
        feedback = "No answer provided.";
      }

      return {
        id: q.id,
        questionText: q.questionText,
        type: q.type,
        options: q.type === "MCQ" ? { A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD } : null,
        correctOption: q.type === "MCQ" ? q.correctOption : null,
        studentAnswer: answerText,
        modelAnswer: q.type !== "MCQ" ? q.modelAnswer : null,
        relevantKeywords: q.type !== "MCQ" ? q.relevantKeywords : null,
        isCorrect,
        scores: { keywordPercent, similarityPercent },
        feedback
      };
    });

    res.json({
      exam,
      result: mainResult,
      breakdown
    });
  });

  // ==========================================
  // VITE & FRONTEND HANDLERS
  // ==========================================

  if (process.env.DISABLE_HMR === "true") {
    // Platform disabled hmr instructions
  }

  const isVercelEnvironment = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

  if (!isVercelEnvironment) {
    if (process.env.NODE_ENV !== "production") {
      // Setup Vite in development mode asynchronously
      import("vite").then(({ createServer: createViteServer }) => {
        createViteServer({
          server: { middlewareMode: true },
          appType: "spa",
        }).then((vite) => {
          app.use(vite.middlewares);
          // Listen only after Vite middleware is attached
          app.listen(PORT, "0.0.0.0", () => {
            console.log(`[SYS] Advanced Exam System live in development mode on port ${PORT}`);
            Database.ensureSync().then(() => {
              console.log("[SYS] Database synchronized and warmed up successfully.");
            }).catch((err) => {
              console.error("[SYS] Database warm-up failed:", err);
            });
          });
        });
      }).catch((err) => {
        console.error("Failed to start Vite dev server:", err);
      });
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req: Request, res: Response) => {
        res.sendFile(path.join(distPath, "index.html"));
      });

      app.listen(PORT, "0.0.0.0", () => {
        console.log(`[SYS] Advanced Exam System live in production mode on port ${PORT}`);
        Database.ensureSync().then(() => {
          console.log("[SYS] Database synchronized and warmed up successfully.");
        }).catch((err) => {
          console.error("[SYS] Database warm-up failed:", err);
        });
      });
    }
  } else {
    // On Vercel, we can still define the static/get wildcard synchronously
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });

    // On Vercel, warm up and sync database cache when the serverless function is loaded
    Database.ensureSync().then(() => {
      console.log("[SYS] Database synchronized and warmed up successfully on Vercel.");
    }).catch((err) => {
      console.error("[SYS] Database warm-up failed on Vercel:", err);
    });
  }
}

try {
  startServer();
} catch (err) {
  console.error("Critical failure during Express server initialization:", err);
}

export default app;
