/**
 * TEMPORARY — the option list for the mascot idle-animation comparison
 * page. Reached with `?mascot=1`, exactly like `?perf=1` reaches the perf
 * overlay; every other visitor renders the normal app and never loads any
 * of this. Delete `src/features/mascot-lab/` and App.tsx's early return
 * once an option is picked and applied for real.
 */

export const MASCOT_LAB_ENABLED = new URLSearchParams(window.location.search).get('mascot') === '1'

export interface MascotOption {
  id: string
  name: string
  /** What it is meant to read as, in one line. */
  summary: string
  /** The trade-off — why you might not want this one. */
  note: string
  /** Full cycle length in ms; also what the frame-strip capture samples across. */
  durationMs: number
  /**
   * For options that are mostly still and then do something, the
   * [start, end] fraction of the cycle that the something happens in.
   * Sampling a 7s hop at twelve even steps lands one or two frames inside
   * the 1s that matters, so the capture takes a second, zoomed strip
   * across just this window.
   */
  detailWindow?: [number, number]
  /** Class on the outer wrapper. */
  outerClass: string
  /**
   * Class on a second, nested wrapper, for options that need two
   * simultaneous transforms (only Wander: path and gait).
   */
  innerClass?: string
}

export const MASCOT_OPTIONS: MascotOption[] = [
  {
    id: 'none',
    name: 'None',
    summary: 'The mascot as it ships today — completely still.',
    note: 'Here as the reference to compare the others against.',
    durationMs: 4500,
    outerClass: '',
  },
  {
    id: 'breathe',
    name: '1 · Breathing',
    summary: 'A slow inhale and a quicker exhale, peaking about 2% off its resting size.',
    note: 'Deliberately near the threshold of noticing. On a phone held at arm’s length it registers as "alive" without ever registering as "moving".',
    durationMs: 4500,
    outerClass: 'gb-lab-breathe',
  },
  {
    id: 'shift',
    name: '2 · Weight shift',
    summary: 'Rocks gently between its two bottom corners, lifting a little onto each one.',
    note: 'The bag has no feet, so this is rocking on its base rather than stepping. Continuous side-to-side motion is the easiest of these to find distracting.',
    durationMs: 3600,
    outerClass: 'gb-lab-shift',
  },
  {
    id: 'hop',
    name: '3 · Occasional hop',
    summary: 'Still for 5.7 of every 7 seconds, then one hop with a crouch, a stretch and a landing squash.',
    note: 'The most personality per second of motion. Also the most likely to be missed entirely on a screen you only look at for four seconds.',
    durationMs: 7000,
    outerClass: 'gb-lab-hop',
    detailWindow: [0.78, 1],
  },
  {
    id: 'wander',
    name: '4 · Wander',
    summary: 'Waddles a little way to the right, pauses, waddles back, pauses. Eight rocking steps per leg.',
    note: 'The most active by a wide margin. It also moves horizontally, which is the one thing here that can pull the eye away from the "I’m ready to shop" button next to it.',
    durationMs: 10000,
    outerClass: 'gb-lab-wander-path',
    innerClass: 'gb-lab-wander-gait',
    // One leg of the journey, where the waddle is.
    detailWindow: [0.1, 0.34],
  },
  {
    id: 'float',
    name: '5 · Float',
    summary: 'Drifts up and down with a trace of roll, never touching down, never squashing.',
    note: 'Reads as weightless rather than as breathing. Arguably right for a paper bag, but it detaches the character from the ground it is standing on.',
    durationMs: 5000,
    outerClass: 'gb-lab-float',
  },
  {
    id: 'crinkle',
    name: '6 · Crinkle',
    summary: 'Breathing, interrupted once a cycle by a short, fast horizontal shiver — paper settling.',
    note: 'The one written for this character specifically rather than for a generic mascot. The shiver is intentionally not smooth; that is what makes it read as paper.',
    durationMs: 8000,
    outerClass: 'gb-lab-crinkle',
    detailWindow: [0.68, 0.92],
  },
  {
    id: 'peek',
    name: '7 · Peek',
    summary: 'Mostly still, then leans in and comes back, as if it spotted something on a shelf.',
    note: 'Same rhythm as the hop but sideways, and it keeps its base planted. Suits a shopping companion; the lean can read as a tip-over if the angle goes much past this.',
    durationMs: 9000,
    outerClass: 'gb-lab-peek',
    detailWindow: [0.66, 1],
  },
]
