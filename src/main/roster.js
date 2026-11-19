const fs = require('fs');
const path = require('path');
const { bestVoices } = require('./speaker');

// Mulder and Scully are always on the team; settings.json "names" replaces only the rest.
const FIXED_NAMES = ['Mulder', 'Scully'];
const DEFAULT_NAMES = [
  'Skinner', 'Doggett', 'Reyes', 'Krycek', 'Spender', 'Fowley', 'Kersh', 'Pendrell',
  'Einstein', 'Miller', 'Harrison', 'Follmer', 'Blevins', 'Colton', 'Willis', 'Purdue', 'Patterson',
  'Byers', 'Frohike', 'Langly', 'Covarrubias', 'Kurtzweil', 'Kritschgau',
  'Giulia', 'Matteo', 'Chiara', 'Luca', 'Francesca', 'Giovanni', 'Sofia', 'Alessandro', 'Elena', 'Davide',
  'Valentina', 'Riccardo', 'Martina', 'Federico', 'Alessia', 'Simone', 'Sara', 'Pietro', 'Beatrice', 'Paolo',
  'Giorgia', 'Roberto', 'Silvia', 'Massimo', 'Ilaria', 'Tommaso', 'Aurora', 'Emanuele', 'Benedetta', 'Nicola',
  'Ginevra', 'Vittorio', 'Arianna', 'Salvatore', 'Serena', 'Enzo', 'Lucia', 'Carlo', 'Bianca', 'Dario',
  'Noemi', 'Fabrizio', 'Ludovica', 'Raffaele', 'Rita', 'Ottavio', 'Carla', 'Umberto', 'Agnese', 'Guido',
];

function agentNames(names) {
  const valid = Array.isArray(names) ? names.filter((name) => typeof name === 'string' && name.trim()) : [];
  return [...new Set([...FIXED_NAMES, ...(valid.length ? valid : DEFAULT_NAMES)].map((name) => `Agent ${name.trim()}`))];
}

const SUBAGENT_QUIET_MS = 90 * 1000;
const SUBAGENT_MAX_MS = 2 * 60 * 60 * 1000;

function createRoster(storePath, names) {
  const NAMES = agentNames(names);
  const store = load(storePath);
  const voices = bestVoices();
  const live = new Map();
  const subagents = new Map();

  function save() {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
  }

  function nextFreeName() {
    const used = new Set(Object.values(store.identities).map((identity) => identity.name));
    const free = NAMES.find((candidate) => !used.has(candidate));
    if (free) return free;
    const [oldestId, oldest] = Object.entries(store.identities)
      .filter(([id, identity]) => !live.has(id) && NAMES.includes(identity.name))
      .sort(([, a], [, b]) => (a.lastSeen || 0) - (b.lastSeen || 0))[0] || [];
    if (!oldest) return `Agent ${used.size + 1}`;
    delete store.identities[oldestId];
    return oldest.name;
  }

  function leastUsedVoice() {
    if (!voices.length) return null;
    const uses = new Map(voices.map((voice) => [voice, 0]));
    for (const identity of Object.values(store.identities)) {
      if (uses.has(identity.voice)) uses.set(identity.voice, uses.get(identity.voice) + 1);
    }
    return voices.reduce((best, voice) => (uses.get(voice) < uses.get(best) ? voice : best));
  }

  function migrateIdentities() {
    const identities = Object.values(store.identities);
    const unnamed = identities.filter((identity) => !NAMES.includes(identity.name));
    const unvoiced = identities.filter((identity) => !voices.includes(identity.voice));
    if (!unnamed.length && !unvoiced.length) return;
    for (const identity of unnamed) identity.name = null;
    for (const identity of unnamed) identity.name = nextFreeName();
    for (const identity of unvoiced) identity.voice = null;
    for (const identity of unvoiced) identity.voice = leastUsedVoice();
    save();
  }

  function newIdentity() {
    const name = nextFreeName();
    const id = `id${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    store.identities[id] = {
      name,
      voice: leastUsedVoice(),
      seed: Math.floor(Math.random() * 1e9),
    };
    return id;
  }

  function identityFor(herdrAgent) {
    let id = store.byTerminal[herdrAgent.terminalId];
    if (!id && herdrAgent.sessionId) id = store.bySession[herdrAgent.sessionId];
    if (!id || !store.identities[id]) id = newIdentity();
    store.byTerminal[herdrAgent.terminalId] = id;
    if (herdrAgent.sessionId) store.bySession[herdrAgent.sessionId] = id;
    return id;
  }

  function update(herdrAgents) {
    const transitions = [];
    const seen = new Set();
    let changed = false;

    for (const herdrAgent of herdrAgents) {
      const id = identityFor(herdrAgent);
      if (seen.has(id)) continue;
      seen.add(id);
      const identity = store.identities[id];
      identity.lastSeen = Date.now();
      const previous = live.get(id);
      if (!previous) changed = true;

      const agent = {
        key: id,
        name: identity.name,
        voice: identity.voice,
        seed: identity.seed,
        paneId: herdrAgent.paneId,
        workspaceId: herdrAgent.workspaceId,
        sessionId: herdrAgent.sessionId,
        status: herdrAgent.status,
        focused: herdrAgent.focused,
        task: herdrAgent.task,
        space: herdrAgent.space,
        spaceNumber: herdrAgent.spaceNumber,
        tabNumber: herdrAgent.tabNumber,
        statusSince: previous && previous.status === herdrAgent.status ? previous.statusSince : Date.now(),
      };
      if (previous && previous.status !== agent.status) {
        transitions.push({ agent, from: previous.status, to: agent.status });
      }
      live.set(id, agent);
    }

    for (const id of [...live.keys()]) {
      if (!seen.has(id)) {
        live.delete(id);
        changed = true;
      }
    }
    expireSubagents();
    if (changed) save();
    return transitions;
  }

  function lastActivity(subagent) {
    try {
      return fs.statSync(subagent.transcriptPath).mtimeMs;
    } catch {
      return subagent.startedAt;
    }
  }

  function expireSubagents() {
    const now = Date.now();
    for (const [agentId, subagent] of subagents) {
      const parent = live.get(subagent.parentKey);
      const quiet = now - Math.max(lastActivity(subagent), subagent.startedAt) > SUBAGENT_QUIET_MS;
      const abandoned = !parent || (parent.status !== 'working' && quiet);
      if (abandoned || now - subagent.startedAt > SUBAGENT_MAX_MS) subagents.delete(agentId);
    }
  }

  function addSubagent(sessionId, agentId, agentType, parentTranscriptPath) {
    const parent = [...live.values()].find((agent) => agent.sessionId === sessionId);
    if (!parent || subagents.has(agentId)) return null;
    const taken = new Set([...subagents.values()].map((subagent) => subagent.name));
    const name = NAMES.slice().reverse().find((candidate) => !taken.has(candidate)) || `Agent ${taken.size + 1}`;
    const subagent = {
      key: `sub:${agentId}`,
      agentId,
      parentKey: parent.key,
      name,
      task: agentType || 'Subagent',
      seed: hash(agentId),
      startedAt: Date.now(),
      transcriptPath: parentTranscriptPath
        ? path.join(path.dirname(parentTranscriptPath), sessionId, 'subagents', `agent-${agentId}.jsonl`)
        : null,
    };
    subagents.set(agentId, subagent);
    return subagent;
  }

  function removeSubagent(agentId) {
    return subagents.delete(agentId);
  }

  function snapshot() {
    return {
      agents: [...live.values()],
      subagents: [...subagents.values()].map(({ transcriptPath, ...subagent }) => subagent),
    };
  }

  function paneIds() {
    return [...live.values()].map((agent) => agent.paneId);
  }

  migrateIdentities();
  return { update, addSubagent, removeSubagent, snapshot, paneIds };
}

function load(storePath) {
  try {
    const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    return { identities: {}, byTerminal: {}, bySession: {}, ...store };
  } catch {
    return { identities: {}, byTerminal: {}, bySession: {} };
  }
}

function hash(text) {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

module.exports = { createRoster };
