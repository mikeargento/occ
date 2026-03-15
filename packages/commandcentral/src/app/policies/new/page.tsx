"use client";

import Link from "next/link";
import { PolicyForm } from "@/components/policy-builder/policy-form";

export default function NewPolicyPage() {
  return (
    <div className="max-w-5xl mx-auto px-8 py-8">
      <div className="flex items-center gap-1.5 text-[12px] text-text-tertiary mb-6">
        <Link
          href="/policies"
          className="hover:text-text-secondary transition-colors"
        >
          Policies
        </Link>
        <svg className="w-3 h-3 text-text-tertiary" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M6 4l4 4-4 4" />
        </svg>
        <span className="text-text-secondary">New</span>
      </div>
      <h1 className="text-lg font-semibold tracking-[-0.01em] mb-6">
        Create Policy
      </h1>
      <PolicyForm />
    </div>
  );
}
