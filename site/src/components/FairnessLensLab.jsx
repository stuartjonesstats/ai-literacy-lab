import { CheckCircle2, Eye, GitBranch } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  clearDraft,
  markModuleComplete,
  readDraft,
  saveDraft,
} from '../lib/progress.js';
import { analyzeTextQuality, textQualitySummary } from '../lib/textQuality.js';
import './fairness-lens-lab.css';

const decisions = [
  { id: 'approve', label: 'Approve as starting point' },
  { id: 'revise', label: 'Revise before use' },
  { id: 'reject', label: 'Reject and redesign' },
  { id: 'review', label: 'Request fairness review' },
];

const concernTypes = [
  { id: 'visibility', label: 'Rewards visibility' },
  { id: 'schedule', label: 'Rewards schedule flexibility' },
  { id: 'manager', label: 'Depends on manager access' },
  { id: 'communication', label: 'Narrow communication norm' },
  { id: 'unclear', label: 'Unclear evidence standard' },
];

const criteria = [
  {
    id: 'optional-meetings',
    text: 'Consistently visible participation in optional meetings and committees.',
    context:
      'Optional meetings are usually held after standard work hours. Shift workers and caregivers participate less often even when their core work is strong.',
    expectedConcerns: ['visibility', 'schedule'],
    safer:
      'Evidence of contribution to team outcomes, including meeting participation, project work, documentation, mentoring, operational support, or other role-relevant contributions.',
  },
  {
    id: 'executive-writing',
    text: 'Strong written communication in executive-facing updates.',
    context:
      'Some departments rarely send executive-facing updates. Several employees communicate impact through technical notes, direct customer support, or operational handoffs.',
    expectedConcerns: ['visibility', 'communication', 'unclear'],
    safer:
      'Clear communication appropriate to the role, audience, and work context, evaluated using examples from multiple communication channels.',
  },
  {
    id: 'stretch-assignments',
    text: 'Availability for stretch assignments on short notice.',
    context:
      'Short-notice assignments tend to go to people with flexible schedules and managers who know about the opportunity early.',
    expectedConcerns: ['schedule', 'manager'],
    safer:
      'Interest and readiness for growth opportunities, with reasonable notice and transparent access to assignments.',
  },
  {
    id: 'manager-nomination',
    text: 'Positive manager nomination.',
    context:
      'Nomination rates vary widely by department. Some managers nominate frequently; others rarely nominate anyone.',
    expectedConcerns: ['manager', 'unclear'],
    safer:
      'Structured evidence from managers plus at least one additional source, using common criteria and documented rationale.',
  },
  {
    id: 'group-confidence',
    text: 'Demonstrated confidence in group discussion.',
    context:
      'Some high-performing employees contribute through written analysis, one-on-one coaching, or quiet technical leadership rather than assertive group discussion.',
    expectedConcerns: ['communication', 'visibility'],
    safer:
      'Evidence of leadership behaviors such as judgment, collaboration, follow-through, support for others, and problem-solving across different interaction styles.',
  },
];

const rubricChecks = [
  {
    id: 'spots-proxies',
    label: 'Identifies proxy criteria',
    test: ({ selectedConcerns }) =>
      ['optional-meetings', 'stretch-assignments', 'manager-nomination'].every(
        (id) => (selectedConcerns[id] || []).length > 0,
      ),
    why: 'Visibility, availability, and manager nomination can proxy for access rather than potential.',
  },
  {
    id: 'context-shift',
    label: 'Calibrates decision after context appears',
    test: ({ firstDecision, revisedDecision }) =>
      firstDecision &&
      revisedDecision &&
      (firstDecision !== revisedDecision ||
        ['revise', 'reject', 'review'].includes(firstDecision)),
    why: 'A fairness lens should respond to context, including recognizing when the initial caution was already warranted.',
  },
  {
    id: 'multiple-concerns',
    label: 'Uses more than one fairness lens',
    test: ({ selectedConcerns }) =>
      new Set(Object.values(selectedConcerns).flat()).size >= 4,
    why: 'Fairness concerns are not one-dimensional. Access, visibility, schedule, and evidence standards can interact.',
  },
  {
    id: 'rewrites-criteria',
    label: 'Rewrites criteria around evidence and job-relevant contribution',
    test: ({ rewrite }) =>
      rewrite.trim().length > 100 &&
      includesAny(rewrite, ['evidence', 'contribution', 'outcomes', 'criteria']) &&
      includesAny(rewrite, ['multiple', 'structured', 'documented', 'transparent', 'role']),
    why: 'A stronger revision names what evidence counts and reduces reliance on informal access.',
  },
  {
    id: 'process-check',
    label: 'Adds a process check, not just better wording',
    test: ({ rewrite }) =>
      includesAny(rewrite, ['review', 'check', 'monitor', 'compare', 'audit', 'document']),
    why: 'Fairness is partly a process problem. Better criteria still need review and documentation.',
  },
];

function includesAny(text, terms) {
  const normalized = text.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

function overlapCount(left, right) {
  return left.filter((item) => right.includes(item)).length;
}

export default function FairnessLensLab() {
  const [firstDecision, setFirstDecision] = useState('');
  const [showContext, setShowContext] = useState(false);
  const [revisedDecision, setRevisedDecision] = useState('');
  const [selectedConcerns, setSelectedConcerns] = useState({});
  const [rewrite, setRewrite] = useState('');
  const [selfMarked, setSelfMarked] = useState({});
  const [showDebrief, setShowDebrief] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState(null);

  const concernComplete = useMemo(
    () => criteria.every((item) => (selectedConcerns[item.id] || []).length > 0),
    [selectedConcerns],
  );

  const concernScore = useMemo(
    () =>
      criteria.filter(
        (item) =>
          overlapCount(
            selectedConcerns[item.id] || [],
            item.expectedConcerns,
          ) >= Math.min(2, item.expectedConcerns.length),
      ).length,
    [selectedConcerns],
  );

  const rubricResults = useMemo(
    () =>
      rubricChecks.map((check) => ({
        ...check,
        passed: check.test({
          firstDecision,
          revisedDecision,
          selectedConcerns,
          rewrite,
        }),
      })),
    [firstDecision, revisedDecision, selectedConcerns, rewrite],
  );

  const rubricScore = rubricResults.filter((check) => check.passed).length;
  const selfMarkedScore = rubricResults.filter((check) => selfMarked[check.id])
    .length;
  const rewriteQuality = useMemo(
    () =>
      analyzeTextQuality(rewrite, {
        minChars: 150,
        minWords: 24,
        requiredAny: ['evidence', 'criteria', 'role', 'review', 'documented'],
        requiredGroups: [
          {
            terms: ['evidence', 'documented', 'criteria', 'examples'],
            message: 'Name the evidence standard.',
          },
          {
            terms: ['role', 'job', 'work', 'outcomes', 'contribution'],
            message: 'Tie the criteria to role-relevant contribution.',
          },
          {
            terms: ['review', 'monitor', 'compare', 'audit', 'document'],
            message: 'Add a process check beyond better wording.',
          },
        ],
      }),
    [rewrite],
  );

  const ready =
    showContext &&
    revisedDecision &&
    concernComplete &&
    concernScore >= 4 &&
    rewriteQuality.passed &&
    rubricScore >= 3;
  const completionRequirements = [
    {
      label: 'Make an initial decision',
      met: Boolean(firstDecision),
    },
    {
      label: 'Reveal the context',
      met: showContext,
    },
    {
      label: 'Make a revised decision',
      met: Boolean(revisedDecision),
    },
    {
      label: 'Select concerns for every criterion',
      met: concernComplete,
    },
    {
      label: 'Identify the stronger concern pattern on at least four criteria',
      met: concernScore >= 4,
    },
    {
      label: 'Write evidence-based revised criteria',
      met: rewriteQuality.passed,
    },
    {
      label: 'Meet at least three local self-checks',
      met: rubricScore >= 3,
    },
  ];

  useEffect(() => {
    const draft = readDraft('04-bias-fairness-harm');
    if (draft) {
      setFirstDecision(
        typeof draft.firstDecision === 'string' ? draft.firstDecision : '',
      );
      setShowContext(Boolean(draft.showContext));
      setRevisedDecision(
        typeof draft.revisedDecision === 'string' ? draft.revisedDecision : '',
      );
      setSelectedConcerns(
        draft.selectedConcerns && typeof draft.selectedConcerns === 'object'
          ? draft.selectedConcerns
          : {},
      );
      setRewrite(typeof draft.rewrite === 'string' ? draft.rewrite : '');
      setDraftSavedAt(draft.updatedAt || draft.savedAt || null);
    }
    setDraftLoaded(true);
  }, []);

  useEffect(() => {
    if (!draftLoaded) {
      return;
    }

    const hasWork =
      Boolean(firstDecision) ||
      showContext ||
      Boolean(revisedDecision) ||
      Object.keys(selectedConcerns).length > 0 ||
      Boolean(rewrite.trim());

    if (!hasWork) {
      return;
    }

    const draft = saveDraft('04-bias-fairness-harm', {
      firstDecision,
      showContext,
      revisedDecision,
      selectedConcerns,
      rewrite,
    });
    setDraftSavedAt(draft.updatedAt || draft.savedAt || null);
  }, [
    draftLoaded,
    firstDecision,
    showContext,
    revisedDecision,
    selectedConcerns,
    rewrite,
  ]);

  function toggleConcern(criteriaId, concernId) {
    setSelectedConcerns((current) => {
      const existing = current[criteriaId] || [];
      const next = existing.includes(concernId)
        ? existing.filter((id) => id !== concernId)
        : [...existing, concernId];
      return { ...current, [criteriaId]: next };
    });
  }

  function toggleSelfMarked(checkId) {
    setSelfMarked((current) => ({ ...current, [checkId]: !current[checkId] }));
  }

  function revealDebrief() {
    setShowDebrief(true);
    clearDraft('04-bias-fairness-harm');
    markModuleComplete('04-bias-fairness-harm');
  }

  return (
    <section className="fairness-lab" aria-labelledby="fairness-lab-title">
      <div className="fairness-lab__header">
        <div>
          <p className="fairness-lab__eyebrow">Interactive Lab</p>
          <h2 id="fairness-lab-title">The bias lens shift</h2>
        </div>
        <div className="fairness-lab__progress" aria-live="polite">
          {Object.keys(selectedConcerns).length}/{criteria.length}
        </div>
      </div>
      {draftSavedAt && !showDebrief && (
        <p className="local-draft-status">
          Draft saved locally in this browser.
        </p>
      )}

      <div className="fairness-lab__scenario">
        <h3>Scenario</h3>
        <p>
          A team asks AI to draft selection criteria for a limited professional
          development program. The output looks neutral and organized. Your job
          is to decide whether it gives people a realistic and fair opportunity
          to demonstrate potential.
        </p>
      </div>

      <div className="fairness-lab__criteria">
        <h3>AI-generated criteria</h3>
        <ol>
          {criteria.map((item) => (
            <li key={item.id}>{item.text}</li>
          ))}
        </ol>
      </div>

      <fieldset className="fairness-lab__fieldset">
        <legend>First decision</legend>
        <div className="fairness-lab__decision-grid">
          {decisions.map((decision) => (
            <button
              aria-pressed={firstDecision === decision.id}
              className={firstDecision === decision.id ? 'is-selected' : ''}
              key={decision.id}
              onClick={() => setFirstDecision(decision.id)}
              type="button"
            >
              {decision.label}
            </button>
          ))}
        </div>
      </fieldset>

      {!showContext && (
        <button
          className="fairness-lab__reveal"
          disabled={!firstDecision}
          onClick={() => setShowContext(true)}
          type="button"
        >
          <GitBranch size={18} aria-hidden="true" />
          Reveal context
        </button>
      )}

      {showContext && (
        <>
          <div className="fairness-lab__context-list">
            {criteria.map((item) => (
              <article className="fairness-lab__context-card" key={item.id}>
                <h3>{item.text}</h3>
                <p>{item.context}</p>
                <fieldset>
                  <legend>What concerns does this raise?</legend>
                  <div className="fairness-lab__concern-grid">
                    {concernTypes.map((concern) => (
                      <button
                        aria-pressed={(
                          selectedConcerns[item.id] || []
                        ).includes(concern.id)}
                        className={
                          (selectedConcerns[item.id] || []).includes(concern.id)
                            ? 'is-selected'
                            : ''
                        }
                        key={concern.id}
                        onClick={() => toggleConcern(item.id, concern.id)}
                        type="button"
                      >
                        {concern.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </article>
            ))}
          </div>

          <fieldset className="fairness-lab__fieldset">
            <legend>Revised decision</legend>
            <div className="fairness-lab__decision-grid">
              {decisions.map((decision) => (
                <button
                  aria-pressed={revisedDecision === decision.id}
                  className={revisedDecision === decision.id ? 'is-selected' : ''}
                  key={decision.id}
                  onClick={() => setRevisedDecision(decision.id)}
                  type="button"
                >
                  {decision.label}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="fairness-lab__rewrite">
            <span>
              Rewrite the criteria so they are evidence-based, role-relevant,
              and less dependent on informal access.
            </span>
            <textarea
              onChange={(event) => setRewrite(event.target.value)}
              placeholder="Example: Selection should consider documented evidence of contribution..."
              rows="6"
              value={rewrite}
            />
            <small className={rewriteQuality.passed ? 'is-passed' : ''}>
              {textQualitySummary(rewriteQuality)}
            </small>
          </label>

          <div className="fairness-lab__self-check">
            <div className="fairness-lab__self-check-header">
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
            <p className="fairness-lab__self-mark-count" aria-live="polite">
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
            className="fairness-lab__reveal"
            disabled={!ready}
            onClick={revealDebrief}
            type="button"
          >
            <Eye size={18} aria-hidden="true" />
            Reveal fairness review
          </button>
        </>
      )}

      {showDebrief && (
        <div className="fairness-lab__debrief">
          <h3>Fairness review</h3>
          <p>
            Your concern labels matched {concernScore} of {criteria.length}
            criteria. The deeper lesson is that neutral wording can still reward
            unequal access to visibility, schedule flexibility, manager
            sponsorship, or dominant communication norms.
          </p>
          <div className="fairness-lab__review-grid">
            {criteria.map((item) => (
              <article className="fairness-lab__review-card" key={item.id}>
                <h4>{item.text}</h4>
                <p>
                  <strong>Safer direction:</strong> {item.safer}
                </p>
              </article>
            ))}
          </div>
          <p className="fairness-lab__principle">
            A fairness lens asks who has a realistic opportunity to satisfy the
            criteria, not only whether the wording sounds neutral.
          </p>
          <p className="fairness-lab__privacy">
            Your decisions and rewritten criteria stayed in this browser
            session. They were not submitted, stored, or sent to a server.
          </p>
        </div>
      )}
    </section>
  );
}
