-- Users
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  pass_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Attempts (practice & ranked)
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  mode TEXT NOT NULL,
  seed TEXT NOT NULL,
  question_index INTEGER,
  used_time_ms INTEGER NOT NULL,
  correct INTEGER NOT NULL,
  par REAL NOT NULL,
  score INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

-- Daily sets (10 problems)
CREATE TABLE IF NOT EXISTS daily_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ymd TEXT UNIQUE NOT NULL,
  seed TEXT NOT NULL,
  data_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Rating (non-versus)
CREATE TABLE IF NOT EXISTS rating (
  user_id INTEGER PRIMARY KEY,
  total_score INTEGER NOT NULL DEFAULT 0,
  daily_best_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

-- Versus rating (Elo/Glicko-lite)
CREATE TABLE IF NOT EXISTS versus_rating (
  user_id INTEGER PRIMARY KEY,
  elo REAL NOT NULL DEFAULT 1500,
  rd REAL NOT NULL DEFAULT 350,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

-- Matches (versus)
CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  data_json TEXT NOT NULL
);
