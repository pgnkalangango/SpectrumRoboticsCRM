import { cn } from "@/lib/utils";

// Spectrum Robotics wordmark: bold turquoise SPECTRUM inside an orbit ring, ROBOTICS in grey below.
// Drawn as SVG so it stays crisp at any size and on any ground. Drop the original PNG at
// /public/brand/logo.png to use the raster file instead (see <BrandLogo raster />).
export function SpectrumWordmark({ className, color = "#149CA0", subColor = "#6E7071", title = "Spectrum Robotics" }: { className?: string; color?: string; subColor?: string; title?: string }) {
  return (
    <svg viewBox="0 0 1140 330" role="img" aria-label={title} className={cn("h-10 w-auto", className)}>
      <title>{title}</title>
      {/* orbit ring: two arcs with a gap so the ring passes behind the text */}
      <path d="M 165 120 C 70 150, 30 190, 60 215 C 105 250, 420 250, 600 235" fill="none" stroke={color} strokeWidth="26" strokeLinecap="round" />
      <path d="M 870 205 C 1060 185, 1120 150, 1085 110 C 1040 60, 620 40, 300 70" fill="none" stroke={color} strokeWidth="26" strokeLinecap="round" />
      <text x="570" y="178" textAnchor="middle" fontFamily="Arial Black, Archivo, Manrope, Helvetica, Arial, sans-serif" fontWeight="900" fontSize="164" letterSpacing="4" fill={color}>
        SPECTRUM
      </text>
      <line x1="80" y1="292" x2="150" y2="292" stroke={subColor} strokeWidth="14" strokeLinecap="round" />
      <line x1="990" y1="292" x2="1060" y2="292" stroke={subColor} strokeWidth="14" strokeLinecap="round" />
      <text x="570" y="316" textAnchor="middle" fontFamily="Archivo, Manrope, Helvetica, Arial, sans-serif" fontWeight="600" fontSize="72" letterSpacing="30" fill={subColor}>
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
      <path d="M 44 90 C 30 100, 30 112, 44 118 C 70 130, 130 130, 158 122" fill="none" stroke="#149CA0" strokeWidth="9" strokeLinecap="round" />
      <path d="M 156 112 C 172 104, 172 92, 156 84 C 130 72, 70 72, 46 80" fill="none" stroke="#149CA0" strokeWidth="9" strokeLinecap="round" />
      <text x="100" y="109" textAnchor="middle" fontFamily="Arial Black, Archivo, Manrope, Helvetica, Arial, sans-serif" fontWeight="900" fontSize="34" fill="#149CA0">
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
  return <SpectrumWordmark className={className} color={invert ? "#4DD0D2" : "#149CA0"} subColor={invert ? "#B9C6C9" : "#6E7071"} />;
}
