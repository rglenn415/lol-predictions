import Database, { Database as DatabaseType } from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, '../../data/predictions.db');

export const db: DatabaseType = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize schema
export function initializeDatabase(): void {
  const schemaPath = join(__dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  // Run migrations for existing databases
  runMigrations();

  console.log('Database initialized');
}

// Run migrations to add new columns to existing databases
function runMigrations(): void {
  // Check if total_points column exists
  const tableInfo = db.prepare("PRAGMA table_info(users)").all() as { name: string }[];
  const hasPointsColumn = tableInfo.some(col => col.name === 'total_points');

  if (!hasPointsColumn) {
    console.log('Adding total_points column to users table...');
    db.exec('ALTER TABLE users ADD COLUMN total_points INTEGER DEFAULT 0');

    // Backfill points for existing users
    recalculateAllUserPoints();
  }

  // Clean up duplicate events that share a match_id (keep the most recent row)
  cleanupDuplicateEvents();
}

function cleanupDuplicateEvents(): void {
  const deleted = db.prepare(`
    DELETE FROM esports_events
    WHERE match_id IS NOT NULL
      AND rowid NOT IN (
        SELECT MAX(rowid) FROM esports_events
        WHERE match_id IS NOT NULL
        GROUP BY match_id
      )
  `).run();

  if (deleted.changes > 0) {
    console.log(`Cleaned up ${deleted.changes} duplicate event(s) by match_id`);
  }
}

// Recalculate and update total_points for all users
export function recalculateAllUserPoints(): void {
  console.log('Recalculating points for all users...');

  const users = db.prepare('SELECT id FROM users').all() as { id: number }[];

  for (const user of users) {
    recalculateUserPoints(user.id);
  }

  console.log(`Recalculated points for ${users.length} users`);
}

// Recalculate and update total_points for a single user
export function recalculateUserPoints(userId: number): number {
  const result = db.prepare(`
    SELECT COALESCE(SUM(points_earned), 0) as total
    FROM predictions
    WHERE user_id = ? AND actual_winner IS NOT NULL
  `).get(userId) as { total: number };

  const totalPoints = result.total;

  db.prepare('UPDATE users SET total_points = ? WHERE id = ?').run(totalPoints, userId);

  return totalPoints;
}

// User types
export interface DbUser {
  id: number;
  username: string;
  email: string | null;
  password_hash: string;
  display_name: string | null;
  bio: string | null;
  total_points: number;
  created_at: string;
}

// Prediction types
export interface DbPrediction {
  id: number;
  user_id: number;
  match_id: string;
  event_id: string;
  team1_code: string;
  team2_code: string;
  predicted_winner: string;
  predicted_score: string;
  actual_winner: string | null;
  actual_score: string | null;
  is_correct_winner: number | null;
  is_correct_score: number | null;
  points_earned: number;
  created_at: string;
}

// Refresh token types
export interface DbRefreshToken {
  id: number;
  user_id: number;
  token_hash: string;
  expires_at: string;
  revoked: number;
}
