export default function WhitepaperPage() {
  return (
    <div style={page}>
      <a href="/documentation" style={backLink}>&larr; Back</a>

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 500, textTransform: "uppercase" as const, letterSpacing: "0.15em", color: "#636366", marginBottom: 12 }}>
          Whitepaper
        </div>
        <h1 style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.03em", marginBottom: 12 }}>
          Origin Controlled Computing
        </h1>
        <p style={{ fontSize: 18, color: "#636366", marginBottom: 4 }}>
          Proof as a Reachability Property
        </p>
        <p style={{ fontSize: 12, color: "#636366", marginBottom: 32 }}>
          Michael James Argento &middot; Patent Pending
        </p>
      </div>

      {/* Abstract */}
      <div style={defBox}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "#636366", marginBottom: 12 }}>
          Abstract
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, fontSize: 14, color: "#636366", lineHeight: 1.7 }}>
          <p style={{ margin: 0 }}>
            Modern computing systems permit durable digital state to be created
            freely and attempt to establish trust only after that state already
            exists. This architecture introduces fundamental weaknesses in
            provenance, AI outputs, sensor data, logs, and media, because
            authenticity is optional and structurally bypassable. All existing
            approaches&mdash;signatures, metadata, watermarking, registries, and
            provenance standards&mdash;operate after content has been
            instantiated and therefore cannot constrain the creation path itself.
          </p>
          <p style={{ margin: 0 }}>
            This paper introduces a different enforcement model.{" "}
            <strong style={{ color: "#000" }}>Origin Controlled Computing</strong> relocates trust to the
            commit path. Authenticated durable state is reachable only through
            enforced finalization via a protected commit interface. An artifact
            is authenticated if and only if cryptographic binding and
            authorization occur inside an atomic execution boundary at the moment
            durable state is created.
          </p>
          <p style={{ margin: 0 }}>
            We first present the{" "}
            <strong style={{ color: "#000" }}>Trusted Origin Token Architecture</strong>, in which
            authenticated creation requires consumption of a pre-existing
            single-use authorization unit at finalization. We then generalize
            this into Origin Controlled Computing, in which equivalent origin
            control is achieved without pre-existing tokens by generating
            boundary-fresh cryptographic output inside the atomic execution
            boundary. The enforcement principle that links authorization,
            binding, and durable commit into a single indivisible event is
            called <strong style={{ color: "#000" }}>Atomic Causality</strong>.
          </p>
          <p style={{ margin: 0 }}>
            We provide a formal model based on labeled transition systems and
            closure algebras, define a security game capturing the adversarial
            model, and systematically distinguish this architecture from existing
            approaches including attested execution, post-hoc provenance, and
            content credential systems. We show that Origin Controlled Computing
            defines a new enforcement primitive: authentication as a{" "}
            <em>reachability property</em> of system structure, not a property
            attached to artifacts after creation.
          </p>
        </div>
      </div>

      {/* 1. Introduction */}
      <h2 style={h2}><span style={secNum}>1</span> Introduction</h2>
      <p style={body}>
        Digital systems increasingly mediate information relied upon for
        scientific, legal, medical, financial, and political decisions. At the
        same time, synthetic generation, automated manipulation, and
        adversarial pipelines have become routine. Despite this shift, most
        computing systems retain an architectural model in which creation is
        unrestricted and trust is applied only after the fact.
      </p>
      <p style={body}>
        Files are written, messages are emitted, and model outputs are exported
        without intrinsic authentication. Trust is later inferred through
        signatures, metadata, watermarking, or registry lookups. These
        mechanisms can indicate that an artifact has not been modified since
        some point in time, but they cannot prove that the artifact originated
        from an enforced creation process.
      </p>
      <p style={body}>
        This paper proposes that the architectural response to this problem is
        not better verification of existing artifacts, but{" "}
        <em>structural enforcement at the point where digital state becomes
        durable or externally visible</em>. Trust must be enforced at creation, not inferred afterward.
      </p>
      <p style={body}>
        Origin Controlled Computing is not a replacement for attestation,
        provenance, or access control. It is a{" "}
        <em>lower-layer enforcement primitive</em> that existing systems can
        adopt to close the structural gap between trusted code execution and
        controlled state creation.
      </p>
      <div style={callout}>
        <p style={{ margin: 0, fontSize: 14, color: "#000", lineHeight: 1.7 }}>
          <strong>Non-Goal.</strong> This architecture does not attempt to
          establish the semantic truth, correctness, or factual validity of
          content. It enforces only whether content has been admitted into
          authenticated durable state through protected finalization semantics.
        </p>
      </div>

      {/* 2. The Problem */}
      <h2 style={h2}><span style={secNum}>2</span> The Problem: Uncontrolled Digital State Creation</h2>
      <p style={body}>
        In contemporary computing systems, any process capable of reaching
        commit paths&mdash;writes to persistent storage, publications to
        output channels, exports of artifacts&mdash;can create durable digital
        state. Authentication mechanisms are typically external to these
        creation paths and are applied only if the producing system elects to
        use them.
      </p>
      <p style={body}>
        This architectural pattern creates several failure modes that no
        amount of improved verification can resolve:
      </p>
      <h3 style={h3}>No enforced origin point.</h3>
      <p style={body}>
        The first instance of an artifact has no cryptographically constrained
        birth event. Content enters the world without any structural evidence
        of how, where, or under what conditions it was created.
      </p>
      <h3 style={h3}>Post-hoc wrapping is indistinguishable from legitimate origin.</h3>
      <p style={body}>
        Synthetic or replayed data can be introduced and later wrapped in
        authenticity claims that are structurally indistinguishable from claims
        attached at genuine creation time.
      </p>
      <h3 style={h3}>Trusted pipelines are bypassable.</h3>
      <p style={body}>
        Even when secure creation paths exist, alternative unauthenticated
        paths typically remain available. Untrusted components can bypass
        trusted capture or generation pipelines while still producing durable
        outputs that appear valid to downstream systems.
      </p>
      <h3 style={h3}>Authenticity is optional.</h3>
      <p style={body}>
        Because creation is unrestricted, authenticity signals are voluntary.
        Systems degrade into environments where authenticated and
        unauthenticated artifacts coexist, and downstream consumers cannot
        reliably distinguish them by structural properties.
      </p>

      <h3 style={h3}><span style={secNum}>2.1</span> A Concrete Example: Why Attestation Is Not Enough</h3>
      <p style={body}>
        A secure camera device contains a Trusted Execution Environment. The
        camera pipeline feeds sensor data into the TEE. Inside the TEE,
        trusted code hashes the image, signs the hash with a
        hardware-protected key, and emits a signed manifest alongside the
        image file. A verifier can confirm that the image was processed by
        trusted code running on authentic hardware. This is a well-designed
        attestation system.
      </p>
      <p style={body}>
        Now consider the attack. The adversary does not compromise the TEE.
        Instead, the adversary feeds synthetic frames into the camera
        pipeline&rsquo;s input buffer&mdash;upstream of the TEE, at the
        sensor interface. The TEE faithfully processes the synthetic data: it
        hashes the synthetic image, signs the hash, and emits a valid signed
        manifest. From the verifier&rsquo;s perspective, the attestation is
        correct. But the image is synthetic.
      </p>
      <p style={body}>
        This is not a flaw in the TEE or in the attestation protocol. It is
        a structural gap in the system architecture. The commit
        path&mdash;the path by which authenticated state comes into
        existence&mdash;was not exclusively controlled.
      </p>

      <h3 style={h3}><span style={secNum}>2.2</span> A Second Example: Provenance Without Enforcement</h3>
      <p style={body}>
        A photographer captures an image with a C2PA-enabled camera. The camera attaches a
        signed content credential manifest. A social media platform then strips the
        C2PA manifest and redistributes it. Under C2PA, the image is now indistinguishable from an
        unsigned image. The provenance was real but impermanent&mdash;it
        depended on the manifest traveling with the artifact through every
        intermediary.
      </p>

      <h3 style={h3}><span style={secNum}>2.3</span> A Third Example: Ledger Registration Without Creation Constraint</h3>
      <p style={body}>
        A document notarization service backed by a blockchain records the hash with a consensus-verified timestamp.
        The adversary generates a synthetic document and submits its hash to
        the same notarization service. The notarization is genuine: the hash
        was indeed registered at the stated time. But the document is
        fabricated. The ledger provides strong history guarantees but imposes no constraint on how the artifact
        came into existence before registration.
      </p>

      {/* 3. Definitions */}
      <h2 style={h2}><span style={secNum}>3</span> Definitions and Terminology</h2>
      <Def title="Definition 3.1" subtitle="Atomic Execution Boundary">
        A protected execution domain that enforces isolation and ordering
        constraints for finalization, such that cryptographic computation,
        authorization, and durable commit occur as one indivisible operation
        or not at all.
      </Def>
      <Def title="Definition 3.2" subtitle="Protected Commit Interface">
        The sole interface permitted to finalize authenticated durable state.
        Untrusted code cannot produce authenticated durable state except by
        invoking this interface.
      </Def>
      <Def title="Definition 3.3" subtitle="Boundary-Held Capability">
        A capability available only inside the boundary and required to
        complete authenticated finalization. Possession of data outside the
        boundary is insufficient to reproduce or invoke it.
      </Def>
      <Def title="Definition 3.4" subtitle="Boundary-Fresh Cryptographic Computation">
        Cryptographic computation performed inside the boundary using one or more freshness sources,
        such that the resulting output was not available before the
        finalization event and cannot be feasibly reproduced outside the boundary.
      </Def>
      <Def title="Definition 3.5" subtitle="Candidate Digital State">
        Transient, internal, mutable representations of content prior to finalization.
        Candidate state may be created freely and may be adversarial.
      </Def>
      <Def title="Definition 3.6" subtitle="Authenticated Durable State">
        Externally visible or persistent digital state whose authenticated
        form includes verification material evidencing enforced finalization
        through a protected commit interface.
      </Def>
      <Def title="Definition 3.7" subtitle="Binding">
        A cryptographic construction that combines boundary-fresh output with a
        content-dependent value to produce verification material.
      </Def>
      <Def title="Definition 3.8" subtitle="Verification Material">
        Data bound to content and to boundary-fresh output that enables a verifier to
        distinguish authenticated durable state from unauthenticated state
        using pre-distributed trust anchors.
      </Def>
      <Def title="Definition 3.9" subtitle="Authorization">
        Successful use of a boundary-held capability via the protected commit interface to
        complete authenticated finalization.
      </Def>

      {/* 4. System Invariants */}
      <h2 style={h2}><span style={secNum}>4</span> System Invariants</h2>
      <p style={body}>
        If Origin Controlled Computing is correctly implemented, the following invariants hold:
      </p>
      <Def title="Invariant 4.1" subtitle="Authenticated Reachability">
        Authenticated durable state exists if and only if a successful finalization event occurred inside an approved atomic execution boundary.
      </Def>
      <Def title="Invariant 4.2" subtitle="Binding Evidence">
        Every authenticated artifact has associated verification material&mdash;produced at genesis&mdash;that binds its content to boundary-fresh cryptographic output and to a specific boundary identity.
      </Def>
      <Def title="Invariant 4.3" subtitle="Policy-Anchored Verification">
        An artifact verifies if and only if its verification material validates under accepted trust anchors and applicable policy constraints.
      </Def>
      <Def title="Invariant 4.4" subtitle="Distinguishability">
        Durable state not produced via boundary finalization cannot satisfy verification and is therefore distinguishable from authenticated durable state.
      </Def>
      <Def title="Invariant 4.5" subtitle="Authenticity as Reachability">
        Authenticated durable state is defined by enforced state transitions, not by post-hoc claims, metadata, or byte-level identity.
      </Def>
      <p style={body}>
        Under OCC, authenticity is a <em>reachability property</em>: a consequence of the state transitions that produced the artifact. An artifact does not become authenticated by having the right metadata. It is authenticated because it could only have come into existence through a path that enforced authorization, cryptographic binding, and durable commit as a single indivisible event.
      </p>

      {/* 5. TOTA */}
      <h2 style={h2}><span style={secNum}>5</span> Trusted Origin Token Architecture</h2>
      <p style={body}>
        The Trusted Origin Token Architecture addresses uncontrolled digital
        state creation by introducing a pre-creation authorization requirement.
        Authenticated creation requires consumption of a pre-existing
        single-use authorization unit&mdash;a <em>Trusted Origin Token</em>&mdash;at the moment of finalization.
      </p>
      <p style={body}>
        The key insight is best understood through analogy. Before digital
        cameras, a photograph could only exist if film existed first. The film
        did not merely record the image&mdash;it <em>enforced</em> whether the
        image could exist at all. No film, no photograph.
      </p>
      <Def title="Property 5.1" subtitle="Scarcity">Each authenticated artifact corresponds to exactly one token that existed prior to creation.</Def>
      <Def title="Property 5.2" subtitle="Non-Replay">Tokens cannot be reused. Each token authorizes exactly one finalization event.</Def>
      <Def title="Property 5.3" subtitle="Non-Retroactivity">Tokens cannot be applied after durable state already exists.</Def>
      <Def title="Property 5.4" subtitle="Commit-Path Enforcement">Token consumption and finalization occur within the same indivisible operation.</Def>

      <h3 style={h3}><span style={secNum}>5.2</span> Limits of Token-Based Enforcement</h3>
      <p style={body}>
        While the token model provides a clear and intuitive model of origin
        control, it introduces operational complexity. More importantly, <em>tokens are not the fundamental source of trust</em>.
        What matters is not the consumption of a specific pre-existing
        object, but that an irreversible, non-repeatable authorization event
        occurred at the moment of finalization.
      </p>

      {/* 6. OCC and Atomic Causality */}
      <h2 style={h2}><span style={secNum}>6</span> Origin Controlled Computing and Atomic Causality</h2>
      <p style={body}>
        Origin Controlled Computing generalizes the token principle. Instead of
        consuming a pre-generated token, the enforcement component generates a{" "}
        <em>boundary-fresh cryptographic value</em> N during the
        atomic finalization event. Cryptographic unpredictability and
        negligible collision probability prevent precomputation, reuse, or
        accidental duplication.
      </p>
      <p style={body}>
        This value serves the same functional role as a consumed authorization unit:
        it could not have existed prior to the finalization event, could not have been predicted or precomputed,
        cannot be recreated after the event, and its existence constitutes cryptographic evidence that a specific,
        irreversible finalization event occurred.
      </p>

      <h3 style={h3}><span style={secNum}>6.1</span> Atomic Causality</h3>
      <p style={body}>
        Under Atomic Causality, three operations are linked into a single
        indivisible event inside an atomic execution boundary:
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24, paddingLeft: 16 }}>
        <p style={body}><strong style={{ color: "#000" }}>1. Authorization</strong>: A boundary-held capability is exercised.</p>
        <p style={body}><strong style={{ color: "#000" }}>2. Cryptographic binding</strong>: Boundary-fresh output is bound to a content-dependent value.</p>
        <p style={body}><strong style={{ color: "#000" }}>3. Durable commit</strong>: The authenticated artifact is committed to persistent storage or an output channel.</p>
      </div>

      <h3 style={h3}><span style={secNum}>6.2</span> Why This Is Not Attested Execution</h3>
      <p style={body}>
        Attestation-based systems can demonstrate that particular trusted
        code executed and produced particular signed outputs. But attestation does not answer whether{" "}
        <em>an artifact not produced by trusted code could have entered this trust domain through any available commit path</em>.
        Origin Controlled Computing closes this gap. Valid verification material implies not
        merely that trusted code ran, but that <em>no alternative path to authenticated state exists</em>.
      </p>

      <h3 style={h3}><span style={secNum}>6.3</span> Token-Equivalence of Boundary-Fresh Generation</h3>
      <p style={body}>
        Token-equivalence arises from atomic, attested finalization that combines:
        boundary isolation, unpredictability, binding, boundary-held authorization capability, and attestation or signing.
        Together, these properties ensure that producing valid verification
        material implies that a specific authorization event occurred inside
        the boundary at finalization time.
      </p>

      {/* 7. Formal Model */}
      <h2 style={h2}><span style={secNum}>7</span> Formal Model</h2>
      <p style={body}>
        We formalize Origin Controlled Computing using a labeled transition
        system and closure algebra. This formalization captures the essential
        properties of the architecture and enables precise comparison with
        existing enforcement models.
      </p>
      <Def title="Definition 7.1" subtitle="OCC System">
        An OCC system is a labeled transition system (&Sigma;, &rarr;, E) where &Sigma; is the state space partitioned into &Sigma;<sub>auth</sub> &cup; &Sigma;<sub>unauth</sub>, and C &sube; &Sigma; &times; E<sub>auth</sub> &times; &Sigma;<sub>auth</sub> is the genesis constructor relation.
      </Def>
      <Def title="Invariant 7.2" subtitle="Constructibility">
        Every element of the authenticated state space was produced by a genesis constructor under an authorized event.
      </Def>
      <Def title="Invariant 7.3" subtitle="Constructor Completeness">
        All transitions into the authenticated state space are genesis constructors under authorized events. There is no transition into &Sigma;<sub>auth</sub> that bypasses C.
      </Def>
      <Def title="Invariant 7.4" subtitle="Atomic Causality">
        authorize(e), bind(e), commit(s&prime;) occur in a single atomic transition with no intermediate states observable outside the protected boundary.
      </Def>
      <Def title="Definition 7.5" subtitle="Injective Genesis">
        Each authorization event produces at most one authenticated artifact, and each authenticated artifact corresponds to exactly one authorization event.
      </Def>

      {/* 8. Adversarial Model */}
      <h2 style={h2}><span style={secNum}>8</span> Adversarial Model and Security Game</h2>
      <h3 style={h3}><span style={secNum}>8.1</span> Threat Model</h3>
      <p style={body}>
        The adversary possesses: full control of application code outside the boundary, control of storage and network transport, the ability to replay or synthesize candidate data, and access to all previously produced authenticated artifacts.
      </p>
      <p style={body}>
        The adversary does <em>not</em> possess: the ability to execute code inside the boundary, access to boundary-held capabilities, or the ability to predict boundary-fresh output.
      </p>

      <h3 style={h3}><span style={secNum}>8.2</span> Security Game: Origin Forgery</h3>
      <Def title="Definition 8.1" subtitle="Origin Forgery Game">
        The adversary queries the protected commit interface, observes results, and attempts to produce verification material that validates under trust anchors for an artifact not produced by any query. An OCC system is secure if no PPT adversary wins with non-negligible probability.
      </Def>
      <Def title="Proposition 8.3" subtitle="Security Reduction">
        If the signature scheme is EUF-CMA and the freshness source is collision-resistant, then the OCC system is secure.
      </Def>

      <h3 style={h3}><span style={secNum}>8.3</span> Falsifiable Distinctions</h3>
      <p style={body}><strong style={{ color: "#000" }}>F1: Post-hoc Annotation.</strong> If unauthenticated state can be promoted to authenticated state while preserving content, the system is not OCC-compliant.</p>
      <p style={body}><strong style={{ color: "#000" }}>F2: Unconfined Constructor.</strong> If the genesis constructor can be invoked from outside the protected boundary, the system violates constructor completeness.</p>
      <p style={body}><strong style={{ color: "#000" }}>F3: Authorization Forgery.</strong> If an adversary without boundary access can produce authorized events, the system violates unforgeability.</p>
      <p style={body}><strong style={{ color: "#000" }}>F4: Observable Atomicity Break.</strong> If genesis can be decomposed into externally observable intermediate steps, the system violates Atomic Causality.</p>
      <p style={body}><strong style={{ color: "#000" }}>F5: Retroactive Authentication.</strong> If durable state can be created first and then promoted to authenticated form, the system implements annotation, not origin control.</p>

      {/* 9. Architecture */}
      <h2 style={h2}><span style={secNum}>9</span> Architecture</h2>
      <h3 style={h3}><span style={secNum}>9.1</span> State Transition Model</h3>
      <p style={body}>
        OCC distinguishes between candidate digital state and authenticated durable state. The transition from candidate to authenticated occurs at commit paths. This transition is mediated by an atomic execution boundary, boundary-fresh cryptographic computation, a protected commit interface, and a boundary-held capability.
      </p>

      <h3 style={h3}><span style={secNum}>9.2</span> Atomic Finalization Protocol</h3>
      <p style={body}>Atomic finalization proceeds as a single ordered operation:</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 24, paddingLeft: 16, fontSize: 14, color: "#636366", lineHeight: 1.7 }}>
        <p style={{ margin: 0 }}>1. Candidate state is prepared outside the boundary.</p>
        <p style={{ margin: 0 }}>2. The request enters the protected commit interface.</p>
        <p style={{ margin: 0 }}>3. Boundary-fresh cryptographic output N is generated.</p>
        <p style={{ margin: 0 }}>4. A content-dependent value H is computed.</p>
        <p style={{ margin: 0 }}>5. Binding material is produced over (H, N).</p>
        <p style={{ margin: 0 }}>6. Authorization is performed using a boundary-held capability.</p>
        <p style={{ margin: 0 }}>7. Authenticated durable state and verification material are committed.</p>
      </div>
      <p style={body}>If any step fails, no authenticated durable state is produced. The system is <em>fail-closed</em>.</p>

      <h3 style={h3}><span style={secNum}>9.3</span> Verification Model</h3>
      <p style={body}>
        Verifiers accept artifacts only if the verification material validates under approved trust anchors. No registry of artifacts is required. Verifiers need not identify the producing application&mdash;only that the artifact could not have been finalized outside an approved boundary.
      </p>

      <h3 style={h3}><span style={secNum}>9.4</span> Enforcement and Verification Are Separate Layers</h3>
      <p style={body}>
        Enforcement determines whether authenticated durable state <em>exists</em>. Verification determines whether a third party can <em>demonstrate</em> that authenticated durable state exists. Enforcement is irrevocable. Verification is operationally contingent. If all copies of verification material are lost, the artifact becomes <em>unverifiable</em> but does not become <em>unauthenticated</em>.
      </p>

      <h3 style={h3}><span style={secNum}>9.5</span> Verification Independence from Proof Transport</h3>
      <p style={body}>
        OCC supports multiple verification models: portable proof (verification material travels with the artifact), reference-based verification (held at reference points, looked up by content hash), and hybrid verification. Authentication survives metadata stripping, format conversion, and redistribution.
      </p>

      <h3 style={h3}><span style={secNum}>9.6</span> Boundary Compromise and Recovery</h3>
      <p style={body}>
        If the boundary or its signing keys are compromised, trust collapses to the compromised boundary, not to the entire system. Recovery is handled by revoking or rotating trust anchors and introducing new boundary identities.
      </p>

      <Def title="Property 9.1" subtitle="Non-Retroactivity">Authenticated durable state cannot be produced after the fact for pre-existing data.</Def>
      <Def title="Property 9.2" subtitle="Creation-Path Exclusivity">Authenticated durable state is structurally reachable only through the protected commit interface.</Def>
      <Def title="Property 9.3" subtitle="Content Integrity">Verification material binds authenticated state to specific content bytes.</Def>
      <Def title="Property 9.4" subtitle="Replay Resistance">Boundary-fresh cryptographic output prevents reuse of prior authorization events.</Def>

      {/* 10. Related Work */}
      <h2 style={h2}>10. Related Work</h2>
      <h3 style={h3}>10.1 Trusted Execution and Remote Attestation</h3>
      <p style={body}>
        TEEs and remote attestation provide hardware-enforced isolation and proof that specific code executed. They answer: &ldquo;Did specific trusted code execute?&rdquo; OCC asks: &ldquo;Is authenticated durable state reachable only through enforced commit paths?&rdquo;
      </p>
      <h3 style={h3}>10.2 Content Provenance and Credential Systems</h3>
      <p style={body}>
        C2PA and related standards define how to represent claims about an artifact&apos;s origin. OCC targets a different layer. Provenance is a packaging and disclosure layer; OCC is an enforcement layer. They are complementary.
      </p>
      <h3 style={h3}>10.3 Reference Monitors and Access Control</h3>
      <p style={body}>
        The classical reference monitor mediates all operations on existing objects. OCC controls not merely which operations are permitted, but which objects are permitted to exist in authenticated form. This is <em>mandatory constructor security</em>.
      </p>
      <h3 style={h3}>10.4 Capability-Based Security</h3>
      <p style={body}>
        Capabilities control reachability of existing objects. OCC controls constructibility of new authenticated state.
      </p>
      <h3 style={h3}>10.5 Information Flow Control</h3>
      <p style={body}>
        IFC constrains how information propagates. OCC constrains how authenticated state is generated&mdash;analogous to noninterference applied to creation rather than observation.
      </p>
      <h3 style={h3}>10.6 Blockchain and Distributed Consensus</h3>
      <p style={body}>
        Both create structural bottlenecks. Blockchain achieves consensus through economic coordination among distributed parties. OCC achieves origin enforcement through boundary isolation at a single point, without distributed consensus.
      </p>

      {/* 11-19 */}
      <h2 style={h2}>11. Worked Examples</h2>
      <h3 style={h3}>11.1 Secure Media Capture</h3>
      <p style={body}>
        A device captures photos. When finalized, the protected commit interface generates a boundary-fresh value, hashes the media, produces signed verification material, and commits atomically. Any media not finalized through this boundary cannot produce valid verification material.
      </p>
      <h3 style={h3}>11.2 AI Output Export Pipeline</h3>
      <p style={body}>
        An AI inference service exports model outputs. The same atomic finalization applies. Any AI output not finalized through the boundary is rejected as unauthenticated. This is relevant for regulatory compliance frameworks such as the EU AI Act.
      </p>

      <h2 style={h2}>12. Instantiations of the Atomic Boundary</h2>
      <p style={body}>
        The atomic execution boundary is an architectural abstraction. Concrete instantiations include: device-level TEEs, kernel-mediated commit paths, HSM-backed services, operating system services, gateway enforcement, and secure pipeline stages.
      </p>
      <h3 style={h3}>12.1 Enforcement Tier Semantics</h3>
      <p style={body}>
        Three enforcement tiers capture practically relevant assurance levels:
      </p>
      <Def title="Software-only" subtitle="stub">
        Commit gate, signing key, nonce source, and counter are in process memory. No hardware isolation. Suitable for development and testing.
      </Def>
      <Def title="Hardware-bound key" subtitle="hw-key">
        Signing key is in a hardware security boundary (Secure Enclave, TPM, HSM) and is non-exportable. However, the commit gate runs outside the measured boundary. Provides hardware-bound identity but not causal enforcement.
      </Def>
      <Def title="Measured TEE" subtitle="measured-tee">
        Commit gate, key management, nonce generation, counter, and signing all execute inside the attested enclave. The host is untrusted. A verifier who pins acceptable measurements is guaranteed the enforcement invariants held at genesis.
      </Def>

      <h2 style={h2}>13. Admission of Pre-Existing Data</h2>
      <p style={body}>
        Candidate data may exist prior to authenticated finalization. Such prior existence carries no authenticity semantics. Authenticated durable state is created only when candidate data is finalized through the protected commit interface. The same content may be finalized multiple times, each producing distinct verification material.
      </p>

      <h2 style={h2}>14. Implementation Considerations</h2>
      <p style={body}>
        <strong style={{ color: "#000" }}>Latency.</strong> Modern signing operations (Ed25519, ECDSA P-256) complete in microseconds.{" "}
        <strong style={{ color: "#000" }}>Offline operation.</strong> Local proof generation with deferred admission.{" "}
        <strong style={{ color: "#000" }}>Failure handling.</strong> Fail-closed for high-assurance; staged for consumer.{" "}
        <strong style={{ color: "#000" }}>Key rotation.</strong> Operational rotation and revocation without artifact registry.{" "}
        <strong style={{ color: "#000" }}>Interoperability.</strong> Provenance chains can be attached to OCC-finalized artifacts.
      </p>

      <h2 style={h2}>15. Deployment and Adoption</h2>
      <p style={body}>
        OCC is best introduced incrementally. Phased rollout begins with visibility, then requires authenticated finalization for high-assurance workflows. The end state is reliable exclusion of unauthenticated state from systems where legitimacy, compliance, and downstream impact are determined.
      </p>

      <h2 style={h2}>16. Applications</h2>
      <p style={body}>
        OCC applies wherever systems must distinguish admissible outputs from arbitrary outputs: AI training and inference pipelines, media capture and evidentiary systems, compliance logging, scientific instruments, regulated data processing, digital identity, supply chain verification, authorization transfer without consensus, and interplanetary delay-tolerant systems.
      </p>

      <h2 style={h2}>17. Birth&ndash;Death Semantics</h2>
      <p style={body}>
        OCC enforces <em>birth&ndash;death semantics</em> for digital state. Every authoritative state transition has exactly one verifiable moment of creation (birth), and every transfer requires cryptographic evidence that the prior authority has been irreversibly consumed (death). This makes forks structurally unreachable within the enforcing boundary.
      </p>
      <Def title="Property" subtitle="Single-Successor">
        At most one valid successor can be produced from any given parent authority within the verifier-accepted measurement and monotonicity domain of the enforcing boundary.
      </Def>

      <h2 style={h2}>18. Single-Transfer Value Without Consensus</h2>
      <p style={body}>
        OCC enables single-transfer digital value by binding authority to a consumptive, cryptographically enforced state transition rather than a ledger entry. Each transfer atomically consumes the prior holder&apos;s authority and produces a new verifiable successor. The authoritative right cannot be duplicated because the single-successor property guarantees that only one unspent lineage can exist at a time.
      </p>

      <h2 style={h2}>19. Conclusion</h2>
      <p style={body}>
        The Trusted Origin Token Architecture demonstrates that origin control can be enforced by
        consuming authorization units at finalization. Origin Controlled Computing generalizes
        this by showing that equivalent enforcement is achieved using boundary-fresh
        cryptographic computation and protected commit paths, without requiring tracked tokens.
      </p>
      <p style={body}>
        The formal model shows that OCC defines a new enforcement primitive: a <em>genesis access control mechanism</em> that constrains which authenticated objects are permitted to exist, rather than mediating operations on objects that already exist. By securing creation rather than history, Origin Controlled Computing establishes an architectural primitive for trustworthy digital systems.
      </p>

      <Footer />
    </div>
  );
}

function Def({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div style={defBox}>
      <p style={{ margin: "0 0 8px", fontSize: 14, color: "#000", lineHeight: 1.7 }}>
        <strong>{title}</strong> ({subtitle}).
      </p>
      <p style={{ margin: 0, fontSize: 14, color: "#636366", lineHeight: 1.7 }}>{children}</p>
    </div>
  );
}

function Footer() {
  return (
    <div style={{ borderTop: "1px solid #e5e5ea", marginTop: 48, paddingTop: 24, display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ fontSize: 15, fontWeight: 600, color: "#000", margin: 0 }}>OCC (Origin Controlled Computing)</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <a href="/documentation/what-is-occ" style={{ fontSize: 14, color: "#007aff", textDecoration: "none" }}>What is OCC</a>
        <a href="/documentation/whitepaper" style={{ fontSize: 14, color: "#007aff", textDecoration: "none" }}>Whitepaper</a>
        <a href="/documentation/trust-model" style={{ fontSize: 14, color: "#007aff", textDecoration: "none" }}>Trust Model</a>
        <a href="/documentation/proof-format" style={{ fontSize: 14, color: "#007aff", textDecoration: "none" }}>Proof Format</a>
        <a href="/documentation/integration" style={{ fontSize: 14, color: "#007aff", textDecoration: "none" }}>Integration Guide</a>
        <a href="https://occ.wtf" style={{ fontSize: 14, color: "#007aff", textDecoration: "none" }}>occ.wtf</a>
        <a href="https://github.com/mikeargento/occ" style={{ fontSize: 14, color: "#007aff", textDecoration: "none" }}>GitHub</a>
      </div>
    </div>
  );
}

const page: React.CSSProperties = {
  minHeight: "100vh",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
  background: "#fff",
  color: "#000",
  padding: "48px 24px",
  maxWidth: 640,
  margin: "0 auto",
  lineHeight: 1.6,
};

const backLink: React.CSSProperties = { fontSize: 14, color: "#007aff", textDecoration: "none" };
const h2: React.CSSProperties = { fontSize: 20, fontWeight: 600, margin: "48px 0 16px" };
const h3: React.CSSProperties = { fontSize: 17, fontWeight: 600, margin: "32px 0 12px" };
const secNum: React.CSSProperties = { color: "#636366", marginRight: 8 };
const body: React.CSSProperties = { fontSize: 14, color: "#636366", lineHeight: 1.7, margin: "0 0 16px" };

const defBox: React.CSSProperties = {
  borderLeft: "3px solid #636366",
  background: "#f2f2f7",
  padding: 20,
  margin: "20px 0",
};

const callout: React.CSSProperties = {
  borderLeft: "3px solid #e5e5ea",
  background: "#f2f2f7",
  padding: 20,
  margin: "20px 0",
};
