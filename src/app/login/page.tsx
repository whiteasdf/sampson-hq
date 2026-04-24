"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

type State = "idle" | "loading" | "sent";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setState("loading");

    // Preserve the original destination so the callback can redirect there.
    const next = searchParams.get("next") ?? "/";
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    callbackUrl.searchParams.set("next", next);

    const { error: authError } = await supabaseBrowser.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl.toString() },
    });

    if (authError) {
      setError(authError.message);
      setState("idle");
      return;
    }

    setState("sent");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        {/* Wordmark */}
        <div className="mb-8 text-center">
          <span className="text-2xl font-semibold tracking-tight text-foreground">
            Sampson HQ
          </span>
          <p className="mt-1 text-sm text-muted-foreground">
            Sampson &amp; Associates
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card shadow-sm p-8">
          {state === "sent" ? (
            <div className="text-center space-y-2">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
                {/* envelope check icon */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-6 w-6 text-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.75}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-foreground">
                Check your email
              </h2>
              <p className="text-sm text-muted-foreground">
                We sent a magic link to{" "}
                <span className="font-medium text-foreground">{email}</span>.
                Click it to sign in.
              </p>
              <button
                type="button"
                className="mt-4 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
                onClick={() => {
                  setState("idle");
                  setEmail("");
                }}
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Sign in
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Enter your work email to receive a magic link.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@sampsonassociates.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={state === "loading"}
                  className="bg-background"
                />
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button
                type="submit"
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={state === "loading"}
              >
                {state === "loading" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending link…
                  </>
                ) : (
                  "Send magic link"
                )}
              </Button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Internal use only &mdash; Sampson &amp; Associates
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
