// ============================================================================
// FLOATING OBJECTS
//
// Leaves that blow into the pool now and then, and rubber ducks for whoever
// finds them. The motion lives here, in CSS px with y down like the pointer;
// the shader only draws what pack() hands it. Nothing here reads the GPU: the
// floaters drift on the wind and get shoved by the pointer and by splashes,
// which is enough to read as afloat without reading the wave heights back.
// ============================================================================

export const MAX_FLOATERS = 4; // must match the u_floatA/u_floatB array size

type Kind = "leaf" | "duck";

type Floater = {
	kind: Kind;
	x: number;
	y: number;
	vx: number;
	vy: number;
	angle: number; // radians, CSS orientation (y down)
	spin: number; // radians per second
	size: number; // CSS px across
	fall: number; // 1 when it starts falling in, 0 once afloat
	opacity: number;
	variant: number; // leaf color, 0 yellow .. 1 brown
	seed: number;
	beached: number; // seconds spent pressed against a wall
	age: number; // seconds afloat
	fading: boolean;
};

/** A drop landing on the water, for the caller to turn into a ripple. */
export type Landing = { x: number; y: number; amp: number };

const LEAF_TILES = 1.9; // leaf size in tiles
const DUCK_TILES = 2.3;
const MAX_DUCKS = 3;
const MAX_LEAVES = 2;
// Seconds between leaves blowing in. The first comes sooner so a visitor who
// stays a little while is likely to see one.
const FIRST_LEAF_S: [number, number] = [6, 14];
const LEAF_GAP_S: [number, number] = [35, 80];
const FALL_S = 1.3; // a leaf's flutter down to the water
const DUCK_FALL_S = 0.45;
const WIND_PX_S = 7; // the breeze, blowing left to right
const LEAF_LIFE_S = 150; // a soaked leaf sinks after this long
const BEACHED_S = 9; // a leaf pressed against the wall sinks after this long
const FADE_S = 2.5;

function rand(min: number, max: number) {
	return min + Math.random() * (max - min);
}

export class Floaters {
	private list: Floater[] = [];
	private nextLeafAt: number;
	private time = 0;
	readonly a = new Float32Array(MAX_FLOATERS * 4);
	readonly b = new Float32Array(MAX_FLOATERS * 4);

	constructor(private autoLeaves: boolean) {
		this.nextLeafAt = rand(...FIRST_LEAF_S);
	}

	/** Advance by dt seconds. Returns anything that landed this step. */
	step(dt: number, width: number, height: number, tile: number): Landing[] {
		dt = Math.min(dt, 0.05);
		this.time += dt;
		const landings: Landing[] = [];

		if (this.autoLeaves && this.time >= this.nextLeafAt) {
			this.nextLeafAt = this.time + rand(...LEAF_GAP_S);
			if (this.list.filter(f => f.kind === "leaf").length < MAX_LEAVES) {
				// blow in from the upwind half, so it has somewhere to drift to
				this.add({
					kind: "leaf",
					x: rand(0.08, 0.6) * width,
					y: rand(0.15, 0.85) * height,
					size: tile * LEAF_TILES * rand(0.85, 1.15),
					variant: Math.random(),
				});
			}
		}

		const windX = WIND_PX_S * (0.7 + 0.3 * Math.sin(this.time * 0.11));
		for (const f of this.list) {
			const seconds = f.kind === "duck" ? DUCK_FALL_S : FALL_S;
			if (f.fall > 0) {
				f.fall = Math.max(0, f.fall - dt / seconds);
				if (f.kind === "leaf") {
					// flutter side to side on the way down
					f.x += Math.sin(this.time * 5 + f.seed * 10) * 22 * dt * f.fall;
					f.angle += Math.sin(this.time * 3 + f.seed * 7) * 1.5 * dt;
				}
				if (f.fall === 0) {
					landings.push({ x: f.x, y: f.y, amp: f.kind === "duck" ? 0.3 : 0.12 });
				}
				continue;
			}

			f.age += dt;
			// a duck sits higher in the water and catches less of the breeze
			const catchWind = f.kind === "duck" ? 0.5 : 1.0;
			const windY = 2.5 * Math.sin(this.time * 0.07 + f.seed * 6);
			const relax = 1 - Math.exp(-dt * 0.5);
			f.vx += (windX * catchWind - f.vx) * relax;
			f.vy += (windY * catchWind - f.vy) * relax;
			f.x += f.vx * dt;
			f.y += f.vy * dt;
			f.angle += f.spin * dt + Math.sin(this.time * 0.8 + f.seed * 9) * 0.05 * dt;
			f.spin *= Math.exp(-dt * 0.9);

			const margin = f.size * 0.35;
			let hit = false;
			if (f.x < margin) { f.x = margin; f.vx = Math.abs(f.vx) * 0.4; hit = true; }
			if (f.x > width - margin) { f.x = width - margin; f.vx = -Math.abs(f.vx) * 0.4; hit = true; }
			if (f.y < margin) { f.y = margin; f.vy = Math.abs(f.vy) * 0.4; hit = true; }
			if (f.y > height - margin) { f.y = height - margin; f.vy = -Math.abs(f.vy) * 0.4; hit = true; }
			if (f.kind === "leaf") {
				f.beached = hit ? f.beached + dt : Math.max(0, f.beached - dt);
				if (f.beached > BEACHED_S || f.age > LEAF_LIFE_S) f.fading = true;
			}
			if (f.fading) f.opacity -= dt / FADE_S;
		}

		// keep them from overlapping: push pairs apart along the line between
		for (let i = 0; i < this.list.length; i++) {
			for (let j = i + 1; j < this.list.length; j++) {
				const p = this.list[i];
				const q = this.list[j];
				if (p.fall > 0 || q.fall > 0) continue;
				const dx = q.x - p.x;
				const dy = q.y - p.y;
				const dist = Math.hypot(dx, dy) || 1;
				const minDist = (p.size + q.size) * 0.42;
				if (dist < minDist) {
					const push = (minDist - dist) * 0.5;
					p.x -= (dx / dist) * push;
					p.y -= (dy / dist) * push;
					q.x += (dx / dist) * push;
					q.y += (dy / dist) * push;
				}
			}
		}

		this.list = this.list.filter(f => f.opacity > 0);
		return landings;
	}

	/** A pointer moved from (x - dx, y - dy) to (x, y) over dtMs. */
	stir(x: number, y: number, dx: number, dy: number, dtMs: number) {
		const dt = Math.max(dtMs, 8) / 1000;
		for (const f of this.list) {
			if (f.fall > 0) continue;
			const rx = f.x - x;
			const ry = f.y - y;
			const reach = f.size * 0.55 + 18;
			const d = Math.hypot(rx, ry);
			if (d > reach) continue;
			const k = 0.35 * (1 - d / reach);
			f.vx += Math.max(-200, Math.min(200, (dx / dt) * k));
			f.vy += Math.max(-200, Math.min(200, (dy / dt) * k));
			// pushed off-centre, it turns
			f.spin += ((rx * dy - ry * dx) / (reach * reach)) * 2.5;
		}
	}

	/** A splash at (x, y) pushes everything nearby outward. */
	splash(x: number, y: number, strength: number, reach = 140) {
		for (const f of this.list) {
			if (f.fall > 0) continue;
			const rx = f.x - x;
			const ry = f.y - y;
			const d = Math.hypot(rx, ry) || 1;
			if (d > reach) continue;
			const k = strength * 90 * (1 - d / reach);
			f.vx += (rx / d) * k;
			f.vy += (ry / d) * k;
			f.spin += (Math.random() - 0.5) * strength * 3;
		}
	}

	addDuck(x: number, y: number, tile: number) {
		const ducks = this.list.filter(f => f.kind === "duck");
		if (ducks.length >= MAX_DUCKS) this.remove(ducks[0]);
		this.add({ kind: "duck", x, y, size: tile * DUCK_TILES, variant: 0 });
	}

	/** Drop a leaf in now, for previews. */
	addLeaf(x: number, y: number, tile: number) {
		this.add({ kind: "leaf", x, y, size: tile * LEAF_TILES, variant: Math.random() });
	}

	private add(init: { kind: Kind; x: number; y: number; size: number; variant: number }) {
		if (this.list.length >= MAX_FLOATERS) {
			// make room by dropping the oldest leaf, or failing that the oldest duck
			this.remove(this.list.find(f => f.kind === "leaf") ?? this.list[0]);
		}
		this.list.push({
			...init,
			vx: rand(-6, 6),
			vy: rand(-6, 6),
			angle: rand(0, Math.PI * 2),
			spin: rand(-0.3, 0.3),
			fall: 1,
			opacity: 1,
			seed: Math.random(),
			beached: 0,
			age: 0,
			fading: false,
		});
	}

	private remove(f: Floater) {
		this.list = this.list.filter(g => g !== f);
	}

	/** Pack into the shader's uniform layout, in its uv units (y up). */
	pack(height: number) {
		this.a.fill(0);
		this.b.fill(0);
		this.list.forEach((f, i) => {
			const fall = f.fall * f.fall; // eased: slows as it nears the water
			this.a.set([f.x / height, 1 - f.y / height, -f.angle, f.kind === "duck" ? 2 : 1], i * 4);
			this.b.set([f.size / height, fall * 0.3, Math.min(1, f.opacity, (1 - f.fall) * 4 + 0.35), f.variant], i * 4);
		});
	}
}
