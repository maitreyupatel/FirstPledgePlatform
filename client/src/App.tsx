import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import LoginForm from "@/components/auth/LoginForm";
import Home from "@/pages/Home";
import ProductDetail from "@/pages/ProductDetail";
import AdminDashboard from "@/pages/AdminDashboard";
import ProductForm from "@/pages/ProductForm";
import NotFound from "@/pages/not-found";
import { useEffect } from "react";

function DeepSpaceBackground() {
  return (
    <div className="fixed inset-0 -z-10 pointer-events-none" aria-hidden>
      {/* Base gradient — deep space atmosphere */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(175deg, #080c10 0%, #09111a 40%, #0c1622 70%, #0d1828 100%)",
        }}
      />
      {/* Primary teal ambient light — the bioluminescent source */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `
            radial-gradient(ellipse 70% 50% at 50% 95%, rgba(0, 229, 200, 0.10) 0%, transparent 65%),
            radial-gradient(ellipse 45% 35% at 15% 10%, rgba(0, 191, 165, 0.055) 0%, transparent 55%),
            radial-gradient(ellipse 35% 28% at 88% 85%, rgba(127, 255, 212, 0.042) 0%, transparent 50%)
          `,
          animation: "hero-breathe 10s ease-in-out infinite",
        }}
      />
      {/* Vignette — edges fall into pure darkness, focuses attention center */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse 85% 80% at 50% 40%, transparent 50%, rgba(4,7,11,0.55) 100%)",
        }}
      />
      {/* Fine grain noise — tactile texture that makes dark backgrounds feel premium */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.028,
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.88' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")",
          backgroundRepeat: "repeat",
          backgroundSize: "256px 256px",
        }}
      />
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/product/:id" component={ProductDetail} />
      <Route path="/login" component={LoginForm} />
      <Route path="/admin">
        <ProtectedRoute>
          <AdminDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/:action/:id?">
        <ProtectedRoute>
          <ProductForm />
        </ProtectedRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  useEffect(() => {
    // Always dark — no light mode
    document.documentElement.classList.add("dark");
    localStorage.setItem("theme", "dark");
  }, []);

  useEffect(() => {
    // Cursor glow — desktop only
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const glow = document.getElementById("cursor-glow");
    if (!glow) return;
    const onMove = (e: MouseEvent) => {
      glow.style.left = e.clientX + "px";
      glow.style.top = e.clientY + "px";
    };
    document.addEventListener("mousemove", onMove, { passive: true });
    return () => document.removeEventListener("mousemove", onMove);
  }, []);

  useEffect(() => {
    // Magnetic glass light — tracks cursor within each glass element
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    function initGlassLight() {
      const els = document.querySelectorAll<HTMLElement>(
        ".glass-card, .glass-pill--interactive, .btn-ghost"
      );
      els.forEach((el) => {
        const onMove = (e: MouseEvent) => {
          const rect = el.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * 100;
          const y = ((e.clientY - rect.top) / rect.height) * 100;
          el.style.setProperty("--light-x", `${x.toFixed(1)}%`);
          el.style.setProperty("--light-y", `${y.toFixed(1)}%`);
          el.style.setProperty("--light-opacity", "1");
        };
        const onLeave = () => el.style.setProperty("--light-opacity", "0");
        el.addEventListener("mousemove", onMove as EventListener, { passive: true });
        el.addEventListener("mouseleave", onLeave);
      });
    }

    // Re-run on DOM mutations so dynamically rendered cards get light too
    const observer = new MutationObserver(initGlassLight);
    observer.observe(document.body, { childList: true, subtree: true });
    initGlassLight();
    return () => observer.disconnect();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <DeepSpaceBackground />
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
