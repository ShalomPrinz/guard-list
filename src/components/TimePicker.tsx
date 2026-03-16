import { useRef, useState, useCallback, useEffect } from 'react'

interface TimePickerProps {
  value: string           // "HH:MM"
  onChange: (value: string) => void
  className?: string
}

// True on touch-primary devices (Android/iOS); false on mouse-primary (desktop)
const IS_COARSE = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function parseHHMM(value: string): [number, number] {
  const [hStr, mStr] = value.split(':')
  const h = parseInt(hStr ?? '0', 10)
  const m = parseInt(mStr ?? '0', 10)
  return [isNaN(h) ? 0 : clamp(h, 0, 23), isNaN(m) ? 0 : clamp(m, 0, 59)]
}

// ─── Desktop spinner ──────────────────────────────────────────────────────────

interface SpinnerProps {
  value: number
  min: number
  max: number
  onChange: (n: number) => void
  label: string
  'aria-label': string
}

function Spinner({ value, min, max, onChange, 'aria-label': ariaLabel }: SpinnerProps) {
  const [inputVal, setInputVal] = useState(pad(value))
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep display in sync when value changes from outside
  useEffect(() => { setInputVal(pad(value)) }, [value])

  function commit(raw: string) {
    const n = parseInt(raw, 10)
    if (!isNaN(n)) {
      onChange(clamp(n, min, max))
    } else {
      setInputVal(pad(value)) // revert
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowUp')   { e.preventDefault(); onChange(value === max ? min : value + 1) }
    if (e.key === 'ArrowDown') { e.preventDefault(); onChange(value === min ? max : value - 1) }
    if (e.key === 'Enter' || e.key === 'Tab') commit(inputVal)
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault()
    onChange(e.deltaY < 0
      ? (value === max ? min : value + 1)
      : (value === min ? max : value - 1))
  }

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      aria-label={ariaLabel}
      value={inputVal}
      onChange={e => setInputVal(e.target.value)}
      onBlur={e => commit(e.target.value)}
      onFocus={() => inputRef.current?.select()}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
      maxLength={2}
      className="w-10 select-all bg-transparent text-center text-base tabular-nums text-gray-900 outline-none dark:text-gray-100"
    />
  )
}

// ─── TimePicker ───────────────────────────────────────────────────────────────

export default function TimePicker({ value, onChange, className = '' }: TimePickerProps) {
  const [hours, minutes] = parseHHMM(value)

  const emit = useCallback((h: number, m: number) => {
    onChange(`${pad(h)}:${pad(m)}`)
  }, [onChange])

  // ── Mobile: native time input ────────────────────────────────────────────
  if (IS_COARSE) {
    return (
      <input
        type="time"
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`w-full rounded-xl bg-gray-100 px-4 py-2.5 text-gray-900 outline-none ring-1 ring-gray-300 focus:ring-blue-500 dark:[color-scheme:dark] dark:bg-gray-800 dark:text-gray-100 dark:ring-gray-600 ${className}`}
      />
    )
  }

  // ── Desktop: two numeric spinners ────────────────────────────────────────
  return (
    <div
      className={`inline-flex items-center rounded-xl bg-gray-100 px-3 py-2 ring-1 ring-gray-300 focus-within:ring-blue-500 dark:bg-gray-800 dark:ring-gray-600 ${className}`}
    >
      <Spinner
        value={hours}
        min={0}
        max={23}
        onChange={h => emit(h, minutes)}
        label="שעות"
        aria-label="שעות"
      />
      <span className="select-none px-0.5 text-base font-bold text-gray-500 dark:text-gray-400">:</span>
      <Spinner
        value={minutes}
        min={0}
        max={59}
        onChange={m => emit(hours, m)}
        label="דקות"
        aria-label="דקות"
      />
    </div>
  )
}
