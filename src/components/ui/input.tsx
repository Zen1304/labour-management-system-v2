import * as React from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'flex h-10 w-full rounded-md border border-brand-line bg-white px-3 py-2 text-sm text-brand-ink placeholder:text-brand-ink-soft/70 focus:outline-none focus:ring-2 focus:ring-brand-accent/40 focus:border-brand-accent',
        className
      )}
      {...props}
    />
  );
}
