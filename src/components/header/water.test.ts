import { afterEach, expect, it, jest } from "@jest/globals";
import { mountWater, type InputBus } from "./water";
import { QuadRenderer } from "./webgl";

jest.mock("./header-shader.frag", () => "const float GUST_DEPTH = 0.60;\nconst float GUST_RATE = 0.05;");
jest.mock("./water-sim.frag", () => "simulation");
jest.mock("./webgl", () => ({ QuadRenderer: { create: jest.fn() } }));

function setup(useInput = true) {
	let now = 0;
	let nextId = 1;
	const frames = new Map<number, FrameRequestCallback>();
	const canvas = {
		style: {}, width: 0, height: 0,
		addEventListener: jest.fn<(name: string, listener: (event: PointerEvent) => void, options?: unknown) => void>(),
		removeEventListener: jest.fn(), remove: jest.fn(),
		getBoundingClientRect: () => ({ left: 0, top: 0 }),
	};
	const host = { appendChild: jest.fn(), removeChild: jest.fn() };
	const program = () => ({ use: jest.fn(), set1f: jest.fn<(name: string, value: number) => void>(), set2f: jest.fn(), set4fv: jest.fn(), setTexture: jest.fn(), dispose: jest.fn() });
	const display = program();
	const sim = program();
	const renderer = {
		linearFilter: true,
		program: jest.fn().mockReturnValueOnce(display).mockReturnValueOnce(sim),
		createTarget: jest.fn(() => ({ tex: {}, fbo: {} })),
		deleteTarget: jest.fn(), draw: jest.fn<(...args: unknown[]) => void>(), dispose: jest.fn(),
	};
	jest.mocked(QuadRenderer.create).mockReturnValue(renderer as unknown as QuadRenderer);
	jest.spyOn(performance, "now").mockImplementation(() => now);
	Object.assign(globalThis, {
		window: { innerWidth: 1440, devicePixelRatio: 2, scrollY: 0, addEventListener: jest.fn(), removeEventListener: jest.fn() },
		document: { createElement: () => canvas },
		requestAnimationFrame: (cb: FrameRequestCallback) => { const id = nextId++; frames.set(id, cb); return id; },
		cancelAnimationFrame: (id: number) => frames.delete(id),
	});
	const input: InputBus = { impulse: { x: 0.5, y: 0.5, prevX: 0.5, prevY: 0.5, amp: 0, seq: 0 }, scrollY: 0 };
	const water = mountWater(host as unknown as HTMLElement, { input: useInput ? input : undefined, getJsParams: () => ({ DRIP_AMBIENT_AMP: 0 }) })!;
	function frame(ms: number) {
		now = ms;
		const callbacks = [...frames.values()];
		frames.clear();
		callbacks.forEach(cb => cb(ms));
	}
	function move(ms: number, x: number) {
		now = ms;
		const listener = canvas.addEventListener.mock.calls.find(([name]) => name === "pointermove")![1];
		listener({ clientX: x, clientY: 50 } as PointerEvent);
	}
	return { water, input, frame, frames, renderer, sim, display, canvas, move };
}

afterEach(() => {
	jest.restoreAllMocks();
	for (const key of ["window", "document", "requestAnimationFrame", "cancelAnimationFrame"]) {
		Reflect.deleteProperty(globalThis, key);
	}
});

it.each([30, 60, 144])("performs the same physics work at %iHz", hz => {
	const s = setup();
	s.water.setLooping(true);
	for (let frame = 0; frame <= hz; frame++) s.frame(frame * 1000 / hz);
	expect(s.renderer.draw.mock.calls.filter(call => call[0] === s.sim)).toHaveLength(180);
	expect(s.renderer.draw.mock.calls.filter(call => call[0] === s.display)).toHaveLength(Math.min(hz, 60) + 1);
	s.water.remove();
});

it("keeps the retina cap and redraws a resized still without starting physics", () => {
	const s = setup();
	s.frame(0);
	expect(s.canvas.width).toBe(2160);
	expect(s.frames.size).toBe(0);
	window.innerWidth = 800;
	s.water.resize();
	s.water.setLooping(false); // a visibility notification must not cancel the redraw
	expect(s.frames.size).toBe(1);
	s.frame(5000);
	expect(s.canvas.width).toBe(1200);
	expect(s.renderer.draw.mock.calls.filter(call => call[0] === s.display)).toHaveLength(2);
	expect(s.renderer.draw.mock.calls.filter(call => call[0] === s.sim)).toHaveLength(0);
	expect(s.frames.size).toBe(0);
	s.water.remove();
});

it("preserves pending input on zero-tick frames and injects it only once", () => {
	const s = setup();
	s.water.setLooping(true);
	s.frame(0);
	s.input.impulse.amp = 0.5;
	s.input.impulse.seq++;
	s.frame(1000 / 120);
	expect(s.sim.set1f.mock.calls.filter(([name, value]) => name === "u_impulseAmp" && value > 0)).toHaveLength(0);
	s.frame(1000 / 60);
	s.frame(1000 / 30);
	expect(s.sim.set1f.mock.calls.filter(([name, value]) => name === "u_impulseAmp" && value > 0)).toHaveLength(1);
	s.water.remove();
});

it("resumes without catching up paused time or injecting a stale scroll swell", () => {
	const s = setup();
	s.water.setLooping(true);
	s.frame(0);
	s.frame(1000 / 60);
	s.water.setLooping(false);
	expect(s.frames.size).toBe(0);
	s.input.scrollY = 1000;
	s.water.setLooping(true);
	s.frame(60000);
	expect(s.renderer.draw.mock.calls.filter(call => call[0] === s.sim)).toHaveLength(3);
	s.frame(60000 + 1000 / 60);
	expect(s.renderer.draw.mock.calls.filter(call => call[0] === s.sim)).toHaveLength(6);
	expect(s.sim.set1f.mock.calls.filter(([name, value]) => name === "u_lineAmp" && value > 0)).toHaveLength(0);
	s.water.remove();
	expect(s.frames.size).toBe(0);
});

it("sweeps all pending pointer movement rather than only the last event segment", () => {
	const s = setup(false);
	s.water.setLooping(true);
	s.frame(0);
	s.move(1, 100);
	s.move(5, 110);
	s.move(10, 120);
	s.frame(1000 / 60);
	expect(s.sim.set2f).toHaveBeenCalledWith("u_impulsePrev", 100 / 1440, 1 - 50 / 198);
	expect(s.sim.set2f).toHaveBeenCalledWith("u_impulsePos", 120 / 1440, 1 - 50 / 198);
	s.water.remove();
});

it("uses the same dent strength at different pointer event rates", () => {
	const amplitudes: number[] = [];
	for (const gap of [5, 10, 20]) {
		const s = setup(false);
		s.water.setLooping(true);
		s.frame(0);
		s.move(1, 100);
		s.move(1 + gap, 100 + gap * 0.6); // 600 CSS pixels per second
		s.frame(1000 / 30);
		const impulses = s.sim.set1f.mock.calls.filter(([name, value]) => name === "u_impulseAmp" && value > 0);
		amplitudes.push(impulses[impulses.length - 1][1]);
		s.water.remove();
	}
	amplitudes.forEach(amp => expect(amp).toBeCloseTo(0.13));
});
