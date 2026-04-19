'use client';

import { useEffect, useMemo, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { Place } from '@/lib/types';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

type MapViewProps = {
  places: Place[];
  selectedPlaceId: number | null;
  pendingCenter: { lat: number; lng: number } | null;
  canEdit: boolean;
  onCenterChange: (center: { lat: number; lng: number }) => void;
  onSelectPlace: (placeId: number) => void;
};

export function MapView({
  places,
  selectedPlaceId,
  pendingCenter,
  canEdit,
  onCenterChange,
  onSelectPlace
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<number, mapboxgl.Marker>>(new Map());

  const bounds = useMemo(() => {
    if (places.length === 0) {
      return null;
    }

    const nextBounds = new mapboxgl.LngLatBounds();
    places.forEach((place) => nextBounds.extend([place.lng, place.lat]));
    return nextBounds;
  }, [places]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [121.4737, 31.2304],
      zoom: 2.2,
      attributionControl: false
    });

    const markers = markersRef.current;

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'bottom-left');
    mapRef.current = map;

    return () => {
      markers.forEach((marker) => marker.remove());
      markers.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pendingCenter || !canEdit) {
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
  }, [canEdit, onCenterChange, pendingCenter]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !bounds) {
      return;
    }

    if (selectedPlaceId) {
      return;
    }

    if (places.length === 1) {
      const place = places[0];
      map.easeTo({ center: [place.lng, place.lat], zoom: 4 });
      return;
    }

    map.fitBounds(bounds, { padding: 120, duration: 0, maxZoom: 5 });
  }, [bounds, places, selectedPlaceId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const selectedPlace = places.find((place) => place.id === selectedPlaceId);
    if (!selectedPlace) {
      return;
    }

    map.easeTo({ center: [selectedPlace.lng, selectedPlace.lat], zoom: Math.max(map.getZoom(), 4.5), duration: 700 });
  }, [places, selectedPlaceId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();

    places.forEach((place) => {
      const markerElement = document.createElement('button');
      markerElement.type = 'button';
      markerElement.className = 'group relative flex flex-col items-center border-0 bg-transparent p-0';
      markerElement.setAttribute('aria-label', place.title || 'place marker');

      const bubble = document.createElement('div');
      bubble.className = [
        'flex h-14 w-14 items-center justify-center rounded-full border border-white/70 shadow-[0_12px_32px_rgba(15,23,42,0.18)] transition-transform duration-200 group-hover:scale-105',
        selectedPlaceId === place.id ? 'ring-4 ring-black/10' : ''
      ].join(' ');
      bubble.style.backgroundColor = place.is_locked || !place.thumbnails[0] ? '#d4d4d8' : '#ffffff';
      bubble.style.backgroundSize = 'cover';
      bubble.style.backgroundPosition = 'center';
      bubble.style.backgroundImage = !place.is_locked && place.thumbnails[0] ? `url("${place.thumbnails[0]}")` : 'none';
      bubble.textContent = place.is_locked ? '🔒' : '';
      markerElement.appendChild(bubble);

      if (place.title && !place.is_locked) {
        const label = document.createElement('div');
        label.className = 'mt-2 rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-zinc-700 shadow-sm';
        label.textContent = place.title;
        markerElement.appendChild(label);
      }

      markerElement.addEventListener('click', () => onSelectPlace(place.id));

      const marker = new mapboxgl.Marker({ element: markerElement, anchor: 'bottom' })
        .setLngLat([place.lng, place.lat])
        .addTo(map);

      markersRef.current.set(place.id, marker);
    });
  }, [onSelectPlace, places, selectedPlaceId]);

  return <div ref={containerRef} className="h-full w-full" />;
}
