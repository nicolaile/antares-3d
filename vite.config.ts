import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import { enhancedImages } from '@sveltejs/enhanced-img';
import { defineConfig } from 'vite';

export default defineConfig({
	server: {
		// The desktop launcher hands the dev server a free port through PORT;
		// Vite would otherwise insist on 5173 and collide with other projects.
		port: Number(process.env.PORT) || 5173
	},
	ssr: {
		// gsap's plugin entrypoints resolve to CommonJS under Node's ESM loader,
		// so `import { ScrollTrigger } from 'gsap/ScrollTrigger'` throws
		// "Named export not found" at runtime on the server. Vite's dev SSR
		// papers over it with interop; a real Node server does not. Bundling
		// gsap into the server output instead of leaving it external applies
		// that same interop to the production build.
		noExternal: ['gsap']
	},
	plugins: [
		// Must run before sveltekit(): rewrites <enhanced:img> into a <picture>
		// with WebP/AVIF sources at build time.
		enhancedImages(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
			// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
			// See https://svelte.dev/docs/kit/adapters for more information about adapters.
			adapter: adapter()
		})
	]
});
