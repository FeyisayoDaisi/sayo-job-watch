# Sayo Job Watch

Reads the public job feeds of a fixed list of employers and returns one clean table of the roles that match your keywords. Built for a weekly employer watch: you name the companies, the actor reads their boards directly, so there is no per-result fee and a run costs a fraction of one compute unit.

## What it reads

| ATS | Feed used | Token is |
|---|---|---|
| Ashby | `api.ashbyhq.com/posting-api/job-board/<token>` | the name in `jobs.ashbyhq.com/<token>` |
| Greenhouse | `boards-api.greenhouse.io/v1/boards/<token>/jobs` | the name in `boards.greenhouse.io/<token>` or `job-boards.greenhouse.io/<token>` |
| Lever | `api.lever.co/v0/postings/<token>?mode=json` | the name in `jobs.lever.co/<token>` |
| Workable | `apply.workable.com/api/v3/accounts/<token>/jobs` | the name in `apply.workable.com/<token>` |
| SmartRecruiters | `api.smartrecruiters.com/v1/companies/<token>/postings` | the company identifier in `jobs.smartrecruiters.com/<token>` |

All five are public, unauthenticated feeds published by the ATS for exactly this use. No browser, no proxies, no login.

## Input

```json
{
  "boards": [
    { "company": "Canonical", "ats": "greenhouse", "token": "canonical" },
    { "company": "Supabase", "ats": "ashby", "token": "supabase" }
  ],
  "keywords": ["revenue operations", "revops", "sales operations", "crm"],
  "excludeKeywords": ["intern", "software engineer", "director"],
  "postedWithinDays": 9,
  "includeDescription": false
}
```

- **boards** (required): one entry per employer. Entries with an unknown `ats` are skipped with a warning.
- **keywords**: a job is kept when its title contains any keyword (case-insensitive). Empty keeps everything.
- **excludeKeywords**: a job is dropped when its title contains any of these.
- **postedWithinDays**: default 9. Boards that publish no date keep their jobs, flagged with `postedAt: null`.
- **includeDescription**: adds up to 3,000 characters of plain-text description per row.

## Output

Each dataset row:

```json
{
  "company": "Koyfin",
  "ats": "ashby",
  "title": "Revenue Operations Lead",
  "location": "United States; Canada",
  "remote": true,
  "employmentType": "FullTime",
  "postedAt": "2026-11-18T14:02:11.000Z",
  "postedDaysAgo": 5,
  "url": "https://jobs.ashbyhq.com/koyfin/...",
  "externalId": "..."
}
```

Rows are deduplicated by URL and sorted newest first. The key-value store record `OUTPUT` holds a run summary: boards requested, boards read, boards that failed (with the error), open jobs seen and matches.

## Finding a company's token

Open the company's careers page and look at where "Apply" links go. The host tells you the ATS and the first path segment is the token. Examples confirmed on 23 Nov 2026: Supabase, RevenueCat, Zapier, Andela, M-KOPA, Kraken (`kraken.com`), PostHog, Oyster, Koyfin and The Agency Fund on Ashby; Canonical, GitLab, Wikimedia, Payoneer, GiveDirectly, One Acre Fund and Turing on Greenhouse.

Companies that run their own careers site (for example Automattic, Deel, Wise, Remote.com, Toptal) are not covered by this actor.

## Cost

One run over about 20 boards finishes in well under a minute on the smallest memory setting, so it uses a small fraction of a compute unit. There is no actor rental fee.

## Development

```
npm install
npm test        # unit tests with stubbed feeds, no network needed
apify run       # local run (needs network access to the ATS APIs)
apify push      # deploy
```
