'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import type { Place, Route } from '@/lib/types';

type TimelineSliderProps = {
  places: Place[];
  routes: Route[];
  cursorTime: number;
  nowTime: number;
  onCursorTimeChange: (cursorTime: number) => void;
};

type TimelinePoint = {
  id: string;
  time: number;
  isLocked: boolean;
  title: string;
  hasDate: boolean;
  kind: 'place' | 'route';
};

const WHEEL_STEP_MONTHS = 1;
const TIMELINE_MONTH_PX = 64;
const TRACK_SIDE_PADDING = 20;
const MIN_LABEL_GAP_PX = 84;
const TRACK_INNER_PADDING_PX = 12;

function getMinTime(places: Place[], routes: Route[], nowTime: number) {
  const placeTimes = places
    .map((place) => (place.visited_at ? new Date(place.visited_at).getTime() : null))
    .filter((time): time is number => time !== null && Number.isFinite(time));
  const routeTimes = routes
    .map((route) => (route.departure_at ? new Date(route.departure_at).getTime() : null))
    .filter((time): time is number => time !== null && Number.isFinite(time));
  const datedTimes = [...placeTimes, ...routeTimes];

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

function formatPointDate(time: number) {
  const date = new Date(time);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
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

export function TimelineSlider({ places, routes, cursorTime, nowTime, onCursorTimeChange }: TimelineSliderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const widthRef = useRef(1);
  const isDraggingRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const queuedCursorRef = useRef<number | null>(null);
  const [displayCursorTime, setDisplayCursorTime] = useState(cursorTime);
  const [, startTransition] = useTransition();
  const [trackWidth, setTrackWidth] = useState(1);
  const [activePointId, setActivePointId] = useState<string | null>(null);
  const minTime = useMemo(() => getMinTime(places, routes, nowTime), [nowTime, places, routes]);
  const cursorMonth = useMemo(() => toMonthFloat(displayCursorTime), [displayCursorTime]);
  const timelinePoints = useMemo<TimelinePoint[]>(
    () => [
      ...places.map((place) => ({
        id: `place-${place.id}`,
        time: place.visited_at ? new Date(place.visited_at).getTime() : nowTime,
        isLocked: place.is_locked,
        title: place.title?.trim() ? place.title : '未命名记忆点',
        hasDate: Boolean(place.visited_at),
        kind: 'place' as const
      })),
      ...routes.map((route) => ({
        id: `route-${route.id}`,
        time: route.departure_at ? new Date(route.departure_at).getTime() : nowTime,
        isLocked: route.is_locked,
        title: route.title?.trim() ? route.title : '未命名线路',
        hasDate: Boolean(route.departure_at),
        kind: 'route' as const
      }))
    ],
    [nowTime, places, routes]
  );
  const activePoint = useMemo(
    () => (activePointId === null ? null : timelinePoints.find((point) => point.id === activePointId) ?? null),
    [activePointId, timelinePoints]
  );

  useEffect(() => {
    if (isDraggingRef.current) {
      return;
    }
    setDisplayCursorTime(cursorTime);
  }, [cursorTime]);

  useEffect(() => () => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
    }
  }, []);

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

  const scheduleCursorSync = (nextCursor: number) => {
    queuedCursorRef.current = nextCursor;
    if (animationFrameRef.current !== null) {
      return;
    }

    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      const queuedCursor = queuedCursorRef.current;
      if (queuedCursor === null) {
        return;
      }
      queuedCursorRef.current = null;
      startTransition(() => {
        onCursorTimeChange(queuedCursor);
      });
    });
  };

  const setCursor = (value: number) => {
    const nextCursor = clamp(value, minTime, nowTime);
    setDisplayCursorTime(nextCursor);
    scheduleCursorSync(nextCursor);
  };

  const toLeftPx = (time: number) => {
    const distanceFromCursor = cursorMonth - toMonthFloat(time);
    return TRACK_SIDE_PADDING + trackWidth - distanceFromCursor * TIMELINE_MONTH_PX;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    setActivePointId(null);
    const width = widthRef.current;
    const startX = event.clientX;
    const startCursorMonth = toMonthFloat(displayCursorTime);
    isDraggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const nextCursorMonth = startCursorMonth - deltaX / TIMELINE_MONTH_PX;
      setCursor(fromMonthFloat(nextCursorMonth));
    };

    const handlePointerUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      if (queuedCursorRef.current !== null) {
        const queuedCursor = queuedCursorRef.current;
        queuedCursorRef.current = null;
        if (animationFrameRef.current !== null) {
          window.cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        onCursorTimeChange(queuedCursor);
      }
    };

    if (width <= 0) {
      isDraggingRef.current = false;
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

  const activePointLeft = activePoint ? toLeftPx(activePoint.time) : null;
  const isActivePointVisible =
    activePointLeft !== null && activePointLeft >= 0 && activePointLeft <= trackWidth + TRACK_SIDE_PADDING * 2;

  return (
    <div className="pointer-events-auto mx-auto w-full max-w-5xl pb-[max(var(--safe-area-bottom),0.75rem)]">
      <div className="meridian-panel rounded-[1.75rem] px-4 py-3 md:px-6">
        <div className="relative">
          {activePoint && isActivePointVisible ? (
            <div
              className="meridian-panel-strong pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-xl border border-[var(--border)] px-2.5 py-1 text-[11px] shadow-lg md:text-xs"
              style={{ left: (activePointLeft ?? 0) + TRACK_INNER_PADDING_PX, top: -6 }}
            >
              <div className="font-medium">{activePoint.title}</div>
              {activePoint.hasDate ? (
                <div className="meridian-muted-text mt-0.5 text-[10px] md:text-[11px]">
                  {formatPointDate(activePoint.time)}
                </div>
              ) : null}
              <div
                className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-[var(--border)] bg-[var(--panel-strong)]"
                aria-hidden
              />
            </div>
          ) : null}
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

              const isActive = activePointId === point.id;

              return (
                <button
                  key={point.id}
                  type="button"
                  aria-label={point.hasDate ? `${point.title} · ${formatPointDate(point.time)}` : point.title}
                  className={`absolute flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full transition-transform ${
                    isActive ? 'scale-110' : ''
                  }`}
                  style={{ left, top: 5 }}
                  onPointerEnter={(event) => {
                    if (event.pointerType === 'mouse') {
                      setActivePointId(point.id);
                    }
                  }}
                  onPointerLeave={(event) => {
                    if (event.pointerType === 'mouse') {
                      setActivePointId((current) => (current === point.id ? null : current));
                    }
                  }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setActivePointId(point.id);
                  }}
                  onFocus={() => setActivePointId(point.id)}
                  onBlur={() => setActivePointId((current) => (current === point.id ? null : current))}
                >
                  <span
                    className="block h-2.5 w-2.5 rounded-full border border-white/70 shadow-sm"
                    style={{
                      backgroundColor: point.isLocked
                        ? 'var(--marker-muted)'
                        : point.kind === 'route'
                          ? 'var(--muted-strong)'
                          : 'var(--marker)'
                    }}
                  />
                </button>
              );
            })}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
