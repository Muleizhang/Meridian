'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { isSanitizedLockedPlace, type Place, type Route } from '@/lib/types';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

type MapViewProps = {
  places: Place[];
  routes: Route[];
  selectedPlaceId: number | null;
  selectedRouteId: number | null;
  pendingCenter: { lat: number; lng: number } | null;
  focusPendingCenter: boolean;
  canEdit: boolean;
  theme: 'light' | 'dark';
  onCenterChange: (center: { lat: number; lng: number }) => void;
  onSelectPlace: (placeId: number) => void;
  onSelectRoute: (routeId: number) => void;
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
const ROUTE_STROKE = 'var(--muted-strong)';
const ROUTE_DASH_ARRAY = '4 7';

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

function getFallbackViewport(
  map: mapboxgl.Map,
  places: Place[],
  routes: Route[],
  bounds: mapboxgl.LngLatBounds | null
): StoredViewport {
  const itemCount = places.length + routes.length * 2;
  if (itemCount === 0 || !bounds) {
    return DEFAULT_VIEWPORT;
  }

  if (places.length === 1 && routes.length === 0) {
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

function getPlaceStackTime(place: Place) {
  const time = new Date(place.visited_at ?? place.created_at).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getMarkerZIndexByPlaceId(places: Place[]) {
  const nowTime = Date.now();
  const sortedPlaces = [...places].sort((left, right) => {
    const leftTime = getPlaceStackTime(left);
    const rightTime = getPlaceStackTime(right);
    const distanceDelta = Math.abs(nowTime - rightTime) - Math.abs(nowTime - leftTime);

    if (distanceDelta !== 0) {
      return distanceDelta;
    }

    return leftTime - rightTime || left.id - right.id;
  });

  return new Map(sortedPlaces.map((place, index) => [place.id, index + 1]));
}

function getRouteWidth(route: Route, selectedRouteId: number | null) {
  return selectedRouteId === route.id ? 1.8 : 1.2;
}

function getRouteOpacity(route: Route, selectedRouteId: number | null) {
  return selectedRouteId === route.id ? 0.72 : 0.48;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number) {
  return (value * 180) / Math.PI;
}

function getAirRouteCoordinates(route: Route) {
  const startLat = toRadians(route.start_lat);
  const startLng = toRadians(route.start_lng);
  const endLat = toRadians(route.end_lat);
  const endLng = toRadians(route.end_lng);
  const deltaLat = endLat - startLat;
  const deltaLng = endLng - startLng;
  const angularDistance = 2 * Math.asin(Math.sqrt(
    Math.sin(deltaLat / 2) ** 2
    + Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) ** 2
  ));

  if (!Number.isFinite(angularDistance) || angularDistance < 0.000001) {
    return [
      [route.start_lng, route.start_lat],
      [route.end_lng, route.end_lat]
    ];
  }

  const steps = Math.min(96, Math.max(18, Math.ceil(angularDistance * 40)));
  const sinDistance = Math.sin(angularDistance);

  return Array.from({ length: steps + 1 }, (_, index) => {
    const progress = index / steps;
    const startWeight = Math.sin((1 - progress) * angularDistance) / sinDistance;
    const endWeight = Math.sin(progress * angularDistance) / sinDistance;
    const x = startWeight * Math.cos(startLat) * Math.cos(startLng) + endWeight * Math.cos(endLat) * Math.cos(endLng);
    const y = startWeight * Math.cos(startLat) * Math.sin(startLng) + endWeight * Math.cos(endLat) * Math.sin(endLng);
    const z = startWeight * Math.sin(startLat) + endWeight * Math.sin(endLat);
    const lat = Math.atan2(z, Math.sqrt(x ** 2 + y ** 2));
    const lng = Math.atan2(y, x);

    return [toDegrees(lng), toDegrees(lat)];
  });
}

function getRouteCoordinates(route: Route) {
  if (route.transport_type === 'plane') {
    return getAirRouteCoordinates(route);
  }

  return [
    [route.start_lng, route.start_lat],
    [route.end_lng, route.end_lat]
  ];
}

function getProjectedRoutePath(map: mapboxgl.Map, coordinates: number[][]) {
  return coordinates
    .map(([lng, lat]) => map.project([lng, lat]))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ');
}

type RouteOverlayItem = {
  id: number;
  label: string;
  width: number;
  opacity: number;
  coordinates: number[][];
};

type RoutePathElements = {
  line: SVGPathElement | null;
  hit: SVGPathElement | null;
};

export function MapView({
  places,
  routes,
  selectedPlaceId,
  selectedRouteId,
  pendingCenter,
  focusPendingCenter,
  canEdit,
  theme,
  onCenterChange,
  onSelectPlace,
  onSelectRoute
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const themeRef = useRef<MapViewProps['theme']>(theme);
  const currentStyleRef = useRef<string | null>(null);
  const markersRef = useRef<Map<number, mapboxgl.Marker>>(new Map());
  const routeOverlayRef = useRef<HTMLDivElement | null>(null);
  const routePathRefs = useRef<Map<number, RoutePathElements>>(new Map());
  const [routeOverlayElement, setRouteOverlayElement] = useState<HTMLDivElement | null>(null);
  const [mapRenderVersion, setMapRenderVersion] = useState(0);
  const hasStoredViewportRef = useRef(false);
  const previousSelectionRef = useRef<{ placeId: number | null; routeId: number | null }>({
    placeId: selectedPlaceId,
    routeId: selectedRouteId
  });
  const selectedPlaceIdRef = useRef<number | null>(selectedPlaceId);
  const selectedRouteIdRef = useRef<number | null>(selectedRouteId);
  const isPickingCenter = canEdit && pendingCenter !== null;
  const pendingCenterLat = pendingCenter?.lat;
  const pendingCenterLng = pendingCenter?.lng;
  const isPickingCenterRef = useRef(isPickingCenter);
  const wasFocusingPendingCenterRef = useRef(false);
  const didFitInitialRoutesRef = useRef(false);

  const bounds = useMemo(() => {
    if (places.length === 0 && routes.length === 0) {
      return null;
    }

    const nextBounds = new mapboxgl.LngLatBounds();
    places.forEach((place) => nextBounds.extend([place.lng, place.lat]));
    routes.forEach((route) => {
      nextBounds.extend([route.start_lng, route.start_lat]);
      nextBounds.extend([route.end_lng, route.end_lat]);
    });
    return nextBounds;
  }, [places, routes]);

  const routeOverlayItems = useMemo<RouteOverlayItem[]>(
    () => routes.map((route) => ({
      id: route.id,
      label: route.title || '线路',
      width: getRouteWidth(route, selectedRouteId),
      opacity: getRouteOpacity(route, selectedRouteId),
      coordinates: getRouteCoordinates(route)
    })),
    [routes, selectedRouteId]
  );
  const orderedRouteOverlayItems = useMemo(
    () => [...routeOverlayItems].sort((left, right) => Number(left.id === selectedRouteId) - Number(right.id === selectedRouteId)),
    [routeOverlayItems, selectedRouteId]
  );
  const routeOverlayItemsRef = useRef<RouteOverlayItem[]>(orderedRouteOverlayItems);

  useEffect(() => {
    selectedPlaceIdRef.current = selectedPlaceId;
  }, [selectedPlaceId]);

  useEffect(() => {
    selectedRouteIdRef.current = selectedRouteId;
  }, [selectedRouteId]);

  useEffect(() => {
    routeOverlayItemsRef.current = orderedRouteOverlayItems;
  }, [orderedRouteOverlayItems]);

  const setRoutePathElement = (routeId: number, elementName: keyof RoutePathElements, element: SVGPathElement | null) => {
    const elements = routePathRefs.current.get(routeId) ?? { line: null, hit: null };
    elements[elementName] = element;

    if (elements.line || elements.hit) {
      routePathRefs.current.set(routeId, elements);
    } else {
      routePathRefs.current.delete(routeId);
    }
  };

  useEffect(() => {
    isPickingCenterRef.current = isPickingCenter;
  }, [isPickingCenter]);

  useEffect(() => {
    const map = mapRef.current;
    const shouldFocusPendingCenter = isPickingCenter && focusPendingCenter;
    const wasFocusingPendingCenter = wasFocusingPendingCenterRef.current;
    wasFocusingPendingCenterRef.current = shouldFocusPendingCenter;

    if (
      !map
      || typeof pendingCenterLat !== 'number'
      || typeof pendingCenterLng !== 'number'
      || !shouldFocusPendingCenter
      || wasFocusingPendingCenter
    ) {
      return;
    }

    const nextZoom = Math.max(map.getZoom(), SELECTED_PLACE_MIN_ZOOM);
    map.easeTo({ center: [pendingCenterLng, pendingCenterLat], zoom: nextZoom, duration: 500 });
  }, [focusPendingCenter, isPickingCenter, pendingCenterLat, pendingCenterLng]);

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
    const routePathMap = routePathRefs.current;
    const handleStyleLoad = () => {
      applyMapAtmosphere(map, themeRef.current);
      setMapRenderVersion((version) => version + 1);
    };
    const handleMoveEnd = () => {
      if (selectedPlaceIdRef.current || selectedRouteIdRef.current || isPickingCenterRef.current) {
        return;
      }

      persistViewportValue(getCurrentViewport(map));
      hasStoredViewportRef.current = true;
    };

    currentStyleRef.current = getMapStyle(themeRef.current);
    map.on('style.load', handleStyleLoad);
    map.on('moveend', handleMoveEnd);
    mapRef.current = map;

    const routeOverlay = document.createElement('div');
    routeOverlay.style.position = 'absolute';
    routeOverlay.style.inset = '0';
    routeOverlay.style.zIndex = '2';
    routeOverlay.style.pointerEvents = 'none';
    routeOverlay.style.overflow = 'visible';
    map.getCanvasContainer().appendChild(routeOverlay);
    routeOverlayRef.current = routeOverlay;
    setRouteOverlayElement(routeOverlay);
    setMapRenderVersion((version) => version + 1);

    return () => {
      map.off('style.load', handleStyleLoad);
      map.off('moveend', handleMoveEnd);
      markers.forEach((marker) => marker.remove());
      markers.clear();
      routeOverlayRef.current?.remove();
      routeOverlayRef.current = null;
      setRouteOverlayElement(null);
      map.remove();
      mapRef.current = null;
      currentStyleRef.current = null;
      routePathMap.clear();
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
    if (!focusPendingCenter) {
      handleMove();
    }

    return () => {
      map.off('move', handleMove);
    };
  }, [focusPendingCenter, isPickingCenter, onCenterChange]);

  useEffect(() => {
    const map = mapRef.current;
    const previousSelection = previousSelectionRef.current;
    previousSelectionRef.current = { placeId: selectedPlaceId, routeId: selectedRouteId };

    if (!map || !bounds || selectedPlaceId || selectedRouteId) {
      return;
    }

    const storedViewport = getStoredViewport();
    if (storedViewport) {
      hasStoredViewportRef.current = true;
    }

    if (previousSelection.placeId || previousSelection.routeId) {
      const restoreViewport = storedViewport ?? getFallbackViewport(map, places, routes, bounds);
      const currentViewport = getCurrentViewport(map);
      if (!isSameViewport(currentViewport, restoreViewport)) {
        map.easeTo({ center: [restoreViewport.lng, restoreViewport.lat], zoom: restoreViewport.zoom, duration: 700 });
      }
      return;
    }

    if (storedViewport && (routes.length === 0 || didFitInitialRoutesRef.current)) {
      return;
    }

    const fallbackViewport = getFallbackViewport(map, places, routes, bounds);
    const currentViewport = getCurrentViewport(map);
    if (!isSameViewport(currentViewport, fallbackViewport)) {
      map.jumpTo({ center: [fallbackViewport.lng, fallbackViewport.lat], zoom: fallbackViewport.zoom });
    }
    persistViewportValue(fallbackViewport);
    didFitInitialRoutesRef.current = routes.length > 0;
    hasStoredViewportRef.current = true;
  }, [bounds, places, routes, selectedPlaceId, selectedRouteId]);

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
      const fallbackViewport = getFallbackViewport(map, places, routes, bounds);
      persistViewportValue(fallbackViewport);
      hasStoredViewportRef.current = true;
    }

    const nextZoom = Math.max(map.getZoom(), SELECTED_PLACE_MIN_ZOOM);
    map.easeTo({ center: [selectedPlace.lng, selectedPlace.lat], zoom: nextZoom, duration: 700 });
  }, [bounds, places, routes, selectedPlaceId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedRouteId) {
      return;
    }

    const selectedRoute = routes.find((route) => route.id === selectedRouteId);
    if (!selectedRoute) {
      return;
    }

    if (!hasStoredViewportRef.current) {
      const fallbackViewport = getFallbackViewport(map, places, routes, bounds);
      persistViewportValue(fallbackViewport);
      hasStoredViewportRef.current = true;
    }

    const routeBounds = new mapboxgl.LngLatBounds()
      .extend([selectedRoute.start_lng, selectedRoute.start_lat])
      .extend([selectedRoute.end_lng, selectedRoute.end_lat]);
    const routeViewport = getBoundsViewport(map, routeBounds);

    if (routeViewport) {
      persistViewportValue(routeViewport);
      hasStoredViewportRef.current = true;
      map.easeTo({ center: [routeViewport.lng, routeViewport.lat], zoom: Math.max(routeViewport.zoom, 3), duration: 700 });
    }
  }, [bounds, places, routes, selectedRouteId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !routeOverlayElement) {
      return;
    }

    const updateRouteOverlayPaths = () => {
      routeOverlayItemsRef.current.forEach((route) => {
        const path = getProjectedRoutePath(map, route.coordinates);
        const elements = routePathRefs.current.get(route.id);
        elements?.line?.setAttribute('d', path);
        elements?.hit?.setAttribute('d', path);
      });
    };

    updateRouteOverlayPaths();
    map.on('render', updateRouteOverlayPaths);
    map.on('resize', updateRouteOverlayPaths);
    map.on('style.load', updateRouteOverlayPaths);

    return () => {
      map.off('render', updateRouteOverlayPaths);
      map.off('resize', updateRouteOverlayPaths);
      map.off('style.load', updateRouteOverlayPaths);
    };
  }, [mapRenderVersion, orderedRouteOverlayItems, routeOverlayElement]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();
    const markerZIndexByPlaceId = getMarkerZIndexByPlaceId(places);

    places.forEach((place) => {
      const isHiddenLockedPlace = isSanitizedLockedPlace(place);
      const markerElement = document.createElement('button');
      markerElement.type = 'button';
      markerElement.className = 'group relative border-0 bg-transparent p-0';
      markerElement.setAttribute('aria-label', place.title || 'place marker');
      markerElement.style.zIndex = String(100 + (markerZIndexByPlaceId.get(place.id) ?? 1));

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

  const handleProjectedRouteSelect = (routeId: number) => {
    const map = mapRef.current;
    if (map && !selectedPlaceIdRef.current && !selectedRouteIdRef.current) {
      persistViewportValue(getCurrentViewport(map));
      hasStoredViewportRef.current = true;
    }
    onSelectRoute(routeId);
  };

  const routeOverlay = (
    <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden={orderedRouteOverlayItems.length === 0}>
      {orderedRouteOverlayItems.map((route) => {
        return (
          <g
            key={route.id}
            aria-label={route.label}
            className="outline-none"
            role="button"
            tabIndex={0}
            onClick={() => handleProjectedRouteSelect(route.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleProjectedRouteSelect(route.id);
              }
              }}
            >
            <path
              ref={(element) => setRoutePathElement(route.id, 'line', element)}
              d=""
              fill="none"
              stroke={ROUTE_STROKE}
              strokeDasharray={ROUTE_DASH_ARRAY}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeOpacity={route.opacity}
              strokeWidth={route.width}
              vectorEffect="non-scaling-stroke"
              style={{ pointerEvents: 'none' }}
            />
            <path
              ref={(element) => setRoutePathElement(route.id, 'hit', element)}
              d=""
              fill="none"
              stroke="transparent"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={Math.max(route.width + 18, 24)}
              vectorEffect="non-scaling-stroke"
              style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
            />
          </g>
        );
      })}
    </svg>
  );

  return (
    <>
      <div ref={containerRef} className="h-full w-full" />
      {routeOverlayElement ? createPortal(routeOverlay, routeOverlayElement) : null}
    </>
  );
}
