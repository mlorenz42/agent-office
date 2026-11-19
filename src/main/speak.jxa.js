// osascript -l JavaScript speak.jxa.js <voice id or ""> <de|en> <text> <{"word": "ipa"}>
// Speaks the text with Apple's speech synthesizer; words in the map are spoken from their IPA notation.
ObjC.import('Foundation');
ObjC.import('AVFoundation');

function run(argv) {
  const [voiceId, lang, text, ipaJson] = argv;
  const ipa = JSON.parse(ipaJson || '{}');
  const attributed = $.NSMutableAttributedString.alloc.init;
  attributed.mutableString.setString(text);
  for (const word of Object.keys(ipa)) {
    const range = $(text).rangeOfString(word);
    if (range.length) attributed.addAttributeValueRange($.AVSpeechSynthesisIPANotationAttribute, $(ipa[word]), range);
  }
  const utterance = $.AVSpeechUtterance.speechUtteranceWithAttributedString(attributed);
  utterance.voice = voiceId
    ? $.AVSpeechSynthesisVoice.voiceWithIdentifier(voiceId)
    : $.AVSpeechSynthesisVoice.voiceWithLanguage(lang === 'de' ? 'de-DE' : 'en-US');
  const synthesizer = $.AVSpeechSynthesizer.alloc.init;
  synthesizer.speakUtterance(utterance);
  delay(0.3);
  while (synthesizer.isSpeaking) delay(0.1);
  return '';
}
