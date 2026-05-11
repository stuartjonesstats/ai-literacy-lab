# AI Literacy Lab

AI Literacy Lab is an open, free curriculum project for helping people build
practical judgment about AI use at work.

Live site: https://ailitlab.org

Source repository: https://github.com/stuartjonesstats/ai-literacy-lab

The project starts from a simple claim: AI literacy is not the ability to click through slides, memorize vocabulary, or pass a short quiz. AI literacy is the ability to make better decisions when AI systems are available, persuasive, incomplete, biased, useful, risky, or wrong.

## Guiding Principles

- Build judgment, not trivia.
- Use scenarios before definitions.
- Create productive struggle without humiliation.
- Stay generic enough to outlive specific tools, vendors, models, and headlines.
- Treat AI use as a human accountability problem, not only a technical problem.
- Assess decisions, reasoning, verification habits, and escalation choices.
- Make the materials reusable by educators, teams, public agencies, nonprofits, companies, and independent learners.
- Keep the public version no-login, local-first, and transparent about learner data.

## Initial Curriculum

1. What AI is good and bad at
2. Why confident answers can be wrong
3. Data, privacy, and confidentiality
4. Bias, fairness, and representational harm
5. Human accountability and review
6. Using AI well in everyday work
7. Risk classification and escalation
8. Capstone: realistic workplace AI decision simulation

## What This Is Not

The goal is not to move a learner from slide 1 to slide 30 and award a credential for exposure. The goal is to put learners into realistic decisions, let their first instincts be tested, and help them develop better habits for AI-mediated work.

## Project Shape

The project is curriculum-as-code:

- `docs/` contains the learning model, curriculum map, open-source strategy, and reusable templates.
- `modules/` contains draft learning modules.
- `facilitator/` contains workshop guides, discussion prompts, and adaptation notes.
- `research/` contains source notes and claim-discipline records.
- `site/` contains the Astro + MDX static site.

The web stack is Astro + MDX + small React interactive components. It is built
to work as a static site with no accounts, database, analytics, or required
backend.

## Professional Use

Organizations may use the public lab as a practice environment, team discussion
starter, or workshop backbone. It should be paired with local policies, approved
tooling guidance, data classification rules, and escalation paths.

The local rubric gates are heuristic prompts. They help learners slow down,
revise, and document reasoning; they do not verify correctness, identity,
policy compliance, legal sufficiency, or role authorization.

See `docs/organizational-adoption.md` for suggested adoption patterns.

## Local Site Development

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

Working public curriculum with eight interactive modules, pre/post reflection
bookends, local progress, facilitator materials, and a final learning record.
The next milestones are broader accessibility testing, stronger automated smoke
tests, pilot feedback, and continued source review.

## License

AI Literacy Lab uses a split license:

- Code is licensed under the MIT License.
- Curriculum/content is licensed under CC BY-NC 4.0.

See `LICENSE.md`, `LICENSE-CODE`, and `LICENSE-CONTENT.md`.
