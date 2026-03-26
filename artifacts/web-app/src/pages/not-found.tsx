import React from "react";
import { Link } from "wouter";
import { Terminal, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="border border-border bg-card p-8 rounded font-mono text-center max-w-md">
        <Terminal className="w-10 h-10 mx-auto mb-6 text-muted-foreground opacity-60" />
        <h1 className="text-4xl font-bold mb-2 tracking-widest text-foreground">404</h1>
        <h2 className="text-base mb-4 font-semibold uppercase tracking-wider text-foreground">Page Not Found</h2>
        <p className="text-sm text-muted-foreground leading-relaxed mb-8">The requested page does not exist.</p>
        <Link href="/" className="inline-flex items-center text-sm font-mono text-muted-foreground hover:text-foreground transition-colors border border-border px-4 py-2 rounded hover:border-foreground/30">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Home
        </Link>
      </div>
    </div>
  );
}
