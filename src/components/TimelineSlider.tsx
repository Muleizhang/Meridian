'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { Place } from '@/lib/types';

type TimelineSliderProps = {
  places: Place[];
  cursorTime: number;
  nowTime: number;
  onCursorTimeChange: (cursorTime: number) => void;
};

type TimelinePoint = {
  id: number;
  time: number;
  isLocked: boolean;
};

const WHEEL_STEP_MONTHS = 1;
const TIMELINE_MONTH_PX = 64;
const TRACK_SIDE_PADDING = 20;
const MIN_LABEL_GAP_PX = 84;

function getMinTime(places: Place[], nowTime: number) {
  const datedTimes = places
    .map((place) => (place.visited_at ? new Date(place.visited_at).getTime() : null))
    .filter((time): time is number => time !== null && Number.isFinite(time));

  if (datedTimes.length === 0) {
    const fallback = new Date(nowTime);
    fallback.setFullYear(fallback.getFullYear() - 1);
    return fallback.getTime();
  }

  return Math.min(...datedTimes);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function startOfMonth(time: number) {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}

function addMonths(time: number, months: number) {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth() + months, 1).getTime();
}

function monthDiff(startTime: number, endTime: number) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
}

function getMonthLengthMs(time: number) {
  const monthStart = startOfMonth(time);
  return addMonths(monthStart, 1) - monthStart;
}

function toMonthFloat(time: number) {
  const date = new Date(time);
  const monthStart = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
  const monthLength = getMonthLengthMs(time);
  const monthIndex = date.getFullYear() * 12 + date.getMonth();
  return monthIndex + (time - monthStart) / monthLength;
}

function fromMonthFloat(monthValue: number) {
  const monthIndex = Math.floor(monthValue);
  const progress = monthValue - monthIndex;
  const year = Math.floor(monthIndex / 12);
  const month = monthIndex % 12;
  const monthStart = new Date(year, month, 1).getTime();
  const monthLength = getMonthLengthMs(monthStart);
  return monthStart + progress * monthLength;
}

function formatTickLabel(time: number) {
  const date = new Date(time);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function buildTicks(startTime: number, endTime: number) {
  const ticks = [] as Array<{ time: number; label: string }>;
  const startMonth = startOfMonth(startTime);
  const endMonth = startOfMonth(endTime);
  const totalMonths = monthDiff(startMonth, endMonth);

  for (let index = 0; index <= totalMonths; index += 1) {
    const time = addMonths(startMonth, index);
    ticks.push({ time, label: formatTickLabel(time) });
  }

  return ticks;
}

export function TimelineSlider({ places, cursorTime, nowTime, onCursorTimeChange }: TimelineSliderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const widthRef = useRef(1);
  const dragCursorRef = useRef(cursorTime);
  const [trackWidth, setTrackWidth] = useState(1);
  const minTime = useMemo(() => getMinTime(places, nowTime), [nowTime, places]);
  const cursorMonth = useMemo(() => toMonthFloat(cursorTime), [cursorTime]);
  const timelinePoints = useMemo<TimelinePoint[]>(
    () =>
      places.map((place) => ({
        id: place.id,
        time: place.visited_at ? new Date(place.visited_at).getTime() : nowTime,
        isLocked: place.is_locked
      })),
    [nowTime, places]
  );

  useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === 'undefined') {
      return;
    }

    const updateWidth = () => {
      const nextWidth = Math.max(track.clientWidth - TRACK_SIDE_PADDING * 2 - 44, 1);
      widthRef.current = nextWidth;
      setTrackWidth(nextWidth);
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  const visibleMonths = Math.max(trackWidth / TIMELINE_MONTH_PX, 1);
  const windowStartMonth = cursorMonth - visibleMonths;
  const windowStartTime = fromMonthFloat(windowStartMonth);
  const ticks = useMemo(() => buildTicks(windowStartTime, nowTime), [nowTime, windowStartTime]);
  const labelStep = Math.max(1, Math.ceil(MIN_LABEL_GAP_PX / TIMELINE_MONTH_PX));

  const setCursor = (value: number) => {
    onCursorTimeChange(clamp(value, minTime, nowTime));
  };

  const toLeftPx = (time: number) => {
    const distanceFromCursor = cursorMonth - toMonthFloat(time);
    return TRACK_SIDE_PADDING + trackWidth - distanceFromCursor * TIMELINE_MONTH_PX;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const width = widthRef.current;
    const startX = event.clientX;
    const startCursorMonth = toMonthFloat(cursorTime);
    dragCursorRef.current = cursorTime;
    event.currentTarget.setPointerCapture(event.pointerId);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const nextCursorMonth = startCursorMonth - deltaX / TIMELINE_MONTH_PX;
      const nextCursor = fromMonthFloat(nextCursorMonth);
      dragCursorRef.current = clamp(nextCursor, minTime, nowTime);
      onCursorTimeChange(dragCursorRef.current);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    if (width <= 0) {
      return;
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const direction = Math.sign(event.deltaY || event.deltaX);
    const nextCursor = fromMonthFloat(cursorMonth + direction * WHEEL_STEP_MONTHS);
    setCursor(nextCursor);
  };

  return (
    <div className="pointer-events-auto mx-auto w-full max-w-5xl pb-[max(var(--safe-area-bottom),0.75rem)]">
      <div className="meridian-panel rounded-[1.75rem] px-4 py-3 md:px-6">
        <div
          ref={trackRef}
          className="meridian-muted-surface relative h-12 touch-none overflow-hidden rounded-full px-3"
          onPointerDown={handlePointerDown}
          onWheel={handleWheel}
        >
          <div className="absolute bottom-2 top-2 right-4 w-px bg-[var(--border-strong)]" />
          <div className="meridian-panel-strong meridian-muted-text absolute right-1 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-[11px] shadow-sm md:text-xs">
            Now
          </div>

          <div className="relative h-full overflow-hidden">
            {ticks.map((tick, index) => {
              const left = toLeftPx(tick.time);
              if (left < 0 || left > trackWidth + TRACK_SIDE_PADDING * 2) {
                return null;
              }

              return (
                <div key={tick.time} className="absolute inset-y-0" style={{ left }}>
                  <div className="absolute bottom-3 h-3 w-px bg-[var(--border)]" />
                  {index % labelStep === 0 ? (
                    <div className="meridian-muted-text absolute bottom-0 -translate-x-1/2 text-[10px] md:text-[11px]">
                      {tick.label}
                    </div>
                  ) : null}
                </div>
              );
            })}

            {timelinePoints.map((point) => {
              const left = toLeftPx(point.time);
              if (left < 0 || left > trackWidth + TRACK_SIDE_PADDING * 2) {
                return null;
              }

              return (
                <motion.div
                  key={point.id}
                  layout
                  className="absolute top-3 h-2.5 w-2.5 -translate-x-1/2 rounded-full border border-white/70"
                  style={{
                    left,
                    backgroundColor: point.isLocked ? 'var(--marker-muted)' : 'var(--marker)'
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
