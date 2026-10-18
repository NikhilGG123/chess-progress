"use client";

import { useState } from "react";
import { downloadBackup } from "@/app/(app)/admin/actions";
import { buttonClass } from "@/components/ui/button";

/**
 * Pulls the whole database down as a JSON file.
 *
 * The file is built on the server and handed back as text; the browser turns
 * it into a download. Nothing is stored anywhere in between, so the snapshot
 * exists only on the machine that asked for it.
 */
export function BackupButton() {
  const [state, setState] = useState<"idle" | "working" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);

  async function run() {
    setState("working");
    setError(null);

    const { error: failure, json, filename } = await downloadBackup();

    // Checked on the payload rather than the error string: `string | null` is
    // not a literal discriminant, so narrowing on the error alone leaves json
    // possibly null as far as the type checker is concerned.
    if (json === null || filename === null) {
      setError(failure ?? "The backup could not be built.");
      setState("idle");
      return;
    }

    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    setSize(`${(blob.size / 1024 / 1024).toFixed(1)} MB`);
    setState("done");
  }

  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={state === "working"}
        className={buttonClass("primary", "lg")}
      >
        {state === "working" ? "Building the file…" : "Download a backup"}
      </button>

      <p aria-live="polite" className="mt-2 text-sm">
        {error ? (
          <span role="alert" className="text-destructive">
            {error}
          </span>
        ) : state === "done" ? (
          <span className="text-muted-foreground">
            Saved to your downloads ({size}). Keep it somewhere that is not this
            laptop.
          </span>
        ) : null}
      </p>
    </div>
  );
}
