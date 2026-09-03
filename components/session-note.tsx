"use client";

import { useEffect, useRef, useState } from "react";
import { saveNote } from "@/app/(app)/actions";

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * A coach's notepad for one student in one class. Free text on purpose --
 * they have their own shorthand and structuring it would only get in the way.
 *
 * Saves 1s after typing stops, and again on blur, so a coach who taps away
 * mid-thought does not lose the note.
 *
 * A note saves as whole text, which makes it the one place two coaches can
 * lose real work rather than a single cell. So an edit arriving from the other
 * coach is applied only when this box has nothing unsaved in it; otherwise it
 * waits behind a prompt and the coach decides. Nothing is ever overwritten
 * without being seen.
 */
export function SessionNote({
  sessionId,
  studentId,
  studentName,
  initialText,
  remoteText,
}: {
  sessionId: string;
  studentId: string;
  studentName: string;
  initialText: string;
  /** The latest text seen on this note from anywhere, or null. */
  remoteText: string | null;
}) {
  const [text, setText] = useState(initialText);
  const [state, setState] = useState<SaveState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [incoming, setIncoming] = useState<string | null>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef(initialText);
  // The latest text, for the flush on unmount. Written after render, not
  // during it: nothing reads it until a timer or an unmount fires.
  const textRef = useRef(initialText);
  useEffect(() => {
    textRef.current = text;
  });

  async function flush(value: string) {
    if (value === lastSaved.current) return;

    setState("saving");
    const result = await saveNote({ sessionId, studentId, text: value });

    if (result.error) {
      setState("error");
      setMessage(result.error);
    } else {
      lastSaved.current = value;
      setState("saved");
      setMessage(null);
    }
  }

  function onChange(value: string) {
    setText(value);
    setState("idle");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(value), 1000);
  }

  // Someone else saved this note.
  useEffect(() => {
    if (remoteText === null) return;
    // Our own write echoing back, or a value we already show.
    if (remoteText === lastSaved.current || remoteText === textRef.current) {
      setIncoming(null);
      return;
    }

    const unsaved = textRef.current !== lastSaved.current;
    if (unsaved) {
      setIncoming(remoteText);
    } else {
      lastSaved.current = remoteText;
      setText(remoteText);
      setIncoming(null);
    }
  }, [remoteText]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const noteId = `note-${studentId}`;

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label htmlFor={noteId} className="text-sm font-medium">
          {studentName}
        </label>
        <span
          aria-live="polite"
          className={`text-xs ${
            state === "error" ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {state === "saving" && "Saving…"}
          {state === "saved" && "Saved"}
          {state === "error" && `Not saved — ${message}`}
        </span>
      </div>

      <textarea
        id={noteId}
        value={text}
        rows={3}
        placeholder="Anything worth remembering for next week…"
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          if (timer.current) clearTimeout(timer.current);
          flush(text);
        }}
        className="w-full resize-y rounded-md border border-border-strong bg-surface px-3 py-2
                   text-sm placeholder:text-muted-foreground"
      />

      {incoming !== null && (
        <div className="mt-1.5 rounded-md border border-border-strong bg-muted px-3 py-2">
          <p className="text-xs font-medium">
            The other coach edited this note while you were typing
          </p>
          <p className="mt-1 text-xs whitespace-pre-wrap text-muted-foreground">
            {incoming || "(they cleared it)"}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                const merged = text.trim()
                  ? `${incoming}\n${text}`.trim()
                  : incoming;
                setIncoming(null);
                onChange(merged);
              }}
              className="h-8 cursor-pointer rounded border border-border-strong bg-surface px-2
                         text-xs font-medium transition-colors duration-200 hover:bg-muted"
            >
              Keep both
            </button>
            <button
              type="button"
              onClick={() => {
                setIncoming(null);
                lastSaved.current = incoming;
                setText(incoming);
                setState("idle");
              }}
              className="h-8 cursor-pointer rounded border border-border px-2 text-xs
                         text-muted-foreground transition-colors duration-200 hover:bg-muted"
            >
              Use theirs
            </button>
            <button
              type="button"
              onClick={() => {
                setIncoming(null);
                flush(textRef.current);
              }}
              className="h-8 cursor-pointer rounded border border-border px-2 text-xs
                         text-muted-foreground transition-colors duration-200 hover:bg-muted"
            >
              Keep mine
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
