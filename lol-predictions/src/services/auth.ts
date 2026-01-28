import type { User } from '../types';

const API_BASE = '/api/auth';

interface AuthResponse {
  user: User;
  accessToken: string;
}

export async function register(
  username: string,
  password: string,
  email?: string
): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username, password, email }),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Registration failed');
  }

  return res.json();
}

export async function login(username: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Login failed');
  }

  return res.json();
}

export async function logout(accessToken: string): Promise<void> {
  await fetch(`${API_BASE}/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: 'include',
  });
}

export async function refreshToken(): Promise<{ accessToken: string } | null> {
  const res = await fetch(`${API_BASE}/refresh`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!res.ok) {
    return null;
  }

  return res.json();
}

export async function getCurrentUser(accessToken: string): Promise<User | null> {
  const res = await fetch(`${API_BASE}/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: 'include',
  });

  if (!res.ok) {
    return null;
  }

  const data = await res.json();
  return data.user;
}
