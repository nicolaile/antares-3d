import * as THREE from 'three';
import { MARK0_TURN, PHX_LIFT } from './assembly';
import { CAD_POINTS as LABELS } from './cadPoints';

/** The labels for a /cad view ('mark-0', 'power-conversion-system', 'assembled'; none for the others). */
export function cadLabels(view: string): { point: number; at: THREE.Vector3 }[] {
	if (view === 'assembled')
		return LABELS.filter((l) => l.assembled !== false).map((l) => {
			if (l.assembled) return { point: l.point, at: new THREE.Vector3(...l.assembled) };
			const at = new THREE.Vector3(...l.at);
			if (l.model === 'mark-0') at.applyAxisAngle(new THREE.Vector3(0, 1, 0), MARK0_TURN);
			if (l.lifts) at.y += PHX_LIFT;
			return { point: l.point, at };
		});
	return LABELS.filter((l) => l.model === view).map((l) => ({ point: l.point, at: new THREE.Vector3(...l.at) }));
}
