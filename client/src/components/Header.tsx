import { Link, useLocation } from "wouter";
import { Shield, LogOut } from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import { Button } from "@/components/ui/button";
import { useAuth } from "./auth/AuthProvider";

interface HeaderProps {
  showAdminLink?: boolean;
}

export default function Header({ showAdminLink = false }: HeaderProps) {
  const [location] = useLocation();
  const { user, signOut } = useAuth();
  const isAdminPage = location.startsWith("/admin");

  const handleLogout = async () => {
    await signOut();
    window.location.href = "/login";
  };

  return (
    <header className="fixed top-3 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
      <div
        className="glass rounded-full pointer-events-auto flex items-center justify-between w-full max-w-2xl px-2 pl-3"
        style={{ height: "48px" }}
      >
        {/* Logo */}
        <Link href="/">
          <div
            className="flex items-center gap-2 cursor-pointer group"
            data-testid="link-home"
          >
            <div className="relative flex items-center justify-center w-7 h-7 rounded-full bg-primary/15 group-hover:bg-primary/25 transition-colors duration-300">
              <Shield className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="font-display font-700 text-sm tracking-tight text-foreground group-hover:text-primary transition-colors duration-300">
              FirstPledge
            </span>
          </div>
        </Link>

        {/* Nav — right side */}
        <nav className="flex items-center gap-0.5">
          {showAdminLink && (
            <Link href="/admin">
              <Button
                variant="ghost"
                data-testid="link-admin"
                className="h-8 px-3 text-xs font-medium text-muted-foreground hover:text-foreground rounded-full hover:bg-white/10 dark:hover:bg-white/8 transition-all duration-200"
              >
                Admin
              </Button>
            </Link>
          )}
          {isAdminPage && user && (
            <Button
              variant="ghost"
              onClick={handleLogout}
              className="h-8 px-3 text-xs font-medium text-muted-foreground hover:text-foreground rounded-full hover:bg-white/10 dark:hover:bg-white/8 transition-all duration-200"
              data-testid="button-logout"
            >
              <LogOut className="h-3 w-3 mr-1" />
              Logout
            </Button>
          )}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
