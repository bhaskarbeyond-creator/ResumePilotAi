/** Explicit MariaDB API-boundary adapter; production code never imports this module. */
export function createResumeApiAdapter(initial = {}) {
  const resumes = new Map(Object.entries(initial.resumes || {}).map(([id, value]) => [id, structuredClone(value)]));
  const publications = new Map(Object.entries(initial.publications || {}).map(([id, value]) => [id, structuredClone(value)]));
  const requests = [];
  let nextId = 1;
  let queuedFailure = null;

  function conflict(id, message = 'Resume changed in another tab or device.') {
    const current = resumes.get(id);
    return Object.assign(new Error(message), {
      status: 409,
      code: 'RESUME_CONFLICT',
      remoteRevision: Number(current?.revision || 0),
      remoteData: current ? structuredClone(current) : null,
    });
  }

  function consumeFailure() {
    if (!queuedFailure) return;
    const error = queuedFailure;
    queuedFailure = null;
    throw error;
  }

  const api = {
    async saveResume(requestedId, data, { expectedRevision = null } = {}) {
      consumeFailure();
      const id = requestedId || `generated-resume-id-${nextId++}`;
      requests.push({ operation: 'save', id, expectedRevision });
      const current = resumes.get(id);
      if (current) {
        if (expectedRevision === null || Number(expectedRevision) !== Number(current.revision)) throw conflict(id);
        const next = { ...structuredClone(data), id, revision: Number(current.revision) + 1 };
        resumes.set(id, next);
        return structuredClone(next);
      }
      if (expectedRevision !== null && expectedRevision !== undefined && Number(expectedRevision) !== 0) throw conflict(id);
      const created = { ...structuredClone(data), id, revision: 1 };
      resumes.set(id, created);
      return structuredClone(created);
    },

    async getResume(id) {
      requests.push({ operation: 'get', id });
      const current = resumes.get(id);
      if (!current) throw Object.assign(new Error('Resume not found'), { status: 404, code: 'RESUME_NOT_FOUND' });
      return structuredClone(current);
    },

    async deleteResume(id) {
      consumeFailure();
      requests.push({ operation: 'delete', id });
      resumes.delete(id);
      publications.delete(id);
      return true;
    },

    async publishResume(id, _clientData, { expectedRevision = null, expectedPublicationRevision = null } = {}) {
      consumeFailure();
      requests.push({ operation: 'publish', id, expectedRevision, expectedPublicationRevision });
      const current = resumes.get(id);
      if (!current || Number(expectedRevision) !== Number(current.revision)) throw conflict(id);
      const publication = publications.get(id);
      const currentPublicationRevision = Number(publication?.publicationRevision || 0);
      if (Number(expectedPublicationRevision ?? 0) !== currentPublicationRevision) throw conflict(id, 'Resume publication changed in another tab or device.');
      const next = {
        id,
        object: JSON.stringify(structuredClone(current)),
        publicationMode: 'explicit',
        isPublished: true,
        publicationRevision: currentPublicationRevision + 1,
      };
      publications.set(id, next);
      return structuredClone(next);
    },

    async getResumePublication(id) {
      requests.push({ operation: 'publication', id });
      const publication = publications.get(id);
      return publication ? structuredClone(publication) : { isPublished: false, publicationRevision: 0 };
    },

    async unpublishResume(id, { expectedPublicationRevision = null } = {}) {
      consumeFailure();
      requests.push({ operation: 'unpublish', id, expectedPublicationRevision });
      const publication = publications.get(id);
      const currentRevision = Number(publication?.publicationRevision || 0);
      if (Number(expectedPublicationRevision ?? 0) !== currentRevision) throw conflict(id, 'Resume publication changed in another tab or device.');
      publications.delete(id);
      return { isPublished: false, publicationRevision: currentRevision + 1 };
    },
  };

  return {
    api,
    requests,
    resumes,
    publications,
    failNext(error) { queuedFailure = error; },
    snapshot(id) { return structuredClone(resumes.get(id)); },
  };
}
