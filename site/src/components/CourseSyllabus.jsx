import {
  CheckCircle2,
  Circle,
  LockKeyhole,
  MoveRight,
  RotateCcw,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  courseCompleted,
  isModuleCompleted,
  isModuleUnlocked,
  nextAvailableModule,
  readFacilitatorMode,
  readStorageStatus,
  readProgress,
  resetProgress,
  setFacilitatorMode,
} from '../lib/progress.js';

export default function CourseSyllabus({ modules }) {
  const [progress, setProgress] = useState(null);
  const [storageStatus, setStorageStatus] = useState(null);
  const [facilitatorMode, setFacilitatorModeState] = useState(false);

  useEffect(() => {
    setProgress(readProgress());
    setStorageStatus(readStorageStatus());
    setFacilitatorModeState(readFacilitatorMode());

    function handleProgress(event) {
      setProgress(event.detail || readProgress());
      setStorageStatus(readStorageStatus());
    }

    function handleFacilitatorMode(event) {
      setFacilitatorModeState(
        typeof event.detail === 'boolean' ? event.detail : readFacilitatorMode(),
      );
    }

    window.addEventListener('ailitlab:progress', handleProgress);
    window.addEventListener('ailitlab:facilitator-mode', handleFacilitatorMode);
    window.addEventListener('storage', handleProgress);
    return () => {
      window.removeEventListener('ailitlab:progress', handleProgress);
      window.removeEventListener('ailitlab:facilitator-mode', handleFacilitatorMode);
      window.removeEventListener('storage', handleProgress);
    };
  }, []);

  const effectiveProgress = progress || {
    completed: [],
    completedAt: {},
    updatedAt: null,
  };
  const targetModule = useMemo(
    () => nextAvailableModule(effectiveProgress, modules),
    [modules, effectiveProgress],
  );
  const complete = courseCompleted(effectiveProgress, modules);
  const completedCount = effectiveProgress.completed.length;
  const totalMinutes = modules.reduce(
    (sum, module) => sum + module.estimatedMinutes,
    0,
  );
  const buttonLabel =
    completedCount === 0
      ? 'Start Here'
      : complete
        ? 'View Learning Record'
        : 'Continue Learning';
  const buttonHref = complete
    ? '/completion/'
    : moduleHref(targetModule.id, facilitatorMode);

  function handleReset() {
    const confirmed = window.confirm(
      'Reset local lab progress? This deletes module progress, reflections, and the locally locked learning record from this browser. This cannot be undone.',
    );

    if (confirmed) {
      setProgress(resetProgress());
      setStorageStatus(readStorageStatus());
    }
  }

  function handleFacilitatorOff() {
    setFacilitatorMode(false);
    setFacilitatorModeState(false);
    if (window.location.search.includes('facilitator=')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }

  return (
    <section className="course-syllabus" aria-labelledby="syllabus-title">
      <div className="course-syllabus__intro">
        <div>
          <p className="eyebrow">Syllabus</p>
          <h2 id="syllabus-title">A sequenced lab path</h2>
          <p>
            Move through the modules in order. Progress is stored only in this
            browser, so the sequence supports learning without accounts or
            tracking.
          </p>
          <p>
            The lab begins with a pre-reflection and ends with a post-reflection.
            Both are saved locally and included on the learning record, so
            write them as real evidence of learning rather than placeholders.
          </p>
          <div className="course-syllabus__path-note">
            <h3>What completion means</h3>
            <ol>
              <li>Write the opening reflection.</li>
              <li>Commit to a judgment before the fuller context appears.</li>
              <li>Reconsider the case using the Before You Act prompts.</li>
              <li>Document a short judgment or artifact.</li>
              <li>Reveal the review and mark the module complete.</li>
            </ol>
          </div>
          <p className="course-syllabus__time">
            Estimated full lab time: {formatTimeRange(totalMinutes)}.
          </p>
          <p className="course-syllabus__persistence">
            Your progress stays in this browser unless you reset it, clear site
            data, use private browsing, switch browser or device, or access the
            lab from a different domain.
          </p>
          {storageStatus && !storageStatus.persistent && (
            <p className="course-syllabus__storage-warning" role="status">
              Local storage is limited here. Your work is {storageStatus.label},
              so print or save your learning record before leaving this session.
            </p>
          )}
          {facilitatorMode && (
            <p className="course-syllabus__facilitator" role="status">
              Facilitator preview is on. All modules are open for planning,
              discussion, and workshop navigation. Preview links include a
              URL flag and do not persist after normal learner navigation. This
              does not mark learner work complete.
            </p>
          )}
        </div>
        <div className="course-syllabus__action">
          <div aria-live="polite">
            {completedCount}/{modules.length} complete
          </div>
          <a className="button" href={buttonHref}>
            {buttonLabel}
            <MoveRight size={18} aria-hidden="true" />
          </a>
          {facilitatorMode && (
            <button
              className="course-syllabus__reset"
              onClick={handleFacilitatorOff}
              type="button"
            >
              Turn off facilitator preview
            </button>
          )}
        </div>
      </div>

      <ol className="course-syllabus__list">
        {modules.map((module) => {
          const completed = isModuleCompleted(effectiveProgress, module.id);
          const unlocked =
            facilitatorMode ||
            isModuleUnlocked(effectiveProgress, module.id, modules);
          const Icon = completed ? CheckCircle2 : unlocked ? Circle : LockKeyhole;

          return (
            <li
              className={[
                completed ? 'is-completed' : '',
                unlocked ? 'is-unlocked' : 'is-locked',
              ]
                .filter(Boolean)
                .join(' ')}
              key={module.id}
            >
              <Icon size={20} aria-hidden="true" />
              <div>
                <span>Module {module.order}</span>
                <h3>{module.title}</h3>
                <p className="course-syllabus__module-time">
                  {module.estimatedMinutes} min
                </p>
                <p>{module.summary}</p>
              </div>
              {unlocked ? (
                <a href={moduleHref(module.id, facilitatorMode)}>
                  {completed ? 'Review' : 'Open'}
                </a>
              ) : (
                <span>Locked</span>
              )}
            </li>
          );
        })}
      </ol>

      {complete && (
        <div className="course-syllabus__completion">
          <CheckCircle2 size={20} aria-hidden="true" />
          <div>
            <h3>Learning record available</h3>
            <p>
              Generate the local learning record on its own page after
              confirming the name that should appear on it.
            </p>
          </div>
          <a className="button" href="/completion/">
            Open record
            <MoveRight size={18} aria-hidden="true" />
          </a>
        </div>
      )}

      {completedCount > 0 && (
        <button
          className="course-syllabus__reset"
          onClick={handleReset}
          type="button"
        >
          <RotateCcw size={16} aria-hidden="true" />
          Reset local progress
        </button>
      )}
    </section>
  );
}

function moduleHref(moduleId, facilitatorMode) {
  return `/modules/${moduleId}/${facilitatorMode ? '?facilitator=1' : ''}`;
}

function formatMinutes(minutes) {
  if (minutes < 60) {
    return `${minutes} minutes`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (remainder === 0) {
    return `${hours} hours`;
  }

  return `${hours} hr ${remainder} min`;
}

function formatTimeRange(minutes) {
  if (minutes <= 90) {
    return formatMinutes(minutes);
  }

  const upperHours = Math.ceil(minutes / 60);
  const lowerHours = Math.max(1, upperHours - 1);
  return `${lowerHours}-${upperHours} hours`;
}
