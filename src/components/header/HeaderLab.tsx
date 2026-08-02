"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type p5 from "p5";
import { renderSFPools, type InputBus, type JsParams } from "./HeaderAnimation";
import { headerHeightPx } from "./HeaderPlaceholder";
import {
	PARAM_SPECS,
	PARAM_DEFAULTS,
	LAB_DISPLAY_SRC,
	LAB_SIM_SRC,
	JS_TUNABLES,
	toGlsl,
	type ParamSpec,
} from "./shader-params";

type Values = Record<string, number>;

// Both panes share ONE clock origin and ONE input bus. Without the shared clock
// the analytic swell in each pane runs at a different phase (p5 stamps millis()
// per instance at its own setup) and the comparison is worthless; without the
// shared bus only the pane the pointer is physically over gets stirred.
const CLOCK_ORIGIN = typeof performance !== "undefined" ? performance.now() : 0;

// ============================================================================
// Presets
//
// Starting points for the "impulses rather than a constant swell" question, so
// the interesting configuration is one click away instead of eight sliders.
// Each is a partial overlay on PARAM_DEFAULTS, so anything not named here stays
// at whatever production compiles.
//
// The speed/damping pairs are not free choices. A front travels
// sqrt(WAVE_SPEED) texels/step * substeps * 60 fps * 3 CSS px, and its
// amplitude e-folds in 1/((1 - DAMPING) * substeps * 60) seconds. Multiply the
// two and you get how far a swell gets before it fades — which has to be a
// decent fraction of the header's ~1500 px or the front never reads as
// crossing anything.
// ============================================================================

const PRESETS: { label: string; hint: string; values: Values }[] = [
	{
		label: "Slow drips",
		hint:
			"Slow, lingering water: speed 0.008 (~48 px/s) with damping 0.9985 " +
			"(~3.7s, ~180 px) so rings outlive the gap between drips and reach the " +
			"walls. Drips every 1.5s are the only injected energy; direction comes " +
			"from the gusting analytic field instead of from line swells. Lens gain " +
			"0.60 to read a much gentler curvature field.",
		values: {
			WAVE_SPEED: 0.008,
			DAMPING: 0.9985,
			SIM_SUBSTEPS: 3,
			SIM_CURV_GAIN: 0.6,
			AMBIENT_WEIGHT: 0.3,
			GUST_DEPTH: 0.6,
			GUST_RATE: 0.05,
			DRIP_AMBIENT_AMP: 0.35,
			DRIP_PERIOD_S: 1.5,
			DRIP_RADIUS: 3.0,
			SWELL_AMP: 0.0,
		},
	},
	{
		label: "Fast drips (rings travel)",
		hint:
			"The other end of the speed dial: 0.25 / damping 0.995 / 3 substeps, " +
			"~270 px/s and a ~300 px decay length, so a ring visibly expands across " +
			"the pane and reflects rather than sitting where it landed. Same drip " +
			"source, faster water.",
		values: {
			GUST_DEPTH: 0.6,
			GUST_RATE: 0.05,
			AMBIENT_WEIGHT: 0.5,
			SWELL_AMP: 0.0,
			DRIP_AMBIENT_AMP: 0.3,
			DRIP_PERIOD_S: 2.0,
			DRIP_RADIUS: 3.0,
			WAVE_SPEED: 0.25,
			DAMPING: 0.995,
			SIM_SUBSTEPS: 3,
		},
	},
	{
		label: "Sim only (threejs-caustics model)",
		hint:
			"The reference repo's model: no analytic field at all, so every caustic " +
			"comes from the sim and the header goes to glass if the drips stop. " +
			"Damping is pushed further and the sim curvature gain raised to make up " +
			"for the ambient spectrum it no longer sums with.",
		values: {
			AMBIENT_WEIGHT: 0.0,
			SIM_CURV_GAIN: 0.5,
			DRIP_AMBIENT_AMP: 0.5,
			DRIP_PERIOD_S: 1.25,
			DRIP_RADIUS: 3.0,
			SWELL_AMP: 0.0,
			WAVE_SPEED: 0.02,
			DAMPING: 0.9985,
			SIM_SUBSTEPS: 3,
		},
	},
];

function makeBus(): InputBus {
	return {
		impulse: { x: 0.5, y: 0.5, prevX: 0.5, prevY: 0.5, amp: 0, seq: 0 },
		scrollY: 0,
	};
}

// ============================================================================
// One canvas pane
// ============================================================================

function Pane({
	label,
	values,
	busRef,
	width,
}: {
	label: string;
	values: Values;
	busRef: React.RefObject<InputBus>;
	width: number;
}) {
	const hostRef = useRef<HTMLDivElement>(null);
	// Read through refs so slider moves never remount the sketch — the sim state
	// (and any ripples in flight) has to survive a parameter change, or you
	// cannot see what the change did.
	const valuesRef = useRef(values);
	const widthRef = useRef(width);
	useEffect(() => {
		valuesRef.current = values;
	}, [values]);
	useEffect(() => {
		widthRef.current = width;
	}, [width]);

	useEffect(() => {
		let instance: p5 | undefined;
		let cancelled = false;

		(async () => {
			const P5 = (await import("p5")).default;
			if (cancelled || !hostRef.current) return;
			instance = new P5(
				(p: p5) =>
					renderSFPools(p, {
						displaySrc: LAB_DISPLAY_SRC,
						simSrc: LAB_SIM_SRC,
						// Shader uniforms and JS-side numbers come from the same slider
						// state; split here because the JS ones shape the impulse before
						// it ever reaches a shader and so cannot be uniforms.
						getUniforms: () => valuesRef.current,
						getJsParams: () => {
							const out: Record<string, number> = {};
							for (const k of JS_TUNABLES) out[k] = valuesRef.current[k];
							return out as Partial<JsParams>;
						},
						getWidth: () => widthRef.current,
						t0: CLOCK_ORIGIN,
						input: busRef.current,
					}),
				hostRef.current
			);
		})();

		return () => {
			cancelled = true;
			instance?.remove();
		};
		// Deliberately mount-once: everything live is read through a ref.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Resize without remounting — a remount would burn a WebGL context each time
	// and Chrome drops the oldest after ~16. p5 only listens for window resize,
	// which a layout toggle does not fire, so nudge it. The sketch reads the
	// live width through getWidth() and no-ops if it is unchanged.
	useEffect(() => {
		window.dispatchEvent(new Event("resize"));
	}, [width]);

	return (
		<div className="min-w-0 flex-1">
			<div className="mb-1 flex items-baseline gap-2">
				<span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-100">
					{label}
				</span>
			</div>
			<div
				ref={hostRef}
				className="relative overflow-hidden rounded border border-slate-300"
				style={{ width, height: headerHeightPx(width) }}
			/>
		</div>
	);
}

// ============================================================================
// Slider
// ============================================================================

function Slider({
	spec,
	value,
	other,
	onChange,
}: {
	spec: ParamSpec;
	value: number;
	other: number;
	onChange: (v: number) => void;
}) {
	const changed = value !== PARAM_DEFAULTS[spec.name];
	const differs = value !== other;
	const decimals = Math.max(0, -Math.floor(Math.log10(spec.step)));

	return (
		<label className="block py-1.5" title={spec.hint}>
			<span className="flex items-baseline justify-between gap-2 text-xs">
				<span className={differs ? "font-semibold text-sky-700" : "text-slate-700"}>
					{spec.label}
				</span>
				<span className="flex items-center gap-1.5 font-mono text-[11px]">
					<span className={changed ? "text-sky-700" : "text-slate-500"}>
						{value.toFixed(decimals)}
					</span>
					{changed && (
						<button
							type="button"
							onClick={() => onChange(PARAM_DEFAULTS[spec.name])}
							className="text-slate-400 hover:text-slate-700"
							title={`reset to committed default (${PARAM_DEFAULTS[spec.name]})`}
						>
							↺
						</button>
					)}
				</span>
			</span>
			<input
				type="range"
				min={spec.min}
				max={spec.max}
				step={spec.step}
				value={value}
				onChange={e => onChange(Number(e.target.value))}
				className="mt-0.5 w-full accent-sky-600"
			/>
		</label>
	);
}

// ============================================================================
// Lab
// ============================================================================

export default function HeaderLab() {
	const [a, setA] = useState<Values>({ ...PARAM_DEFAULTS });
	const [b, setB] = useState<Values>({ ...PARAM_DEFAULTS });
	const [editing, setEditing] = useState<"a" | "b" | "both">("b");
	const [stacked, setStacked] = useState(true);
	const [width, setWidth] = useState(1200);
	const [copied, setCopied] = useState<string | null>(null);

	// One bus for both panes. Deliberately a mutable ref, not state: it is a
	// per-frame side channel read by the draw loop, and routing it through
	// setState would re-render the whole lab 60 times a second.
	const busRef = useRef<InputBus>(makeBus());

	// Pane width. Stacked gives both panes the FULL container width, which is
	// the honest comparison: below 726 CSS px tileCssPx() shrinks the tile grid
	// and the whole header changes scale, so two narrow side-by-side panes would
	// differ from production in a way unrelated to the parameters.
	//
	// Measured from the container rather than derived from window.innerWidth: a
	// hardcoded allowance for the sidebar, padding and gap is always slightly
	// wrong and overflows the viewport horizontally.
	const mainRef = useRef<HTMLElement>(null);
	useEffect(() => {
		const el = mainRef.current;
		if (!el) return;
		const measure = () => {
			// A few px of slack so a pane sized to exactly clientWidth cannot
			// summon a scrollbar, which would shrink clientWidth, which would
			// shrink the pane, which would dismiss the scrollbar — forever.
			const avail = Math.min(el.clientWidth - 4, 1600);
			setWidth(Math.max(320, stacked ? avail : Math.floor((avail - 16) / 2)));
		};
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		return () => ro.disconnect();
	}, [stacked]);

	const set = useCallback(
		(name: string, v: number) => {
			if (editing === "a" || editing === "both") setA(p => ({ ...p, [name]: v }));
			if (editing === "b" || editing === "both") setB(p => ({ ...p, [name]: v }));
		},
		[editing]
	);

	const shown = editing === "a" ? a : b;

	const groups = useMemo(() => {
		const m = new Map<string, ParamSpec[]>();
		for (const s of PARAM_SPECS) {
			if (!m.has(s.group)) m.set(s.group, []);
			m.get(s.group)!.push(s);
		}
		return [...m.entries()];
	}, []);

	// --- shared synthetic input ---------------------------------------------
	// Pointer position is normalised against whichever pane it is over, then fed
	// to BOTH. Scroll is a slider rather than real page scroll, so the swell can
	// be exercised without the page moving under the panes.
	const onPointer = (e: React.PointerEvent<HTMLDivElement>) => {
		const el = (e.target as HTMLElement).closest("[data-pane]") as HTMLElement | null;
		if (!el) return;
		const r = el.getBoundingClientRect();
		const x = (e.clientX - r.left) / r.width;
		const y = 1 - (e.clientY - r.top) / r.height;
		const i = busRef.current.impulse;
		const speed = Math.hypot(x - i.x, y - i.y) * r.width;
		i.prevX = i.x;
		i.prevY = i.y;
		i.x = x;
		i.y = y;
		i.amp = Math.min(1.0, 0.15 + speed * 0.01);
		i.seq++; // fires this impulse once in each pane, then stops
	};

	const onClick = () => {
		const i = busRef.current.impulse;
		i.amp = 1.2;
		i.prevX = i.x;
		i.prevY = i.y;
		i.seq++;
	};

	const copy = async (which: "a" | "b") => {
		const text = toGlsl(which === "a" ? a : b);
		await navigator.clipboard.writeText(text);
		setCopied(which);
		setTimeout(() => setCopied(null), 1500);
	};

	const diffCount = PARAM_SPECS.filter(s => a[s.name] !== b[s.name]).length;

	return (
		// Viewport-height, non-scrolling shell: the sidebar scrolls its own
		// content so the panes never move off screen while you hunt for a slider.
		// Tuning is a look-while-you-drag activity — a slider you cannot see the
		// effect of is useless.
		<div className="flex h-screen gap-4 overflow-hidden bg-slate-50 p-4 text-slate-900">
			{/* ---- controls (the only thing that scrolls) ---- */}
			<aside className="w-[340px] shrink-0 overflow-y-auto pr-2">
				<h1 className="text-lg font-semibold">Header tuning lab</h1>
				<p className="mt-1 text-xs leading-relaxed text-slate-600">
					Two independent sims sharing one clock and one input stream, so the
					only difference between them is the parameters. Drag or click either
					pane — both receive the same impulse.
				</p>

				<div className="mt-3 rounded border border-slate-300 bg-white p-2">
					<div className="text-xs font-medium text-slate-700">Sliders edit</div>
					<div className="mt-1 flex gap-1">
						{(["a", "b", "both"] as const).map(k => (
							<button
								key={k}
								type="button"
								onClick={() => setEditing(k)}
								className={`flex-1 rounded px-2 py-1 text-xs font-medium ${
									editing === k
										? "bg-sky-600 text-white"
										: "bg-slate-100 text-slate-700 hover:bg-slate-200"
								}`}
							>
								{k === "both" ? "Both" : k.toUpperCase()}
							</button>
						))}
					</div>

					<label className="mt-2 flex items-center gap-2 text-xs text-slate-700">
						<input
							type="checkbox"
							checked={stacked}
							onChange={e => setStacked(e.target.checked)}
							className="accent-sky-600"
						/>
						Stack panes (full width — matches production scale)
					</label>

					<div className="mt-2 flex gap-1">
						<button
							type="button"
							onClick={() => setB({ ...a })}
							className="flex-1 rounded bg-slate-100 px-2 py-1 text-xs hover:bg-slate-200"
						>
							A → B
						</button>
						<button
							type="button"
							onClick={() => setA({ ...b })}
							className="flex-1 rounded bg-slate-100 px-2 py-1 text-xs hover:bg-slate-200"
						>
							B → A
						</button>
						<button
							type="button"
							onClick={() => {
								setA({ ...PARAM_DEFAULTS });
								setB({ ...PARAM_DEFAULTS });
							}}
							className="flex-1 rounded bg-slate-100 px-2 py-1 text-xs hover:bg-slate-200"
						>
							Reset
						</button>
					</div>

					<div className="mt-2 flex gap-1">
						<button
							type="button"
							onClick={() => copy("a")}
							className="flex-1 rounded bg-slate-800 px-2 py-1 text-xs text-white hover:bg-slate-700"
						>
							{copied === "a" ? "Copied ✓" : "Copy A as GLSL"}
						</button>
						<button
							type="button"
							onClick={() => copy("b")}
							className="flex-1 rounded bg-slate-800 px-2 py-1 text-xs text-white hover:bg-slate-700"
						>
							{copied === "b" ? "Copied ✓" : "Copy B as GLSL"}
						</button>
					</div>

					<p className="mt-1.5 text-[11px] text-slate-500">
						{diffCount === 0
							? "A and B are identical."
							: `${diffCount} parameter${diffCount === 1 ? "" : "s"} differ — shown in blue.`}
					</p>
				</div>

				{/* Presets load into B only, so A stays as the production baseline
				    you are comparing against. */}
				<div className="mt-3 rounded border border-slate-300 bg-white p-2">
					<div className="text-xs font-medium text-slate-700">Load into B</div>
					{PRESETS.map(preset => (
						<button
							key={preset.label}
							type="button"
							onClick={() => setB({ ...PARAM_DEFAULTS, ...preset.values })}
							title={preset.hint}
							className="mt-1 w-full rounded bg-slate-100 px-2 py-1 text-left text-xs hover:bg-slate-200"
						>
							{preset.label}
						</button>
					))}
					<p className="mt-1.5 text-[11px] text-slate-500">
						A stays at the committed defaults. Hover a preset for what it
						assumes and why.
					</p>
				</div>

				{/* scroll swell driver */}
				<div className="mt-3 rounded border border-slate-300 bg-white p-2">
					<div className="text-xs font-medium text-slate-700">Scroll swell</div>
					<p className="text-[11px] text-slate-500">
						The swell responds to scroll <em>acceleration</em>, so flick this
						rather than dragging it steadily.
					</p>
					<input
						type="range"
						min={0}
						max={2000}
						step={1}
						defaultValue={0}
						onChange={e => {
							busRef.current.scrollY = Number(e.target.value);
						}}
						className="mt-1 w-full accent-sky-600"
					/>
				</div>

				{groups.map(([group, specs]) => (
					<div key={group} className="mt-3 rounded border border-slate-300 bg-white p-2">
						<div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
							{group}
						</div>
						{specs.map(spec => (
							<Slider
								key={spec.name}
								spec={spec}
								value={shown[spec.name]}
								other={(editing === "a" ? b : a)[spec.name]}
								onChange={v => set(spec.name, v)}
							/>
						))}
					</div>
				))}
			</aside>

			{/* ---- panes ---- */}
			<main
				ref={mainRef}
				// Scrolls only if the panes genuinely do not fit (very short window);
				// normally there is nothing to scroll and they stay put.
				className="min-w-0 flex-1 overflow-y-auto"
				onPointerMove={onPointer}
				onClick={onClick}
			>
				<div className={stacked ? "flex flex-col gap-4" : "flex gap-4"}>
					<div data-pane="a">
						<Pane label="A" values={a} busRef={busRef} width={width} />
					</div>
					<div data-pane="b">
						<Pane label="B" values={b} busRef={busRef} width={width} />
					</div>
				</div>
			</main>
		</div>
	);
}
