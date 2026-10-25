import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { headerHeightPx } from "./HeaderPlaceholder";
import { mountWater } from "./water";
import { QuadRenderer } from "./webgl";

jest.mock("./header-shader.frag", () => "display");
jest.mock("./water-sim.frag", () => "simulation");
jest.mock("./webgl", () => ({ QuadRenderer: { create: jest.fn() } }));

/**
 * Mount the water against a fake GL and DOM, with a hand-cranked clock and
 * animation frames, so a test can play out any frame rate and count the passes
 * that actually reach the GPU.
 */
function setup() {
	let now = 0;
	let nextId = 1;
	let viewportWidth = 1440;
	const frames = new Map<number, FrameRequestCallback>();
	const listeners = new Map<string, (event: PointerEvent) => void>();
	const canvas = {
		style: {}, width: 0, height: 0,
		addEventListener: (name: string, listener: (event: PointerEvent) => void) => listeners.set(name, listener),
		removeEventListener: jest.fn(), remove: jest.fn(),
		getBoundingClientRect: () => ({ left: 0, top: 0 }),
	};
	const probe = {
		style: {}, remove: jest.fn(),
		getBoundingClientRect: () => ({ width: viewportWidth }),
	};
	const host = { appendChild: jest.fn(), removeChild: jest.fn() };
	const program = () => ({
		use: jest.fn(),
		set1f: jest.fn<(name: string, value: number) => void>(),
		set2f: jest.fn<(name: string, a: number, b: number) => void>(),
		setTexture: jest.fn(), dispose: jest.fn(),
	});
	const display = program();
	const sim = program();
	const renderer = {
		linearFilter: true,
		program: jest.fn().mockReturnValueOnce(display).mockReturnValueOnce(sim),
		createTarget: jest.fn(() => ({ tex: {}, fbo: {} })),
		deleteTarget: jest.fn(),
		draw: jest.fn<(...args: unknown[]) => void>(),
		dispose: jest.fn(),
	};
	jest.mocked(QuadRenderer.create).mockReturnValue(renderer as unknown as QuadRenderer);
	jest.spyOn(performance, "now").mockImplementation(() => now);
	Object.assign(globalThis, {
		window: {
			innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1, scrollY: 0,
			addEventListener: jest.fn(), removeEventListener: jest.fn(),
		},
		document: {
			createElement: (tag: string) => tag === "canvas" ? canvas : probe,
			addEventListener: jest.fn(), removeEventListener: jest.fn(),
		},
		requestAnimationFrame: (cb: FrameRequestCallback) => {
			const id = nextId++;
			frames.set(id, cb);
			return id;
		},
		cancelAnimationFrame: (id: number) => frames.delete(id),
	});
	// no drips, so the only impulses are the ones a test makes
	const water = mountWater(host as unknown as HTMLElement, {
		getJsParams: () => ({ DRIP_AMBIENT_AMP: 0 }),
	})!;

	function frame(ms: number) {
		now = ms;
		const callbacks = [...frames.values()];
		frames.clear();
		callbacks.forEach(cb => cb(ms));
	}
	function move(ms: number, x: number) {
		now = ms;
		listeners.get("pointermove")!({ clientX: x, clientY: 50 } as PointerEvent);
	}
	function passes(shader: typeof display) {
		return renderer.draw.mock.calls.filter(call => call[0] === shader).length;
	}
	function setViewportWidth(w: number) {
		viewportWidth = w;
	}

	return { water, frame, frames, move, passes, sim, display, canvas, setViewportWidth };
}

afterEach(() => {
	jest.restoreAllMocks();
	for (const key of ["window", "document", "requestAnimationFrame", "cancelAnimationFrame"]) {
		Reflect.deleteProperty(globalThis, key);
	}
});

describe("frame loop", () => {
	it.each([30, 60, 120, 144])("runs the same physics, and draws at most 60fps, at %iHz", hz => {
		const s = setup();
		s.water.setLooping(true);
		for (let i = 0; i <= hz; i++) s.frame(i * 1000 / hz);
		// a second of water is 180 steps, give or take a frame the pacer
		// skipped at the very end
		expect(s.passes(s.sim)).toBeGreaterThanOrEqual(177);
		expect(s.passes(s.sim)).toBeLessThanOrEqual(180);
		expect(s.passes(s.display)).toBeLessThanOrEqual(61);
		expect(s.passes(s.display)).toBeGreaterThanOrEqual(Math.min(hz, 60) - 1);
		s.water.remove();
	});

	it("redraws a resized canvas while stopped, without running the sim", () => {
		const s = setup();
		s.frame(0);
		expect(s.passes(s.display)).toBe(1);
		expect(s.frames.size).toBe(0);

		s.setViewportWidth(800);
		s.water.resize();
		// a visibility change in between must not cancel the redraw
		s.water.setLooping(false);
		expect(s.frames.size).toBe(1);
		s.frame(5000);

		expect(s.canvas.width).toBe(800);
		expect(s.canvas.height).toBe(headerHeightPx(800));
		expect(s.passes(s.display)).toBe(2);
		expect(s.passes(s.sim)).toBe(0);
		expect(s.frames.size).toBe(0);
		s.water.remove();
	});
});

describe("pointer", () => {
	it("sweeps the dent along every move since the last sim step", () => {
		const s = setup();
		s.water.setLooping(true);
		s.frame(0);
		s.move(1, 100);
		s.move(5, 110);
		s.move(10, 120);
		s.frame(1000 / 60);
		const height = headerHeightPx(1440);
		expect(s.sim.set2f).toHaveBeenCalledWith("u_impulsePrev", 100 / 1440, 1 - 50 / height);
		expect(s.sim.set2f).toHaveBeenCalledWith("u_impulsePos", 120 / 1440, 1 - 50 / height);
		s.water.remove();
	});

	it("makes the same dent at any pointer event rate", () => {
		const amplitudes: number[] = [];
		// 60Hz, 120Hz and 240Hz pointer events, all at 600 CSS px per second
		for (const gap of [1000 / 60, 1000 / 120, 1000 / 240]) {
			const s = setup();
			s.water.setLooping(true);
			s.frame(0);
			s.move(1, 100);
			s.move(1 + gap, 100 + gap * 0.6);
			s.frame(1000 / 60);
			const dents = s.sim.set1f.mock.calls
				.filter(([name, value]) => name === "u_impulseAmp" && value > 0);
			amplitudes.push(dents[dents.length - 1][1]);
			s.water.remove();
		}
		expect(amplitudes[1]).toBeCloseTo(amplitudes[0], 6);
		expect(amplitudes[2]).toBeCloseTo(amplitudes[0], 6);
	});
});
