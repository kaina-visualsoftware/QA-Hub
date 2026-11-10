import type { InputHTMLAttributes } from "react";
import { formatTaskVersionInput, normalizeTaskVersion } from "../../lib/task-version";

type VersionInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "onBlur"
> & {
  value: string;
  onValueChange: (value: string) => void;
  onValueBlur?: () => void;
};

/** One mask for all task and release-version inputs (not document revisions). */
export function VersionInput({
  value, onValueChange, onValueBlur, ...props
}: VersionInputProps) {
  return <input
    {...props}
    type="text"
    value={value}
    inputMode="numeric"
    maxLength={13}
    autoComplete="off"
    placeholder="00.00.00.0000"
    onChange={(event) => onValueChange(formatTaskVersionInput(event.target.value))}
    onBlur={(event) => {
      onValueChange(normalizeTaskVersion(event.target.value));
      onValueBlur?.();
    }}
  />;
}
