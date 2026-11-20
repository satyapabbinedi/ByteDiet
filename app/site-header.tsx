'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'LAB' },
  { href: '/design', label: 'SYSTEM DESIGN' },
];

export function SiteHeader() {
  const pathname = usePathname();
  return <header className="topbar">
    <Link href="/" className="brand"><span className="brand-mark" aria-hidden="true">⌁</span><span>MEDIA LAB</span><small>LOCAL PIPELINE / POC-01</small></Link>
    <div className="top-right">
      <nav className="site-nav" aria-label="Primary">
        {links.map(link => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? 'page' : undefined}>{link.label}</Link>)}
      </nav>
      <div className="top-status"><span className="pulse" /> local filesystem <span className="divider" /> v0.2.0</div>
    </div>
  </header>;
}
