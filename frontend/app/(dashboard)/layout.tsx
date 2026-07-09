"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import type { User } from "firebase/auth";

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
      {open ? (
        <>
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="6" y1="18" x2="18" y2="6" />
        </>
      ) : (
        <>
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="20" y2="17" />
        </>
      )}
    </svg>
  );
}

const NAV_LINKS = [
  { href: "/meal-plan", label: "Meal Plan" },
  { href: "/calendar", label: "Calendar" },
  { href: "/history", label: "History" },
  { href: "/recipes", label: "Recipes" },
  { href: "/pantry", label: "Pantry" },
  { href: "/shopping", label: "Shopping" },
  { href: "/preferences", label: "Preferences" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      if (!u) {
        router.replace("/login");
      } else {
        setUser(u);
      }
      setAuthReady(true);
    });
    return unsub;
  }, [router]);

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--cream)" }}>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em]" style={{ color: "var(--sage)" }}>
          Loading…
        </p>
      </div>
    );
  }

  if (!user) return null;

  async function handleSignOut() {
    await signOut(auth);
    router.replace("/login");
  }

  return (
    <div className="min-h-screen md:h-screen flex flex-col md:overflow-hidden" style={{ background: "var(--cream)" }}>
      {/* Nav */}
      <header
        className="flex-shrink-0 sticky top-0 z-50 px-4 py-3 md:px-6 md:py-4 flex items-center justify-between gap-3"
        style={{
          background: "rgba(247,243,236,0.92)",
          borderBottom: "1px solid rgba(122,158,126,0.15)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setMobileNavOpen((open) => !open)}
            className="md:hidden p-1.5 -ml-1 rounded-md transition-opacity hover:opacity-70"
            style={{ color: "var(--deep-green)" }}
            aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileNavOpen}
          >
            <MenuIcon open={mobileNavOpen} />
          </button>
          <Link href="/meal-plan" className="min-w-0">
            <span className="font-display font-light text-[1.25rem]" style={{ color: "var(--deep-green)" }}>
              Nouri
            </span>
          </Link>
        </div>

        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(({ href, label }) => {
            const isActive = pathname === href;
            return (
              <Link key={href} href={href}>
                <span
                  className="font-mono text-[10px] uppercase tracking-[0.15em] px-3 py-1.5 rounded-md transition-colors"
                  style={{
                    color: isActive ? "var(--deep-green)" : "var(--sage)",
                    background: isActive ? "rgba(45,74,53,0.08)" : "transparent",
                  }}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>

        <button
          onClick={handleSignOut}
          className="font-mono text-[10px] uppercase tracking-[0.15em] shrink-0"
          style={{ color: "var(--text-muted)" }}
        >
          Sign out
        </button>
      </header>

      {/* Mobile slide-in drawer */}
      {mobileNavOpen && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-[60] md:hidden"
            style={{ background: "rgba(45,74,53,0.35)" }}
            onClick={() => setMobileNavOpen(false)}
          />
          <aside
            className="fixed top-0 left-0 z-[70] h-full w-[min(280px,85vw)] md:hidden flex flex-col shadow-xl"
            style={{ background: "var(--deep-green)", animation: "slideIn 0.25s ease-out" }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "rgba(247,243,236,0.12)" }}>
              <span className="font-display font-light text-[1.35rem]" style={{ color: "var(--cream)" }}>
                Nouri
              </span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="p-1.5 rounded-md"
                style={{ color: "rgba(247,243,236,0.7)" }}
                aria-label="Close menu"
              >
                <MenuIcon open />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
              {NAV_LINKS.map(({ href, label }) => {
                const isActive = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMobileNavOpen(false)}
                    className="block px-4 py-3 rounded-lg transition-colors"
                    style={{
                      background: isActive ? "rgba(247,243,236,0.12)" : "transparent",
                    }}
                  >
                    <span
                      className="font-display text-[1.05rem] font-light"
                      style={{ color: isActive ? "var(--cream)" : "rgba(247,243,236,0.75)" }}
                    >
                      {label}
                    </span>
                    {isActive && (
                      <span
                        className="block font-mono text-[8px] uppercase tracking-[0.18em] mt-0.5"
                        style={{ color: "rgba(232,213,163,0.55)" }}
                      >
                        Current
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
            <div className="px-5 py-4 border-t" style={{ borderColor: "rgba(247,243,236,0.12)" }}>
              <button
                type="button"
                onClick={handleSignOut}
                className="font-mono text-[10px] uppercase tracking-[0.15em]"
                style={{ color: "rgba(247,243,236,0.55)" }}
              >
                Sign out
              </button>
            </div>
          </aside>
        </>
      )}

      {/* Page content — scrollable by default; full-height pages control their own overflow */}
      <main className="flex-1 overflow-y-auto min-h-0">
        <div className="w-full px-4 py-6 md:px-6 md:py-8 md:h-full">
          {children}
        </div>
      </main>
    </div>
  );
}
