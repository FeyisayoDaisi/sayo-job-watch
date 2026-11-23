// One adapter per applicant tracking system. Each returns an array of
// normalised job objects from that ATS's public, unauthenticated job feed.
//
// Normalised job shape:
// { company, ats, title, location, remote, employmentType, postedAt (ISO or null),
//   url, description (plain text or null), externalId }

const UA = 'sayo-job-watch/0.1 (job feed reader; contact via GitHub FeyisayoDaisi)';

export async function fetchJson(url, { method = 'GET', body, timeoutMs = 30000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            method,
            headers: { 'accept': 'application/json', 'user-agent': UA, ...(body ? { 'content-type': 'application/json' } : {}) },
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });
        if (!res.ok) {
            const err = new Error(`HTTP ${res.status} for ${url}`);
            err.status = res.status;
            throw err;
        }
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
}

export function stripHtml(html) {
    if (!html || typeof html !== 'string') return null;
    // Greenhouse ships job content HTML-escaped, so decode entities first, then strip tags.
    const decoded = html
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&');
    return decoded
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n+/g, '\n')
        .trim();
}

function iso(value) {
    if (value === null || value === undefined || value === '') return null;
    const d = typeof value === 'number' ? new Date(value) : new Date(String(value));
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function text(value) {
    return typeof value === 'string' ? value.trim() : null;
}

// Ashby: https://api.ashbyhq.com/posting-api/job-board/<token>
export async function ashby(board) {
    const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board.token)}?includeCompensation=false`;
    const data = await fetchJson(url);
    const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
    return jobs
        .filter((j) => j && j.isListed !== false)
        .map((j) => {
            const extra = Array.isArray(j.secondaryLocations) ? j.secondaryLocations.map((l) => text(l?.location)).filter(Boolean) : [];
            const location = [text(j.location), ...extra].filter(Boolean).join('; ') || null;
            return {
                company: board.company,
                ats: 'ashby',
                title: text(j.title),
                location,
                remote: typeof j.isRemote === 'boolean' ? j.isRemote : null,
                employmentType: text(j.employmentType),
                postedAt: iso(j.publishedAt),
                url: text(j.jobUrl) || `https://jobs.ashbyhq.com/${encodeURIComponent(board.token)}/${j.id}`,
                description: text(j.descriptionPlain) || stripHtml(j.descriptionHtml),
                externalId: String(j.id ?? ''),
            };
        });
}

// Greenhouse: https://boards-api.greenhouse.io/v1/boards/<token>/jobs?content=true
export async function greenhouse(board, { includeDescription }) {
    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board.token)}/jobs${includeDescription ? '?content=true' : ''}`;
    const data = await fetchJson(url);
    const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
    return jobs.map((j) => {
        const offices = Array.isArray(j.offices) ? j.offices.map((o) => text(o?.name)).filter(Boolean) : [];
        const location = text(j.location?.name) || offices.join('; ') || null;
        return {
            company: board.company,
            ats: 'greenhouse',
            title: text(j.title),
            location,
            remote: /remote|home based|anywhere/i.test(location || '') ? true : null,
            employmentType: null,
            postedAt: iso(j.first_published) || iso(j.updated_at),
            url: text(j.absolute_url),
            description: includeDescription ? stripHtml(j.content) : null,
            externalId: String(j.id ?? ''),
        };
    });
}

// Lever: https://api.lever.co/v0/postings/<token>?mode=json
export async function lever(board) {
    const url = `https://api.lever.co/v0/postings/${encodeURIComponent(board.token)}?mode=json`;
    const data = await fetchJson(url);
    const jobs = Array.isArray(data) ? data : [];
    return jobs.map((j) => {
        const cats = j.categories || {};
        const all = Array.isArray(cats.allLocations) ? cats.allLocations.map(text).filter(Boolean) : [];
        const location = all.length ? all.join('; ') : text(cats.location);
        return {
            company: board.company,
            ats: 'lever',
            title: text(j.text),
            location: location || null,
            remote: j.workplaceType ? /remote/i.test(String(j.workplaceType)) : null,
            employmentType: text(cats.commitment),
            postedAt: iso(j.createdAt),
            url: text(j.hostedUrl),
            description: text(j.descriptionPlain),
            externalId: String(j.id ?? ''),
        };
    });
}

// Workable: POST https://apply.workable.com/api/v3/accounts/<token>/jobs
export async function workable(board) {
    const base = `https://apply.workable.com/api/v3/accounts/${encodeURIComponent(board.token)}/jobs`;
    const out = [];
    let token;
    for (let page = 0; page < 20; page++) {
        const data = await fetchJson(base, { method: 'POST', body: { query: '', location: [], department: [], worktype: [], remote: [], ...(token ? { token } : {}) } });
        const results = Array.isArray(data?.results) ? data.results : [];
        for (const j of results) {
            const loc = j.location || {};
            const location = [text(loc.city), text(loc.region), text(loc.country)].filter(Boolean).join(', ') || null;
            out.push({
                company: board.company,
                ats: 'workable',
                title: text(j.title),
                location: j.remote ? (location ? `Remote (${location})` : 'Remote') : location,
                remote: typeof j.remote === 'boolean' ? j.remote : null,
                employmentType: text(j.type) || text(j.employmentType),
                postedAt: iso(j.published),
                url: `https://apply.workable.com/${encodeURIComponent(board.token)}/j/${j.shortcode}/`,
                description: null,
                externalId: String(j.shortcode ?? j.id ?? ''),
            });
        }
        token = data?.nextPage || data?.paging?.next || null;
        if (!token || results.length === 0) break;
    }
    return out;
}

// SmartRecruiters: https://api.smartrecruiters.com/v1/companies/<token>/postings
export async function smartrecruiters(board) {
    const out = [];
    const limit = 100;
    for (let offset = 0; offset < 2000; offset += limit) {
        const url = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(board.token)}/postings?limit=${limit}&offset=${offset}`;
        const data = await fetchJson(url);
        const items = Array.isArray(data?.content) ? data.content : [];
        for (const j of items) {
            const loc = j.location || {};
            const location = [text(loc.city), text(loc.region), text(loc.country)].filter(Boolean).join(', ') || null;
            out.push({
                company: board.company,
                ats: 'smartrecruiters',
                title: text(j.name),
                location: loc.remote ? (location ? `Remote (${location})` : 'Remote') : location,
                remote: typeof loc.remote === 'boolean' ? loc.remote : null,
                employmentType: text(j.typeOfEmployment?.label),
                postedAt: iso(j.releasedDate),
                url: `https://jobs.smartrecruiters.com/${encodeURIComponent(board.token)}/${j.id}`,
                description: null,
                externalId: String(j.id ?? ''),
            });
        }
        const total = Number(data?.totalFound ?? 0);
        if (items.length < limit || offset + limit >= total) break;
    }
    return out;
}

export const ADAPTERS = { ashby, greenhouse, lever, workable, smartrecruiters };
