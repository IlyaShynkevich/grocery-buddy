import type { MascotPose } from './useMascotPose'

const MASCOT_SRC: Record<MascotPose, string> = {
  idle: '/mascot/idle.png',
  scanning: '/mascot/scanning.png',
  happy: '/mascot/happy.png',
}

export function Mascot({ pose, size = 64 }: { pose: MascotPose; size?: number }) {
  return (
    <img
      // Decorative only — the receipt list's own status text already
      // conveys processing/done state, this is just a mood accent.
      alt=""
      src={MASCOT_SRC[pose]}
      width={size}
      height={size}
      data-testid="mascot"
      data-pose={pose}
      style={{ display: 'block', flexShrink: 0 }}
    />
  )
}
