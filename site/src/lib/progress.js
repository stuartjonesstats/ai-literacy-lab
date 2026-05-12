export const COURSE_PROGRESS_KEY = 'ailitlab.progress.v1';
export const COMPLETION_RECORD_KEY = 'ailitlab.completion.v1';
export const REFLECTION_RECORD_KEY = 'ailitlab.reflections.v1';
export const FACILITATOR_MODE_KEY = 'ailitlab.facilitatorMode.v1';
export const ARTIFACT_RECORD_KEY = 'ailitlab.artifacts.v1';
export const DRAFT_RECORD_KEY = 'ailitlab.drafts.v1';

const memoryStore = new Map();
let activeStorage = null;

export function emptyProgress() {
  return {
    completed: [],
    completedAt: {},
    updatedAt: null,
  };
}

export function readProgress() {
  if (typeof window === 'undefined') {
    return emptyProgress();
  }

  try {
    const parsed = JSON.parse(safeGet(COURSE_PROGRESS_KEY) || '{}');
    return normalizeProgress(parsed);
  } catch {
    return emptyProgress();
  }
}

export function markModuleComplete(moduleId) {
  if (typeof window === 'undefined') {
    return emptyProgress();
  }

  if (isFacilitatorPreviewActive()) {
    return readProgress();
  }

  const progress = readProgress();
  const completed = new Set(progress.completed);
  completed.add(moduleId);

  const next = normalizeProgress({
    ...progress,
    completed: [...completed],
    completedAt: {
      ...progress.completedAt,
      [moduleId]: progress.completedAt[moduleId] || new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  });

  safeSet(COURSE_PROGRESS_KEY, JSON.stringify(next));
  window.dispatchEvent(
    new CustomEvent('ailitlab:progress', { detail: next }),
  );
  return next;
}

export function resetProgress() {
  if (typeof window === 'undefined') {
    return emptyProgress();
  }

  safeRemove(COURSE_PROGRESS_KEY);
  safeRemove(COMPLETION_RECORD_KEY);
  safeRemove(REFLECTION_RECORD_KEY);
  safeRemove(ARTIFACT_RECORD_KEY);
  safeRemove(DRAFT_RECORD_KEY);
  const next = emptyProgress();
  window.dispatchEvent(
    new CustomEvent('ailitlab:progress', { detail: next }),
  );
  window.dispatchEvent(
    new CustomEvent('ailitlab:completion', { detail: null }),
  );
  window.dispatchEvent(
    new CustomEvent('ailitlab:reflection', { detail: emptyReflections() }),
  );
  window.dispatchEvent(
    new CustomEvent('ailitlab:artifacts', { detail: emptyArtifacts() }),
  );
  window.dispatchEvent(
    new CustomEvent('ailitlab:drafts', { detail: emptyDrafts() }),
  );
  return next;
}

export function readCompletionRecord() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const parsed = JSON.parse(safeGet(COMPLETION_RECORD_KEY) || 'null');
    if (!parsed || typeof parsed.name !== 'string') {
      return null;
    }
    return {
      name: parsed.name.trim(),
      lockedAt:
        typeof parsed.lockedAt === 'string'
          ? parsed.lockedAt
          : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function saveCompletionRecord(name) {
  if (typeof window === 'undefined') {
    return null;
  }

  if (isFacilitatorPreviewActive()) {
    return readCompletionRecord();
  }

  const record = {
    name: name.trim(),
    lockedAt: new Date().toISOString(),
  };
  safeSet(COMPLETION_RECORD_KEY, JSON.stringify(record));
  window.dispatchEvent(
    new CustomEvent('ailitlab:completion', { detail: record }),
  );
  return record;
}

export function emptyReflections() {
  return {
    pre: null,
    post: null,
  };
}

export function readReflections() {
  if (typeof window === 'undefined') {
    return emptyReflections();
  }

  try {
    const parsed = JSON.parse(safeGet(REFLECTION_RECORD_KEY) || '{}');
    return normalizeReflections(parsed);
  } catch {
    return emptyReflections();
  }
}

export function saveReflection(kind, text) {
  if (typeof window === 'undefined') {
    return emptyReflections();
  }

  if (isFacilitatorPreviewActive()) {
    return readReflections();
  }

  const current = readReflections();
  const next = normalizeReflections({
    ...current,
    [kind]: {
      text: text.trim(),
      savedAt: current[kind]?.savedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  });

  safeSet(REFLECTION_RECORD_KEY, JSON.stringify(next));
  window.dispatchEvent(
    new CustomEvent('ailitlab:reflection', { detail: next }),
  );
  return next;
}

export function hasReflection(kind) {
  const reflections = readReflections();
  return Boolean(reflections[kind]?.text);
}

export function emptyArtifacts() {
  return {
    usePlan: null,
    capstone: null,
  };
}

export function readArtifacts() {
  if (typeof window === 'undefined') {
    return emptyArtifacts();
  }

  try {
    const parsed = JSON.parse(safeGet(ARTIFACT_RECORD_KEY) || '{}');
    return normalizeArtifacts(parsed);
  } catch {
    return emptyArtifacts();
  }
}

export function saveArtifact(kind, value) {
  if (typeof window === 'undefined') {
    return emptyArtifacts();
  }

  if (isFacilitatorPreviewActive()) {
    return readArtifacts();
  }

  const current = readArtifacts();
  const next = normalizeArtifacts({
    ...current,
    [kind]: {
      ...value,
      savedAt: current[kind]?.savedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  });

  safeSet(ARTIFACT_RECORD_KEY, JSON.stringify(next));
  window.dispatchEvent(
    new CustomEvent('ailitlab:artifacts', { detail: next }),
  );
  return next;
}

export function emptyDrafts() {
  return {};
}

export function readDraft(moduleId) {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const parsed = JSON.parse(safeGet(DRAFT_RECORD_KEY) || '{}');
    const draft = parsed?.[moduleId];
    return draft && typeof draft === 'object' ? draft : null;
  } catch {
    return null;
  }
}

export function saveDraft(moduleId, value) {
  if (typeof window === 'undefined') {
    return emptyDrafts();
  }

  const current = readDrafts();
  const next = {
    ...current,
    [moduleId]: {
      ...value,
      savedAt: current[moduleId]?.savedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };

  safeSet(DRAFT_RECORD_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('ailitlab:drafts', { detail: next }));
  return next[moduleId];
}

export function clearDraft(moduleId) {
  if (typeof window === 'undefined') {
    return emptyDrafts();
  }

  const current = readDrafts();
  const { [moduleId]: _removed, ...next } = current;
  safeSet(DRAFT_RECORD_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('ailitlab:drafts', { detail: next }));
  return next;
}

export function isModuleCompleted(progress, moduleId) {
  return progress.completed.includes(moduleId);
}

export function isModuleUnlocked(progress, moduleId, modules) {
  const index = modules.findIndex((module) => module.id === moduleId);
  if (index <= 0) {
    return index === 0;
  }

  return isModuleCompleted(progress, modules[index - 1].id);
}

export function nextAvailableModule(progress, modules) {
  const firstIncomplete = modules.find(
    (module) => !isModuleCompleted(progress, module.id),
  );

  if (!firstIncomplete) {
    return modules[modules.length - 1];
  }

  if (isModuleUnlocked(progress, firstIncomplete.id, modules)) {
    return firstIncomplete;
  }

  return modules.find((module) => isModuleUnlocked(progress, module.id, modules));
}

export function courseCompleted(progress, modules) {
  return modules.every((module) => isModuleCompleted(progress, module.id));
}

export function readFacilitatorMode() {
  if (typeof window === 'undefined') {
    return false;
  }

  const param = new URLSearchParams(window.location.search).get('facilitator');
  if (param === '1') {
    return true;
  }

  if (param === '0') {
    return false;
  }

  return false;
}

export function isFacilitatorPreviewActive() {
  if (typeof window === 'undefined') {
    return false;
  }

  const param = new URLSearchParams(window.location.search).get('facilitator');
  if (param === '1') {
    return true;
  }

  if (param === '0') {
    return false;
  }

  return false;
}

export function setFacilitatorMode(enabled) {
  if (typeof window === 'undefined') {
    return false;
  }

  safeRemove(FACILITATOR_MODE_KEY);

  window.dispatchEvent(
    new CustomEvent('ailitlab:facilitator-mode', { detail: Boolean(enabled) }),
  );
  return Boolean(enabled);
}

export function readStorageStatus() {
  if (typeof window === 'undefined') {
    return {
      available: false,
      persistent: false,
      label: 'not available during server rendering',
    };
  }

  const storage = getWritableStorage();
  if (storage?.type === 'localStorage') {
    return {
      available: true,
      persistent: true,
      label: 'saved in this browser with local storage',
    };
  }

  if (storage?.type === 'sessionStorage') {
    return {
      available: true,
      persistent: false,
      label: 'saved only for this browser session',
    };
  }

  return {
    available: true,
    persistent: false,
    label: 'saved only until this page is closed',
  };
}

function normalizeProgress(value) {
  return {
    completed: Array.isArray(value.completed)
      ? [...new Set(value.completed.filter(Boolean))]
      : [],
    completedAt:
      value.completedAt && typeof value.completedAt === 'object'
        ? value.completedAt
        : {},
    updatedAt:
      typeof value.updatedAt === 'string'
        ? value.updatedAt
        : new Date().toISOString(),
  };
}

function readDrafts() {
  try {
    const parsed = JSON.parse(safeGet(DRAFT_RECORD_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : emptyDrafts();
  } catch {
    return emptyDrafts();
  }
}

function normalizeReflections(value) {
  return {
    pre: normalizeReflection(value.pre),
    post: normalizeReflection(value.post),
  };
}

function normalizeArtifacts(value) {
  return {
    usePlan: normalizeArtifact(value.usePlan),
    capstone: normalizeArtifact(value.capstone),
  };
}

function normalizeArtifact(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return {
    ...value,
    savedAt:
      typeof value.savedAt === 'string'
        ? value.savedAt
        : new Date().toISOString(),
    updatedAt:
      typeof value.updatedAt === 'string'
        ? value.updatedAt
        : new Date().toISOString(),
  };
}

function normalizeReflection(value) {
  if (!value || typeof value.text !== 'string' || !value.text.trim()) {
    return null;
  }

  return {
    text: value.text.trim(),
    savedAt:
      typeof value.savedAt === 'string'
        ? value.savedAt
        : new Date().toISOString(),
    updatedAt:
      typeof value.updatedAt === 'string'
        ? value.updatedAt
        : new Date().toISOString(),
  };
}

function safeGet(key) {
  const storage = getReadableStorage();
  if (storage) {
    try {
      return storage.area.getItem(key);
    } catch {
      // Fall through to in-memory storage.
    }
  }

  return memoryStore.get(key) || null;
}

function safeSet(key, value) {
  const storage = getWritableStorage();
  if (storage) {
    try {
      storage.area.setItem(key, value);
      activeStorage = storage.type;
      return true;
    } catch {
      activeStorage = null;
    }
  }

  memoryStore.set(key, value);
  return false;
}

function safeRemove(key) {
  for (const type of ['localStorage', 'sessionStorage']) {
    const area = getStorageArea(type);
    if (!area) {
      continue;
    }
    try {
      area.removeItem(key);
    } catch {
      // Continue clearing any remaining fallback storage.
    }
  }
  memoryStore.delete(key);
}

function getReadableStorage() {
  if (activeStorage) {
    const area = getStorageArea(activeStorage);
    if (area) {
      return { type: activeStorage, area };
    }
  }

  return getWritableStorage();
}

function getWritableStorage() {
  for (const type of ['localStorage', 'sessionStorage']) {
    const area = getStorageArea(type);
    if (!area) {
      continue;
    }

    try {
      const probe = `ailitlab.storage-test.${Date.now()}`;
      area.setItem(probe, '1');
      area.removeItem(probe);
      return { type, area };
    } catch {
      // Try the next storage option.
    }
  }

  return null;
}

function getStorageArea(type) {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window[type] || null;
  } catch {
    return null;
  }
}
