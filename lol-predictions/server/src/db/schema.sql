-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    bio TEXT,
    total_points INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Predictions table
CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    match_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    team1_code TEXT NOT NULL,
    team2_code TEXT NOT NULL,
    predicted_winner TEXT NOT NULL,
    predicted_score TEXT NOT NULL,
    actual_winner TEXT,
    actual_score TEXT,
    is_correct_winner BOOLEAN,
    is_correct_score BOOLEAN,
    points_earned INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, match_id)
);

-- Refresh tokens table
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    revoked BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_predictions_user_id ON predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_predictions_match_id ON predictions(match_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);

-- Esports cache tables
CREATE TABLE IF NOT EXISTS esports_events (
    id TEXT PRIMARY KEY,
    start_time TEXT NOT NULL,
    state TEXT NOT NULL,
    league_slug TEXT NOT NULL,
    match_id TEXT,
    event_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_esports_events_state ON esports_events(state);
CREATE INDEX IF NOT EXISTS idx_esports_events_league_slug ON esports_events(league_slug);
CREATE INDEX IF NOT EXISTS idx_esports_events_match_id ON esports_events(match_id);
CREATE INDEX IF NOT EXISTS idx_esports_events_start_time ON esports_events(start_time);

CREATE TABLE IF NOT EXISTS esports_leagues (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    image TEXT
);

CREATE INDEX IF NOT EXISTS idx_esports_leagues_slug ON esports_leagues(slug);

CREATE TABLE IF NOT EXISTS esports_cache_meta (
    key TEXT PRIMARY KEY,
    last_fetched_at TEXT,
    last_success_at TEXT,
    fetch_count INTEGER DEFAULT 0,
    last_error TEXT
);
