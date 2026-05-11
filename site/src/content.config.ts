import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const modules = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/modules' }),
  schema: z.object({
    title: z.string(),
    order: z.number(),
    durableQuestion: z.string(),
    status: z.enum(['active', 'draft', 'stub']),
    summary: z.string(),
    estimatedMinutes: z.number(),
  }),
});

export const collections = {
  modules,
};
