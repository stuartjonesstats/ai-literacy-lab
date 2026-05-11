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
    description: 'Remove direct identifiers such as names, emails, IDs, or exact records.',
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
      'Stop and use an approved route before putting this information into AI.',
  },
];

const riskFlags = [
  { id: 'identifier', label: 'Direct identifier' },
  { id: 'account', label: 'Account or billing detail' },
  { id: 'business', label: 'Business-sensitive detail' },
  { id: 'urgency', label: 'Urgency or deadline cue' },
  { id: 'service', label: 'Sensitive service context' },
  { id: 'privacy', label: 'Privacy concern' },
];

const messages = [
  {
    id: 'login',
    title: 'Message 1',
    text: 'I cannot log in after the update. My account email is jordan.lee@example.org.',
    expectedAction: 'redact',
    expectedFlags: ['identifier'],
    safer:
      'User reports login failure after an update. Remove the account email before using the message.',
    feedback:
      'The product issue is useful, but the email address is not needed for theme analysis.',
  },
  {
    id: 'billing',
    title: 'Message 2',
    text: 'The billing screen is confusing. I was charged twice on invoice INV-44721.',
    expectedAction: 'abstract',
    expectedFlags: ['account'],
    safer:
      'User reports duplicate billing and confusion with the billing screen. Remove invoice-specific details.',
    feedback:
      'The invoice reference is not needed to summarize the feedback theme.',
  },
  {
    id: 'agency',
    title: 'Message 3',
    text: 'Our agency is considering switching vendors if the accessibility issue is not fixed by Friday.',
    expectedAction: 'abstract',
    expectedFlags: ['business', 'urgency'],
    safer:
      'Organization reports an unresolved accessibility issue with a near-term deadline.',
    feedback:
      'The vendor-switching detail and deadline may matter for follow-up, but they should be separated from generic theme analysis.',
  },
  {
    id: 'budget',
    title: 'Message 4',
    text: 'The app crashes whenever I upload the quarterly budget workbook.',
    expectedAction: 'abstract',
    expectedFlags: ['business'],
    safer:
      'User reports crashes when uploading a large or structured spreadsheet. Avoid exposing the budget context unless approved.',
    feedback:
      'The crash theme is useful. The budget-workbook context may reveal internal business material.',
  },
  {
    id: 'case-manager',
    title: 'Message 5',
    text: 'My case manager told me to use this portal, but I am worried my information is visible to other users.',
    expectedAction: 'guidance',
    expectedFlags: ['service', 'privacy'],
    safer:
      'User reports concern that personal information may be visible to other users. Route for approved privacy or support follow-up.',
    feedback:
      'This message combines a possible sensitive service context with a privacy concern. Treat it as more than ordinary product feedback.',
  },
];

const rubricChecks = [
  {
    id: 'no-direct-identifiers',
    label: 'Removes direct identifiers and account specifics',
    test: (packet, prompt) => {
      const combined = `${packet} ${prompt}`;
      return (
        combined.trim().length > 80 &&
        !includesAny(combined, [
        '@',
        'jordan.lee',
        'example.org',
        'inv-44721',
        'invoice inv',
        ])
      );
    },
    why: 'The summary task does not require account emails or invoice numbers.',
  },
  {
    id: 'preserves-themes',
    label: 'Preserves useful product themes',
    test: (packet) =>
      countMatches(packet, [
        'login',
        'billing',
        'accessibility',
        'upload',
        'spreadsheet',
        'visible',
        'privacy',
        'information',
      ]) >= 4,
    why: 'Minimization should not erase the business purpose of the task.',
  },
  {
    id: 'separates-urgent',
    label: 'Separates urgent follow-up from theme analysis',
    test: (packet, prompt) =>
      includesAny(`${packet} ${prompt}`, [
        'urgent',
        'follow-up',
        'follow up',
        'deadline',
        'route',
        'escalate',
      ]),
    why: 'Some cases need routing or follow-up, not just aggregation into themes.',
  },
  {
    id: 'limits-inference',
    label: 'Tells AI not to infer sensitive facts',
    test: (packet, prompt) =>
      includesAny(prompt, ['do not infer', 'avoid inferring', 'do not guess']) &&
      includesAny(prompt, ['identity', 'legal', 'medical', 'financial', 'account']),
    why: 'A safer prompt sets boundaries on what the model should not infer.',
  },
  {
    id: 'approved-process',
    label: 'Keeps approval or policy uncertainty visible',
    test: (packet, prompt) =>
      includesAny(`${packet} ${prompt}`, [
        'approved',
        'policy',
        'guidance',
        'allowed',
        'review',
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

function sameSet(left, right) {
  return left.length === right.length && left.every((item) => right.includes(item));
}

export default function DataBoundaryLab() {
  const [selectedActions, setSelectedActions] = useState({});
  const [selectedFlags, setSelectedFlags] = useState({});
  const [sanitizedPacket, setSanitizedPacket] = useState('');
  const [saferPrompt, setSaferPrompt] = useState('');
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
        sameSet(selectedFlags[message.id] || [], message.expectedFlags),
      ).length,
    [selectedFlags],
  );

  const rubricResults = useMemo(
    () =>
      rubricChecks.map((check) => ({
        ...check,
        passed: check.test(sanitizedPacket, saferPrompt),
      })),
    [sanitizedPacket, saferPrompt],
  );

  const rubricScore = rubricResults.filter((check) => check.passed).length;
  const selfMarkedScore = rubricResults.filter((check) => selfMarked[check.id])
    .length;
  const packetQuality = useMemo(
    () =>
      analyzeTextQuality(sanitizedPacket, {
        minChars: 110,
        minWords: 18,
        requiredAny: ['login', 'billing', 'privacy', 'accessibility', 'upload'],
        requiredGroups: [
          {
            terms: ['login', 'billing', 'accessibility', 'upload', 'privacy'],
            message: 'Preserve the useful product or service themes.',
          },
          {
            terms: ['remove', 'redact', 'abstract', 'generalize', 'route'],
            message: 'Show how exposure was reduced or routed.',
          },
        ],
      }),
    [sanitizedPacket],
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
  const criticalDataPassed =
    selectedActions['case-manager'] === 'guidance' &&
    selectedActions['login'] === 'redact' &&
    selectedActions['billing'] === 'abstract' &&
    selectedActions['budget'] !== 'as-is' &&
    actionScore >= 4 &&
    flagScore >= 4;

  const ready =
    completedActions === messages.length &&
    completedFlags === messages.length &&
    criticalDataPassed &&
    packetQuality.passed &&
    promptQuality.passed &&
    rubricScore >= 4;
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
      label: 'Correct the critical data-boundary cases',
      met: criticalDataPassed,
    },
    {
      label: 'Write a sanitized packet',
      met: packetQuality.passed,
    },
    {
      label: 'Write a safer prompt',
      met: promptQuality.passed,
    },
    {
      label: 'Meet at least four local self-checks',
      met: rubricScore >= 4,
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
      setSanitizedPacket(
        typeof draft.sanitizedPacket === 'string' ? draft.sanitizedPacket : '',
      );
      setSaferPrompt(typeof draft.saferPrompt === 'string' ? draft.saferPrompt : '');
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
      Boolean(sanitizedPacket.trim()) ||
      Boolean(saferPrompt.trim());

    if (!hasWork) {
      return;
    }

    const draft = saveDraft('03-data-privacy-confidentiality', {
      selectedActions,
      selectedFlags,
      sanitizedPacket,
      saferPrompt,
    });
    setDraftSavedAt(draft.updatedAt || draft.savedAt || null);
  }, [
    draftLoaded,
    selectedActions,
    selectedFlags,
    sanitizedPacket,
    saferPrompt,
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
          A teammate wants to paste customer messages into an AI tool to
          summarize themes and suggest product fixes. The task sounds ordinary.
          The data is not.
        </p>
        <p>
          For each message, choose the handling action and the risk signals.
          Then write the sanitized packet and safer prompt you would actually
          use.
        </p>
        <blockquote>
          Summarize these customer messages by theme and suggest three product
          fixes. Include examples and identify any urgent cases.
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
          Create a sanitized packet that preserves useful themes but removes
          unnecessary exposure.
        </span>
        <textarea
          onChange={(event) => setSanitizedPacket(event.target.value)}
          placeholder="Example: User reports login failure after update..."
          rows="7"
          value={sanitizedPacket}
        />
        <small className={packetQuality.passed ? 'is-passed' : ''}>
          {textQualitySummary(packetQuality)}
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
        {!criticalDataPassed && (
          <p className="data-lab__warning">
            Critical data-boundary misses still need correction before reveal:
            direct identifiers, account details, sensitive service context, and
            business-sensitive material need stronger handling.
          </p>
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
            not perfect labels. The goal is to stop treating "customer feedback"
            as one uniform data category.
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
