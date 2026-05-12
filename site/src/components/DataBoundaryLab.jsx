import {
  CheckCircle2,
  Eye,
  FileWarning,
  LockKeyhole,
  PencilLine,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  clearDraft,
  markModuleComplete,
  readDraft,
  saveDraft,
} from '../lib/progress.js';
import { analyzeTextQuality, textQualitySummary } from '../lib/textQuality.js';
import './data-boundary-lab.css';

const actions = [
  {
    id: 'as-is',
    label: 'Use as-is',
    description: 'No sensitive or unnecessary detail is present for the task.',
  },
  {
    id: 'redact',
    label: 'Redact first',
    description: 'Remove direct identifiers such as names, emails, case IDs, or exact records.',
  },
  {
    id: 'abstract',
    label: 'Generalize/abstract first',
    description:
      'Replace specifics with categories while preserving the useful theme.',
  },
  {
    id: 'guidance',
    label: 'Approved process first',
    description:
      'Stop and use an approved office route before putting this information into AI.',
  },
];

const riskFlags = [
  { id: 'identifier', label: 'Direct identifier' },
  { id: 'record', label: 'Case or record detail' },
  { id: 'office', label: 'Internal or office-sensitive detail' },
  { id: 'urgency', label: 'Urgency or deadline cue' },
  { id: 'service', label: 'Sensitive service context' },
  { id: 'privacy', label: 'Privacy concern' },
];

const messages = [
  {
    id: 'renewal',
    title: 'Message 1',
    text: 'My benefits renewal link does not work. My case number is A-104928 and my email is maya.rivera@example.org.',
    expectedAction: 'redact',
    expectedFlags: ['identifier', 'record', 'service'],
    safer:
      'Resident reports a benefits renewal link failure. Remove the email address and case number before theme analysis.',
    feedback:
      'The service problem is useful, but the email address and case number are not needed for inbox theme analysis.',
  },
  {
    id: 'kiosk',
    title: 'Message 2',
    text: 'The lobby check-in kiosk is confusing. It asked me to scan the same document twice.',
    expectedAction: 'abstract',
    expectedFlags: ['service'],
    safer:
      'Resident reports confusion with the lobby check-in kiosk and repeated document scanning.',
    feedback:
      'The service-design theme can be summarized without asking the AI to inspect the resident document itself.',
  },
  {
    id: 'accommodation',
    title: 'Message 3',
    text: 'The disability accommodation form is not compatible with my screen reader, and my hearing is Friday.',
    expectedAction: 'guidance',
    expectedFlags: ['service', 'urgency'],
    safer:
      'Resident reports an accessibility barrier with a near-term hearing deadline. Route through the approved accommodation process.',
    feedback:
      'The accessibility barrier may be a theme, but the deadline and accommodation context need approved follow-up, not generic summarization.',
  },
  {
    id: 'public-records',
    title: 'Message 4',
    text: 'The public-records request portal times out when I upload exhibit PDF files for request PRR-22017.',
    expectedAction: 'abstract',
    expectedFlags: ['record'],
    safer:
      'Requester reports portal timeouts when uploading PDF files. Remove the request ID before AI-assisted theme analysis.',
    feedback:
      'The upload failure is useful. The request ID is not needed for a general service-improvement summary.',
  },
  {
    id: 'shelter',
    title: 'Message 5',
    text: 'Please add a note to my housing case: I am staying at Safe Harbor shelter after domestic violence and cannot receive mail at my old address.',
    expectedAction: 'guidance',
    expectedFlags: ['identifier', 'record', 'service', 'privacy'],
    safer:
      'Resident provides sensitive housing and safety information for a case record. Use the approved case-management route, not a general AI tool.',
    feedback:
      'This is not just feedback. It is sensitive case information that belongs in an approved system and workflow.',
  },
];

const beforeActOptions = [
  {
    id: 'purpose',
    label: 'Which details are actually needed for theme analysis?',
  },
  {
    id: 'case-route',
    label: 'Which messages are really case follow-up, not feedback?',
  },
  {
    id: 'deadline',
    label: 'Which deadlines or hearings could be harmed by delay?',
  },
  {
    id: 'approved-tool',
    label: 'Is this tool approved for this kind of office data?',
  },
  {
    id: 'human-owner',
    label: 'Who owns urgent or sensitive follow-up after the summary?',
  },
];

const rubricChecks = [
  {
    id: 'no-direct-identifiers',
    label: 'Removes direct identifiers and case specifics',
    test: (summary, prompt) => {
      const combined = `${summary} ${prompt}`;
      return (
        combined.trim().length > 80 &&
        !includesAny(combined, [
          '@',
          'maya.rivera',
          'example.org',
          'a-104928',
          'prr-22017',
          'safe harbor',
        ])
      );
    },
    why: 'The summary task does not require emails, case numbers, request IDs, or shelter names.',
  },
  {
    id: 'preserves-themes',
    label: 'Preserves useful public-service themes',
    test: (summary) =>
      countMatches(summary, [
        'renewal',
        'benefits',
        'kiosk',
        'document',
        'accessibility',
        'screen reader',
        'upload',
        'file',
        'portal',
        'housing',
        'privacy',
        'information',
        'personal',
      ]) >= 3,
    why: 'Minimization should not erase the public-service purpose of the task.',
  },
  {
    id: 'separates-urgent',
    label: 'Separates urgent follow-up from theme analysis',
    test: (summary, prompt) =>
      includesAny(`${summary} ${prompt}`, [
        'urgent',
        'follow-up',
        'follow up',
        'deadline',
        'route',
        'escalate',
        'approved',
        'accommodation',
        'case',
      ]),
    why: 'Some cases need routing or follow-up, not just aggregation into themes.',
  },
  {
    id: 'limits-inference',
    label: 'Tells AI not to infer sensitive facts',
    test: (summary, prompt) =>
      includesAny(prompt, [
        'do not infer',
        'avoid inferring',
        'do not guess',
        "don't assume",
        'only use provided',
        'provided information',
      ]) &&
      includesAny(prompt, ['identity', 'legal', 'medical', 'financial', 'case', 'record', 'sensitive', 'personal']),
    why: 'A safer prompt sets boundaries on what the model should not infer.',
  },
  {
    id: 'approved-process',
    label: 'Keeps approval or policy uncertainty visible',
    test: (summary, prompt) =>
      includesAny(`${summary} ${prompt}`, [
        'approved',
        'policy',
        'guidance',
        'allowed',
        'review',
        'manager',
        'support',
      ]),
    why: 'The learner should not assume every tool is approved for every data exposure.',
  },
];

function includesAny(text, terms) {
  const normalized = text.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

function countMatches(text, terms) {
  const normalized = text.toLowerCase();
  return terms.filter((term) => normalized.includes(term)).length;
}

function includesAll(left, right) {
  return right.every((item) => left.includes(item));
}

export default function DataBoundaryLab() {
  const [selectedActions, setSelectedActions] = useState({});
  const [selectedFlags, setSelectedFlags] = useState({});
  const [sanitizedSummary, setSanitizedSummary] = useState('');
  const [saferPrompt, setSaferPrompt] = useState('');
  const [beforeAct, setBeforeAct] = useState([]);
  const [judgmentResponse, setJudgmentResponse] = useState('');
  const [selfMarked, setSelfMarked] = useState({});
  const [showDebrief, setShowDebrief] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState(null);

  const completedActions = useMemo(
    () => messages.filter((message) => selectedActions[message.id]).length,
    [selectedActions],
  );

  const completedFlags = useMemo(
    () =>
      messages.filter((message) => (selectedFlags[message.id] || []).length > 0)
        .length,
    [selectedFlags],
  );

  const actionScore = useMemo(
    () =>
      messages.filter(
        (message) => selectedActions[message.id] === message.expectedAction,
      ).length,
    [selectedActions],
  );

  const flagScore = useMemo(
    () =>
      messages.filter((message) =>
        includesAll(selectedFlags[message.id] || [], message.expectedFlags),
      ).length,
    [selectedFlags],
  );

  const rubricResults = useMemo(
    () =>
      rubricChecks.map((check) => ({
        ...check,
        passed: check.test(sanitizedSummary, saferPrompt),
      })),
    [sanitizedSummary, saferPrompt],
  );

  const rubricScore = rubricResults.filter((check) => check.passed).length;
  const selfMarkedScore = rubricResults.filter((check) => selfMarked[check.id])
    .length;
  const effectiveRubricScore =
    rubricScore +
    Math.min(
      rubricResults.filter((check) => !check.passed && selfMarked[check.id])
        .length,
      1,
    );
  const summaryQuality = useMemo(
    () =>
      analyzeTextQuality(sanitizedSummary, {
        minChars: 110,
        minWords: 18,
        requiredAny: ['benefits', 'kiosk', 'privacy', 'accessibility', 'upload', 'housing'],
        requiredGroups: [
          {
            terms: ['benefits', 'renewal', 'kiosk', 'accessibility', 'upload', 'privacy', 'housing'],
            message: 'Preserve the useful public-service themes.',
          },
          {
            terms: ['remove', 'redact', 'abstract', 'generalize', 'route'],
            message: 'Show how exposure was reduced or routed.',
          },
        ],
      }),
    [sanitizedSummary],
  );
  const promptQuality = useMemo(
    () =>
      analyzeTextQuality(saferPrompt, {
        minChars: 90,
        minWords: 14,
        requiredAny: ['do not infer', 'only', 'sanitized', 'review', 'approved'],
        requiredGroups: [
          {
            terms: ['sanitized', 'redacted', 'abstracted'],
            message: 'Tell the AI it is working from minimized input.',
          },
          {
            terms: ['do not infer', 'do not guess', 'avoid inferring'],
            message: 'Tell the AI not to infer sensitive facts.',
          },
          {
            terms: ['review', 'approved', 'route', 'escalate'],
            message: 'Name when human review or approved routing is needed.',
          },
        ],
      }),
    [saferPrompt],
  );
  const judgmentQuality = useMemo(
    () =>
      analyzeTextQuality(judgmentResponse, {
        minChars: 130,
        minWords: 24,
        requiredAny: ['include', 'route', 'approved', 'exclude', 'because'],
        requiredGroups: [
          {
            terms: ['include', 'only', 'theme', 'summary', 'exclude', 'remove'],
            message: 'Name what can go into the AI summary and what should stay out.',
          },
          {
            terms: ['approved', 'route', 'case', 'accommodation', 'privacy', 'escalate'],
            message: 'Name what should use an approved route instead of the AI tool.',
          },
          {
            terms: ['because', 'so that', 'risk', 'purpose', 'needed'],
            message: 'Defend the judgment, not just the choice.',
          },
        ],
      }),
    [judgmentResponse],
  );
  const criticalDataHints = useMemo(() => {
    const hints = [];
    const flags = (messageId) => selectedFlags[messageId] || [];

    if (!['redact', 'abstract', 'guidance'].includes(selectedActions.renewal)) {
      hints.push('Message 1: do not use the email address or case number as-is.');
    }
    if (!includesAll(flags('renewal'), ['identifier', 'record', 'service'])) {
      hints.push('Message 1: flag the email, case number, and benefits context.');
    }
    if (selectedActions.kiosk === 'as-is') {
      hints.push('Message 2: consider whether the document-scanning detail should be generalized before AI use.');
    }
    if (!flags('kiosk').includes('service')) {
      hints.push('Message 2: flag the public-service context.');
    }
    if (selectedActions.accommodation !== 'guidance') {
      hints.push('Message 3: use an approved route for accommodation context and the Friday deadline.');
    }
    if (!includesAll(flags('accommodation'), ['service', 'urgency'])) {
      hints.push('Message 3: flag sensitive service context and urgency/deadline.');
    }
    if (selectedActions['public-records'] === 'as-is') {
      hints.push('Message 4: do not use the public-records request ID as-is.');
    }
    if (!flags('public-records').includes('record')) {
      hints.push('Message 4: flag the request ID as a case or record detail.');
    }
    if (selectedActions.shelter !== 'guidance') {
      hints.push('Message 5: use an approved case-management route for housing and safety information.');
    }
    if (!includesAll(flags('shelter'), ['identifier', 'record', 'service', 'privacy'])) {
      hints.push('Message 5: flag case detail, sensitive service context, and privacy concern.');
    }

    return hints;
  }, [selectedActions, selectedFlags]);
  const criticalDataPassed = criticalDataHints.length === 0;
  const showCriticalDataHints =
    (completedActions > 0 || completedFlags > 0) && !criticalDataPassed;

  const ready =
    completedActions === messages.length &&
    completedFlags === messages.length &&
    summaryQuality.passed &&
    promptQuality.passed &&
    beforeAct.length >= 2 &&
    judgmentQuality.passed;
  const completionRequirements = [
    {
      label: 'Choose a handling action for every message',
      met: completedActions === messages.length,
    },
    {
      label: 'Flag risk signals for every message',
      met: completedFlags === messages.length,
    },
    {
      label: 'Write a sanitized public-service summary',
      met: summaryQuality.passed,
    },
    {
      label: 'Write a safer prompt',
      met: promptQuality.passed,
    },
    {
      label: 'Choose at least two Before You Act considerations',
      met: beforeAct.length >= 2,
    },
    {
      label: 'Complete the Judgment Challenge',
      met: judgmentQuality.passed,
    },
  ];

  useEffect(() => {
    const draft = readDraft('03-data-privacy-confidentiality');
    if (draft) {
      setSelectedActions(
        draft.selectedActions && typeof draft.selectedActions === 'object'
          ? draft.selectedActions
          : {},
      );
      setSelectedFlags(
        draft.selectedFlags && typeof draft.selectedFlags === 'object'
          ? draft.selectedFlags
          : {},
      );
      setSanitizedSummary(
        typeof draft.sanitizedSummary === 'string'
          ? draft.sanitizedSummary
          : '',
      );
      setSaferPrompt(typeof draft.saferPrompt === 'string' ? draft.saferPrompt : '');
      setBeforeAct(Array.isArray(draft.beforeAct) ? draft.beforeAct : []);
      setJudgmentResponse(
        typeof draft.judgmentResponse === 'string' ? draft.judgmentResponse : '',
      );
      setDraftSavedAt(draft.updatedAt || draft.savedAt || null);
    }
    setDraftLoaded(true);
  }, []);

  useEffect(() => {
    if (!draftLoaded) {
      return;
    }

    const hasWork =
      Object.keys(selectedActions).length > 0 ||
      Object.keys(selectedFlags).length > 0 ||
      Boolean(sanitizedSummary.trim()) ||
      Boolean(saferPrompt.trim()) ||
      beforeAct.length > 0 ||
      Boolean(judgmentResponse.trim());

    if (!hasWork) {
      return;
    }

    const draft = saveDraft('03-data-privacy-confidentiality', {
      selectedActions,
      selectedFlags,
      sanitizedSummary,
      saferPrompt,
      beforeAct,
      judgmentResponse,
    });
    setDraftSavedAt(draft.updatedAt || draft.savedAt || null);
  }, [
    draftLoaded,
    selectedActions,
    selectedFlags,
    sanitizedSummary,
    saferPrompt,
    beforeAct,
    judgmentResponse,
  ]);

  function chooseAction(messageId, actionId) {
    setSelectedActions((current) => ({ ...current, [messageId]: actionId }));
  }

  function toggleFlag(messageId, flagId) {
    setSelectedFlags((current) => {
      const existing = current[messageId] || [];
      const next = existing.includes(flagId)
        ? existing.filter((id) => id !== flagId)
        : [...existing, flagId];
      return { ...current, [messageId]: next };
    });
  }

  function toggleSelfMarked(checkId) {
    setSelfMarked((current) => ({ ...current, [checkId]: !current[checkId] }));
  }

  function toggleBeforeAct(optionId) {
    setBeforeAct((current) =>
      current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId],
    );
  }

  function revealDebrief() {
    setShowDebrief(true);
    clearDraft('03-data-privacy-confidentiality');
    markModuleComplete('03-data-privacy-confidentiality');
  }

  return (
    <section className="data-lab" aria-labelledby="data-lab-title">
      <div className="data-lab__header">
        <div>
          <p className="data-lab__eyebrow">Interactive Lab</p>
          <h2 id="data-lab-title">The data boundary test</h2>
        </div>
        <div className="data-lab__progress" aria-live="polite">
          {completedActions}/{messages.length}
        </div>
      </div>
      {draftSavedAt && !showDebrief && (
        <p className="local-draft-status">
          Draft saved locally in this browser.
        </p>
      )}

      <div className="data-lab__scenario">
        <h3>Scenario</h3>
        <p>
          A public office teammate wants to paste inbox messages into an AI
          tool to summarize service themes and suggest process improvements.
          The task sounds ordinary. The data is not.
        </p>
        <p>
          For each message, choose the handling action and the risk signals.
          Then write the sanitized summary and safer prompt you would actually
          use.
        </p>
        <blockquote>
          Summarize these public-service inbox messages by theme and suggest
          three process improvements. Include examples and identify urgent
          cases.
        </blockquote>
      </div>

      <div className="data-lab__action-guide">
        {actions.map((action) => (
          <article key={action.id}>
            <strong>{action.label}</strong>
            <span>{action.description}</span>
          </article>
        ))}
      </div>

      <div className="data-lab__messages">
        {messages.map((message) => (
          <article className="data-lab__message" key={message.id}>
            <div className="data-lab__message-text">
              <h3>{message.title}</h3>
              <p>{message.text}</p>
            </div>

            <fieldset>
              <legend>What would you do before using this message?</legend>
              <div className="data-lab__action-grid">
                {actions.map((action) => (
                  <button
                    aria-pressed={selectedActions[message.id] === action.id}
                    className={
                      selectedActions[message.id] === action.id
                        ? 'is-selected'
                        : ''
                    }
                    key={action.id}
                    onClick={() => chooseAction(message.id, action.id)}
                    type="button"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend>What risk signals do you see?</legend>
              <div className="data-lab__flag-grid">
                {riskFlags.map((flag) => (
                  <button
                    aria-pressed={(selectedFlags[message.id] || []).includes(
                      flag.id,
                    )}
                    className={
                      (selectedFlags[message.id] || []).includes(flag.id)
                        ? 'is-selected'
                        : ''
                    }
                    key={flag.id}
                    onClick={() => toggleFlag(message.id, flag.id)}
                    type="button"
                  >
                    {flag.label}
                  </button>
                ))}
              </div>
            </fieldset>
          </article>
        ))}
      </div>

      <label className="data-lab__textarea">
        <span>
          Create a sanitized summary that preserves useful public-service themes
          but removes unnecessary exposure.
        </span>
        <textarea
          onChange={(event) => setSanitizedSummary(event.target.value)}
          placeholder="Example: Resident reports benefits renewal link failure..."
          rows="7"
          value={sanitizedSummary}
        />
        <small className={summaryQuality.passed ? 'is-passed' : ''}>
          {textQualitySummary(summaryQuality)}
        </small>
      </label>

      <label className="data-lab__textarea">
        <span>Write a safer prompt for the AI tool.</span>
        <textarea
          onChange={(event) => setSaferPrompt(event.target.value)}
          placeholder="Summarize these sanitized themes. Do not infer..."
          rows="5"
          value={saferPrompt}
        />
        <small className={promptQuality.passed ? 'is-passed' : ''}>
          {textQualitySummary(promptQuality)}
        </small>
      </label>

      <label className="data-lab__textarea data-lab__judgment">
        <span>Judgment Challenge: separate theme summary from case follow-up.</span>
        <small className="data-lab__field-help">
          Role: you are preparing a morning briefing for the office director.
          The director wants useful process themes, not a case review, but the
          inbox includes people who may need urgent help.
        </small>
        <div className="data-lab__before-act">
          <h3>Before You Act</h3>
          <p>
            Choose at least two considerations that should shape the boundary
            between AI-assisted theme analysis and approved case follow-up.
          </p>
          <div className="data-lab__consideration-grid">
            {beforeActOptions.map((option) => (
              <button
                aria-pressed={beforeAct.includes(option.id)}
                className={beforeAct.includes(option.id) ? 'is-selected' : ''}
                key={option.id}
                onClick={() => toggleBeforeAct(option.id)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <small className="data-lab__field-help">
          Decide what can safely be summarized by AI and what must stay in an
          approved office process because it involves a person, record, deadline,
          accommodation, housing, or safety issue.
        </small>
        <textarea
          onChange={(event) => setJudgmentResponse(event.target.value)}
          placeholder="I would include only abstracted service themes such as renewal-link problems and upload failures. I would exclude or route case numbers, accommodation deadlines, and housing or safety details through approved office channels because..."
          rows="5"
          value={judgmentResponse}
        />
        <small className={judgmentQuality.passed ? 'is-passed' : ''}>
          {textQualitySummary(judgmentQuality)}
        </small>
      </label>

      <div className="data-lab__self-check">
        <div className="data-lab__self-check-header">
          <h3>What your answer shows so far</h3>
          <span aria-live="polite">
            {rubricScore}/{rubricChecks.length} checks
          </span>
        </div>
        <p>
          This section shows what the page can detect in your answer so far.
          These checks support reflection; they do not verify correctness,
          policy compliance, or role authorization.
        </p>
        {showCriticalDataHints && (
          <div className="data-lab__warning">
            <p>
              Consider these visible issues as you revise. Extra risk flags are
              fine; this list only names likely core issues.
            </p>
            <ul>
              {criticalDataHints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="data-lab__self-mark-count" aria-live="polite">
          {selfMarkedScore}/{rubricChecks.length} checked by you
        </p>
        <ul>
          {rubricResults.map((check) => (
            <li
              className={[
                check.passed ? 'is-passed' : '',
                selfMarked[check.id] ? 'is-self-marked' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              key={check.id}
            >
              <button
                aria-pressed={Boolean(selfMarked[check.id])}
                onClick={() => toggleSelfMarked(check.id)}
                type="button"
              >
                <CheckCircle2 size={18} aria-hidden="true" />
                <div>
                  <strong>{check.label}</strong>
                  <span>{check.why}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="local-requirements" aria-live="polite">
        <h3>Before reveal</h3>
        <ul>
          {completionRequirements.map((requirement) => (
            <li
              className={requirement.met ? 'is-met' : ''}
              key={requirement.label}
            >
              {requirement.label}
            </li>
          ))}
        </ul>
      </div>

      <button
        className="data-lab__reveal"
        disabled={!ready}
        onClick={revealDebrief}
        type="button"
      >
        <Eye size={18} aria-hidden="true" />
        Reveal boundary review
      </button>

      {showDebrief && (
        <div className="data-lab__debrief">
          <h3>Boundary review</h3>
          <p>
            You matched {actionScore} of {messages.length} recommended actions
            and {flagScore} of {messages.length} risk-signal sets. The goal is
            not perfect labels. The goal is to stop treating "office inbox
            messages" as one uniform data category.
          </p>

          <div className="data-lab__review-grid">
            {messages.map((message) => (
              <article className="data-lab__review-card" key={message.id}>
                <h4>{message.title}</h4>
                <p>{message.feedback}</p>
                <p>
                  <strong>Safer version:</strong> {message.safer}
                </p>
              </article>
            ))}
          </div>

          <div className="data-lab__principles">
            <h3>What changed?</h3>
            <ul>
              <li>
                <LockKeyhole size={18} aria-hidden="true" />
                Use the least amount of detail needed for the task.
              </li>
              <li>
                <PencilLine size={18} aria-hidden="true" />
                Redact direct identifiers and abstract sensitive context.
              </li>
              <li>
                <FileWarning size={18} aria-hidden="true" />
                Separate theme analysis from urgent or policy-sensitive follow-up.
              </li>
              <li>
                <ShieldCheck size={18} aria-hidden="true" />
                Check whether the tool and context are approved before exposing data.
              </li>
            </ul>
          </div>

          <p className="data-lab__privacy">
            Your classifications and rewrites were checked locally in this page.
            They were not submitted, stored, or sent to a server.
          </p>
        </div>
      )}
    </section>
  );
}
