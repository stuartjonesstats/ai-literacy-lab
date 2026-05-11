# Open-Source Strategy

## Positioning

AI Literacy Lab should be a free, open curriculum project that demonstrates serious learning design and practical AI governance judgment.

The project can support future workshops without becoming a closed product. The open materials create credibility, transparency, and reach. Workshops can add facilitation, customization, discussion, assessment, and organizational translation.

## Recommended Technology Direction

Start with plain Markdown for curriculum development.

Then build a static site using:

- Astro for the site framework
- MDX for curriculum pages with embedded interactive components
- small React components for simulations, choice activities, rubrics, and local progress
- GitHub Pages for free hosting
- localStorage for optional learner progress in the browser

Avoid accounts, databases, identity-verified credentials, and analytics in the first version unless a clear need emerges.

## Repository Shape

Suggested mature structure:

```text
ai-literacy-lab/
  README.md
  LICENSE.md
  docs/
    learning-design.md
    curriculum-map.md
    module-template.md
    open-source-strategy.md
  modules/
    01-good-and-bad-at.md
    02-confidently-wrong.md
    03-data-privacy-confidentiality.md
    04-bias-fairness-harm.md
    05-accountability-review.md
    06-everyday-use.md
    07-risk-escalation.md
    08-capstone.md
  facilitator/
    workshop-guide.md
    discussion-prompts.md
    adaptation-notes.md
  site/
    # future Astro app
```

## Licensing Recommendation

Use a clear license before publishing publicly.

Recommended split:

- Curriculum content: Creative Commons Attribution-NonCommercial 4.0
  International
- Code: MIT License

This keeps the project free for learning, adaptation, and noncommercial reuse
while preserving attribution. Commercial curriculum/content reuse requires
separate permission.

## Contribution Model

Early contribution areas:

- new scenarios
- module drafts
- facilitator notes
- accessibility improvements
- translations
- domain adaptation notes
- rubric improvements

Contribution guardrails:

- avoid vendor-specific marketing
- avoid time-bound claims unless clearly labeled
- avoid legal advice
- use synthetic examples unless rights and privacy are clear
- write for broad, nontechnical audiences
- preserve the scenario-first learning pattern

## Workshop Pathways

Future workshop formats can be built from the same open materials:

- 60-minute executive orientation
- 90-minute team session
- half-day applied AI judgment lab
- train-the-facilitator session
- role-specific adaptation workshop

The workshop value is not access to secret content. The value is facilitation, discussion, scenario selection, local policy alignment, and helping teams translate the open framework into real behavior.
