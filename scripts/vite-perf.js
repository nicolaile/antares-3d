// @ts-nocheck — Node-side dev tooling; the project carries no Node types.
/**
 * Dev-server endpoint for the R1 perf runs (src/lib/three/perf.ts): saves
 * each run's frames and report under captures/perf/<label>/, where
 * scripts/perf-compare.mjs reads two runs side by side. `apply: 'serve'`
 * keeps it out of the production build entirely.
 *
 *   PUT /__perf/baseline/01.png      ← a captured frame
 *   PUT /__perf/baseline/report.json ← the run's timings
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('../captures/perf/', import.meta.url));

export function perfCaptures() {
	return {
		name: 'perf-captures',
		apply: 'serve',
		configureServer(server) {
			server.middlewares.use('/__perf', async (req, res) => {
				const [label, file] = (req.url ?? '').slice(1).split('?')[0].split('/');
				if (req.method !== 'PUT') {
					res.statusCode = 405;
					return res.end();
				}
				if (!/^[\w-]+$/.test(label ?? '') || !/^[\w-]+\.(png|json)$/.test(file ?? '')) {
					res.statusCode = 400;
					return res.end('bad path');
				}
				const chunks = [];
				for await (const chunk of req) chunks.push(chunk);
				await mkdir(`${DIR}${label}`, { recursive: true });
				await writeFile(`${DIR}${label}/${file}`, Buffer.concat(chunks));
				res.end('ok');
			});
		}
	};
}
