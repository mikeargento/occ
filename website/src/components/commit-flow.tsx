const ARTIFACTS = [
  {
    label: "Photo",
    icon: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </>
    ),
  },
  {
    label: "Video",
    icon: (
      <>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <polygon points="10,9 10,15 15,12" />
      </>
    ),
  },
  {
    label: "Audio",
    icon: (
      <>
        <path d="M4 12v-2M4 12v2" />
        <path d="M8 12V7M8 12v5" />
        <path d="M12 12V4M12 12v8" />
        <path d="M16 12V7M16 12v5" />
        <path d="M20 12v-2M20 12v2" />
      </>
    ),
  },
  {
    label: "Document",
    icon: (
      <>
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M8 13h8M8 17h5" />
      </>
    ),
  },
  {
    label: "Dataset",
    icon: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
      </>
    ),
    hideBelow: "sm" as const,
  },
  {
    label: "Code",
    icon: (
      <>
        <path d="M16 18l6-6-6-6" />
        <path d="M8 6l-6 6 6 6" />
      </>
    ),
  },
  {
    label: "AI Model",
    icon: (
      <>
        <circle cx="12" cy="4" r="2" />
        <circle cx="6" cy="12" r="2" />
        <circle cx="18" cy="12" r="2" />
        <circle cx="12" cy="20" r="2" />
        <path d="M12 6l-4.5 4.5M12 6l4.5 4.5M12 18l-4.5-4.5M12 18l4.5-4.5" />
      </>
    ),
    hideBelow: "lg" as const,
  },
];

function ArtifactIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 text-text-secondary shrink-0"
    >
      {children}
    </svg>
  );
}

export function CommitFlow() {
  return (
    <section className="py-8 sm:py-12 lg:py-16 overflow-hidden" data-commit-flow>
      <div className="mx-auto max-w-5xl px-6">
        <div className="relative h-[200px] sm:h-[280px] lg:h-[360px]">
          {/* Center boundary */}
          <div className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 z-10 flex flex-col items-center pointer-events-none">
            <div
              className="animate-boundary-pulse w-px h-full"
              style={{
                background:
                  "linear-gradient(to bottom, transparent 0%, var(--c-text-tertiary) 20%, var(--c-text-tertiary) 80%, transparent 100%)",
              }}
            />
            <div className="absolute top-1/2 -translate-y-1/2 hidden sm:flex items-center bg-bg/80 backdrop-blur-sm px-3 py-1.5 rounded-full border border-border-subtle">
              <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-text-tertiary whitespace-nowrap">
                Secure Commit
              </span>
            </div>
          </div>

          {/* Artifact lanes */}
          <div className="relative h-full flex flex-col justify-around py-2">
            {ARTIFACTS.map((artifact, i) => (
              <div
                key={artifact.label}
                className={`relative h-0 flex-1 ${
                  artifact.hideBelow === "sm"
                    ? "hidden sm:block"
                    : artifact.hideBelow === "lg"
                      ? "hidden lg:block"
                      : ""
                }`}
              >
                <div className={`cf-lane-${i} absolute inset-y-0 left-0 w-full`}>
                  <div className="absolute top-1/2 -translate-y-1/2 left-0 flex items-center gap-2">
                    {/* Artifact pill */}
                    <div
                      className={`cf-glow-${i} flex items-center gap-2 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg border border-border-subtle bg-bg-elevated`}
                    >
                      <ArtifactIcon>{artifact.icon}</ArtifactIcon>
                      <span className="text-xs font-mono text-text-tertiary hidden sm:inline">
                        {artifact.label}
                      </span>
                    </div>

                    {/* Proof badge */}
                    <div className={`cf-badge-${i}`}>
                      <div className="w-5 h-5 rounded-full bg-success/15 flex items-center justify-center">
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-success"
                        >
                          <path d="M3 6.5l2 2 4-4.5" />
                        </svg>
                      </div>
                    </div>

                    {/* Floating proof card (desktop only) */}
                    <div
                      className={`cf-card-${i} absolute -top-14 left-4 hidden lg:block pointer-events-none`}
                    >
                      <div className="rounded-lg border border-border-subtle bg-bg-elevated/95 backdrop-blur-sm p-2 shadow-lg shadow-black/10">
                        <div className="text-[10px] font-mono leading-relaxed space-y-0.5 whitespace-nowrap">
                          <div className="text-success">artifact &#10003;</div>
                          <div className="text-success">actor &#10003;</div>
                          <div className="text-success">moment &#10003;</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
