'use client';

import { useEffect, useMemo, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { isSanitizedLockedPlace, type Place } from '@/lib/types';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

type MapViewProps = {
  places: Place[];
  selectedPlaceId: number | null;
  pendingCenter: { lat: number; lng: number } | null;
  canEdit: boolean;
  theme: 'light' | 'dark';
  onCenterChange: (center: { lat: number; lng: number }) => void;
  onSelectPlace: (placeId: number) => void;
};

type StoredViewport = {
  lat: number;
  lng: number;
  zoom: number;
};

const VIEWPORT_STORAGE_KEY = 'meridian-map-viewport';
const DEFAULT_VIEWPORT: StoredViewport = { lat: 31.2304, lng: 121.4737, zoom: 2.2 };
const SINGLE_PLACE_ZOOM = 4;
const SELECTED_PLACE_MIN_ZOOM = 4.5;

const getMapStyle = (theme: MapViewProps['theme']) =>
  theme === 'dark' ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/outdoors-v12';

const getMapAtmosphere = (theme: MapViewProps['theme']) =>
  theme === 'dark'
    ? {
        color: 'rgb(5, 7, 12)',
        'high-color': 'rgb(5, 7, 12)',
        'space-color': 'rgb(10, 14, 28)',
        'horizon-blend': 0,
        'star-intensity': 0.85
      }
    : {
        color: 'rgb(186, 210, 235)',
        'high-color': 'rgb(36, 92, 223)',
        'space-color': 'rgb(11, 11, 25)',
        'horizon-blend': 0.02,
        'star-intensity': 0.6
      };

const applyMapAtmosphere = (map: mapboxgl.Map, theme: MapViewProps['theme']) => {
  if (!map.isStyleLoaded()) {
    return;
  }

  map.setProjection('globe');
  map.setFog(getMapAtmosphere(theme));
};

function getCurrentViewport(map: mapboxgl.Map): StoredViewport {
  const center = map.getCenter();
  return { lat: center.lat, lng: center.lng, zoom: map.getZoom() };
}

function getStoredViewport(): StoredViewport | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const storedViewport = window.sessionStorage.getItem(VIEWPORT_STORAGE_KEY);
  if (!storedViewport) {
    return null;
  }

  try {
    const parsed = JSON.parse(storedViewport) as Partial<StoredViewport>;
    if (typeof parsed.lat !== 'number' || typeof parsed.lng !== 'number' || typeof parsed.zoom !== 'number') {
      return null;
    }

    return parsed as StoredViewport;
  } catch {
    return null;
  }
}

function persistViewportValue(viewport: StoredViewport) {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(VIEWPORT_STORAGE_KEY, JSON.stringify(viewport));
}

function getBoundsViewport(map: mapboxgl.Map, bounds: mapboxgl.LngLatBounds) {
  const camera = map.cameraForBounds(bounds, { padding: 120, maxZoom: 5 });
  if (!camera || !camera.center || typeof camera.zoom !== 'number') {
    return null;
  }

  const center = mapboxgl.LngLat.convert(camera.center);
  return { lat: center.lat, lng: center.lng, zoom: camera.zoom } satisfies StoredViewport;
}

function getFallbackViewport(map: mapboxgl.Map, places: Place[], bounds: mapboxgl.LngLatBounds | null): StoredViewport {
  if (places.length === 0 || !bounds) {
    return DEFAULT_VIEWPORT;
  }

  if (places.length === 1) {
    const place = places[0];
    return { lat: place.lat, lng: place.lng, zoom: SINGLE_PLACE_ZOOM };
  }

  return getBoundsViewport(map, bounds) ?? DEFAULT_VIEWPORT;
}

function isSameViewport(left: StoredViewport, right: StoredViewport) {
  return (
    Math.abs(left.lat - right.lat) < 0.0001
    && Math.abs(left.lng - right.lng) < 0.0001
    && Math.abs(left.zoom - right.zoom) < 0.0001
  );
}

export function MapView({
  places,
  selectedPlaceId,
  pendingCenter,
  canEdit,
  theme,
  onCenterChange,
  onSelectPlace
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const themeRef = useRef<MapViewProps['theme']>(theme);
  const currentStyleRef = useRef<string | null>(null);
  const markersRef = useRef<Map<number, mapboxgl.Marker>>(new Map());
  const hasStoredViewportRef = useRef(false);
  const previousSelectedPlaceIdRef = useRef<number | null>(selectedPlaceId);
  const selectedPlaceIdRef = useRef<number | null>(selectedPlaceId);
  const isPickingCenter = canEdit && pendingCenter !== null;
  const isPickingCenterRef = useRef(isPickingCenter);

  const bounds = useMemo(() => {
    if (places.length === 0) {
      return null;
    }

    const nextBounds = new mapboxgl.LngLatBounds();
    places.forEach((place) => nextBounds.extend([place.lng, place.lat]));
    return nextBounds;
  }, [places]);

  useEffect(() => {
    selectedPlaceIdRef.current = selectedPlaceId;
  }, [selectedPlaceId]);

  useEffect(() => {
    isPickingCenterRef.current = isPickingCenter;
  }, [isPickingCenter]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const storedViewport = getStoredViewport();
    hasStoredViewportRef.current = Boolean(storedViewport);

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: getMapStyle(themeRef.current),
      center: storedViewport ? [storedViewport.lng, storedViewport.lat] : [DEFAULT_VIEWPORT.lng, DEFAULT_VIEWPORT.lat],
      zoom: storedViewport?.zoom ?? DEFAULT_VIEWPORT.zoom,
      attributionControl: false
    });

    const markers = markersRef.current;
    const handleStyleLoad = () => {
      applyMapAtmosphere(map, themeRef.current);
    };
    const handleMoveEnd = () => {
      if (selectedPlaceIdRef.current || isPickingCenterRef.current) {
        return;
      }

      persistViewportValue(getCurrentViewport(map));
      hasStoredViewportRef.current = true;
    };

    currentStyleRef.current = getMapStyle(themeRef.current);
    map.on('style.load', handleStyleLoad);
    map.on('moveend', handleMoveEnd);
    mapRef.current = map;

    return () => {
      map.off('style.load', handleStyleLoad);
      map.off('moveend', handleMoveEnd);
      markers.forEach((marker) => marker.remove());
      markers.clear();
      map.remove();
      mapRef.current = null;
      currentStyleRef.current = null;
    };
  }, []);

  useEffect(() => {
    themeRef.current = theme;

    const map = mapRef.current;
    if (!map) {
      return;
    }

    const style = getMapStyle(theme);
    if (currentStyleRef.current === style) {
      applyMapAtmosphere(map, theme);
      return;
    }

    currentStyleRef.current = style;
    map.setStyle(style);
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isPickingCenter) {
      return;
    }

    const handleMove = () => {
      const center = map.getCenter();
      onCenterChange({ lat: center.lat, lng: center.lng });
    };

    map.on('move', handleMove);
    handleMove();

    return () => {
      map.off('move', handleMove);
    };
  }, [isPickingCenter, onCenterChange]);

  useEffect(() => {
    const map = mapRef.current;
    const previousSelectedPlaceId = previousSelectedPlaceIdRef.current;
    previousSelectedPlaceIdRef.current = selectedPlaceId;

    if (!map || !bounds || selectedPlaceId) {
      return;
    }

    const storedViewport = getStoredViewport();
    if (storedViewport) {
      hasStoredViewportRef.current = true;
    }

    if (previousSelectedPlaceId) {
      const restoreViewport = storedViewport ?? getFallbackViewport(map, places, bounds);
      const currentViewport = getCurrentViewport(map);
      if (!isSameViewport(currentViewport, restoreViewport)) {
        map.easeTo({ center: [restoreViewport.lng, restoreViewport.lat], zoom: restoreViewport.zoom, duration: 700 });
      }
      return;
    }

    if (storedViewport) {
      return;
    }

    const fallbackViewport = getFallbackViewport(map, places, bounds);
    const currentViewport = getCurrentViewport(map);
    if (!isSameViewport(currentViewport, fallbackViewport)) {
      map.jumpTo({ center: [fallbackViewport.lng, fallbackViewport.lat], zoom: fallbackViewport.zoom });
    }
    persistViewportValue(fallbackViewport);
    hasStoredViewportRef.current = true;
  }, [bounds, places, selectedPlaceId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedPlaceId) {
      return;
    }

    const selectedPlace = places.find((place) => place.id === selectedPlaceId);
    if (!selectedPlace) {
      return;
    }

    if (!hasStoredViewportRef.current) {
      const fallbackViewport = getFallbackViewport(map, places, bounds);
      persistViewportValue(fallbackViewport);
      hasStoredViewportRef.current = true;
    }

    const nextZoom = Math.max(map.getZoom(), SELECTED_PLACE_MIN_ZOOM);
    map.easeTo({ center: [selectedPlace.lng, selectedPlace.lat], zoom: nextZoom, duration: 700 });
  }, [bounds, places, selectedPlaceId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();

    places.forEach((place) => {
      const isHiddenLockedPlace = isSanitizedLockedPlace(place);
      const markerElement = document.createElement('button');
      markerElement.type = 'button';
      markerElement.className = 'group relative border-0 bg-transparent p-0';
      markerElement.setAttribute('aria-label', place.title || 'place marker');

      const bubble = document.createElement('div');
      bubble.className = [
        'flex h-14 w-14 items-center justify-center rounded-full border border-white/70 shadow-[0_12px_32px_rgba(15,23,42,0.18)] transition-transform duration-200 group-hover:scale-105',
        selectedPlaceId === place.id ? 'ring-4 ring-black/10 dark:ring-white/20' : ''
      ].join(' ');
      bubble.style.backgroundColor = isHiddenLockedPlace || !place.thumbnails[0] ? 'var(--marker-muted)' : 'var(--panel-strong)';
      bubble.style.backgroundSize = 'cover';
      bubble.style.backgroundPosition = 'center';
      bubble.style.backgroundImage = !isHiddenLockedPlace && place.thumbnails[0] ? `url("${place.thumbnails[0]}")` : 'none';
      bubble.style.color = 'var(--accent-foreground)';
      bubble.textContent = isHiddenLockedPlace ? '🔒' : '';
      markerElement.appendChild(bubble);

      if (place.title && !isHiddenLockedPlace) {
        const label = document.createElement('div');
        label.className = 'pointer-events-none absolute left-1/2 top-full mt-2 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-hidden text-ellipsis whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium shadow-sm';
        label.style.background = 'var(--panel-strong)';
        label.style.color = 'var(--foreground)';
        label.style.writingMode = 'horizontal-tb';
        label.style.textOrientation = 'mixed';
        label.textContent = place.title;
        markerElement.appendChild(label);
      }

      markerElement.addEventListener('click', () => {
        if (!selectedPlaceIdRef.current) {
          persistViewportValue(getCurrentViewport(map));
          hasStoredViewportRef.current = true;
        }
        onSelectPlace(place.id);
      });

      const marker = new mapboxgl.Marker({ element: markerElement, anchor: 'center' })
        .setLngLat([place.lng, place.lat])
        .addTo(map);

      markersRef.current.set(place.id, marker);
    });
  }, [onSelectPlace, places, selectedPlaceId, theme]);

  return <div ref={containerRef} className="h-full w-full" />;
}
