'use client';

import { type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ThemeToggleButton } from '@/components/ThemeToggleButton';
import { useTheme } from '@/components/ThemeProvider';
import { cn } from '@/lib/cn';
import { createImageVariants } from '@/lib/compress';
import { isSanitizedLockedPlace, isSanitizedLockedRoute, type Place, type Route } from '@/lib/types';
import appleIcon from '@/app/apple-icon.png';
import darkAppleIcon from '@/app/icon-dark-512.png';

const MapView = dynamic(() => import('@/components/MapView').then((module) => module.MapView), {
  ssr: false,
  loading: () => <div className="meridian-panel h-[100svh] h-[100dvh] w-full rounded-none md:rounded-[2rem]" />
});

const MarkdownEditor = dynamic(
  () => import('@/components/MarkdownEditor').then((module) => module.MarkdownEditor),
  { ssr: false }
);

const TimelineSlider = dynamic(
  () => import('@/components/TimelineSlider').then((module) => module.TimelineSlider),
  { ssr: false }
);

type MeridianAppProps = {
  initialPlaces: Place[];
  initialRoutes: Route[];
  canEdit: boolean;
  focusPlaceId?: number;
  focusRouteId?: number;
  siteDescription: string;
};

type Coordinates = { lat: number; lng: number };

type PlaceEditorState =
  | { mode: 'create'; lat: number; lng: number }
  | { mode: 'edit'; placeId: number }
  | null;

type RouteEditorState =
  | { mode: 'create'; start: Coordinates | null; end: Coordinates | null }
  | { mode: 'edit'; routeId: number; start: Coordinates; end: Coordinates }
  | null;

type RouteEndpoint = 'start' | 'end';

type RouteEndpointPicker = {
  endpoint: RouteEndpoint;
  origin: Coordinates | null;
} | null;

type PlacePayload = {
  lat: number;
  lng: number;
  title: string;
  content: string;
  images: string[];
  thumbnails: string[];
  author: string | null;
  visited_at: string | null;
  is_locked: boolean;
};

type RoutePayload = {
  title: string;
  content: string;
  images: string[];
  thumbnails: string[];
  author: string | null;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  departure_at: string | null;
  arrival_at: string | null;
  transport_type: string;
  is_locked: boolean;
};

type DateInputSource = string | Date | null | undefined;

const TRANSPORT_OPTIONS = [
  { value: 'plane', label: '飞机' },
  { value: 'train', label: '火车' },
  { value: 'car', label: '汽车' },
  { value: 'bike', label: '骑车' }
] as const;

function toLocalDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toDateInputValue(value: DateInputSource) {
  if (!value) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  if (match) {
    return match[0];
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

function toLocalDateTimeInputValue(value: DateInputSource) {
  if (!value) {
    return '';
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function fromLocalDateTimeInputValue(value: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatVisitedDate(value: DateInputSource) {
  const dateValue = toDateInputValue(value);
  if (!dateValue) {
    return '未填写日期';
  }

  const [year, month, day] = dateValue.split('-');
  return `${Number(year)}/${Number(month)}/${Number(day)}`;
}

function formatDateTime(value: DateInputSource) {
  if (!value) {
    return '未填写时间';
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '未填写时间';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function formatRouteDateRange(route: Route) {
  if (!route.departure_at && !route.arrival_at) {
    return '未填写时间';
  }

  if (route.departure_at && route.arrival_at) {
    return `${formatDateTime(route.departure_at)} - ${formatDateTime(route.arrival_at)}`;
  }

  return route.departure_at ? `出发 ${formatDateTime(route.departure_at)}` : `到达 ${formatDateTime(route.arrival_at)}`;
}

function getTransportLabel(value: string) {
  return TRANSPORT_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function toFormState(place?: Place) {
  return {
    title: place?.title ?? '',
    content: place?.content ?? '',
    images: place?.images ?? [],
    thumbnails: place?.thumbnails ?? [],
    author: place?.author ?? '',
    visited_at: toDateInputValue(place?.visited_at) || toLocalDateInputValue(),
    is_locked: place?.is_locked ?? false
  };
}

function toRouteFormState(route?: Route) {
  return {
    title: route?.title ?? '',
    content: route?.content ?? '',
    images: route?.images ?? [],
    thumbnails: route?.thumbnails ?? [],
    author: route?.author ?? '',
    departure_at: toLocalDateTimeInputValue(route?.departure_at),
    arrival_at: toLocalDateTimeInputValue(route?.arrival_at),
    transport_type: route?.transport_type ?? 'car',
    is_locked: route?.is_locked ?? false
  };
}

async function requestJson<T>(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, init);
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error?.fieldErrors
      ? '表单校验失败'
      : payload?.error ?? '请求失败';
    throw new Error(message);
  }

  return payload as T;
}

function filterPlacesByCursor(places: Place[], cursorTime: number) {
  return places.filter((place) => {
    if (!place.visited_at) {
      return true;
    }

    return new Date(place.visited_at).getTime() <= cursorTime;
  });
}

function filterRoutesByCursor(routes: Route[], cursorTime: number) {
  return routes.filter((route) => {
    if (!route.departure_at) {
      return true;
    }

    return new Date(route.departure_at).getTime() <= cursorTime;
  });
}

function getInitialCursorTime(places: Place[], routes: Route[]) {
  const now = Date.now();
  const times = [
    ...places.map((place) => (place.visited_at ? new Date(place.visited_at).getTime() : null)),
    ...routes.map((route) => (route.departure_at ? new Date(route.departure_at).getTime() : null))
  ].filter((time): time is number => time !== null && Number.isFinite(time));

  return Math.max(now, ...times);
}

function buildAuthTarget(searchParams: ReadonlyURLSearchParams, destination: '/' | '/edit') {
  const query = searchParams.toString();
  return query ? `${destination}?${query}` : destination;
}

export function MeridianApp({
  initialPlaces,
  initialRoutes,
  canEdit,
  focusPlaceId,
  focusRouteId,
  siteDescription
}: MeridianAppProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { theme } = useTheme();
  const [places, setPlaces] = useState(initialPlaces);
  const [routes, setRoutes] = useState(initialRoutes);
  const [selectedPlaceId, setSelectedPlaceId] = useState<number | null>(focusRouteId ? null : focusPlaceId ?? null);
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(focusRouteId ?? null);
  const [placeEditorState, setPlaceEditorState] = useState<PlaceEditorState>(null);
  const [routeEditorState, setRouteEditorState] = useState<RouteEditorState>(null);
  const [isCreateTypePickerOpen, setIsCreateTypePickerOpen] = useState(false);
  const [isPlacePickerOpen, setIsPlacePickerOpen] = useState(false);
  const [pendingCenter, setPendingCenter] = useState<Coordinates>({ lat: 31.2304, lng: 121.4737 });
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [locationAdjustOrigin, setLocationAdjustOrigin] = useState<Coordinates | null>(null);
  const [routeEndpointPicker, setRouteEndpointPicker] = useState<RouteEndpointPicker>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fullscreenImage, setFullscreenImage] = useState<{ src: string; alt: string } | null>(null);
  const [timelineCursorTime, setTimelineCursorTime] = useState(() => getInitialCursorTime(initialPlaces, initialRoutes));
  const didSyncInitialDataRef = useRef(false);
  const messageTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (didSyncInitialDataRef.current) {
      return;
    }

    didSyncInitialDataRef.current = true;
    setPlaces(initialPlaces);
    setRoutes(initialRoutes);
    setTimelineCursorTime(getInitialCursorTime(initialPlaces, initialRoutes));
  }, [initialPlaces, initialRoutes]);

  useEffect(() => {
    if (focusRouteId) {
      setSelectedPlaceId(null);
      setSelectedRouteId(focusRouteId);
      return;
    }

    if (focusPlaceId) {
      setSelectedRouteId(null);
      setSelectedPlaceId(focusPlaceId);
    }
  }, [focusPlaceId, focusRouteId]);

  useEffect(() => {
    return () => {
      if (messageTimerRef.current) {
        window.clearTimeout(messageTimerRef.current);
      }
    };
  }, []);

  const nowTime = useMemo(() => Date.now(), []);
  const visiblePlaces = useMemo(() => filterPlacesByCursor(places, timelineCursorTime), [places, timelineCursorTime]);
  const visibleRoutes = useMemo(() => filterRoutesByCursor(routes, timelineCursorTime), [routes, timelineCursorTime]);
  const selectedPlace = useMemo(
    () => visiblePlaces.find((place) => place.id === selectedPlaceId) ?? places.find((place) => place.id === selectedPlaceId) ?? null,
    [places, selectedPlaceId, visiblePlaces]
  );
  const selectedRoute = useMemo(
    () => visibleRoutes.find((route) => route.id === selectedRouteId) ?? routes.find((route) => route.id === selectedRouteId) ?? null,
    [routes, selectedRouteId, visibleRoutes]
  );
  const mapPlaces = useMemo(
    () => selectedPlace && !visiblePlaces.some((place) => place.id === selectedPlace.id)
      ? [selectedPlace, ...visiblePlaces]
      : visiblePlaces,
    [selectedPlace, visiblePlaces]
  );
  const mapRoutes = useMemo(
    () => selectedRoute && !visibleRoutes.some((route) => route.id === selectedRoute.id)
      ? [selectedRoute, ...visibleRoutes]
      : visibleRoutes,
    [selectedRoute, visibleRoutes]
  );

  const authorOptions = useMemo(
    () => Array.from(new Set([
      ...places.map((place) => place.author).filter(Boolean),
      ...routes.map((route) => route.author).filter(Boolean)
    ] as string[])),
    [places, routes]
  );
  const isTimelineVisible = !selectedPlace && !selectedRoute && !placeEditorState && !routeEditorState && !isCreateTypePickerOpen;
  const isPickingLocation = isPlacePickerOpen || isEditingLocation || routeEndpointPicker !== null;

  const showMessage = (text: string) => {
    setMessage(text);
    if (messageTimerRef.current) {
      window.clearTimeout(messageTimerRef.current);
    }
    messageTimerRef.current = window.setTimeout(() => setMessage(null), 3200);
  };

  const updateQueryForSelection = useCallback((selection: { placeId: number | null; routeId: number | null }) => {
    const next = new URLSearchParams(searchParams.toString());
    if (selection.placeId) {
      next.set('place', String(selection.placeId));
      next.delete('route');
    } else {
      next.delete('place');
    }

    if (selection.routeId) {
      next.set('route', String(selection.routeId));
      next.delete('place');
    } else {
      next.delete('route');
    }

    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const selectPlace = (placeId: number) => {
    setPlaceEditorState(null);
    setRouteEditorState(null);
    setIsCreateTypePickerOpen(false);
    setIsPlacePickerOpen(false);
    setIsEditingLocation(false);
    setLocationAdjustOrigin(null);
    setRouteEndpointPicker(null);
    setSelectedPlaceId(placeId);
    setSelectedRouteId(null);
    updateQueryForSelection({ placeId, routeId: null });
  };

  const selectRoute = (routeId: number) => {
    setPlaceEditorState(null);
    setRouteEditorState(null);
    setIsCreateTypePickerOpen(false);
    setIsPlacePickerOpen(false);
    setIsEditingLocation(false);
    setLocationAdjustOrigin(null);
    setRouteEndpointPicker(null);
    setSelectedPlaceId(null);
    setSelectedRouteId(routeId);
    updateQueryForSelection({ placeId: null, routeId });
  };

  const closePanels = useCallback(() => {
    setSelectedPlaceId(null);
    setSelectedRouteId(null);
    setPlaceEditorState(null);
    setRouteEditorState(null);
    setIsCreateTypePickerOpen(false);
    setIsPlacePickerOpen(false);
    setIsEditingLocation(false);
    setLocationAdjustOrigin(null);
    setRouteEndpointPicker(null);
    updateQueryForSelection({ placeId: null, routeId: null });
  }, [updateQueryForSelection]);

  const cancelLocationAdjust = useCallback(() => {
    if (locationAdjustOrigin) {
      setPendingCenter(locationAdjustOrigin);
    } else if (placeEditorState?.mode === 'edit') {
      const place = places.find((place) => place.id === placeEditorState.placeId);
      if (place) {
        setPendingCenter({ lat: place.lat, lng: place.lng });
      }
    }
    setLocationAdjustOrigin(null);
    setIsEditingLocation(false);
  }, [locationAdjustOrigin, placeEditorState, places]);

  const confirmLocationAdjust = () => {
    setLocationAdjustOrigin(null);
    setIsEditingLocation(false);
  };

  const cancelRouteEndpointPick = useCallback(() => {
    if (routeEndpointPicker?.origin) {
      setPendingCenter(routeEndpointPicker.origin);
    }
    setRouteEndpointPicker(null);
  }, [routeEndpointPicker]);

  const confirmRouteEndpointPick = () => {
    if (!routeEndpointPicker || !routeEditorState) {
      setRouteEndpointPicker(null);
      return;
    }

    const nextPoint = pendingCenter;
    setRouteEditorState((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        [routeEndpointPicker.endpoint]: nextPoint
      };
    });
    setRouteEndpointPicker(null);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) {
        return;
      }

      if (fullscreenImage) {
        setFullscreenImage(null);
        return;
      }

      if (routeEndpointPicker) {
        cancelRouteEndpointPick();
        return;
      }

      if (isEditingLocation) {
        cancelLocationAdjust();
        return;
      }

      if (placeEditorState || routeEditorState || isCreateTypePickerOpen) {
        setIsEditingLocation(false);
        setPlaceEditorState(null);
        setRouteEditorState(null);
        setIsCreateTypePickerOpen(false);
        return;
      }

      if (selectedPlaceId || selectedRouteId || isPlacePickerOpen) {
        closePanels();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    cancelLocationAdjust,
    cancelRouteEndpointPick,
    closePanels,
    fullscreenImage,
    isCreateTypePickerOpen,
    isEditingLocation,
    isPlacePickerOpen,
    placeEditorState,
    routeEditorState,
    routeEndpointPicker,
    selectedPlaceId,
    selectedRouteId
  ]);

  const beginCreate = () => {
    setSelectedPlaceId(null);
    setSelectedRouteId(null);
    setPlaceEditorState(null);
    setRouteEditorState(null);
    setIsEditingLocation(false);
    setLocationAdjustOrigin(null);
    setRouteEndpointPicker(null);
    setIsPlacePickerOpen(false);
    setIsCreateTypePickerOpen(true);
  };

  const beginCreatePlace = () => {
    setIsCreateTypePickerOpen(false);
    setIsPlacePickerOpen(true);
  };

  const confirmCreatePin = () => {
    setPlaceEditorState({ mode: 'create', ...pendingCenter });
    setIsPlacePickerOpen(false);
  };

  const beginCreateRoute = () => {
    setIsCreateTypePickerOpen(false);
    setRouteEditorState({ mode: 'create', start: null, end: null });
  };

  const beginEditPlace = (placeId: number) => {
    const place = places.find((place) => place.id === placeId);
    if (place) {
      setPendingCenter({ lat: place.lat, lng: place.lng });
    }
    setIsEditingLocation(false);
    setLocationAdjustOrigin(null);
    setPlaceEditorState({ mode: 'edit', placeId });
  };

  const beginEditRoute = (routeId: number) => {
    const route = routes.find((route) => route.id === routeId);
    if (!route) {
      return;
    }

    setIsEditingLocation(false);
    setLocationAdjustOrigin(null);
    setRouteEndpointPicker(null);
    setRouteEditorState({
      mode: 'edit',
      routeId,
      start: { lat: route.start_lat, lng: route.start_lng },
      end: { lat: route.end_lat, lng: route.end_lng }
    });
  };

  const beginRouteEndpointPick = (endpoint: RouteEndpoint) => {
    const currentPoint = routeEditorState?.mode === 'create'
      ? routeEditorState[endpoint]
      : routeEditorState?.[endpoint] ?? null;
    const fallbackPoint = routeEditorState?.mode === 'create' && endpoint === 'end' && routeEditorState.start
      ? routeEditorState.start
      : pendingCenter;
    const nextCenter = currentPoint ?? fallbackPoint;

    setPendingCenter(nextCenter);
    setRouteEndpointPicker({ endpoint, origin: currentPoint });
  };

  const uploadFile = async (file: File) => {
    let variants: Awaited<ReturnType<typeof createImageVariants>>;
    try {
      variants = await createImageVariants(file);
    } catch (error) {
      const message = error instanceof Error ? error.message : '图片处理失败';
      throw new Error(`图片处理失败：${message}`);
    }

    const { original, thumbnail } = variants;

    const [originalTarget, thumbTarget] = await Promise.all([
      requestJson<{ uploadUrl: string; fileUrl: string }>('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent: 'original', contentType: original.type })
      }),
      requestJson<{ uploadUrl: string; fileUrl: string }>('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent: 'thumb', contentType: thumbnail.type })
      })
    ]);

    const uploadTasks = [
      { label: '原图', target: originalTarget, file: original },
      { label: '缩略图', target: thumbTarget, file: thumbnail }
    ];

    let uploadResponses: Array<{ label: string; response: Response }>;
    try {
      uploadResponses = await Promise.all(
        uploadTasks.map(async ({ label, target, file }) => ({
          label,
          response: await fetch(target.uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': file.type },
            body: file
          })
        }))
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '网络请求失败';
      throw new Error(`上传失败：${message}`);
    }

    const failedUpload = uploadResponses.find(({ response }) => !response.ok);
    if (failedUpload) {
      throw new Error(`${failedUpload.label}上传失败（HTTP ${failedUpload.response.status}）`);
    }

    return {
      image: originalTarget.fileUrl,
      thumbnail: thumbTarget.fileUrl
    };
  };

  const createPlace = async (payload: PlacePayload) => {
    const result = await requestJson<{ place: Place }>('/api/places', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    setPlaces((current) => [result.place, ...current]);
    setTimelineCursorTime((current) => Math.max(current, getInitialCursorTime([result.place], routes)));
    setSelectedPlaceId(result.place.id);
    setSelectedRouteId(null);
    setPlaceEditorState(null);
    setIsEditingLocation(false);
    setLocationAdjustOrigin(null);
    updateQueryForSelection({ placeId: result.place.id, routeId: null });
    showMessage('地点已创建');
  };

  const patchPlace = async (placeId: number, payload: PlacePayload) => {
    const result = await requestJson<{ place: Place }>(`/api/places/${placeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    setPlaces((current) => current.map((place) => (place.id === placeId ? result.place : place)));
    setPendingCenter({ lat: result.place.lat, lng: result.place.lng });
    setSelectedPlaceId(placeId);
    setSelectedRouteId(null);
    setPlaceEditorState(null);
    setIsEditingLocation(false);
    setLocationAdjustOrigin(null);
    showMessage('地点已更新');
  };

  const createRoute = async (payload: RoutePayload) => {
    const result = await requestJson<{ route: Route }>('/api/routes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    setRoutes((current) => [result.route, ...current]);
    setTimelineCursorTime((current) => Math.max(current, getInitialCursorTime(places, [result.route])));
    setSelectedPlaceId(null);
    setSelectedRouteId(result.route.id);
    setRouteEditorState(null);
    setRouteEndpointPicker(null);
    updateQueryForSelection({ placeId: null, routeId: result.route.id });
    showMessage('线路已创建');
  };

  const patchRoute = async (routeId: number, payload: RoutePayload) => {
    const result = await requestJson<{ route: Route }>(`/api/routes/${routeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    setRoutes((current) => current.map((route) => (route.id === routeId ? result.route : route)));
    setTimelineCursorTime((current) => Math.max(current, getInitialCursorTime(places, [result.route])));
    setSelectedPlaceId(null);
    setSelectedRouteId(routeId);
    setRouteEditorState(null);
    setRouteEndpointPicker(null);
    updateQueryForSelection({ placeId: null, routeId });
    showMessage('线路已更新');
  };

  const handleDeletePlace = async (placeId: number) => {
    if (!window.confirm('确认删除这条记录？')) {
      return;
    }

    setIsDeleting(true);
    try {
      await requestJson(`/api/places/${placeId}`, { method: 'DELETE' });
      setPlaces((current) => current.filter((place) => place.id !== placeId));
      closePanels();
      showMessage('地点已删除');
    } catch (error) {
      showMessage(error instanceof Error ? error.message : '删除失败');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteRoute = async (routeId: number) => {
    if (!window.confirm('确认删除这条线路？')) {
      return;
    }

    setIsDeleting(true);
    try {
      await requestJson(`/api/routes/${routeId}`, { method: 'DELETE' });
      setRoutes((current) => current.filter((route) => route.id !== routeId));
      closePanels();
      showMessage('线路已删除');
    } catch (error) {
      showMessage(error instanceof Error ? error.message : '删除失败');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="relative h-[100svh] h-[100dvh] overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <MapView
        places={mapPlaces}
        routes={mapRoutes}
        selectedPlaceId={selectedPlaceId}
        selectedRouteId={selectedRouteId}
        pendingCenter={isPickingLocation ? pendingCenter : null}
        focusPendingCenter={isEditingLocation || routeEndpointPicker !== null}
        canEdit={canEdit}
        theme={theme}
        onCenterChange={setPendingCenter}
        onSelectPlace={selectPlace}
        onSelectRoute={selectRoute}
      />

      <div className="pointer-events-none absolute inset-0 flex flex-col px-[max(0.75rem,var(--safe-area-left))] pt-[max(0.75rem,var(--safe-area-top))] pr-[max(0.75rem,var(--safe-area-right))] md:p-6">
        <Header canEdit={canEdit} onCreate={beginCreate} onShowMessage={showMessage} siteDescription={siteDescription} />
        <div className="flex-1" />
        <AnimatePresence initial={false}>
          {isTimelineVisible ? (
            <motion.div
              key="timeline"
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 28 }}
              transition={{ type: 'spring', stiffness: 220, damping: 24 }}
            >
              <TimelineSlider
                places={places}
                routes={routes}
                cursorTime={timelineCursorTime}
                nowTime={nowTime}
                onCursorTimeChange={setTimelineCursorTime}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {isCreateTypePickerOpen ? (
          <CreateTypePanel
            onClose={closePanels}
            onCreatePlace={beginCreatePlace}
            onCreateRoute={beginCreateRoute}
          />
        ) : null}
      </AnimatePresence>

      <CreatePinOverlay
        open={isPickingLocation}
        mode={isEditingLocation || routeEndpointPicker ? 'edit' : 'create'}
        center={pendingCenter}
        title={
          routeEndpointPicker
            ? `拖动地图来选择${routeEndpointPicker.endpoint === 'start' ? '起点' : '终点'}`
            : undefined
        }
        onCancel={() => {
          if (routeEndpointPicker) {
            cancelRouteEndpointPick();
          } else if (isEditingLocation) {
            cancelLocationAdjust();
          } else {
            setIsPlacePickerOpen(false);
          }
        }}
        onConfirm={() => {
          if (routeEndpointPicker) {
            confirmRouteEndpointPick();
          } else if (isEditingLocation) {
            confirmLocationAdjust();
          } else {
            confirmCreatePin();
          }
        }}
      />

      <AnimatePresence>
        {selectedPlace && !placeEditorState && !routeEditorState ? (
          <DetailPanel
            key={`view-${selectedPlace.id}`}
            place={selectedPlace}
            canEdit={canEdit}
            isDeleting={isDeleting}
            onClose={closePanels}
            onEdit={() => beginEditPlace(selectedPlace.id)}
            onDelete={() => handleDeletePlace(selectedPlace.id)}
            onOpenImage={(src, alt) => setFullscreenImage({ src, alt })}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {selectedRoute && !placeEditorState && !routeEditorState ? (
          <RouteDetailPanel
            key={`route-view-${selectedRoute.id}`}
            route={selectedRoute}
            canEdit={canEdit}
            isDeleting={isDeleting}
            onClose={closePanels}
            onEdit={() => beginEditRoute(selectedRoute.id)}
            onDelete={() => handleDeleteRoute(selectedRoute.id)}
            onOpenImage={(src, alt) => setFullscreenImage({ src, alt })}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {placeEditorState ? (
          <EditPanel
            key={placeEditorState.mode === 'create' ? 'create' : `edit-${placeEditorState.placeId}`}
            mode={placeEditorState.mode}
            lat={placeEditorState.mode === 'create' ? placeEditorState.lat : undefined}
            lng={placeEditorState.mode === 'create' ? placeEditorState.lng : undefined}
            place={placeEditorState.mode === 'edit' ? places.find((place) => place.id === placeEditorState.placeId) ?? null : null}
            selectedLocation={placeEditorState.mode === 'edit' ? pendingCenter : null}
            isAdjustingLocation={isEditingLocation}
            authorOptions={authorOptions}
            isSaving={isSaving}
            onClose={() => {
              setIsEditingLocation(false);
              setLocationAdjustOrigin(null);
              setPlaceEditorState(null);
            }}
            onAdjustLocation={() => {
              setLocationAdjustOrigin(pendingCenter);
              setIsEditingLocation(true);
            }}
            onResetLocation={() => {
              const place = placeEditorState.mode === 'edit'
                ? places.find((place) => place.id === placeEditorState.placeId)
                : null;
              if (place) {
                setPendingCenter({ lat: place.lat, lng: place.lng });
              }
              setLocationAdjustOrigin(null);
              setIsEditingLocation(false);
            }}
            onUploadFile={uploadFile}
            onUploadError={showMessage}
            onSubmit={async (payload) => {
              setIsSaving(true);
              try {
                if (placeEditorState.mode === 'create') {
                  await createPlace({ ...payload, lat: placeEditorState.lat, lng: placeEditorState.lng });
                } else {
                  await patchPlace(placeEditorState.placeId, payload);
                }
              } catch (error) {
                showMessage(error instanceof Error ? error.message : '保存失败');
              } finally {
                setIsSaving(false);
              }
            }}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {routeEditorState ? (
          <RouteEditPanel
            key={routeEditorState.mode === 'create' ? 'route-create' : `route-edit-${routeEditorState.routeId}`}
            mode={routeEditorState.mode}
            route={routeEditorState.mode === 'edit' ? routes.find((route) => route.id === routeEditorState.routeId) ?? null : null}
            start={routeEditorState.start}
            end={routeEditorState.end}
            pickingEndpoint={routeEndpointPicker?.endpoint ?? null}
            authorOptions={authorOptions}
            isSaving={isSaving}
            onClose={() => {
              setRouteEndpointPicker(null);
              setRouteEditorState(null);
            }}
            onPickEndpoint={beginRouteEndpointPick}
            onUploadFile={uploadFile}
            onUploadError={showMessage}
            onSubmit={async (payload) => {
              setIsSaving(true);
              try {
                if (routeEditorState.mode === 'create') {
                  await createRoute(payload);
                } else {
                  await patchRoute(routeEditorState.routeId, payload);
                }
              } catch (error) {
                showMessage(error instanceof Error ? error.message : '保存失败');
              } finally {
                setIsSaving(false);
              }
            }}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {fullscreenImage ? (
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex items-center justify-center bg-[var(--overlay)] p-4"
            onClick={() => setFullscreenImage(null)}
          >
            <Image
              src={fullscreenImage.src}
              alt={fullscreenImage.alt}
              width={1600}
              height={1200}
              className="max-h-full w-auto rounded-3xl object-contain"
            />
          </motion.button>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {message ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="meridian-panel fixed bottom-[calc(max(var(--safe-area-bottom),0.75rem)+6rem)] left-1/2 z-[100] -translate-x-1/2 rounded-2xl px-4 py-3 text-sm"
          >
            {message}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

type HeaderProps = {
  canEdit: boolean;
  onCreate: () => void;
  onShowMessage: (message: string) => void;
  siteDescription: string;
};

function Header({ canEdit, onCreate, onShowMessage, siteDescription }: HeaderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme } = useTheme();
  const actionButtonClassName = cn(
    'meridian-button meridian-header-button',
    theme === 'light' ? 'meridian-button--overlay-light' : 'meridian-button--secondary'
  );
  const secondaryActionButtonClassName = cn(
    'meridian-button meridian-header-button',
    theme === 'light' ? 'meridian-button--overlay-light' : 'meridian-button--secondary'
  );
  const brandIcon = theme === 'dark' ? darkAppleIcon : appleIcon;

  const logout = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    onShowMessage('已登出');
    router.replace(buildAuthTarget(searchParams, '/'));
  };

  return (
    <div className="pointer-events-none flex items-start justify-between gap-3 md:gap-4">
      <div className="meridian-panel pointer-events-auto max-w-md rounded-[1.75rem] px-3 py-3 md:px-5 md:py-4">
        <div className="flex items-center gap-2.5 md:gap-3">
          <Image src={brandIcon} alt="" width={32} height={32} className="h-8 w-8 rounded-lg md:h-9 md:w-9 md:rounded-xl" priority />
          <div className="text-sm font-semibold md:text-xl">Meridian</div>
        </div>
        <div className="meridian-muted-text mt-1 text-[11px] md:text-sm">{siteDescription}</div>
      </div>

      <div className="pointer-events-auto flex items-center gap-2">
        <ThemeToggleButton className={theme === 'light' ? 'meridian-button--overlay-light' : undefined} />
        {canEdit ? (
          <button type="button" className={actionButtonClassName} onClick={onCreate}>
            新建
          </button>
        ) : null}
        {canEdit ? (
          <button type="button" className={secondaryActionButtonClassName} onClick={logout}>
            登出
          </button>
        ) : (
          <a href={`/login?next=${encodeURIComponent(buildAuthTarget(searchParams, '/'))}`} className={actionButtonClassName}>
            登录
          </a>
        )}
      </div>
    </div>
  );
}

type CreateTypePanelProps = {
  onClose: () => void;
  onCreatePlace: () => void;
  onCreateRoute: () => void;
};

function CreateTypePanel({ onClose, onCreatePlace, onCreateRoute }: CreateTypePanelProps) {
  return (
    <motion.aside
      initial={{ opacity: 0, x: 32, y: 12 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, x: 32, y: 12 }}
      transition={{ type: 'spring', stiffness: 220, damping: 24 }}
      className="meridian-panel absolute inset-x-3 bottom-[calc(max(var(--safe-area-bottom),0.75rem)+6rem)] z-40 rounded-[2rem] p-5 md:inset-x-auto md:bottom-6 md:right-6 md:w-[420px]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">新建</h2>
          <div className="meridian-muted-text mt-2 text-sm">选择要记录的内容类型</div>
        </div>
        <button type="button" className="meridian-button meridian-button--secondary px-3 py-2" onClick={onClose}>
          取消
        </button>
      </div>

      <div className="mt-5 grid gap-3">
        <button
          type="button"
          className="meridian-soft-surface rounded-[1.25rem] px-4 py-4 text-left transition hover:bg-[var(--panel-strong)]"
          onClick={onCreatePlace}
        >
          <div className="font-medium">记忆点</div>
          <div className="meridian-muted-text mt-1 text-sm">选择一个地点，记录照片、正文和日期</div>
        </button>
        <button
          type="button"
          className="meridian-soft-surface rounded-[1.25rem] px-4 py-4 text-left transition hover:bg-[var(--panel-strong)]"
          onClick={onCreateRoute}
        >
          <div className="font-medium">线路</div>
          <div className="meridian-muted-text mt-1 text-sm">记录起点、终点、交通方式和旅途内容</div>
        </button>
      </div>
    </motion.aside>
  );
}

type CreatePinOverlayProps = {
  open: boolean;
  mode: 'create' | 'edit';
  center: { lat: number; lng: number };
  title?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

function CreatePinOverlay({ open, mode, center, title, onCancel, onConfirm }: CreatePinOverlayProps) {
  return (
    <AnimatePresence>
      {open ? (
        <>
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)] text-xl text-[var(--accent-foreground)] shadow-lg">
              📍
            </div>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className="meridian-panel absolute inset-x-3 bottom-[calc(max(var(--safe-area-bottom),0.75rem)+6rem)] z-30 rounded-[1.75rem] px-4 py-4 md:inset-x-auto md:left-1/2 md:w-[420px] md:-translate-x-1/2"
          >
            <div className="text-sm font-medium">
              {title ?? (mode === 'create' ? '拖动地图来选择位置' : '拖动地图来调整位置')}
            </div>
            <div className="meridian-muted-text mt-2 text-xs">
              纬度 {center.lat.toFixed(5)}，经度 {center.lng.toFixed(5)}
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" className="meridian-button meridian-button--secondary flex-1" onClick={onCancel}>
                取消
              </button>
              <button type="button" className="meridian-button flex-1" onClick={onConfirm}>
                {mode === 'create' ? '确认' : '完成'}
              </button>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

type DetailPanelProps = {
  place: Place;
  canEdit: boolean;
  isDeleting: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenImage: (src: string, alt: string) => void;
};

function DetailPanel({ place, canEdit, isDeleting, onClose, onEdit, onDelete, onOpenImage }: DetailPanelProps) {
  const isHiddenLockedPlace = isSanitizedLockedPlace(place);

  return (
    <motion.aside
      initial={{ opacity: 0, x: 32, y: 12 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, x: 32, y: 12 }}
      transition={{ type: 'spring', stiffness: 220, damping: 24 }}
      className="meridian-panel absolute inset-x-3 bottom-[calc(max(var(--safe-area-bottom),0.75rem)+6rem)] top-[calc(max(var(--safe-area-top),0.75rem)+4.75rem)] z-40 rounded-[2rem] p-5 md:inset-x-auto md:bottom-6 md:right-6 md:top-24 md:w-[420px]"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold leading-tight">{isHiddenLockedPlace ? '已锁定记忆点' : place.title}</h2>
            <div className="meridian-muted-text mt-2 text-sm">
              {isHiddenLockedPlace ? '内容已隐藏' : formatVisitedDate(place.visited_at)}
              {!isHiddenLockedPlace && place.author ? <span className="ml-2">— by {place.author}</span> : null}
            </div>
          </div>
          <button
            type="button"
            className="meridian-button meridian-button--secondary px-3 py-2"
            onClick={onClose}
          >
            关闭
          </button>
        </div>

        {place.images.length > 0 ? (
          <div className="mt-5 grid grid-cols-2 gap-3 overflow-y-auto">
            {place.thumbnails.map((thumbnail, index) => (
              <button
                type="button"
                key={thumbnail}
                className="overflow-hidden rounded-2xl border border-[var(--border)]"
                onClick={() => onOpenImage(place.images[index] ?? thumbnail, place.title)}
              >
                <Image
                  src={thumbnail}
                  alt={place.title}
                  width={400}
                  height={300}
                  className="h-32 w-full object-cover"
                />
              </button>
            ))}
          </div>
        ) : null}

        <div className="meridian-prose mt-5 min-h-0 flex-1 overflow-y-auto pr-1 text-sm md:text-[15px]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{isHiddenLockedPlace ? '这条记录已上锁。' : place.content || '暂无内容。'}</ReactMarkdown>
        </div>

        {canEdit ? (
          <div className="mt-5 flex gap-2">
            <button type="button" className="meridian-button flex-1" onClick={onEdit}>
              编辑
            </button>
            <button
              type="button"
              className="meridian-button meridian-button--secondary flex-1"
              onClick={onDelete}
              disabled={isDeleting}
            >
              {isDeleting ? '删除中…' : '删除'}
            </button>
          </div>
        ) : null}
      </div>
    </motion.aside>
  );
}

type RouteDetailPanelProps = {
  route: Route;
  canEdit: boolean;
  isDeleting: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenImage: (src: string, alt: string) => void;
};

function RouteDetailPanel({ route, canEdit, isDeleting, onClose, onEdit, onDelete, onOpenImage }: RouteDetailPanelProps) {
  const isHiddenLockedRoute = isSanitizedLockedRoute(route);
  const title = isHiddenLockedRoute ? '已锁定线路' : route.title;

  return (
    <motion.aside
      initial={{ opacity: 0, x: 32, y: 12 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, x: 32, y: 12 }}
      transition={{ type: 'spring', stiffness: 220, damping: 24 }}
      className="meridian-panel absolute inset-x-3 bottom-[calc(max(var(--safe-area-bottom),0.75rem)+6rem)] top-[calc(max(var(--safe-area-top),0.75rem)+4.75rem)] z-40 rounded-[2rem] p-5 md:inset-x-auto md:bottom-6 md:right-6 md:top-24 md:w-[420px]"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold leading-tight">{title}</h2>
            <div className="meridian-muted-text mt-2 text-sm">
              {getTransportLabel(route.transport_type)}
              <span className="mx-2">·</span>
              {isHiddenLockedRoute ? '内容已隐藏' : formatRouteDateRange(route)}
              {!isHiddenLockedRoute && route.author ? <span className="ml-2">— by {route.author}</span> : null}
            </div>
          </div>
          <button type="button" className="meridian-button meridian-button--secondary px-3 py-2" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="meridian-soft-surface mt-5 rounded-[1.25rem] px-4 py-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="meridian-muted-text-strong">起点</div>
              <div className="meridian-muted-text mt-1 text-xs">
                {route.start_lat.toFixed(5)}, {route.start_lng.toFixed(5)}
              </div>
            </div>
            <div>
              <div className="meridian-muted-text-strong">终点</div>
              <div className="meridian-muted-text mt-1 text-xs">
                {route.end_lat.toFixed(5)}, {route.end_lng.toFixed(5)}
              </div>
            </div>
          </div>
        </div>

        {route.images.length > 0 ? (
          <div className="mt-5 grid grid-cols-2 gap-3 overflow-y-auto">
            {route.thumbnails.map((thumbnail, index) => (
              <button
                type="button"
                key={thumbnail}
                className="overflow-hidden rounded-2xl border border-[var(--border)]"
                onClick={() => onOpenImage(route.images[index] ?? thumbnail, title)}
              >
                <Image
                  src={thumbnail}
                  alt={title}
                  width={400}
                  height={300}
                  className="h-32 w-full object-cover"
                />
              </button>
            ))}
          </div>
        ) : null}

        <div className="meridian-prose mt-5 min-h-0 flex-1 overflow-y-auto pr-1 text-sm md:text-[15px]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {isHiddenLockedRoute ? '这条线路已上锁。' : route.content || '暂无内容。'}
          </ReactMarkdown>
        </div>

        {canEdit ? (
          <div className="mt-5 flex gap-2">
            <button type="button" className="meridian-button flex-1" onClick={onEdit}>
              编辑
            </button>
            <button
              type="button"
              className="meridian-button meridian-button--secondary flex-1"
              onClick={onDelete}
              disabled={isDeleting}
            >
              {isDeleting ? '删除中…' : '删除'}
            </button>
          </div>
        ) : null}
      </div>
    </motion.aside>
  );
}

type EditPanelProps = {
  mode: 'create' | 'edit';
  place: Place | null;
  lat?: number;
  lng?: number;
  selectedLocation: { lat: number; lng: number } | null;
  isAdjustingLocation: boolean;
  authorOptions: string[];
  isSaving: boolean;
  onClose: () => void;
  onAdjustLocation: () => void;
  onResetLocation: () => void;
  onUploadFile: (file: File) => Promise<{ image: string; thumbnail: string }>;
  onUploadError: (message: string) => void;
  onSubmit: (payload: PlacePayload) => Promise<void>;
};

function EditPanel({
  mode,
  place,
  lat,
  lng,
  selectedLocation,
  isAdjustingLocation,
  authorOptions,
  isSaving,
  onClose,
  onAdjustLocation,
  onResetLocation,
  onUploadFile,
  onUploadError,
  onSubmit
}: EditPanelProps) {
  const initial = toFormState(place ?? undefined);
  const currentLocation = selectedLocation ?? (place ? { lat: place.lat, lng: place.lng } : { lat: lat ?? 0, lng: lng ?? 0 });
  const hasMovedLocation = place
    ? Math.abs(currentLocation.lat - place.lat) > 0.00001 || Math.abs(currentLocation.lng - place.lng) > 0.00001
    : false;
  const [title, setTitle] = useState(initial.title);
  const [content, setContent] = useState(initial.content);
  const [images, setImages] = useState<string[]>(initial.images);
  const [thumbnails, setThumbnails] = useState<string[]>(initial.thumbnails);
  const [author, setAuthor] = useState(initial.author);
  const [visitedAt, setVisitedAt] = useState(initial.visited_at);
  const [isLocked, setIsLocked] = useState(initial.is_locked);
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingImages, setIsDraggingImages] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const dragDepthRef = useRef(0);

  useEffect(() => {
    const next = toFormState(place ?? undefined);
    setTitle(next.title);
    setContent(next.content);
    setImages(next.images);
    setThumbnails(next.thumbnails);
    setAuthor(next.author);
    setVisitedAt(next.visited_at);
    setIsLocked(next.is_locked);
  }, [place]);

  const handleUploadFiles = async (fileList: FileList | File[] | null) => {
    const files = fileList ? Array.from(fileList).filter((file) => file.type.startsWith('image/')) : [];
    if (!files.length) {
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    try {
      const uploaded = await Promise.all(files.map((file) => onUploadFile(file)));
      setImages((current) => [...current, ...uploaded.map((item) => item.image)]);
      setThumbnails((current) => [...current, ...uploaded.map((item) => item.thumbnail)]);
    } catch (error) {
      const message = error instanceof Error ? error.message : '上传失败，请稍后重试';
      setUploadError(message);
      onUploadError(message);
    } finally {
      setIsUploading(false);
    }
  };

  const hasDraggedFiles = (dataTransfer: DataTransfer) =>
    Array.from(dataTransfer.items).some((item) => item.kind === 'file' && (!item.type || item.type.startsWith('image/')));

  const handleImageDragEnter = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!hasDraggedFiles(event.dataTransfer)) {
      return;
    }

    dragDepthRef.current += 1;
    setIsDraggingImages(true);
  };

  const handleImageDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleImageDragLeave = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(dragDepthRef.current - 1, 0);
    if (dragDepthRef.current === 0) {
      setIsDraggingImages(false);
    }
  };

  const handleImageDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDraggingImages(false);
    void handleUploadFiles(event.dataTransfer.files);
  };

  const removeImage = (index: number) => {
    setImages((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setThumbnails((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  return (
    <motion.aside
      initial={{ opacity: 0, x: 32, y: 12 }}
      animate={isAdjustingLocation ? { opacity: 0, x: 32, y: 12 } : { opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, x: 32, y: 12 }}
      transition={{ type: 'spring', stiffness: 220, damping: 24 }}
      className={cn(
        'meridian-panel absolute inset-x-3 bottom-[calc(max(var(--safe-area-bottom),0.75rem)+6rem)] top-[calc(max(var(--safe-area-top),0.75rem)+4.75rem)] z-50 rounded-[2rem] p-5 md:inset-x-auto md:bottom-6 md:right-6 md:top-24 md:w-[420px]',
        isAdjustingLocation && 'pointer-events-none'
      )}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">{mode === 'create' ? '新建记录' : '编辑记录'}</h2>
            <div className="meridian-muted-text mt-2 text-xs">
              {mode === 'create'
                ? `纬度 ${currentLocation.lat.toFixed(5)}，经度 ${currentLocation.lng.toFixed(5)}`
                : `纬度 ${currentLocation.lat.toFixed(5)}，经度 ${currentLocation.lng.toFixed(5)}`}
            </div>
          </div>
          <button
            type="button"
            className="meridian-button meridian-button--secondary px-3 py-2"
            onClick={onClose}
          >
            取消
          </button>
        </div>

        <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="space-y-4">
            {mode === 'edit' ? (
              <div className="meridian-soft-surface rounded-[1.25rem] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="meridian-muted-text-strong text-sm">位置</div>
                    <div className="meridian-muted-text mt-1 text-xs">
                      {isAdjustingLocation ? '拖动地图后点完成' : hasMovedLocation ? '位置已调整，保存后生效' : '可重新选择记忆点位置'}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="meridian-button meridian-button--secondary px-3 py-2 text-sm"
                    onClick={isAdjustingLocation ? onResetLocation : onAdjustLocation}
                  >
                    {isAdjustingLocation ? '撤销' : '调整'}
                  </button>
                </div>
              </div>
            ) : null}

            <label className="block">
              <div className="meridian-muted-text-strong mb-2 text-sm">标题</div>
              <input className="meridian-input" value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>

            <label className="block">
              <div className="meridian-muted-text-strong mb-2 text-sm">访问日期</div>
              <input
                type="date"
                className="meridian-input"
                value={visitedAt}
                onChange={(event) => setVisitedAt(event.target.value)}
              />
            </label>

            <AuthorCombobox value={author} options={authorOptions} onChange={setAuthor} />

            <label className="meridian-soft-surface flex items-center justify-between rounded-[1.25rem] px-4 py-3">
              <span className="meridian-muted-text-strong text-sm">上锁</span>
              <input type="checkbox" checked={isLocked} onChange={(event) => setIsLocked(event.target.checked)} />
            </label>

            <div>
              <div className="meridian-muted-text-strong mb-2 text-sm">正文</div>
              <MarkdownEditor markdown={content} onChange={setContent} />
            </div>

            <div>
              <div className="meridian-muted-text-strong mb-2 flex items-center justify-between text-sm">
                <span>图片</span>
                <span>{isUploading ? '上传中…' : `${images.length} 张`}</span>
              </div>
              <label
                className={cn(
                  'meridian-soft-surface meridian-muted-text block cursor-pointer rounded-[1.25rem] border-dashed px-4 py-6 text-center text-sm transition-[background-color,border-color,box-shadow]',
                  isDraggingImages && 'border-[var(--border-strong)] bg-[var(--panel-strong)] shadow-[0_0_0_2px_var(--accent)]'
                )}
                onDragEnter={handleImageDragEnter}
                onDragOver={handleImageDragOver}
                onDragLeave={handleImageDragLeave}
                onDrop={handleImageDrop}
              >
                {isDraggingImages ? '松开以上传图片' : '粘贴、拖拽或点击上传图片'}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    void handleUploadFiles(event.target.files);
                    event.currentTarget.value = '';
                  }}
                />
              </label>
              {uploadError ? <div className="mt-2 text-xs text-red-600 dark:text-red-300">{uploadError}</div> : null}
              {thumbnails.length > 0 ? (
                <div className="mt-3 grid grid-cols-3 gap-3">
                  {thumbnails.map((thumbnail, index) => (
                    <div key={thumbnail} className="relative overflow-hidden rounded-2xl border border-[var(--border)]">
                      <Image src={thumbnail} alt={title || 'image'} width={200} height={200} className="h-24 w-full object-cover" />
                      <button
                        type="button"
                        className="absolute right-2 top-2 rounded-full bg-[var(--overlay)] px-2 py-1 text-xs text-white"
                        onClick={() => removeImage(index)}
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button type="button" className="meridian-button meridian-button--secondary flex-1" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className={cn('meridian-button flex-1', (isSaving || isUploading) && 'opacity-70')}
            disabled={isSaving || isUploading || !title.trim()}
            onClick={() =>
              void onSubmit({
                lat: currentLocation.lat,
                lng: currentLocation.lng,
                title: title.trim(),
                content,
                images,
                thumbnails,
                author: author.trim() ? author.trim() : null,
                visited_at: visitedAt || null,
                is_locked: isLocked
              })
            }
          >
            {isSaving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </motion.aside>
  );
}

type RouteEditPanelProps = {
  mode: 'create' | 'edit';
  route: Route | null;
  start: Coordinates | null;
  end: Coordinates | null;
  pickingEndpoint: RouteEndpoint | null;
  authorOptions: string[];
  isSaving: boolean;
  onClose: () => void;
  onPickEndpoint: (endpoint: RouteEndpoint) => void;
  onUploadFile: (file: File) => Promise<{ image: string; thumbnail: string }>;
  onUploadError: (message: string) => void;
  onSubmit: (payload: RoutePayload) => Promise<void>;
};

function RouteEditPanel({
  mode,
  route,
  start,
  end,
  pickingEndpoint,
  authorOptions,
  isSaving,
  onClose,
  onPickEndpoint,
  onUploadFile,
  onUploadError,
  onSubmit
}: RouteEditPanelProps) {
  const initial = toRouteFormState(route ?? undefined);
  const [title, setTitle] = useState(initial.title);
  const [content, setContent] = useState(initial.content);
  const [images, setImages] = useState<string[]>(initial.images);
  const [thumbnails, setThumbnails] = useState<string[]>(initial.thumbnails);
  const [author, setAuthor] = useState(initial.author);
  const [departureAt, setDepartureAt] = useState(initial.departure_at);
  const [arrivalAt, setArrivalAt] = useState(initial.arrival_at);
  const [transportType, setTransportType] = useState(initial.transport_type);
  const [isLocked, setIsLocked] = useState(initial.is_locked);
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingImages, setIsDraggingImages] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const dragDepthRef = useRef(0);
  const isPicking = pickingEndpoint !== null;

  useEffect(() => {
    const next = toRouteFormState(route ?? undefined);
    setTitle(next.title);
    setContent(next.content);
    setImages(next.images);
    setThumbnails(next.thumbnails);
    setAuthor(next.author);
    setDepartureAt(next.departure_at);
    setArrivalAt(next.arrival_at);
    setTransportType(next.transport_type);
    setIsLocked(next.is_locked);
  }, [route]);

  const handleUploadFiles = async (fileList: FileList | File[] | null) => {
    const files = fileList ? Array.from(fileList).filter((file) => file.type.startsWith('image/')) : [];
    if (!files.length) {
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    try {
      const uploaded = await Promise.all(files.map((file) => onUploadFile(file)));
      setImages((current) => [...current, ...uploaded.map((item) => item.image)]);
      setThumbnails((current) => [...current, ...uploaded.map((item) => item.thumbnail)]);
    } catch (error) {
      const message = error instanceof Error ? error.message : '上传失败，请稍后重试';
      setUploadError(message);
      onUploadError(message);
    } finally {
      setIsUploading(false);
    }
  };

  const hasDraggedFiles = (dataTransfer: DataTransfer) =>
    Array.from(dataTransfer.items).some((item) => item.kind === 'file' && (!item.type || item.type.startsWith('image/')));

  const handleImageDragEnter = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!hasDraggedFiles(event.dataTransfer)) {
      return;
    }

    dragDepthRef.current += 1;
    setIsDraggingImages(true);
  };

  const handleImageDragOver = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  };

  const handleImageDragLeave = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(dragDepthRef.current - 1, 0);
    if (dragDepthRef.current === 0) {
      setIsDraggingImages(false);
    }
  };

  const handleImageDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDraggingImages(false);
    void handleUploadFiles(event.dataTransfer.files);
  };

  const removeImage = (index: number) => {
    setImages((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setThumbnails((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const canSubmit = Boolean(title.trim() && start && end && !isSaving && !isUploading);

  return (
    <motion.aside
      initial={{ opacity: 0, x: 32, y: 12 }}
      animate={isPicking ? { opacity: 0, x: 32, y: 12 } : { opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, x: 32, y: 12 }}
      transition={{ type: 'spring', stiffness: 220, damping: 24 }}
      className={cn(
        'meridian-panel absolute inset-x-3 bottom-[calc(max(var(--safe-area-bottom),0.75rem)+6rem)] top-[calc(max(var(--safe-area-top),0.75rem)+4.75rem)] z-50 rounded-[2rem] p-5 md:inset-x-auto md:bottom-6 md:right-6 md:top-24 md:w-[420px]',
        isPicking && 'pointer-events-none'
      )}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">{mode === 'create' ? '新建线路' : '编辑线路'}</h2>
            <div className="meridian-muted-text mt-2 text-xs">
              {start && end ? `${getTransportLabel(transportType)} · 起点和终点已选择` : '选择起点和终点后保存'}
            </div>
          </div>
          <button type="button" className="meridian-button meridian-button--secondary px-3 py-2" onClick={onClose}>
            取消
          </button>
        </div>

        <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="space-y-4">
            <div className="grid gap-3">
              <RouteEndpointControl endpoint="start" point={start} onPick={onPickEndpoint} />
              <RouteEndpointControl endpoint="end" point={end} onPick={onPickEndpoint} />
            </div>

            <label className="block">
              <div className="meridian-muted-text-strong mb-2 text-sm">标题</div>
              <input className="meridian-input" value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>

            <label className="block">
              <div className="meridian-muted-text-strong mb-2 text-sm">交通工具</div>
              <select className="meridian-input" value={transportType} onChange={(event) => setTransportType(event.target.value)}>
                {TRANSPORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <div className="meridian-muted-text-strong mb-2 text-sm">出发时间</div>
                <input
                  type="datetime-local"
                  className="meridian-input"
                  value={departureAt}
                  onChange={(event) => setDepartureAt(event.target.value)}
                />
              </label>
              <label className="block">
                <div className="meridian-muted-text-strong mb-2 text-sm">到达时间</div>
                <input
                  type="datetime-local"
                  className="meridian-input"
                  value={arrivalAt}
                  onChange={(event) => setArrivalAt(event.target.value)}
                />
              </label>
            </div>

            <AuthorCombobox value={author} options={authorOptions} onChange={setAuthor} />

            <label className="meridian-soft-surface flex items-center justify-between rounded-[1.25rem] px-4 py-3">
              <span className="meridian-muted-text-strong text-sm">上锁</span>
              <input type="checkbox" checked={isLocked} onChange={(event) => setIsLocked(event.target.checked)} />
            </label>

            <div>
              <div className="meridian-muted-text-strong mb-2 text-sm">正文</div>
              <MarkdownEditor markdown={content} onChange={setContent} />
            </div>

            <div>
              <div className="meridian-muted-text-strong mb-2 flex items-center justify-between text-sm">
                <span>图片</span>
                <span>{isUploading ? '上传中…' : `${images.length} 张`}</span>
              </div>
              <label
                className={cn(
                  'meridian-soft-surface meridian-muted-text block cursor-pointer rounded-[1.25rem] border-dashed px-4 py-6 text-center text-sm transition-[background-color,border-color,box-shadow]',
                  isDraggingImages && 'border-[var(--border-strong)] bg-[var(--panel-strong)] shadow-[0_0_0_2px_var(--accent)]'
                )}
                onDragEnter={handleImageDragEnter}
                onDragOver={handleImageDragOver}
                onDragLeave={handleImageDragLeave}
                onDrop={handleImageDrop}
              >
                {isDraggingImages ? '松开以上传图片' : '粘贴、拖拽或点击上传图片'}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    void handleUploadFiles(event.target.files);
                    event.currentTarget.value = '';
                  }}
                />
              </label>
              {uploadError ? <div className="mt-2 text-xs text-red-600 dark:text-red-300">{uploadError}</div> : null}
              {thumbnails.length > 0 ? (
                <div className="mt-3 grid grid-cols-3 gap-3">
                  {thumbnails.map((thumbnail, index) => (
                    <div key={thumbnail} className="relative overflow-hidden rounded-2xl border border-[var(--border)]">
                      <Image src={thumbnail} alt={title || 'image'} width={200} height={200} className="h-24 w-full object-cover" />
                      <button
                        type="button"
                        className="absolute right-2 top-2 rounded-full bg-[var(--overlay)] px-2 py-1 text-xs text-white"
                        onClick={() => removeImage(index)}
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button type="button" className="meridian-button meridian-button--secondary flex-1" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className={cn('meridian-button flex-1', !canSubmit && 'opacity-70')}
            disabled={!canSubmit || !start || !end}
            onClick={() => {
              if (!start || !end) {
                return;
              }

              void onSubmit({
                title: title.trim(),
                content,
                images,
                thumbnails,
                author: author.trim() ? author.trim() : null,
                start_lat: start.lat,
                start_lng: start.lng,
                end_lat: end.lat,
                end_lng: end.lng,
                departure_at: fromLocalDateTimeInputValue(departureAt),
                arrival_at: fromLocalDateTimeInputValue(arrivalAt),
                transport_type: transportType.trim() || 'car',
                is_locked: isLocked
              });
            }}
          >
            {isSaving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </motion.aside>
  );
}

type RouteEndpointControlProps = {
  endpoint: RouteEndpoint;
  point: Coordinates | null;
  onPick: (endpoint: RouteEndpoint) => void;
};

function RouteEndpointControl({ endpoint, point, onPick }: RouteEndpointControlProps) {
  const label = endpoint === 'start' ? '起点' : '终点';

  return (
    <div className="meridian-soft-surface rounded-[1.25rem] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="meridian-muted-text-strong text-sm">{label}</div>
          <div className="meridian-muted-text mt-1 text-xs">
            {point ? `纬度 ${point.lat.toFixed(5)}，经度 ${point.lng.toFixed(5)}` : `选择${label}位置`}
          </div>
        </div>
        <button
          type="button"
          className="meridian-button meridian-button--secondary px-3 py-2 text-sm"
          onClick={() => onPick(endpoint)}
        >
          {point ? '调整' : '选择'}
        </button>
      </div>
    </div>
  );
}

type AuthorComboboxProps = {
  value: string;
  options: string[];
  onChange: (value: string) => void;
};

function AuthorCombobox({ value, options, onChange }: AuthorComboboxProps) {
  return (
    <label className="block">
      <div className="meridian-muted-text-strong mb-2 text-sm">署名</div>
      <input
        list="meridian-authors"
        className="meridian-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="可选，可新增"
      />
      <datalist id="meridian-authors">
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </label>
  );
}
