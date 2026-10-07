// @ts-nocheck — Node-side dev tooling; the project carries no Node types.
/**
 * Dev-server endpoint for the CAD tagging tool (/cad/tag): reads and writes
 * scripts/cad-tags/<model>.json, so tags land in the repo, where
 * apply-cad-tags.mjs picks them up. `apply: 'serve'` keeps it out of the
 * production build entirely.
 *
 *   GET /__cad-tags/mark-0   → the saved tags, or 404
 *   PUT /__cad-tags/mark-0   ← the full tags file
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('./cad-tags/', import.meta.url));

export function cadTags() {
	return {
		name: 'cad-tags',
		apply: 'serve',
		configureServer(server) {
			server.middlewares.use('/__cad-tags', async (req, res) => {
				const model = (req.url ?? '').slice(1).split('?')[0];
				if (!/^[a-z0-9-]+$/.test(model)) {
					res.statusCode = 400;
					return res.end('bad model id');
				}
				const file = `${DIR}${model}.json`;

				if (req.method === 'GET') {
					try {
						const body = await readFile(file);
						res.setHeader('content-type', 'application/json');
						return res.end(body);
					} catch {
						res.statusCode = 404;
						return res.end();
					}
				}

				if (req.method === 'PUT') {
					let body = '';
					for await (const chunk of req) body += chunk;
					try {
						const data = JSON.parse(body);
						if (data.model !== model || typeof data.groups !== 'object') throw new Error('shape');
						await mkdir(DIR, { recursive: true });
						// One id per line: a re-tag shows up as a readable diff.
						await writeFile(file, JSON.stringify(data, null, '\t') + '\n');
						return res.end('ok');
					} catch {
						res.statusCode = 400;
						return res.end('invalid tags file');
					}
				}

				res.statusCode = 405;
				res.end();
			});
		}
	};
}
