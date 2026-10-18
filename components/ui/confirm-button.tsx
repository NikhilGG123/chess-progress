"use client";

import {
  buttonClass,
  type ButtonSize,
  type ButtonVariant,
} from "@/components/ui/button";

/**
 * A submit button that states what will be lost before it does it.
 *
 * Deliberately not "Are you sure?" -- that question is answered "yes" by
 * reflex. Naming the consequence ("3 students checked in, 2 notes") is what
 * actually gives someone the chance to stop.
 *
 * Styling comes from the shared button rather than a className passed in by
 * every caller, which is how four heights and two border tokens ended up in
 * circulation.
 *
 * Used for the deletes an ordinary coach may perform. The ones that cascade
 * across every student are gated on the Admin account instead, in 0009.
 */
export function ConfirmButton({
  action,
  fields,
  confirm,
  children,
  variant = "danger",
  size = "md",
}: {
  action: (formData: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  confirm: string;
  children: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(confirm)) event.preventDefault();
      }}
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button type="submit" className={buttonClass(variant, size)}>
        {children}
      </button>
    </form>
  );
}
