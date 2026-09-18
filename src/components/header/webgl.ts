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
	alpha: false, // opaque: it covers whatever it is stacked over
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
	set4fv(name: string, values: Float32Array) {
		this.gl.uniform4fv(this.loc(name), values);
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
 * The texel format targets are allocated in, best first: 32-bit float, then
 * 16-bit. `linear` says whether it can also be sampled with LINEAR filtering,
 * which is a separate extension for float textures and missing on some mobile
 * GPUs; a caller that reconstructs derivatives from a target needs to know
 * (the water's display shader degrades gracefully — see u_simLens).
 *
 * 16-bit is a real step down for the wave simulation: heights near 1 only
 * resolve to ~0.001, which is the size of one step's damping. It is here so a
 * phone without renderable 32-bit float still gets moving water rather than
 * none.
 */
type FloatFormat = {
	internal: number; format: number; type: number; linear: boolean;
};

function pickFloatFormat(gl: GL): FloatFormat | null {
	const candidates: FloatFormat[] = [];
	if (typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext) {
		if (gl.getExtension("EXT_color_buffer_float")) {
			candidates.push({
				internal: gl.RGBA32F, format: gl.RGBA, type: gl.FLOAT,
				linear: !!gl.getExtension("OES_texture_float_linear"),
			});
		}
		if (gl.getExtension("EXT_color_buffer_half_float")) {
			candidates.push({
				internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT,
				linear: !!gl.getExtension("OES_texture_half_float_linear"),
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
	for (const fmt of candidates) {
		const probe = createTarget(gl, 4, 4, fmt);
		if (!probe) continue;
		gl.deleteTexture(probe.tex);
		gl.deleteFramebuffer(probe.fbo);
		return fmt;
	}
	return null;
}

function createTarget(gl: GL, w: number, h: number, fmt: FloatFormat): Target | null {
	const tex = gl.createTexture();
	const fbo = gl.createFramebuffer();
	if (!tex || !fbo) return null;
	gl.bindTexture(gl.TEXTURE_2D, tex);
	// Clamped edges are what let a simulation treat the borders as reflecting
	// walls: it samples past the edge and gets the edge texel back.
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	const filter = fmt.linear ? gl.LINEAR : gl.NEAREST;
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

/**
 * A canvas context and one quad covering it. It owns nothing it hands out: the
 * programs and targets belong to the caller, which disposes of them before
 * disposing of this.
 */
export class QuadRenderer {
	private constructor(
		private gl: GL,
		private format: FloatFormat,
		private quad: WebGLBuffer)
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

		const format = pickFloatFormat(gl);
		const quad = format && gl.createBuffer();
		if (!format || !quad) {
			gl.getExtension("WEBGL_lose_context")?.loseContext();
			return null;
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, quad);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
			gl.STATIC_DRAW
		);
		return new QuadRenderer(gl, format, quad);
	}

	/** Whether targets from createTarget can be sampled with LINEAR filtering. */
	get linearFilter() {
		return this.format.linear;
	}

	/** Compile and link a fragment shader against the quad. Throws on failure. */
	program(fragSrc: string) {
		return new Program(this.gl, QUAD_VERT, fragSrc);
	}

	createTarget(w: number, h: number) {
		return createTarget(this.gl, w, h, this.format);
	}

	deleteTarget(target: Target | null) {
		if (!target) return;
		this.gl.deleteTexture(target.tex);
		this.gl.deleteFramebuffer(target.fbo);
	}

	/** Run `prog` over the whole of `target`, or of the canvas when it is null. */
	draw(prog: Program, target: Target | null, w: number, h: number) {
		const gl = this.gl;
		gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
		gl.viewport(0, 0, w, h);
		gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
		gl.enableVertexAttribArray(prog.aPosition);
		gl.vertexAttribPointer(prog.aPosition, 2, gl.FLOAT, false, 0, 0);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	}

	dispose() {
		this.gl.deleteBuffer(this.quad);
		// Give the context back now rather than when the GC gets to it; a
		// browser only allows a handful at once.
		this.gl.getExtension("WEBGL_lose_context")?.loseContext();
	}
}
