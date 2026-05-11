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
    why: 'The notes include names, contract details, and unresolved claims that may not belong in a prompt.',
  },
  {
    id: 'facts',
    label: 'Facts may be invented or overstated',
    why: 'The one-shot prompt does not require AI to separate supplied facts from assumptions.',
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
  'Steering committee wants a one-page briefing on the delayed customer portal rollout.',
  'Draft notes mention two named customers, one contract renewal, and an internal staffing gap.',
  'Support says access-ticket volume is up, but the exact baseline is not yet confirmed.',
  'Engineering says the fix is "probably next sprint"; product has not approved that wording.',
  'Sales wants the note to sound confident because an executive readout is tomorrow morning.',
  'Open question: whether the accessibility issue is one bug or several separate failures.',
];

const workflowStages = [
  {
    id: 'purpose',
    title: 'Define the decision and audience',
    strong:
      'State what the committee must decide, who will read the note, and which claims require evidence.',
    helpful: true,
  },
  {
    id: 'sanitize',
    title: 'Sanitize and minimize notes',
    strong:
      'Remove names, contract specifics, and unnecessary internal staffing details before prompting.',
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
    id: 'draft-bounded',
    title: 'Draft from supplied notes only',
    strong:
      'Ask for a draft that labels assumptions, unknowns, and statements needing verification.',
    helpful: true,
  },
  {
    id: 'verify',
    title: 'Verify decision-relevant claims',
    strong:
      'Check dates, volume changes, commitments, customer impact, and launch wording before use.',
    helpful: true,
  },
  {
    id: 'own',
    title: 'Revise and own the final note',
    strong:
      'Use human judgment to revise, remove unsupported claims, and decide what still needs escalation.',
    helpful: true,
  },
  {
    id: 'paste-raw',
    title: 'Paste the raw notes for maximum context',
    strong:
      'Tempting, but this exposes unnecessary customer, contract, and internal details.',
    helpful: false,
  },
  {
    id: 'invent',
    title: 'Ask AI to fill the missing facts',
    strong:
      'Tempting, but missing facts should become open questions, not generated claims.',
    helpful: false,
  },
  {
    id: 'send-directly',
    title: 'Send the polished output directly',
    strong:
      'Tempting, but polish can hide unsupported claims and unresolved accountability.',
    helpful: false,
  },
];

const rubricChecks = [
  {
    id: 'purpose',
    label: 'Defines the purpose before prompting',
    test: ({ planText }) =>
      includesAny(planText, ['purpose', 'audience', 'decision', 'committee', 'goal']),
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
    placeholder: 'Organize sanitized notes into themes and open questions...',
  },
  {
    id: 'data',
    label: 'Data boundary',
    prompt: 'What information must be removed, redacted, or abstracted first?',
    placeholder: 'Remove names, customer details, contract specifics, and staffing details...',
  },
  {
    id: 'source',
    label: 'Source of truth',
    prompt: 'What source should the human use to verify important claims?',
    placeholder: 'Ticket records, product notes, approved launch wording, support metrics...',
  },
  {
    id: 'verification',
    label: 'Verification owner',
    prompt: 'Who checks dates, numbers, commitments, and unsupported claims?',
    placeholder: 'I will verify volume changes and launch language before the briefing is used...',
  },
  {
    id: 'humanOwner',
    label: 'Final human owner',
    prompt: 'Who owns the final note or decision?',
    placeholder: 'The product owner or briefing author owns the final wording...',
  },
  {
    id: 'blocked',
    label: 'Blocked AI task',
    prompt: 'What must AI not decide or invent?',
    placeholder: 'Do not invent missing facts, rank customer impact, or make commitments...',
  },
  {
    id: 'stop',
    label: 'Stop or escalate condition',
    prompt: 'What would make you stop and ask for review?',
    placeholder: 'Escalate if sensitive customer details, legal commitments, or unapproved claims are needed...',
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
  const [selfMarked, setSelfMarked] = useState({});
  const [showDebrief, setShowDebrief] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState(null);
  const planText = useMemo(() => Object.values(usePlan).join(' '), [usePlan]);
  const completedPlanFields = useMemo(
    () => usePlanFields.filter((field) => usePlan[field.id]?.trim()).length,
    [usePlan],
  );

  const selectedHelpfulStages = useMemo(
    () =>
      workflowStages.filter(
        (stage) => stage.helpful && selectedStages.includes(stage.id),
      ).length,
    [selectedStages],
  );
  const selectedRiskyStages = useMemo(
    () =>
      workflowStages.filter(
        (stage) => !stage.helpful && selectedStages.includes(stage.id),
      ).length,
    [selectedStages],
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
  const effectiveRubricScore =
    rubricScore +
    Math.min(
      rubricResults.filter((check) => !check.passed && selfMarked[check.id])
        .length,
      1,
    );

  const ready =
    selectedFailures.length >= 4 &&
    selectedHelpfulStages >= 5 &&
    selectedRiskyStages === 0 &&
    completedPlanFields === usePlanFields.length &&
    promptQuality.passed &&
    effectiveRubricScore >= 4;
  const completionRequirements = [
    {
      label: 'Identify at least four one-shot workflow failure modes',
      met: selectedFailures.length >= 4,
    },
    {
      label: 'Include at least five useful workflow stages',
      met: selectedHelpfulStages >= 5,
    },
    {
      label: 'Remove all unsafe tempting stages',
      met: selectedRiskyStages === 0,
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
      label: 'Meet at least four local self-checks, with one self-attested override allowed',
      met: effectiveRubricScore >= 4,
    },
  ];

  useEffect(() => {
    const draft = readDraft('06-everyday-use');
    if (draft) {
      setSelectedFailures(Array.isArray(draft.selectedFailures) ? draft.selectedFailures : []);
      setSelectedStages(Array.isArray(draft.selectedStages) ? draft.selectedStages : []);
      setUsePlan(draft.usePlan && typeof draft.usePlan === 'object' ? draft.usePlan : {});
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
      Object.values(usePlan).some((value) => value?.trim());

    if (!hasWork) {
      return;
    }

    const draft = saveDraft('06-everyday-use', {
      selectedFailures,
      selectedStages,
      usePlan,
    });
    setDraftSavedAt(draft.updatedAt || draft.savedAt || null);
  }, [draftLoaded, selectedFailures, selectedStages, usePlan]);

  function toggleFailure(id) {
    setSelectedFailures((current) => toggleValue(current, id));
  }

  function toggleStage(id) {
    setSelectedStages((current) => toggleValue(current, id));
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
      selectedStages,
      selectedFailures,
    });
    clearDraft('06-everyday-use');
    markModuleComplete('06-everyday-use');
  }

  return (
    <section className="workflow-lab" aria-labelledby="workflow-lab-title">
      <div className="workflow-lab__header">
        <div>
          <p className="workflow-lab__eyebrow">Interactive Lab</p>
          <h2 id="workflow-lab-title">From one-shot prompt to workflow</h2>
        </div>
        <div className="workflow-lab__progress" aria-live="polite">
          {selectedHelpfulStages}/6 useful
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
          You need a briefing note for tomorrow's steering committee meeting.
          The tempting prompt is short, fast, and risky:
        </p>
        <blockquote>
          Write a confident one-page briefing note from these notes for tomorrow's
          executive readout.
        </blockquote>
        <h4>Messy notes</h4>
        <ul>
          {messyNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </div>

      <fieldset className="workflow-lab__fieldset">
        <legend>What makes the one-shot workflow fragile?</legend>
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
          Select the stages you would include. Some options are intentionally
          tempting but unsafe.
        </p>
        {workflowStages.map((stage) => (
          <article
            className={[
              selectedStages.includes(stage.id) ? 'is-selected' : '',
              !stage.helpful ? 'is-risky' : '',
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
        {selectedRiskyStages > 0 && (
          <p className="workflow-lab__warning">
            Remove the tempting unsafe stage before completing the module.
          </p>
        )}
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
