export function CardBack() {
  return (
    <svg
      viewBox="0 0 120 168"
      role="img"
      aria-label="Face-down card"
      style={{ width: '100%', height: 'auto', display: 'block' }}
      fontFamily="var(--display)"
    >
      <rect x={0} y={0} width={120} height={168} rx={11} fill="var(--bone)" />
      <rect x={6} y={6} width={108} height={156} rx={7} fill="var(--ink)" />
      <ellipse cx={60} cy={84} rx={50} ry={28} fill="var(--red)" transform="rotate(-27 60 84)" />
      <text
        x={60}
        y={84}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={30}
        fontWeight={600}
        fill="var(--bone)"
        transform="rotate(-27 60 84)"
      >
        UNO
      </text>
    </svg>
  )
}
