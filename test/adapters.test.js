import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ashby, greenhouse, lever, workable, smartrecruiters } from '../src/adapters.js';

// Each test stubs global fetch with a payload shaped like the real public feed,
// so the adapters are checked without network access.
function stubFetch(handler) {
    const original = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
        const body = handler(String(url), opts);
        return { ok: true, status: 200, json: async () => body };
    };
    return () => { globalThis.fetch = original; };
}

test('ashby adapter normalises jobs and skips unlisted ones', async () => {
    const restore = stubFetch((url) => {
        assert.match(url, /api\.ashbyhq\.com\/posting-api\/job-board\/The%20Agency%20Fund/);
        return { jobs: [
            { id: 'a1', title: 'Forward Deployed Engineer', location: 'Global', secondaryLocations: [{ location: 'India' }], isRemote: true, publishedAt: '2026-11-20T10:00:00.000Z', employmentType: 'FullTime', jobUrl: 'https://jobs.ashbyhq.com/The%20Agency%20Fund/a1', descriptionHtml: '<p>Build things</p>', isListed: true },
            { id: 'a2', title: 'Hidden', isListed: false },
        ] };
    });
    try {
        const out = await ashby({ company: 'The Agency Fund', ats: 'ashby', token: 'The Agency Fund' }, {});
        assert.equal(out.length, 1);
        assert.deepEqual(out[0], { company: 'The Agency Fund', ats: 'ashby', title: 'Forward Deployed Engineer', location: 'Global; India', remote: true, employmentType: 'FullTime', postedAt: '2026-11-20T10:00:00.000Z', url: 'https://jobs.ashbyhq.com/The%20Agency%20Fund/a1', description: 'Build things', externalId: 'a1' });
    } finally { restore(); }
});

test('greenhouse adapter uses first_published then updated_at and reads offices', async () => {
    const restore = stubFetch((url) => {
        assert.match(url, /boards-api\.greenhouse\.io\/v1\/boards\/canonical\/jobs\?content=true/);
        return { jobs: [
            { id: 7, title: 'Senior Sales Operations Analyst', updated_at: '2026-11-18T09:00:00-05:00', first_published: '2026-11-10T09:00:00-05:00', location: { name: 'Home based - EMEA' }, absolute_url: 'https://boards.greenhouse.io/canonical/jobs/7', content: '&lt;p&gt;Role&lt;/p&gt;', offices: [{ name: 'EMEA' }] },
            { id: 8, title: 'Accountant', updated_at: '2026-11-18T09:00:00-05:00', location: { name: '' }, absolute_url: 'https://boards.greenhouse.io/canonical/jobs/8', offices: [{ name: 'London' }, { name: 'Remote' }] },
        ] };
    });
    try {
        const out = await greenhouse({ company: 'Canonical', ats: 'greenhouse', token: 'canonical' }, { includeDescription: true });
        assert.equal(out[0].postedAt, '2026-11-10T14:00:00.000Z');
        assert.equal(out[0].remote, true);
        assert.equal(out[0].description, 'Role');
        assert.equal(out[1].location, 'London; Remote');
        assert.equal(out[1].postedAt, '2026-11-18T14:00:00.000Z');
    } finally { restore(); }
});

test('lever adapter reads allLocations and createdAt', async () => {
    const restore = stubFetch(() => ([
        { id: 'l1', text: 'Business Analyst', categories: { commitment: 'Full-time', location: 'Remote', allLocations: ['Remote', 'Lagos'] }, createdAt: 1763856000000, hostedUrl: 'https://jobs.lever.co/x/l1', descriptionPlain: 'Analyse', workplaceType: 'remote' },
    ]));
    try {
        const out = await lever({ company: 'X', ats: 'lever', token: 'x' }, {});
        assert.equal(out[0].location, 'Remote; Lagos');
        assert.equal(out[0].remote, true);
        assert.equal(out[0].postedAt, new Date(1763856000000).toISOString());
    } finally { restore(); }
});

test('workable adapter posts, paginates and builds job URLs', async () => {
    let calls = 0;
    const restore = stubFetch((url, opts) => {
        calls++;
        assert.equal(opts.method, 'POST');
        const body = JSON.parse(opts.body);
        if (calls === 1) {
            assert.equal(body.token, undefined);
            return { results: [{ title: 'Revenue Operations Manager', shortcode: 'ABC123', remote: true, location: { city: 'Lagos', country: 'Nigeria' }, published: '2026-11-21T00:00:00Z', type: 'full' }], nextPage: 'p2' };
        }
        assert.equal(body.token, 'p2');
        return { results: [], nextPage: null };
    });
    try {
        const out = await workable({ company: 'RemoFirst', ats: 'workable', token: 'remofirst' }, {});
        assert.equal(calls, 2);
        assert.equal(out.length, 1);
        assert.equal(out[0].url, 'https://apply.workable.com/remofirst/j/ABC123/');
        assert.equal(out[0].location, 'Remote (Lagos, Nigeria)');
    } finally { restore(); }
});

test('smartrecruiters adapter paginates by totalFound', async () => {
    let calls = 0;
    const restore = stubFetch((url) => {
        calls++;
        const offset = Number(new URL(url).searchParams.get('offset'));
        return { totalFound: 150, content: Array.from({ length: offset === 0 ? 100 : 50 }, (_, i) => ({ id: `s${offset + i}`, name: 'Ops', releasedDate: '2026-11-20T00:00:00.000Z', location: { city: 'Nairobi', country: 'Kenya', remote: false } })) };
    });
    try {
        const out = await smartrecruiters({ company: 'S', ats: 'smartrecruiters', token: 's' }, {});
        assert.equal(calls, 2);
        assert.equal(out.length, 150);
        assert.equal(out[0].url, 'https://jobs.smartrecruiters.com/s/s0');
    } finally { restore(); }
});
