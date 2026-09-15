import React from "react";

interface NexvoltLogoProps {
  className?: string;
  showText?: boolean;
  iconSize?: number;
}

export function NexvoltLogo({ className = "", showText = false, iconSize = 40 }: NexvoltLogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Nexvolt Full 3D Brand Logo Card */}
      <div className="relative shrink-0 flex items-center justify-center" style={{ width: iconSize, height: iconSize }}>
        <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#d946ef] via-[#a855f7] to-[#06b6d4] opacity-60 blur-[6px] animate-pulse"></div>
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 512 512"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="relative z-10 drop-shadow-[0_0_12px_rgba(217,70,239,0.4)]"
        >
          <defs>
            {/* Deep Metallic 3D Background */}
            <linearGradient id="nvCardBg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1e1338" />
              <stop offset="40%" stopColor="#0d0a21" />
              <stop offset="100%" stopColor="#050410" />
            </linearGradient>

            {/* Neon Border Gradient */}
            <linearGradient id="nvBorderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#e879f9" />
              <stop offset="35%" stopColor="#c084fc" />
              <stop offset="70%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#0284c7" />
            </linearGradient>

            {/* Inner Badge Border */}
            <linearGradient id="nvBadgeBorder" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#d946ef" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>

            {/* Inner Badge Fill */}
            <linearGradient id="nvBadgeBg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#2e1a52" />
              <stop offset="100%" stopColor="#120c28" />
            </linearGradient>

            {/* Robot Armor Gradient */}
            <linearGradient id="nvRobotWhite" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="70%" stopColor="#f1f5f9" />
              <stop offset="100%" stopColor="#cbd5e1" />
            </linearGradient>

            {/* Robot Visor */}
            <linearGradient id="nvVisorGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#0f172a" />
              <stop offset="100%" stopColor="#020617" />
            </linearGradient>

            {/* Cape Gradient */}
            <linearGradient id="nvCapeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#a855f7" />
              <stop offset="100%" stopColor="#6b21a8" />
            </linearGradient>

            {/* Text X Gradient */}
            <linearGradient id="nvTextXGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#e879f9" />
              <stop offset="50%" stopColor="#c084fc" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>

            {/* Lightning bolt silver white */}
            <linearGradient id="nvBoltWhite" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#f8fafc" />
            </linearGradient>
          </defs>

          {/* Outer Rounded 3D Frame */}
          <rect
            x="20"
            y="20"
            width="472"
            height="472"
            rx="110"
            fill="url(#nvCardBg)"
            stroke="url(#nvBorderGrad)"
            strokeWidth="28"
            strokeLinejoin="round"
          />

          {/* Inner Highlight Border Line */}
          <rect
            x="38"
            y="38"
            width="436"
            height="436"
            rx="92"
            fill="none"
            stroke="#ffffff"
            strokeOpacity="0.15"
            strokeWidth="3"
          />

          {/* LEFT SIDE: 3D ROBOT CHARACTER */}
          <g id="robot-character">
            {/* Cape behind robot */}
            <path
              d="M 125,240 C 90,260 70,340 75,410 C 130,425 180,410 195,350 Z"
              fill="url(#nvCapeGrad)"
            />

            {/* Legs */}
            <rect x="130" y="380" width="22" height="40" rx="10" fill="url(#nvRobotWhite)" />
            <rect x="160" y="380" width="22" height="40" rx="10" fill="url(#nvRobotWhite)" />
            <ellipse cx="138" cy="420" rx="15" ry="8" fill="#94a3b8" />
            <ellipse cx="171" cy="420" rx="15" ry="8" fill="#94a3b8" />

            {/* Torso / Body */}
            <rect x="115" y="235" width="85" height="150" rx="42" fill="url(#nvRobotWhite)" />
            <rect x="125" y="245" width="65" height="130" rx="32" fill="#e2e8f0" />

            {/* Chest Lightning Badge (Small) */}
            <rect x="138" y="270" width="38" height="42" rx="12" fill="url(#nvCapeGrad)" />
            <path
              d="M 160,276 L 148,292 L 157,292 L 151,306 L 166,289 L 157,289 Z"
              fill="#ffffff"
            />

            {/* Left Arm resting on hip */}
            <path
              d="M 115,250 C 95,270 95,310 115,325"
              fill="none"
              stroke="url(#nvRobotWhite)"
              strokeWidth="20"
              strokeLinecap="round"
            />

            {/* Right Arm giving Thumbs Up! 👍 */}
            <path
              d="M 195,255 C 220,240 230,220 238,205"
              fill="none"
              stroke="url(#nvRobotWhite)"
              strokeWidth="20"
              strokeLinecap="round"
            />
            {/* Hand & Thumbs Up */}
            <circle cx="240" cy="198" r="14" fill="url(#nvRobotWhite)" />
            {/* Thumb pointing up */}
            <rect x="235" y="170" width="12" height="25" rx="6" fill="url(#nvRobotWhite)" />

            {/* Head / Helmet */}
            <rect x="100" y="105" width="118" height="120" rx="58" fill="url(#nvRobotWhite)" />
            
            {/* Ears / Side Caps */}
            <circle cx="95" cy="165" r="18" fill="#cbd5e1" />
            <circle cx="95" cy="165" r="12" fill="#0284c7" />
            <circle cx="223" cy="165" r="18" fill="#cbd5e1" />
            <circle cx="223" cy="165" r="12" fill="#0284c7" />

            {/* Glossy Black Visor */}
            <rect x="110" y="125" width="98" height="75" rx="36" fill="url(#nvVisorGrad)" stroke="#334155" strokeWidth="4" />

            {/* Glowing Blue LED Happy Eyes (^ ^) */}
            <path
              d="M 125,162 Q 138,142 150,162"
              fill="none"
              stroke="#38bdf8"
              strokeWidth="7"
              strokeLinecap="round"
            />
            <path
              d="M 168,162 Q 180,142 192,162"
              fill="none"
              stroke="#38bdf8"
              strokeWidth="7"
              strokeLinecap="round"
            />
          </g>

          {/* RIGHT SIDE: GLOWING LIGHTNING BADGE + TYPOGRAPHY */}
          <g id="badge-and-typography">
            {/* Glowing 3D Lightning Square Badge (Top Right) */}
            <rect
              x="270"
              y="90"
              width="160"
              height="160"
              rx="46"
              fill="url(#nvBadgeBg)"
              stroke="url(#nvBadgeBorder)"
              strokeWidth="16"
              strokeLinejoin="round"
            />

            {/* White Sharp Lightning Bolt inside Badge */}
            <path
              d="M 370,112 L 305,178 L 350,178 L 325,230 L 392,162 L 348,162 Z"
              fill="url(#nvBoltWhite)"
              filter="drop-shadow(0px 0px 8px rgba(255,255,255,0.8))"
            />

            {/* Typography: NEXVOLT */}
            <text x="268" y="305" fontFamily="Arial, Helvetica, sans-serif" fontWeight="900" fontSize="58" fill="#ffffff" letterSpacing="1">
              NE
            </text>
            <text x="345" y="305" fontFamily="Arial, Helvetica, sans-serif" fontWeight="900" fontSize="58" fill="url(#nvTextXGrad)" letterSpacing="1">
              X
            </text>
            <text x="382" y="305" fontFamily="Arial, Helvetica, sans-serif" fontWeight="900" fontSize="58" fill="#ffffff" letterSpacing="1">
              VOLT
            </text>

            {/* Typography: — ORA — */}
            <path d="M 270,328 L 305,328" stroke="#38bdf8" strokeWidth="4" strokeLinecap="round" />
            <text x="320" y="335" fontFamily="Arial, Helvetica, sans-serif" fontWeight="900" fontSize="24" fill="#38bdf8" letterSpacing="6">
              ORA
            </text>
            <path d="M 395,328 L 430,328" stroke="#38bdf8" strokeWidth="4" strokeLinecap="round" />

            {/* Subtitle: MAIS VISIBILIDADE. MAIS CLIENTES. MAIS RESULTADOS. */}
            <text x="270" y="372" fontFamily="Arial, Helvetica, sans-serif" fontWeight="800" fontSize="13" fill="#ffffff" letterSpacing="1.5">
              MAIS VISIBILIDADE.
            </text>
            <text x="270" y="392" fontFamily="Arial, Helvetica, sans-serif" fontWeight="800" fontSize="13" fill="#ffffff" letterSpacing="1.5">
              MAIS CLIENTES.
            </text>
            <text x="270" y="412" fontFamily="Arial, Helvetica, sans-serif" fontWeight="800" fontSize="13" fill="#38bdf8" letterSpacing="1.5">
              MAIS RESULTADOS.
            </text>
          </g>
        </svg>
      </div>

      {/* Optional Side Text Branding if showText is true */}
      {showText && (
        <div className="flex flex-col items-start leading-none gap-0.5">
          <span className="font-extrabold text-white tracking-widest text-lg font-sans flex items-center">
            <span>NE</span>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#d946ef] to-[#06b6d4]">X</span>
            <span>VOLT</span>
            <span className="text-[10px] font-black bg-gradient-to-r from-[#d946ef]/20 to-[#06b6d4]/20 text-cyan-400 px-1.5 py-0.5 rounded ml-2 font-mono border border-[#06b6d4]/30 uppercase tracking-widest leading-none">
              ORA
            </span>
          </span>
          <span className="text-[9px] font-semibold text-slate-400 tracking-wider uppercase">
            Mais visibilidade · Mais clientes · Mais resultados
          </span>
        </div>
      )}
    </div>
  );
}

