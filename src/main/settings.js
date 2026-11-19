const fs = require('fs');
const path = require('path');

const DEFAULTS = { announceDone: true, announceBlocked: true };

function loadSettings(file) {
  let stored = {};
  try {
    stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    // first start or unreadable file: fall back to the defaults
  }
  const settings = { ...DEFAULTS, ...stored };
  return {
    get: (key) => settings[key],
    set(key, value) {
      settings[key] = value;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(settings, null, 2));
    },
  };
}

module.exports = { loadSettings };
