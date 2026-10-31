import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'TraceOps — AI Incident & Root-Cause Control Room',
  description: 'Connect any existing application via OpenTelemetry and automate AI Root-Cause Analysis.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased selection:bg-indigo-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}