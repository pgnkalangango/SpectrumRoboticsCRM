import { cn } from "@/lib/utils";

// Spectrum Robotics wordmark: bold turquoise SPECTRUM inside an orbit ring, ROBOTICS in grey below.
// The ring is drawn behind the letters; a stroke in the ground color knocks the ring out where
// the letters cross it, which is how the original artwork reads. Pass `bg` to match the surface.
export function SpectrumWordmark({
  className,
  color = "#149CA0",
  subColor = "#6E7071",
  bg = "var(--surface)",
  title = "Spectrum Robotics",
}: {
  className?: string;
  color?: string;
  subColor?: string;
  bg?: string;
  title?: string;
}) {
  return (
    <svg viewBox="0 0 1140 330" role="img" aria-label={title} className={cn("h-10 w-auto", className)}>
      <title>{title}</title>
      {/* orbit ring, slightly tilted, thicker on the left like the mark */}
      <ellipse cx="570" cy="130" rx="540" ry="112" fill="none" stroke={color} strokeWidth="30" transform="rotate(-4 570 130)" />
      <text
        x="570"
        y="185"
        textAnchor="middle"
        fontFamily="Arial Black, Archivo, Manrope, Helvetica, Arial, sans-serif"
        fontWeight="900"
        fontSize="172"
        letterSpacing="2"
        fill={color}
        stroke={bg}
        strokeWidth="22"
        strokeLinejoin="round"
        paintOrder="stroke fill"
      >
        SPECTRUM
      </text>
      <line x1="90" y1="292" x2="160" y2="292" stroke={subColor} strokeWidth="14" strokeLinecap="round" />
      <line x1="980" y1="292" x2="1050" y2="292" stroke={subColor} strokeWidth="14" strokeLinecap="round" />
      <text x="570" y="316" textAnchor="middle" fontFamily="Archivo, Manrope, Helvetica, Arial, sans-serif" fontWeight="600" fontSize="70" letterSpacing="30" fill={subColor}>
        ROBOTICS
      </text>
    </svg>
  );
}

// Round badge version used for avatars, favicons and compact headers.
export function SpectrumBadge({ className, size = 36 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} className={className} role="img" aria-label="Spectrum Robotics">
      <circle cx="100" cy="100" r="96" fill="#fff" stroke="#149CA0" strokeWidth="8" />
      <ellipse cx="100" cy="96" rx="78" ry="22" fill="none" stroke="#149CA0" strokeWidth="7" transform="rotate(-4 100 96)" />
      <text x="100" y="108" textAnchor="middle" fontFamily="Arial Black, Archivo, Manrope, Helvetica, Arial, sans-serif" fontWeight="900" fontSize="34" fill="#149CA0" stroke="#fff" strokeWidth="6" paintOrder="stroke fill">
        SPECTRUM
      </text>
      <text x="100" y="140" textAnchor="middle" fontFamily="Archivo, Manrope, Helvetica, Arial, sans-serif" fontWeight="600" fontSize="16" letterSpacing="5" fill="#6E7071">
        ROBOTICS
      </text>
    </svg>
  );
}

export function BrandLogo({ className, raster = false, invert = false }: { className?: string; raster?: boolean; invert?: boolean }) {
  if (raster) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="/brand/logo.png" alt="Spectrum Robotics" className={cn("h-10 w-auto", className)} />;
  }
  return <SpectrumWordmark className={className} color={invert ? "#4DD0D2" : "#149CA0"} subColor={invert ? "#B9C6C9" : "#6E7071"} bg={invert ? "var(--sidebar)" : "var(--surface)"} />;
}
