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
    tradeoff:
      'Ordinary drafting may be fine only if the source notes are narrowed before use.',
    debrief:
      'The task sounds low-risk, but the data changed. A routine drafting task becomes a data-boundary problem when unannounced staffing details appear.',
  },
  {
    id: 'public-records',
    title: 'Public Records Requests',
    initial:
      'Use AI to summarize incoming public records requests and route each one to the likely records owner.',
    complication:
      'Some requests include legally required response deadlines, exemption questions, personal information, and language from requesters that the AI labels as low value.',
    initialBest: ['modify', 'pause'],
    revisedBest: ['pause', 'escalate'],
    expectedDimensions: ['data', 'policy', 'consequence', 'verification'],
    tradeoff:
      'Routing help may be useful, but missing a deadline or mishandling exempt records is not a normal summarization error.',
    debrief:
      'Public records work has deadlines, disclosure rules, exemptions, and auditability needs. AI may assist intake only with clear records-owner review and policy controls.',
  },
  {
    id: 'benefits-queue',
    title: 'Benefits Queue Prioritization',
    initial:
      'Use AI to prioritize which public benefits renewal files staff should process first during a backlog.',
    complication:
      'The AI cannot see accommodation flags, pending appeal deadlines, eviction risk notes, or recent uploads from the document portal.',
    initialBest: ['pause', 'escalate'],
    revisedBest: ['escalate'],
    expectedDimensions: ['consequence', 'people', 'verification', 'policy'],
    tradeoff:
      'Backlog triage is real, but delay can become a benefits or housing harm before anyone can correct the ranking.',
    debrief:
      'This is not just sorting work. It can affect who waits for benefits, whose documents are noticed, and whether harm happens before a human can verify the queue.',
  },
  {
    id: 'regulated-denial',
    title: 'Regulated Denial Draft',
    initial:
      'Use AI to draft plain-language denial notices for applications that staff mark as ineligible.',
    complication:
      'Some denials require appeal-rights language, citations to the governing rule, and review by a staff member with delegated authority.',
    initialBest: ['modify', 'pause', 'escalate'],
    revisedBest: ['pause', 'escalate'],
    expectedDimensions: ['consequence', 'people', 'policy', 'verification'],
    tradeoff:
      'Plain language can improve access, but a notice that lacks rule authority or appeal information can mislead the person affected.',
    debrief:
      'AI may help with readability after a human decision is made. It should not supply the authority, rationale, or appeal rights for a regulated denial.',
  },
  {
    id: 'grant-screening',
    title: 'Grant Screening',
    initial:
      'Use AI to screen grant applications for completeness before reviewers score them.',
    complication:
      'The prompt includes past award history, applicant organization size, and a suggestion to flag applications from unfamiliar vendors for extra scrutiny.',
    initialBest: ['modify', 'pause', 'escalate'],
    revisedBest: ['pause', 'escalate'],
    expectedDimensions: ['consequence', 'people', 'policy', 'verification'],
    tradeoff:
      'Completeness checks may be lower risk than scoring, but procurement and grant criteria must be consistent, published, and reviewable.',
    debrief:
      'Grant and procurement workflows need consistent criteria, conflict checks, and records that explain why an application moved forward or did not.',
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
    tradeoff:
      'This can proceed because the prompt and output do not affect access, eligibility, confidential data, or official decisions.',
    debrief:
      'This is a useful proportionality check. Some uses are genuinely low risk when data, stakes, and downstream effects are limited.',
  },
];

const judgmentChallenge = {
  title: 'Judgment Challenge',
  prompt:
    'You are in a records office planning meeting. The proposal is to use AI to route requests and draft first responses. It may save hours, but the request stream includes exemptions, deadlines, personal details, and uneven request quality. Before you answer, choose the factors you would put on the table.',
  facets: [
    {
      id: 'deadline-exemption',
      label: 'Deadline and exemption exposure',
    },
    {
      id: 'narrow-role',
      label: 'Narrow AI to intake support',
    },
    {
      id: 'records-owner-review',
      label: 'Records-owner review before response',
    },
    {
      id: 'requester-impact',
      label: 'Requester impact if wrong',
    },
    {
      id: 'routine-volume',
      label: 'Routine volume that still needs speed',
    },
    {
      id: 'policy-open',
      label: 'Unresolved policy questions',
    },
  ],
  question: 'Now choose the next step you would recommend in the meeting.',
  options: [
    {
      id: 'proceed',
      label: 'Proceed because routing is administrative',
      feedback:
        'Routing can look administrative, but this version also drafts first responses where deadlines, disclosure, and exemptions matter.',
    },
    {
      id: 'modify',
      label: 'Modify: limit AI to intake tags with human records-owner review',
      feedback:
        'This preserves the speed benefit while narrowing the AI role and keeping official response judgment with a records owner.',
    },
    {
      id: 'pause',
      label: 'Pause all AI use until every records policy question is solved',
      feedback:
        'A pause can be justified when policy is unsettled. For this meeting, a narrower intake-only use can also control the main risk without losing the whole benefit.',
    },
    {
      id: 'escalate',
      label: 'Escalate every request before using any AI support',
      feedback:
        'Escalation is important for exceptions and ambiguous requests. Escalating every routine intake item may be disproportionate once the AI role is narrowed.',
    },
  ],
  bestOptions: ['modify', 'pause'],
};

const rubricChecks = [
  {
    id: 'revises-after-context',
    label: 'Calibrates risk after new context appears',
    test: ({ revisedChoices }) =>
      [
        'public-records',
        'benefits-queue',
        'regulated-denial',
        'grant-screening',
      ].every((id) =>
        ['pause', 'escalate'].includes(revisedChoices[id]),
      ) && ['modify', 'pause'].includes(revisedChoices.agenda),
    why: 'Risk classification should respond to context, including recognizing when initial caution remains warranted.',
  },
  {
    id: 'escalates-people-impact',
    label: 'Escalates or pauses people-impacting uses',
    test: ({ revisedChoices }) =>
      ['benefits-queue', 'regulated-denial', 'grant-screening'].every((id) =>
        ['pause', 'escalate'].includes(revisedChoices[id]),
      ),
    why: 'Uses that affect access, denial, selection, or delay need stronger review.',
  },
  {
    id: 'keeps-use-narrow',
    label: 'Chooses a narrow path when modify beats guessing',
    test: ({ challengeChoice }) =>
      judgmentChallenge.bestOptions.includes(challengeChoice),
    why: 'Borderline cases often need a narrower allowed use, not a blanket yes or no.',
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
  const [challengeFacets, setChallengeFacets] = useState([]);
  const [challengeChoice, setChallengeChoice] = useState('');
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
          challengeChoice,
          note,
        }),
      })),
    [
      initialChoices,
      revisedChoices,
      selectedDimensions,
      challengeChoice,
      note,
    ],
  );

  const rubricScore = rubricResults.filter((check) => check.passed).length;
  const challengePassed = judgmentChallenge.bestOptions.includes(
    challengeChoice,
  );
  const challengeFacetsComplete = challengeFacets.length >= 2;
  const selfMarkedScore = rubricResults.filter((check) => selfMarked[check.id])
    .length;
  const effectiveRubricScore =
    rubricScore +
    Math.min(
      rubricResults.filter((check) => !check.passed && selfMarked[check.id])
        .length,
      1,
    );
  const reviewCheckThreshold = Math.ceil(rubricChecks.length / 2);
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
    challengeFacetsComplete &&
    challengePassed &&
    effectiveRubricScore >= reviewCheckThreshold &&
    noteQuality.passed;
  const completionRequirements = [
    {
      label: 'Classify all cases after the new context',
      met: revisedComplete,
    },
    {
      label: 'Choose at least two Before You Act factors for the judgment challenge',
      met: challengeFacetsComplete,
    },
    {
      label: 'Choose a proportional control for the records-office scenario',
      met: challengePassed,
    },
    {
      label: `Show at least ${reviewCheckThreshold} review checks, including up to one learner-marked override`,
      met: effectiveRubricScore >= reviewCheckThreshold,
    },
    {
      label: 'Write an escalation note with a condition to proceed',
      met: noteQuality.passed,
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
      setChallengeFacets(
        Array.isArray(draft.challengeFacets) ? draft.challengeFacets : [],
      );
      setChallengeChoice(
        typeof draft.challengeChoice === 'string' ? draft.challengeChoice : '',
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
      challengeFacets.length > 0 ||
      Boolean(challengeChoice) ||
      Boolean(note.trim());

    if (!hasWork) {
      return;
    }

    const draft = saveDraft('07-risk-escalation', {
      initialChoices,
      showComplications,
      revisedChoices,
      selectedDimensions,
      challengeFacets,
      challengeChoice,
      note,
    });
    setDraftSavedAt(draft.updatedAt || draft.savedAt || null);
  }, [
    draftLoaded,
    initialChoices,
    showComplications,
    revisedChoices,
    selectedDimensions,
    challengeFacets,
    challengeChoice,
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

  function toggleChallengeFacet(facetId) {
    setChallengeFacets((current) => {
      if (current.includes(facetId)) {
        return current.filter((id) => id !== facetId);
      }

      if (current.length >= 3) {
        return [...current.slice(1), facetId];
      }

      return [...current, facetId];
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
        <p>
          More than one first-pass answer can be defensible. Use the revised
          classification to name the control: proceed, narrow the use, pause for
          expert review, or escalate before use.
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

                <div className="risk-lab__tradeoff">
                  <h4>Tradeoff to resolve</h4>
                  <p>{item.tradeoff}</p>
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

          <div className="risk-lab__challenge">
            <div className="risk-lab__challenge-head">
              <GitBranch size={20} aria-hidden="true" />
              <div>
                <h3>{judgmentChallenge.title}</h3>
                <p>{judgmentChallenge.prompt}</p>
              </div>
            </div>
            <div className="risk-lab__before-act">
              <div>
                <h4>Before You Act</h4>
                <span aria-live="polite">{challengeFacets.length} selected</span>
              </div>
              <div className="risk-lab__facet-grid">
                {judgmentChallenge.facets.map((facet) => (
                  <button
                    aria-pressed={challengeFacets.includes(facet.id)}
                    className={
                      challengeFacets.includes(facet.id) ? 'is-selected' : ''
                    }
                    key={facet.id}
                    onClick={() => toggleChallengeFacet(facet.id)}
                    type="button"
                  >
                    {facet.label}
                  </button>
                ))}
              </div>
            </div>
            <p className="risk-lab__challenge-question">
              {judgmentChallenge.question}
            </p>
            <div className="risk-lab__challenge-grid">
              {judgmentChallenge.options.map((option) => (
                <button
                  aria-pressed={challengeChoice === option.id}
                  className={challengeChoice === option.id ? 'is-selected' : ''}
                  disabled={!challengeFacetsComplete}
                  key={option.id}
                  onClick={() => setChallengeChoice(option.id)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
            {challengeChoice && (
              <p className="risk-lab__challenge-feedback">
                {
                  judgmentChallenge.options.find(
                    (option) => option.id === challengeChoice,
                  )?.feedback
                }
              </p>
            )}
          </div>

          <div className="risk-lab__self-check">
            <div className="risk-lab__self-check-header">
              <h3>What your answer shows so far</h3>
              <span aria-live="polite">
                {effectiveRubricScore}/{rubricChecks.length} usable checks
              </span>
            </div>
            <p>
              This section shows what the page can detect in your answer so far.
              At least {reviewCheckThreshold} checks are needed before the
              review opens. You may manually mark one missed check when your
              answer is defensible. This still does not verify correctness,
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
