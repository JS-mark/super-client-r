/**
 * ThinkingIndicator — cute animated cat loading indicator for AI chat bubbles.
 *
 * A kawaii-style cat character with blinking eyes, wagging tail,
 * floating thought bubbles, twinkling sparkles, and animated text.
 */
import { useTranslation } from "react-i18next";

export function ThinkingIndicator() {
	const { t } = useTranslation("chat");

	return (
		<div className="thinking-cat">
			<svg
				width="140"
				height="108"
				viewBox="0 0 160 120"
				fill="none"
				aria-hidden="true"
			>
				<defs>
					<linearGradient id="tc-fur" x1="0.2" y1="0" x2="0.8" y2="1">
						<stop offset="0%" stopColor="#818cf8" />
						<stop offset="100%" stopColor="#6366f1" />
					</linearGradient>
					<linearGradient id="tc-inner" x1="0.5" y1="0" x2="0.5" y2="1">
						<stop offset="0%" stopColor="#ddd6fe" />
						<stop offset="100%" stopColor="#c4b5fd" />
					</linearGradient>
				</defs>

				{/* Ground shadow */}
				<ellipse
					className="tc-shadow"
					cx="60"
					cy="100"
					rx="30"
					ry="4"
					fill="#6366f1"
					opacity="0.08"
				/>

				{/* === Cat (bounces as a group) === */}
				<g className="tc-bounce">
					{/* Tail */}
					<path
						className="tc-tail"
						d="M82,78 Q98,66 96,52 Q94,42 100,35"
						stroke="url(#tc-fur)"
						strokeWidth="7"
						strokeLinecap="round"
					/>

					{/* Body */}
					<ellipse cx="60" cy="80" rx="22" ry="14" fill="url(#tc-fur)" />

					{/* Paws */}
					<ellipse cx="46" cy="92" rx="9" ry="5" fill="url(#tc-fur)" />
					<ellipse cx="74" cy="92" rx="9" ry="5" fill="url(#tc-fur)" />
					{/* Paw pads */}
					<ellipse
						cx="45"
						cy="93"
						rx="3"
						ry="2"
						fill="url(#tc-inner)"
						opacity="0.4"
					/>
					<ellipse
						cx="73"
						cy="93"
						rx="3"
						ry="2"
						fill="url(#tc-inner)"
						opacity="0.4"
					/>

					{/* Head */}
					<circle cx="60" cy="48" r="28" fill="url(#tc-fur)" />

					{/* Left ear */}
					<polygon points="36,30 30,4 52,22" fill="url(#tc-fur)" />
					<polygon points="38,27 33,10 50,22" fill="url(#tc-inner)" />
					{/* Right ear */}
					<polygon points="84,30 90,4 68,22" fill="url(#tc-fur)" />
					<polygon points="82,27 87,10 70,22" fill="url(#tc-inner)" />

					{/* Eyes (blink as a group) */}
					<g className="tc-eyes">
						{/* Left eye */}
						<ellipse cx="49" cy="46" rx="6" ry="7" fill="white" />
						<circle cx="51" cy="45" r="4" fill="#1e1b4b" />
						<circle cx="52.5" cy="43.5" r="1.8" fill="white" />
						<circle cx="50" cy="46.5" r="0.8" fill="white" opacity="0.6" />
						{/* Right eye */}
						<ellipse cx="71" cy="46" rx="6" ry="7" fill="white" />
						<circle cx="73" cy="45" r="4" fill="#1e1b4b" />
						<circle cx="74.5" cy="43.5" r="1.8" fill="white" />
						<circle cx="72" cy="46.5" r="0.8" fill="white" opacity="0.6" />
					</g>

					{/* Nose */}
					<ellipse cx="60" cy="54" rx="2.5" ry="2" fill="#fda4af" />

					{/* Mouth */}
					<path
						d="M57,56.5 Q60,60 60,56.5"
						stroke="#4c1d95"
						strokeWidth="1.2"
						strokeLinecap="round"
						fill="none"
					/>
					<path
						d="M60,56.5 Q60,60 63,56.5"
						stroke="#4c1d95"
						strokeWidth="1.2"
						strokeLinecap="round"
						fill="none"
					/>

					{/* Blush */}
					<ellipse
						cx="39"
						cy="54"
						rx="6"
						ry="3.5"
						fill="#fecdd3"
						opacity="0.5"
					/>
					<ellipse
						cx="81"
						cy="54"
						rx="6"
						ry="3.5"
						fill="#fecdd3"
						opacity="0.5"
					/>

					{/* Whiskers */}
					<g stroke="#a78bfa" strokeWidth="0.8" opacity="0.35">
						<line x1="22" y1="50" x2="40" y2="52" />
						<line x1="21" y1="55" x2="40" y2="55" />
						<line x1="80" y1="52" x2="98" y2="50" />
						<line x1="80" y1="55" x2="99" y2="55" />
					</g>
				</g>

				{/* Thought bubbles */}
				<circle
					className="tc-thought tc-thought-1"
					cx="102"
					cy="34"
					r="3.5"
					fill="#a78bfa"
				/>
				<circle
					className="tc-thought tc-thought-2"
					cx="114"
					cy="20"
					r="5"
					fill="#a78bfa"
				/>
				<circle
					className="tc-thought tc-thought-3"
					cx="126"
					cy="8"
					r="7"
					fill="#a78bfa"
				/>

				{/* Sparkles */}
				<g className="tc-sparkle tc-sparkle-1" opacity="0">
					<line
						x1="18"
						y1="14"
						x2="18"
						y2="24"
						stroke="#c4b5fd"
						strokeWidth="2"
						strokeLinecap="round"
					/>
					<line
						x1="13"
						y1="19"
						x2="23"
						y2="19"
						stroke="#c4b5fd"
						strokeWidth="2"
						strokeLinecap="round"
					/>
				</g>
				<g className="tc-sparkle tc-sparkle-2" opacity="0">
					<line
						x1="142"
						y1="48"
						x2="142"
						y2="56"
						stroke="#c4b5fd"
						strokeWidth="1.5"
						strokeLinecap="round"
					/>
					<line
						x1="138"
						y1="52"
						x2="146"
						y2="52"
						stroke="#c4b5fd"
						strokeWidth="1.5"
						strokeLinecap="round"
					/>
				</g>
				<g className="tc-sparkle tc-sparkle-3" opacity="0">
					<line
						x1="8"
						y1="70"
						x2="8"
						y2="78"
						stroke="#c4b5fd"
						strokeWidth="1.5"
						strokeLinecap="round"
					/>
					<line
						x1="4"
						y1="74"
						x2="12"
						y2="74"
						stroke="#c4b5fd"
						strokeWidth="1.5"
						strokeLinecap="round"
					/>
				</g>
			</svg>

			{/* Animated text label */}
			<span className="tc-label">
				{t("sessionStatus.thinking", "思考中")}
				<span className="tc-dots">
					<span className="tc-dot">.</span>
					<span className="tc-dot">.</span>
					<span className="tc-dot">.</span>
				</span>
			</span>
		</div>
	);
}
