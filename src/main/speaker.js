const { execFile, execFileSync } = require('child_process');

const QUALITY_RANK = { Premium: 2, Enhanced: 1 };

function bestVoices() {
  let lines;
  try {
    lines = execFileSync('/usr/bin/say', ['-v', '?'], { encoding: 'utf8' }).split('\n');
  } catch {
    return [];
  }
  const bestPerSpeaker = new Map();
  for (const line of lines) {
    const match = line.match(/^(\S+) \((Premium|Enhanced)\)\s+(en|de)_\w+\s+#/);
    if (!match) continue;
    const [, speaker, quality] = match;
    const current = bestPerSpeaker.get(speaker);
    if (!current || QUALITY_RANK[quality] > QUALITY_RANK[current.quality]) {
      bestPerSpeaker.set(speaker, { voice: `${speaker} (${quality})`, quality });
    }
  }
  return [...bestPerSpeaker.values()]
    .sort((a, b) => QUALITY_RANK[b.quality] - QUALITY_RANK[a.quality])
    .map((entry) => entry.voice);
}

function createSpeaker() {
  const queue = [];
  let speaking = false;

  function next() {
    const item = queue.shift();
    if (!item) {
      speaking = false;
      return;
    }
    speaking = true;
    const args = item.voice ? ['-v', item.voice, item.text] : [item.text];
    execFile('/usr/bin/say', args, { timeout: 30000 }, next);
  }

  return {
    say(voice, text) {
      queue.push({ voice, text });
      if (!speaking) next();
    },
  };
}

module.exports = { createSpeaker, bestVoices };
