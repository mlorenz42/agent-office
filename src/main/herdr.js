const { execFile } = require('child_process');
const fs = require('fs');
const net = require('net');
const path = require('path');
const os = require('os');

// An app started from the Finder gets neither HERDR_BIN nor the shell's PATH, so check the usual places too.
function findHerdr() {
  if (process.env.HERDR_BIN) return process.env.HERDR_BIN;
  const candidates = [
    ...(process.env.PATH || '').split(':').filter(Boolean).map((dir) => path.join(dir, 'herdr')),
    path.join(os.homedir(), '.local', 'bin', 'herdr'),
    '/opt/homebrew/bin/herdr',
    '/usr/local/bin/herdr',
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || 'herdr';
}

const HERDR = findHerdr();

function herdr(...args) {
  return new Promise((resolve, reject) => {
    execFile(HERDR, args, { timeout: 5000, maxBuffer: 10 * 1024 * 1024 }, (error, stdout) => {
      if (error) {
        reject(new Error(`herdr ${args.join(' ')}: ${error.message}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout).result);
      } catch (parseError) {
        reject(new Error(`herdr ${args.join(' ')}: ${parseError.message}`));
      }
    });
  });
}

async function pollHerdr() {
  const [agentList, tabList, workspaceList] = await Promise.all([
    herdr('agent', 'list'),
    herdr('tab', 'list'),
    herdr('workspace', 'list'),
  ]);
  const tabs = new Map(tabList.tabs.map((tab) => [tab.tab_id, tab]));
  const spaces = new Map(workspaceList.workspaces.map((workspace) => [workspace.workspace_id, workspace]));
  return agentList.agents
    .map((herdrAgent) => toAgent(herdrAgent, tabs.get(herdrAgent.tab_id), spaces.get(herdrAgent.workspace_id)))
    .map(withFakeStatus);
}

const FAKE_STATUS = Object.fromEntries(
  (process.env.OFFICE_FAKE_STATUS || '').split(',').filter(Boolean).map((pair) => pair.split('=')),
);

function withFakeStatus(agent) {
  return FAKE_STATUS[agent.paneId] ? { ...agent, status: FAKE_STATUS[agent.paneId] } : agent;
}

function toAgent(herdrAgent, tab, space) {
  return {
    sessionId: herdrAgent.agent_session?.value || null,
    terminalId: herdrAgent.terminal_id,
    paneId: herdrAgent.pane_id,
    workspaceId: herdrAgent.workspace_id,
    kind: herdrAgent.agent,
    status: herdrAgent.agent_status || 'unknown',
    focused: Boolean(herdrAgent.focused),
    task: tab?.label || herdrAgent.terminal_title_stripped || herdrAgent.cwd,
    tabNumber: tab?.number ?? 0,
    space: space?.label || herdrAgent.workspace_id,
    spaceNumber: space?.number ?? 0,
    cwd: herdrAgent.cwd,
  };
}

const SOCKET = process.env.HERDR_SOCKET || path.join(os.homedir(), '.config', 'herdr', 'herdr.sock');
const STRUCTURE_EVENTS = [
  'workspace.created', 'workspace.renamed', 'workspace.moved', 'workspace.reordered', 'workspace.closed', 'workspace.focused',
  'tab.created', 'tab.closed', 'tab.renamed', 'tab.moved', 'tab.focused',
  'pane.created', 'pane.closed', 'pane.moved', 'pane.exited', 'pane.agent_detected', 'pane.focused',
];
const RECONNECT_MS = 3000;

function watchHerdr(onChange) {
  let socket = null;
  let panes = [];
  let reconnectTimer = null;

  function connect() {
    clearTimeout(reconnectTimer);
    socket?.destroy();
    const subscriptions = [
      ...STRUCTURE_EVENTS.map((type) => ({ type })),
      ...panes.map((paneId) => ({ type: 'pane.agent_status_changed', pane_id: paneId })),
    ];
    const current = net.createConnection(SOCKET);
    socket = current;
    let buffer = '';
    current.on('connect', () => {
      current.write(`${JSON.stringify({ id: 'the-bureau', method: 'events.subscribe', params: { subscriptions } })}\n`);
    });
    current.on('data', (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line && !line.includes('"subscription_started"')) onChange();
      }
    });
    current.on('error', () => {});
    current.on('close', () => {
      if (socket === current) reconnectTimer = setTimeout(connect, RECONNECT_MS);
    });
  }

  connect();
  return {
    watchPanes(paneIds) {
      const next = [...paneIds].sort();
      if (next.join() === panes.join()) return;
      panes = next;
      connect();
    },
  };
}

module.exports = { pollHerdr, watchHerdr, HERDR };
