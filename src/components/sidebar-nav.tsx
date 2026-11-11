'use client';

// Client-side so we can highlight the active section via usePathname —
// AppShell itself stays a server component and just hands this the
// capability-filtered link list.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function SidebarNav({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <nav className="space-y-0.5">
      {links.map((item) => {
        const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'block rounded-md px-3 py-2 text-sm transition-colors',
              active
                ? 'bg-brand-ink text-white'
                : 'text-brand-ink-soft hover:bg-brand-sand hover:text-brand-ink'
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
