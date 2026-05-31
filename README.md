# AI Literacy Lab

AI Literacy Lab is a free, open-source training lab for helping office workers
build practical judgment about AI use at work.

Live site: https://ailitlab.org

Source repository: https://github.com/stuartjonesstats/ai-literacy-lab

The project starts from a simple claim: AI literacy is not the ability to click
through slides, memorize vocabulary, or pass a short quiz. AI literacy is the
ability to make better decisions when AI systems are available, persuasive,
incomplete, biased, useful, risky, or wrong.

## Current Release

**v1.0.0** is the first stable public release of the lab. It includes:

- seven interactive modules plus a capstone simulation
- pre- and post-reflection bookends
- local-only progress tracking
- a self-attested learning record
- facilitator guidance and team deployment notes
- source-informed grounding for the major topics

The public lab is designed for individual learning, workshop pre-work, team
discussion, and ad hoc professional development. It is not designed to replace
an organization's LMS, required policy training, legal review, or approved-tool
governance.

## Guiding Principles

- Build judgment, not trivia.
- Use scenarios before definitions.
- Create productive struggle without humiliation.
- Stay generic enough to outlive specific tools, vendors, models, and headlines.
- Treat AI use as a human accountability problem, not only a technical problem.
- Assess decisions, reasoning, verification habits, and escalation choices.
- Make the materials reusable by educators, teams, public agencies, nonprofits, companies, and independent learners.
- Keep the public version no-login, local-first, and transparent about learner data.

## Curriculum

1. What AI is good and bad at
2. Why confident answers can be wrong
3. Data, privacy, and confidentiality
4. Bias, fairness, and representational harm
5. Human accountability and review
6. Using AI well in everyday work
7. Risk classification and escalation
8. Capstone: realistic workplace AI decision simulation

## What This Is Not

The goal is not to move a learner from slide 1 to slide 30 and award a
credential for exposure. The goal is to put learners into realistic decisions,
let their first instincts be tested, and help them develop better habits for
AI-mediated work.

This project is not:

- identity-verified certification
- proctored assessment
- legal, HR, privacy, security, procurement, medical, or financial advice
- approval to use a specific AI tool
- organization-specific compliance evidence
- a substitute for local policy, records, accessibility, or escalation rules

## Project Shape

The project is curriculum-as-code:

- `docs/` contains the learning model, curriculum map, open-source strategy, and reusable templates.
- `modules/` contains draft learning modules.
- `facilitator/` contains workshop guides, discussion prompts, and adaptation notes.
- `research/` contains source notes and claim-discipline records.
- `site/` contains the Astro + MDX static site.

The web stack is Astro + MDX + small React interactive components. It is built
to work as a static site with no accounts, database, analytics, or required
backend. Optional Google Analytics can be enabled at build time with
`PUBLIC_GA_MEASUREMENT_ID`; the GitHub Pages workflow reads this from the
repository variable `GA_MEASUREMENT_ID`.

## Professional Use

Organizations and teams may use the public lab as a practice environment, team
discussion starter, workshop backbone, or optional supplement to existing
training. It should be paired with local policies, approved tooling guidance,
data classification rules, role-specific obligations, and escalation paths.

The local rubric gates are heuristic prompts. They help learners slow down,
revise, and document reasoning; they do not verify correctness, identity,
policy compliance, legal sufficiency, or role authorization.

See `docs/organizational-adoption.md` and the live
[For Teams](https://ailitlab.org/for-teams/) page for suggested adoption
patterns.

## Local Site Development

Requirements:

- Node.js 22.12 or newer
- npm

```bash
cd site
npm install
npm run dev
```

Production build:

```bash
cd site
npm run build
```

## Status

Stable public release. The next likely improvements are pilot feedback,
accessibility testing, optional sector adaptation notes, stronger smoke tests,
and continued source review.

## License

AI Literacy Lab uses a split license:

- Code is licensed under the MIT License.
- Curriculum/content is licensed under CC BY-NC 4.0.

See `LICENSE.md`, `LICENSE-CODE`, and `LICENSE-CONTENT.md`.
