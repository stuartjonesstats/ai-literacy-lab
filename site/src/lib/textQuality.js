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
  const suggestions = [];
  const effectiveMinChars = Math.max(40, Math.round(minChars * 0.8));
  const effectiveMinWords = Math.max(8, Math.round(minWords * 0.8));

  if (trimmed.length < effectiveMinChars) {
    reasons.push(`Write at least ${effectiveMinChars} characters.`);
  }

  if (words.length < effectiveMinWords) {
    reasons.push(`Use at least ${effectiveMinWords} words.`);
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
    suggestions.push('Consider making the workplace judgment, risk, evidence, review, or accountability point more explicit.');
  }

  requiredGroups.forEach((group) => {
    if (
      Array.isArray(group.terms) &&
      group.terms.length > 0 &&
      !group.terms.some((term) => includesRequiredTerm(lower, words, term))
    ) {
      suggestions.push(
        group.message ||
          'Address each required part of the prompt with a concrete point.',
      );
    }
  });

  return {
    passed: reasons.length === 0,
    reasons,
    suggestions,
  };
}

function includesRequiredTerm(text, words, term) {
  const normalized = term.toLowerCase().trim();
  if (!normalized) {
    return true;
  }

  if (/^[\p{L}\p{N}']+$/u.test(normalized)) {
    return words.some((word) => wordMatchesTerm(word, normalized));
  }

  return includesBoundedPhrase(text, normalized);
}

function wordMatchesTerm(word, term) {
  if (word === term) {
    return true;
  }

  if (word.length >= 5 && term.length >= 5) {
    return word.startsWith(term) || term.startsWith(word);
  }

  return false;
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
    if (quality.suggestions?.length) {
      return `Response is substantive enough. Optional refinement: ${quality.suggestions[0]}`;
    }

    return 'Response is substantive enough for this local prompt check.';
  }

  return quality.reasons.join(' ');
}
