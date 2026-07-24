import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "./AuthProvider";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export default function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { user, loading, role, roleLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Replace current history entry so back-button skips the protected route
    // and returns to whatever the user was viewing before (e.g. home).
    if (!loading && !user) {
      setLocation("/login", { replace: true });
    }
  }, [user, loading, setLocation]);

  // Show loading spinner while checking auth (and the role, for admin routes)
  if (loading || (requireAdmin && !!user && roleLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Don't render anything if not authenticated (will redirect via useEffect)
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Enforce admin role (from user_profiles) for admin-only routes
  if (requireAdmin && role !== "admin") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md space-y-3 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Access denied</h1>
          <p className="text-sm text-muted-foreground">
            You need administrator access to view this page.
          </p>
          <Button variant="outline" onClick={() => setLocation("/")}>
            Back to home
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

