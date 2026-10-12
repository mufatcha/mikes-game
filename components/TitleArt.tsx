/**
 * Title screen art: the Lemons and the Orange Peels squaring up, angry
 * faces and fists raised. Each fighter is its own SVG so the home screen can
 * put them big on either side, with the VS clash between them.
 */

const FONT = "ui-sans-serif, system-ui, sans-serif";

/** The Lemons' mascot, facing right. Anchored to the bottom-left of its box. */
export function LemonFighter({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="8 48 214 206"
      preserveAspectRatio="xMinYMax meet"
      className={`select-none ${className}`}
      role="img"
      aria-label="The Lemons mascot, angry, fists up"
      fontFamily={FONT}
    >
      <defs>
        <radialGradient id="lemon-body" cx="38%" cy="32%" r="70%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="60%" stopColor="#facc15" />
          <stop offset="100%" stopColor="#ca8a04" />
        </radialGradient>
      </defs>
      <g className="title-bob">
        <ellipse cx="105" cy="222" rx="62" ry="10" fill="#000" opacity="0.35" />
        {/* Back arm and fist, cocked back */}
        <path d="M70 150 Q 40 150 34 120" stroke="#a16207" strokeWidth="10" strokeLinecap="round" fill="none" />
        <Fist cx={34} cy={112} color="#facc15" dark="#a16207" />
        {/* Body: a lemon, pointy at both ends */}
        <ellipse cx="34" cy="140" rx="12" ry="10" fill="#facc15" stroke="#854d0e" strokeWidth="4" />
        <ellipse cx="176" cy="140" rx="12" ry="10" fill="#facc15" stroke="#854d0e" strokeWidth="4" />
        <ellipse cx="105" cy="140" rx="74" ry="62" fill="url(#lemon-body)" stroke="#854d0e" strokeWidth="4" />
        <ellipse cx="78" cy="106" rx="18" ry="9" fill="#fff" opacity="0.4" transform="rotate(-30 78 106)" />
        {/* A leaf on top */}
        <path d="M108 80 Q 120 54 146 58 Q 136 82 108 80z" fill="#16a34a" stroke="#14532d" strokeWidth="3" />
        {/* Angry brows slanting down toward the middle */}
        <path d="M70 116 L 100 128" stroke="#422006" strokeWidth="8" strokeLinecap="round" />
        <path d="M118 128 L 146 114" stroke="#422006" strokeWidth="8" strokeLinecap="round" />
        {/* Eyes glaring right */}
        <ellipse cx="88" cy="140" rx="11" ry="9" fill="#fff" />
        <ellipse cx="130" cy="140" rx="11" ry="9" fill="#fff" />
        <circle cx="93" cy="141" r="5" fill="#422006" />
        <circle cx="135" cy="141" r="5" fill="#422006" />
        {/* Gritted teeth */}
        <rect x="88" y="164" width="40" height="16" rx="6" fill="#fff" stroke="#422006" strokeWidth="3" />
        <path d="M98 164 v16 M108 164 v16 M118 164 v16 M88 172 h40" stroke="#422006" strokeWidth="2" />
        {/* Front arm and fist, jabbing right */}
        <g className="title-jab-right">
          <path d="M150 160 Q 172 156 182 140" stroke="#a16207" strokeWidth="10" strokeLinecap="round" fill="none" />
          <Fist cx={186} cy={132} color="#facc15" dark="#a16207" />
        </g>
      </g>
      <Label x={105} text="LEMONS" color="#fef9c3" />
    </svg>
  );
}

/** The Orange Peels' mascot, facing left. Anchored to the bottom-right of its box. */
export function OrangeFighter({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="258 48 214 206"
      preserveAspectRatio="xMaxYMax meet"
      className={`select-none ${className}`}
      role="img"
      aria-label="The Orange Peels mascot, angry, fists up"
      fontFamily={FONT}
    >
      <defs>
        <radialGradient id="peel-body" cx="40%" cy="35%" r="75%">
          <stop offset="0%" stopColor="#fdba74" />
          <stop offset="55%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#c2410c" />
        </radialGradient>
      </defs>
      <g className="title-bob title-bob-late">
        <ellipse cx="375" cy="222" rx="70" ry="10" fill="#000" opacity="0.35" />
        {/* Back arm and fist, cocked back */}
        <path d="M410 152 Q 440 150 446 120" stroke="#9a3412" strokeWidth="10" strokeLinecap="round" fill="none" />
        <Fist cx={446} cy={112} color="#f97316" dark="#9a3412" />
        {/* The pile: curly peels behind */}
        <Peel x={330} y={108} rot={-30} />
        <Peel x={420} y={104} rot={35} />
        <Peel x={375} y={86} rot={0} />
        <Peel x={318} y={168} rot={-70} />
        <Peel x={434} y={170} rot={70} />
        {/* Front peel with the face */}
        <ellipse cx="375" cy="152" rx="68" ry="56" fill="url(#peel-body)" stroke="#9a3412" strokeWidth="4" />
        <path d="M318 176 Q 375 214 432 176" stroke="#fef3c7" strokeWidth="5" fill="none" opacity="0.8" />
        {[
          [338, 128],
          [412, 124],
          [348, 186],
          [404, 188],
          [375, 112],
        ].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="2.5" fill="#9a3412" opacity="0.6" />
        ))}
        {/* Angry brows slanting down toward the middle */}
        <path d="M410 128 L 380 140" stroke="#431407" strokeWidth="8" strokeLinecap="round" />
        <path d="M362 140 L 334 126" stroke="#431407" strokeWidth="8" strokeLinecap="round" />
        {/* Eyes glaring left */}
        <ellipse cx="394" cy="152" rx="11" ry="9" fill="#fff" />
        <ellipse cx="352" cy="152" rx="11" ry="9" fill="#fff" />
        <circle cx="389" cy="153" r="5" fill="#431407" />
        <circle cx="347" cy="153" r="5" fill="#431407" />
        {/* Gritted teeth, a little crooked */}
        <rect
          x="353"
          y="174"
          width="42"
          height="17"
          rx="6"
          fill="#fff"
          stroke="#431407"
          strokeWidth="3"
          transform="rotate(-4 374 182)"
        />
        <path
          d="M363 175 v16 M374 174 v17 M385 173 v16 M353 183 h42"
          stroke="#431407"
          strokeWidth="2"
          transform="rotate(-4 374 182)"
        />
        {/* Front arm and fist, jabbing left */}
        <g className="title-jab-left">
          <path d="M318 168 Q 298 160 292 142" stroke="#9a3412" strokeWidth="10" strokeLinecap="round" fill="none" />
          <Fist cx={290} cy={134} color="#f97316" dark="#9a3412" />
        </g>
      </g>
      <Label x={375} text="ORANGE PEELS" color="#ffedd5" />
    </svg>
  );
}

/** The glowing VS between the two fighters. */
export function VsClash({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="160 30 160 176" className={`select-none ${className}`} aria-hidden fontFamily={FONT}>
      <defs>
        <radialGradient id="vs-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fef3c7" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="240" cy="118" r="76" fill="url(#vs-glow)" className="title-pulse" />
      <g stroke="#fef3c7" strokeWidth="5" strokeLinecap="round" className="title-pulse">
        <line x1="240" y1="36" x2="240" y2="60" />
        <line x1="240" y1="176" x2="240" y2="200" />
        <line x1="190" y1="66" x2="206" y2="82" />
        <line x1="290" y1="66" x2="274" y2="82" />
        <line x1="190" y1="170" x2="206" y2="154" />
        <line x1="290" y1="170" x2="274" y2="154" />
      </g>
      <text
        x="240"
        y="136"
        textAnchor="middle"
        fontSize="54"
        fontWeight="900"
        fontStyle="italic"
        fill="#fde68a"
        stroke="#7c2d12"
        strokeWidth="4"
        paintOrder="stroke"
        className="title-pulse"
      >
        VS
      </text>
    </svg>
  );
}

function Label({ x, text, color }: { x: number; text: string; color: string }) {
  return (
    <text
      x={x}
      y="246"
      textAnchor="middle"
      fontSize="17"
      fontWeight="900"
      letterSpacing="2"
      fill={color}
      stroke="#0b0b12"
      strokeWidth="4"
      paintOrder="stroke"
    >
      {text}
    </text>
  );
}

/** A cartoon fist: a round knuckle ball with finger lines and a thumb. */
function Fist({ cx, cy, color, dark }: { cx: number; cy: number; color: string; dark: string }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r="17" fill={color} stroke={dark} strokeWidth="3.5" />
      <path
        d={`M${cx - 10} ${cy - 6} h20 M${cx - 11} ${cy + 1} h22 M${cx - 9} ${cy + 8} h18`}
        stroke={dark}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <ellipse cx={cx - 8} cy={cy + 12} rx="7" ry="4.5" fill={color} stroke={dark} strokeWidth="2.5" />
    </g>
  );
}

/** One curly strip of orange peel for the pile. */
function Peel({ x, y, rot }: { x: number; y: number; rot: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <path d="M-30 6 Q 0 -30 30 6" stroke="#c2410c" strokeWidth="20" strokeLinecap="round" fill="none" />
      <path d="M-30 6 Q 0 -30 30 6" stroke="#f97316" strokeWidth="14" strokeLinecap="round" fill="none" />
      <path d="M-24 10 Q 0 -18 24 10" stroke="#fef3c7" strokeWidth="3" strokeLinecap="round" fill="none" />
    </g>
  );
}
