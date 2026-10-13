import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import { enhancedImages } from '@sveltejs/enhanced-img';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { defineConfig, type PluginOption } from 'vite';
import { perfCaptures } from './scripts/vite-perf.js';

// The lab (/cad, /systems, the model pipeline) is local-only and gitignored,
// so its dev plugin loads only where it exists.
const LAB_PLUGIN = 'scripts/lab/vite-cad-tags.js';
const lab: PluginOption[] = existsSync(LAB_PLUGIN)
	? [(await import(/* @vite-ignore */ pathToFileURL(LAB_PLUGIN).href)).cadTags()]
	: [];

export default defineConfig({
	server: {
		// The desktop launcher hands the dev server a free port through PORT;
		// Vite would otherwise insist on 5173 and collide with other projects.
		port: Number(process.env.PORT) || 5173
	},
	ssr: {
		// gsap's plugin entrypoints resolve to CommonJS under Node's ESM loader, so
		// `import { ScrollTrigger } from 'gsap/ScrollTrigger'` throws on a real Node
		// server; bundling gsap applies Vite's dev-SSR interop to the production build.
		noExternal: ['gsap']
	},
	plugins: [
		// Dev only: lets the CAD tagging tool (/cad/tag) save its tags.
		...lab,
		// Dev only: lets the R1 perf runs (perf.ts) save frames and timings.
		perfCaptures(),
		// Must run before sveltekit(): rewrites <enhanced:img> into a <picture>
		// with WebP/AVIF sources at build time.
		enhancedImages(),
		sveltekit({
			compilerOptions: {
				// Runes mode for the project, not its libraries; redundant from Svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Picks the host's adapter at build time; https://svelte.dev/docs/kit/adapters to pin one.
			adapter: adapter()
		})
	]
});
