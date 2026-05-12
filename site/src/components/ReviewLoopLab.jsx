import {
  CheckCircle2,
  Eye,
  FileSearch,
  Gauge,
  ShieldAlert,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  clearDraft,
  markModuleComplete,
  readDraft,
  saveDraft,
} from '../lib/progress.js';
import { analyzeTextQuality, textQualitySummary } from '../lib/textQuality.js';
import './review-loop-lab.css';

const decisions = [
  { id: 'approve', label: 'Approve' },
  { id: 'revise', label: 'Revise' },
  { id: 'reject', label: 'Reject' },
  { id: 'escalate', label: 'Escalate' },
  { id: 'more-info', label: 'Request more info' },
];

const authorityOptions = [
  { id: 'yes', label: 'I can approve this' },
  { id: 'no', label: 'Someone else must approve' },
  { id: 'unclear', label: 'Authority is unclear' },
];

const meaningfulReviewCriteria = [
  'The reviewer can inspect the evidence behind the recommendation.',
  'The reviewer has enough authority to approve, revise, reject, or escalate.',
  'The review step has a real action path, not just a ceremonial checkbox.',
  'Uncertainty and missing context are documented before the output moves on.',
];

const consequentialCaseIds = [
  'benefits-renewal',
  'policy-denial',
  'performance-note',
  'public-guidance',
];

const cases = [
  {
    id: 'benefits-renewal',
    title: 'Benefits Renewal Notice',
    aiRecommendation:
      'Send the denial notice and close the renewal as incomplete. The file lacks current income verification, so the office can use the standard nonresponse language.',
    visible:
      'The applicant uploaded pay stubs, but one required page is blank. Benefits expire in five days.',
    evidence:
      'Case record: two pay stubs arrived before the deadline. System note: upload portal failed for some users that day. Procedure excerpt: staff must request the missing page before termination when the record shows a timely but incomplete upload. Reviewer role: may draft language, not approve denial.',
    confidenceCue: 'AI label: policy match, high confidence.',
    bestDecisions: ['revise', 'escalate', 'more-info'],
    bestAuthority: ['no', 'unclear'],
    risk:
      'The visible summary invites a pattern match, but the record changes the decision. Meaningful review requires inspecting the case record, procedure, and authority limit before any notice goes out.',
  },
  {
    id: 'policy-denial',
    title: 'Policy Denial Draft',
    aiRecommendation:
      'Deny the request. The policy does not appear to allow exceptions. Use the attached denial language.',
    visible:
      'Request summary says the person missed the deadline and asks for reconsideration.',
    evidence:
      'Policy excerpt includes a documented exception process for late requests when there is a system access issue. The request mentions a failed login attempt but the AI summary omitted it.',
    confidenceCue: 'AI label: policy match found.',
    bestDecisions: ['revise', 'escalate', 'more-info'],
    bestAuthority: ['no', 'unclear'],
    risk:
      'The recommendation is plausible but incomplete. Meaningful review requires checking the policy excerpt and omitted exception evidence.',
  },
  {
    id: 'routine-summary',
    title: 'Routine Meeting Summary',
    aiRecommendation:
      'Send this summary of a planning meeting. It lists decisions, open questions, and owners.',
    visible:
      'The meeting covered office supply ordering, a documentation cleanup, and next week agenda items.',
    evidence:
      'Source notes match the AI summary. No sensitive personal, resident, financial, or policy-impacting details are included.',
    confidenceCue: 'AI label: low-risk draft.',
    bestDecisions: ['approve', 'revise'],
    bestAuthority: ['yes'],
    risk:
      'This is a lower-consequence use. Ordinary review can be meaningful if the reviewer checks that the summary matches the notes.',
  },
  {
    id: 'performance-note',
    title: 'Performance Note',
    aiRecommendation:
      'Send the manager a concise performance concern note. The employee appears disengaged and may need corrective coaching.',
    visible:
      'The employee missed two optional meetings and submitted a late status update.',
    evidence:
      'The employee was covering urgent resident intake during one meeting. The late update was caused by a reporting system outage. No manager has reviewed the context.',
    confidenceCue: 'AI label: pattern detected.',
    bestDecisions: ['reject', 'escalate', 'more-info'],
    bestAuthority: ['no', 'unclear'],
    risk:
      'The AI turns thin context into a personnel judgment. A reviewer should not approve that without role authority and fuller evidence.',
  },
  {
    id: 'public-guidance',
    title: 'Public Guidance Update',
    aiRecommendation:
      'Publish the updated public guidance. It explains eligibility changes in plain language and includes a clear effective date.',
    visible:
      'The page is for a regulated office and will be used by applicants, advocates, and field staff.',
    evidence:
      'Source bulletin says the old threshold remains in effect until the director signs the implementation memo. Legal review is pending. Accessibility checklist flags that the draft omits a phone alternative for people who cannot use the web form.',
    confidenceCue: 'AI label: ready-to-publish draft.',
    bestDecisions: ['revise', 'escalate', 'more-info'],
    bestAuthority: ['no', 'unclear'],
    risk:
      'The draft may be useful, but public guidance from a regulated office needs source authority, accessibility review, and final approval before publication.',
  },
];

const judgmentChallenge = {
  title: 'Judgment Challenge',
  prompt:
    'You are the afternoon reviewer for 30 AI-drafted notices. Several evidence panels fail, the policy owner is unavailable, and the manager says delays will hurt team metrics. Before you answer, choose the workplace factors you would carry into the decision.',
  facets: [
    {
      id: 'evidence-access',
      label: 'Can I inspect the record?',
    },
    {
      id: 'authority-to-pause',
      label: 'Can I pause or route affected files?',
    },
    {
      id: 'person-impact',
      label: 'Could the notice affect benefits or rights?',
    },
    {
      id: 'metric-pressure',
      label: 'Is the metric pressure changing the review?',
    },
    {
      id: 'documentation',
      label: 'What will the review note preserve?',
    },
  ],
  question: 'Now choose the review path you would take for the affected notices.',
  options: [
    {
      id: 'approve-pressure',
      label: 'Approve the batch and note that AI was confident',
      feedback:
        'This may protect today\'s metric, but it leaves the reviewer unable to explain the affected files when records and authority are missing.',
    },
    {
      id: 'spot-check',
      label: 'Spot-check a few files, then approve the rest',
      feedback:
        'Spot-checking can be useful for routine quality control. Here, it still leaves individual notices moving without their own evidence check.',
    },
    {
      id: 'pause-escalate',
      label: 'Pause affected notices and escalate the evidence and authority gaps',
      feedback:
        'This keeps the reviewer accountable to the record: pause the affected files, document the gap, and route the authority question instead of clearing around it.',
    },
  ],
  bestOptions: ['pause-escalate'],
};

const rubricChecks = [
  {
    id: 'opens-evidence-broadly',
    label: 'Inspects source evidence across the case set',
    test: ({ openedEvidence }) =>
      cases.filter((item) => openedEvidence[item.id]).length >= 4,
    why: 'The lab is about reviewing records, not recognizing the title of a risky case.',
  },
  {
    id: 'opens-evidence',
    label: 'Checks source evidence before consequential approval',
    test: ({ openedEvidence, choices }) =>
      consequentialCaseIds.every(
        (id) => openedEvidence[id] || choices[id] !== 'approve',
      ),
    why: 'Meaningful review requires evidence when the consequence is nontrivial.',
  },
  {
    id: 'does-not-rubber-stamp',
    label: 'Does not rubber-stamp the risky recommendations',
    test: ({ choices }) =>
      consequentialCaseIds.every(
        (id) => choices[id] && choices[id] !== 'approve',
      ),
    why: 'A plausible AI recommendation is not enough when evidence is incomplete or stakes are high.',
  },
  {
    id: 'authority',
    label: 'Notices authority limits',
    test: ({ authority }) =>
      consequentialCaseIds.every((id) =>
        ['no', 'unclear'].includes(authority[id]),
      ),
    why: 'A reviewer cannot own a decision they are not qualified or authorized to make.',
  },
  {
    id: 'pressure-challenge',
    label: 'Recognizes when pressure makes review non-meaningful',
    test: ({ challengeChoice }) =>
      judgmentChallenge.bestOptions.includes(challengeChoice),
    why: 'Time pressure and manager pressure do not replace evidence, authority, or escalation rights.',
  },
  {
    id: 'routine-proportionality',
    label: 'Keeps low-risk review proportional',
    test: ({ choices }) =>
      ['approve', 'revise'].includes(choices['routine-summary']),
    why: 'Not every AI-assisted draft needs escalation. Controls should match consequence.',
  },
  {
    id: 'documents-uncertainty',
    label: 'Documents uncertainty in the review note',
    test: ({ note }) =>
      note.trim().length > 70 &&
      includesAny(note, [
        'evidence',
        'source',
        'record',
        'unclear',
        'missing',
        'verify',
        'confirm',
        'review',
      ]) &&
      includesAny(note, [
        'next step',
        'escalate',
        'revise',
        'request',
        'check',
        'send to',
        'ask',
        'manager',
      ]),
    why: 'A strong review note explains what is known, what is missing, and what should happen next.',
  },
];

function includesAny(text, terms) {
  const normalized = text.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

export default function ReviewLoopLab() {
  const [choices, setChoices] = useState({});
  const [authority, setAuthority] = useState({});
  const [openedEvidence, setOpenedEvidence] = useState({});
  const [challengeFacets, setChallengeFacets] = useState([]);
  const [challengeChoice, setChallengeChoice] = useState('');
  const [note, setNote] = useState('');
  const [selfMarked, setSelfMarked] = useState({});
  const [showDebrief, setShowDebrief] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState(null);

  const completedCases = useMemo(
    () =>
      cases.filter((item) => choices[item.id] && authority[item.id]).length,
    [choices, authority],
  );

  const decisionScore = useMemo(
    () =>
      cases.filter((item) => item.bestDecisions.includes(choices[item.id]))
        .length,
    [choices],
  );

  const authorityScore = useMemo(
    () =>
      cases.filter((item) => item.bestAuthority.includes(authority[item.id]))
        .length,
    [authority],
  );

  const rubricResults = useMemo(
    () =>
      rubricChecks.map((check) => ({
        ...check,
        passed: check.test({
          openedEvidence,
          choices,
          authority,
          challengeChoice,
          note,
        }),
      })),
    [openedEvidence, choices, authority, challengeChoice, note],
  );

  const rubricScore = rubricResults.filter((check) => check.passed).length;
  const inspectedEvidenceCount = cases.filter(
    (item) => openedEvidence[item.id],
  ).length;
  const challengePassed = judgmentChallenge.bestOptions.includes(
    challengeChoice,
  );
  const challengeFacetsComplete = challengeFacets.length >= 2;
  const doesNotRubberStamp = rubricResults.find(
    (check) => check.id === 'does-not-rubber-stamp',
  )?.passed;
  const noticesAuthorityLimits = rubricResults.find(
    (check) => check.id === 'authority',
  )?.passed;
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
        minChars: 100,
        minWords: 16,
        requiredAny: ['evidence', 'authority', 'unclear', 'escalate', 'verify'],
        requiredGroups: [
          {
            terms: ['evidence', 'missing', 'source', 'record', 'verify'],
            message: 'Name what evidence is known or missing.',
          },
          {
            terms: ['authority', 'owner', 'approve', 'reviewer', 'authorized'],
            message: 'Name the authority or ownership issue.',
          },
          {
            terms: ['next step', 'escalate', 'revise', 'request', 'check'],
            message: 'Name the next action.',
          },
        ],
      }),
    [note],
  );
  const ready =
    completedCases === cases.length &&
    inspectedEvidenceCount >= 4 &&
    challengeFacetsComplete &&
    challengePassed &&
    effectiveRubricScore >= reviewCheckThreshold &&
    noteQuality.passed;
  const completionRequirements = [
    {
      label: 'Choose an action and authority check for every case',
      met: completedCases === cases.length,
    },
    {
      label: 'Open source evidence for at least four cases',
      met: inspectedEvidenceCount >= 4,
    },
    {
      label: 'Choose at least two Before You Act factors for the judgment challenge',
      met: challengeFacetsComplete,
    },
    {
      label: 'Choose a review path that keeps pressure from replacing authority',
      met: challengePassed,
    },
    {
      label: `Show at least ${reviewCheckThreshold} review checks, including up to one learner-marked override`,
      met: effectiveRubricScore >= reviewCheckThreshold,
    },
    {
      label: 'Write a review note with evidence, authority, and next steps',
      met: noteQuality.passed,
    },
  ];

  useEffect(() => {
    const draft = readDraft('05-accountability-review');
    if (draft) {
      setChoices(
        draft.choices && typeof draft.choices === 'object' ? draft.choices : {},
      );
      setAuthority(
        draft.authority && typeof draft.authority === 'object'
          ? draft.authority
          : {},
      );
      setOpenedEvidence(
        draft.openedEvidence && typeof draft.openedEvidence === 'object'
          ? draft.openedEvidence
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
      Object.keys(choices).length > 0 ||
      Object.keys(authority).length > 0 ||
      Object.keys(openedEvidence).length > 0 ||
      challengeFacets.length > 0 ||
      Boolean(challengeChoice) ||
      Boolean(note.trim());

    if (!hasWork) {
      return;
    }

    const draft = saveDraft('05-accountability-review', {
      choices,
      authority,
      openedEvidence,
      challengeFacets,
      challengeChoice,
      note,
    });
    setDraftSavedAt(draft.updatedAt || draft.savedAt || null);
  }, [
    draftLoaded,
    choices,
    authority,
    openedEvidence,
    challengeFacets,
    challengeChoice,
    note,
  ]);

  function choose(caseId, decisionId) {
    setChoices((current) => ({ ...current, [caseId]: decisionId }));
  }

  function chooseAuthority(caseId, authorityId) {
    setAuthority((current) => ({ ...current, [caseId]: authorityId }));
  }

  function toggleEvidence(caseId) {
    setOpenedEvidence((current) => ({
      ...current,
      [caseId]: !current[caseId],
    }));
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
    clearDraft('05-accountability-review');
    markModuleComplete('05-accountability-review');
  }

  return (
    <section className="review-lab" aria-labelledby="review-lab-title">
      <div className="review-lab__header">
        <div>
          <p className="review-lab__eyebrow">Interactive Lab</p>
          <h2 id="review-lab-title">The review that was not</h2>
        </div>
        <div className="review-lab__progress" aria-live="polite">
          {completedCases}/{cases.length}
        </div>
      </div>
      {draftSavedAt && !showDebrief && (
        <p className="local-draft-status">
          Draft saved locally in this browser.
        </p>
      )}

      <div className="review-lab__scenario">
        <h3>Scenario</h3>
        <p>
          You are asked to do a quick human check on AI-assisted
          recommendations before they go to a team lead. The interface nudges
          speed. Your job is to decide whether review is actually meaningful.
        </p>
      </div>

      <div className="review-lab__criteria">
        <h3>Meaningful review means the human can interrupt the loop</h3>
        <ul>
          {meaningfulReviewCriteria.map((criterion) => (
            <li key={criterion}>{criterion}</li>
          ))}
        </ul>
      </div>

      <div className="review-lab__cases">
        {cases.map((item) => (
          <article className="review-lab__case" key={item.id}>
            <div className="review-lab__case-head">
              <h3>{item.title}</h3>
              <span>
                <Gauge size={16} aria-hidden="true" />
                {item.confidenceCue}
              </span>
            </div>

            <div className="review-lab__recommendation">
              <h4>AI recommendation</h4>
              <p>{item.aiRecommendation}</p>
            </div>

            <div className="review-lab__visible">
              <h4>Visible note</h4>
              <p>{item.visible}</p>
            </div>

            <button
              className="review-lab__evidence-toggle"
              onClick={() => toggleEvidence(item.id)}
              type="button"
            >
              <FileSearch size={17} aria-hidden="true" />
              {openedEvidence[item.id] ? 'Hide evidence' : 'Open evidence'}
            </button>

            {openedEvidence[item.id] && (
              <div className="review-lab__evidence">
                <h4>Source evidence</h4>
                <p>{item.evidence}</p>
              </div>
            )}

            <fieldset>
              <legend>Review action</legend>
              <div className="review-lab__button-grid">
                {decisions.map((decision) => (
                  <button
                    aria-pressed={choices[item.id] === decision.id}
                    className={
                      choices[item.id] === decision.id ? 'is-selected' : ''
                    }
                    key={decision.id}
                    onClick={() => choose(item.id, decision.id)}
                    type="button"
                  >
                    {decision.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend>Authority check</legend>
              <div className="review-lab__authority-grid">
                {authorityOptions.map((option) => (
                  <button
                    aria-pressed={authority[item.id] === option.id}
                    className={
                      authority[item.id] === option.id ? 'is-selected' : ''
                    }
                    key={option.id}
                    onClick={() => chooseAuthority(item.id, option.id)}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>
          </article>
        ))}
      </div>

      <label className="review-lab__note">
        <span>
          Write one review note that documents uncertainty, evidence, and next
          steps for a case you would not simply approve.
        </span>
        <textarea
          onChange={(event) => setNote(event.target.value)}
          placeholder="Example: The recommendation should not be approved yet because..."
          rows="5"
          value={note}
        />
        <small className={noteQuality.passed ? 'is-passed' : ''}>
          {textQualitySummary(noteQuality)}
        </small>
      </label>

      <div className="review-lab__challenge">
        <div className="review-lab__challenge-head">
          <ShieldAlert size={20} aria-hidden="true" />
          <div>
            <h3>{judgmentChallenge.title}</h3>
            <p>{judgmentChallenge.prompt}</p>
          </div>
        </div>
        <div className="review-lab__before-act">
          <div>
            <h4>Before You Act</h4>
            <span aria-live="polite">{challengeFacets.length} selected</span>
          </div>
          <div className="review-lab__facet-grid">
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
        <p className="review-lab__challenge-question">
          {judgmentChallenge.question}
        </p>
        <div className="review-lab__challenge-grid">
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
          <p className="review-lab__challenge-feedback">
            {
              judgmentChallenge.options.find(
                (option) => option.id === challengeChoice,
              )?.feedback
            }
          </p>
        )}
      </div>

      <div className="review-lab__self-check">
        <div className="review-lab__self-check-header">
          <h3>What your answer shows so far</h3>
          <span aria-live="polite">
            {effectiveRubricScore}/{rubricChecks.length} usable checks
          </span>
        </div>
        <p>
          This section shows what the page can detect in your answer so far.
          At least {reviewCheckThreshold} checks are needed before the review
          opens. You may manually mark one missed check when your answer is
          defensible. Risky recommendations still must not be rubber-stamped,
          and authority limits still matter.
        </p>
        <p className="review-lab__self-mark-count" aria-live="polite">
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
        className="review-lab__reveal"
        disabled={!ready}
        onClick={revealDebrief}
        type="button"
      >
        <Eye size={18} aria-hidden="true" />
        Reveal review quality
      </button>

      {showDebrief && (
        <div className="review-lab__debrief">
          <h3>Review quality</h3>
          <p>
            You matched {decisionScore} of {cases.length} recommended review
            actions and {authorityScore} of {cases.length} authority checks. The
            deeper question is whether your review could actually interrupt a
            bad recommendation.
          </p>
          <div className="review-lab__review-grid">
            {cases.map((item) => (
              <article className="review-lab__review-card" key={item.id}>
                <h4>{item.title}</h4>
                <p>{item.risk}</p>
              </article>
            ))}
          </div>
          <p className="review-lab__principle">
            A human-in-the-loop is not a safeguard unless the human can actually
            interrupt the loop.
          </p>
          <p className="review-lab__privacy">
            Your choices and review note stayed in this browser session. They
            were not submitted, stored, or sent to a server.
          </p>
        </div>
      )}
    </section>
  );
}
