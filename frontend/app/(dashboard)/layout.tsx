"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import type { User } from "firebase/auth";

const NAV_LINKS = [
  { href: "/meal-plan", label: "Meal Plan" },
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
    <div className="min-h-screen" style={{ background: "var(--cream)" }}>
      {/* Nav */}
      <header
        className="sticky top-0 z-50 px-6 py-4 flex items-center justify-between"
        style={{
          background: "rgba(247,243,236,0.92)",
          borderBottom: "1px solid rgba(122,158,126,0.15)",
          backdropFilter: "blur(8px)",
        }}
      >
        <Link href="/meal-plan">
          <span className="font-display font-light text-[1.25rem]" style={{ color: "var(--deep-green)" }}>
            Patri<em className="italic" style={{ color: "var(--terracotta)" }}>Eats</em>
          </span>
        </Link>

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
          className="font-mono text-[10px] uppercase tracking-[0.15em]"
          style={{ color: "var(--text-muted)" }}
        >
          Sign out
        </button>
      </header>

      {/* Page content */}
      <main className="max-w-5xl mx-auto px-4 py-8 md:px-8">
        {children}
      </main>
    </div>
  );
}
