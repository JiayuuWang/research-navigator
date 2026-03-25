import React from "react";
import { Link } from "wouter";
import { Terminal, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="border border-primary/50 bg-primary/5 text-primary p-8 rounded-lg font-mono text-center max-w-md shadow-2xl tech-border">
        <Terminal className="w-12 h-12 mx-auto mb-6 opacity-80" />
        <h1 className="text-4xl font-bold mb-2 tracking-widest text-glow">404</h1>
        <h2 className="text-xl mb-4 font-semibold uppercase tracking-wider">Sector Not Found</h2>
        <p className="text-sm opacity-80 leading-relaxed mb-8">The requested intelligence vector does not exist or has been redacted from the active database.</p>
        <Link href="/" className="inline-flex items-center text-sm font-bold uppercase tracking-widest hover:text-foreground transition-colors border border-primary px-4 py-2 rounded hover:bg-primary hover:text-background">
          <ArrowLeft className="w-4 h-4 mr-2" /> Return to Base
        </Link>
      </div>
    </div>
  );
}
