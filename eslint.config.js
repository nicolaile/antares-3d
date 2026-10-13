import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

export default ts.config(
	{
		ignores: ['.svelte-kit/', 'build/', 'node_modules/', 'static/', 'ref/', 'src/lib/lab/', 'src/routes/(lab)/', 'scripts/lab/']
	},
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,
	prettier,
	...svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// TypeScript already reports undefined names, with better messages.
			'no-undef': 'off',
			// The site has no base path, so plain hrefs need no resolve().
			'svelte/no-navigation-without-resolve': 'off',
			// {@html} only renders SVG icons and article markup from this repo. Revisit if content ever comes from a CMS.
			'svelte/no-at-html-tags': 'off',
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts'],
		languageOptions: {
			parserOptions: { projectService: true, extraFileExtensions: ['.svelte'], parser: ts.parser }
		}
	}
);
