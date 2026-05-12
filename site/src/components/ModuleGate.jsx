import { CheckCircle2, LockKeyhole, MoveRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  courseCompleted,
  emptyProgress,
  isModuleCompleted,
  isModuleUnlocked,
  readFacilitatorMode,
  readProgress,
  setFacilitatorMode,
} from '../lib/progress.js';

export default function ModuleGate({ moduleId, moduleTitle, modules }) {
  const [progress, setProgress] = useState(emptyProgress());
  const [facilitatorMode, setFacilitatorModeState] = useState(false);

  useEffect(() => {
    setProgress(readProgress());
    setFacilitatorModeState(readFacilitatorMode());

    function handleProgress(event) {
      setProgress(event.detail || readProgress());
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

  useEffect(() => {
    const content = document.querySelector(`[data-module-content="${moduleId}"]`);
    if (content) {
      content.hidden =
        !facilitatorMode && !isModuleUnlocked(progress, moduleId, modules);
    }
  }, [facilitatorMode, moduleId, modules, progress]);

  const index = modules.findIndex((module) => module.id === moduleId);
  const previous = modules[index - 1];
  const next = modules[index + 1];
  const unlocked = facilitatorMode || isModuleUnlocked(progress, moduleId, modules);
  const completed = isModuleCompleted(progress, moduleId);
  const complete = courseCompleted(progress, modules);

  function handleFacilitatorOff() {
    setFacilitatorMode(false);
    setFacilitatorModeState(false);
    if (window.location.search.includes('facilitator=')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }

  if (!unlocked) {
    return (
      <section className="module-gate module-gate--locked">
        <LockKeyhole size={24} aria-hidden="true" />
        <h2>This module is locked for now.</h2>
        <p>
          Complete {previous ? previous.title : 'the previous module'} before
          starting {moduleTitle}. This is a local learning path, not an account
          system.
        </p>
        {previous && (
          <a className="button" href={`/modules/${previous.id}/`}>
            Go to previous module
            <MoveRight size={18} aria-hidden="true" />
          </a>
        )}
      </section>
    );
  }

  return (
    <>
      {facilitatorMode && (
        <div className="module-gate module-gate--facilitator">
          <span>
            Facilitator preview is on. Modules are open for planning and group
            discussion; learner completion still depends on activity progress.
          </span>
          <button
            className="course-syllabus__reset"
            onClick={handleFacilitatorOff}
            type="button"
          >
            Turn off preview
          </button>
        </div>
      )}
      <div className="module-gate module-gate--status">
        <span>
          {completed ? (
            <>
              <CheckCircle2 size={18} aria-hidden="true" />
              Completed in this browser
            </>
          ) : facilitatorMode ? (
            'Preview mode opens this module without changing learner progress.'
          ) : (
            'Complete the lab review to unlock the next module.'
          )}
        </span>
        {next && completed && (
          <a href={moduleHref(next.id, facilitatorMode)}>
            Next module
            <MoveRight size={16} aria-hidden="true" />
          </a>
        )}
      </div>
      {completed && (
        <div className="module-gate module-gate--complete">
          <CheckCircle2 size={20} aria-hidden="true" />
          <p>
            Module complete. Your progress is saved only in this browser.
          </p>
          {next && (
            <a className="button" href={moduleHref(next.id, facilitatorMode)}>
              Continue to Module {next.order}
              <MoveRight size={18} aria-hidden="true" />
            </a>
          )}
        </div>
      )}
      {complete && (
        <div className="module-gate module-gate--complete">
          <CheckCircle2 size={20} aria-hidden="true" />
          <p>
            Lab path complete. Generate your local learning record on its
            own page.
          </p>
          <a className="button" href="/completion/">
            Open learning record
            <MoveRight size={18} aria-hidden="true" />
          </a>
        </div>
      )}
    </>
  );
}

function moduleHref(moduleId, facilitatorMode) {
  return `/modules/${moduleId}/${facilitatorMode ? '?facilitator=1' : ''}`;
}
