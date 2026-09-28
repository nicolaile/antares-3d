// `?w=…&enhanced` imports (an explicit width list) resolve to the same
// Picture as plain `?enhanced`; the package only types the plain form.
declare module '*&enhanced' {
	import type { Picture } from 'vite-imagetools';

	const value: Picture;
	export default value;
}
