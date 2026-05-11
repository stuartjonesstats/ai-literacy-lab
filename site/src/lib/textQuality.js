const SPAM_PHRASES = [
  'asdf',
  'qwerty',
  'lorem ipsum',
  'blah',
  'gibberish',
  'test test',
  'i do not care',
  "i don't care",
  'idk',
  'n/a',
  'na',
  'none',
  'skip',
  'cheat',
  'just want to get',
  'get this over',
  'let me finish',
];

export function analyzeTextQuality(text, options = {}) {
  const {
    minChars = 80,
    minWords = 12,
    requiredAny = [],
    requiredGroups = [],
  } = options;
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const words = lower.match(/[\p{L}\p{N}][\p{L}\p{N}']*/gu) || [];
  const uniqueWords = new Set(words);
  const reasons = [];

  if (trimmed.length < minChars) {
    reasons.push(`Write at least ${minChars} characters.`);
  }

  if (words.length < minWords) {
    reasons.push(`Use at least ${minWords} words.`);
  }

  if (/^(.)\1{14,}$/i.test(trimmed.replace(/\s+/g, ''))) {
    reasons.push('Avoid repeated-character filler.');
  }

  if (words.length >= 8 && uniqueWords.size / words.length < 0.35) {
    reasons.push('Use varied words instead of repeating the same term.');
  }

  if (SPAM_PHRASES.some((phrase) => includesBoundedPhrase(lower, phrase))) {
    reasons.push('Replace placeholder or get-through-it language with a real response.');
  }

  if (words.length >= 8 && words.filter((word) => /[aeiou]/i.test(word)).length < words.length * 0.55) {
    reasons.push('The response looks like random text. Write in ordinary sentences.');
  }

  if (
    requiredAny.length > 0 &&
    !requiredAny.some((term) => includesRequiredTerm(lower, words, term))
  ) {
    reasons.push('Address the prompt directly with a relevant risk, data, evidence, review, or accountability point.');
  }

  requiredGroups.forEach((group) => {
    if (
      Array.isArray(group.terms) &&
      group.terms.length > 0 &&
      !group.terms.some((term) => includesRequiredTerm(lower, words, term))
    ) {
      reasons.push(
        group.message ||
          'Address each required part of the prompt with a concrete point.',
      );
    }
  });

  return {
    passed: reasons.length === 0,
    reasons,
  };
}

function includesRequiredTerm(text, words, term) {
  const normalized = term.toLowerCase().trim();
  if (!normalized) {
    return true;
  }

  if (/^[\p{L}\p{N}']+$/u.test(normalized)) {
    return words.includes(normalized);
  }

  return includesBoundedPhrase(text, normalized);
}

function includesBoundedPhrase(text, phrase) {
  const normalized = phrase.toLowerCase().trim();
  if (!normalized) {
    return false;
  }

  const escaped = escapeRegExp(normalized).replace(/\\ /g, '\\s+');
  return new RegExp(`(^|[^\\p{L}\\p{N}'])${escaped}($|[^\\p{L}\\p{N}'])`, 'iu').test(text);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function textQualitySummary(quality) {
  if (quality.passed) {
    return 'Response is long and relevant enough for this local prompt check.';
  }

  return quality.reasons.join(' ');
}
