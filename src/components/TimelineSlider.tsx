'use client';

import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { Place } from '@/lib/types';

type TimelineSliderProps = {
  places: Place[];
  cursorTime: number;
  nowTime: number;
  onCursorTimeChange: (cursorTime: number) => void;
};

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DRAG_STEP_DAYS = 120;
const WHEEL_STEP_DAYS = 18;

function getMinTime(places: Place[], nowTime: number) {
  const datedTimes = places
    .map((place) => (place.visited_at ? new Date(place.visited_at).getTime() : null))
    .filter((time): time is number => time !== null && Number.isFinite(time));

  if (datedTimes.length === 0) {
    return nowTime - YEAR_MS;
  }

  return Math.min(...datedTimes);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatTickLabel(date: Date) {
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function buildTicks(windowStart: number) {
  const ticks = [] as Array<{ time: number; label: string }>;

  for (let index = 0; index <= 12; index += 1) {
    const date = new Date(windowStart);
    date.setMonth(date.getMonth() + index);
    ticks.push({ time: date.getTime(), label: formatTickLabel(date) });
  }

  return ticks;
}

export function TimelineSlider({ places, cursorTime, nowTime, onCursorTimeChange }: TimelineSliderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragCursorRef = useRef(cursorTime);
  const minTime = useMemo(() => getMinTime(places, nowTime), [nowTime, places]);
  const windowStart = cursorTime - YEAR_MS;
  const ticks = useMemo(() => buildTicks(windowStart), [windowStart]);
  const timelinePoints = useMemo(
    () =>
      places.map((place) => ({
        id: place.id,
        time: place.visited_at ? new Date(place.visited_at).getTime() : nowTime,
        isLocked: place.is_locked
      })),
    [nowTime, places]
  );
  const canReset = Math.abs(nowTime - cursorTime) > DAY_MS;

  const setCursor = (value: number) => {
    onCursorTimeChange(clamp(value, minTime, nowTime));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const width = trackRef.current?.clientWidth ?? 1;
    const startX = event.clientX;
    const startCursor = cursorTime;
    dragCursorRef.current = startCursor;
    event.currentTarget.setPointerCapture(event.pointerId);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const nextCursor = startCursor - (deltaX / width) * YEAR_MS;
      dragCursorRef.current = clamp(nextCursor, minTime, nowTime);
      onCursorTimeChange(dragCursorRef.current);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const direction = Math.sign(event.deltaY || event.deltaX);
    setCursor(cursorTime + direction * WHEEL_STEP_DAYS * DAY_MS);
  };

  return (
    <div className="pointer-events-auto mx-auto w-full max-w-5xl pb-[max(env(safe-area-inset-bottom),0.75rem)]">
      <div className="meridian-panel rounded-[1.75rem] px-4 py-3 md:px-6">
        <div className="flex items-center justify-between gap-4 text-xs text-zinc-500 md:text-sm">
          <span>Timeline</span>
          <div className="flex items-center gap-3">
            {canReset ? (
              <button
                type="button"
                className="rounded-full bg-black/6 px-3 py-1 text-[11px] text-zinc-700 md:text-xs"
                onClick={() => setCursor(nowTime)}
              >
                回到现在
              </button>
            ) : null}
            <span>{places.length} places</span>
          </div>
        </div>

        <div
          ref={trackRef}
          className="relative mt-3 h-12 touch-none rounded-full bg-black/[0.04] px-3"
          onPointerDown={handlePointerDown}
          onWheel={handleWheel}
        >
          <div className="absolute bottom-2 top-2 right-4 w-px bg-black/25" />
          <div className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-white/95 px-2 py-1 text-[11px] text-zinc-500 shadow-sm md:text-xs">
            Now
          </div>

          <div className="relative h-full overflow-hidden">
            {ticks.map((tick) => {
              const left = ((tick.time - windowStart) / YEAR_MS) * 100;
              if (left < 0 || left > 100) {
                return null;
              }

              return (
                <div key={tick.time} className="absolute inset-y-0" style={{ left: `${left}%` }}>
                  <div className="absolute bottom-3 h-3 w-px bg-black/10" />
                  <div className="absolute bottom-0 -translate-x-1/2 text-[10px] text-zinc-400 md:text-[11px]">
                    {tick.label}
                  </div>
                </div>
              );
            })}

            {timelinePoints.map((point) => {
              const left = ((point.time - windowStart) / YEAR_MS) * 100;
              if (left < 0 || left > 100) {
                return null;
              }

              return (
                <motion.div
                  key={point.id}
                  layout
                  className="absolute top-3 h-2.5 w-2.5 -translate-x-1/2 rounded-full border border-white/70"
                  style={{
                    left: `${left}%`,
                    backgroundColor: point.isLocked ? '#71717a' : '#18181b'
                  }}
                />
              );
            })}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-400 md:text-xs">
          <span>向右拖动可回看更早的记录</span>
          <span>{new Date(cursorTime).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}
