import {
  Ban,
  CheckCircle2,
  Eye,
  HelpCircle,
  ShieldAlert,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  clearDraft,
  hasReflection,
  markModuleComplete,
  readDraft,
  readFacilitatorMode,
  saveDraft,
} from '../lib/progress.js';
import { analyzeTextQuality, textQualitySummary } from '../lib/textQuality.js';
import './decision-sort.css';

const categories = [
  {
    id: 'reasonable',
    label: 'Use with ordinary review',
    short: 'Ordinary review',
    description:
      'Low consequence, no sensitive data, and a human can easily inspect the output.',
    icon: CheckCircle2,
  },
  {
    id: 'safeguards',
    label: 'Use only with safeguards',
    short: 'Safeguards',
    description:
      'Useful, but only after constraints such as redaction, source checking, testing, or limited scope.',
    icon: HelpCircle,
  },
  {
    id: 'formal',
    label: 'Escalate before use',
    short: 'Escalate',
    description:
      'Do not proceed informally. Policy, legal, HR, security, privacy, or accountable owner review comes first.',
    icon: ShieldAlert,
  },
  {
    id: 'no',
    label: 'Do not use AI for this decision',
    short: 'Do not delegate',
    description:
      'The decision should not be delegated to AI, even if AI might help with a bounded support task.',
    icon: Ban,
  },
];

const tasks = [
  {
    id: 'launch-note',
    prompt:
      'A project lead asks you to turn approved release notes into a clearer launch announcement for employees.',
    twist:
      'The notes include an embargoed vendor name, a not-yet-approved price change, and one sentence the legal team has not reviewed.',
    initialExpected: ['reasonable'],
    revisedExpected: ['safeguards', 'formal'],
    rationale:
      'Plain-language rewriting is usually reasonable, but embargoed or unapproved claims change the data and accountability boundary.',
  },
  {
    id: 'pulse-survey',
    prompt:
      'A manager has 38 open-ended pulse-survey comments and wants AI to summarize morale themes before a team retro.',
    twist:
      'Several comments mention a medical leave, a conflict with a named supervisor, and fear of retaliation in a team of only nine people.',
    initialExpected: ['safeguards'],
    revisedExpected: ['formal', 'no'],
    rationale:
      'Theme analysis can be useful, but small-group comments with identifiable employment context need formal handling or should not be put into AI at all.',
  },
  {
    id: 'applicant-screening',
    prompt:
      'A hiring panel wants AI to rank resumes and decide which applicants should advance to interviews.',
    twist:
      'The panel says a human will glance at the ranked list afterward, but they do not have time to read applications that AI places near the bottom.',
    initialExpected: ['formal', 'no'],
    revisedExpected: ['no'],
    rationale:
      'AI may help draft interview rubrics or organize public job criteria, but deciding opportunity by ranking applicants is not a task to delegate.',
  },
  {
    id: 'spreadsheet-automation',
    prompt:
      'An analyst asks AI to draft a formula and small script that flags duplicate rows in an internal tracking spreadsheet.',
    twist:
      'The spreadsheet feeds a payroll exception report used to decide who receives overtime corrections this pay period.',
    initialExpected: ['safeguards'],
    revisedExpected: ['formal', 'safeguards'],
    rationale:
      'Code assistance requires testing. When the output affects pay, the review standard and owner authority become much higher.',
  },
  {
    id: 'policy-complaint',
    prompt:
      'A service team wants AI to identify the policy section that applies to a customer complaint and draft a response outline.',
    twist:
      'The customer alleges discriminatory treatment, and the policy page AI cites was replaced by a new version last week.',
    initialExpected: ['safeguards', 'formal'],
    revisedExpected: ['formal'],
    rationale:
      'Current-source verification is not enough when a complaint raises rights, fairness, or legal exposure. Escalation comes before response.',
  },
  {
    id: 'meeting-checklist',
    prompt:
      'A coordinator asks AI to create a checklist for a routine cross-functional planning meeting.',
    twist:
      'The meeting is routine, the agenda is already public internally, and the checklist will be edited before it is sent.',
    initialExpected: ['reasonable'],
    revisedExpected: ['reasonable'],
    rationale:
      'Some uses stay low risk after context is added. The point is proportional judgment, not reflexive escalation.',
  },
];

const rubricChecks = [
  {
    id: 'consequence',
    label: 'Changes judgment when consequences change',
    test: ({ revisedChoices }) =>
      revisedChoices['applicant-screening'] === 'no' &&
      ['formal', 'safeguards'].includes(revisedChoices['spreadsheet-automation']),
    why: 'The same technical task can become high-stakes when it affects pay, opportunity, or access.',
  },
  {
    id: 'data-boundary',
    label: 'Flags sensitive or identifiable data',
    test: ({ revisedChoices }) =>
      ['formal', 'no'].includes(revisedChoices['pulse-survey']),
    why: 'Small-group or identifiable comments can create privacy, employment, and trust risks.',
  },
  {
    id: 'source-and-rights',
    label: 'Escalates current-policy or rights-sensitive work',
    test: ({ revisedChoices }) => revisedChoices['policy-complaint'] === 'formal',
    why: 'A rights-sensitive complaint is not only a source-checking problem.',
  },
  {
    id: 'proportional',
    label: 'Keeps genuinely routine work proportional',
    test: ({ revisedChoices }) =>
      revisedChoices['meeting-checklist'] === 'reasonable',
    why: 'Strong judgment avoids both careless approval and blanket refusal.',
  },
  {
    id: 'reflection',
    label: 'Explains the context shift in a substantive way',
    test: ({ reflectionQuality }) => reflectionQuality.passed,
    why: 'The transferable skill is explaining why the answer changed.',
  },
];

function matchesExpected(choice, expected) {
  return expected.includes(choice);
}

export default function DecisionSort({ requiresReflection }) {
  const [reflectionReady, setReflectionReady] = useState(!requiresReflection);
  const [facilitatorMode, setFacilitatorMode] = useState(false);
  const [initialChoices, setInitialChoices] = useState({});
  const [revisedChoices, setRevisedChoices] = useState({});
  const [twistsVisible, setTwistsVisible] = useState(false);
  const [reflection, setReflection] = useState('');
  const [selfMarked, setSelfMarked] = useState({});
  const [showDebrief, setShowDebrief] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState(null);

  useEffect(() => {
    if (!requiresReflection) {
      return undefined;
    }

    function handleReflection() {
      const previewMode = readFacilitatorMode();
      setFacilitatorMode(previewMode);
      setReflectionReady(previewMode || hasReflection(requiresReflection));
    }

    handleReflection();
    window.addEventListener('ailitlab:reflection', handleReflection);
    window.addEventListener('ailitlab:facilitator-mode', handleReflection);
    window.addEventListener('storage', handleReflection);
    return () => {
      window.removeEventListener('ailitlab:reflection', handleReflection);
      window.removeEventListener('ailitlab:facilitator-mode', handleReflection);
      window.removeEventListener('storage', handleReflection);
    };
  }, [requiresReflection]);

  useEffect(() => {
    const draft = readDraft('01-good-and-bad-at');
    if (draft) {
      setInitialChoices(
        draft.initialChoices && typeof draft.initialChoices === 'object'
          ? draft.initialChoices
          : {},
      );
      setRevisedChoices(
        draft.revisedChoices && typeof draft.revisedChoices === 'object'
          ? draft.revisedChoices
          : {},
      );
      setTwistsVisible(Boolean(draft.twistsVisible));
      setReflection(typeof draft.reflection === 'string' ? draft.reflection : '');
      setDraftSavedAt(draft.updatedAt || draft.savedAt || null);
    }
    setDraftLoaded(true);
  }, []);

  useEffect(() => {
    if (!draftLoaded) {
      return;
    }

    const hasWork =
      Object.keys(initialChoices).length > 0 ||
      Object.keys(revisedChoices).length > 0 ||
      twistsVisible ||
      Boolean(reflection.trim());

    if (!hasWork) {
      return;
    }

    const draft = saveDraft('01-good-and-bad-at', {
      initialChoices,
      revisedChoices,
      twistsVisible,
      reflection,
    });
    setDraftSavedAt(draft.updatedAt || draft.savedAt || null);
  }, [draftLoaded, initialChoices, revisedChoices, twistsVisible, reflection]);

  const initialCompleted = useMemo(
    () => tasks.filter((task) => initialChoices[task.id]).length,
    [initialChoices],
  );
  const revisedCompleted = useMemo(
    () => tasks.filter((task) => revisedChoices[task.id]).length,
    [revisedChoices],
  );
  const reflectionQuality = useMemo(
    () =>
      analyzeTextQuality(reflection, {
        minChars: 110,
        minWords: 18,
        requiredAny: ['context', 'stakes', 'data', 'review', 'verify', 'people'],
      }),
    [reflection],
  );
  const fitScore = useMemo(
    () =>
      tasks.filter((task) =>
        matchesExpected(revisedChoices[task.id], task.revisedExpected),
      ).length,
    [revisedChoices],
  );
  const rubricResults = useMemo(
    () =>
      rubricChecks.map((check) => ({
        ...check,
        passed: check.test({ revisedChoices, reflectionQuality }),
      })),
    [revisedChoices, reflectionQuality],
  );

  const rubricScore = rubricResults.filter((check) => check.passed).length;
  const selfMarkedScore = rubricResults.filter((check) => selfMarked[check.id])
    .length;
  const initialReady = initialCompleted === tasks.length;
  const finalReady =
    revisedCompleted === tasks.length &&
    fitScore >= 4 &&
    rubricScore >= 3 &&
    reflectionQuality.passed;
  const finalRequirements = [
    {
      label: 'Revise all six request classifications after the complication reveal',
      met: revisedCompleted === tasks.length,
    },
    {
      label: 'Match the stronger risk lens on at least four scenarios',
      met: fitScore >= 4,
    },
    {
      label: 'Meet at least three local self-checks',
      met: rubricScore >= 3,
    },
    {
      label: 'Write a substantive explanation of the context shift',
      met: reflectionQuality.passed,
    },
  ];

  function chooseInitial(taskId, category) {
    setInitialChoices((current) => ({ ...current, [taskId]: category }));
  }

  function chooseRevised(taskId, category) {
    setRevisedChoices((current) => ({ ...current, [taskId]: category }));
  }

  function toggleSelfMarked(checkId) {
    setSelfMarked((current) => ({ ...current, [checkId]: !current[checkId] }));
  }

  function revealTwists() {
    setTwistsVisible(true);
    setRevisedChoices(initialChoices);
  }

  function revealDebrief() {
    setShowDebrief(true);
    clearDraft('01-good-and-bad-at');
    markModuleComplete('01-good-and-bad-at');
  }

  if (!reflectionReady) {
    return (
      <section className="decision-sort decision-sort--locked">
        <div className="decision-sort__header">
          <div>
            <p className="decision-sort__eyebrow">Interactive Lab</p>
            <h2>Module 1 lab locked</h2>
          </div>
        </div>
        <p>
          Save the pre-reflection above first. It will be added to your
          final learning record next to your post-reflection.
        </p>
      </section>
    );
  }

  return (
    <section className="decision-sort" aria-labelledby="decision-sort-title">
      <div className="decision-sort__header">
        <div>
          <p className="decision-sort__eyebrow">Interactive Lab</p>
          <h2 id="decision-sort-title">Sort, then revise</h2>
        </div>
        <div className="decision-sort__progress" aria-live="polite">
          {twistsVisible ? revisedCompleted : initialCompleted}/{tasks.length}
        </div>
      </div>
      {draftSavedAt && !showDebrief && (
        <p className="local-draft-status">
          Draft saved locally in this browser.
        </p>
      )}

      <div className="decision-sort__scenario">
        <h3>Scenario</h3>
        {facilitatorMode && (
          <p>
            Facilitator preview is bypassing the pre-reflection gate so this
            activity can be inspected or used in a live workshop.
          </p>
        )}
        <p>
          You are triaging AI requests during a busy workday. First classify the
          request as written. Then reveal the complication and decide whether
          your answer should change.
        </p>
      </div>

      <div className="decision-sort__category-guide">
        {categories.map(({ id, short, description, icon: Icon }) => (
          <article key={id}>
            <Icon size={18} aria-hidden="true" />
            <div>
              <strong>{short}</strong>
              <span>{description}</span>
            </div>
          </article>
        ))}
      </div>

      <div className="decision-sort__list">
        {tasks.map((task) => (
          <article className="decision-sort__item" key={task.id}>
            <p>{task.prompt}</p>
            <div className="decision-sort__buttons">
              {categories.map(({ id, label, icon: Icon }) => (
                <button
                  aria-pressed={initialChoices[task.id] === id}
                  className={initialChoices[task.id] === id ? 'is-selected' : ''}
                  key={id}
                  onClick={() => chooseInitial(task.id, id)}
                  type="button"
                >
                  <Icon size={17} aria-hidden="true" />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {twistsVisible && (
              <div className="decision-sort__twist">
                <h4>Complication</h4>
                <p>{task.twist}</p>
                <div className="decision-sort__buttons">
                  {categories.map(({ id, label, icon: Icon }) => (
                    <button
                      aria-pressed={revisedChoices[task.id] === id}
                      className={
                        revisedChoices[task.id] === id ? 'is-selected' : ''
                      }
                      key={id}
                      onClick={() => chooseRevised(task.id, id)}
                      type="button"
                    >
                      <Icon size={17} aria-hidden="true" />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </article>
        ))}
      </div>

      {!twistsVisible ? (
        <>
          <button
            className="decision-sort__reveal"
            disabled={!initialReady}
            onClick={revealTwists}
            type="button"
          >
            <Eye size={18} aria-hidden="true" />
            Reveal the complications
          </button>
          {!initialReady && (
            <p className="local-draft-status">
              Classify all six requests before revealing the complications.
            </p>
          )}
        </>
      ) : (
        <>
          <label className="decision-sort__reflection">
            <span>
              Pick one item where the complication changed your judgment, or
              explain why it did not.
            </span>
            <textarea
              onChange={(event) => setReflection(event.target.value)}
              placeholder="Example: I changed my answer because the task shifted from routine drafting to a decision that could affect people..."
              rows="5"
              value={reflection}
            />
            <small className={reflectionQuality.passed ? 'is-passed' : ''}>
              {textQualitySummary(reflectionQuality)}
            </small>
          </label>

          <div className="decision-sort__self-check">
            <div className="decision-sort__self-check-header">
              <h3>What your answer shows so far</h3>
              <span aria-live="polite">{rubricScore}/{rubricChecks.length} checks</span>
            </div>
            <p>
              This section shows what the page can detect in your answer so far.
              These checks support reflection; they do not verify correctness,
              policy compliance, or role authorization.
            </p>
            <p className="decision-sort__self-mark-count" aria-live="polite">
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
              {finalRequirements.map((requirement) => (
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
            className="decision-sort__reveal"
            disabled={!finalReady}
            onClick={revealDebrief}
            type="button"
          >
            <Eye size={18} aria-hidden="true" />
            Reveal stronger lens
          </button>
        </>
      )}

      {showDebrief && (
        <div className="decision-sort__debrief">
          <h3>Review your revised sort</h3>
          <p>
            Your revised sort matched the stronger lens on {fitScore}/{tasks.length}
            {' '}items. Treat that as feedback for discussion, not proof of
            mastery.
          </p>
          <div className="decision-sort__review-grid">
            {tasks.map((task) => (
              <article key={task.id}>
                <h4>{task.prompt}</h4>
                <p>
                  <strong>Complication:</strong> {task.twist}
                </p>
                <p>
                  <strong>Stronger lens:</strong> {task.rationale}
                </p>
              </article>
            ))}
          </div>
          <p>
            The durable skill is not memorizing a list of approved and banned
            tasks. It is noticing when context changes the answer.
          </p>
        </div>
      )}
    </section>
  );
}
