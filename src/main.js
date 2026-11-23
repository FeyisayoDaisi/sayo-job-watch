import { Actor, log } from 'apify';
import { ADAPTERS } from './adapters.js';
import { filterJobs } from './filter.js';

await Actor.init();

const input = (await Actor.getInput()) || {};
const boards = Array.isArray(input.boards) ? input.boards : [];
const keywords = Array.isArray(input.keywords) ? input.keywords : [];
const excludeKeywords = Array.isArray(input.excludeKeywords) ? input.excludeKeywords : [];
const postedWithinDays = Number.isFinite(Number(input.postedWithinDays)) ? Number(input.postedWithinDays) : 9;
const includeDescription = Boolean(input.includeDescription);

if (boards.length === 0) {
    await Actor.fail('Input "boards" is empty. Add at least one {company, ats, token} entry.');
}

const valid = [];
for (const b of boards) {
    const ats = String(b?.ats || '').toLowerCase().trim();
    if (!b?.company || !b?.token || !ADAPTERS[ats]) {
        log.warning(`Skipping invalid board entry ${JSON.stringify(b)}. Need company, token and ats in ${Object.keys(ADAPTERS).join(', ')}.`);
        continue;
    }
    valid.push({ company: String(b.company).trim(), token: String(b.token).trim(), ats });
}

log.info(`Reading ${valid.length} job boards (keywords: ${keywords.length}, exclude: ${excludeKeywords.length}, posted within ${postedWithinDays} days).`);

const status = [];
const allJobs = [];
const CONCURRENCY = 5;

async function readBoard(board) {
    const started = Date.now();
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const jobs = await ADAPTERS[board.ats](board, { includeDescription });
            status.push({ company: board.company, ats: board.ats, token: board.token, ok: true, totalJobs: jobs.length, ms: Date.now() - started });
            log.info(`${board.company} (${board.ats}/${board.token}): ${jobs.length} open jobs`);
            allJobs.push(...jobs);
            return;
        } catch (err) {
            const retryable = !err.status || err.status >= 500 || err.status === 429;
            if (attempt < 3 && retryable) {
                await new Promise((r) => setTimeout(r, 1500 * attempt));
                continue;
            }
            status.push({ company: board.company, ats: board.ats, token: board.token, ok: false, error: String(err.message || err), ms: Date.now() - started });
            log.warning(`${board.company} (${board.ats}/${board.token}) could not be read: ${err.message || err}`);
            return;
        }
    }
}

const queue = [...valid];
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) await readBoard(queue.shift());
}));

const matches = filterJobs(allJobs, { keywords, excludeKeywords, postedWithinDays, includeDescription });

await Actor.pushData(matches);

const summary = {
    boardsRequested: valid.length,
    boardsRead: status.filter((s) => s.ok).length,
    boardsFailed: status.filter((s) => !s.ok).map((s) => ({ company: s.company, error: s.error })),
    openJobsSeen: allJobs.length,
    matches: matches.length,
    postedWithinDays,
    ranAt: new Date().toISOString(),
    boards: status.sort((a, b) => a.company.localeCompare(b.company)),
};
await Actor.setValue('OUTPUT', summary);

log.info(`Done. ${summary.openJobsSeen} open jobs across ${summary.boardsRead}/${summary.boardsRequested} boards, ${summary.matches} matches.`);
if (summary.boardsFailed.length) log.warning(`Boards not read: ${summary.boardsFailed.map((b) => b.company).join(', ')}`);

await Actor.exit();
