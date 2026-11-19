const { execFile, execFileSync } = require('child_process');
const path = require('path');

const SPEAK_SCRIPT = path.join(__dirname, 'speak.jxa.js');

// All installed voices with name, language and quality; bestVoices() picks the good ones.
const LIST_VOICES = `
ObjC.import('AVFoundation');
const voices = $.AVSpeechSynthesisVoice.speechVoices;
const out = [];
for (let i = 0; i < voices.count; i++) {
  const voice = voices.objectAtIndex(i);
  out.push({ id: voice.identifier.js, name: voice.name.js, lang: voice.language.js, quality: Number(voice.quality) });
}
JSON.stringify(out);
`;

const languages = new Map(); // voice id -> 'de' | 'en'

function bestVoices() {
  let voices;
  try {
    voices = JSON.parse(execFileSync('/usr/bin/osascript', ['-l', 'JavaScript', '-e', LIST_VOICES], { encoding: 'utf8', timeout: 10000 }));
  } catch {
    return [];
  }
  // quality 2 = Enhanced, 3 = Premium; the names are localized ("Anna (Premium)", "Markus (erweitert)"),
  // so the quality decides. Siri's own "Voice 2" entries duplicate another voice and are skipped.
  const bestPerSpeaker = new Map();
  for (const voice of voices) {
    const lang = voice.lang.slice(0, 2);
    if (voice.quality < 2 || (lang !== 'de' && lang !== 'en') || voice.id.includes('.siri.natural.')) continue;
    const speaker = `${lang}:${voice.name.replace(/\s*\(.*\)$/, '')}`;
    const current = bestPerSpeaker.get(speaker);
    if (!current || voice.quality > current.quality) bestPerSpeaker.set(speaker, { ...voice, lang });
  }
  const best = [...bestPerSpeaker.values()].sort((a, b) => b.quality - a.quality);
  for (const voice of best) languages.set(voice.id, voice.lang);
  return best.map((voice) => voice.id);
}

const PHRASES = {
  de: { done: 'ist fertig.', blocked: 'braucht dich.', truth: 'Die Wahrheit ist irgendwo da draußen.' },
  en: { done: 'is done.', blocked: 'needs you.', truth: 'The truth is out there.' },
};

// German voices read English names the German way; these words are spoken from IPA instead.
// Tuned by ear with the German Premium voices; names not listed already sound right.
const PRONUNCIATION_DE = {
  Agent: 'ˈɛɪdʒn̩t',
  Scully: 'ˈskali',
  Doggett: 'ˈdɔɡɛt',
  Reyes: 'ˈʁaɪs',
  Krycek: 'ˈkʁaɪtʃɛk',
  Spender: 'ˈspɛndɐ',
  Fowley: 'ˈfaʊli',
  Kersh: 'ˈkœʁʃ',
  Pendrell: 'ˈpɛndʁɛl',
  Einstein: 'ˈaɪnstiːn',
  Follmer: 'ˈfɔlmɐ',
  Blevins: 'ˈblɛviːns',
  Colton: 'ˈkɔltn̩',
  Willis: 'ˈwɪlɪs',
  Purdue: 'ˈpœʁdjuː',
  Byers: 'ˈbaɪɐs',
  Frohike: 'ˈfʁoʊhaɪki',
  Langly: 'ˈlɛŋliː',
  Covarrubias: 'kovaˈʁuːbi̯as',
  Kurtzweil: 'ˈkœʁtsvaɪl',
  Kritschgau: 'ˈkʁɪtʃɡaʊ',
};

function createSpeaker(fallbackLang) {
  const queue = [];
  let speaking = false;

  function next() {
    const item = queue.shift();
    if (!item) {
      speaking = false;
      return;
    }
    speaking = true;
    const args = ['-l', 'JavaScript', SPEAK_SCRIPT, item.voice || '', item.lang, item.text, JSON.stringify(item.ipa)];
    execFile('/usr/bin/osascript', args, { timeout: 30000 }, next);
  }

  return {
    // kind: 'done' | 'blocked'; the sentence is in the voice's own language
    announce(voice, kind, name, task, { truth = false } = {}) {
      const lang = languages.get(voice) || fallbackLang;
      const phrases = PHRASES[lang];
      const text = `${name}, ${task}, ${phrases[kind]}${truth ? ` ${phrases.truth}` : ''}`;
      const ipa = {};
      if (lang === 'de') {
        for (const word of name.split(/\s+/)) if (PRONUNCIATION_DE[word]) ipa[word] = PRONUNCIATION_DE[word];
      }
      queue.push({ voice, lang, text, ipa });
      if (!speaking) next();
    },
  };
}

module.exports = { createSpeaker, bestVoices };
