import { CheckCircle2, Eye } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  clearDraft,
  markModuleComplete,
  readDraft,
  saveArtifact,
  saveDraft,
} from '../lib/progress.js';
import { analyzeTextQuality, textQualitySummary } from '../lib/textQuality.js';
import './workflow-builder-lab.css';

const failureModes = [
  {
    id: 'purpose',
    label: 'Purpose is vague',
    why: 'The prompt asks for polish before defining what decision the briefing should support.',
  },
  {
    id: 'data',
    label: 'Data boundaries are unclear',
    why: 'The notes include vendor names, pricing, access complaints, and unresolved legal claims that may not belong in a prompt.',
  },
  {
    id: 'facts',
    label: 'Facts may be invented or overstated',
    why: 'The single prompt does not require AI to separate supplied facts from assumptions.',
  },
  {
    id: 'verification',
    label: 'No verification step',
    why: 'Dates, numbers, commitments, and risks can move into the final note without being checked.',
  },
  {
    id: 'ownership',
    label: 'No human ownership',
    why: 'The workflow treats AI as the final author instead of a tool inside a human-owned process.',
  },
];

const messyNotes = [
  'Deputy director wants a one-page briefing on whether to renew the public-records request platform.',
  'Draft notes mention a named vendor representative, quoted pricing, and one evaluator\'s internal concern.',
  'Clerk team says access complaints are up, but the exact baseline is not yet confirmed.',
  'Accessibility coordinator says upload forms may fail with screen readers; the vendor has not approved remediation wording.',
  'Procurement wants the note by tomorrow morning because the renewal window is closing.',
  'Open question: whether public-records deadlines or procurement rules require counsel review before any recommendation.',
];

const workflowStages = [
  {
    id: 'sanitize',
    title: 'Sanitize and minimize notes',
    strong:
      'Remove vendor names, quoted pricing, evaluator comments, and unnecessary request details before prompting.',
    helpful: true,
  },
  {
    id: 'paste-raw',
    title: 'Paste the raw notes for maximum context',
    strong:
      'This exposes unnecessary vendor, pricing, access, and internal evaluation details.',
    helpful: false,
  },
  {
    id: 'purpose',
    title: 'Define the decision and audience',
    strong:
      'State what the committee must decide, who will read the note, and which claims require evidence.',
    helpful: true,
  },
  {
    id: 'organize',
    title: 'Ask AI to organize, not conclude',
    strong:
      'Have AI group supplied notes into themes and list open questions without adding facts.',
    helpful: true,
  },
  {
    id: 'invent',
    title: 'Ask AI to fill the missing facts',
    strong:
      'Missing facts should become open questions, not generated claims.',
    helpful: false,
  },
  {
    id: 'verify',
    title: 'Verify decision-relevant claims',
    strong:
      'Check renewal dates, complaint volume, accessibility claims, legal deadlines, and approved vendor wording before use.',
    helpful: true,
  },
  {
    id: 'draft-bounded',
    title: 'Draft from supplied notes only',
    strong:
      'Ask for a draft that labels assumptions, unknowns, and statements needing verification.',
    helpful: true,
  },
  {
    id: 'send-directly',
    title: 'Send the polished output directly',
    strong:
      'Polish can hide unsupported claims and unresolved accountability.',
    helpful: false,
  },
  {
    id: 'own',
    title: 'Revise and own the final note',
    strong:
      'Use human judgment to revise, remove unsupported claims, and decide what still needs escalation.',
    helpful: true,
  },
];

const rubricChecks = [
  {
    id: 'purpose',
    label: 'Defines the purpose before prompting',
    test: ({ planText }) =>
      includesAny(planText, ['purpose', 'audience', 'decision', 'committee', 'procurement', 'briefing', 'goal']),
    why: 'AI works better as part of a task when the human defines what the work is for.',
  },
  {
    id: 'data',
    label: 'Includes data minimization',
    test: ({ planText }) =>
      includesAny(planText, [
        'sanitized',
        'de-identified',
        'remove',
        'redact',
        'abstract',
        'minimize',
        'confidential',
        'sensitive',
        'names',
      ]),
    why: 'Everyday use still needs boundaries around what information is exposed.',
  },
  {
    id: 'no-new-facts',
    label: 'Constrains AI from adding unsupported facts',
    test: ({ planText }) =>
      includesAny(planText, [
        'do not add',
        'only the provided',
        'supplied notes',
        'source notes',
        'do not infer',
        'do not invent',
        "don't assume",
        'no new facts',
      ]),
    why: 'A staged workflow should prevent fluent invention from entering the final work.',
  },
  {
    id: 'open-questions',
    label: 'Separates open questions from conclusions',
    test: ({ planText }) =>
      includesAny(planText, [
        'open questions',
        'unknown',
        'unclear',
        'unresolved',
        'assumptions',
        'needs verification',
        'needs confirmation',
      ]),
    why: 'A useful briefing makes uncertainty visible instead of hiding it in polished prose.',
  },
  {
    id: 'verification',
    label: 'Adds verification and human ownership',
    test: ({ planText }) =>
      includesAny(planText, ['verify', 'check', 'review', 'confirm', 'compare']) &&
      includesAny(planText, [
        'I will',
        'human',
        'final',
        'own',
        'accountable',
        'responsible',
        'sign off',
        'revise',
        'owner',
      ]),
    why: 'The final work remains human-owned. AI can assist, but it should not bypass review.',
  },
];

const usePlanFields = [
  {
    id: 'task',
    label: 'Allowed AI task',
    prompt: 'What may AI help with in this workflow?',
    placeholder: 'Organize sanitized procurement and accessibility notes into themes and open questions...',
  },
  {
    id: 'data',
    label: 'Data boundary',
    prompt: 'What information must be removed, redacted, or abstracted first?',
    placeholder: 'Remove vendor names, quoted pricing, evaluator comments, and requester details...',
  },
  {
    id: 'source',
    label: 'Source of truth',
    prompt: 'What source should the human use to verify important claims?',
    placeholder: 'Procurement file, accessibility testing notes, public-records logs, approved vendor communications...',
  },
  {
    id: 'verification',
    label: 'Verification owner',
    prompt: 'Who checks dates, numbers, commitments, and unsupported claims?',
    placeholder: 'I will verify complaint volume, renewal dates, accessibility claims, and approved wording before use...',
  },
  {
    id: 'humanOwner',
    label: 'Final human owner',
    prompt: 'Who owns the final note or decision?',
    placeholder: 'The briefing author or procurement lead owns the final recommendation and wording...',
  },
  {
    id: 'blocked',
    label: 'Blocked AI task',
    prompt: 'What must AI not decide or invent?',
    placeholder: 'Do not invent missing facts, select the vendor, make legal calls, or make commitments...',
  },
  {
    id: 'stop',
    label: 'Stop or escalate condition',
    prompt: 'What would make you stop and ask for review?',
    placeholder: 'Escalate if legal deadlines, accessibility obligations, procurement exceptions, or sensitive details are needed...',
  },
];

const roleplayMessages = [
  {
    id: 'deputy',
    speaker: 'Deputy director, 4:42 PM',
    text:
      'Can you get me a one-page recommendation before I leave? I need something decisive for the renewal conversation tomorrow.',
  },
  {
    id: 'procurement',
    speaker: 'Procurement analyst, 4:47 PM',
    text:
      'The renewal window is tight. I can confirm dates later tonight, but I do not want unapproved pricing or vendor wording in a broad email.',
  },
  {
    id: 'accessibility',
    speaker: 'Accessibility coordinator, 4:51 PM',
    text:
      'Please do not state that the forms fail screen readers yet. We have concern notes, not final test language.',
  },
];

const responseOptions = [
  {
    id: 'bounded-draft',
    label: 'Draft a bounded briefing',
    detail:
      'Use AI for structure, label unverified claims, and keep the recommendation provisional until checks are done.',
    responsible: true,
  },
  {
    id: 'issues-only',
    label: 'Send an issue list only',
    detail:
      'Move quickly by giving the deputy a decision frame, open questions, and what will be verified tonight.',
    responsible: true,
  },
  {
    id: 'confident-now',
    label: 'Send a confident recommendation now',
    detail:
      'This meets the speed pressure but turns unresolved facts into apparent conclusions.',
    responsible: false,
  },
  {
    id: 'wait-all',
    label: 'Wait for every fact',
    detail:
      'This protects accuracy but may miss the immediate need for a clear decision path.',
    responsible: false,
  },
];

const beforeActConsiderations = [
  {
    id: 'minimum-useful',
    label: 'What is the minimum useful product by the deadline?',
    prompt: 'Decide whether the deputy needs a recommendation or a verified issue frame.',
  },
  {
    id: 'verification',
    label: 'Which claims must be checked before recommendation language?',
    prompt: 'Complaint volume, renewal dates, accessibility wording, and any legal or procurement limits.',
    required: true,
  },
  {
    id: 'data-boundary',
    label: 'What details should not enter the AI prompt or broad email?',
    prompt: 'Vendor names, quoted pricing, evaluator comments, and unnecessary requester details.',
    required: true,
  },
  {
    id: 'provisional-language',
    label: 'How will uncertainty be visible?',
    prompt: 'Use labels such as confirmed, unverified, open question, and needs counsel or procurement review.',
  },
  {
    id: 'accountability',
    label: 'Who signs off before the briefing is treated as a recommendation?',
    prompt: 'Keep human ownership with the briefing author and the relevant office lead.',
    required: true,
  },
  {
    id: 'escalation',
    label: 'What would trigger escalation instead of faster drafting?',
    prompt: 'Legal deadlines, accessibility obligations, procurement exceptions, or sensitive details.',
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

export default function WorkflowBuilderLab() {
  const [selectedFailures, setSelectedFailures] = useState([]);
  const [selectedStages, setSelectedStages] = useState([]);
  const [usePlan, setUsePlan] = useState({});
  const [selectedRoleplayAction, setSelectedRoleplayAction] = useState('');
  const [selectedConsiderations, setSelectedConsiderations] = useState([]);
  const [judgmentResponse, setJudgmentResponse] = useState('');
  const [selfMarked, setSelfMarked] = useState({});
  const [showDebrief, setShowDebrief] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState(null);
  const planText = useMemo(() => Object.values(usePlan).join(' '), [usePlan]);
  const completedPlanFields = useMemo(
    () => usePlanFields.filter((field) => usePlan[field.id]?.trim()).length,
    [usePlan],
  );

  const promptQuality = useMemo(
    () =>
      analyzeTextQuality(planText, {
        minChars: 260,
        minWords: 42,
        requiredAny: ['verify', 'open questions', 'supplied notes', 'human', 'sanitized'],
        requiredGroups: [
          {
            terms: ['sanitized', 'redact', 'remove', 'sensitive', 'names'],
            message: 'Name the data boundary or minimization step.',
          },
          {
            terms: ['verify', 'check', 'review', 'source of truth'],
            message: 'Name how important claims will be checked.',
          },
          {
            terms: ['human', 'owner', 'I will', 'final', 'revise'],
            message: 'Name who owns the final work.',
          },
        ],
      }),
    [planText],
  );
  const judgmentQuality = useMemo(
    () =>
      analyzeTextQuality(judgmentResponse, {
        minChars: 90,
        minWords: 18,
        requiredAny: ['speed', 'verify', 'minimize', 'accountable', 'because'],
        requiredGroups: [
          {
            terms: ['speed', 'deadline', 'tomorrow', 'fast', 'quick'],
            message: 'Name the pressure to move quickly.',
          },
          {
            terms: ['verify', 'check', 'confirm', 'source of truth', 'review'],
            message: 'Name what must still be verified.',
          },
          {
            terms: ['minimize', 'redact', 'remove', 'sanitized', 'only'],
            message: 'Name how data exposure will be limited.',
          },
          {
            terms: ['accountable', 'owner', 'I will', 'sign off', 'responsible'],
            message: 'Name who stays accountable for the final briefing.',
          },
        ],
      }),
    [judgmentResponse],
  );
  const rubricResults = useMemo(
    () =>
      rubricChecks.map((check) => ({
        ...check,
        passed: check.test({ planText }),
      })),
    [planText],
  );

  const rubricScore = rubricResults.filter((check) => check.passed).length;
  const selfMarkedScore = rubricResults.filter((check) => selfMarked[check.id])
    .length;
  const selectedAction = responseOptions.find(
    (option) => option.id === selectedRoleplayAction,
  );
  const effectiveRubricScore =
    rubricScore +
    Math.min(
      rubricResults.filter((check) => !check.passed && selfMarked[check.id])
        .length,
      1,
    );

  const ready =
    selectedFailures.length >= 2 &&
    selectedStages.length >= 5 &&
    completedPlanFields === usePlanFields.length &&
    promptQuality.passed &&
    Boolean(selectedAction?.responsible) &&
    selectedConsiderations.length >= 3 &&
    judgmentQuality.passed;
  const completionRequirements = [
    {
      label: 'Identify at least two single-prompt workflow failure modes',
      met: selectedFailures.length >= 2,
    },
    {
      label: 'Choose at least five workflow stages for critique and refinement',
      met: selectedStages.length >= 5,
    },
    {
      label: 'Complete every AI Use Plan field',
      met: completedPlanFields === usePlanFields.length,
    },
    {
      label: 'Write a substantive AI Use Plan',
      met: promptQuality.passed,
    },
    {
      label: 'Choose a responsible roleplay action',
      met: Boolean(selectedAction?.responsible),
    },
    {
      label: 'Complete the Before You Act consideration step',
      met: selectedConsiderations.length >= 3,
    },
    {
      label: 'Complete the speed-vs-verification Judgment Challenge',
      met: judgmentQuality.passed,
    },
  ];

  useEffect(() => {
    const draft = readDraft('06-everyday-use');
    if (draft) {
      setSelectedFailures(Array.isArray(draft.selectedFailures) ? draft.selectedFailures : []);
      setSelectedStages(Array.isArray(draft.selectedStages) ? draft.selectedStages : []);
      setUsePlan(draft.usePlan && typeof draft.usePlan === 'object' ? draft.usePlan : {});
      setSelectedRoleplayAction(
        typeof draft.selectedRoleplayAction === 'string'
          ? draft.selectedRoleplayAction
          : '',
      );
      setSelectedConsiderations(
        Array.isArray(draft.selectedConsiderations)
          ? draft.selectedConsiderations
          : [],
      );
      setJudgmentResponse(
        typeof draft.judgmentResponse === 'string' ? draft.judgmentResponse : '',
      );
      setDraftSavedAt(draft.updatedAt || draft.savedAt || null);
    }
    setDraftLoaded(true);
  }, []);

  useEffect(() => {
    if (!draftLoaded) {
      return;
    }

    const hasWork =
      selectedFailures.length > 0 ||
      selectedStages.length > 0 ||
      Object.values(usePlan).some((value) => value?.trim()) ||
      Boolean(selectedRoleplayAction) ||
      selectedConsiderations.length > 0 ||
      Boolean(judgmentResponse.trim());

    if (!hasWork) {
      return;
    }

    const draft = saveDraft('06-everyday-use', {
      selectedFailures,
      selectedStages,
      usePlan,
      selectedRoleplayAction,
      selectedConsiderations,
      judgmentResponse,
    });
    setDraftSavedAt(draft.updatedAt || draft.savedAt || null);
  }, [
    draftLoaded,
    selectedFailures,
    selectedStages,
    usePlan,
    selectedRoleplayAction,
    selectedConsiderations,
    judgmentResponse,
  ]);

  function toggleFailure(id) {
    setSelectedFailures((current) => toggleValue(current, id));
  }

  function toggleStage(id) {
    setSelectedStages((current) => toggleValue(current, id));
  }

  function toggleConsideration(id) {
    setSelectedConsiderations((current) => toggleValue(current, id));
  }

  function toggleSelfMarked(checkId) {
    setSelfMarked((current) => ({ ...current, [checkId]: !current[checkId] }));
  }

  function updateUsePlan(fieldId, value) {
    setUsePlan((current) => ({ ...current, [fieldId]: value }));
  }

  function revealDebrief() {
    setShowDebrief(true);
    saveArtifact('usePlan', {
      fields: usePlan,
      judgmentResponse,
      selectedStages,
      selectedFailures,
      selectedRoleplayAction,
      selectedConsiderations,
    });
    clearDraft('06-everyday-use');
    markModuleComplete('06-everyday-use');
  }

  return (
    <section className="workflow-lab" aria-labelledby="workflow-lab-title">
      <div className="workflow-lab__header">
        <div>
          <p className="workflow-lab__eyebrow">Interactive Lab</p>
          <h2 id="workflow-lab-title">From single prompt to workflow</h2>
        </div>
        <div className="workflow-lab__progress" aria-live="polite">
          {selectedStages.length}/{workflowStages.length} selected
        </div>
      </div>
      {draftSavedAt && !showDebrief && (
        <p className="workflow-lab__draft-status">
          Draft saved locally in this browser.
        </p>
      )}

      <div className="workflow-lab__scenario">
        <h3>Scenario</h3>
        <p>
          You need a briefing note for tomorrow's regulated-office decision on
          a public-records platform renewal. The tempting prompt is short, fast,
          and risky:
        </p>
        <blockquote>
          Write a confident one-page renewal recommendation from these notes for
          tomorrow's deputy director briefing.
        </blockquote>
        <h4>Messy notes</h4>
        <ul>
          {messyNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </div>

      <fieldset className="workflow-lab__fieldset">
        <legend>What makes the single-prompt workflow fragile?</legend>
        <div className="workflow-lab__failure-grid">
          {failureModes.map((mode) => (
            <button
              aria-pressed={selectedFailures.includes(mode.id)}
              className={selectedFailures.includes(mode.id) ? 'is-selected' : ''}
              key={mode.id}
              onClick={() => toggleFailure(mode.id)}
              type="button"
            >
              {mode.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="workflow-lab__stage-list">
        <h3>Build a stronger workflow</h3>
        <p>
          Select the stages you would include. The options are mixed together;
          judge what belongs in a responsible workflow.
        </p>
        {workflowStages.map((stage) => (
          <article
            className={[
              selectedStages.includes(stage.id) ? 'is-selected' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            key={stage.id}
          >
            <div>
              <h4>{stage.title}</h4>
              <p>{stage.strong}</p>
            </div>
            <button
              aria-pressed={selectedStages.includes(stage.id)}
              onClick={() => toggleStage(stage.id)}
              type="button"
            >
              {selectedStages.includes(stage.id) ? 'Included' : 'Include'}
            </button>
          </article>
        ))}
      </div>

      <div className="workflow-lab__prompt">
        <h3>Build the reusable AI Use Plan</h3>
        <p>
          Fill each field as if you were leaving instructions for a colleague
          who will use AI tomorrow.
        </p>
        {usePlanFields.map((field) => (
          <label key={field.id}>
            <span>{field.label}</span>
            <small className="workflow-lab__field-help">{field.prompt}</small>
            <textarea
              onChange={(event) => updateUsePlan(field.id, event.target.value)}
              placeholder={field.placeholder}
              rows="3"
              value={usePlan[field.id] || ''}
            />
          </label>
        ))}
        <small className={promptQuality.passed ? 'is-passed' : ''}>
          {textQualitySummary(promptQuality)}
        </small>
      </div>

      <div className="workflow-lab__roleplay">
        <div className="workflow-lab__roleplay-header">
          <div>
            <p className="workflow-lab__eyebrow">Judgment Challenge</p>
            <h3>Speed versus verification roleplay</h3>
          </div>
          <span>End of day</span>
        </div>
        <p>
          You are the staff lead holding the draft. Three messages arrive before
          close of business.
        </p>
        <div className="workflow-lab__message-stack">
          {roleplayMessages.map((message) => (
            <article key={message.id}>
              <h4>{message.speaker}</h4>
              <p>{message.text}</p>
            </article>
          ))}
        </div>

        <fieldset className="workflow-lab__choice-set">
          <legend>First move</legend>
          <div className="workflow-lab__option-grid">
            {responseOptions.map((option) => (
              <button
                aria-pressed={selectedRoleplayAction === option.id}
                className={selectedRoleplayAction === option.id ? 'is-selected' : ''}
                key={option.id}
                onClick={() => setSelectedRoleplayAction(option.id)}
                type="button"
              >
                <strong>{option.label}</strong>
                <span>{option.detail}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="workflow-lab__choice-set">
          <legend>Before You Act</legend>
          <p>
            Select at least three considerations that should shape your next
            move. Verification, data boundary, and accountability are often the
            hardest to protect under deadline pressure.
          </p>
          <div className="workflow-lab__consideration-list">
            {beforeActConsiderations.map((item) => (
              <button
                aria-pressed={selectedConsiderations.includes(item.id)}
                className={selectedConsiderations.includes(item.id) ? 'is-selected' : ''}
                key={item.id}
                onClick={() => toggleConsideration(item.id)}
                type="button"
              >
                <strong>{item.label}</strong>
                <span>{item.prompt}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <label className="workflow-lab__prompt workflow-lab__judgment">
          <span>Final written judgment</span>
          <small className="workflow-lab__field-help">
            Write two or three sentences naming the fast action, the verification
            line you will not cross, the data boundary, and the accountable owner.
          </small>
          <textarea
            onChange={(event) => setJudgmentResponse(event.target.value)}
            placeholder="I would move quickly by sending an AI-organized issue frame from sanitized notes, but I would not make a renewal recommendation until complaint volume, dates, accessibility wording, and procurement limits are verified because..."
            rows="4"
            value={judgmentResponse}
          />
          <small className={judgmentQuality.passed ? 'is-passed' : ''}>
            {textQualitySummary(judgmentQuality)}
          </small>
        </label>
      </div>

      <div className="workflow-lab__self-check">
        <div className="workflow-lab__self-check-header">
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
        <p className="workflow-lab__self-mark-count" aria-live="polite">
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
        className="workflow-lab__reveal"
        disabled={!ready}
        onClick={revealDebrief}
        type="button"
      >
        <Eye size={18} aria-hidden="true" />
        Reveal workflow review
      </button>

      {showDebrief && (
        <div className="workflow-lab__debrief">
          <h3>Workflow review</h3>
          <p>
            A stronger AI workflow does not only ask for better prose. It
            breaks the work into smaller decisions so the human keeps control
            over purpose, evidence, uncertainty, data exposure, and final use.
          </p>
          <div className="workflow-lab__review-grid">
            {failureModes
              .filter((mode) => selectedFailures.includes(mode.id))
              .map((mode) => (
                <article key={mode.id}>
                  <h4>{mode.label}</h4>
                  <p>{mode.why}</p>
                </article>
              ))}
          </div>
          <p className="workflow-lab__principle">
            Better AI use is often workflow design, not just prompt writing.
          </p>
          <p className="workflow-lab__privacy">
            Your workflow and prompt stayed in this browser. They were not
            submitted, stored, or sent to a server.
          </p>
        </div>
      )}
    </section>
  );
}
