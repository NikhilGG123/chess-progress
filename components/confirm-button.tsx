"use client";

/**
 * A submit button that states what will be lost before it does it.
 *
 * Deliberately not "Are you sure?" -- that question is answered "yes" by
 * reflex. Naming the consequence ("3 students checked in, 2 notes") is what
 * actually gives someone the chance to stop.
 *
 * Used for the deletes an ordinary coach may perform. The ones that cascade
 * across every student are gated on the Admin account instead, in 0009.
 */
export function ConfirmButton({
  action,
  fields,
  confirm,
  children,
  className,
}: {
  action: (formData: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  confirm: string;
  children: React.ReactNode;
  className?: string;
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
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  );
}
