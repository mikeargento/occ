import { M, MBlock } from "@/components/math";

export default function Sections7to9() {
  return (
    <>
      {/* ================================================================ */}
      {/* 7. FORMAL MODEL */}
      {/* ================================================================ */}
      <section id="sec-formal">
        <h2 className="text-xl font-semibold mt-12 mb-4">
          <span className="text-text-tertiary mr-2">7</span> Formal Model
        </h2>

        <p className="text-sm text-text-secondary leading-relaxed mb-6">
          We formalize Origin Controlled Computing using a labeled transition
          system and closure algebra. This formalization captures the essential
          properties of the architecture and enables precise comparison with
          existing enforcement models.
        </p>

        {/* 7.1 */}
        <section id="sec-state-space">
          <h3 className="text-lg font-semibold mt-8 mb-3">
            <span className="text-text-tertiary mr-2">7.1</span> State Space
            and Transition System
          </h3>

          <div className="my-5 rounded-r-lg border-l-[3px] border-text-tertiary bg-bg-elevated p-5">
            <p className="text-sm text-text leading-relaxed mb-3">
              <strong>Definition 7.1</strong> (OCC System). An OCC system is a
              labeled transition system{" "}
              <M c={"(\\Sigma, \\rightarrow, E)"} /> where:
            </p>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li>
                <M c={"\\Sigma"} /> is the state space, partitioned into{" "}
                <M
                  c={
                    "\\Sigma_{\\text{auth}} \\cup \\Sigma_{\\text{unauth}}"
                  }
                />
                .
              </li>
              <li>
                <M
                  c={
                    "\\rightarrow \\,\\subseteq \\Sigma \\times E \\times \\Sigma"
                  }
                />{" "}
                is the transition relation labeled by events{" "}
                <M c={"E"} />.
              </li>
              <li>
                <M c={"E_{\\text{auth}} \\subseteq E"} /> is the set of
                authorization events.
              </li>
              <li>
                <M
                  c={
                    "\\mathcal{C} \\subseteq \\Sigma \\times E_{\\text{auth}} \\times \\Sigma_{\\text{auth}}"
                  }
                />{" "}
                is the <em>genesis constructor relation</em>.
              </li>
            </ul>
          </div>

          <p className="text-sm text-text-secondary leading-relaxed mb-6">
            The genesis constructor relation <M c={"\\mathcal{C}"} /> captures
            the protected commit interface: it is the only relation that
            produces elements of <M c={"\\Sigma_{\\text{auth}}"} />. Candidate
            state in <M c={"\\Sigma_{\\text{unauth}}"} /> may be created
            freely by any process.
          </p>
        </section>

        {/* 7.2 */}
        <section id="sec-core-invariants">
          <h3 className="text-lg font-semibold mt-8 mb-3">
            <span className="text-text-tertiary mr-2">7.2</span> Core
            Invariants
          </h3>

          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            An OCC-compliant system enforces three invariants:
          </p>

          <div className="my-5 rounded-r-lg border-l-[3px] border-text-tertiary bg-bg-elevated p-5">
            <p className="text-sm text-text leading-relaxed mb-2">
              <strong>Invariant 7.2</strong> (Constructibility — Closure
              Property).
            </p>
            <MBlock
              c={
                "\\forall\\, s' \\in \\Sigma_{\\text{auth}} : s' \\in \\mathrm{Cl}_{\\mathcal{C}}(E_{\\text{auth}})"
              }
            />
            <p className="text-sm text-text-secondary leading-relaxed mt-2 mb-1">
              where{" "}
              <M
                c={
                  "\\mathrm{Cl}_{\\mathcal{C}}(E_{\\text{auth}}) = \\{ s' \\mid \\exists\\, s \\in \\Sigma,\\, e \\in E_{\\text{auth}} : (s, e, s') \\in \\mathcal{C} \\}"
                }
              />
              .
            </p>
            <p className="text-sm text-text-secondary leading-relaxed">
              Every element of the authenticated state space was produced by a
              genesis constructor under an authorized event.
            </p>
          </div>

          <div className="my-5 rounded-r-lg border-l-[3px] border-text-tertiary bg-bg-elevated p-5">
            <p className="text-sm text-text leading-relaxed mb-2">
              <strong>Invariant 7.3</strong> (Constructor Completeness —
              Unforgeability).
            </p>
            <MBlock
              c={
                "\\forall\\, s, s', e :\\; (s \\xrightarrow{e} s' \\;\\wedge\\; s' \\in \\Sigma_{\\text{auth}}) \\;\\Rightarrow\\; (e \\in E_{\\text{auth}} \\;\\wedge\\; (s, e, s') \\in \\mathcal{C})"
              }
            />
            <p className="text-sm text-text-secondary leading-relaxed mt-2">
              All transitions into the authenticated state space are genesis
              constructors under authorized events. There is no transition into{" "}
              <M c={"\\Sigma_{\\text{auth}}"} /> that bypasses{" "}
              <M c={"\\mathcal{C}"} />.
            </p>
          </div>

          <div className="my-5 rounded-r-lg border-l-[3px] border-text-tertiary bg-bg-elevated p-5">
            <p className="text-sm text-text leading-relaxed mb-2">
              <strong>Invariant 7.4</strong> (Atomic Causality —
              Indivisibility).
            </p>
            <MBlock
              c={
                "\\forall\\, (s, e, s') \\in \\mathcal{C} :\\; \\text{authorize}(e),\\; \\text{bind}(e),\\; \\text{commit}(s')"
              }
            />
            <p className="text-sm text-text-secondary leading-relaxed mt-2">
              occur in a single atomic transition with no intermediate states
              observable outside the protected boundary. Authorization,
              cryptographic binding, and durable commit are inseparable within
              the atomic execution boundary.
            </p>
          </div>
        </section>

        {/* 7.3 */}
        <section id="sec-closure-algebra">
          <h3 className="text-lg font-semibold mt-8 mb-3">
            <span className="text-text-tertiary mr-2">7.3</span> Authenticated
            State as Closure Algebra
          </h3>

          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            The authenticated state space{" "}
            <M c={"\\Sigma_{\\text{auth}}"} /> forms a{" "}
            <em>closure space</em> generated by authorization events through
            genesis constructors. Formally, define the closure operator:
          </p>
          <MBlock
            c={
              "\\mathrm{Auth} : \\mathcal{P}(\\Sigma) \\rightarrow \\mathcal{P}(\\Sigma), \\quad \\mathrm{Auth}(S) = \\{ s' \\mid \\exists\\, e \\in E_{\\text{auth}},\\; s \\in S : (s, e, s') \\in \\mathcal{C} \\}"
            }
          />

          <p className="text-sm text-text-secondary leading-relaxed my-4">
            The invariant{" "}
            <M
              c={
                "\\Sigma_{\\text{auth}} = \\mathrm{Cl}_{\\mathcal{C}}(E_{\\text{auth}})"
              }
            />{" "}
            states that the authenticated state space is exactly the closure
            under authorized genesis. This makes authentication a{" "}
            <em>topological property</em> of the system{"'"}s state space rather
            than a local property of individual artifacts.
          </p>

          <p className="text-sm text-text-secondary leading-relaxed mb-2">
            This formulation connects to existing mathematical structures:
          </p>
          <ul className="space-y-2 text-sm text-text-secondary mb-6">
            <li>
              <strong className="text-text">Order theory</strong>:{" "}
              <M c={"\\Sigma_{\\text{auth}}"} /> forms a Moore family (closed
              under arbitrary intersections of compliant subsets).
            </li>
            <li>
              <strong className="text-text">Type theory</strong>: Genesis
              constructors are the sole constructors of an abstract data type;{" "}
              <M c={"\\Sigma_{\\text{auth}}"} /> has private constructors.
            </li>
            <li>
              <strong className="text-text">Provenance</strong>: Unlike
              provenance semirings, which annotate data with origin information,
              OCC <em>enforces</em> that authenticated state can only exist if
              it has authorized genesis — enforcement, not annotation.
            </li>
          </ul>
        </section>

        {/* 7.4 */}
        <section id="sec-duality">
          <h3 className="text-lg font-semibold mt-8 mb-3">
            <span className="text-text-tertiary mr-2">7.4</span> Token–Nonce
            Duality
          </h3>

          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            The Trusted Origin Token Architecture and Origin Controlled
            Computing enforce the same injective genesis invariant through dual
            mechanisms:
          </p>

          <div className="my-5 rounded-r-lg border-l-[3px] border-text-tertiary bg-bg-elevated p-5">
            <p className="text-sm text-text leading-relaxed">
              <strong>Definition 7.5</strong> (Injective Genesis). A system
              enforces injective genesis if and only if the map{" "}
              <M
                c={
                  "\\varphi : E_{\\text{auth}} \\rightarrow \\Sigma_{\\text{auth}}"
                }
              />{" "}
              defined by <M c={"\\varphi(e) = s'"} /> where{" "}
              <M c={"(s, e, s') \\in \\mathcal{C}"} /> is an injection. Each
              authorization event produces at most one authenticated artifact,
              and each authenticated artifact corresponds to exactly one
              authorization event.
            </p>
          </div>

          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            <strong className="text-text">Token Conservation (TOTA).</strong>{" "}
            Authorization events are reified as consumable tokens. Consumption
            tracking enforces{" "}
            <M
              c={
                "|\\text{tokens consumed}| = |\\Sigma_{\\text{auth}}|"
              }
            />
            . This is a <em>depletable resource</em> model analogous to affine
            types in linear logic.
          </p>

          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            <strong className="text-text">
              Boundary-Fresh Uniqueness (OCC).
            </strong>{" "}
            Authorization events are boundary-generated values whose
            cryptographic freshness ensures uniqueness. Each value appears in
            exactly one authenticated artifact. This is a{" "}
            <em>unique generator</em> model analogous to existential types with
            freshness guarantees.
          </p>

          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            Under perfect cryptography and uncompromised boundary assumptions,
            these mechanisms are <em>cryptographic duals</em>: they enforce the
            same cardinality constraint{" "}
            <M
              c={
                "|E_{\\text{auth}}| = |\\Sigma_{\\text{auth}}|"
              }
            />{" "}
            through isomorphic algebraic structures — consumable resources
            versus generative uniqueness. The token model makes injectivity
            definitional; the boundary-fresh model makes injectivity derived
            from collision resistance and freshness guarantees.
          </p>

          <div className="my-5 rounded-r-lg border-l-[3px] border-text-tertiary bg-bg-elevated p-5">
            <p className="text-sm text-text leading-relaxed mb-3">
              <strong>Remark 7.6</strong> (Structural Non-Reusability).
              Injective genesis ensures that no authorization event can
              contribute to more than one authenticated artifact, and no
              authenticated artifact can exist without a unique authorization
              event. Authorization events are irreversible state transitions —
              once an event has produced an authenticated artifact, it is
              permanently consumed by that production and cannot be replayed,
              redirected, or shared. This is a structural property of the
              genesis constructor, not a bookkeeping constraint enforced by
              external tracking.
            </p>
            <p className="text-sm text-text-secondary leading-relaxed">
              Readers familiar with distributed ledger systems may recognize an
              analogy to double-spend prevention. The invariant is similar —{" "}
              <M
                c={
                  "|E_{\\text{auth}}| = |\\Sigma_{\\text{auth}}|"
                }
              />{" "}
              ensures one-to-one correspondence — but the enforcement mechanism
              is fundamentally different. In ledger systems, double-spend
              prevention requires global consensus over a shared transaction
              history. In OCC, non-reusability is enforced locally by the atomic
              execution boundary: boundary-fresh generation produces a value
              that is cryptographically bound to exactly one artifact at exactly
              one finalization event, with no external coordination required.
            </p>
          </div>
        </section>
      </section>

      {/* ================================================================ */}
      {/* 8. ADVERSARIAL MODEL AND SECURITY GAME */}
      {/* ================================================================ */}
      <section id="sec-security">
        <h2 className="text-xl font-semibold mt-12 mb-4">
          <span className="text-text-tertiary mr-2">8</span> Adversarial Model
          and Security Game
        </h2>

        <p className="text-sm text-text-secondary leading-relaxed mb-6">
          We define a security game that captures the adversarial setting in
          which Origin Controlled Computing operates.
        </p>

        {/* 8.1 */}
        <section id="sec-threat-model">
          <h3 className="text-lg font-semibold mt-8 mb-3">
            <span className="text-text-tertiary mr-2">8.1</span> Threat Model
          </h3>

          <p className="text-sm text-text-secondary leading-relaxed mb-3">
            The adversary <M c={"\\mathcal{A}"} /> is assumed to possess:
          </p>
          <ul className="space-y-2 text-sm text-text-secondary mb-6">
            <li>
              Full control of application code executing outside the atomic
              execution boundary.
            </li>
            <li>Control of storage systems and network transport.</li>
            <li>
              The ability to replay, substitute, or synthesize candidate data.
            </li>
            <li>
              Access to all previously produced authenticated artifacts and
              their verification material.
            </li>
          </ul>

          <p className="text-sm text-text-secondary leading-relaxed mb-3">
            The adversary does <em>not</em> possess:
          </p>
          <ul className="space-y-2 text-sm text-text-secondary mb-6">
            <li>
              The ability to execute code inside the atomic execution boundary.
            </li>
            <li>
              Access to boundary-held capabilities (signing keys, capability
              tokens).
            </li>
            <li>
              The ability to predict or reproduce boundary-fresh cryptographic
              output.
            </li>
          </ul>
        </section>

        {/* 8.2 */}
        <section id="sec-forgery-game">
          <h3 className="text-lg font-semibold mt-8 mb-3">
            <span className="text-text-tertiary mr-2">8.2</span> Security Game:
            Origin Forgery
          </h3>

          <div className="my-5 rounded-r-lg border-l-[3px] border-text-tertiary bg-bg-elevated p-5">
            <p className="text-sm text-text leading-relaxed mb-3">
              <strong>Definition 8.1</strong> (Origin Forgery Game). The game{" "}
              <M
                c={
                  "\\mathrm{Forge}_{\\mathcal{A}}^{\\mathrm{OCC}}(\\lambda)"
                }
              />{" "}
              proceeds as follows, where <M c={"\\lambda"} /> is the security
              parameter:
            </p>
            <ol className="space-y-2 text-sm text-text-secondary list-decimal list-inside">
              <li>
                <strong className="text-text">Setup.</strong> The challenger
                initializes an OCC system with boundary identity{" "}
                <M c={"\\mathit{id}"} />, trust anchors{" "}
                <M c={"\\mathit{TA}"} />, and security parameter{" "}
                <M c={"\\lambda"} />.
              </li>
              <li>
                <strong className="text-text">Query phase.</strong> The
                adversary <M c={"\\mathcal{A}"} /> may submit candidate data to
                the protected commit interface and observe the resulting
                authenticated artifacts and verification material. The adversary
                may make polynomially many such queries.
              </li>
              <li>
                <strong className="text-text">Forgery.</strong> The adversary
                outputs a candidate artifact <M c={"a^*"} /> and verification
                material <M c={"v^*"} />.
              </li>
              <li>
                <strong className="text-text">Win condition.</strong>{" "}
                <M c={"\\mathcal{A}"} /> wins if:
                <ul className="mt-2 ml-4 space-y-1">
                  <li>
                    <M c={"(a^*, v^*)"} /> verifies under trust anchors{" "}
                    <M c={"\\mathit{TA}"} />, and
                  </li>
                  <li>
                    <M c={"(a^*, v^*)"} /> was not produced by any query to the
                    protected commit interface.
                  </li>
                </ul>
              </li>
            </ol>
          </div>

          <div className="my-5 rounded-r-lg border-l-[3px] border-text-tertiary bg-bg-elevated p-5">
            <p className="text-sm text-text leading-relaxed mb-2">
              <strong>Definition 8.2</strong> (OCC Security). An OCC system is{" "}
              <em>secure</em> if for all probabilistic polynomial-time
              adversaries <M c={"\\mathcal{A}"} />:
            </p>
            <MBlock
              c={
                "\\Pr[\\mathrm{Forge}_{\\mathcal{A}}^{\\mathrm{OCC}}(\\lambda) = 1] \\leq \\mathrm{negl}(\\lambda)"
              }
            />
          </div>

          <div className="my-5 rounded-r-lg border-l-[3px] border-text-tertiary bg-bg-elevated p-5">
            <p className="text-sm text-text leading-relaxed">
              <strong>Proposition 8.3</strong> (Security Reduction). If the
              signature scheme is existentially unforgeable under
              chosen-message attack (EUF-CMA) and the freshness source is
              collision-resistant, then the OCC system is secure under
              Definition 8.1.
            </p>
          </div>

          <div className="my-5 rounded-r-lg border-l-[3px] border-text-tertiary bg-bg-elevated p-5">
            <p className="text-sm text-text leading-relaxed mb-3">
              <strong>Proof sketch.</strong> Suppose adversary{" "}
              <M c={"\\mathcal{A}"} /> wins the Origin Forgery Game with
              non-negligible probability. Then <M c={"\\mathcal{A}"} /> has
              produced verification material <M c={"(a^*, v^*)"} /> that
              validates under trust anchors <M c={"\\mathit{TA}"} /> without
              invoking the protected commit interface. The verification material
              includes a signature over a binding of boundary-fresh output{" "}
              <M c={"N^*"} /> and a content-dependent value{" "}
              <M c={"H^*"} />. Since <M c={"\\mathcal{A}"} /> did not invoke
              the boundary, either:
            </p>
            <ol className="space-y-1 text-sm text-text-secondary list-[lower-alpha] list-inside">
              <li>
                <M c={"\\mathcal{A}"} /> forged the signature, contradicting
                EUF-CMA security; or
              </li>
              <li>
                <M c={"\\mathcal{A}"} /> reused a boundary-fresh value{" "}
                <M c={"N"} /> from a previous query with different content,
                contradicting binding integrity; or
              </li>
              <li>
                <M c={"\\mathcal{A}"} /> replayed an exact{" "}
                <M c={"(a, v)"} /> pair from a previous query, which fails the
                win condition.
              </li>
            </ol>
            <p className="text-sm text-text-secondary leading-relaxed mt-3">
              Therefore no PPT adversary wins with non-negligible probability.
            </p>
          </div>

          <p className="text-sm text-text-secondary leading-relaxed mb-6">
            This reduction relies on two distinct classes of assumption:
            cryptographic assumptions (EUF-CMA signature security, collision
            resistance of the freshness source) and architectural assumptions
            (boundary isolation, non-extractability of signing keys, atomicity
            of the commit operation). The cryptographic assumptions are standard
            and reducible to well-studied hardness problems. The architectural
            assumptions define the trusted computing base and must be enforced
            by the boundary implementation; they are not modeled
            cryptographically but are explicit preconditions of the threat model
            defined in Section 8.
          </p>
        </section>

        {/* 8.3 */}
        <section id="sec-falsifiers">
          <h3 className="text-lg font-semibold mt-8 mb-3">
            <span className="text-text-tertiary mr-2">8.3</span> Falsifiable
            Distinctions
          </h3>

          <p className="text-sm text-text-secondary leading-relaxed mb-6">
            The following tests distinguish OCC-compliant systems from systems
            that appear similar but fail to enforce origin control.
          </p>

          <h4 className="text-base font-semibold mt-6 mb-2">
            F1: Post-hoc Annotation.
          </h4>
          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            If there exists a function{" "}
            <M
              c={
                "f: \\Sigma_{\\text{unauth}} \\rightarrow \\Sigma_{\\text{auth}}"
              }
            />{" "}
            that promotes unauthenticated state to authenticated state while
            preserving content, the system is not OCC-compliant. This test fails
            for any system where content is created first and authentication is
            applied afterward — signing, blockchain registration, provenance
            database entry, or metadata attachment. These are{" "}
            <em>annotation systems</em>, not origin enforcement.
          </p>

          <h4 className="text-base font-semibold mt-6 mb-2">
            F2: Unconfined Constructor.
          </h4>
          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            If the genesis constructor can be invoked from contexts outside the
            protected boundary, the system violates constructor completeness.
            This test fails when signing keys are accessible to application
            code, when the commit interface is a public API without boundary
            isolation, or when trusted and untrusted code share execution
            context.
          </p>

          <h4 className="text-base font-semibold mt-6 mb-2">
            F3: Authorization Forgery.
          </h4>
          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            If an adversary without boundary access can produce events{" "}
            <M c={"e"} /> satisfying{" "}
            <M c={"\\mathrm{authorized}(e) = \\mathrm{true}"} />, the system
            violates unforgeability. This test fails when signing keys are
            extractable, when tokens can be synthesized without authority, or
            when capabilities can be delegated outside the boundary.
          </p>

          <h4 className="text-base font-semibold mt-6 mb-2">
            F4: Observable Atomicity Break.
          </h4>
          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            If the genesis transition can be decomposed into externally
            observable intermediate steps — authorization at time{" "}
            <M c={"t_1"} />, binding at <M c={"t_2 > t_1"} />, commit at{" "}
            <M c={"t_3 > t_2"} /> — the system violates Atomic Causality. This
            test fails for systems where authorization checking, signing, and
            storage commit are separate API calls, creating
            time-of-check-to-time-of-use vulnerabilities.
          </p>

          <h4 className="text-base font-semibold mt-6 mb-2">
            F5: Retroactive Authentication.
          </h4>
          <p className="text-sm text-text-secondary leading-relaxed mb-6">
            If durable state can be created first and then promoted to
            authenticated form by any post-hoc operation that preserves content,
            the system is implementing annotation, not origin control. This is
            the most direct test: if the content bytes can exist before the
            authorization event, the system does not enforce OCC.
          </p>
        </section>
      </section>

      {/* ================================================================ */}
      {/* 9. ARCHITECTURE */}
      {/* ================================================================ */}
      <section id="sec-architecture">
        <h2 className="text-xl font-semibold mt-12 mb-4">
          <span className="text-text-tertiary mr-2">9</span> Architecture
        </h2>

        {/* 9.1 */}
        <section id="sec-state-transition">
          <h3 className="text-lg font-semibold mt-8 mb-3">
            <span className="text-text-tertiary mr-2">9.1</span> State
            Transition Model
          </h3>

          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            Origin Controlled Computing distinguishes between candidate digital
            state and authenticated durable state. Candidate state may exist
            anywhere and may be adversarial. Authenticated durable state
            consists of externally visible or persistent artifacts whose
            authenticated form includes verification material produced by
            enforced finalization.
          </p>

          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            The transition from candidate to authenticated occurs at{" "}
            <em>commit paths</em>: file writes, storage uploads, message
            publication, model output export, sensor data release, and log entry
            creation.
          </p>

          <p className="text-sm text-text-secondary leading-relaxed mb-6">
            This transition is mediated by four architectural components: an
            atomic execution boundary, boundary-fresh cryptographic computation,
            a protected commit interface, and a boundary-held capability.
            Outside the boundary, systems may generate arbitrary data. The
            authenticated durable form is unreachable without successful
            finalization.
          </p>

          {/* Figure 3: State Transition Model */}
          <div className="my-6 rounded-lg border border-border-subtle bg-bg-elevated p-5">
            {/* Desktop layout */}
            <div className="hidden sm:flex items-center justify-center gap-0 flex-wrap">
              <div className="border border-border-subtle rounded px-5 py-3 text-sm text-center bg-bg-elevated">
                Candidate
                <br />
                Digital State
                <div className="text-xs text-text-tertiary mt-1">
                  (created freely)
                </div>
              </div>
              <div className="flex flex-col items-center px-2">
                <div className="text-xs text-text-tertiary mb-0.5">submit</div>
                <div className="text-text-tertiary text-lg">&rarr;</div>
              </div>
              <div className="border-2 border-border-subtle bg-bg-elevated rounded px-4 py-5 text-center">
                <div className="font-bold text-[11px] text-text-tertiary mb-2 tracking-wider uppercase">
                  Atomic Execution Boundary
                </div>
                <div className="border border-border-subtle rounded px-4 py-2.5 text-sm bg-bg-elevated">
                  Protected Commit
                  <br />
                  Interface
                </div>
              </div>
              <div className="flex flex-col items-center px-2">
                <div className="text-xs text-text-tertiary mb-0.5">
                  finalize
                </div>
                <div className="text-text-tertiary text-lg">&rarr;</div>
              </div>
              <div className="border border-border-subtle rounded px-5 py-3 text-sm text-center bg-bg-elevated">
                Authenticated
                <br />
                Durable State
                <div className="text-xs text-text-tertiary mt-1">
                  (includes verification material)
                </div>
              </div>
            </div>
            {/* Mobile layout */}
            <div className="flex sm:hidden flex-col items-center gap-2 text-sm">
              <div className="border border-border-subtle rounded px-5 py-3 bg-bg-elevated w-full text-center">
                Candidate Digital State
                <br />
                <span className="text-xs text-text-tertiary">
                  (created freely)
                </span>
              </div>
              <div className="text-xs text-text-tertiary">submit &darr;</div>
              <div className="border-2 border-border-subtle bg-bg-elevated rounded p-4 w-full text-center">
                <div className="font-bold text-[11px] text-text-tertiary mb-2 tracking-wider uppercase">
                  Atomic Execution Boundary
                </div>
                <div className="border border-border-subtle rounded px-2.5 py-2 text-sm bg-bg-elevated">
                  Protected Commit Interface
                </div>
              </div>
              <div className="text-xs text-text-tertiary">
                finalize &darr;
              </div>
              <div className="border border-border-subtle rounded px-5 py-3 bg-bg-elevated w-full text-center">
                Authenticated Durable State
                <br />
                <span className="text-xs text-text-tertiary">
                  (includes verification material)
                </span>
              </div>
            </div>
            <p className="text-xs text-text-tertiary italic text-center mt-3">
              &#x2717; no direct path from candidate state to authenticated
              state
            </p>
            <p className="text-xs text-text-tertiary text-center mt-3">
              <strong>Figure 3.</strong> State transition model. Authenticated
              durable state is reachable only through the protected commit
              interface inside the atomic execution boundary. No direct path
              from candidate state to authenticated state exists.
            </p>
          </div>
        </section>

        {/* 9.2 */}
        <section id="sec-finalization-protocol">
          <h3 className="text-lg font-semibold mt-8 mb-3">
            <span className="text-text-tertiary mr-2">9.2</span> Atomic
            Finalization Protocol
          </h3>

          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            Atomic finalization proceeds as a single ordered operation:
          </p>
          <ol className="space-y-2 text-sm text-text-secondary list-decimal list-inside mb-4">
            <li>Candidate state is prepared outside the boundary.</li>
            <li>
              The request enters the protected commit interface and crosses into
              the atomic execution boundary.
            </li>
            <li>
              Boundary-fresh cryptographic output <M c={"N"} /> is generated.
            </li>
            <li>
              A content-dependent value <M c={"H"} /> is computed (e.g., a
              cryptographic hash of the artifact).
            </li>
            <li>
              Binding material is produced over <M c={"(H, N)"} />.
            </li>
            <li>
              Authorization is performed using a boundary-held capability.
            </li>
            <li>
              Authenticated durable state and verification material are
              committed.
            </li>
          </ol>

          <p className="text-sm text-text-secondary leading-relaxed mb-6">
            If any step fails, no authenticated durable state is produced. The
            system is <em>fail-closed</em>: failures prevent authenticated
            creation rather than producing ambiguous or partially authenticated
            outputs.
          </p>
        </section>

        {/* 9.3 */}
        <section id="sec-verification-model">
          <h3 className="text-lg font-semibold mt-8 mb-3">
            <span className="text-text-tertiary mr-2">9.3</span> Verification
            Model
          </h3>

          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            Verification relies on cryptographic attestation produced by the
            atomic execution boundary over the binding between content and
            boundary-fresh output. Concretely, the boundary produces
            verification material covering: the content-dependent value{" "}
            <M c={"H"} />, the boundary-fresh output <M c={"N"} />, and
            optional policy or context metadata. This material is signed or
            attested using boundary-held cryptographic keys.
          </p>

          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            Verifiers accept artifacts only if the verification material
            validates under approved trust anchors, which may include pinned
            boundary public keys, manufacturer or platform roots certifying
            boundary identities, or signed domain policy manifests specifying
            acceptable boundary identities, epochs, and validity windows.
          </p>

          <p className="text-sm text-text-secondary leading-relaxed mb-6">
            No registry of artifacts is required. Verifiers need not identify
            the producing application — only that the artifact could not have
            been finalized outside an approved boundary under accepted policy.
          </p>
        </section>

        {/* 9.4 */}
        <section id="sec-enforcement-verification">
          <h3 className="text-lg font-semibold mt-8 mb-3">
            <span className="text-text-tertiary mr-2">9.4</span> Enforcement
            and Verification Are Separate Architectural Layers
          </h3>

          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            A distinction fundamental to OCC must be stated explicitly.
            Enforcement determines whether authenticated durable state{" "}
            <em>exists</em>. Verification determines whether a third party can{" "}
            <em>demonstrate</em> that authenticated durable state exists. These
            are different properties operating at different architectural
            layers.
          </p>

          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            Enforcement is irrevocable. Once candidate state has been finalized
            through the protected commit interface — once authorization,
            binding, and durable commit have occurred as a single atomic event
            inside the boundary — the resulting artifact is authenticated. This
            is a historical fact about the artifact{"'"}s genesis, not a claim
            that depends on the continued availability of any proof material.
          </p>

          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            Verification is operationally contingent. A verifier can confirm an
            artifact{"'"}s authenticated status only if verification material is
            accessible — either co-traveling with the artifact or retrievable
            from a reference point. If all copies of verification material are
            lost, the artifact becomes <em>unverifiable</em> but does not become{" "}
            <em>unauthenticated</em>. The genesis event still occurred. The
            enforcement invariants still held at the moment of creation. The
            artifact{"'"}s authenticated status is a property of its creation
            path, not a property of currently available evidence.
          </p>

          <p className="text-sm text-text-secondary leading-relaxed mb-6">
            This separation is what distinguishes OCC from verification systems,
            provenance frameworks, and attestation protocols. Those systems
            define authenticity in terms of what can currently be checked. OCC
            defines authenticity in terms of what was structurally enforced at
            creation. Verification is one mechanism for observing the
            consequences of enforcement, but it is not the enforcement itself.
          </p>
        </section>

        {/* 9.5 */}
        <section id="sec-verification-independence">
          <h3 className="text-lg font-semibold mt-8 mb-3">
            <span className="text-text-tertiary mr-2">9.5</span> Verification
            Independence from Proof Transport
          </h3>

          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            A critical architectural property of OCC is that the enforcement
            invariants described in Section 4 hold at genesis and are not
            contingent on any subsequent verification event, proof transport
            mechanism, or reference infrastructure availability. Verification is
            a mechanism for demonstrating that enforcement occurred. It is not a
            component of enforcement.
          </p>

          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            The verification model is therefore independent of how verification
            material reaches the verifier. OCC supports multiple verification
            models, and the choice among them is a deployment decision, not an
            architectural constraint. No verification model choice affects
            whether the enforcement invariants hold.
          </p>

          <h4 className="text-base font-semibold mt-6 mb-2">
            Portable proof.
          </h4>
          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            Verification material travels with the artifact — embedded in file
            metadata, carried in a sidecar file, or included in a manifest
            bundle. This is compatible with existing provenance formats such as
            C2PA and enables self-contained verification without external
            dependencies.
          </p>

          <h4 className="text-base font-semibold mt-6 mb-2">
            Reference-based verification.
          </h4>
          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            Verification material is held at one or more canonical reference
            points operated by the producing boundary, a trusted third party, or
            a federated network. When a verifier encounters an artifact without
            co-traveling proof, the verifier computes the artifact{"'"}s content
            hash and queries the reference point to obtain the verification
            material produced at genesis. The artifact carries nothing. Its
            content hash is its lookup key.
          </p>

          <h4 className="text-base font-semibold mt-6 mb-2">
            Hybrid verification.
          </h4>
          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            Artifacts carry verification material when the distribution channel
            preserves it. Reference points serve as authoritative fallback for
            stripped, reformatted, or re-distributed artifacts. Both modes
            validate against the same trust anchors and enforce the same
            invariants.
          </p>

          {/* Figure 4: Verification Independence */}
          <div className="my-6 rounded-lg border border-border-subtle bg-bg-elevated p-5">
            <div className="font-bold text-sm text-center mb-4 tracking-wide">
              Verification Independence from Proof Transport
            </div>
            {/* Desktop layout */}
            <div className="hidden sm:flex items-start justify-center gap-3 flex-wrap text-sm">
              <div className="text-center">
                <div className="border border-text-tertiary rounded px-3.5 py-2.5 bg-bg-elevated">
                  OCC Boundary
                  <br />
                  <span className="text-xs text-text-tertiary">(genesis)</span>
                </div>
                <div className="flex gap-6 mt-2">
                  <div className="flex flex-col items-center">
                    <div className="text-xs text-text-tertiary">
                      store proof
                    </div>
                    <div className="text-text-tertiary">&darr;</div>
                    <div className="border border-text-tertiary rounded px-3 py-2 text-xs bg-bg-elevated">
                      Reference Point
                      <br />
                      <span className="font-mono text-xs">
                        (H, N, &sigma;)
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-center">
                    <div className="text-xs text-text-tertiary">finalize</div>
                    <div className="text-text-tertiary">&darr;</div>
                    <div className="border border-border-subtle rounded px-3.5 py-2 text-xs">
                      Artifact
                      <br />
                      <span className="text-xs text-text-tertiary">
                        (content bytes)
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-center justify-center pt-4">
                <div className="text-xs text-text-tertiary">distribute</div>
                <div className="text-text-tertiary text-lg">&rarr;</div>
              </div>
              <div className="flex flex-col gap-2.5 pt-2.5">
                <div className="flex items-center gap-2">
                  <div className="border border-border-subtle rounded px-3 py-1.5 text-xs">
                    Copy (with proof)
                  </div>
                  <span className="text-text-tertiary">&rarr;</span>
                  <div className="border border-text-tertiary rounded px-3 py-1.5 text-xs bg-bg-elevated">
                    Verify
                    <br />
                    <span className="text-[11px]">(portable proof)</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="border border-border-subtle rounded px-3 py-1.5 text-xs">
                    Copy (stripped)
                  </div>
                  <span className="text-text-tertiary">&rarr;</span>
                  <div className="border border-text-tertiary rounded px-3 py-1.5 text-xs bg-bg-elevated">
                    Verify
                    <br />
                    <span className="text-[11px]">(reference lookup)</span>
                  </div>
                </div>
              </div>
            </div>
            {/* Mobile layout */}
            <div className="flex sm:hidden flex-col items-center gap-2 text-sm">
              <div className="border border-text-tertiary rounded px-3.5 py-2.5 bg-bg-elevated w-full text-center">
                OCC Boundary
                <br />
                <span className="text-xs text-text-tertiary">(genesis)</span>
              </div>
              <div className="flex gap-2 w-full">
                <div className="flex-1 flex flex-col items-center gap-1">
                  <div className="text-xs text-text-tertiary">store proof</div>
                  <div className="text-text-tertiary">&darr;</div>
                  <div className="border border-text-tertiary rounded p-2 text-xs text-center w-full bg-bg-elevated">
                    Reference Point
                    <br />
                    <span className="font-mono text-xs">
                      (H, N, &sigma;)
                    </span>
                  </div>
                </div>
                <div className="flex-1 flex flex-col items-center gap-1">
                  <div className="text-xs text-text-tertiary">finalize</div>
                  <div className="text-text-tertiary">&darr;</div>
                  <div className="border border-border-subtle rounded p-2 text-xs text-center w-full">
                    Artifact
                    <br />
                    <span className="text-xs text-text-tertiary">
                      (content bytes)
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-xs text-text-tertiary">&darr; distribute</div>
              <div className="flex flex-col gap-1.5 w-full">
                <div className="flex items-center gap-1.5 text-xs">
                  <div className="border border-border-subtle rounded px-2 py-1.5 flex-1 text-center">
                    Copy (with proof)
                  </div>
                  <span className="text-text-tertiary">&rarr;</span>
                  <div className="border border-text-tertiary rounded px-2 py-1.5 flex-1 text-center bg-bg-elevated">
                    Verify
                    <br />
                    <span className="text-[10px]">(portable)</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <div className="border border-border-subtle rounded px-2 py-1.5 flex-1 text-center">
                    Copy (stripped)
                  </div>
                  <span className="text-text-tertiary">&rarr;</span>
                  <div className="border border-text-tertiary rounded px-2 py-1.5 flex-1 text-center bg-bg-elevated">
                    Verify
                    <br />
                    <span className="text-[10px]">(ref lookup)</span>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-xs text-text-tertiary text-center mt-4">
              <strong>Figure 4.</strong> Verification independence from proof
              transport. Artifacts may carry verification material (top path) or
              be verified by reference lookup using the content hash (bottom
              path). Both paths validate against the same trust anchors.
              Authentication survives metadata stripping, format conversion, and
              redistribution.
            </p>
          </div>

          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            This property has significant practical consequences.
            OCC-authenticated artifacts can be freely copied, reformatted,
            compressed, transcoded, or distributed through channels that strip
            metadata — and their authenticated status is permanent regardless of
            what happens to metadata during distribution.{" "}
            <em>Verifiability</em> — the ability for a third party to confirm
            authenticated status — requires that either co-traveling proof or a
            reference point is available and that the content-preserving hash
            can be recomputed. But the artifact{"'"}s authenticated status, as
            defined by the enforcement invariants, is an irrevocable consequence
            of its genesis and does not depend on proof availability. This is a
            structural advantage over systems that embed provenance in
            format-specific metadata, which is routinely stripped by social
            media platforms, content delivery networks, messaging applications,
            and file conversion tools.
          </p>

          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            This property is particularly consequential in delay-tolerant and
            interplanetary networks, where verification material must travel
            with the data and no return channel to the origin may exist at
            verification time.
          </p>

          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            A clarification regarding content transforms is warranted.
            Verification depends on recomputing a content-dependent hash that
            matches the hash bound at genesis. Lossless operations that preserve
            byte-identical content — copying, re-hosting, metadata stripping,
            container rewrapping — leave this hash intact and verification
            proceeds directly. Lossy transforms — recompression, transcoding,
            cropping, resolution scaling — alter the content bytes and therefore
            invalidate the original binding. Under OCC, a lossy transform
            produces new candidate state. If the transformed output must itself
            be authenticated, it requires a new finalization event at a
            protected transform boundary, producing fresh verification material
            for the new content. This is not a limitation but a correct
            application of the enforcement model: the transformed artifact is a
            different artifact with a different origin. Systems requiring
            verification across lossy transforms may define robust or perceptual
            digest schemes as the content-dependent value <M c={"H"} />, but
            such schemes introduce their own security trade-offs and are a
            deployment choice, not an architectural requirement. The enforcement
            invariant is the same regardless of digest construction.
          </p>

          <p className="text-sm text-text-secondary leading-relaxed mb-6">
            A reference point is not an artifact registry. A registry implies
            centralized control over all authenticated artifacts and creates a
            single point of failure for the entire system. A reference point is
            a service that holds verification material produced by a specific
            boundary and can be replicated, federated, or operated by the
            producing boundary itself. Multiple reference points can hold
            verification material for the same artifact. The trust model does
            not change: verifiers validate against trust anchors, not against
            the reference point{"'"}s authority. Reference points play no role
            in the enforcement layer. They do not participate in genesis, do not
            confer authenticated status, and their unavailability does not
            retroactively affect the authenticated status of any artifact. They
            are verification infrastructure, not enforcement infrastructure.
          </p>

          {/* Figure 5: Verification Structure */}
          <div className="my-6 rounded-lg border border-border-subtle bg-bg-elevated p-5">
            {/* Desktop layout */}
            <div className="hidden sm:flex items-start justify-center gap-8 flex-wrap text-sm">
              <div className="min-w-[220px]">
                <div className="font-bold text-xs uppercase text-text-tertiary bg-bg-elevated border border-border-subtle px-3.5 py-2 text-center tracking-wider">
                  Authenticated Artifact
                </div>
                <div className="border border-border-subtle border-t-0 px-3.5 py-2 text-xs">
                  content bytes
                </div>
                <div className="font-bold text-xs uppercase text-text-tertiary bg-bg-elevated border border-border-subtle border-t-0 px-3.5 py-2 text-center tracking-wider">
                  Verification Material
                </div>
                <div className="border border-border-subtle border-t-0 px-3.5 py-1.5 text-xs font-mono bg-bg-elevated">
                  H = hash(content)
                </div>
                <div className="border border-border-subtle border-t-0 px-3.5 py-1.5 text-xs font-mono bg-bg-elevated">
                  N = boundary-fresh value
                </div>
                <div className="border border-border-subtle border-t-0 px-3.5 py-1.5 text-xs font-mono bg-bg-elevated">
                  boundary_id, epoch, policy
                </div>
                <div className="border border-border-subtle border-t-0 px-3.5 py-1.5 text-xs font-mono bg-bg-elevated">
                  &sigma; = Sign<sub>sk</sub>(H, N, metadata)
                </div>
              </div>
              <div className="flex flex-col items-center justify-center pt-16 text-text-tertiary">
                &rarr;
              </div>
              <div className="min-w-[220px] pt-1">
                <div className="font-bold text-xs text-center text-text-tertiary mb-2.5 tracking-wider">
                  Verifier
                </div>
                <div className="border border-border-subtle rounded px-3.5 py-2 text-xs mb-1.5">
                  1. Recompute hash of content
                </div>
                <div className="border border-border-subtle rounded px-3.5 py-2 text-xs mb-1.5">
                  2. Verify H matches recomputed hash
                </div>
                <div className="border border-border-subtle rounded px-3.5 py-2 text-xs mb-1.5">
                  3. Validate signature under trusted key
                </div>
                <div className="border border-border-subtle rounded px-3.5 py-2 text-xs mb-2.5">
                  4. Check policy constraints
                </div>
                <div className="text-center text-text-tertiary">&darr;</div>
                <div className="border border-text-tertiary rounded px-3.5 py-2 text-sm font-bold text-center mt-1 bg-bg-elevated">
                  Accept / Reject
                </div>
              </div>
            </div>
            {/* Mobile layout */}
            <div className="flex sm:hidden flex-col text-sm">
              <div className="font-bold text-xs uppercase text-text-tertiary bg-bg-elevated border border-border-subtle px-3.5 py-2 text-center tracking-wider">
                Authenticated Artifact
              </div>
              <div className="border border-border-subtle border-t-0 px-3.5 py-2 text-xs">
                content bytes
              </div>
              <div className="font-bold text-xs uppercase text-text-tertiary bg-bg-elevated border border-border-subtle border-t-0 px-3.5 py-2 text-center tracking-wider">
                Verification Material
              </div>
              <div className="border border-border-subtle border-t-0 px-3.5 py-1.5 text-xs font-mono bg-bg-elevated">
                H = hash(content)
              </div>
              <div className="border border-border-subtle border-t-0 px-3.5 py-1.5 text-xs font-mono bg-bg-elevated">
                N = boundary-fresh value
              </div>
              <div className="border border-border-subtle border-t-0 px-3.5 py-1.5 text-xs font-mono bg-bg-elevated">
                boundary_id, epoch, policy
              </div>
              <div className="border border-border-subtle border-t-0 px-3.5 py-1.5 text-xs font-mono bg-bg-elevated">
                &sigma; = Sign<sub>sk</sub>(H, N, metadata)
              </div>
              <div className="text-center text-text-tertiary my-3">
                &darr; verify
              </div>
              <div className="font-bold text-xs text-center text-text-tertiary mb-2.5 tracking-wider">
                Verifier
              </div>
              <div className="border border-border-subtle rounded px-3.5 py-2 text-xs mb-1.5">
                1. Recompute hash of content
              </div>
              <div className="border border-border-subtle rounded px-3.5 py-2 text-xs mb-1.5">
                2. Verify H matches recomputed hash
              </div>
              <div className="border border-border-subtle rounded px-3.5 py-2 text-xs mb-1.5">
                3. Validate signature under trusted key
              </div>
              <div className="border border-border-subtle rounded px-3.5 py-2 text-xs mb-2.5">
                4. Check policy constraints
              </div>
              <div className="border border-text-tertiary rounded px-3.5 py-2 text-sm font-bold text-center bg-bg-elevated">
                Accept / Reject
              </div>
            </div>
            <p className="text-xs text-text-tertiary text-center mt-4">
              <strong>Figure 5.</strong> Verification structure (portable proof
              model). In this depiction, an authenticated artifact carries its
              verification material. In the reference-based model (Figure 4),
              verification material is held separately and retrieved by content
              hash. The verification checks are identical in both cases.
            </p>
          </div>
        </section>

        {/* 9.6 */}
        <section id="sec-boundary-compromise">
          <h3 className="text-lg font-semibold mt-8 mb-3">
            <span className="text-text-tertiary mr-2">9.6</span> Boundary
            Compromise and Recovery
          </h3>

          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            If the atomic execution boundary or its signing keys are
            compromised, the system cannot distinguish forged authenticated
            artifacts from legitimate ones under that boundary identity. Trust
            collapses to the compromised boundary, not to the entire system.
            Recovery is handled operationally by revoking or rotating trust
            anchors, introducing new boundary identities, and enforcing epoch or
            policy constraints on acceptable verification material. No artifact
            registry or retroactive correction mechanism is required.
          </p>

          <p className="text-sm text-text-secondary leading-relaxed mb-6">
            The critical architectural property is that{" "}
            <em>enforcement strength scales with key isolation strength</em>.
            Software boundaries provide enforcement convenience and deployment
            accessibility but are inherently weaker against key extraction.
            Hardware-backed boundaries — secure enclaves, HSMs, trusted
            execution environments — provide structural guarantees by enforcing
            both key non-extractability and constrained usage semantics.
          </p>
        </section>

        {/* 9.7 */}
        <section id="sec-security-properties">
          <h3 className="text-lg font-semibold mt-8 mb-3">
            <span className="text-text-tertiary mr-2">9.7</span> Security
            Properties
          </h3>

          <div className="my-5 rounded-r-lg border-l-[3px] border-text-tertiary bg-bg-elevated p-5">
            <p className="text-sm text-text leading-relaxed">
              <strong>Property 9.1</strong> (Non-Retroactivity). Authenticated
              durable state cannot be produced after the fact for pre-existing
              data.
            </p>
          </div>

          <div className="my-5 rounded-r-lg border-l-[3px] border-text-tertiary bg-bg-elevated p-5">
            <p className="text-sm text-text leading-relaxed">
              <strong>Property 9.2</strong> (Creation-Path Exclusivity).
              Authenticated durable state is structurally reachable only through
              the protected commit interface and cannot be produced by any
              alternative code path or post-hoc process.
            </p>
          </div>

          <div className="my-5 rounded-r-lg border-l-[3px] border-text-tertiary bg-bg-elevated p-5">
            <p className="text-sm text-text leading-relaxed">
              <strong>Property 9.3</strong> (Content Integrity). Verification
              material binds authenticated state to specific content bytes.
            </p>
          </div>

          <div className="my-5 rounded-r-lg border-l-[3px] border-text-tertiary bg-bg-elevated p-5">
            <p className="text-sm text-text leading-relaxed">
              <strong>Property 9.4</strong> (Replay Resistance). Boundary-fresh
              cryptographic output prevents reuse of prior authorization events.
            </p>
          </div>
        </section>
      </section>
    </>
  );
}
