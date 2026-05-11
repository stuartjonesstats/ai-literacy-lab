# Privacy and Local-First Learning

AI Literacy Lab should be usable without accounts, logins, tracking, or learner surveillance.

## Default Stance

The public version should be:

- no-login
- no required backend
- no database
- no learner account
- no hidden submission of written responses
- no analytics by default

Interactive activities may use browser state while the page is open. If progress persistence is added later, it should be local-first and clearly disclosed.

## Learner Writing

Learner rewrites, reflections, decisions, and notes should stay on the learner's device by default.

Acceptable local-only patterns:

- React state for temporary activity progress
- optional `localStorage` for explicit saved progress
- copyable reflection summaries
- downloadable local files

Patterns to avoid in the open public version:

- silent submission of learner text
- account-based progress tracking
- required email capture
- opaque AI grading
- workshop surveillance dashboards

## Self-Check Rubrics

Self-check rubrics can provide useful scaffolding without collecting learner data.

Rubrics should be transparent:

- show what criteria are being checked
- avoid pretending simple checks are full understanding
- invite learner judgment
- disclose that responses are not submitted

## Optional Future Modes

Future workshop or organizational modes may add submission, export, or facilitator review, but those should be opt-in and clearly separate from the public curriculum.

