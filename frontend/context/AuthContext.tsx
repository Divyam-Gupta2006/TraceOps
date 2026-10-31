'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { AuthUser, API_BASE } from '@/lib/auth';

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (credentials: { email: string; password: string }) => Promise<AuthUser>;
  register: (data: {
    name?: string;
    email: string;
    password: string;
  }) => Promise<AuthUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const router = useRouter();

  // No stored token to recover on mount — session lives in memory only.
  // isLoading is always false because there is nothing asynchronous to check.
  const isLoading = false;

  const login = async ({
    email,
    password,
  }: {
    email: string;
    password: string;
  }): Promise<AuthUser> => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      const errorMsg = Array.isArray(data?.message)
        ? data.message.join(', ')
        : data?.message || 'Invalid email or password.';
      throw new Error(errorMsg);
    }

    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const register = async ({
    name,
    email,
    password,
  }: {
    name?: string;
    email: string;
    password: string;
  }): Promise<AuthUser> => {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name?.trim() || undefined,
        email: email.trim().toLowerCase(),
        password,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      const errorMsg = Array.isArray(data?.message)
        ? data.message.join(', ')
        : data?.message || 'Registration failed.';
      throw new Error(errorMsg);
    }

    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    router.push('/login');
  }, [router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
