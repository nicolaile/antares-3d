import adapter from '@sveltejs/adapter-auto';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
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
