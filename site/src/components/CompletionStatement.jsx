import { Award, Printer } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  courseCompleted,
  emptyProgress,
  readArtifacts,
  readCompletionRecord,
  readProgress,
  readReflections,
  readStorageStatus,
  saveCompletionRecord,
} from '../lib/progress.js';

const usePlanLabels = {
  task: 'Allowed AI task',
  data: 'Data boundary',
  source: 'Source of truth',
  verification: 'Verification owner',
  humanOwner: 'Final human owner',
  blocked: 'Blocked AI task',
  stop: 'Stop or escalate condition',
};

const capstoneMemoLabels = {
  recommendation: 'Recommendation',
  allowedUse: 'Allowed AI role',
  dataBoundary: 'Data boundary',
  verification: 'Verification plan',
  review: 'Human review owner',
  harm: 'Fairness or harm concern',
  escalation: 'Escalation trigger',
};

export default function CompletionStatement({ progress, modules }) {
  const [localProgress, setLocalProgress] = useState(progress || emptyProgress());
  const [learnerName, setLearnerName] = useState('');
  const [record, setRecord] = useState(null);
  const [reflections, setReflections] = useState({ pre: null, post: null });
  const [artifacts, setArtifacts] = useState({ usePlan: null, capstone: null });
  const [storageStatus, setStorageStatus] = useState(null);
  const [showLearnerText, setShowLearnerText] = useState(true);
  const effectiveProgress = progress || localProgress;
  const complete = courseCompleted(effectiveProgress, modules);
  const reflectionsComplete = Boolean(reflections.pre?.text && reflections.post?.text);
  const usePlanComplete =
    orderedEntries(artifacts.usePlan?.fields, usePlanLabels).length ===
    Object.keys(usePlanLabels).length;
  const capstoneComplete =
    orderedEntries(artifacts.capstone?.memoFields, capstoneMemoLabels).length ===
    Object.keys(capstoneMemoLabels).length;
  const practiceEvidenceComplete = usePlanComplete && capstoneComplete;
  const missingModules = modules.filter(
    (module) => !effectiveProgress.completed.includes(module.id),
  );

  useEffect(() => {
    setLocalProgress(readProgress());
    setRecord(readCompletionRecord());
    setReflections(readReflections());
    setArtifacts(readArtifacts());
    setStorageStatus(readStorageStatus());

    function handleProgress(event) {
      setLocalProgress(event.detail || readProgress());
    }

    function handleCompletion(event) {
      setRecord(event.detail || readCompletionRecord());
    }

    function handleReflection(event) {
      setReflections(event.detail || readReflections());
    }

    function handleArtifacts(event) {
      setArtifacts(event.detail || readArtifacts());
    }

    function handleStorage() {
      setLocalProgress(readProgress());
      setRecord(readCompletionRecord());
      setReflections(readReflections());
      setArtifacts(readArtifacts());
      setStorageStatus(readStorageStatus());
    }

    window.addEventListener('ailitlab:progress', handleProgress);
    window.addEventListener('ailitlab:completion', handleCompletion);
    window.addEventListener('ailitlab:reflection', handleReflection);
    window.addEventListener('ailitlab:artifacts', handleArtifacts);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('ailitlab:progress', handleProgress);
      window.removeEventListener('ailitlab:completion', handleCompletion);
      window.removeEventListener('ailitlab:reflection', handleReflection);
      window.removeEventListener('ailitlab:artifacts', handleArtifacts);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const completedDate = useMemo(() => {
    const lastModule = modules[modules.length - 1];
    const timestamp =
      effectiveProgress?.completedAt?.[lastModule.id] || new Date().toISOString();
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(timestamp));
  }, [modules, effectiveProgress]);

  function lockName() {
    const name = learnerName.trim();
    if (name.length < 2) {
      return;
    }

    const confirmed = window.confirm(
      `Use "${name}" on this learning record? The name will be saved in this browser. To change it, you will need to reset local lab progress and complete the lab again.`,
    );
    if (confirmed) {
      setRecord(saveCompletionRecord(name));
    }
  }

  if (!complete) {
    return (
      <section className="completion-statement" aria-labelledby="completion-title">
        <div className="completion-statement__header">
          <Award size={28} aria-hidden="true" />
          <div>
            <p className="eyebrow">Learning Record</p>
            <h2 id="completion-title">Learning record locked</h2>
          </div>
        </div>
        <p>
          Complete all modules and the capstone simulation in this browser before
          generating the learning record.
        </p>
        <div className="completion-statement__reflection-status">
          <h3>Completion checklist</h3>
          {missingModules.length === 0 ? (
            <p>All modules are complete.</p>
          ) : (
            <ul>
              {missingModules.map((module) => (
                <li key={module.id}>
                  <a href={`/modules/${module.id}/`}>
                    Module {module.order}: {module.title}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    );
  }

  if (!reflectionsComplete) {
    return (
      <section className="completion-statement" aria-labelledby="completion-title">
        <div className="completion-statement__header">
          <Award size={28} aria-hidden="true" />
          <div>
            <p className="eyebrow">Learning Record</p>
            <h2 id="completion-title">Reflection bookends required</h2>
          </div>
        </div>
        <p>
          The learning record includes your pre-reflection and
          post-reflection. Finish the missing reflection before generating the
          record.
        </p>
        <div className="completion-statement__reflection-status">
          <p>
            <strong>Pre-reflection:</strong>{' '}
            {reflections.pre?.text ? 'saved' : 'missing'}
          </p>
          <p>
            <strong>Post-reflection:</strong>{' '}
            {reflections.post?.text ? 'saved' : 'missing'}
          </p>
        </div>
        {!reflections.pre?.text && (
          <a className="button secondary" href="/modules/01-good-and-bad-at/#reflection-pre">
            Complete pre-reflection
          </a>
        )}
        {!reflections.post?.text && (
          <a className="button" href="/modules/08-capstone/#reflection-post">
            Complete post-reflection
          </a>
        )}
      </section>
    );
  }

  if (!practiceEvidenceComplete) {
    return (
      <section className="completion-statement" aria-labelledby="completion-title">
        <div className="completion-statement__header">
          <Award size={28} aria-hidden="true" />
          <div>
            <p className="eyebrow">Learning Record</p>
            <h2 id="completion-title">Practice evidence required</h2>
          </div>
        </div>
        <p>
          The learning record requires the saved AI Use Plan from Module 6 and
          the structured capstone memo from Module 8. Complete those practice
          artifacts before generating the record.
        </p>
        <div className="completion-statement__reflection-status">
          <p>
            <strong>Module 6 AI Use Plan:</strong>{' '}
            {usePlanComplete ? 'saved' : 'missing'}
          </p>
          <p>
            <strong>Capstone structured memo:</strong>{' '}
            {capstoneComplete ? 'saved' : 'missing'}
          </p>
        </div>
        {!usePlanComplete && (
          <a className="button secondary" href="/modules/06-everyday-use/">
            Complete Module 6 practice evidence
          </a>
        )}
        {!capstoneComplete && (
          <a className="button" href="/modules/08-capstone/">
            Complete capstone practice evidence
          </a>
        )}
      </section>
    );
  }

  return (
    <section className="completion-statement" aria-labelledby="completion-title">
      <div className="completion-statement__header">
        <Award size={28} aria-hidden="true" />
        <div>
          <p className="eyebrow">Learning Record</p>
          <h2 id="completion-title">AI Literacy Lab Self-Attested Learning Record</h2>
        </div>
      </div>

      {storageStatus && !storageStatus.persistent && (
        <div className="completion-statement__storage-warning" role="status">
          This browser cannot provide normal persistent local storage. Your work
          is {storageStatus.label}. Print or save the finalized record before
          leaving this session.
        </div>
      )}

      {!record && (
        <div className="completion-statement__lock-panel">
          <label>
            <span>Name for this self-attested learning record</span>
            <input
              onChange={(event) => setLearnerName(event.target.value)}
              placeholder="Enter your name"
              value={learnerName}
            />
          </label>
          <p>
            Confirm carefully. This lab has no login, so the name is locked only
            in this browser's local storage when available.
          </p>
          <button
            className="button"
            disabled={learnerName.trim().length < 2}
            onClick={lockName}
            type="button"
          >
            Lock name and generate record
          </button>
        </div>
      )}

      <label className="completion-statement__display-toggle">
        <input
          checked={showLearnerText}
          onChange={(event) => setShowLearnerText(event.target.checked)}
          type="checkbox"
        />
        <span>
          Show learner-written reflections and practice evidence on this page
        </span>
      </label>

      <div className="completion-statement__record">
        {record ? (
          <p>
            <strong>{record.name}</strong> self-attested completion of the
            public AI Literacy Lab path on {completedDate}.
          </p>
        ) : (
          <p>
            <strong>Preview only.</strong> Lock your name above to finalize this
            browser-based, self-attested practice record.
          </p>
        )}
        <p>
          This local, self-attested learning record reflects completion of the
          interactive module sequence and capstone simulation in this browser. It
          is not a proctored credential, identity-verified certificate, policy
          approval, externally auditable training record, or regulatory compliance
          determination.
        </p>
        {record && (
          <p>
            Name locked locally on{' '}
            {new Intl.DateTimeFormat(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            }).format(new Date(record.lockedAt))}.
          </p>
        )}
      </div>
      <div className="completion-statement__reflections">
        <h3>Competency Map</h3>
        <p>
          This record reflects practice across the following AI literacy
          behaviors. The entries document local completion of the lab sequence;
          they are not independent verification of workplace authorization.
        </p>
        <ol className="completion-statement__competency-list">
          {modules.map((module) => (
            <li key={module.id}>
              <strong>
                Module {module.order}: {module.title}
              </strong>
              <span>{module.durableQuestion}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="completion-statement__reflections">
        <h3>Reflection Bookends</h3>
        {showLearnerText ? (
          <>
            <article>
              <h4>Before the lab</h4>
              <p>{reflections.pre.text}</p>
            </article>
            <article>
              <h4>After the lab</h4>
              <p>{reflections.post.text}</p>
            </article>
          </>
        ) : (
          <p>
            Pre- and post-reflections are saved locally but hidden in this
            minimal record view.
          </p>
        )}
      </div>
      <div className="completion-statement__reflections">
        <h3>Practice Evidence</h3>
        {showLearnerText ? (
          <>
            <article>
              <h4>AI Use Plan</h4>
              <dl className="completion-statement__artifact-list">
                {orderedEntries(artifacts.usePlan.fields, usePlanLabels).map(
                  ([key, value]) => (
                    <div key={key}>
                      <dt>{usePlanLabels[key] || formatArtifactLabel(key)}</dt>
                      <dd>{value}</dd>
                    </div>
                  ),
                )}
              </dl>
            </article>
            <article>
              <h4>Capstone recommendation</h4>
              <p>
                <strong>Final action:</strong>{' '}
                {formatArtifactLabel(artifacts.capstone.finalAction)}
              </p>
              <dl className="completion-statement__artifact-list">
                {orderedEntries(
                  artifacts.capstone.memoFields,
                  capstoneMemoLabels,
                ).map(([key, value]) => (
                  <div key={key}>
                    <dt>{capstoneMemoLabels[key] || formatArtifactLabel(key)}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </article>
          </>
        ) : (
          <article>
            <h4>Minimal evidence summary</h4>
            <p>Module 6 AI Use Plan saved locally.</p>
            <p>Capstone structured memo saved locally.</p>
          </article>
        )}
      </div>
      {record && (
        <button
          className="button"
          onClick={() => window.print()}
          type="button"
        >
          <Printer size={18} aria-hidden="true" />
          Print or save record
        </button>
      )}
    </section>
  );
}

function formatArtifactLabel(value) {
  return String(value || '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/-/g, ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function orderedEntries(fields, labelMap) {
  const entries = Object.entries(fields || {}).filter(([, value]) =>
    String(value || '').trim(),
  );
  const order = Object.keys(labelMap);
  return entries.sort(
    ([a], [b]) =>
      (order.includes(a) ? order.indexOf(a) : order.length) -
      (order.includes(b) ? order.indexOf(b) : order.length),
  );
}
