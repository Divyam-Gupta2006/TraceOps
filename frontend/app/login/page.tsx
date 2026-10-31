'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity,
  ArrowRight,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Moon,
  Sun,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const { login, user, isLoading } = useAuth();
  const router = useRouter();

  // Load and apply theme
  useEffect(() => {
    const saved = localStorage.getItem('traceops_theme') as 'dark' | 'light' | null;
    const initial = saved || 'dark';
    setTheme(initial);
    document.documentElement.setAttribute('data-theme', initial);
    document.documentElement.classList.toggle('light', initial === 'light');
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('traceops_theme', next);
    document.documentElement.setAttribute('data-theme', next);
    document.documentElement.classList.toggle('light', next === 'light');
  };

  const isDark = theme === 'dark';

  // If already authenticated, redirect to dashboard
  useEffect(() => {
    if (!isLoading && user) {
      router.replace('/');
    }
  }, [user, isLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('Please enter your email address.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setIsSubmitting(true);
    try {
      await login({ email: cleanEmail, password });
      router.push('/');
    } catch (err: any) {
      const msg = err.message || 'Unable to sign in. Please check your credentials.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col justify-center items-center p-4 relative selection:bg-accent selection:text-white transition-colors duration-150">
      {/* Top Bar Theme Toggle */}
      <div className="absolute top-5 right-5">
        <button
          onClick={toggleTheme}
          className="p-2 rounded border border-border bg-surface hover:bg-surface-hover text-text-secondary hover:text-text-primary transition"
          title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          aria-label="Toggle theme"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      <div className="w-full max-w-[420px] space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center gap-2 mb-1">
            <div className="w-9 h-9 rounded bg-surface border border-border flex items-center justify-center shadow-sm">
              <Activity className="w-5 h-5 text-accent" />
            </div>
            <span className="font-semibold text-xl tracking-tight text-text-primary">
              TraceOps
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border text-text-secondary bg-surface">
              v2.4
            </span>
          </div>
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">
            Sign in to your account
          </h1>
          <p className="text-xs text-text-secondary">
            Continuous Website Observability & AI Incident RCA
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-surface border border-border rounded-lg p-6 shadow-xl space-y-5">
          {error && (
            <div className="p-3 rounded border border-status-error/30 bg-status-error/10 text-status-error text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Field */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-medium uppercase tracking-wider text-text-secondary">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-muted">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  placeholder="admin@yourdomain.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-bg border border-border rounded pl-9 pr-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition font-sans"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-medium uppercase tracking-wider text-text-secondary">
                  Password
                </label>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-muted">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-bg border border-border rounded pl-9 pr-10 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition font-sans"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-text-muted hover:text-text-primary transition"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 bg-accent hover:bg-accent-muted text-white font-medium py-2.5 px-4 rounded text-xs transition flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>

          {/* Footer Notice */}
          <div className="pt-2 border-t border-border flex items-center justify-center text-xs text-text-secondary">
            <span>Don&apos;t have an account?</span>
            <Link
              href="/register"
              className="ml-1.5 text-accent hover:underline font-medium"
            >
              Create an account
            </Link>
          </div>
        </div>

        {/* Security footnote */}
        <p className="text-[11px] text-center text-text-muted">
          Protected by TraceOps Multi-Tenant Isolation & JWT Auth Guard.
        </p>
      </div>
    </div>
  );
}

