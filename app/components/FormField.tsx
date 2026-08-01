import type { InputHTMLAttributes } from "react";

export default function FormField({
  label,
  error,
  id,
  ...inputProps
}: {
  label: string;
  error?: string;
} & InputHTMLAttributes<HTMLInputElement> & { id: string }) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-medium text-black dark:text-zinc-50"
      >
        {label}
      </label>
      <input
        id={id}
        {...inputProps}
        className="mt-1.5 block w-full rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm text-black outline-none transition-colors placeholder:text-zinc-400 focus:border-black/[.2] dark:border-white/[.145] dark:bg-[#0a0a0a] dark:text-zinc-50 dark:focus:border-white/[.3]"
      />
      {error && (
        <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
