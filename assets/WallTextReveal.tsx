// Wall text reveal: text pinned onto a surface in the shot (corner pin / perspective),
// typed in one character at a time with a soft tick per letter and a soft drop shadow,
// so it reads as part of the scene rather than a flat overlay.
// Hebrew-first: dir="rtl" by default, characters split by grapheme (niqqud stays attached).
import {Audio} from '@remotion/media';
import React from 'react';
import {AbsoluteFill, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

/** A point in frame pixels. */
export type Pt = [number, number];
/** Surface corners in frame pixels: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Pt, Pt, Pt, Pt];
/** Corner positions at a given frame (relative to this overlay's start); interpolated between keys. */
export type QuadKey = {frame: number; quad: Quad};

export type WallTextRevealProps = {
	text: string;
	/** Static surface, or keyframes when the camera moves (manual or tracked). */
	quad: Quad | QuadKey[];
	/** Duration of this overlay in frames (fade-out happens at the end). */
	durationInFrames: number;
	charsPerSecond?: number; // 22 ≈ the reference
	startDelay?: number; // frames before the first letter
	fontFamily?: string;
	fontWeight?: number;
	color?: string;
	/** Font size as a fraction of the surface height. */
	size?: number;
	dir?: 'rtl' | 'ltr';
	shadow?: boolean;
	/** 3D thickness of the letters in canvas px (canvas is 1000×400); 0 = flat text. */
	depth?: number;
	/** Color of the letters' sides (the extruded part). */
	depthColor?: string;
	/** Direction the sides show, per px of depth: [x, y] on the surface. */
	depthDir?: Pt;
	/** Frames over which each new letter grows out of the surface to full depth. */
	popFrames?: number;
	/** Typing sound per letter ('' disables). Path under public/. */
	tickSrc?: string;
	tickVolume?: number;
	/** Optional sound when the first letter lands ('' disables). */
	whooshSrc?: string;
	whooshVolume?: number;
	fadeOutFrames?: number;
};

// Virtual canvas the text is laid out on before being pinned to the quad.
const W = 1000;
const H = 400;

const graphemes = (s: string): string[] => {
	const Seg = (Intl as unknown as {Segmenter?: new (l?: string, o?: object) => {segment: (s: string) => Iterable<{segment: string}>}}).Segmenter;
	return Seg ? Array.from(new Seg(undefined, {granularity: 'grapheme'}).segment(s), (g) => g.segment) : Array.from(s);
};

const lerpQuad = (a: Quad, b: Quad, t: number): Quad =>
	a.map((p, i) => [p[0] + (b[i][0] - p[0]) * t, p[1] + (b[i][1] - p[1]) * t]) as Quad;

const quadAt = (q: Quad | QuadKey[], frame: number): Quad => {
	if (Array.isArray(q[0])) return q as Quad;
	const keys = q as QuadKey[];
	if (frame <= keys[0].frame) return keys[0].quad;
	for (let i = 1; i < keys.length; i++) {
		if (frame <= keys[i].frame) {
			const t = (frame - keys[i - 1].frame) / (keys[i].frame - keys[i - 1].frame);
			return lerpQuad(keys[i - 1].quad, keys[i].quad, t);
		}
	}
	return keys[keys.length - 1].quad;
};

// Projective transform mapping the W×H rectangle onto the quad, as a CSS matrix3d.
const matrix3d = (quad: Quad): string => {
	const src: Pt[] = [[0, 0], [W, 0], [W, H], [0, H]];
	const A: number[][] = [];
	const bVec: number[] = [];
	for (let i = 0; i < 4; i++) {
		const [x, y] = src[i];
		const [u, v] = quad[i];
		A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
		bVec.push(u);
		A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
		bVec.push(v);
	}
	// Gaussian elimination
	const n = 8;
	const M = A.map((row, i) => [...row, bVec[i]]);
	for (let c = 0; c < n; c++) {
		let p = c;
		for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
		[M[c], M[p]] = [M[p], M[c]];
		for (let r = 0; r < n; r++) {
			if (r === c) continue;
			const f = M[r][c] / M[c][c];
			for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
		}
	}
	const h = M.map((row, i) => row[n] / row[i]);
	const [a, b, c, d, e, f, g, k] = h;
	// column-major 4x4
	return `matrix3d(${a},${d},0,${g},${b},${e},0,${k},0,0,1,0,${c},${f},0,1)`;
};

// Thickness = stacked hard text-shadows (one per px of depth) in the side color, then the soft
// drop shadow beyond them. Shadows live in the same pinned plane, so the sides follow the surface's
// perspective. Spans stay inline (no transforms) so Hebrew/number bidi order is never disturbed.
const letterShadow = (depth: number, color: string, [dx, dy]: Pt, soft: boolean): string => {
	const n = Math.round(depth);
	const layers: string[] = [];
	for (let k = 1; k <= n; k++) layers.push(`${(dx * k).toFixed(2)}px ${(dy * k).toFixed(2)}px 0 ${color}`);
	if (soft) {
		layers.push(`${dx * n + 6}px ${dy * n + 12}px 16px rgba(0,0,0,0.55)`, `${dx * n + 2}px ${dy * n + 4}px 4px rgba(0,0,0,0.35)`);
	}
	return layers.length ? layers.join(', ') : 'none';
};

export const WallTextReveal: React.FC<WallTextRevealProps> = ({
	text,
	quad,
	durationInFrames,
	charsPerSecond = 22,
	startDelay = 0,
	fontFamily = 'Heebo',
	fontWeight = 800,
	color = '#ffffff',
	size = 0.42,
	dir = 'rtl',
	shadow = true,
	depth = 14,
	depthColor = '#9ea3aa',
	depthDir = [0.55, 1],
	popFrames = 5,
	tickSrc = 'library/sfx/bundled/tick.wav',
	tickVolume = 0.35,
	whooshSrc = 'library/sfx/bundled/whoosh-quick.wav',
	whooshVolume = 0.25,
	fadeOutFrames = 8,
}) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	const chars = graphemes(text);
	const framesPerChar = fps / charsPerSecond;
	const shown = Math.max(0, Math.min(chars.length, Math.floor((frame - startDelay) / framesPerChar) + 1));
	const opacity = interpolate(frame, [durationInFrames - fadeOutFrames, durationInFrames], [1, 0], {
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});
	const q = quadAt(quad, frame);

	// Sound: one tick per visible (non-space) letter, slightly varied pitch so it doesn't sound robotic.
	const tickFrames = chars
		.map((ch, i) => ({ch, f: Math.round(startDelay + i * framesPerChar)}))
		.filter(({ch}) => ch.trim() !== '');

	return (
		<AbsoluteFill style={{opacity}}>
			<div
				style={{
					position: 'absolute',
					left: 0,
					top: 0,
					width: W,
					height: H,
					transformOrigin: '0 0',
					transform: matrix3d(q),
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
				}}
			>
				{/* Two identical copies stacked in one grid cell: sides + shadow behind, letter faces on top,
				    so a letter's side never paints over its neighbour's face (matters in RTL). */}
				<div style={{display: 'grid'}}>
					{(['back', 'front'] as const).map((layer) => (
						<div
							key={layer}
							dir={dir}
							style={{
								gridArea: '1 / 1',
								fontFamily,
								fontWeight,
								fontSize: H * size,
								lineHeight: 1,
								color: layer === 'back' ? 'transparent' : color,
								whiteSpace: 'nowrap',
								letterSpacing: '0.01em',
							}}
						>
							{/* All letters stay in layout so the word doesn't shift while typing. */}
							{chars.map((ch, i) => {
								// Each letter appears at once, then grows out of the surface to full depth.
								const grow = interpolate(frame - startDelay - i * framesPerChar, [0, Math.max(1, popFrames)], [0, 1], {
									extrapolateLeft: 'clamp',
									extrapolateRight: 'clamp',
									easing: (t) => 1 - (1 - t) ** 3,
								});
								const textShadow = layer === 'back' ? letterShadow(depth * grow, depthColor, depthDir, shadow) : 'none';
								return (
									<span key={i} style={{opacity: i < shown ? 1 : 0, textShadow}}>
										{ch}
									</span>
								);
							})}
						</div>
					))}
				</div>
			</div>
			{whooshSrc ? (
				<Sequence from={startDelay} layout="none" name="wall-text whoosh">
					<Audio src={staticFile(whooshSrc)} volume={whooshVolume} />
				</Sequence>
			) : null}
			{tickSrc
				? tickFrames.map(({f}, i) => (
						<Sequence key={i} from={f} durationInFrames={Math.round(fps * 0.4)} layout="none" name={`tick ${i}`}>
							<Audio src={staticFile(tickSrc)} volume={tickVolume} playbackRate={0.92 + ((i * 37) % 17) / 100} />
						</Sequence>
					))
				: null}
		</AbsoluteFill>
	);
};
