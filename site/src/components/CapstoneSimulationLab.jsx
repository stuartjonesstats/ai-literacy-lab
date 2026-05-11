import { CheckCircle2, Eye, FileText } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  clearDraft,
  markModuleComplete,
  readDraft,
  saveArtifact,
  saveDraft,
} from '../lib/progress.js';
import { analyzeTextQuality, textQualitySummary } from '../lib/textQuality.js';
import './capstone-simulation-lab.css';

const assistTasks = [
  {
    id: 'themes',
    label: 'Summarize recurring themes',
    kind: 'assist',
  },
  {
    id: 'questions',
    label: 'List questions that need human follow-up',
    kind: 'assist',
  },
  {
    id: 'draft',
    label: 'Draft intervention options for review',
    kind: 'assist',
  },
  {
    id: 'urgent',
    label: 'Flag possible urgent cases for human triage',
    kind: 'assist-with-review',
  },
  {
    id: 'deprioritize',
    label: 'Automatically deprioritize low-detail messages',
    kind: 'do-not-delegate',
  },
  {
    id: 'notify',
    label: 'Send customer follow-up messages automatically',
    kind: 'do-not-delegate',
  },
];

const claimChecks = [
  {
    id: 'theme',
    claim: 'Billing confusion and account access delays appear in the packet.',
    answer: 'supported',
    why: 'The sample records include both themes, so this is a reasonable bounded claim.',
  },
  {
    id: 'percent',
    claim: 'Billing confusion caused 42% of complaints this month.',
    answer: 'unsupported',
    why: 'The packet is a small sample and does not provide a validated monthly percentage.',
  },
  {
    id: 'ranking',
    claim: 'The top three dissatisfaction causes are now known.',
    answer: 'overstated',
    why: 'The sample can suggest themes, but it is not enough to rank causes for the whole backlog.',
  },
  {
    id: 'short',
    claim: 'Short or informal messages are probably lower priority.',
    answer: 'unsupported',
    why: 'Message length and tone are weak proxies. A short message can still involve urgent harm.',
  },
];

const claimOptions = [
  { id: 'supported', label: 'Supported' },
  { id: 'overstated', label: 'Overstated' },
  { id: 'unsupported', label: 'Unsupported' },
];

const dataControls = [
  {
    id: 'remove-identifiers',
    label: 'Remove direct identifiers before prompting',
    good: true,
  },
  {
    id: 'abstract-account',
    label: 'Abstract account details into needed categories',
    good: true,
  },
  {
    id: 'approved-space',
    label: 'Use only an approved workspace or tool',
    good: true,
  },
  {
    id: 'separate-urgent',
    label: 'Separate urgent cases from general theme analysis',
    good: true,
  },
  {
    id: 'paste-all',
    label: 'Paste the raw backlog so context is not lost',
    good: false,
  },
];

const harmChecks = [
  {
    id: 'short-message',
    label: 'Short messages may hide urgent needs',
  },
  {
    id: 'language',
    label: 'Tone, grammar, or language may distort priority',
  },
  {
    id: 'accessibility',
    label: 'Customers with access barriers may provide less detail',
  },
  {
    id: 'history',
    label: 'The model may miss account history or previous failed fixes',
  },
];

const reviewControls = [
  {
    id: 'owner',
    label: 'Name a human owner for the final decision',
  },
  {
    id: 'override',
    label: 'Give reviewers authority to override AI flags',
  },
  {
    id: 'sample-audit',
    label: 'Audit a sample of outputs against records',
  },
  {
    id: 'sources',
    label: 'Keep evidence links or record IDs for review',
  },
  {
    id: 'trigger',
    label: 'Define escalation triggers before launch',
  },
];

const finalActions = [
  {
    id: 'proceed',
    label: 'Proceed as proposed',
  },
  {
    id: 'pilot',
    label: 'Pilot with safeguards',
  },
  {
    id: 'pause',
    label: 'Pause until controls exist',
  },
  {
    id: 'escalate',
    label: 'Escalate for formal review',
  },
];

const decisionFields = [
  {
    id: 'recommendation',
    label: 'Recommendation',
    prompt: 'What should the organization do next?',
    placeholder: 'Pilot with safeguards, pause until controls exist, or escalate...',
  },
  {
    id: 'allowedUse',
    label: 'Allowed AI role',
    prompt: 'What may AI help with, and what must it not decide?',
    placeholder: 'AI may summarize themes and draft options; it must not deprioritize customers...',
  },
  {
    id: 'dataBoundary',
    label: 'Data boundary',
    prompt: 'What data must be removed, minimized, or kept in an approved environment?',
    placeholder: 'Remove identifiers, abstract account details, and use an approved workspace...',
  },
  {
    id: 'verification',
    label: 'Verification plan',
    prompt: 'What claims or outputs must be checked against source records?',
    placeholder: 'Verify percentages, urgency flags, account history, and intervention claims...',
  },
  {
    id: 'review',
    label: 'Human review owner',
    prompt: 'Who can inspect, override, stop, or approve the workflow?',
    placeholder: 'Support operations owner reviews flagged cases and can override AI labels...',
  },
  {
    id: 'harm',
    label: 'Fairness or harm concern',
    prompt: 'Who could be burdened by error, missing context, or proxy signals?',
    placeholder: 'Short messages, language barriers, accessibility issues, and prior failed fixes...',
  },
  {
    id: 'escalation',
    label: 'Escalation trigger',
    prompt: 'What condition requires formal review before proceeding?',
    placeholder: 'Escalate if priority affects access, urgent harm, vulnerable customers, or policy uncertainty...',
  },
];

const rubricChecks = [
  {
    id: 'bounds-use',
    label: 'Bounds what AI may and may not do',
    test: ({ selectedTasks }) =>
      selectedTasks.includes('themes') &&
      selectedTasks.includes('questions') &&
      !selectedTasks.includes('deprioritize') &&
      !selectedTasks.includes('notify'),
    why: 'The memo should preserve AI as assistance, not as the decision maker.',
  },
  {
    id: 'checks-evidence',
    label: 'Separates supported claims from unsupported claims',
    test: ({ claimRatings }) =>
      claimChecks.every((claim) => claimRatings[claim.id] === claim.answer),
    why: 'The capstone tests whether fluent AI output is inspected against evidence.',
  },
  {
    id: 'protects-data',
    label: 'Sets data boundaries before use',
    test: ({ selectedDataControls }) =>
      ['remove-identifiers', 'abstract-account', 'approved-space'].every((id) =>
        selectedDataControls.includes(id),
      ) && !selectedDataControls.includes('paste-all'),
    why: 'Useful analysis does not require exposing every raw detail.',
  },
  {
    id: 'names-harm',
    label: 'Names representational or access harms',
    test: ({ selectedHarmChecks }) => selectedHarmChecks.length >= 3,
    why: 'Priority systems can disadvantage people through proxies such as detail, tone, or context gaps.',
  },
  {
    id: 'review-loop',
    label: 'Creates a human review loop with authority',
    test: ({ selectedReviewControls }) =>
      ['owner', 'override', 'sample-audit', 'trigger'].every((id) =>
        selectedReviewControls.includes(id),
      ),
    why: 'Review is only meaningful when humans can inspect, correct, stop, or escalate use.',
  },
  {
    id: 'memo',
    label: 'Writes a defensible recommendation',
    test: ({ finalAction, memoText }) =>
      ['pilot', 'pause', 'escalate'].includes(finalAction) &&
      memoText.trim().length >= 300 &&
      includesAny(memoText, ['verify', 'check', 'audit', 'evidence']) &&
      includesAny(memoText, ['redact', 'remove', 'abstract', 'sensitive']) &&
      includesAny(memoText, ['human', 'reviewer', 'owner', 'approve']) &&
      includesAny(memoText, ['escalate', 'pause', 'trigger', 'formal review']),
    why: 'A strong memo states the decision, conditions, verification, review, and escalation triggers.',
  },
];

function includesAny(text, terms) {
  const normalized = text.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

function toggleValue(current, id) {
  return current.includes(id)
    ? current.filter((item) => item !== id)
    : [...current, id];
}

export default function CapstoneSimulationLab() {
  const [selectedTasks, setSelectedTasks] = useState([]);
  const [claimRatings, setClaimRatings] = useState({});
  const [selectedDataControls, setSelectedDataControls] = useState([]);
  const [selectedHarmChecks, setSelectedHarmChecks] = useState([]);
  const [selectedReviewControls, setSelectedReviewControls] = useState([]);
  const [finalAction, setFinalAction] = useState('');
  const [memoFields, setMemoFields] = useState({});
  const [selfMarked, setSelfMarked] = useState({});
  const [showDebrief, setShowDebrief] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState(null);
  const memoText = useMemo(() => Object.values(memoFields).join(' '), [memoFields]);
  const completedMemoFields = useMemo(
    () => decisionFields.filter((field) => memoFields[field.id]?.trim()).length,
    [memoFields],
  );

  const claimScore = useMemo(
    () =>
      claimChecks.filter((claim) => claimRatings[claim.id] === claim.answer)
        .length,
    [claimRatings],
  );

  const rubricResults = useMemo(
    () =>
      rubricChecks.map((check) => ({
        ...check,
        passed: check.test({
          selectedTasks,
          claimRatings,
          selectedDataControls,
          selectedHarmChecks,
          selectedReviewControls,
          finalAction,
          memoText,
        }),
      })),
    [
      selectedTasks,
      claimRatings,
      selectedDataControls,
      selectedHarmChecks,
      selectedReviewControls,
      finalAction,
      memoText,
    ],
  );

  const rubricScore = rubricResults.filter((check) => check.passed).length;
  const boundedUsePassed = rubricResults.find((check) => check.id === 'bounds-use')?.passed;
  const evidencePassed = rubricResults.find((check) => check.id === 'checks-evidence')?.passed;
  const dataPassed = rubricResults.find((check) => check.id === 'protects-data')?.passed;
  const reviewPassed = rubricResults.find((check) => check.id === 'review-loop')?.passed;
  const selfMarkedScore = rubricResults.filter((check) => selfMarked[check.id])
    .length;
  const memoQuality = useMemo(
    () =>
      analyzeTextQuality(memoText, {
        minChars: 320,
        minWords: 52,
        requiredAny: ['recommendation', 'verify', 'human', 'data', 'escalate'],
        requiredGroups: [
          {
            terms: ['pilot', 'pause', 'escalate', 'recommendation', 'proceed'],
            message: 'State a clear recommendation or action.',
          },
          {
            terms: ['verify', 'check', 'audit', 'evidence', 'record'],
            message: 'Name how claims or outputs will be verified.',
          },
          {
            terms: ['data', 'redact', 'remove', 'abstract', 'sensitive'],
            message: 'Name the data boundary.',
          },
          {
            terms: ['human', 'owner', 'reviewer', 'override', 'approve'],
            message: 'Name the human review owner or authority.',
          },
          {
            terms: ['escalate', 'trigger', 'pause', 'formal review'],
            message: 'Name the escalation trigger.',
          },
        ],
      }),
    [memoText],
  );
  const interactionComplete =
    selectedTasks.length >= 3 &&
    Object.keys(claimRatings).length === claimChecks.length &&
    selectedDataControls.length >= 3 &&
    selectedHarmChecks.length >= 2 &&
    selectedReviewControls.length >= 3 &&
    Boolean(finalAction);
  const ready =
    interactionComplete &&
    completedMemoFields === decisionFields.length &&
    boundedUsePassed &&
    evidencePassed &&
    dataPassed &&
    reviewPassed &&
    memoQuality.passed &&
    rubricScore >= 5;
  const completionRequirements = [
    {
      label: 'Complete all six interaction sections',
      met: interactionComplete,
    },
    {
      label: 'Complete all decision memo fields',
      met: completedMemoFields === decisionFields.length,
    },
    {
      label: 'Write a substantive decision memo',
      met: memoQuality.passed,
    },
    {
      label: 'Pass the critical capability, evidence, data, and review checks',
      met: Boolean(boundedUsePassed && evidencePassed && dataPassed && reviewPassed),
    },
    {
      label: 'Meet at least five capstone checks',
      met: rubricScore >= 5,
    },
  ];

  useEffect(() => {
    const draft = readDraft('08-capstone');
    if (draft) {
      setSelectedTasks(Array.isArray(draft.selectedTasks) ? draft.selectedTasks : []);
      setClaimRatings(draft.claimRatings && typeof draft.claimRatings === 'object' ? draft.claimRatings : {});
      setSelectedDataControls(Array.isArray(draft.selectedDataControls) ? draft.selectedDataControls : []);
      setSelectedHarmChecks(Array.isArray(draft.selectedHarmChecks) ? draft.selectedHarmChecks : []);
      setSelectedReviewControls(Array.isArray(draft.selectedReviewControls) ? draft.selectedReviewControls : []);
      setFinalAction(typeof draft.finalAction === 'string' ? draft.finalAction : '');
      setMemoFields(draft.memoFields && typeof draft.memoFields === 'object' ? draft.memoFields : {});
      setDraftSavedAt(draft.updatedAt || draft.savedAt || null);
    }
    setDraftLoaded(true);
  }, []);

  useEffect(() => {
    if (!draftLoaded) {
      return;
    }

    const hasWork =
      selectedTasks.length > 0 ||
      Object.keys(claimRatings).length > 0 ||
      selectedDataControls.length > 0 ||
      selectedHarmChecks.length > 0 ||
      selectedReviewControls.length > 0 ||
      Boolean(finalAction) ||
      Object.values(memoFields).some((value) => value?.trim());

    if (!hasWork) {
      return;
    }

    const draft = saveDraft('08-capstone', {
      selectedTasks,
      claimRatings,
      selectedDataControls,
      selectedHarmChecks,
      selectedReviewControls,
      finalAction,
      memoFields,
    });
    setDraftSavedAt(draft.updatedAt || draft.savedAt || null);
  }, [
    draftLoaded,
    selectedTasks,
    claimRatings,
    selectedDataControls,
    selectedHarmChecks,
    selectedReviewControls,
    finalAction,
    memoFields,
  ]);

  function toggleSelfMarked(id) {
    setSelfMarked((current) => ({ ...current, [id]: !current[id] }));
  }

  function updateMemoField(fieldId, value) {
    setMemoFields((current) => ({ ...current, [fieldId]: value }));
  }

  function revealDebrief() {
    setShowDebrief(true);
    saveArtifact('capstone', {
      finalAction,
      memo: memoText,
      memoFields,
      claimScore,
      rubricScore,
      selectedTasks,
      selectedDataControls,
      selectedHarmChecks,
      selectedReviewControls,
    });
    clearDraft('08-capstone');
    markModuleComplete('08-capstone');
  }

  return (
    <section className="capstone-lab" aria-labelledby="capstone-lab-title">
      <div className="capstone-lab__header">
        <div>
          <p className="capstone-lab__eyebrow">Capstone Simulation</p>
          <h2 id="capstone-lab-title">The customer feedback decision</h2>
        </div>
        <div className="capstone-lab__progress" aria-live="polite">
          {rubricScore}/{rubricChecks.length}
        </div>
      </div>
      {draftSavedAt && !showDebrief && (
        <p className="capstone-lab__draft-status">
          Draft saved locally in this browser.
        </p>
      )}

      <div className="capstone-lab__scenario">
        <h3>Scenario packet</h3>
        <p>
          A support director wants to use AI to review customer feedback,
          identify dissatisfaction themes, draft interventions, and flag
          customers who may need urgent follow-up. The team is overloaded, and
          a dashboard is due soon.
        </p>
        <div className="capstone-lab__packet">
          <article>
            <h4>Evidence available</h4>
            <ul>
              <li>Small synthetic sample of recent customer messages.</li>
              <li>Several messages mention billing confusion and access delays.</li>
              <li>Some records contain names, account IDs, and sensitive context.</li>
              <li>Some urgent messages are short, informal, or missing details.</li>
            </ul>
          </article>
          <article>
            <h4>Proposed AI output</h4>
            <p>
              "Billing confusion is the top issue at 42%. Low-detail messages
              should be deprioritized. Recommended intervention: automatically
              send standard billing instructions and route only detailed
              complaints to a human reviewer."
            </p>
          </article>
        </div>
      </div>

      <fieldset className="capstone-lab__block">
        <legend>1. Bound the capability</legend>
        <p>
          Select the parts of the request where AI may assist. The hard part is
          deciding where assistance becomes delegated judgment.
        </p>
        <div className="capstone-lab__choice-grid">
          {assistTasks.map((task) => (
            <button
              aria-pressed={selectedTasks.includes(task.id)}
              className={selectedTasks.includes(task.id) ? 'is-selected' : ''}
              key={task.id}
              onClick={() =>
                setSelectedTasks((current) => toggleValue(current, task.id))
              }
              type="button"
            >
              {task.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="capstone-lab__block">
        <legend>2. Inspect the AI output</legend>
        <p>
          Classify each claim against the synthetic packet. Treat polished
          language as neither proof nor disproof.
        </p>
        <div className="capstone-lab__claims">
          {claimChecks.map((claim) => (
            <article key={claim.id}>
              <h4>{claim.claim}</h4>
              <div className="capstone-lab__option-row">
                {claimOptions.map((option) => (
                  <button
                    aria-pressed={claimRatings[claim.id] === option.id}
                    className={
                      claimRatings[claim.id] === option.id ? 'is-selected' : ''
                    }
                    key={option.id}
                    onClick={() =>
                      setClaimRatings((current) => ({
                        ...current,
                        [claim.id]: option.id,
                      }))
                    }
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      </fieldset>

      <fieldset className="capstone-lab__block">
        <legend>3. Set data boundaries</legend>
        <p>
          Choose controls before any prompt or workflow uses customer feedback.
        </p>
        <div className="capstone-lab__choice-grid">
          {dataControls.map((control) => (
            <button
              aria-pressed={selectedDataControls.includes(control.id)}
              className={
                selectedDataControls.includes(control.id) ? 'is-selected' : ''
              }
              key={control.id}
              onClick={() =>
                setSelectedDataControls((current) =>
                  toggleValue(current, control.id),
                )
              }
              type="button"
            >
              {control.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="capstone-lab__block">
        <legend>4. Surface fairness and harm concerns</legend>
        <p>
          Select the concerns that should be addressed before using AI to flag
          priority or urgency.
        </p>
        <div className="capstone-lab__choice-grid">
          {harmChecks.map((check) => (
            <button
              aria-pressed={selectedHarmChecks.includes(check.id)}
              className={
                selectedHarmChecks.includes(check.id) ? 'is-selected' : ''
              }
              key={check.id}
              onClick={() =>
                setSelectedHarmChecks((current) =>
                  toggleValue(current, check.id),
                )
              }
              type="button"
            >
              {check.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="capstone-lab__block">
        <legend>5. Build accountability into the workflow</legend>
        <p>
          Choose the review controls that make human accountability concrete.
        </p>
        <div className="capstone-lab__choice-grid">
          {reviewControls.map((control) => (
            <button
              aria-pressed={selectedReviewControls.includes(control.id)}
              className={
                selectedReviewControls.includes(control.id) ? 'is-selected' : ''
              }
              key={control.id}
              onClick={() =>
                setSelectedReviewControls((current) =>
                  toggleValue(current, control.id),
                )
              }
              type="button"
            >
              {control.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="capstone-lab__block">
        <legend>6. Make the recommendation</legend>
        <p>
          Choose your overall recommendation. A defensible answer can be
          conditional; the point is to name what must be true before use.
        </p>
        <div className="capstone-lab__option-row">
          {finalActions.map((action) => (
            <button
              aria-pressed={finalAction === action.id}
              className={finalAction === action.id ? 'is-selected' : ''}
              key={action.id}
              onClick={() => setFinalAction(action.id)}
              type="button"
            >
              {action.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="capstone-lab__memo">
        <div>
          <h3>7. Write the structured decision memo</h3>
          <p>
            Complete each field as if this will be read by a manager deciding
            whether the AI-assisted workflow can proceed.
          </p>
        </div>
        {decisionFields.map((field) => (
          <label key={field.id}>
            <span>{field.label}</span>
            <small className="capstone-lab__field-help">{field.prompt}</small>
            <textarea
              onChange={(event) => updateMemoField(field.id, event.target.value)}
              placeholder={field.placeholder}
              rows="3"
              value={memoFields[field.id] || ''}
            />
          </label>
        ))}
        <small className={memoQuality.passed ? 'is-passed' : ''}>
          {textQualitySummary(memoQuality)}
        </small>
      </div>

      <div className="capstone-lab__self-check">
        <div className="capstone-lab__self-check-header">
          <h3>Capstone self-check</h3>
          <span aria-live="polite">{rubricScore}/{rubricChecks.length} checks</span>
        </div>
        <p>
          This section shows what the page can detect in your answer so far.
          These checks support reflection; they do not verify correctness,
          policy compliance, or role authorization.
        </p>
        <p className="capstone-lab__self-mark-count" aria-live="polite">
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

      <div className="capstone-lab__requirements">
        <h3>Before reveal</h3>
        <ul>
          {completionRequirements.map((requirement) => (
            <li
              className={requirement.met ? 'is-met' : ''}
              key={requirement.label}
            >
              <CheckCircle2 size={18} aria-hidden="true" />
              {requirement.label}
            </li>
          ))}
        </ul>
      </div>

      <button
        className="capstone-lab__reveal"
        disabled={!ready}
        onClick={revealDebrief}
        type="button"
      >
        <Eye size={18} aria-hidden="true" />
        Reveal capstone review
      </button>

      {showDebrief && (
        <div className="capstone-lab__debrief">
          <h3>Capstone review</h3>
          <p>
            The strongest recommendation is usually not "use AI" or "do not use
            AI." It is a conditional workflow: use AI for bounded analysis and
            drafting, keep sensitive data minimized, verify claims against
            records, require human ownership, and escalate when the use affects
            priority, access, or vulnerable customers.
          </p>
          <div className="capstone-lab__review-grid">
            <article>
              <FileText size={20} aria-hidden="true" />
              <h4>Claim inspection</h4>
              <p>
                You classified {claimScore}/{claimChecks.length} claims in line
                with the packet. Unsupported percentages and priority rules
                should not survive into the final memo as facts.
              </p>
            </article>
            <article>
              <FileText size={20} aria-hidden="true" />
              <h4>Decision quality</h4>
              <p>
                A defensible memo states residual risk. It also tells the next
                person what would make the workflow acceptable, what needs
                review, and what would trigger escalation.
              </p>
            </article>
          </div>
          <p className="capstone-lab__principle">
            AI literacy is applied judgment under uncertainty.
          </p>
          <p className="capstone-lab__privacy">
            Your selections and memo stayed in this browser. They were not
            submitted, stored, or sent to a server.
          </p>
          <p>
            <a className="button" href="#reflection-post">
              Continue to post-reflection
            </a>
          </p>
        </div>
      )}
    </section>
  );
}
