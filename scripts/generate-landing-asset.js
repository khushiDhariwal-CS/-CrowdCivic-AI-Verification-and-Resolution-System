const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

function generateSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080">
  <defs>
    <!-- Gradients -->
    <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#dbeafe" />
      <stop offset="45%" stop-color="#f0f9ff" />
      <stop offset="75%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#f8fafc" />
    </linearGradient>

    <linearGradient id="swooshGrad" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0%" stop-color="#059669" />
      <stop offset="35%" stop-color="#06b6d4" />
      <stop offset="85%" stop-color="#3b82f6" />
      <stop offset="100%" stop-color="#6366f1" />
    </linearGradient>

    <linearGradient id="hoodieGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1d4ed8" />
      <stop offset="60%" stop-color="#2563eb" />
      <stop offset="100%" stop-color="#1e40af" />
    </linearGradient>

    <linearGradient id="phoneScreenGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#64748b" />
      <stop offset="50%" stop-color="#475569" />
      <stop offset="100%" stop-color="#334155" />
    </linearGradient>

    <linearGradient id="vestGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#bef264" />
      <stop offset="50%" stop-color="#a3e635" />
      <stop offset="100%" stop-color="#84cc16" />
    </linearGradient>

    <linearGradient id="truckGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fde047" />
      <stop offset="60%" stop-color="#eab308" />
      <stop offset="100%" stop-color="#ca8a04" />
    </linearGradient>

    <linearGradient id="roadGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#94a3b8" />
      <stop offset="30%" stop-color="#64748b" />
      <stop offset="100%" stop-color="#475569" />
    </linearGradient>

    <linearGradient id="radarPulse" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.5" />
      <stop offset="100%" stop-color="#0284c7" stop-opacity="0.1" />
    </linearGradient>

    <!-- Filters -->
    <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#0f172a" flood-opacity="0.15" />
    </filter>

    <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- 1. Background Sky -->
  <rect width="1920" height="1080" fill="url(#skyGrad)" />

  <!-- Sun Glow -->
  <circle cx="1200" cy="180" r="280" fill="#fef08a" opacity="0.45" filter="url(#softGlow)" />

  <!-- Clouds -->
  <g fill="#ffffff" opacity="0.85">
    <ellipse cx="650" cy="120" rx="140" ry="40" />
    <ellipse cx="730" cy="110" rx="90" ry="35" />
    <ellipse cx="580" cy="130" rx="80" ry="30" />

    <ellipse cx="1450" cy="90" rx="180" ry="45" />
    <ellipse cx="1550" cy="80" rx="110" ry="40" />
    <ellipse cx="1380" cy="100" rx="90" ry="32" />
  </g>

  <!-- 2. City Skyline Layer -->
  <g fill="#cbd5e1" opacity="0.6">
    <rect x="750" y="240" width="80" height="320" rx="4" />
    <rect x="850" y="200" width="110" height="360" rx="4" />
    <rect x="980" y="150" width="130" height="410" rx="6" />
    <polygon points="1045,90 1035,150 1055,150" />
    <rect x="1130" y="220" width="90" height="340" rx="4" />
    <rect x="1240" y="270" width="120" height="290" rx="4" />
    <rect x="1380" y="230" width="100" height="330" rx="4" />
    <rect x="1500" y="260" width="140" height="300" rx="4" />
  </g>

  <!-- City Skyline Near Layer -->
  <g fill="#94a3b8" opacity="0.5">
    <rect x="700" y="320" width="90" height="240" rx="4" />
    <rect x="810" y="280" width="100" height="280" rx="4" />
    <rect x="930" y="260" width="120" height="300" rx="4" />
    <rect x="1180" y="300" width="110" height="260" rx="4" />
    <rect x="1310" y="280" width="100" height="280" rx="4" />
    <rect x="1430" y="330" width="130" height="230" rx="4" />
  </g>

  <!-- 3. Trees & Park Greenery -->
  <g>
    <!-- Background Trees -->
    <circle cx="680" cy="540" r="90" fill="#15803d" opacity="0.8" />
    <circle cx="750" cy="510" r="110" fill="#16a34a" opacity="0.9" />
    <circle cx="840" cy="530" r="95" fill="#22c55e" opacity="0.85" />
    <circle cx="1600" cy="520" r="130" fill="#16a34a" opacity="0.9" />
    <circle cx="1720" cy="540" r="110" fill="#15803d" opacity="0.8" />
    <circle cx="1840" cy="510" r="140" fill="#16a34a" opacity="0.85" />

    <!-- Foreground Green foliage -->
    <path d="M 600 580 Q 750 480 900 580 L 900 620 L 600 620 Z" fill="#15803d" />
    <path d="M 1550 580 Q 1720 460 1920 560 L 1920 620 L 1550 620 Z" fill="#15803d" />
    <path d="M 1650 600 Q 1780 500 1920 580 L 1920 630 L 1650 630 Z" fill="#22c55e" />
  </g>

  <!-- 4. Paved Street Ground -->
  <polygon points="550,600 1920,600 1920,1080 350,1080" fill="url(#roadGrad)" />
  <!-- Sidewalk curb -->
  <polygon points="530,590 1920,590 1920,605 550,605" fill="#cbd5e1" />
  <polygon points="525,585 1920,585 1920,590 530,590" fill="#94a3b8" />

  <!-- Road dashed lane markings -->
  <g stroke="#ffffff" stroke-width="8" stroke-dasharray="70,50" opacity="0.6">
    <line x1="780" y1="680" x2="1920" y2="760" />
    <line x1="620" y1="840" x2="1920" y2="920" stroke-width="12" stroke-dasharray="90,60" />
  </g>

  <!-- 5. Realistic Road Pothole in foreground street -->
  <g transform="translate(1120, 780)">
    <!-- Pothole base cavity -->
    <ellipse cx="140" cy="60" rx="160" ry="60" fill="#1e293b" />
    <ellipse cx="140" cy="65" rx="140" ry="50" fill="#0f172a" />
    <!-- Cracks and broken asphalt edges -->
    <path d="M -10 50 Q 40 20 100 25 Q 180 15 250 40 Q 310 65 260 95 Q 180 120 110 115 Q 30 115 -10 80 Z" fill="#334155" opacity="0.85" />
    <path d="M 20 60 Q 60 40 120 45 Q 190 35 240 60 Q 270 80 230 100 Q 170 110 110 105 Q 50 105 20 85 Z" fill="#090d16" />
    <!-- Crack fissures extending into asphalt -->
    <path d="M -30 40 L 0 50 M 270 30 L 320 20 M 280 85 L 340 110 M 120 120 L 130 155 M 30 100 L -15 130" stroke="#1e293b" stroke-width="4" stroke-linecap="round" />
    <!-- Asphalt grit & rubble -->
    <circle cx="80" cy="80" r="7" fill="#64748b" />
    <circle cx="160" cy="70" r="9" fill="#475569" />
    <circle cx="210" cy="85" r="6" fill="#64748b" />
    <circle cx="120" cy="90" r="5" fill="#94a3b8" />
  </g>

  <!-- Safety traffic cones -->
  <g transform="translate(1480, 710)">
    <polygon points="20,0 35,65 5,65" fill="#f97316" />
    <polygon points="17,15 23,15 25,28 15,28" fill="#ffffff" />
    <polygon points="13,38 27,38 30,50 10,50" fill="#ffffff" />
    <rect x="0" y="65" width="40" height="8" rx="2" fill="#ea580c" />
  </g>
  <g transform="translate(1560, 680)">
    <polygon points="18,0 32,55 4,55" fill="#f97316" />
    <polygon points="15,12 21,12 23,24 13,24" fill="#ffffff" />
    <polygon points="11,32 25,32 28,42 8,42" fill="#ffffff" />
    <rect x="0" y="55" width="36" height="7" rx="2" fill="#ea580c" />
  </g>

  <!-- 6. Yellow Municipal Maintenance Utility Truck (Right Background) -->
  <g transform="translate(1380, 560)">
    <!-- Truck Shadow -->
    <ellipse cx="220" cy="145" rx="210" ry="25" fill="#1e293b" opacity="0.4" />
    <!-- Truck Chassis -->
    <rect x="40" y="60" width="360" height="75" rx="8" fill="url(#truckGrad)" />
    <!-- Cab -->
    <path d="M 280 60 L 380 60 Q 400 60 400 85 L 400 135 L 280 135 Z" fill="url(#truckGrad)" />
    <!-- Windshield & Window -->
    <path d="M 290 68 L 350 68 Q 365 68 375 85 L 385 105 L 290 105 Z" fill="#0284c7" opacity="0.85" />
    <rect x="295" y="74" width="40" height="26" fill="#38bdf8" opacity="0.6" />
    <!-- Flashing beacon lights -->
    <rect x="315" y="52" width="28" height="9" rx="3" fill="#f59e0b" filter="url(#softGlow)" />
    <!-- Wheels -->
    <circle cx="110" cy="135" r="32" fill="#1e293b" />
    <circle cx="110" cy="135" r="18" fill="#64748b" />
    <circle cx="340" cy="135" r="32" fill="#1e293b" />
    <circle cx="340" cy="135" r="18" fill="#64748b" />
    <!-- Truck cargo box stripes -->
    <line x1="50" y1="75" x2="260" y2="75" stroke="#ca8a04" stroke-width="4" />
    <line x1="50" y1="95" x2="260" y2="95" stroke="#ca8a04" stroke-width="4" />
    <!-- Municipal Emblem on truck door -->
    <circle cx="320" cy="118" r="10" fill="#0284c7" />
    <path d="M 316 118 L 320 122 L 325 115" stroke="#ffffff" stroke-width="2" fill="none" />
  </g>

  <!-- 7. Municipal Authority Officer (Right Foreground) -->
  <g transform="translate(1640, 470)">
    <!-- Body Profile -->
    <!-- Cap -->
    <ellipse cx="140" cy="65" rx="22" ry="12" fill="#1e293b" />
    <path d="M 120 65 Q 110 65 105 72 L 125 72 Z" fill="#0f172a" />
    <!-- Head / Neck -->
    <circle cx="140" cy="80" r="18" fill="#fed7aa" />
    <!-- Dark uniform collar -->
    <path d="M 120 95 L 160 95 L 165 125 L 115 125 Z" fill="#1e293b" />
    <!-- Neon Yellow Safety Vest -->
    <path d="M 112 115 L 168 115 L 175 290 L 105 290 Z" fill="url(#vestGrad)" />
    <!-- Reflective Silver Stripes on vest -->
    <rect x="110" y="160" width="60" height="16" fill="#ffffff" opacity="0.9" />
    <rect x="107" y="215" width="65" height="18" fill="#ffffff" opacity="0.9" />
    <rect x="125" y="115" width="12" height="100" fill="#ffffff" opacity="0.8" />
    <!-- Blue uniform sleeve & hand -->
    <path d="M 115 130 Q 95 180 85 220 L 105 235 Q 120 190 135 150 Z" fill="#1e293b" />
    <circle cx="85" cy="225" r="10" fill="#fed7aa" />
    <!-- Digital Tablet held in hands -->
    <g transform="translate(55, 185) rotate(-15)">
      <rect x="0" y="0" width="55" height="42" rx="4" fill="#0f172a" />
      <rect x="3" y="3" width="49" height="36" rx="2" fill="#0284c7" />
      <line x1="8" y1="12" x2="35" y2="12" stroke="#ffffff" stroke-width="3" />
      <line x1="8" y1="20" x2="44" y2="20" stroke="#ffffff" stroke-width="2" />
      <line x1="8" y1="26" x2="28" y2="26" stroke="#ffffff" stroke-width="2" />
      <circle cx="40" cy="30" r="5" fill="#22c55e" />
    </g>
    <!-- Dark trousers -->
    <rect x="112" y="290" width="28" height="180" rx="6" fill="#1e293b" />
    <rect x="142" y="290" width="28" height="180" rx="6" fill="#0f172a" />
  </g>

  <!-- 8. Female Citizen Reporter (Center Foreground) -->
  <g transform="translate(680, 340)">
    <!-- Hair Bun -->
    <ellipse cx="265" cy="85" rx="36" ry="34" fill="#1c1917" />
    <circle cx="265" cy="70" r="24" fill="#292524" />
    <!-- Head & Ears -->
    <ellipse cx="270" cy="140" rx="28" ry="34" fill="#fed7aa" />
    <ellipse cx="245" cy="145" rx="8" ry="12" fill="#fed7aa" />
    <!-- Hair strands & shape -->
    <path d="M 245 110 Q 285 105 295 130 Q 300 160 285 170 Q 255 170 248 135 Z" fill="#1c1917" />

    <!-- Blue Hoodie Body -->
    <path d="M 230 170 Q 270 180 310 170 Q 380 230 400 450 L 150 450 Q 170 230 230 170 Z" fill="url(#hoodieGrad)" />
    <!-- Hoodie Hood folds -->
    <path d="M 210 175 Q 270 230 330 175 Q 310 160 270 165 Q 230 160 210 175 Z" fill="#1e40af" />
    <!-- Hoodie crease shadows -->
    <path d="M 180 280 Q 220 320 200 420" stroke="#1e3a8a" stroke-width="8" stroke-linecap="round" fill="none" opacity="0.6" />
    <path d="M 360 280 Q 330 330 340 430" stroke="#1e3a8a" stroke-width="8" stroke-linecap="round" fill="none" opacity="0.6" />

    <!-- Black Backpack -->
    <ellipse cx="270" cy="330" rx="80" ry="105" fill="#0f172a" />
    <ellipse cx="270" cy="320" rx="65" ry="85" fill="#1e293b" />
    <path d="M 200 230 Q 220 320 205 380" stroke="#0f172a" stroke-width="18" stroke-linecap="round" fill="none" />
    <path d="M 335 230 Q 320 320 335 380" stroke="#0f172a" stroke-width="18" stroke-linecap="round" fill="none" />
    <rect x="235" y="340" width="70" height="40" rx="8" fill="#0f172a" />
    <line x1="245" y1="360" x2="295" y2="360" stroke="#64748b" stroke-width="3" />

    <!-- Citizen Arms holding phone up -->
    <!-- Right Arm -->
    <path d="M 360 220 Q 420 280 435 350 L 405 370 Q 380 300 330 250 Z" fill="#1d4ed8" />
    <!-- Left Arm -->
    <path d="M 200 220 Q 300 280 380 350 L 360 375 Q 280 310 180 250 Z" fill="#2563eb" />
    <!-- Hands holding phone -->
    <circle cx="395" cy="360" r="16" fill="#fed7aa" />
    <circle cx="430" cy="355" r="16" fill="#fed7aa" />

    <!-- Modern Smartphone Device -->
    <g transform="translate(380, 230)">
      <!-- Phone casing -->
      <rect x="0" y="0" width="90" height="170" rx="18" fill="#020617" stroke="#475569" stroke-width="3" />
      <!-- Screen display -->
      <rect x="5" y="6" width="80" height="158" rx="14" fill="url(#phoneScreenGrad)" />
      <!-- Camera app live preview on screen showing pothole -->
      <rect x="8" y="24" width="74" height="105" rx="6" fill="#334155" />
      <ellipse cx="45" cy="76" rx="26" ry="16" fill="#0f172a" />
      <circle cx="45" cy="76" r="14" stroke="#38bdf8" stroke-width="2" stroke-dasharray="4,3" fill="none" />
      <!-- Shutter button & camera HUD -->
      <circle cx="45" cy="145" r="12" fill="#ffffff" />
      <circle cx="45" cy="145" r="9" fill="#0284c7" />
      <!-- Top speaker notch -->
      <rect x="32" y="10" width="26" height="4" rx="2" fill="#0f172a" />
    </g>
  </g>

  <!-- 9. Floating Glassmorphism Data Cards -->

  <!-- Top-Right Card: AI Detection Result -->
  <g transform="translate(1220, 195)" filter="url(#cardShadow)">
    <rect width="490" height="270" rx="24" fill="#ffffff" stroke="#e2e8f0" stroke-width="2" />
    
    <!-- Pothole preview thumbnail inside card -->
    <g transform="translate(24, 24)">
      <rect width="210" height="220" rx="16" fill="#64748b" />
      <!-- Photo content: street asphalt & pothole -->
      <ellipse cx="105" cy="125" rx="75" ry="45" fill="#1e293b" />
      <ellipse cx="105" cy="128" rx="60" ry="32" fill="#0f172a" />
      <!-- Bounding box overlay -->
      <rect x="25" y="55" width="160" height="120" rx="8" stroke="#8b5cf6" stroke-width="3" stroke-dasharray="6,4" fill="#8b5cf6" fill-opacity="0.12" />
      <!-- Bounding box tags -->
      <rect x="25" y="40" width="80" height="24" rx="6" fill="#6366f1" />
      <text x="65" y="56" fill="#ffffff" font-size="12" font-family="system-ui, sans-serif" font-weight="700" text-anchor="middle">Pothole</text>
      <rect x="145" y="40" width="40" height="24" rx="6" fill="#22c55e" />
      <text x="165" y="56" fill="#ffffff" font-size="12" font-family="system-ui, sans-serif" font-weight="700" text-anchor="middle">92%</text>
    </g>

    <!-- Card Metadata Details -->
    <g transform="translate(255, 40)">
      <g>
        <circle cx="10" cy="10" r="8" fill="#ede9fe" />
        <path d="M 10 4 L 12 8 L 16 10 L 12 12 L 10 16 L 8 12 L 4 10 L 8 8 Z" fill="#7c3aed" />
        <text x="26" y="15" fill="#6d28d9" font-size="16" font-family="system-ui, sans-serif" font-weight="700">AI Detection</text>
      </g>

      <text x="0" y="55" fill="#64748b" font-size="13" font-family="system-ui, sans-serif" font-weight="600">Issue Type</text>
      <text x="0" y="80" fill="#0f172a" font-size="20" font-family="system-ui, sans-serif" font-weight="800">Pothole</text>

      <text x="0" y="125" fill="#64748b" font-size="13" font-family="system-ui, sans-serif" font-weight="600">Location</text>
      <g transform="translate(0, 138)">
        <path d="M 7 0 C 3 0 0 3 0 7 C 0 12 7 19 7 19 C 7 19 14 12 14 7 C 14 3 11 0 7 0 Z" fill="#0284c7" />
        <circle cx="7" cy="7" r="2.5" fill="#ffffff" />
        <text x="22" y="14" fill="#0284c7" font-size="14" font-family="system-ui, monospace" font-weight="700">28.6280, 77.4126</text>
      </g>

      <text x="0" y="180" fill="#64748b" font-size="13" font-family="system-ui, sans-serif" font-weight="600">Confidence</text>
      <g transform="translate(0, 192)">
        <rect width="65" height="26" rx="13" fill="#dcfce7" />
        <text x="32" y="18" fill="#15803d" font-size="14" font-family="system-ui, sans-serif" font-weight="800" text-anchor="middle">92%</text>
      </g>
    </g>
  </g>

  <!-- Bottom-Right Card: Radar Radius Map -->
  <g transform="translate(1300, 570)" filter="url(#cardShadow)">
    <rect width="260" height="200" rx="20" fill="#ffffff" stroke="#e2e8f0" stroke-width="2" />
    <!-- Mini Map Grid -->
    <g transform="translate(20, 20)">
      <rect width="220" height="160" rx="12" fill="#f0f9ff" />
      <!-- Map road lines -->
      <path d="M 0 50 Q 80 40 140 70 L 220 80" stroke="#bae6fd" stroke-width="8" fill="none" />
      <path d="M 70 0 L 110 160" stroke="#bae6fd" stroke-width="12" fill="none" />
      <path d="M 160 0 Q 150 90 220 120" stroke="#bae6fd" stroke-width="7" fill="none" />

      <!-- Concentric Radar Pulse -->
      <circle cx="110" cy="80" r="60" fill="url(#radarPulse)" stroke="#38bdf8" stroke-width="2" stroke-dasharray="4,4" />
      <circle cx="110" cy="80" r="38" fill="#38bdf8" fill-opacity="0.2" stroke="#0284c7" stroke-width="2" />
      <circle cx="110" cy="80" r="16" fill="#0284c7" fill-opacity="0.3" />

      <!-- Map Pin -->
      <g transform="translate(98, 55)">
        <path d="M 12 0 C 5 0 0 5 0 12 C 0 20 12 30 12 30 C 12 30 24 20 24 12 C 24 5 19 0 12 0 Z" fill="#0284c7" filter="url(#softGlow)" />
        <circle cx="12" cy="11" r="5" fill="#ffffff" />
      </g>

      <!-- Badge "Within 20m" -->
      <g transform="translate(125, 20)">
        <rect width="85" height="26" rx="6" fill="#3b82f6" />
        <text x="42" y="17" fill="#ffffff" font-size="12" font-family="system-ui, sans-serif" font-weight="700" text-anchor="middle">Within 20m</text>
      </g>
    </g>
  </g>

  <!-- Dotted Connection Lines -->
  <g stroke="#38bdf8" stroke-width="3" stroke-dasharray="8,6" opacity="0.8" fill="none">
    <path d="M 1220 330 C 1140 330 1120 400 1140 450" />
    <path d="M 1260 540 C 1220 540 1230 650 1300 660" />
  </g>

  <!-- 10. Left Hero Content & Branding -->

  <!-- Top-Left Logo -->
  <g transform="translate(80, 45)">
    <!-- Civic Emblem Icon (Shield with Leaf) -->
    <rect width="60" height="60" rx="16" fill="#0284c7" />
    <path d="M 30 14 C 20 14 16 22 16 34 C 16 46 30 52 30 52 C 30 52 44 46 44 34 C 44 22 40 14 30 14 Z" fill="#38bdf8" />
    <path d="M 30 20 C 24 20 22 26 22 34 C 22 41 30 46 30 46 C 30 46 38 41 38 34 C 38 26 36 20 30 20 Z" fill="#10b981" />
    <circle cx="30" cy="33" r="4" fill="#ffffff" />

    <!-- Brand Typography -->
    <text x="76" y="38" fill="#0f172a" font-size="34" font-family="system-ui, -apple-system, sans-serif" font-weight="800" letter-spacing="-0.5">Crowd Civic <tspan fill="#06b6d4">AI</tspan></text>
    <text x="78" y="58" fill="#64748b" font-size="15" font-family="system-ui, sans-serif" font-weight="600">Smarter Reports. Cleaner Cities.</text>
  </g>

  <!-- Top-Right Badge in Banner -->
  <g transform="translate(1520, 50)">
    <rect width="280" height="42" rx="21" fill="#e0f2fe" stroke="#bae6fd" stroke-width="1.5" />
    <path d="M 24 21 L 26 17 L 30 15 L 26 13 L 24 9 L 22 13 L 18 15 L 22 17 Z" fill="#0284c7" />
    <text x="42" y="26" fill="#0369a1" font-size="14" font-family="system-ui, sans-serif" font-weight="700">AI-Powered Civic Reporting</text>
  </g>

  <!-- Hero Headlines -->
  <g transform="translate(80, 200)">
    <text x="0" y="48" fill="#0f172a" font-size="56" font-family="system-ui, -apple-system, sans-serif" font-weight="800" letter-spacing="-1">Together for a</text>
    <text x="0" y="116" font-size="58" font-family="system-ui, -apple-system, sans-serif" font-weight="800" letter-spacing="-1">
      <tspan fill="#06b6d4">Cleaner</tspan><tspan fill="#0f172a">, </tspan><tspan fill="#1d4ed8">Safer &amp;</tspan>
    </text>
    <text x="0" y="184" fill="#0f172a" font-size="58" font-family="system-ui, -apple-system, sans-serif" font-weight="800" letter-spacing="-1">Smarter Tomorrow</text>

    <!-- Subtitle description -->
    <text x="0" y="245" fill="#475569" font-size="19" font-family="system-ui, sans-serif" font-weight="500" width="560">
      <tspan x="0" dy="0">Crowd Civic AI helps citizens report civic issues, uses</tspan>
      <tspan x="0" dy="28">AI to verify and detect problems, and connects them</tspan>
      <tspan x="0" dy="28">with the right authorities for faster resolution.</tspan>
    </text>

    <!-- 4 Core Steps Badges -->
    <g transform="translate(0, 360)">
      <!-- Step 1: Report -->
      <g transform="translate(0, 0)">
        <circle cx="36" cy="36" r="32" fill="#e0f2fe" stroke="#bae6fd" stroke-width="1.5" />
        <!-- Phone icon -->
        <rect x="26" y="22" width="20" height="28" rx="4" fill="none" stroke="#0284c7" stroke-width="2.5" />
        <circle cx="36" cy="44" r="1.5" fill="#0284c7" />
        <text x="36" y="90" fill="#0f172a" font-size="16" font-family="system-ui, sans-serif" font-weight="700" text-anchor="middle">Report</text>
        <text x="36" y="108" fill="#64748b" font-size="12" font-family="system-ui, sans-serif" font-weight="500" text-anchor="middle">Snap. Describe.</text>
        <text x="36" y="122" fill="#64748b" font-size="12" font-family="system-ui, sans-serif" font-weight="500" text-anchor="middle">Submit.</text>
      </g>

      <!-- Step 2: AI Verify -->
      <g transform="translate(130, 0)">
        <circle cx="36" cy="36" r="32" fill="#f3e8ff" stroke="#e9d5ff" stroke-width="1.5" />
        <!-- Microchip icon -->
        <rect x="24" y="24" width="24" height="24" rx="4" fill="none" stroke="#7e22ce" stroke-width="2.5" />
        <text x="36" y="40" fill="#7e22ce" font-size="11" font-family="system-ui, sans-serif" font-weight="800" text-anchor="middle">AI</text>
        <text x="36" y="90" fill="#0f172a" font-size="16" font-family="system-ui, sans-serif" font-weight="700" text-anchor="middle">AI Verify</text>
        <text x="36" y="108" fill="#64748b" font-size="12" font-family="system-ui, sans-serif" font-weight="500" text-anchor="middle">Detect. Analyze.</text>
        <text x="36" y="122" fill="#64748b" font-size="12" font-family="system-ui, sans-serif" font-weight="500" text-anchor="middle">Check.</text>
      </g>

      <!-- Step 3: Connect -->
      <g transform="translate(260, 0)">
        <circle cx="36" cy="36" r="32" fill="#dcfce7" stroke="#bbf7d0" stroke-width="1.5" />
        <!-- Shield icon -->
        <path d="M 36 22 C 30 22 26 27 26 34 C 26 43 36 48 36 48 C 36 48 46 43 46 34 C 46 27 42 22 36 22 Z" fill="none" stroke="#16a34a" stroke-width="2.5" />
        <circle cx="36" cy="33" r="2.5" fill="#16a34a" />
        <text x="36" y="90" fill="#0f172a" font-size="16" font-family="system-ui, sans-serif" font-weight="700" text-anchor="middle">Connect</text>
        <text x="36" y="108" fill="#64748b" font-size="12" font-family="system-ui, sans-serif" font-weight="500" text-anchor="middle">Notifies the right</text>
        <text x="36" y="122" fill="#64748b" font-size="12" font-family="system-ui, sans-serif" font-weight="500" text-anchor="middle">authorities.</text>
      </g>

      <!-- Step 4: Resolve -->
      <g transform="translate(390, 0)">
        <circle cx="36" cy="36" r="32" fill="#fef3c7" stroke="#fde68a" stroke-width="1.5" />
        <!-- Checkmark icon -->
        <circle cx="36" cy="36" r="14" fill="none" stroke="#d97706" stroke-width="2.5" />
        <path d="M 30 36 L 34 40 L 42 32" fill="none" stroke="#d97706" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
        <text x="36" y="90" fill="#0f172a" font-size="16" font-family="system-ui, sans-serif" font-weight="700" text-anchor="middle">Resolve</text>
        <text x="36" y="108" fill="#64748b" font-size="12" font-family="system-ui, sans-serif" font-weight="500" text-anchor="middle">Track. Get updates.</text>
        <text x="36" y="122" fill="#64748b" font-size="12" font-family="system-ui, sans-serif" font-weight="500" text-anchor="middle">See real change.</text>
      </g>
    </g>
  </g>

  <!-- 11. Bottom-Left Vibrant Fluid Wave Curve -->
  <g>
    <!-- Fluid Wave Polygon -->
    <path d="M -50 780 Q 250 820 420 950 Q 520 1020 620 1090 L -50 1090 Z" fill="url(#swooshGrad)" />
    <!-- White Cursive / Script Quote -->
    <g transform="translate(60, 840) rotate(-14)">
      <text x="0" y="0" fill="#ffffff" font-size="28" font-family="'Caveat', 'Segoe Script', 'Brush Script MT', cursive, sans-serif" font-weight="600" letter-spacing="1">
        <tspan x="0" dy="0">Real People.</tspan>
        <tspan x="0" dy="38">Real Issues.</tspan>
        <tspan x="0" dy="38">Real Change.</tspan>
      </text>
    </g>
  </g>
</svg>`;
}

async function main() {
  const publicDir = path.join(__dirname, '..', 'public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  const svgContent = generateSvg();
  const svgPath = path.join(publicDir, 'landing-bg.svg');
  const pngPath = path.join(publicDir, 'image.png');
  const heroPngPath = path.join(publicDir, 'hero-bg.png');

  fs.writeFileSync(svgPath, svgContent, 'utf8');
  console.log('Saved SVG to:', svgPath);

  // Convert to high-resolution PNGs using sharp
  const buffer = Buffer.from(svgContent);
  await sharp(buffer)
    .png({ quality: 95 })
    .toFile(pngPath);
  console.log('Saved PNG to:', pngPath);

  await sharp(buffer)
    .png({ quality: 95 })
    .toFile(heroPngPath);
  console.log('Saved PNG to:', heroPngPath);
}

main().catch(err => {
  console.error('Error generating assets:', err);
  process.exit(1);
});
