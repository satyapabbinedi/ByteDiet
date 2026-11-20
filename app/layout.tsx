import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Media Lab / Local pipeline PoC', description: 'Local-first media compression and comparison lab' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
