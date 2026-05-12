import {
  AlertTriangle,
  CheckCircle2,
  CircleHelp,
  Eye,
  ListChecks,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  clearDraft,
  markModuleComplete,
  readDraft,
  saveDraft,
} from '../lib/progress.js';
import { analyzeTextQuality, textQualitySummary } from '../lib/textQuality.js';
import './confidence-trap.css';

const evidenceNotes = [
  'Quarterly grant report was submitted nine days late after the state portal was unavailable for two business days.',
  'Subrecipient uploaded receipts, but the reviewer could not access the folder until permissions were corrected.',
  'One site visit found missing receipt documentation for a small equipment purchase.',
  'Allowable-cost guidance changed midway through the quarter.',
  'A small program office had a staff vacancy during the reporting window.',
  'Two reports were submitted on time after an approved extension.',
  'A vendor invoice arrived late and was recorded after the initial review.',
  'Training attendance logs were complete, but one log was dated after submission.',
];

const claims = [
  {
    id: 'late-reporting-main',
    text: 'Late reporting is the main compliance risk in this grant file.',
    answer: 'overstated',
    feedback:
      'Late reporting appears, but the evidence notes also show portal access issues, documentation gaps, guidance changes, staffing constraints, and approved extensions.',
  },
  {
    id: 'subrecipient-cause',
    text: 'Most of the delays appear caused by poor subrecipient documentation.',
    answer: 'overstated',
    feedback:
      'The evidence notes mention one documentation issue and one folder-access problem. They do not support assigning most delays to subrecipient documentation.',
  },
  {
    id: 'withhold-reimbursements',
    text: 'The agency should withhold reimbursements until the subrecipient completes compliance retraining.',
    answer: 'unsupported',
    feedback:
      'The evidence notes do not establish a sanction threshold, reimbursement rule, corrective-action requirement, or accountable approval path.',
  },
  {
    id: 'portal-issues',
    text: 'Portal access and permissions issues may have contributed to some reporting problems.',
    answer: 'supported',
    feedback:
      'The evidence directly mentions a portal outage and a folder-permission problem.',
  },
  {
    id: 'training-priority',
    text: 'Compliance training should be the primary corrective action.',
    answer: 'unsupported',
    feedback:
      'Training might be useful, but the evidence notes point to mixed causes and do not show training as the primary fix.',
  },
];

const options = [
  { id: 'supported', label: 'Directly supported', icon: CheckCircle2 },
  { id: 'overstated', label: 'Overstated', icon: AlertTriangle },
  { id: 'unsupported', label: 'Unsupported', icon: CircleHelp },
];

const betterSummary =
  'This grant file shows a mixed set of possible compliance issues, including late reporting, portal access problems, documentation gaps, changing guidance, staffing constraints, and timing questions. The evidence is too limited to rank causes or recommend sanctions. A responsible next step would be to verify the applicable grant rules, review the source records with the accountable program owner, separate technical access issues from documentation gaps, and document any corrective action before acting on reimbursements.';

const rubricChecks = [
  {
    id: 'sample-caution',
    label: 'Names the evidence limit',
    test: (text) =>
      includesAny(text, [
        'limited',
        'evidence',
        'file',
        'small set',
        'not enough',
        'eight',
        '8',
      ]) &&
      includesAny(text, ['limited', 'not enough', 'cannot', 'can’t', 'caution', 'verify']),
    why: 'A safer rewrite should not treat a short set of evidence notes as enough to rank causes confidently.',
  },
  {
    id: 'multiple-factors',
    label: 'Keeps multiple factors visible',
    test: (text) =>
      countMatches(text, [
        'late',
        'portal',
        'access',
        'documentation',
        'guidance',
        'staff',
        'invoice',
        'extension',
      ]) >= 3,
    why: 'The evidence notes contain more than one plausible compliance factor.',
  },
  {
    id: 'avoids-ranking',
    label: 'Avoids unsupported ranking or causality',
    test: (text) =>
      !includesAny(text, [
        'main reason',
        'primary reason',
        'the cause',
        'clearly caused',
        'secondary',
        'must withhold',
        'withhold reimbursement',
      ]),
    why: 'The evidence notes do not justify ranking causes or jumping to a sanction.',
  },
  {
    id: 'verification-step',
    label: 'Proposes a verification next step',
    test: (text) =>
      includesAny(text, [
        'review',
        'larger set',
        'more data',
        'additional data',
        'collect',
        'code themes',
        'analyze',
        'compare',
        'verify',
        'validate',
        'program owner',
        'grant rules',
      ]),
    why: 'A strong rewrite points to what evidence would be needed before acting.',
  },
  {
    id: 'separates-observation',
    label: 'Separates observation from recommendation',
    test: (text) =>
      includesAny(text, ['mention', 'appear', 'suggest', 'may', 'possible']) &&
      !includesAny(text, ['should withhold', 'must withhold', 'primary corrective']),
    why: 'The draft should report what the notes show without jumping straight to a confident intervention.',
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

export default function ConfidenceTrap() {
  const [firstMove, setFirstMove] = useState('');
  const [confidence, setConfidence] = useState(3);
  const [evidenceVisible, setEvidenceVisible] = useState(false);
  const [revisedConfidence, setRevisedConfidence] = useState(null);
  const [classifications, setClassifications] = useState({});
  const [calibrationNote, setCalibrationNote] = useState('');
  const [rewrite, setRewrite] = useState('');
  const [selfMarked, setSelfMarked] = useState({});
  const [showDebrief, setShowDebrief] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState(null);

  const completedClaims = useMemo(
    () => claims.filter((claim) => classifications[claim.id]).length,
    [classifications],
  );

  const correctCount = useMemo(
    () =>
      claims.filter((claim) => classifications[claim.id] === claim.answer)
        .length,
    [classifications],
  );

  const rubricResults = useMemo(
    () =>
      rubricChecks.map((check) => ({
        ...check,
        passed: check.test(rewrite),
      })),
    [rewrite],
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
  const rewriteQuality = useMemo(
    () =>
      analyzeTextQuality(rewrite, {
        minChars: 130,
        minWords: 22,
        requiredAny: ['evidence', 'limited', 'review', 'verify', 'rules'],
        requiredGroups: [
          {
            terms: ['limited', 'evidence', 'not enough', 'short', 'file'],
            message: 'Name the evidence limit.',
          },
          {
            terms: ['review', 'verify', 'rules', 'source records', 'program owner', 'compare'],
            message: 'Name a verification or next-evidence step.',
          },
          {
            terms: ['may', 'possible', 'appears', 'mentions', 'suggests'],
            message: 'Use cautious language instead of unsupported certainty.',
          },
        ],
      }),
    [rewrite],
  );
  const calibrationQuality = useMemo(
    () =>
      analyzeTextQuality(calibrationNote, {
        minChars: 90,
        minWords: 15,
      }),
    [calibrationNote],
  );
  const confidenceRevised = revisedConfidence !== null;
  const ready =
    firstMove &&
    evidenceVisible &&
    confidenceRevised &&
    completedClaims === claims.length &&
    calibrationQuality.passed &&
    rewriteQuality.passed;
  const completionRequirements = [
    {
      label: 'Choose a first move before seeing the evidence',
      met: Boolean(firstMove),
    },
    {
      label: 'Reveal the evidence notes',
      met: evidenceVisible,
    },
    {
      label: 'Re-rate confidence after seeing evidence',
      met: confidenceRevised,
    },
    {
      label: 'Classify all five claims',
      met: completedClaims === claims.length,
    },
    {
      label: 'Explain what changed after inspecting the evidence',
      met: calibrationQuality.passed,
    },
    {
      label: 'Write an evidence-aligned rewrite',
      met: rewriteQuality.passed,
    },
  ];

  useEffect(() => {
    const draft = readDraft('02-confidently-wrong');
    if (draft) {
      setFirstMove(typeof draft.firstMove === 'string' ? draft.firstMove : '');
      setConfidence(typeof draft.confidence === 'number' ? draft.confidence : 3);
      setEvidenceVisible(Boolean(draft.evidenceVisible));
      setRevisedConfidence(
        typeof draft.revisedConfidence === 'number'
          ? draft.revisedConfidence
          : null,
      );
      setClassifications(
        draft.classifications && typeof draft.classifications === 'object'
          ? draft.classifications
          : {},
      );
      setCalibrationNote(
        typeof draft.calibrationNote === 'string' ? draft.calibrationNote : '',
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
      Boolean(firstMove) ||
      confidence !== 3 ||
      evidenceVisible ||
      revisedConfidence !== null ||
      Object.keys(classifications).length > 0 ||
      Boolean(calibrationNote.trim()) ||
      Boolean(rewrite.trim());

    if (!hasWork) {
      return;
    }

    const draft = saveDraft('02-confidently-wrong', {
      firstMove,
      confidence,
      evidenceVisible,
      revisedConfidence,
      classifications,
      calibrationNote,
      rewrite,
    });
    setDraftSavedAt(draft.updatedAt || draft.savedAt || null);
  }, [
    draftLoaded,
    firstMove,
    confidence,
    evidenceVisible,
    revisedConfidence,
    classifications,
    calibrationNote,
    rewrite,
  ]);

  function classify(claimId, optionId) {
    setClassifications((current) => ({ ...current, [claimId]: optionId }));
  }

  function toggleSelfMarked(checkId) {
    setSelfMarked((current) => ({ ...current, [checkId]: !current[checkId] }));
  }

  function revealDebrief() {
    setShowDebrief(true);
    clearDraft('02-confidently-wrong');
    markModuleComplete('02-confidently-wrong');
  }

  return (
    <section className="confidence-trap" aria-labelledby="confidence-title">
      <div className="confidence-trap__header">
        <div>
          <p className="confidence-trap__eyebrow">Interactive Lab</p>
          <h2 id="confidence-title">The confidence trap</h2>
        </div>
        <div className="confidence-trap__progress" aria-live="polite">
          {completedClaims}/{claims.length}
        </div>
      </div>
      {draftSavedAt && !showDebrief && (
        <p className="local-draft-status">
          Draft saved locally in this browser.
        </p>
      )}

      <div className="confidence-trap__scenario">
        <h3>Scenario</h3>
        <p>
          You are preparing a short briefing for a grant compliance meeting. A
          colleague used AI to generate the draft below and says, "Looks good to
          me. Can you send it to the program director?"
        </p>
      </div>

      <div className="confidence-trap__draft">
        <h3>AI-generated draft</h3>
        <p>
          Late reporting is the main compliance risk in this grant file. Most
          delays appear caused by poor subrecipient documentation. The agency
          should withhold reimbursements until the subrecipient completes
          compliance retraining. This approach will reduce repeat findings and
          show strong fiscal oversight.
        </p>
      </div>

      <fieldset className="confidence-trap__fieldset">
        <legend>First move</legend>
        <div className="confidence-trap__choice-grid">
          {['Send as-is', 'Revise first', 'Reject it', 'Ask for more data'].map(
            (choice) => (
              <button
                aria-pressed={firstMove === choice}
                className={firstMove === choice ? 'is-selected' : ''}
                key={choice}
                onClick={() => setFirstMove(choice)}
                type="button"
              >
                {choice}
              </button>
            ),
          )}
        </div>
      </fieldset>

      <label className="confidence-trap__slider">
        <span>Before seeing the evidence, how supported does the draft feel?</span>
        <input
          max="5"
          min="1"
          onChange={(event) => setConfidence(Number(event.target.value))}
          type="range"
          value={confidence}
        />
        <strong>{confidence}/5</strong>
      </label>

      {!evidenceVisible ? (
        <button
          className="confidence-trap__reveal"
          disabled={!firstMove}
          onClick={() => setEvidenceVisible(true)}
          type="button"
        >
          <Eye size={18} aria-hidden="true" />
          Reveal evidence notes
        </button>
      ) : (
        <>
          <div className="confidence-trap__evidence">
            <h3>Evidence notes</h3>
            <ol>
              {evidenceNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ol>
          </div>

          <label className="confidence-trap__slider">
            <span>After seeing the evidence, how supported does the draft feel?</span>
            <input
              max="5"
              min="1"
              onChange={(event) => setRevisedConfidence(Number(event.target.value))}
              type="range"
              value={revisedConfidence ?? confidence}
            />
            <strong>{revisedConfidence ?? confidence}/5</strong>
          </label>

          <div className="confidence-trap__claims">
            <h3>Claim check</h3>
            <p>
              Classify each claim, then compare your classifications with the
              evidence feedback. The point is to inspect how confidence is built,
              not to guess a hidden password.
            </p>
            {claims.map((claim) => (
              <article className="confidence-trap__claim" key={claim.id}>
                <p>{claim.text}</p>
                <div className="confidence-trap__buttons">
                  {options.map(({ id, label, icon: Icon }) => (
                    <button
                      aria-pressed={classifications[claim.id] === id}
                      className={
                        classifications[claim.id] === id ? 'is-selected' : ''
                      }
                      key={id}
                      onClick={() => classify(claim.id, id)}
                      type="button"
                    >
                      <Icon size={17} aria-hidden="true" />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </article>
            ))}
            {completedClaims === claims.length && (
              <div className="confidence-trap__claim-feedback">
                <h3>Evidence feedback</h3>
                <ul>
                  {claims.map((claim) => (
                    <li key={claim.id}>
                      <strong>{claim.text}</strong>
                      <span>
                        Your label: {classifications[claim.id]}. Stronger label:
                        {' '}{claim.answer}. {claim.feedback}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}

      {evidenceVisible && (
        <>
          <label className="confidence-trap__rewrite">
            <span>What changed after you inspected the evidence?</span>
            <textarea
              onChange={(event) => setCalibrationNote(event.target.value)}
              placeholder="Name one claim that became weaker, stronger, or more uncertain once you saw the evidence."
              rows="4"
              value={calibrationNote}
            />
            <small className={calibrationQuality.passed ? 'is-passed' : ''}>
              {textQualitySummary(calibrationQuality)}
            </small>
          </label>

          <label className="confidence-trap__rewrite">
            <span>Rewrite the summary so it is useful, cautious, and evidence-aligned.</span>
            <textarea
              onChange={(event) => setRewrite(event.target.value)}
              placeholder="Draft a safer version before revealing the debrief."
              rows="5"
              value={rewrite}
            />
            <small className={rewriteQuality.passed ? 'is-passed' : ''}>
              {textQualitySummary(rewriteQuality)}
            </small>
          </label>

          <div className="confidence-trap__self-check">
            <div className="confidence-trap__self-check-header">
              <h3>What your answer shows so far</h3>
              <span aria-live="polite">
                {rubricScore}/{rubricChecks.length} checks
              </span>
            </div>
            <p>
              This section shows what the page can detect in your answer so far.
              It supports reflection; it does not verify policy compliance or
              role authorization. It is advisory and does not block the debrief.
            </p>
            <p className="confidence-trap__self-mark-count" aria-live="polite">
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
            className="confidence-trap__reveal"
            disabled={!ready}
            onClick={revealDebrief}
            type="button"
          >
            <Eye size={18} aria-hidden="true" />
            Reveal debrief
          </button>
        </>
      )}

      {showDebrief && (
        <div className="confidence-trap__debrief">
          <h3>Debrief</h3>
          <p>
            You marked {correctCount} of {claims.length} claims the same way an
            expert reviewer would. The exact score matters less than the habit:
            break polished output into claims, then ask what evidence each claim
            has earned.
          </p>
          <ul>
            {claims.map((claim) => (
              <li key={claim.id}>
                <strong>{claim.text}</strong> {claim.feedback}
              </li>
            ))}
          </ul>
          <h3>Evidence-aligned rewrite</h3>
          <p>{betterSummary}</p>
          <p className="confidence-trap__principle">
            Portable heuristic: before trusting an AI answer, ask what you would
            need to see for each important claim to be true.
          </p>
          <p className="confidence-trap__privacy">
            <ListChecks size={18} aria-hidden="true" />
            Your rewrite was checked locally in this page. It was not submitted,
            stored, or sent to a server.
          </p>
        </div>
      )}
    </section>
  );
}
