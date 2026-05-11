import {
  CheckCircle2,
  Eye,
  GitBranch,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  clearDraft,
  markModuleComplete,
  readDraft,
  saveDraft,
} from '../lib/progress.js';
import { analyzeTextQuality, textQualitySummary } from '../lib/textQuality.js';
import './risk-escalation-lab.css';

const actions = [
  { id: 'proceed', label: 'Proceed with ordinary review' },
  { id: 'modify', label: 'Modify with safeguards' },
  { id: 'pause', label: 'Pause for expert review' },
  { id: 'escalate', label: 'Escalate before use' },
];

const dimensions = [
  { id: 'consequence', label: 'Consequence if wrong' },
  { id: 'reversibility', label: 'Hard to reverse' },
  { id: 'data', label: 'Sensitive data' },
  { id: 'people', label: 'Affects people directly' },
  { id: 'verification', label: 'Hard to verify first' },
  { id: 'policy', label: 'Policy unclear' },
];

const cases = [
  {
    id: 'agenda',
    title: 'Meeting Agendas',
    initial:
      'Use AI to draft meeting agendas from sanitized planning notes.',
    complication:
      'Some notes include an upcoming reorganization, unannounced staffing changes, and employee names.',
    initialBest: ['proceed', 'modify'],
    revisedBest: ['modify', 'pause'],
    expectedDimensions: ['data', 'people', 'policy'],
    debrief:
      'The task sounds low-risk, but the data changed. A routine drafting task becomes a data-boundary problem when unannounced staffing details appear.',
  },
  {
    id: 'complaints',
    title: 'Complaint Themes',
    initial:
      'Use AI to summarize customer complaints and identify urgent follow-up themes.',
    complication:
      'The complaints include account details, vulnerable customers, and possible safety or access concerns that need routing.',
    initialBest: ['modify', 'pause'],
    revisedBest: ['pause', 'escalate'],
    expectedDimensions: ['data', 'people', 'policy', 'consequence'],
    debrief:
      'Theme analysis may be useful, but urgent or sensitive complaints require separation from generic summarization.',
  },
  {
    id: 'deprioritize',
    title: 'Ticket Deprioritization',
    initial:
      'Use AI to recommend which support tickets should be deprioritized during a backlog surge.',
    complication:
      'A deprioritized ticket may delay help for users with urgent access needs, and the AI does not see account history or prior failed fixes.',
    initialBest: ['pause', 'escalate'],
    revisedBest: ['escalate'],
    expectedDimensions: ['consequence', 'people', 'verification'],
    debrief:
      'This is not just sorting work. It can affect who waits, who gets help, and whether harm happens before a human notices.',
  },
  {
    id: 'denial',
    title: 'Denial Language',
    initial:
      'Use AI to draft denial language for requests that do not meet policy.',
    complication:
      'Some requests involve exceptions, appeal rights, or people who may rely on the explanation to understand next steps.',
    initialBest: ['modify', 'pause'],
    revisedBest: ['pause', 'escalate'],
    expectedDimensions: ['consequence', 'people', 'policy', 'verification'],
    debrief:
      'AI may help with plain language, but denial-related communication needs strong source checking and accountable review.',
  },
  {
    id: 'interviews',
    title: 'Interview Questions',
    initial:
      'Use AI to generate interview questions from job descriptions.',
    complication:
      'The job descriptions include informal criteria like culture fit, executive presence, and availability for short-notice travel.',
    initialBest: ['modify', 'pause'],
    revisedBest: ['pause', 'escalate'],
    expectedDimensions: ['people', 'policy', 'consequence'],
    debrief:
      'Standardizing questions can help, but vague criteria can encode unfair proxies. Review should focus on job relevance and consistent evaluation.',
  },
  {
    id: 'titles',
    title: 'Presentation Titles',
    initial:
      'Use AI to brainstorm titles for an internal training presentation.',
    complication:
      'The presentation topic is public and the prompt contains no sensitive data, personnel information, or decision recommendations.',
    initialBest: ['proceed'],
    revisedBest: ['proceed'],
    expectedDimensions: [],
    debrief:
      'This is a useful proportionality check. Some uses are genuinely low risk when data, stakes, and downstream effects are limited.',
  },
];

const rubricChecks = [
  {
    id: 'revises-after-context',
    label: 'Calibrates risk after new context appears',
    test: ({ revisedChoices }) =>
      ['complaints', 'deprioritize', 'denial', 'interviews'].every((id) =>
        ['pause', 'escalate'].includes(revisedChoices[id]),
      ) && ['modify', 'pause'].includes(revisedChoices.agenda),
    why: 'Risk classification should respond to context, including recognizing when initial caution remains warranted.',
  },
  {
    id: 'escalates-people-impact',
    label: 'Escalates or pauses people-impacting uses',
    test: ({ revisedChoices }) =>
      ['deprioritize', 'denial', 'interviews'].every((id) =>
        ['pause', 'escalate'].includes(revisedChoices[id]),
      ),
    why: 'Uses that affect access, denial, selection, or delay need stronger review.',
  },
  {
    id: 'keeps-proportionality',
    label: 'Keeps low-risk work proportional',
    test: ({ revisedChoices }) => revisedChoices.titles === 'proceed',
    why: 'Good governance does not escalate everything. Controls should match risk.',
  },
  {
    id: 'uses-risk-lens',
    label: 'Uses multiple risk dimensions',
    test: ({ selectedDimensions }) =>
      Object.values(selectedDimensions).filter((items) => items.length >= 2)
        .length >= 4,
    why: 'A strong classification weighs consequence, data, affected people, verification, and policy uncertainty.',
  },
  {
    id: 'documents-escalation',
    label: 'Documents an escalation trigger and condition to proceed',
    test: ({ note }) =>
      note.trim().length > 80 &&
      includesAny(note, ['escalate', 'pause', 'review', 'approve', 'approval']) &&
      includesAny(note, ['proceed', 'condition', 'only if', 'before use', 'safeguard']),
    why: 'A useful risk note tells others what would trigger escalation and what would make use acceptable.',
  },
];

function includesAny(text, terms) {
  const normalized = text.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

function overlapCount(left, right) {
  return left.filter((item) => right.includes(item)).length;
}

export default function RiskEscalationLab() {
  const [initialChoices, setInitialChoices] = useState({});
  const [showComplications, setShowComplications] = useState(false);
  const [revisedChoices, setRevisedChoices] = useState({});
  const [selectedDimensions, setSelectedDimensions] = useState({});
  const [note, setNote] = useState('');
  const [selfMarked, setSelfMarked] = useState({});
  const [showDebrief, setShowDebrief] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState(null);

  const initialComplete = useMemo(
    () => cases.every((item) => initialChoices[item.id]),
    [initialChoices],
  );

  const revisedComplete = useMemo(
    () =>
      cases.every(
        (item) =>
          revisedChoices[item.id] &&
          (item.expectedDimensions.length === 0 ||
            (selectedDimensions[item.id] || []).length > 0),
      ),
    [revisedChoices, selectedDimensions],
  );

  const initialScore = useMemo(
    () =>
      cases.filter((item) => item.initialBest.includes(initialChoices[item.id]))
        .length,
    [initialChoices],
  );

  const revisedScore = useMemo(
    () =>
      cases.filter((item) => item.revisedBest.includes(revisedChoices[item.id]))
        .length,
    [revisedChoices],
  );

  const dimensionScore = useMemo(
    () =>
      cases.filter((item) => {
        const selected = selectedDimensions[item.id] || [];
        if (item.expectedDimensions.length === 0) {
          return selected.length === 0;
        }
        return overlapCount(selected, item.expectedDimensions) >= 2;
      }).length,
    [selectedDimensions],
  );

  const rubricResults = useMemo(
    () =>
      rubricChecks.map((check) => ({
        ...check,
        passed: check.test({
          initialChoices,
          revisedChoices,
          selectedDimensions,
          note,
        }),
      })),
    [initialChoices, revisedChoices, selectedDimensions, note],
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
  const noteQuality = useMemo(
    () =>
      analyzeTextQuality(note, {
        minChars: 120,
        minWords: 20,
        requiredAny: ['escalate', 'pause', 'review', 'condition', 'before use'],
        requiredGroups: [
          {
            terms: ['escalate', 'pause', 'review', 'approval'],
            message: 'Name the escalation or review action.',
          },
          {
            terms: ['condition', 'only if', 'before use', 'proceed', 'safeguard'],
            message: 'Name what would make use acceptable to proceed.',
          },
          {
            terms: ['data', 'people', 'policy', 'consequence', 'verify'],
            message: 'Name the risk dimension driving the decision.',
          },
        ],
      }),
    [note],
  );
  const ready =
    revisedComplete &&
    revisedScore >= 4 &&
    dimensionScore >= 4 &&
    noteQuality.passed &&
    effectiveRubricScore >= 3;
  const completionRequirements = [
    {
      label: 'Classify all cases after the new context',
      met: revisedComplete,
    },
    {
      label: 'Match the stronger revised classification on at least four cases',
      met: revisedScore >= 4,
    },
    {
      label: 'Match risk dimensions on at least four cases',
      met: dimensionScore >= 4,
    },
    {
      label: 'Write an escalation note with a condition to proceed',
      met: noteQuality.passed,
    },
    {
      label: 'Meet at least three local self-checks, with one self-attested override allowed',
      met: effectiveRubricScore >= 3,
    },
  ];

  useEffect(() => {
    const draft = readDraft('07-risk-escalation');
    if (draft) {
      setInitialChoices(
        draft.initialChoices && typeof draft.initialChoices === 'object'
          ? draft.initialChoices
          : {},
      );
      setShowComplications(Boolean(draft.showComplications));
      setRevisedChoices(
        draft.revisedChoices && typeof draft.revisedChoices === 'object'
          ? draft.revisedChoices
          : {},
      );
      setSelectedDimensions(
        draft.selectedDimensions && typeof draft.selectedDimensions === 'object'
          ? draft.selectedDimensions
          : {},
      );
      setNote(typeof draft.note === 'string' ? draft.note : '');
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
      showComplications ||
      Object.keys(revisedChoices).length > 0 ||
      Object.keys(selectedDimensions).length > 0 ||
      Boolean(note.trim());

    if (!hasWork) {
      return;
    }

    const draft = saveDraft('07-risk-escalation', {
      initialChoices,
      showComplications,
      revisedChoices,
      selectedDimensions,
      note,
    });
    setDraftSavedAt(draft.updatedAt || draft.savedAt || null);
  }, [
    draftLoaded,
    initialChoices,
    showComplications,
    revisedChoices,
    selectedDimensions,
    note,
  ]);

  function chooseInitial(caseId, actionId) {
    setInitialChoices((current) => ({ ...current, [caseId]: actionId }));
  }

  function chooseRevised(caseId, actionId) {
    setRevisedChoices((current) => ({ ...current, [caseId]: actionId }));
  }

  function toggleDimension(caseId, dimensionId) {
    setSelectedDimensions((current) => {
      const existing = current[caseId] || [];
      const next = existing.includes(dimensionId)
        ? existing.filter((id) => id !== dimensionId)
        : [...existing, dimensionId];
      return { ...current, [caseId]: next };
    });
  }

  function toggleSelfMarked(checkId) {
    setSelfMarked((current) => ({ ...current, [checkId]: !current[checkId] }));
  }

  function revealDebrief() {
    setShowDebrief(true);
    clearDraft('07-risk-escalation');
    markModuleComplete('07-risk-escalation');
  }

  return (
    <section className="risk-lab" aria-labelledby="risk-lab-title">
      <div className="risk-lab__header">
        <div>
          <p className="risk-lab__eyebrow">Interactive Lab</p>
          <h2 id="risk-lab-title">The escalation fork</h2>
        </div>
        <div className="risk-lab__progress" aria-live="polite">
          {Object.keys(revisedChoices).length}/{cases.length}
        </div>
      </div>
      {draftSavedAt && !showDebrief && (
        <p className="local-draft-status">
          Draft saved locally in this browser.
        </p>
      )}

      <div className="risk-lab__scenario">
        <h3>Scenario</h3>
        <p>
          A department wants to adopt AI for several everyday workflows. Your
          job is not to approve or ban AI. Your job is to decide what each use
          would require before it proceeds.
        </p>
      </div>

      <div className="risk-lab__cases">
        {cases.map((item) => (
          <article className="risk-lab__case" key={item.id}>
            <h3>{item.title}</h3>
            <p>{item.initial}</p>

            <fieldset>
              <legend>First classification</legend>
              <div className="risk-lab__action-grid">
                {actions.map((action) => (
                  <button
                    aria-pressed={initialChoices[item.id] === action.id}
                    className={
                      initialChoices[item.id] === action.id ? 'is-selected' : ''
                    }
                    key={action.id}
                    onClick={() => chooseInitial(item.id, action.id)}
                    type="button"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </fieldset>

            {showComplications && (
              <>
                <div className="risk-lab__complication">
                  <h4>New context</h4>
                  <p>{item.complication}</p>
                </div>

                <fieldset>
                  <legend>Revised classification</legend>
                  <div className="risk-lab__action-grid">
                    {actions.map((action) => (
                      <button
                        aria-pressed={revisedChoices[item.id] === action.id}
                        className={
                          revisedChoices[item.id] === action.id
                            ? 'is-selected'
                            : ''
                        }
                        key={action.id}
                        onClick={() => chooseRevised(item.id, action.id)}
                        type="button"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <fieldset>
                  <legend>Risk dimensions driving your decision</legend>
                  <div className="risk-lab__dimension-grid">
                    {dimensions.map((dimension) => (
                      <button
                        aria-pressed={(
                          selectedDimensions[item.id] || []
                        ).includes(dimension.id)}
                        className={
                          (selectedDimensions[item.id] || []).includes(
                            dimension.id,
                          )
                            ? 'is-selected'
                            : ''
                        }
                        key={dimension.id}
                        onClick={() => toggleDimension(item.id, dimension.id)}
                        type="button"
                      >
                        {dimension.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </>
            )}
          </article>
        ))}
      </div>

      {!showComplications && (
        <button
          className="risk-lab__reveal"
          disabled={!initialComplete}
          onClick={() => setShowComplications(true)}
          type="button"
        >
          <GitBranch size={18} aria-hidden="true" />
          Reveal new context
        </button>
      )}

      {showComplications && (
        <>
          <label className="risk-lab__note">
            <span>
              Write a risk note for one use case: what triggers escalation, and
              what conditions would make it acceptable to proceed?
            </span>
            <textarea
              onChange={(event) => setNote(event.target.value)}
              placeholder="Example: This should pause until..."
              rows="5"
              value={note}
            />
            <small className={noteQuality.passed ? 'is-passed' : ''}>
              {textQualitySummary(noteQuality)}
            </small>
          </label>

          <div className="risk-lab__self-check">
            <div className="risk-lab__self-check-header">
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
            <p className="risk-lab__self-mark-count" aria-live="polite">
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
            className="risk-lab__reveal"
            disabled={!ready}
            onClick={revealDebrief}
            type="button"
          >
            <Eye size={18} aria-hidden="true" />
            Reveal escalation review
          </button>
        </>
      )}

      {showDebrief && (
        <div className="risk-lab__debrief">
          <h3>Escalation review</h3>
          <p>
            Your first-pass classifications matched {initialScore} of{' '}
            {cases.length} suggested calls. After new context, your revised
            classifications matched {revisedScore} of {cases.length}, and your
            risk dimensions matched {dimensionScore} of {cases.length}.
          </p>
          <div className="risk-lab__review-grid">
            {cases.map((item) => (
              <article className="risk-lab__review-card" key={item.id}>
                <h4>{item.title}</h4>
                <p>{item.debrief}</p>
              </article>
            ))}
          </div>
          <p className="risk-lab__principle">
            Risk classification is structured judgment. It is a decision about what
            responsible use would require here.
          </p>
          <p className="risk-lab__privacy">
            Your classifications and risk note stayed in this browser session.
            They were not submitted, stored, or sent to a server.
          </p>
        </div>
      )}
    </section>
  );
}
