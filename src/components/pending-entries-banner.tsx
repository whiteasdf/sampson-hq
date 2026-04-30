"use client";

import { useState, useEffect } from "react";
import { getPendingEntries, removePendingEntry } from "@/lib/timer-store";
import type { PendingEntry } from "@/lib/timer-store";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";

export function PendingEntriesBanner() {
  const [entries, setEntries] = useState<PendingEntry[]>([]);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    setEntries(getPendingEntries());
  }, []);

  if (entries.length === 0) return null;

  async function retryAll() {
    setRetrying(true);
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    if (!session) { setRetrying(false); return; }

    let successCount = 0;
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      try {
        const res = await fetch("/api/activities/post", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            accelo_task_id: entry.accelo_task_id,
            elapsed_seconds: entry.elapsed_seconds,
            description: entry.description,
            billable: entry.billable,
          }),
        });
        if (res.ok) {
          removePendingEntry(i);
          successCount++;
        }
      } catch {
        // keep in queue
      }
    }
    setEntries(getPendingEntries());
    setRetrying(false);
  }

  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
      <AlertTriangle className="size-4 text-amber-600 shrink-0" />
      <p className="flex-1 text-sm text-amber-800">
        You have <span className="font-semibold">{entries.length}</span> unsent time {entries.length === 1 ? "entry" : "entries"}.
      </p>
      <Button size="sm" onClick={retryAll} disabled={retrying} className="gap-1.5 shrink-0">
        {retrying ? <Loader2 className="size-3.5 animate-spin" /> : null}
        Submit now
      </Button>
    </div>
  );
}
