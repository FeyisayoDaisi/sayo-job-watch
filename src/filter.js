// Pure filtering helpers, kept separate so they can be unit tested without network.

function norm(s) {
    return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function matchesKeywords(title, keywords) {
    if (!Array.isArray(keywords) || keywords.length === 0) return true;
    const t = norm(title);
    return keywords.some((k) => norm(k) && t.includes(norm(k)));
}

export function matchesExclude(title, excludeKeywords) {
    if (!Array.isArray(excludeKeywords) || excludeKeywords.length === 0) return false;
    const t = norm(title);
    return excludeKeywords.some((k) => norm(k) && t.includes(norm(k)));
}

export function isRecent(postedAt, postedWithinDays, now = Date.now()) {
    if (!postedWithinDays) return true;
    if (!postedAt) return true; // boards that do not publish a date are kept and flagged
    const t = new Date(postedAt).getTime();
    if (Number.isNaN(t)) return true;
    return now - t <= postedWithinDays * 24 * 60 * 60 * 1000;
}

export function filterJobs(jobs, { keywords, excludeKeywords, postedWithinDays, includeDescription }, now = Date.now()) {
    const seen = new Set();
    const out = [];
    for (const j of jobs) {
        if (!j || !j.title) continue;
        if (!matchesKeywords(j.title, keywords)) continue;
        if (matchesExclude(j.title, excludeKeywords)) continue;
        if (!isRecent(j.postedAt, postedWithinDays, now)) continue;
        const key = j.url || `${j.company}|${j.externalId}|${j.title}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const row = { ...j };
        if (!includeDescription) delete row.description;
        else if (row.description) row.description = row.description.slice(0, 3000);
        row.postedDaysAgo = row.postedAt ? Math.floor((now - new Date(row.postedAt).getTime()) / 86400000) : null;
        out.push(row);
    }
    out.sort((a, b) => (a.postedDaysAgo ?? 9999) - (b.postedDaysAgo ?? 9999) || a.company.localeCompare(b.company));
    return out;
}
