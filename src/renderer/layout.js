/* global window, document, localStorage */
(function () {
  const STORAGE_KEY = 'agent-office.layout';
  const DEFAULTS = { left: 50, top: 42, herdr: true, shell: true, office: true };
  const MIN_PERCENT = 15;
  const SPLITTER = '4px';

  const app = document.getElementById('app');
  const right = document.getElementById('right');
  const panes = {
    herdr: document.getElementById('herdr-pane'),
    shell: document.getElementById('shell-pane'),
    office: document.getElementById('stage'),
  };
  const vertical = document.getElementById('split-vertical');
  const horizontal = document.getElementById('split-horizontal');

  let layout = load();

  function load() {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
    } catch {
      return { ...DEFAULTS };
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
      // without storage the layout simply resets on the next start
    }
  }

  function apply() {
    const showRight = layout.shell || layout.office;
    const bothRight = layout.shell && layout.office;
    const splitLeft = layout.herdr && showRight;
    panes.herdr.classList.toggle('hidden', !layout.herdr);
    panes.shell.classList.toggle('hidden', !layout.shell);
    panes.office.classList.toggle('hidden', !layout.office);
    right.classList.toggle('hidden', !showRight);
    vertical.classList.toggle('hidden', !splitLeft);
    horizontal.classList.toggle('hidden', !bothRight);
    app.style.gridTemplateColumns = splitLeft ? `${layout.left}% ${SPLITTER} 1fr` : '1fr';
    right.style.gridTemplateRows = bothRight ? `${layout.top}% ${SPLITTER} 1fr` : '1fr';
    window.office.reportLayout({ herdr: layout.herdr, shell: layout.shell, office: layout.office });
  }

  function update(changes) {
    layout = { ...layout, ...changes };
    save();
    apply();
  }

  function toggle(name) {
    const next = { ...layout, [name]: !layout[name] };
    if (!next.herdr && !next.shell && !next.office) {
      apply(); // keep the last pane; re-sync the menu checkbox
      return;
    }
    update({ [name]: next[name] });
  }

  function dragSplitter(splitter, container, key, axis) {
    splitter.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      splitter.setPointerCapture(event.pointerId);
      splitter.classList.add('dragging');
      const move = (moveEvent) => {
        const rect = container.getBoundingClientRect();
        const percent = axis === 'x'
          ? ((moveEvent.clientX - rect.left) / rect.width) * 100
          : ((moveEvent.clientY - rect.top) / rect.height) * 100;
        layout[key] = Math.round(Math.min(100 - MIN_PERCENT, Math.max(MIN_PERCENT, percent)) * 10) / 10;
        apply();
      };
      const stop = () => {
        splitter.classList.remove('dragging');
        splitter.removeEventListener('pointermove', move);
        splitter.removeEventListener('pointerup', stop);
        splitter.removeEventListener('pointercancel', stop);
        save();
      };
      splitter.addEventListener('pointermove', move);
      splitter.addEventListener('pointerup', stop);
      splitter.addEventListener('pointercancel', stop);
    });
    splitter.addEventListener('dblclick', () => update({ [key]: DEFAULTS[key] }));
  }

  dragSplitter(vertical, app, 'left', 'x');
  dragSplitter(horizontal, right, 'top', 'y');

  window.office.onLayoutCommand((command) => {
    if (command === 'reset') update({ ...DEFAULTS });
    else if (command.startsWith('toggle-')) toggle(command.slice('toggle-'.length));
  });

  apply();

  window.Layout = {
    reveal(name) {
      if (!layout[name]) update({ [name]: true });
    },
  };
})();
