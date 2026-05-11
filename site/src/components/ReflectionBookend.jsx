import { CheckCircle2, MoveRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  clearDraft,
  emptyProgress,
  emptyReflections,
  readDraft,
  readProgress,
  readReflections,
  saveDraft,
  saveReflection,
} from '../lib/progress.js';
import { analyzeTextQuality, textQualitySummary } from '../lib/textQuality.js';

const prompts = {
  pre: {
    eyebrow: 'Pre-Reflection',
    title: 'Before you start',
    intro:
      'Start with a short note. This will appear beside your post-reflection so you can see how your thinking changed.',
    label:
      'Right now, what does responsible AI use at work mean to you, and what would make you hesitate before using AI?',
    placeholder:
      'Responsible AI use at work means... I would hesitate when...',
    minChars: 90,
    minWords: 16,
    requiredAny: ['responsible', 'work', 'hesitate', 'risk', 'review', 'data'],
    requiredGroups: [
      {
        terms: ['responsible', 'work', 'use'],
        message: 'Say what responsible AI use means at work.',
      },
      {
        terms: ['hesitate', 'risk', 'review', 'data', 'uncertain'],
        message: 'Name something that would make you pause or seek review.',
      },
    ],
    button: 'Save pre-reflection and open Module 1 lab',
    saved: 'Pre-reflection saved. Module 1 lab is open.',
  },
  post: {
    eyebrow: 'Post-Reflection',
    title: 'Before your learning record',
    intro:
      'This response will be added to your final learning record with your pre-reflection. Use it to show how your judgment changed.',
    label:
      'After the lab, what changed in how you decide whether, when, and how to use AI at work?',
    placeholder:
      'After the lab, I would now pay closer attention to...',
    minChars: 220,
    minWords: 36,
    requiredAny: ['changed', 'evidence', 'data', 'review', 'escalate', 'accountability'],
    requiredGroups: [
      {
        terms: ['changed', 'now', 'before', 'used to', 'pay closer attention'],
        message: 'Describe how your judgment changed.',
      },
      {
        terms: ['evidence', 'data', 'review', 'escalate', 'accountability'],
        message: 'Name at least one concrete habit from the lab.',
      },
    ],
    button: 'Save post-reflection and continue to completion',
    saved: 'Post-reflection saved. Your learning record can now include both reflections.',
  },
};

export default function ReflectionBookend({ kind }) {
  const config = prompts[kind];
  const [text, setText] = useState('');
  const [reflections, setReflections] = useState(emptyReflections());
  const [progress, setProgress] = useState(emptyProgress());
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState(null);

  useEffect(() => {
    setReflections(readReflections());
    setProgress(readProgress());

    function handleReflection(event) {
      setReflections(event.detail || readReflections());
    }

    function handleProgress(event) {
      setProgress(event.detail || readProgress());
    }

    function handleStorage() {
      setReflections(readReflections());
      setProgress(readProgress());
    }

    window.addEventListener('ailitlab:reflection', handleReflection);
    window.addEventListener('ailitlab:progress', handleProgress);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('ailitlab:reflection', handleReflection);
      window.removeEventListener('ailitlab:progress', handleProgress);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  useEffect(() => {
    const draft = readDraft(`reflection-${kind}`);
    if (draft?.text && !reflections[kind]?.text) {
      setText(draft.text);
      setDraftSavedAt(draft.updatedAt || draft.savedAt || null);
    }
    setDraftLoaded(true);
  }, [kind, reflections]);

  useEffect(() => {
    if (!draftLoaded || reflections[kind]?.text) {
      return;
    }

    if (!text.trim()) {
      return;
    }

    const draft = saveDraft(`reflection-${kind}`, { text });
    setDraftSavedAt(draft.updatedAt || draft.savedAt || null);
  }, [draftLoaded, kind, reflections, text]);

  const saved = reflections[kind];
  const quality = useMemo(
    () =>
      analyzeTextQuality(text, {
        minChars: config.minChars,
        minWords: config.minWords,
        requiredAny: config.requiredAny,
        requiredGroups: config.requiredGroups || [],
      }),
    [config, text],
  );
  const capstoneComplete = progress.completed.includes('08-capstone');
  const locked = kind === 'post' && !capstoneComplete;

  function save() {
    if (!quality.passed || locked) {
      return;
    }
    setReflections(saveReflection(kind, text));
    clearDraft(`reflection-${kind}`);
    setText('');
  }

  if (!config) {
    return null;
  }

  return (
    <section
      id={`reflection-${kind}`}
      className={[
        'reflection-bookend',
        saved ? 'is-saved' : '',
        locked ? 'is-locked' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-labelledby={`reflection-${kind}-title`}
    >
      <div className="reflection-bookend__header">
        <div>
          <p className="eyebrow">{config.eyebrow}</p>
          <h2 id={`reflection-${kind}-title`}>{config.title}</h2>
        </div>
        {saved && <CheckCircle2 size={24} aria-hidden="true" />}
      </div>

      {locked ? (
        <p>
          Complete the capstone review first. The post-reflection is the final
          step before the completion page.
        </p>
      ) : saved ? (
        <>
          <p>{config.saved}</p>
          <blockquote>{saved.text}</blockquote>
          {kind === 'post' && (
            <a className="button" href="/completion/">
              Continue to learning record
              <MoveRight size={18} aria-hidden="true" />
            </a>
          )}
        </>
      ) : (
        <>
          <p>{config.intro}</p>
          {draftSavedAt && (
            <p className="local-draft-status">
              Draft saved locally in this browser.
            </p>
          )}
          <label>
            <span>{config.label}</span>
            <textarea
              onChange={(event) => setText(event.target.value)}
              placeholder={config.placeholder}
              rows="6"
              value={text}
            />
            <small className={quality.passed ? 'is-passed' : ''}>
              {textQualitySummary(quality)}
            </small>
          </label>
          <button
            className="button"
            disabled={!quality.passed}
            onClick={save}
            type="button"
          >
            {config.button}
          </button>
        </>
      )}
    </section>
  );
}
