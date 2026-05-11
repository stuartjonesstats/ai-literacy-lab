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
  'I did not see a clear path to promotion.',
  'Pay was better elsewhere.',
  'My manager was supportive, but the workload was too high.',
  'I wanted remote flexibility.',
  'I was underpaid compared with market.',
  'No advancement opportunities.',
  'Burnout.',
  'Accepted a higher-paying role.',
];

const claims = [
  {
    id: 'growth-main',
    text: 'The main reason people are leaving appears to be lack of career growth.',
    answer: 'overstated',
    feedback:
      'Career growth appears in two notes, but the sample is too small and uncoded to rank it as the main reason.',
  },
  {
    id: 'comp-secondary',
    text: 'Compensation concerns were mentioned, but they seem secondary.',
    answer: 'overstated',
    feedback:
      'Compensation appears in three notes. Calling it secondary is not supported by the packet.',
  },
  {
    id: 'mentorship',
    text: 'The company should prioritize mentorship, internal mobility, and manager training.',
    answer: 'unsupported',
    feedback:
      'Internal mobility is connected to the evidence. Mentorship and manager training may be reasonable ideas, but they are not shown by these notes.',
  },
  {
    id: 'avoid-salary',
    text: 'The company should avoid broad salary adjustments.',
    answer: 'unsupported',
    feedback:
      'The packet does not contain compensation analysis, market benchmarking, budget context, or enough cases to justify this recommendation.',
  },
  {
    id: 'improve-retention',
    text: 'This approach is likely to improve retention.',
    answer: 'unsupported',
    feedback:
      'This is a prediction. The evidence packet does not show whether the proposed actions would improve retention.',
  },
];

const options = [
  { id: 'supported', label: 'Directly supported', icon: CheckCircle2 },
  { id: 'overstated', label: 'Overstated', icon: AlertTriangle },
  { id: 'unsupported', label: 'Unsupported', icon: CircleHelp },
];

const betterSummary =
  'In this small sample of exit notes, employees mention several possible retention factors, including career growth, compensation, workload, flexibility, and burnout. Career growth and compensation both appear more than once, but the sample is too limited to rank causes confidently. A responsible next step would be to review a larger set of exit data, code themes consistently, and compare patterns across teams or roles before choosing interventions.';

const rubricChecks = [
  {
    id: 'sample-caution',
    label: 'Names the evidence limit',
    test: (text) =>
      includesAny(text, ['small sample', 'limited sample', 'sample is limited', 'eight', '8']) &&
      includesAny(text, ['limited', 'not enough', 'cannot', 'too small', 'caution']),
    why: 'A safer rewrite should not treat eight notes as enough to rank causes confidently.',
  },
  {
    id: 'multiple-factors',
    label: 'Keeps multiple factors visible',
    test: (text) =>
      countMatches(text, [
        'career',
        'growth',
        'compensation',
        'pay',
        'workload',
        'flexibility',
        'burnout',
      ]) >= 3,
    why: 'The evidence packet contains more than one plausible retention factor.',
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
        'unnecessary',
      ]),
    why: 'The packet does not justify ranking causes or dismissing compensation.',
  },
  {
    id: 'verification-step',
    label: 'Proposes a verification next step',
    test: (text) =>
      includesAny(text, [
        'review',
        'larger set',
        'more data',
        'code themes',
        'analyze',
        'compare',
        'verify',
      ]),
    why: 'A strong rewrite points to what evidence would be needed before acting.',
  },
  {
    id: 'separates-observation',
    label: 'Separates observation from recommendation',
    test: (text) =>
      includesAny(text, ['mention', 'appear', 'suggest', 'may', 'possible']) &&
      !includesAny(text, ['should prioritize', 'should avoid', 'will improve']),
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
  const rewriteQuality = useMemo(
    () =>
      analyzeTextQuality(rewrite, {
        minChars: 130,
        minWords: 22,
        requiredAny: ['sample', 'evidence', 'limited', 'review', 'data'],
        requiredGroups: [
          {
            terms: ['small sample', 'limited', 'eight', '8', 'not enough'],
            message: 'Name the evidence limit.',
          },
          {
            terms: ['review', 'more data', 'larger set', 'code themes', 'compare'],
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
  const confidenceRevised =
    revisedConfidence !== null &&
    (revisedConfidence < confidence ||
      (confidence <= 2 && revisedConfidence <= confidence));
  const ready =
    firstMove &&
    evidenceVisible &&
    confidenceRevised &&
    completedClaims === claims.length &&
    correctCount >= 3 &&
    rewriteQuality.passed &&
    rubricScore >= 3;
  const completionRequirements = [
    {
      label: 'Choose a first move before seeing the evidence',
      met: Boolean(firstMove),
    },
    {
      label: 'Reveal the evidence packet',
      met: evidenceVisible,
    },
    {
      label: 'Revise or justify low confidence after seeing evidence',
      met: confidenceRevised,
    },
    {
      label: 'Classify all five claims',
      met: completedClaims === claims.length,
    },
    {
      label: 'Match at least three claim checks to the evidence',
      met: correctCount >= 3,
    },
    {
      label: 'Write an evidence-aligned rewrite',
      met: rewriteQuality.passed,
    },
    {
      label: 'Meet at least three local self-checks',
      met: rubricScore >= 3,
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
          You are preparing a short internal summary for a team meeting. A
          colleague used AI to generate the draft below and says, "Looks good to
          me. Can you send it?"
        </p>
      </div>

      <div className="confidence-trap__draft">
        <h3>AI-generated draft</h3>
        <p>
          Based on recent employee feedback, the main reason people are leaving
          appears to be lack of career growth. Compensation concerns were
          mentioned, but they seem secondary. The company should prioritize
          mentorship, internal mobility, and manager training rather than broad
          salary adjustments. This approach is likely to improve retention while
          avoiding unnecessary cost increases.
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
          Reveal evidence packet
        </button>
      ) : (
        <>
          <div className="confidence-trap__evidence">
            <h3>Evidence packet</h3>
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
              Classify each claim before revealing the debrief. At least three
              claim checks need to match the evidence, and your confidence
              should adjust when the evidence is weaker than the draft sounds.
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
          </div>
        </>
      )}

      {evidenceVisible && (
        <>
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
              role authorization.
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
