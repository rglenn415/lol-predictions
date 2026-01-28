import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { db, DbUser, DbRefreshToken } from '../db/database.js';
import { JWT_SECRET } from '../middleware/auth.js';

const SALT_ROUNDS = 10;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface UserResponse {
  id: number;
  username: string;
  email: string | null;
  displayName: string | null;
  bio: string | null;
  totalPoints: number;
  createdAt: string;
}

function toUserResponse(user: DbUser): UserResponse {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.display_name,
    bio: user.bio,
    totalPoints: user.total_points,
    createdAt: user.created_at,
  };
}

export async function createUser(
  username: string,
  password: string,
  email?: string
): Promise<UserResponse> {
  // Validate username
  if (!/^[a-zA-Z0-9_]{2,20}$/.test(username)) {
    throw new Error('Username must be 2-20 characters, alphanumeric and underscores only');
  }

  // Check if username exists
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    throw new Error('Username already taken');
  }

  // Check if email exists
  if (email) {
    const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingEmail) {
      throw new Error('Email already registered');
    }
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  // Insert user
  const result = db.prepare(`
    INSERT INTO users (username, email, password_hash, display_name)
    VALUES (?, ?, ?, ?)
  `).run(username, email || null, passwordHash, username);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid) as DbUser;
  return toUserResponse(user);
}

export async function validateCredentials(
  username: string,
  password: string
): Promise<UserResponse | null> {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as DbUser | undefined;
  if (!user) return null;

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return null;

  return toUserResponse(user);
}

export function generateTokens(userId: number, username: string): TokenPair {
  const accessToken = jwt.sign({ userId, username }, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
  });

  const refreshToken = uuidv4();
  const refreshTokenHash = bcrypt.hashSync(refreshToken, SALT_ROUNDS);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  // Store refresh token hash
  db.prepare(`
    INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
    VALUES (?, ?, ?)
  `).run(userId, refreshTokenHash, expiresAt.toISOString());

  return { accessToken, refreshToken };
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenPair | null> {
  // Get all non-expired, non-revoked tokens
  const tokens = db.prepare(`
    SELECT rt.*, u.username
    FROM refresh_tokens rt
    JOIN users u ON u.id = rt.user_id
    WHERE rt.revoked = 0 AND rt.expires_at > datetime('now')
  `).all() as (DbRefreshToken & { username: string })[];

  // Find matching token
  for (const token of tokens) {
    const valid = await bcrypt.compare(refreshToken, token.token_hash);
    if (valid) {
      // Revoke old token
      db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?').run(token.id);

      // Generate new tokens
      return generateTokens(token.user_id, token.username);
    }
  }

  return null;
}

export function revokeRefreshToken(userId: number): void {
  db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?').run(userId);
}

export function getUserById(userId: number): UserResponse | null {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as DbUser | undefined;
  return user ? toUserResponse(user) : null;
}

export function getUserByUsername(username: string): UserResponse | null {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as DbUser | undefined;
  return user ? toUserResponse(user) : null;
}

export function updateProfile(
  userId: number,
  updates: { displayName?: string; bio?: string }
): UserResponse | null {
  const fields: string[] = [];
  const values: (string | number)[] = [];

  if (updates.displayName !== undefined) {
    fields.push('display_name = ?');
    values.push(updates.displayName);
  }
  if (updates.bio !== undefined) {
    fields.push('bio = ?');
    values.push(updates.bio);
  }

  if (fields.length === 0) {
    return getUserById(userId);
  }

  values.push(userId);
  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);

  return getUserById(userId);
}
