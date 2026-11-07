// ============================================================================
// WEBGL PLUMBING
//
// Everything the header water needs from a graphics library: shader programs,
// float render targets, and a full-target quad to run them over. It replaces
// p5, which cost ~3MB of JavaScript across a dozen lazy chunks — most of a
// second of parse and evaluate before the first frame — and attached
// non-passive pointermove and wheel listeners to the WINDOW, which made every
// scroll and pointer move on the whole page wait on JavaScript.
//
// Nothing here knows about water: it is shader passes over a quad, and a pair
// of textures to ping-pong between. Keeping it that way is the point of the
// split — the sketch next door makes no raw GL calls, so the two can be read
// and changed independently.
// ============================================================================

export type GL = WebGLRenderingContext | WebGL2RenderingContext;

// Every pass draws one full-target quad through this. The fragment shaders are
// GLSL ES 1.00 (texture2D, varying, gl_FragColor), which a WebGL2 context still
// accepts, so one vertex shader serves either context.
const QUAD_VERT = `
	attribute vec2 aPosition;
	varying vec2 vTexCoord;
	void main() {
		vTexCoord = aPosition * 0.5 + 0.5;
		gl_Position = vec4(aPosition, 0.0, 1.0);
	}
`;

const GL_OPTIONS: WebGLContextAttributes = {
	// Every pass writes alpha 1, so the canvas looks opaque anyway. An opaque
	// (alpha: false) canvas shows solid black whenever its buffer holds no
	// frame (after a resize that no draw followed, say); with alpha, it shows
	// whatever it is stacked over, which for the header is the CSS placeholder.
	alpha: true,
	antialias: false, // a full-screen quad has no edges to smooth
	depth: false,
	stencil: false,
	premultipliedAlpha: false,
	preserveDrawingBuffer: false,
	powerPreference: "low-power",
};

export class Program {
	readonly prog: WebGLProgram;
	private locs = new Map<string, WebGLUniformLocation | null>();
	readonly aPosition: number;

	constructor(private gl: GL, vertSrc: string, fragSrc: string) {
		const vs = this.compile(gl.VERTEX_SHADER, vertSrc);
		const fs = this.compile(gl.FRAGMENT_SHADER, fragSrc);
		const prog = gl.createProgram();
		if (!prog) throw new Error("createProgram failed");
		gl.attachShader(prog, vs);
		gl.attachShader(prog, fs);
		gl.linkProgram(prog);
		if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
			throw new Error(`shader link failed: ${gl.getProgramInfoLog(prog)}`);
		}
		gl.deleteShader(vs);
		gl.deleteShader(fs);
		this.prog = prog;
		this.aPosition = gl.getAttribLocation(prog, "aPosition");
	}

	private compile(type: number, src: string) {
		const gl = this.gl;
		const sh = gl.createShader(type);
		if (!sh) throw new Error("createShader failed");
		gl.shaderSource(sh, src);
		gl.compileShader(sh);
		if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
			const log = gl.getShaderInfoLog(sh);
			gl.deleteShader(sh);
			throw new Error(`shader compile failed: ${log}`);
		}
		return sh;
	}

	// Unknown names resolve to a null location, which WebGL treats as a no-op —
	// the tuning harness feeds both programs every tunable by name and relies
	// on this.
	private loc(name: string) {
		let l = this.locs.get(name);
		if (l === undefined) {
			l = this.gl.getUniformLocation(this.prog, name);
			this.locs.set(name, l);
		}
		return l;
	}

	use() {
		this.gl.useProgram(this.prog);
	}
	set1f(name: string, v: number) {
		this.gl.uniform1f(this.loc(name), v);
	}
	set2f(name: string, a: number, b: number) {
		this.gl.uniform2f(this.loc(name), a, b);
	}
	setTexture(name: string, tex: WebGLTexture, unit: number) {
		const gl = this.gl;
		gl.activeTexture(gl.TEXTURE0 + unit);
		gl.bindTexture(gl.TEXTURE_2D, tex);
		gl.uniform1i(this.loc(name), unit);
	}
	dispose() {
		this.gl.deleteProgram(this.prog);
	}
}

/** A float texture with a framebuffer to render into it. */
export type Target = { tex: WebGLTexture; fbo: WebGLFramebuffer };

/**
 * How the display pass gets a smoothly filtered view of the simulation, which
 * it needs to reconstruct curvature (the caustics) from it:
 *   native - the simulation's own float format filters, so it is sampled as is
 *   copy   - it doesn't, but a 16-bit float format does, so each frame the
 *            simulation is copied into one of those and the copy is sampled
 *   none   - nothing filters; the display shader drops the simulated lens
 *            (see u_simLens)
 *
 * iPhones are the reason for "copy": their GPUs cannot filter 32-bit float
 * textures, and iOS Safari has at times advertised OES_texture_float_linear
 * anyway, so the sim came back unfiltered, with no curvature inside a texel,
 * and the ripples lost their caustics. A half-float texture filters on every
 * WebGL2 GPU, and 16 bits is plenty for a view of the heights, which only has
 * to survive a few frames' worth of derivatives, not thousands of sim steps.
 */
export type Filtering = "native" | "copy" | "none";

/**
 * A texel format a target can be allocated in. `linear` says whether the
 * browser claims it can also be sampled with LINEAR filtering, which is a
 * separate extension for float textures and missing on some mobile GPUs. Only
 * probeLinear() says whether it actually does.
 *
 * 16-bit is a real step down for the wave simulation itself: heights near 1
 * only resolve to ~0.001, which is the size of one step's damping. It is a sim
 * format only so a phone without renderable 32-bit float still gets moving
 * water rather than none.
 */
type FloatFormat = {
	internal: number; format: number; type: number; linear: boolean;
};

/** Renderable float formats, most precise first. */
function floatFormats(gl: GL): FloatFormat[] {
	const candidates: FloatFormat[] = [];
	if (typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext) {
		const float = gl.getExtension("EXT_color_buffer_float");
		if (float) {
			candidates.push({
				internal: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT,
				linear: !!gl.getExtension("OES_texture_float_linear"),
			});
		}
		// EXT_color_buffer_float makes RGBA16F renderable too. Filtering it is
		// core WebGL2, no extension needed.
		if (float || gl.getExtension("EXT_color_buffer_half_float")) {
			candidates.push({
				internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT,
				linear: true,
			});
		}
	} else {
		if (gl.getExtension("OES_texture_float")) {
			candidates.push({
				internal: gl.RGBA, format: gl.RGBA, type: gl.FLOAT,
				linear: !!gl.getExtension("OES_texture_float_linear"),
			});
		}
		const half = gl.getExtension("OES_texture_half_float");
		if (half) {
			candidates.push({
				internal: gl.RGBA, format: gl.RGBA, type: half.HALF_FLOAT_OES,
				linear: !!gl.getExtension("OES_texture_half_float_linear"),
			});
		}
	}
	// Extensions advertise the format; only a completeness check proves the
	// GPU will render to it.
	return candidates.filter(fmt => {
		const probe = createTarget(gl, 4, 4, fmt, false);
		if (!probe) return false;
		gl.deleteTexture(probe.tex);
		gl.deleteFramebuffer(probe.fbo);
		return true;
	});
}

// Writes 0 to the left texel of a 2x1 target and 1 to the right one.
const PROBE_FILL_FRAG = `
	precision mediump float;
	void main() {
		gl_FragColor = vec4(step(1.0, gl_FragCoord.x));
	}
`;

// Samples that target exactly between its two texels.
const PROBE_SAMPLE_FRAG = `
	precision mediump float;
	uniform sampler2D u_tex;
	void main() {
		gl_FragColor = vec4(texture2D(u_tex, vec2(0.5)).r, 0.0, 0.0, 1.0);
	}
`;

/**
 * Whether `fmt` really filters: fill a 2x1 texture with 0 and 1, sample it
 * halfway between with LINEAR set, and read the answer back off the canvas.
 * Filtered, that is 0.5; unfiltered, the sampler snaps to one texel and it is
 * 0 or 1. An advertised extension is not enough — see Filtering.
 */
function probeLinear(gl: GL, quad: WebGLBuffer, fmt: FloatFormat) {
	if (!fmt.linear) return false;
	const target = createTarget(gl, 2, 1, fmt, true);
	if (!target) return false;
	let fill: Program | null = null;
	let sample: Program | null = null;
	try {
		fill = new Program(gl, QUAD_VERT, PROBE_FILL_FRAG);
		sample = new Program(gl, QUAD_VERT, PROBE_SAMPLE_FRAG);
		fill.use();
		drawQuad(gl, fill, quad, target.fbo, 2, 1);
		sample.use();
		sample.setTexture("u_tex", target.tex, 0);
		drawQuad(gl, sample, quad, null, 1, 1);
		const pixel = new Uint8Array(4);
		gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
		return pixel[0] > 64 && pixel[0] < 192;
	} catch {
		return false;
	} finally {
		fill?.dispose();
		sample?.dispose();
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.deleteTexture(target.tex);
		gl.deleteFramebuffer(target.fbo);
	}
}

function createTarget(gl: GL, w: number, h: number, fmt: FloatFormat, linear: boolean): Target | null {
	const tex = gl.createTexture();
	const fbo = gl.createFramebuffer();
	if (!tex || !fbo) return null;
	gl.bindTexture(gl.TEXTURE_2D, tex);
	// Clamped edges are what let a simulation treat the borders as reflecting
	// walls: it samples past the edge and gets the edge texel back.
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	const filter = linear ? gl.LINEAR : gl.NEAREST;
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
	gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internal, w, h, 0, fmt.format, fmt.type, null);
	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
	const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	gl.bindTexture(gl.TEXTURE_2D, null);
	if (!ok) {
		gl.deleteTexture(tex);
		gl.deleteFramebuffer(fbo);
		return null;
	}
	// A fresh texture holds undefined contents until something writes it, and a
	// ping-pong sim reads one on its first frame, so zero it.
	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
	gl.clearColor(0, 0, 0, 0);
	gl.clear(gl.COLOR_BUFFER_BIT);
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	return { tex, fbo };
}

function drawQuad(gl: GL, prog: Program, quad: WebGLBuffer, fbo: WebGLFramebuffer | null, w: number, h: number) {
	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
	gl.viewport(0, 0, w, h);
	gl.bindBuffer(gl.ARRAY_BUFFER, quad);
	gl.enableVertexAttribArray(prog.aPosition);
	gl.vertexAttribPointer(prog.aPosition, 2, gl.FLOAT, false, 0, 0);
	gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// Copies a target texel for texel: each fragment of a same-size destination
// lands on a source texel centre, so this is exact even unfiltered.
const COPY_FRAG = `
	precision highp float;
	uniform sampler2D u_source;
	varying vec2 vTexCoord;
	void main() {
		gl_FragColor = texture2D(u_source, vTexCoord);
	}
`;

/**
 * A canvas context and one quad covering it. It owns nothing it hands out: the
 * programs and targets belong to the caller, which disposes of them before
 * disposing of this.
 */
export class QuadRenderer {
	private constructor(
		private gl: GL,
		private quad: WebGLBuffer,
		private simFormat: FloatFormat,
		/** How the display pass gets a filtered view of the simulation. */
		readonly filtering: Filtering,
		// set only when filtering is "copy"
		private view: { format: FloatFormat; copy: Program } | null = null)
	{}

	/**
	 * Returns null when this GPU cannot run the effect at all — no WebGL
	 * context, or no float texture it will actually render to — in which case
	 * the caller should leave whatever static fallback it has in place.
	 */
	static create(canvas: HTMLCanvasElement): QuadRenderer | null {
		const gl = (canvas.getContext("webgl2", GL_OPTIONS) ??
			canvas.getContext("webgl", GL_OPTIONS)) as GL | null;
		if (!gl) return null;

		const formats = floatFormats(gl);
		const quad = formats.length ? gl.createBuffer() : null;
		if (!quad) {
			gl.getExtension("WEBGL_lose_context")?.loseContext();
			return null;
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, quad);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
			gl.STATIC_DRAW
		);

		const simFormat = formats[0];
		if (probeLinear(gl, quad, simFormat)) {
			return new QuadRenderer(gl, quad, simFormat, "native");
		}
		const viewFormat = formats.slice(1).find(fmt => probeLinear(gl, quad, fmt));
		if (viewFormat) {
			try {
				const copy = new Program(gl, QUAD_VERT, COPY_FRAG);
				return new QuadRenderer(gl, quad, simFormat, "copy", { format: viewFormat, copy });
			} catch {
				// fall through to no filtered view at all
			}
		}
		return new QuadRenderer(gl, quad, simFormat, "none");
	}

	/** Compile and link a fragment shader against the quad. Throws on failure. */
	program(fragSrc: string) {
		return new Program(this.gl, QUAD_VERT, fragSrc);
	}

	/** A target for the simulation, filtered only when that is native. */
	createTarget(w: number, h: number) {
		return createTarget(this.gl, w, h, this.simFormat, this.filtering === "native");
	}

	/**
	 * A filtered target to copy the simulation into, when filtering is "copy";
	 * null otherwise.
	 */
	createViewTarget(w: number, h: number) {
		return this.view && createTarget(this.gl, w, h, this.view.format, true);
	}

	/**
	 * Copy `source` into a `dest` of the same size, w by h. Does nothing unless
	 * filtering is "copy".
	 */
	copy(source: Target, dest: Target, w: number, h: number) {
		if (!this.view) return;
		const prog = this.view.copy;
		prog.use();
		prog.setTexture("u_source", source.tex, 0);
		this.draw(prog, dest, w, h);
	}

	deleteTarget(target: Target | null) {
		if (!target) return;
		this.gl.deleteTexture(target.tex);
		this.gl.deleteFramebuffer(target.fbo);
	}

	/** Run `prog` over the whole of `target`, or of the canvas when it is null. */
	draw(prog: Program, target: Target | null, w: number, h: number) {
		drawQuad(this.gl, prog, this.quad, target ? target.fbo : null, w, h);
	}

	/**
	 * The brightest color channel and the highest alpha (each 0-255) along the
	 * middle row of the frame just drawn to the canvas. Both are 0 when nothing
	 * could be read back (a lost context, or a browser that won't read this
	 * canvas). Call it right after drawing, before yielding: without
	 * preserveDrawingBuffer the canvas buffer is only readable until the
	 * browser composites it. Reading pixels makes the CPU wait for the GPU, so
	 * call it now and then, not every frame.
	 */
	middleRowLevels(w: number, h: number) {
		const gl = this.gl;
		const row = new Uint8Array(w * 4);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.readPixels(0, Math.floor(h / 2), w, 1, gl.RGBA, gl.UNSIGNED_BYTE, row);
		let brightest = 0;
		let alpha = 0;
		for (let i = 0; i < row.length; i += 4) {
			brightest = Math.max(brightest, row[i], row[i + 1], row[i + 2]);
			alpha = Math.max(alpha, row[i + 3]);
		}
		return { brightest, alpha };
	}

	dispose() {
		this.view?.copy.dispose();
		this.gl.deleteBuffer(this.quad);
		// Give the context back now rather than when the GC gets to it; a
		// browser only allows a handful at once.
		this.gl.getExtension("WEBGL_lose_context")?.loseContext();
	}
}
