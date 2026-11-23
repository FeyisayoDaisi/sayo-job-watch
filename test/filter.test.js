import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterJobs, matchesKeywords, matchesExclude, isRecent } from '../src/filter.js';
import { stripHtml } from '../src/adapters.js';

const NOW = Date.parse('2026-11-23T12:00:00Z');
const days = (n) => new Date(NOW - n * 86400000).toISOString();

test('keyword matching is case-insensitive and substring based', () => {
    assert.equal(matchesKeywords('Senior RevOps Specialist', ['revops']), true);
    assert.equal(matchesKeywords('Revenue Operations Lead', ['revenue operations']), true);
    assert.equal(matchesKeywords('Backend Engineer', ['revops', 'crm']), false);
    assert.equal(matchesKeywords('Anything', []), true);
});

test('exclude matching drops noise titles', () => {
    assert.equal(matchesExclude('Software Engineer, CRM', ['software engineer']), true);
    assert.equal(matchesExclude('Director of Revenue Operations', ['director']), true);
    assert.equal(matchesExclude('Revenue Operations Manager', ['director', 'vp ']), false);
});

test('recency keeps undated jobs and drops old ones', () => {
    assert.equal(isRecent(days(3), 9, NOW), true);
    assert.equal(isRecent(days(30), 9, NOW), false);
    assert.equal(isRecent(null, 9, NOW), true);
});

test('filterJobs applies all rules, dedupes and sorts newest first', () => {
    const jobs = [
        { company: 'Koyfin', ats: 'ashby', title: 'Revenue Operations Lead', postedAt: days(2), url: 'https://x/1', externalId: '1', description: 'a'.repeat(5000) },
        { company: 'Koyfin', ats: 'ashby', title: 'Revenue Operations Lead', postedAt: days(2), url: 'https://x/1', externalId: '1' },
        { company: 'GitLab', ats: 'greenhouse', title: 'Director, Sales Operations', postedAt: days(1), url: 'https://x/2', externalId: '2' },
        { company: 'Canonical', ats: 'greenhouse', title: 'Senior Sales Operations Analyst', postedAt: days(40), url: 'https://x/3', externalId: '3' },
        { company: 'Supabase', ats: 'ashby', title: 'GTM Strategic Planning', postedAt: null, url: 'https://x/4', externalId: '4' },
        { company: 'Turing', ats: 'greenhouse', title: 'Project Manager, AI Evaluation', postedAt: days(0), url: 'https://x/5', externalId: '5' },
    ];
    const out = filterJobs(jobs, { keywords: ['revenue operations', 'sales operations', 'gtm', 'project manager'], excludeKeywords: ['director'], postedWithinDays: 9, includeDescription: true }, NOW);
    assert.deepEqual(out.map((j) => j.company), ['Turing', 'Koyfin', 'Supabase']);
    assert.equal(out[1].description.length, 3000);
    assert.equal(out[2].postedDaysAgo, null);
    assert.equal(out[0].postedDaysAgo, 0);
});

test('filterJobs drops description when not requested', () => {
    const out = filterJobs([{ company: 'A', ats: 'lever', title: 'RevOps', postedAt: days(1), url: 'u', externalId: '1', description: 'x' }], { keywords: [], excludeKeywords: [], postedWithinDays: 9, includeDescription: false }, NOW);
    assert.equal('description' in out[0], false);
});

test('stripHtml produces readable plain text', () => {
    const t = stripHtml('<div><p>Hello&nbsp;<b>world</b></p><ul><li>one</li><li>two &amp; three</li></ul><script>x()</script></div>');
    assert.equal(t, 'Hello world\none\ntwo & three');
});
