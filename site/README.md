# AI Literacy Lab Site

This is the Astro + MDX static site for AI Literacy Lab.

Live site: https://ailitlab.org

The site is intentionally local-first: learner progress, reflections, and the
learning record stay in the browser unless a learner chooses to share them.

## Stack

- Astro
- MDX
- React islands for interactive activities
- lucide-react for icons

## Commands

```bash
npm install
npm run dev
npm run build
npm run preview
```

## Structure

- `src/content/modules/` contains MDX module pages.
- `src/components/` contains interactive activities.
- `src/pages/` contains site routes.
- `src/layouts/` contains shared page chrome.

The broader curriculum drafts remain one directory up so the project can keep
plain Markdown curriculum assets separate from the web delivery layer.
