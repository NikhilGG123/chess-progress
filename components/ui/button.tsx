import type { ComponentProps } from "react";

/**
 * The one button.
 *
 * There were twenty-five hand-rolled ones before this: four heights, two
 * border tokens used interchangeably, and three different hover treatments.
 * Individually each was fine; together they were the main reason the app
 * looked unfinished.
 *
 * The variants are the ones the app already had, named:
 *
 *   primary    the single committing action on a screen -- "Everyone here saw
 *              these", "Add student". At most one per section.
 *   secondary  ordinary actions with a visible edge: Rename, Extend, Add topic
 *   ghost      actions that should not compete -- Sign out, Show all
 *   danger     destructive, and quiet until you approach it. Red on hover
 *              rather than at rest, because a red button in a grid a coach is
 *              tapping mid-class is an accident waiting to happen
 *
 * Sizes are `sm` (32px) for controls inside a row, `md` (40px) for everything
 * else, and `lg` (44px) for the one submit at the bottom of a form. 40px is
 * the floor for anything tapped one-handed during a lesson; `sm` is for dense
 * rows a coach is reading rather than jabbing at.
 */
const VARIANTS = {
  primary:
    "bg-primary text-primary-foreground border border-transparent hover:opacity-90",
  secondary: "border border-border-strong text-foreground hover:bg-muted",
  ghost:
    "border border-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
  danger:
    "border border-border text-muted-foreground hover:border-destructive hover:text-destructive",
} as const;

const SIZES = {
  sm: "h-8 px-2.5 text-xs",
  md: "h-10 px-3.5 text-sm",
  /** Form submits, which were already larger and should stay that way. */
  lg: "h-11 px-4 text-base",
} as const;

export type ButtonVariant = keyof typeof VARIANTS;
export type ButtonSize = keyof typeof SIZES;

export function buttonClass(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
  extra = "",
) {
  return [
    "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md",
    "font-medium whitespace-nowrap transition-colors duration-200",
    // Disabled has to look unavailable *and* stop the pointer changing, or a
    // coach taps a dead button repeatedly and assumes the app has hung.
    "disabled:cursor-not-allowed disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    extra,
  ].join(" ");
}

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  type = "button",
  ...rest
}: ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      {...rest}
    />
  );
}
