/** PranSetu mark: a bridge span over three pillars, crowned by a blood drop. */
export function PranSetuMark({
  className = "size-8",
  stroke = "currentColor",
}: {
  className?: string;
  stroke?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* drop */}
      <path
        d="M32 4C32 4 22 16.5 22 23a10 10 0 0 0 20 0C42 16.5 32 4 32 4Z"
        stroke={stroke}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* deck */}
      <path
        d="M10 38h44"
        stroke={stroke}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* arches */}
      <path
        d="M14 38c0-6.6 5.4-12 12-12s12 5.4 12 12"
        stroke={stroke}
        strokeWidth="2.5"
      />
      <path
        d="M30 38c0-9.4 7.6-17 17-17 4.9 0 9.3 2.1 12.4 5.4"
        stroke={stroke}
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.55"
      />
      {/* pillars */}
      <path
        d="M10 38v12M54 38v12M32 38v12"
        stroke={stroke}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* waterline */}
      <path
        d="M6 56h52"
        stroke={stroke}
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}
