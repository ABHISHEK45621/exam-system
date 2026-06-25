-- ==========================================
-- ONLINE EXAMINATION SYSTEM DATABASE SCHEMA
-- Target Engine: MySQL 8.0+ / MariaDB
-- ==========================================

CREATE DATABASE IF NOT EXISTS online_exam_db;
USE online_exam_db;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('teacher', 'student') NOT NULL DEFAULT 'student',
    coins INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY unique_email (email),
    INDEX idx_user_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Exams Table
CREATE TABLE IF NOT EXISTS exams (
    id VARCHAR(50) NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    duration_minutes INT NOT NULL DEFAULT 60,
    is_published TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_exam_published (is_published)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Questions Table
CREATE TABLE IF NOT EXISTS questions (
    id VARCHAR(50) NOT NULL,
    exam_id VARCHAR(50) NOT NULL,
    type ENUM('MCQ', 'SHORT', 'LONG') NOT NULL,
    question_text TEXT NOT NULL,
    option_a VARCHAR(255) NULL,
    option_b VARCHAR(255) NULL,
    option_c VARCHAR(255) NULL,
    option_d VARCHAR(255) NULL,
    correct_option CHAR(1) NULL, -- 'A', 'B', 'C', 'D'
    model_answer TEXT NULL,
    relevant_keywords TEXT NULL, -- comma-separated list
    order_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
    INDEX idx_question_exam_order (exam_id, order_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Exam Sessions Table (for autosave, recovery, and live state monitoring)
CREATE TABLE IF NOT EXISTS exam_sessions (
    id VARCHAR(50) NOT NULL,
    student_id VARCHAR(50) NOT NULL,
    exam_id VARCHAR(50) NOT NULL,
    current_question_id VARCHAR(50) NULL,
    tab_switch_count INT NOT NULL DEFAULT 0,
    window_blur_count INT NOT NULL DEFAULT 0,
    fullscreen_exit_count INT NOT NULL DEFAULT 0,
    inactivity_warnings INT NOT NULL DEFAULT 0,
    status ENUM('ACTIVE', 'SUBMITTED', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
    UNIQUE KEY uq_student_exam_session (student_id, exam_id),
    INDEX idx_session_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Student Answers Table (with review marker, integrated autosave state)
CREATE TABLE IF NOT EXISTS student_answers (
    id VARCHAR(50) NOT NULL,
    session_id VARCHAR(50) NOT NULL,
    student_id VARCHAR(50) NOT NULL,
    exam_id VARCHAR(50) NOT NULL,
    question_id VARCHAR(50) NOT NULL,
    answer_text TEXT NULL,
    is_marked_for_review TINYINT(1) DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (session_id) REFERENCES exam_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    UNIQUE KEY uq_session_question (session_id, question_id),
    INDEX idx_answer_review (is_marked_for_review)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Results Table (permanent score and metrics storage)
CREATE TABLE IF NOT EXISTS results (
    id VARCHAR(50) NOT NULL,
    session_id VARCHAR(50) NOT NULL,
    student_id VARCHAR(50) NOT NULL,
    exam_id VARCHAR(50) NOT NULL,
    score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    max_score INT NOT NULL,
    percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    coins_earned INT NOT NULL DEFAULT 0,
    passed TINYINT(1) NOT NULL DEFAULT 0,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (session_id) REFERENCES exam_sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
    UNIQUE KEY uq_session_result (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Monitoring Logs Table (cheating detection logbook)
CREATE TABLE IF NOT EXISTS monitoring_logs (
    id VARCHAR(50) NOT NULL,
    session_id VARCHAR(50) NOT NULL,
    student_id VARCHAR(50) NOT NULL,
    exam_id VARCHAR(50) NOT NULL,
    event_type VARCHAR(50) NOT NULL, -- 'TAB_SWITCH', 'WINDOW_BLUR', 'FULLSCREEN_EXIT', 'REFRESH', 'INACTIVITY'
    details TEXT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (session_id) REFERENCES exam_sessions(id) ON DELETE CASCADE,
    INDEX idx_log_session_event (session_id, event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Leaderboard Cache Table
CREATE TABLE IF NOT EXISTS leaderboard (
    id VARCHAR(50) NOT NULL,
    student_id VARCHAR(50) NOT NULL,
    total_score DECIMAL(7,2) NOT NULL DEFAULT 0.00,
    total_coins INT NOT NULL DEFAULT 0,
    average_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    global_rank INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uq_student_leaderboard (student_id),
    INDEX idx_leaderboard_rank (global_rank)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Review Questions Table (for quick student tracking fallback)
CREATE TABLE IF NOT EXISTS review_questions (
    id VARCHAR(50) NOT NULL,
    student_id VARCHAR(50) NOT NULL,
    exam_id VARCHAR(50) NOT NULL,
    question_id VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE,
    UNIQUE KEY uq_student_question_review (student_id, question_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
