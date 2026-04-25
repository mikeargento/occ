import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Overview",
  description:
    "Origin Controlled Computing — what it is, how it works, and why it is different.",
};

export default function OverviewPage() {
  return (
    <div style={{ background: "#f5f5f5", minHeight: "100vh" }}>
      <article className="overview">
        <header className="mb-12">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-[-0.03em] text-[#111827] mb-3">
            Origin Controlled Computing
          </h1>
          <p className="text-lg text-[#1f2937]">
            What it is, how it works, and why it is different
          </p>
        </header>

        <p>
          Origin Controlled Computing, or OCC, is a cryptographic architecture for proving that a digital artifact passed through a specific, constrained origin process.
        </p>

        <p>
          It is not trying to prove that a photo is &ldquo;real,&rdquo; that text is &ldquo;true,&rdquo; or that an AI output is &ldquo;good.&rdquo; OCC proves something more structural:
        </p>

        <blockquote>
          This exact digital state was committed through this measured process, in this order, under these constraints.
        </blockquote>

        <p>
          Most digital provenance systems try to attach evidence to an object after the object already exists. OCC creates a causal slot first, then lets the artifact fill it. That makes provenance a construction property, not just a label.
        </p>

        <h2>The core idea</h2>

        <p>At the heart of OCC is a primitive:</p>

        <p className="lede">Nonce first. Hash second. Atomic binding third.</p>

        <p>
          A measured trusted execution environment, such as an AWS Nitro Enclave, creates an unpredictable nonce before it has witnessed the artifact hash. That nonce is not decoration. It becomes an unused origin slot.
        </p>

        <p>
          The artifact hash arrives. The TEE binds the hash to that pre-existing slot, signs the result, and advances its internal order. At that moment, the slot becomes consumed.
        </p>

        <p>
          OCC turns randomness into one-time causal space: a nonce becomes origin space when a TEE can prove it was unused before and consumed once.
        </p>

        <h2>The UNUSED to CONSUMED model</h2>

        <p>
          Before the file hash arrives, the TEE creates a fresh random nonce. Because the nonce is unpredictable and created inside the TEE under atomic control, the system treats it as an unused slot. The file hash arrives and is bound to that slot. After binding, the slot is consumed and cannot honestly be reused.
        </p>

        <p>The lifecycle:</p>

        <blockquote>
          UNUSED slot exists first. Artifact hash enters later. TEE binds the hash to the slot. Slot becomes CONSUMED. Proof travels with the artifact.
        </blockquote>

        <p>Most systems say: &ldquo;Here is a file hash. Now let&rsquo;s sign it.&rdquo;</p>

        <p>OCC says: &ldquo;Here is a pre-existing origin slot. Now this file hash has occupied it.&rdquo;</p>

        <h2>Why nonce-first matters</h2>

        <p>
          If a nonce, timestamp, or credential is added after the hash is already witnessed, then the nonce is just a label. It can prove someone signed something. It can prove a record existed by some time. But it did not constrain the artifact&rsquo;s origin. The artifact already existed before the nonce entered the picture.
        </p>

        <p>
          That leaves a forgery window. A malicious actor might prepare old hashes, replay prior material, backfill records, or attach fresh randomness to something that was not actually produced through the claimed origin process.
        </p>

        <p>
          OCC closes that window by requiring the nonce to exist first. The nonce is not evidence added afterward. It is the condition the artifact hash must satisfy.
        </p>

        <h2>What an OCC proof contains</h2>

        <p>
          An OCC proof is a portable proof object, typically JSON, that travels with the artifact. It can include:
        </p>

        <table>
          <thead>
            <tr>
              <th>Component</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Artifact hash</td><td>Identifies the exact file or digital state</td></tr>
            <tr><td>Nonce</td><td>The pre-existing causal slot</td></tr>
            <tr><td>Slot counter</td><td>Shows the slot was allocated before the commit</td></tr>
            <tr><td>Commit counter</td><td>Shows the artifact consumed the slot later</td></tr>
            <tr><td>Epoch ID</td><td>Groups an ordered run of commitments</td></tr>
            <tr><td>Previous hash link</td><td>Connects proofs into a chain</td></tr>
            <tr><td>Signer public key</td><td>Identifies the proof-signing authority</td></tr>
            <tr><td>Signature</td><td>Verifies the proof was issued by the enclave-controlled key</td></tr>
            <tr><td>TEE measurement</td><td>Shows what code and environment produced the proof</td></tr>
            <tr><td>Attestation</td><td>Shows the proof came from measured hardware</td></tr>
            <tr><td>Public anchor</td><td>Tethers OCC logical time to a public reference</td></tr>
          </tbody>
        </table>

        <p>
          The result is not &ldquo;a file was signed.&rdquo; The result is: this file hash was committed into this causal slot, by this measured environment, at this position in logical order, under this signing identity.
        </p>

        <h2>OCC creates cryptographic logical time</h2>

        <p>
          Every proof has order. Every slot and commit has a position. Every new proof extends the history. OCC does not depend on a wall clock to create ordering.
        </p>

        <p>The system can prove:</p>

        <ul>
          <li>This happened after that.</li>
          <li>This slot existed before this hash was bound.</li>
          <li>This proof came before the next proof.</li>
          <li>This epoch has an internal cryptographic history.</li>
        </ul>

        <p>OCC proves causal order first. Clock time is optional.</p>

        <h2>Ethereum anchors: backward seal, not source of truth</h2>

        <p>
          OCC&rsquo;s internal ordering does not require Ethereum. The chain creates internal order through slot allocation, consumption, counters, signatures, and chained proof history. Ethereum anchors add a different property on top: a public backward seal that any third party can independently verify.
        </p>

        <p>
          An Ethereum block hash that becomes available after the artifact has been committed could not have been known at the moment of commitment. This produces what can be called an entropy sandwich:
        </p>

        <ol>
          <li>Private TEE entropy before the artifact.</li>
          <li>Artifact commitment in the middle.</li>
          <li>Public blockchain entropy after it.</li>
        </ol>

        <p>
          The artifact was committed after the TEE-created nonce and before the later Ethereum block hash was known. That bounds the commitment in public, adversary-resistant entropy.
        </p>

        <p>
          Ethereum is not being asked to prove the artifact&rsquo;s origin. OCC does that. Ethereum provides a public backward seal that any third party can independently verify years later. A secondary benefit is tethering OCC logical time to public clock time.
        </p>

        <h2>Multi-TEE breach detection</h2>

        <p>
          OCC&rsquo;s architecture supports running three independent TEEs in parallel as a tripwire, not a consensus system.
        </p>

        <p>
          Three TEEs witness the same input. They produce different individual proofs because each has its own nonce, signature, and attestation, but they agree on the meaningful result: same artifact hash, same policy decision, valid measurements, valid signatures, expected ordering behavior.
        </p>

        <p>
          If one TEE diverges, the system does not need to know instantly which one is compromised. It only needs to know something is wrong. The batch is quarantined, suspicious records are preserved, the epoch is rotated, later artifacts can be re-proved if needed, and the affected range is marked as suspect.
        </p>

        <p>
          This is not &ldquo;trust this TEE forever.&rdquo; It is: compromise is assumed, silence is what gets eliminated.
        </p>

        <h2>The trust model</h2>

        <p>
          OCC does not depend on blind trust in any single component. Not the operator, the TEE, Ethereum, the clock, a certificate authority, or a live server.
        </p>

        <table>
          <thead>
            <tr>
              <th>Layer</th>
              <th>What it contributes</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>TEE</td><td>Measured execution and protected key use</td></tr>
            <tr><td>Nonce-first slot</td><td>Causal precondition</td></tr>
            <tr><td>Atomic binding</td><td>Prevents post-hoc attachment</td></tr>
            <tr><td>Counters</td><td>Internal logical order</td></tr>
            <tr><td>Proof chain</td><td>Historical continuity</td></tr>
            <tr><td>Ethereum anchor</td><td>Public backward seal</td></tr>
            <tr><td>Multi-TEE redundancy</td><td>Breach visibility</td></tr>
            <tr><td>Epoch rotation</td><td>Damage containment</td></tr>
            <tr><td>Portable verification</td><td>Independence from the original server</td></tr>
          </tbody>
        </table>

        <h2>What OCC applies to</h2>

        <p>
          OCC is broad because it is not tied to one file type or one industry. It applies to any digital state that can be hashed.
        </p>

        <p>
          <strong>Media provenance.</strong> Photos, videos, audio, edited images, camera outputs, generative media, documentary evidence. OCC does not prove that an image depicts reality. It proves the image&rsquo;s origin constraints. The question shifts from &ldquo;is this real?&rdquo; to &ldquo;what origin path does this artifact satisfy?&rdquo;
        </p>

        <p>
          <strong>Creator authenticity.</strong> Artists, photographers, journalists, and writers can create portable origin proofs that travel with the work, even if the file is copied, emailed, or mirrored elsewhere.
        </p>

        <p>
          <strong>AI output provenance.</strong> AI-generated outputs can be committed through OCC to prove which model, process, or policy path produced them. This matters for licensing, compliance, auditability, and accountability.
        </p>

        <p>
          <strong>Software supply chain.</strong> Build artifacts, releases, model weights, datasets, and deployment packages can be bound to origin proofs. This goes beyond &ldquo;signed by this key&rdquo; toward &ldquo;produced through this measured path at this position in the chain.&rdquo;
        </p>

        <p>
          <strong>Legal and business records.</strong> Contracts, invoices, filings, disclosures, and chain-of-custody materials can receive portable origin proofs, strengthening proof of possession, sequence, and construction path.
        </p>

        <p>
          <strong>Scientific and research data.</strong> Datasets, lab outputs, experimental records, and computational results can be proved as having existed in a specific state at a specific logical point.
        </p>

        <p>
          <strong>Intellectual property.</strong> OCC can prove possession of a digital object in its current form without revealing the object itself. The proof commits to a hash, so the file does not need to leave the user&rsquo;s device.
        </p>

        <h2>How OCC differs from C2PA</h2>

        <p>
          C2PA is a metadata and signature framework for content credentials. It can say: this asset contains signed claims about its provenance.
        </p>

        <p>
          OCC is a construction-constraint model. C2PA attaches claims to content. OCC creates a causal slot before the content hash is committed.
        </p>

        <table>
          <thead>
            <tr>
              <th>C2PA-style provenance</th>
              <th>OCC</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Claims and signatures attached to media</td><td>Causal slot created before hash binding</td></tr>
            <tr><td>Metadata travels with file</td><td>Proof can travel separately or with file</td></tr>
            <tr><td>Tool or vendor assertion based</td><td>Measured-environment commitment based</td></tr>
            <tr><td>Describes provenance</td><td>Proves ordered commitment path</td></tr>
            <tr><td>Can be stripped or separated</td><td>Proof independently verifies file hash</td></tr>
          </tbody>
        </table>

        <p>
          C2PA answers &ldquo;who claims what about this media?&rdquo; OCC answers &ldquo;what cryptographic origin process did this exact artifact satisfy?&rdquo; The two are complementary.
        </p>

        <h2>How OCC differs from timestamping</h2>

        <p>
          Traditional timestamping proves a hash existed before some time. OCC proves the construction path.
        </p>

        <p>
          A timestamp says: this hash existed by time T. OCC says: this hash consumed a pre-existing TEE-generated slot at this point in a cryptographic logical sequence. Timestamping is existence-before-time. OCC is causal commitment.
        </p>

        <h2>How OCC differs from blockchains</h2>

        <p>
          A blockchain is a public ordering machine for shared state. OCC is an origin commitment machine. OCC does not put the artifact on-chain; it uses off-chain proofs, portable verification, and optional public anchors.
        </p>

        <p>
          Ethereum can tether OCC through a backward seal, but it is not the root of OCC&rsquo;s meaning. Blockchain orders public transactions. OCC creates private origin coordinates.
        </p>

        <h2>How OCC differs from NFTs</h2>

        <p>
          NFTs prove ownership or registry state of a token. OCC proves origin. NFTs say &ldquo;this wallet owns this token.&rdquo; OCC says &ldquo;this artifact hash passed through this origin process.&rdquo; The two could combine. OCC could give the underlying media a portable origin proof before or during registration. They are not the same.
        </p>

        <h2>How OCC differs from signatures</h2>

        <p>
          A digital signature proves someone with a private key signed a message. That is foundational but not enough. A signature alone does not prove the signer followed a specific construction path.
        </p>

        <p>
          A signature says: this key signed this data. OCC adds: this key was controlled by a measured environment, which created an unused slot first, consumed it with this artifact hash, advanced ordered state, and produced a portable proof. OCC uses signatures. It is not &ldquo;just signatures.&rdquo; It is a signed causal event.
        </p>

        <h2>How OCC differs from transparency logs</h2>

        <p>
          Transparency logs make equivocation easier to detect through append-only public accountability. OCC does not require a public log as its core truth source. The proof itself is portable. A transparency log says &ldquo;this entry was included in this log.&rdquo; OCC says &ldquo;this artifact consumed this pre-existing origin slot inside this measured environment.&rdquo; Complementary but distinct.
        </p>

        <h2>Multiple copies of the same original</h2>

        <p>
          Physical originality depends on singularity. There is one canvas, one negative, one signed paper. Digital files broke that because perfect copies are indistinguishable.
        </p>

        <p>
          OCC introduces a new category: a digital artifact can be copied without losing its original provenance. The proof travels with the bytes or alongside the bytes. Instead of every copy being a degraded copy, OCC allows multiple copies of the same original.
        </p>

        <p>
          Originalness is no longer attached to a single physical container. It is attached to the artifact&rsquo;s causal proof. OCC separates originality from singularity.
        </p>

        <h2>Why this matters</h2>

        <p>
          Digital content has always had a scarcity problem. If something can be copied infinitely, its history and authority often collapse once it leaves the original platform.
        </p>

        <p>
          OCC creates portable, verifiable origin. Copies can carry provenance. Files can carry their own authority. Creators can prove possession. Institutions can issue portable proofs. AI systems can generate accountable receipts. Markets can value origin, not just content.
        </p>

        <p>
          Authenticity no longer has to live on a server. It can travel with the artifact.
        </p>

        <h2>The simplest explanation</h2>

        <p>
          OCC lets a digital artifact carry a portable proof that it entered a specific, measured, ordered origin process.
        </p>

        <p>
          A measured TEE creates a random unused slot before the artifact hash arrives. When the hash arrives, the TEE binds it to the slot, consumes the slot, signs the result, and links it into an ordered chain. The architecture supports running three TEEs in parallel so that silent compromise becomes visible. Ethereum periodically tethers the chain through a public backward seal.
        </p>

        <p>
          The result is a provenance system that does not merely say &ldquo;someone signed this.&rdquo; It says: this exact artifact occupied this origin coordinate.
        </p>

        <footer className="overview-footer">
          <em>Origin Controlled Computing, Patent Pending</em>
        </footer>
      </article>
    </div>
  );
}
