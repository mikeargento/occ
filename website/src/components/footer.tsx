"use client";

import Link from "next/link";

export function Footer() {
  return (
    <footer className="pb-16">
      <div className="mx-auto max-w-6xl px-6 pt-16">
        <div className="flex flex-col md:flex-row md:justify-between gap-12">
          <div className="max-w-md">
            <p className="text-sm text-text-tertiary leading-relaxed">Origin Controlled Computing</p>
            <a href="https://aimessage.foo" className="text-sm text-[#007aff] hover:opacity-70 transition-opacity mt-2 inline-block">
              AiMessage →
            </a>
          </div>

          <div>
            <ul className="space-y-3">
              <li><Link href="/explorer" className="text-sm text-text-secondary hover:text-text transition-colors">Explorer</Link></li>
              <li><Link href="/docs" className="text-sm text-text-secondary hover:text-text transition-colors">Docs</Link></li>
              <li><a href="https://github.com/mikeargento/occ" target="_blank" rel="noopener" className="text-sm text-text-secondary hover:text-text transition-colors">GitHub</a></li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
