/* global window, document, Terminal, FitAddon, ResizeObserver */
(function () {
  // "Terminal Mono" is SF Mono, loaded from its file in styles.css: macOS doesn't expose it by family name.
  let fontFamily = '"Terminal Mono", Menlo, monospace';
  let fontSize = 13;
  const THEME = {
    background: '#171717',
    foreground: '#ffffff',
    cursor: '#ffffff',
    cursorAccent: '#171717',
    selectionBackground: '#4a4a4a',
    black: '#000000',
    red: '#c23621',
    green: '#25bc24',
    yellow: '#adad27',
    blue: '#492ee1',
    magenta: '#d338d3',
    cyan: '#33bbc8',
    white: '#cbcccd',
    brightBlack: '#818383',
    brightRed: '#fc391f',
    brightGreen: '#31e722',
    brightYellow: '#eaec23',
    brightBlue: '#5833ff',
    brightMagenta: '#f935f8',
    brightCyan: '#14f0f0',
    brightWhite: '#e9ebeb',
  };

  function createPane(kind, host, { label, onExit, onTitle } = {}) {
    const terminal = new Terminal({
      fontFamily,
      fontSize,
      cursorBlink: true,
      allowProposedApi: true,
      macOptionIsMeta: true,
      theme: THEME,
    });
    const fit = new FitAddon.FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host);

    let ptyId = null;
    let exited = false;

    function refit() {
      if (!host.offsetWidth || !host.offsetHeight) return;
      fit.fit();
      if (ptyId) window.office.resizeTerminal(ptyId, terminal.cols, terminal.rows);
    }

    async function start() {
      exited = false;
      refit();
      ptyId = await window.office.openTerminal(kind, terminal.cols, terminal.rows);
    }

    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type === 'keydown' && event.key === 'Escape' && event.metaKey) {
        terminal.blur();
        return false;
      }
      return true;
    });
    terminal.onData((data) => {
      if (exited) {
        terminal.reset();
        start();
        return;
      }
      if (ptyId) window.office.writeTerminal(ptyId, data);
    });
    if (onTitle) terminal.onTitleChange(onTitle);
    const unsubscribeData = window.office.onTerminalData(({ id, data }) => {
      if (id === ptyId) terminal.write(data);
    });
    const unsubscribeExit = window.office.onTerminalExit(({ id }) => {
      if (id !== ptyId) return;
      ptyId = null;
      exited = true;
      if (onExit) onExit();
      else terminal.write(`\r\n\x1b[90m${window.I18n.t('terminalExited', { label })}\x1b[0m\r\n`);
    });
    const observer = new ResizeObserver(refit);
    observer.observe(host);

    start();
    return {
      focus: () => terminal.focus(),
      hasFocus: () => document.activeElement === terminal.textarea,
      refit,
      dispose() {
        observer.disconnect();
        unsubscribeData();
        unsubscribeExit();
        if (ptyId) window.office.closeTerminal(ptyId);
        terminal.dispose();
      },
    };
  }

  function createShellTabs(container) {
    const bar = container.querySelector('.tabbar');
    const body = container.querySelector('.tabbody');
    const addButton = bar.querySelector('.tab-add');
    addButton.title = window.I18n.t('newTabHint');
    const tabs = [];
    let active = null;
    let counter = 0;

    function render() {
      for (const tab of tabs) {
        tab.button.classList.toggle('active', tab === active);
        tab.host.classList.toggle('hidden', tab !== active);
      }
    }

    function activate(tab, focus = true) {
      active = tab;
      render();
      requestAnimationFrame(() => {
        tab.pane.refit();
        if (focus) tab.pane.focus();
      });
    }

    function add(focus = true) {
      counter += 1;
      const host = document.createElement('div');
      host.className = 'term';
      body.appendChild(host);
      const button = document.createElement('div');
      button.className = 'tab';
      const title = document.createElement('span');
      title.className = 'tab-title';
      title.textContent = `Shell ${counter}`;
      const close = document.createElement('span');
      close.className = 'tab-close';
      close.textContent = '×';
      button.append(title, close);
      bar.insertBefore(button, addButton);
      const tab = { host, button };
      tab.pane = createPane('shell', host, {
        onExit: () => remove(tab),
        onTitle: (text) => {
          title.textContent = text || `Shell ${counter}`;
          button.title = text;
        },
      });
      button.addEventListener('mousedown', (event) => {
        event.preventDefault();
        if (event.target === close) remove(tab);
        else activate(tab);
      });
      tabs.push(tab);
      activate(tab, focus);
      return tab;
    }

    function remove(tab) {
      const index = tabs.indexOf(tab);
      if (index < 0) return;
      tabs.splice(index, 1);
      tab.pane.dispose();
      tab.host.remove();
      tab.button.remove();
      if (!tabs.length) {
        add(false);
        return;
      }
      if (active === tab) activate(tabs[Math.min(index, tabs.length - 1)]);
    }

    function cycle(step) {
      if (!active || tabs.length < 2) return;
      const index = (tabs.indexOf(active) + step + tabs.length) % tabs.length;
      activate(tabs[index]);
    }

    addButton.addEventListener('mousedown', (event) => {
      event.preventDefault();
      add();
    });
    add(false);

    return {
      add: () => add(),
      closeActive: () => active && remove(active),
      next: () => cycle(1),
      previous: () => cycle(-1),
      hasFocus: () => tabs.some((tab) => tab.pane.hasFocus()),
    };
  }

  let herdr = { focus() {}, hasFocus: () => false };
  let shell = { add() {}, closeActive() {}, next() {}, previous() {}, hasFocus: () => false };
  async function loadFont() {
    const font = await window.office.getTerminalFont().catch(() => null);
    if (font?.family && !/^SF Mono$/i.test(font.family)) fontFamily = `"${font.family}", Menlo, monospace`;
    if (font?.size > 0) fontSize = font.size;
    await document.fonts.load(`${fontSize}px ${fontFamily}`);
  }

  loadFont().catch(() => {}).finally(() => {
    herdr = createPane('herdr', document.getElementById('herdr-terminal'), { label: 'Herdr' });
    shell = createShellTabs(document.getElementById('shell-pane'));
  });

  window.office.onShellCommand((command) => {
    if (command === 'new') {
      window.Layout.reveal('shell');
      shell.add();
    }
    else if (command === 'close') shell.closeActive();
    else if (command === 'next') shell.next();
    else if (command === 'previous') shell.previous();
  });

  const REFOCUS_GRACE_MS = 1500;
  let lastRequest = { paneId: null, at: 0 };

  window.Terminals = {
    showAgent(agent) {
      if (!agent || !agent.paneId || agent.focused) return;
      const now = performance.now();
      if (lastRequest.paneId === agent.paneId && now - lastRequest.at < REFOCUS_GRACE_MS) return;
      lastRequest = { paneId: agent.paneId, at: now };
      window.office.focusAgent(agent.paneId);
    },
    focusHerdr: () => {
      window.Layout.reveal('herdr');
      herdr.focus();
    },
    hasFocus: () => herdr.hasFocus() || shell.hasFocus(),
  };
})();
