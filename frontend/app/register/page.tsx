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
  User,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const { register, user, isLoading } = useAuth();
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
      setError('Please provide an email address.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please verify your password confirmation.');
      return;
    }

    setIsSubmitting(true);
    try {
      await register({
        name: name.trim() || undefined,
        email: cleanEmail,
        password,
      });
      setSuccess(true);
      // Small pause so user sees the success state before transition
      setTimeout(() => {
        router.push('/');
      }, 500);
    } catch (err: any) {
      const msg = err.message || 'Registration failed. Please try again.';
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
            Create an account
          </h1>
          <p className="text-xs text-text-secondary">
            Provision your isolated multi-tenant workspace
          </p>
        </div>

        {/* Register Card */}
        <div className="bg-surface border border-border rounded-lg p-6 shadow-xl space-y-5">
          {error && (
            <div className="p-3 rounded border border-status-error/30 bg-status-error/10 text-status-error text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 rounded border border-status-success/30 bg-status-success/10 text-status-success text-xs flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Account created successfully! Redirecting to dashboard...</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full Name */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-medium uppercase tracking-wider text-text-secondary">
                Full Name (Optional)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-muted">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  autoComplete="name"
                  placeholder="Alice SRE"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-bg border border-border rounded pl-9 pr-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition font-sans"
                />
              </div>
            </div>

            {/* Email Address */}
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
                  autoComplete="email"
                  placeholder="alice@traceops.io"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-bg border border-border rounded pl-9 pr-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition font-sans"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-medium uppercase tracking-wider text-text-secondary">
                Password (min 6 characters)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-muted">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  autoComplete="new-password"
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

            {/* Confirm Password */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-medium uppercase tracking-wider text-text-secondary">
                Confirm Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text-muted">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-bg border border-border rounded pl-9 pr-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition font-sans"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || success}
              className="w-full mt-2 bg-accent hover:bg-accent-muted text-white font-medium py-2.5 px-4 rounded text-xs transition flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Creating account...</span>
                </>
              ) : (
                <>
                  <span>Create Account</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>

          {/* Footer Notice */}
          <div className="pt-2 border-t border-border flex items-center justify-center text-xs text-text-secondary">
            <span>Already have an account?</span>
            <Link
              href="/login"
              className="ml-1.5 text-accent hover:underline font-medium"
            >
              Sign in
            </Link>
          </div>
        </div>

        {/* Security footnote */}
        <p className="text-[11px] text-center text-text-muted">
          Your workspace and telemetry data are isolated with multi-tenant encryption.
        </p>
      </div>
    </div>
  );
}

