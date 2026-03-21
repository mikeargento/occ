import { ToolRegistry } from './dist/tool-registry.js';
import { ProxyState } from './dist/state.js';
import { ProxyEventBus } from './dist/events.js';
import { Interceptor } from './dist/interceptor.js';
import { createLocalSigner } from './dist/local-signer.js';

const events = new ProxyEventBus();
const registry = new ToolRegistry();
registry.registerDemoTools();
const state = new ProxyState(events);
const agent = state.createAgent("test-agent");

const tools = registry.listTools();
const toolNames = tools.map(t => t.name);

// Enable all tools via policy update
state.updateAgentPolicy(agent.id, {
  version: "occ/policy/1",
  name: "test-agent",
  createdAt: Date.now(),
  globalConstraints: { allowedTools: toolNames },
  skills: {},
});

const signer = await createLocalSigner('/tmp/occ-test-signer.json');
const interceptor = new Interceptor(registry, state, events, { localSigner: signer });

let passed = 0;
let failed = 0;
const failures = [];

for (let i = 0; i < 100; i++) {
  const tool = toolNames[i % toolNames.length];
  try {
    const result = await interceptor.handleToolCall(agent.id, tool, { testId: i });
    
    if (result.isError) { failed++; failures.push(`#${i} ${tool}: isError - ${result.content?.[0]?.text}`); continue; }
    if (!result.receipt) { failed++; failures.push(`#${i} ${tool}: no receipt`); continue; }
    if (!result.receipt.proof) { failed++; failures.push(`#${i} ${tool}: no proof`); continue; }
    if (!result.receipt.envelope) { failed++; failures.push(`#${i} ${tool}: no envelope`); continue; }
    if (!result.auditId) { failed++; failures.push(`#${i} ${tool}: no auditId`); continue; }
    
    const stored = state.getReceipt(result.auditId);
    if (!stored) { failed++; failures.push(`#${i} ${tool}: not stored`); continue; }
    
    passed++;
  } catch (err) {
    failed++;
    failures.push(`#${i} ${tool}: ${err.message}`);
  }
}

console.log(`\nPassed: ${passed}/100`);
console.log(`Failed: ${failed}/100`);
if (failures.length > 0) {
  console.log(`\nFailures:`);
  failures.forEach(f => console.log(`  ${f}`));
}
console.log(`\nAudit entries: ${state.getContext(agent.id).snapshot().callCount}`);
console.log(`Signer: ${signer.publicKeyB64.slice(0, 20)}...`);
