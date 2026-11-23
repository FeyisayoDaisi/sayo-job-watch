// Dev-only preload: fakes the ATS feeds so `apify run` works without network.
const real = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  const ok = (body) => ({ ok: true, status: 200, json: async () => body });
  if (u.includes('ashbyhq.com')) return ok({ jobs: [{ id: 'k1', title: 'Revenue Operations Lead', location: 'United States', isRemote: true, publishedAt: new Date(Date.now()-2*864e5).toISOString(), employmentType: 'FullTime', jobUrl: 'https://jobs.ashbyhq.com/koyfin/k1', descriptionPlain: 'Own RevOps', isListed: true }, { id: 'k2', title: 'Software Engineer', isListed: true, publishedAt: new Date().toISOString() }] });
  if (u.includes('greenhouse.io')) return ok({ jobs: [{ id: 1, title: 'Senior Sales Operations Analyst', updated_at: new Date(Date.now()-40*864e5).toISOString(), location: { name: 'Home based - EMEA' }, absolute_url: 'https://boards.greenhouse.io/canonical/jobs/1' }, { id: 2, title: 'Project Manager, AI Evaluation', updated_at: new Date().toISOString(), location: { name: 'Remote' }, absolute_url: 'https://boards.greenhouse.io/turing/jobs/2' }] });
  if (u.includes('lever.co')) return { ok: false, status: 404, json: async () => ({}) };
  return real(url, opts);
};
