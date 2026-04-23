import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "./AuthProvider";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";

export default function LoginForm() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading]   = useState(false);

  const { signIn, signUp, user, loading: authLoading } = useAuth();
  const { toast }      = useToast();
  const [, setLocation] = useLocation();

  // Already logged in — send to admin, replacing history so back goes to home
  useEffect(() => {
    if (!authLoading && user) setLocation("/admin", { replace: true });
  }, [user, authLoading, setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = isSignUp
        ? await signUp(email, password)
        : await signIn(email, password);

      if (error) {
        toast({ title: isSignUp ? "Sign up failed" : "Login failed", description: error.message, variant: "destructive" });
      } else {
        toast({ title: isSignUp ? "Account created" : "Welcome back!", description: isSignUp ? "Check your email to verify." : "" });
        if (!isSignUp) setLocation("/admin", { replace: true });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Unexpected error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 32, height: 32, border: "2px solid var(--fp-teal-mid)", borderTopColor: "transparent", borderRadius: "50%", animation: "page-load 0.8s linear infinite" }} />
      </div>
    );
  }

  if (user) return null;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1.5rem",
        position: "relative",
      }}
    >
      {/* Back to home */}
      <Link
        href="/"
        style={{
          position: "absolute",
          top: "2rem",
          left: "2rem",
          display: "inline-flex",
          alignItems: "center",
          gap: "0.375rem",
          fontFamily: "var(--font-body)",
          fontSize: "var(--text-sm)",
          color: "var(--fp-text-muted)",
          textDecoration: "none",
          transition: "color var(--dur-fast) var(--ease-out)",
        }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--fp-teal-bright)")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--fp-text-muted)")}
      >
        <ArrowLeft size={14} />
        Back to home
      </Link>

      {/* Card */}
      <div
        className="glass-card"
        style={{
          width: "100%",
          maxWidth: "420px",
          padding: "2.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.75rem",
          overflow: "visible",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center" }}>
          {/* Shield logo */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.25rem" }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "linear-gradient(135deg, rgba(0,229,200,0.15), rgba(0,191,165,0.08))",
                border: "1px solid rgba(0,229,200,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--fp-teal-bright)",
              }}
            >
              <svg width="28" height="34" viewBox="0 0 40 48" fill="none">
                <path d="M20 2C20 2 6 8 6 20V32C6 38 12 44 20 46C28 44 34 38 34 32V20C34 8 20 2 20 2Z" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M13 24L18 29L27 19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
          <h1
            className="font-display"
            style={{ fontSize: "var(--text-xl)", fontWeight: 700, letterSpacing: "-0.025em", marginBottom: "0.375rem" }}
          >
            {isSignUp ? "Create Account" : "Admin Login"}
          </h1>
          <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-sm)", color: "var(--fp-text-muted)" }}>
            {isSignUp ? "Sign up for platform access" : "Enter your credentials to access the admin panel"}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {/* Email */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <label
              htmlFor="email"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fp-text-secondary)", letterSpacing: "0.04em", textTransform: "uppercase" }}
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              style={{
                padding: "0.75rem 1rem",
                background: "var(--fp-glass-base)",
                border: "1px solid var(--fp-glass-border)",
                borderRadius: "var(--radius-lg)",
                fontFamily: "var(--font-body)",
                fontSize: "var(--text-sm)",
                color: "var(--fp-text-primary)",
                outline: "none",
                transition: "border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)",
                width: "100%",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--fp-teal-mid)";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(0,229,200,0.10)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--fp-glass-border)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>

          {/* Password */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <label
              htmlFor="password"
              style={{ fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fp-text-secondary)", letterSpacing: "0.04em", textTransform: "uppercase" }}
            >
              Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="password"
                type={showPw ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                minLength={6}
                style={{
                  padding: "0.75rem 3rem 0.75rem 1rem",
                  background: "var(--fp-glass-base)",
                  border: "1px solid var(--fp-glass-border)",
                  borderRadius: "var(--radius-lg)",
                  fontFamily: "var(--font-body)",
                  fontSize: "var(--text-sm)",
                  color: "var(--fp-text-primary)",
                  outline: "none",
                  transition: "border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)",
                  width: "100%",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--fp-teal-mid)";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(0,229,200,0.10)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--fp-glass-border)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                style={{
                  position: "absolute",
                  right: "0.875rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--fp-text-muted)",
                  display: "flex",
                  padding: 0,
                }}
              >
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
            style={{
              width: "100%",
              justifyContent: "center",
              padding: "0.875rem",
              marginTop: "0.25rem",
              opacity: loading ? 0.7 : 1,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Please wait…" : isSignUp ? "Create Account" : "Sign In"}
          </button>
        </form>

        {/* Toggle sign-in / sign-up */}
        <div style={{ textAlign: "center", borderTop: "1px solid var(--fp-glass-border)", paddingTop: "1.25rem" }}>
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--font-body)",
              fontSize: "var(--text-sm)",
              color: "var(--fp-text-muted)",
              transition: "color var(--dur-fast) var(--ease-out)",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--fp-teal-bright)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--fp-text-muted)")}
          >
            {isSignUp ? "Already have an account? Sign in" : "Need an account? Sign up"}
          </button>
        </div>
      </div>
    </div>
  );
}
