interface Props {
  width: number
  height: number
  /** Corner size, already multiplied by the HUD scale by the parent. */
  cornerSize: number
  color: string
  selectedColor: string
  selected: boolean
  collapsed?: boolean
  /** Effective HUD scale; applied to detail constants (chamfer, ticks, stroke). */
  scale?: number
}

export function StationVectorFrame({ width: w, height: h, cornerSize, color, selectedColor, selected, collapsed = false, scale = 1 }: Props) {
  if (w === 0 || h === 0) return null

  const accent = selected ? selectedColor : color
  // Matches applyShape: cham = (cs + 16*scale) * phase2 at fully open (phase2 = 1)
  const ch = cornerSize + 16 * scale

  const diagGlow = `drop-shadow(0 0 ${2.5 * scale}px ${accent})`
  const sw = (base: number) => base * scale // stroke widths scale with the HUD
  const tick = 4 * scale // tick mark length

  // Tick positions: 3 evenly-spaced ticks along each bar
  // Top bar spans x=0..w-ch; bottom bar spans x=ch..w (same length)
  const topBarLen = w - ch
  const ticks = [0.25, 0.5, 0.75].map((t) => Math.round(topBarLen * t))
  const bottomTicks = ticks.map((x) => ch + x)

  return (
    <svg
      className="fp-station-frame"
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        overflow: "visible",
        pointerEvents: "none",
        zIndex: 4,
      }}
    >
      {/* ── Station: top bar + TR diagonal (one continuous visual weight) ── */}
      <line
        x1={0} y1={0.5} x2={w - ch} y2={0.5}
        stroke={accent} strokeWidth={sw(1.5)} strokeOpacity={0.82}
        style={{ filter: diagGlow }}
      />
      <line
        x1={w - ch} y1={0} x2={w} y2={ch}
        stroke={accent} strokeWidth={sw(1.5)} strokeOpacity={0.72}
        style={{ filter: diagGlow }}
      />

      {/* ── Station: bottom bar + BL diagonal — hidden when collapsed ── */}
      {!collapsed && (
        <>
          <line
            x1={ch} y1={h - 0.5} x2={w} y2={h - 0.5}
            stroke={accent} strokeWidth={sw(1.5)} strokeOpacity={0.82}
            style={{ filter: diagGlow }}
          />
          <line
            x1={ch} y1={h} x2={0} y2={h - ch}
            stroke={accent} strokeWidth={sw(1.5)} strokeOpacity={0.72}
            style={{ filter: diagGlow }}
          />
        </>
      )}

      {/* ── Station: corner vertical marks at TL (always) and BR (expanded only) ── */}
      <line x1={0.5} y1={0} x2={0.5} y2={cornerSize + 2 * scale}
        stroke={accent} strokeWidth={sw(1.2)} strokeOpacity={0.5} />
      {!collapsed && (
        <line x1={w - 0.5} y1={h - cornerSize - 2 * scale} x2={w - 0.5} y2={h}
          stroke={accent} strokeWidth={sw(1.2)} strokeOpacity={0.5} />
      )}

      {/* ── Station: tick marks — bottom ticks hidden when collapsed ── */}
      {ticks.map((x, i) => (
        <line key={`tt${i}`} x1={x} y1={0} x2={x} y2={tick}
          stroke={accent} strokeWidth={sw(0.65)} strokeOpacity={0.38} />
      ))}
      {!collapsed && bottomTicks.map((x, i) => (
        <line key={`tb${i}`} x1={x} y1={h} x2={x} y2={h - tick}
          stroke={accent} strokeWidth={sw(0.65)} strokeOpacity={0.38} />
      ))}
    </svg>
  )
}
