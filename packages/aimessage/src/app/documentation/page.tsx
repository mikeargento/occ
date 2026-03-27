export default function Docs() {
  return (
    <div style={{
      minHeight: "100vh",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif",
      background: "#fff",
      color: "#000",
      padding: "48px 24px",
      maxWidth: 640,
      margin: "0 auto",
      lineHeight: 1.6,
    }}>
      <a href="/" style={{ fontSize: 14, color: "#007aff", textDecoration: "none" }}>← Back</a>

      <h1 style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-0.02em", margin: "32px 0 16px" }}>AiMessage</h1>
      <p style={{ fontSize: 18, color: "#636366", margin: "0 0 48px" }}>Your AI asks before it acts.</p>

      <Section title="What it does">
        <P>AiMessage sits between your AI and your computer. Before Claude Code can edit a file, run a command, or take any action — it texts you first. You reply YES or NO from your phone. That's it.</P>
      </Section>

      <Section title="Install">
        <Code>npm install -g aimessage</Code>
        <Code>aimessage setup</Code>
        <P>Setup asks for your phone number, installs a Claude Code hook, and sends you a test iMessage. Takes 30 seconds.</P>
      </Section>

      <Section title="How it works">
        <P>1. Claude Code tries to do something (edit a file, run a command)</P>
        <P>2. The hook intercepts it and sends you an iMessage</P>
        <P>3. You reply YES (always allow), ONCE, or NO</P>
        <P>4. The action proceeds or gets blocked</P>
        <P>5. A proof is recorded locally</P>
      </Section>

      <Section title="Commands">
        <Code>aimessage setup</Code>
        <P>Install the hook and set your phone number.</P>
        <Code>aimessage status</Code>
        <P>Check if the hook is active.</P>
        <Code>aimessage proofs</Code>
        <P>Show recent proofs — every allow and deny.</P>
        <Code>aimessage uninstall</Code>
        <P>Remove the hook. Your proofs stay in ~/.aimessage/</P>
      </Section>

      <Section title="Requirements">
        <P>macOS with iMessage signed in. Node.js 18+. Claude Code.</P>
      </Section>

      <Section title="How proofs work">
        <P>Every decision (allow or deny) creates a proof — a SHA-256 hash that chains to the previous one. The chain is append-only. You can't delete or reorder entries. It's a local, cryptographic record of every action your AI took and every decision you made.</P>
        <P>Proofs are stored in ~/.aimessage/proofs.json</P>
      </Section>

      <Section title="Privacy">
        <P>Everything runs locally on your Mac. No servers. No accounts. No data leaves your machine. Your phone number is stored in ~/.aimessage/config.json and is only used to send yourself iMessages.</P>
      </Section>

      <div style={{ borderTop: "1px solid #e5e5ea", marginTop: 48, paddingTop: 24, display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ fontSize: 15, fontWeight: 600, color: "#000" }}>Built on OCC (Origin Controlled Computing)</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <a href="https://occ.wtf/explorer" style={{ fontSize: 14, color: "#007aff", textDecoration: "none" }}>Proof Explorer →</a>
          <a href="https://occ.wtf/docs/what-is-occ" style={{ fontSize: 14, color: "#007aff", textDecoration: "none" }}>What is OCC →</a>
          <a href="https://occ.wtf/docs/whitepaper" style={{ fontSize: 14, color: "#007aff", textDecoration: "none" }}>Whitepaper →</a>
          <a href="https://occ.wtf/docs/trust-model" style={{ fontSize: 14, color: "#007aff", textDecoration: "none" }}>Trust Model →</a>
          <a href="https://occ.wtf/docs/proof-format" style={{ fontSize: 14, color: "#007aff", textDecoration: "none" }}>Proof Format →</a>
          <a href="https://occ.wtf/docs/integration" style={{ fontSize: 14, color: "#007aff", textDecoration: "none" }}>Integration Guide →</a>
          <a href="https://github.com/mikeargento/occ" style={{ fontSize: 14, color: "#007aff", textDecoration: "none" }}>GitHub →</a>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 12px" }}>{title}</h2>
      {children}
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 15, color: "#3c3c43", margin: "0 0 8px" }}>{children}</p>;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre style={{
      fontSize: 14,
      fontFamily: "'SF Mono', Menlo, monospace",
      background: "#f2f2f7",
      padding: "10px 14px",
      margin: "0 0 8px",
      overflow: "auto",
      color: "#000",
    }}>{children}</pre>
  );
}
