import { Link, useLocation } from "wouter";
import { LogOut, Menu, X } from "lucide-react";
import { useAuth } from "./auth/AuthProvider";
import { useEffect, useRef, useState } from "react";

interface HeaderProps {
  showAdminLink?: boolean;
}

function ShieldLogo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="FirstPledge"
    >
      <path
        d="M20 2C20 2 6 8 6 20V32C6 38 12 44 20 46C28 44 34 38 34 32V20C34 8 20 2 20 2Z"
        fill="currentColor"
        fillOpacity="0.12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M13 24L18 29L27 19"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="24"
        strokeDashoffset="24"
        style={{ animation: "stroke-draw 0.6s cubic-bezier(0.16,1,0.3,1) 0.4s forwards" }}
      />
    </svg>
  );
}

const NAV_LINKS = [
  { href: "#products",     label: "Products" },
  { href: "#how-it-works", label: "How It Works" },
  { href: "#ingredients",  label: "Ingredients" },
];

export default function Header({ showAdminLink = false }: HeaderProps) {
  const [location] = useLocation();
  const { user, signOut } = useAuth();
  const isAdminPage = location.startsWith("/admin");
  const [scrolled, setScrolled]   = useState(false);
  const [menuOpen, setMenuOpen]   = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const handleLogout = async () => {
    await signOut();
    window.location.href = "/login";
  };

  useEffect(() => {
    const sentinel = document.getElementById("hero-scroll-sentinel");
    if (!sentinel) return;
    observerRef.current = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { threshold: 0 }
    );
    observerRef.current.observe(sentinel);
    return () => observerRef.current?.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    setMenuOpen(false);
    if (id.startsWith("#")) document.querySelector(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const navLinkStyle: React.CSSProperties = {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontFamily: "var(--font-body)",
  };

  return (
    <>
      <header
        className={`fp-nav fixed top-0 left-0 right-0 z-50 ${scrolled ? "scrolled" : ""}`}
        style={{ height: "64px" }}
      >
        <div
          className="mx-auto flex items-center justify-between h-full px-6"
          style={{ maxWidth: "1280px" }}
        >
          {/* Logo — Link renders as <a>, no inner <a> needed */}
          <Link
            href="/"
            className="flex items-center gap-2"
            style={{
              color: "#00e5c8",
              textDecoration: "none",
              flexShrink: 0,
            }}
            data-testid="link-home"
          >
            <ShieldLogo size={28} />
            <span
              className="font-display font-semibold hidden sm:block"
              style={{
                fontSize: "var(--text-sm)",
                color: "var(--fp-text-primary)",
                letterSpacing: "-0.02em",
              }}
            >
              FirstPledge
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map(({ href, label }) => (
              <button key={label} onClick={() => scrollTo(href)} className="fp-nav-link" style={navLinkStyle}>
                {label}
              </button>
            ))}
            {showAdminLink && (
              <Link href="/admin" className="fp-nav-link" data-testid="link-admin">
                Admin
              </Link>
            )}
          </nav>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-2">
            {isAdminPage && user ? (
              <button
                onClick={handleLogout}
                className="btn-ghost"
                style={{ padding: "0.5rem 1rem", fontSize: "var(--text-xs)" }}
                data-testid="button-logout"
              >
                <LogOut size={14} />
                Logout
              </button>
            ) : (
              <>
                <Link
                  href="/login"
                  className="btn-ghost"
                  style={{ padding: "0.5rem 1.25rem", fontSize: "var(--text-xs)" }}
                >
                  Sign In
                </Link>
                <button
                  onClick={() => scrollTo("#products")}
                  className="btn-primary"
                  style={{ padding: "0.5rem 1.25rem", fontSize: "var(--text-xs)" }}
                >
                  Get Started
                </button>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden btn-ghost"
            style={{ padding: "0.5rem", fontSize: "var(--text-xs)" }}
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </header>

      {/* Mobile flyout */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{
            background: "rgba(8, 12, 16, 0.97)",
            backdropFilter: "blur(32px) saturate(200%)",
            WebkitBackdropFilter: "blur(32px) saturate(200%)",
            display: "flex",
            flexDirection: "column",
            padding: "5rem 2rem 2rem",
            gap: "0.25rem",
          }}
        >
          {NAV_LINKS.map(({ href, label }) => (
            <button
              key={label}
              onClick={() => scrollTo(href)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "1rem 0",
                fontFamily: "var(--font-display)",
                fontSize: "var(--text-xl)",
                fontWeight: 700,
                color: "var(--fp-text-secondary)",
                background: "none",
                border: "none",
                borderBottom: "1px solid var(--fp-glass-border)",
                cursor: "pointer",
                letterSpacing: "-0.02em",
                transition: "color var(--dur-fast) var(--ease-out)",
              }}
            >
              {label}
            </button>
          ))}
          {showAdminLink && (
            <Link
              href="/admin"
              onClick={() => setMenuOpen(false)}
              style={{
                display: "block",
                padding: "1rem 0",
                fontFamily: "var(--font-display)",
                fontSize: "var(--text-xl)",
                fontWeight: 700,
                color: "var(--fp-text-secondary)",
                borderBottom: "1px solid var(--fp-glass-border)",
                textDecoration: "none",
              }}
            >
              Admin
            </Link>
          )}
          <div style={{ marginTop: "2rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {isAdminPage && user ? (
              <button onClick={handleLogout} className="btn-ghost" data-testid="button-logout">
                <LogOut size={14} /> Logout
              </button>
            ) : (
              <>
                <Link href="/login" className="btn-ghost" style={{ justifyContent: "center" }}>
                  Sign In
                </Link>
                <button
                  onClick={() => scrollTo("#products")}
                  className="btn-primary"
                  style={{ justifyContent: "center" }}
                >
                  Get Started
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
