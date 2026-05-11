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

const cases = [
  {
    id: 'customer-escalation',
    title: 'Customer Escalation',
    aiRecommendation:
      'Mark this escalation as low priority. The customer appears frustrated, but no direct financial impact is mentioned. Suggested response: acknowledge the concern and provide standard troubleshooting steps.',
    visible:
      'Customer says this is the third outage this month and their board meeting is tomorrow.',
    evidence:
      'Account tier: strategic renewal in 30 days. Prior ticket: same issue affected invoice processing. Internal note: workaround exists but requires product operations approval.',
    confidenceCue: 'AI label: routine issue, high confidence.',
    bestDecisions: ['escalate', 'more-info'],
    bestAuthority: ['no', 'unclear'],
    risk:
      'The visible summary understates consequence. Renewal timing, repeated outages, and approval-dependent workaround make a standard response weak review.',
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
      'Source notes match the AI summary. No sensitive personal, customer, financial, or policy-impacting details are included.',
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
      'The employee was covering urgent customer work during one meeting. The late update was caused by a reporting system outage. No manager has reviewed the context.',
    confidenceCue: 'AI label: pattern detected.',
    bestDecisions: ['reject', 'escalate', 'more-info'],
    bestAuthority: ['no', 'unclear'],
    risk:
      'The AI turns thin context into a personnel judgment. A reviewer should not approve that without role authority and fuller evidence.',
  },
  {
    id: 'public-faq',
    title: 'Public FAQ Draft',
    aiRecommendation:
      'Publish the FAQ. It explains the new feature in plain language and includes setup steps.',
    visible:
      'The FAQ is for a feature launching next week.',
    evidence:
      'Product notes show two setup limitations and one support caveat that the AI omitted. The feature name and launch date are approved for public use.',
    confidenceCue: 'AI label: polished communication draft.',
    bestDecisions: ['revise', 'more-info'],
    bestAuthority: ['yes', 'unclear'],
    risk:
      'The communication may be publishable after revision, but review must catch missing caveats before users rely on it.',
  },
];

const rubricChecks = [
  {
    id: 'opens-evidence',
    label: 'Checks source evidence before consequential approval',
    test: ({ openedEvidence, choices }) =>
      ['customer-escalation', 'policy-denial', 'performance-note'].every(
        (id) => openedEvidence[id] || choices[id] !== 'approve',
      ),
    why: 'Meaningful review requires evidence when the consequence is nontrivial.',
  },
  {
    id: 'does-not-rubber-stamp',
    label: 'Does not rubber-stamp the risky recommendations',
    test: ({ choices }) =>
      ['customer-escalation', 'policy-denial', 'performance-note'].every(
        (id) => choices[id] && choices[id] !== 'approve',
      ),
    why: 'A plausible AI recommendation is not enough when evidence is incomplete or stakes are high.',
  },
  {
    id: 'authority',
    label: 'Notices authority limits',
    test: ({ authority }) =>
      ['customer-escalation', 'policy-denial', 'performance-note'].every((id) =>
        ['no', 'unclear'].includes(authority[id]),
      ),
    why: 'A reviewer cannot own a decision they are not qualified or authorized to make.',
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
        passed: check.test({ openedEvidence, choices, authority, note }),
      })),
    [openedEvidence, choices, authority, note],
  );

  const rubricScore = rubricResults.filter((check) => check.passed).length;
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
    doesNotRubberStamp &&
    noticesAuthorityLimits &&
    noteQuality.passed &&
    effectiveRubricScore >= 3;
  const completionRequirements = [
    {
      label: 'Choose an action and authority check for every case',
      met: completedCases === cases.length,
    },
    {
      label: 'Avoid rubber-stamping the risky recommendations',
      met: Boolean(doesNotRubberStamp),
    },
    {
      label: 'Notice authority limits on high-stakes cases',
      met: Boolean(noticesAuthorityLimits),
    },
    {
      label: 'Write a review note with evidence, authority, and next steps',
      met: noteQuality.passed,
    },
    {
      label: 'Meet at least three local self-checks, with one self-attested override allowed',
      met: effectiveRubricScore >= 3,
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
      Boolean(note.trim());

    if (!hasWork) {
      return;
    }

    const draft = saveDraft('05-accountability-review', {
      choices,
      authority,
      openedEvidence,
      note,
    });
    setDraftSavedAt(draft.updatedAt || draft.savedAt || null);
  }, [draftLoaded, choices, authority, openedEvidence, note]);

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

      <div className="review-lab__self-check">
        <div className="review-lab__self-check-header">
          <h3>What your answer shows so far</h3>
          <span aria-live="polite">
            {rubricScore}/{rubricChecks.length} checks
          </span>
        </div>
        <p>
          This section shows what the page can detect in your answer so far.
          The risky recommendations must not be rubber-stamped, and authority
          limits must be noticed before the module can complete.
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
