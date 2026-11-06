"use client";

/**
 * Field — a label that is actually attached to its control.
 *
 * Every <label> in this app used to be a styled <div>: `<label className=...>`
 * sitting next to an `<input>` with no `id`, no `htmlFor` and no `aria-label`.
 * 157 of them, none associated. To a screen reader each one reads "edit text,
 * blank" — the person hears nothing about what the field wants. That fails
 * WCAG 2.1 Level A on 1.3.1 (Info and Relationships) and 4.1.2 (Name, Role,
 * Value), and Level A is the floor, not the target. Found in the 2026-11-06
 * pre-Wake-Forest audit.
 *
 * Fixing the pages one input at a time would work once and then rot, because
 * the next form someone writes in a hurry adds to the pile again. So the id is
 * generated here and handed to the control, and there is no way to use this
 * component and forget to connect them.
 *
 * It takes a render function rather than wrapping the control, so the input
 * keeps every class, style and handler it already had — this is an
 * accessibility change, not a restyle:
 *
 *   <Field label="Email" required>
 *     {(p) => <input {...p} type="email" value={v} onChange={...} />}
 *   </Field>
 *
 * The spread carries `id`, `required`, `aria-describedby` (pointing at the
 * hint and the error when they exist) and `aria-invalid`. Spread it first so
 * your own props win if you ever need to override one.
 */

import { useId, type CSSProperties, type ReactNode } from "react";

export type FieldControlProps = {
  id: string;
  required?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
};

type FieldProps = {
  /** Visible label text. Always required: a field with no label is the bug. */
  label: ReactNode;
  /** Marks the control required and shows the asterisk. */
  required?: boolean;
  /** Shows a muted "(optional)" after the label. */
  optional?: boolean;
  /** Help text under the label. Read out with the field. */
  hint?: ReactNode;
  /** Error message. Read out with the field and marks it invalid. */
  error?: ReactNode;
  /** Classes on the wrapper, for grid placement etc. */
  className?: string;
  /** Classes and inline style on the <label>, so pages keep their own look. */
  labelClassName?: string;
  labelStyle?: CSSProperties;
  /** Anything to render on the label row, right-aligned (e.g. "Forgot password?"). */
  labelAside?: ReactNode;
  children: (props: FieldControlProps) => ReactNode;
};

export default function Field({
  label,
  required,
  optional,
  hint,
  error,
  className,
  labelClassName = "block text-sm font-semibold text-gray-700 mb-1",
  labelStyle,
  labelAside,
  children,
}: FieldProps) {
  // useId is stable across server and client render, so this does not
  // mismatch during hydration the way a random id would.
  const id      = useId();
  const hintId  = hint  ? `${id}-hint`  : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const labelEl = (
    <label htmlFor={id} className={labelClassName} style={labelStyle}>
      {label}
      {required && <span className="text-red-500" aria-hidden="true"> *</span>}
      {optional && <span className="text-gray-400 font-normal"> (optional)</span>}
    </label>
  );

  return (
    <div className={className}>
      {labelAside ? (
        <div className="flex items-center justify-between mb-1.5">
          {labelEl}
          {labelAside}
        </div>
      ) : (
        labelEl
      )}

      {hint && (
        <p id={hintId} className="text-xs text-gray-500 mb-1">
          {hint}
        </p>
      )}

      {children({
        id,
        required: required || undefined,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })}

      {error && (
        <p id={errorId} className="text-xs text-red-600 mt-1">
          {error}
        </p>
      )}
    </div>
  );
}
