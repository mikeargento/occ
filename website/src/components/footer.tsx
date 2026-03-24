"use client";

import Link from "next/link";

export function Footer() {
  return (
    <footer className="pb-16">
      <div className="mx-auto max-w-6xl px-6 pt-16">
        <div className="flex flex-col md:flex-row md:justify-between gap-12">
          <div className="max-w-md">
            <p className="text-sm text-text-tertiary leading-relaxed">
              Origin Controlled Computing<br />
              Control what your AI agents can do.<br />
              Patent Pending<br />
              <a href="https://buymeacoffee.com/mikeargento" target="_blank" rel="noopener" className="text-text-tertiary hover:text-text transition-colors">Buy Me a Coffee</a>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3 sm:gap-16">
            <div>
              <h4 className="text-[11px] font-medium uppercase tracking-[0.15em] text-text-tertiary mb-5">
                Product
              </h4>
              <ul className="space-y-3">
                <li><a href="https://agent.occ.wtf" className="text-sm text-text-secondary hover:text-text transition-colors">Dashboard</a></li>
                <li><Link href="/api-reference" className="text-sm text-text-secondary hover:text-text transition-colors">API Reference</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="text-[11px] font-medium uppercase tracking-[0.15em] text-text-tertiary mb-5">
                Protocol
              </h4>
              <ul className="space-y-3">
                <li><Link href="/docs" className="text-sm text-text-secondary hover:text-text transition-colors">Documentation</Link></li>
                <li><Link href="/docs/proof-format" className="text-sm text-text-secondary hover:text-text transition-colors">Proof Format</Link></li>
                <li><Link href="/docs/trust-model" className="text-sm text-text-secondary hover:text-text transition-colors">Trust Model</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="text-[11px] font-medium uppercase tracking-[0.15em] text-text-tertiary mb-5">
                Resources
              </h4>
              <ul className="space-y-3">
                <li><a href="https://github.com/mikeargento/occ" target="_blank" rel="noopener" className="text-sm text-text-secondary hover:text-text transition-colors">GitHub</a></li>
                <li><a href="https://npmjs.com/package/occproof" target="_blank" rel="noopener" className="text-sm text-text-secondary hover:text-text transition-colors">npm</a></li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
