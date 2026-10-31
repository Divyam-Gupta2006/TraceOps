/**
 * TraceOps Authentication Utilities
 *
 * JWT is held in React state (memory) only.
 * Refreshing the page clears the session — the user must log in again.
 * This avoids storing secrets in localStorage or JavaScript-readable cookies.
 */

export const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
).replace(/\/+$/, '');

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: 'USER' | 'ADMIN' | string;
  createdAt?: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}
