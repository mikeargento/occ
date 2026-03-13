"use client";

function Math({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9px] sm:text-base font-mono text-text leading-relaxed mb-3 whitespace-nowrap overflow-x-auto">
      {children}
    </div>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return <sub className="text-[0.7em]">{children}</sub>;
}

const equations = [
  {
    label: "Genesis Invariant",
    math: (
      <Math>
        s&prime; &isin; &Sigma;<Sub>auth</Sub> &rarr; &exist; s &isin; &Sigma;, e &isin; E<Sub>auth</Sub> : (s, e, s&prime;) &isin; C
      </Math>
    ),
    note: "If authenticated state exists, an authorized event produced it.",
  },
  {
    label: "Closure Property",
    math: (
      <Math>
        &Sigma;<Sub>auth</Sub> = Cl(C, E<Sub>auth</Sub>)
      </Math>
    ),
    note: "The authenticated state space is exactly the closure under authorized genesis.",
  },
  {
    label: "Atomicity",
    math: (
      <Math>
        &forall; (s, e, s&prime;) &isin; C : authorize(e) &and; bind(e) &and; commit(s&prime;)
      </Math>
    ),
    note: "Authorization, binding, and commit occur as one indivisible operation.",
  },
  {
    label: "Injective Genesis",
    math: (
      <Math>
        &phi; : E<Sub>auth</Sub> &rarr; &Sigma;<Sub>auth</Sub> is injective
      </Math>
    ),
    note: "Each authorization event maps to exactly one authenticated artifact.",
  },
];

export function CommitPathDiagram() {
  return (
    <div className="mt-10 grid gap-4">
      {equations.map((eq) => (
        <div
          key={eq.label}
          className="rounded-lg border border-border-subtle bg-bg-elevated p-4 sm:p-5"
        >
          <div className="text-[10px] font-medium uppercase tracking-wider text-text-tertiary mb-3">
            {eq.label}
          </div>
          {eq.math}
          <p className="text-xs text-text-tertiary leading-relaxed">
            {eq.note}
          </p>
        </div>
      ))}
    </div>
  );
}
