'use client';

import { themeIsDark } from '@/lib/theme';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Icon, iconMaskUrl, type IconName } from '@/components/Icon';
import { useOverlayBack } from '@/lib/nav';
import { usePrefs } from '@/lib/prefs';
import { currentSpot, searchPlaces, type PlaceHit } from '@/lib/geo';
import { useMemoryPhotos, type Memory } from '@/lib/memories';
import type { MemoryKind } from '@/lib/memoryName';
import './memories.css';

/** OpenStreetMap's own tiles need no key. CARTO's now draw "API key required" across every tile. */
const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
/** Manila, for a first open with nothing pinned and no location yet. */
const FALLBACK: [number, number] = [14.5995, 120.9842];
export const KIND_HUE: Record<MemoryKind, string> = { meal: '#84cc16', workout: '#ff6fa8', run: '#ff9a3c', moment: '#345cff' };
const KIND_GLYPH: Record<MemoryKind, IconName> = { meal: 'food', workout: 'gym', run: 'walk', moment: 'star' };

/** Dark mode inverts the tiles in CSS, since OpenStreetMap has no dark style. */
function baseMap(el: HTMLElement, dark: boolean, interactive = true) {
  el.classList.toggle('is-dark', dark);
  const map = L.map(el, {
    zoomControl: false, attributionControl: true, dragging: interactive, scrollWheelZoom: interactive,
    touchZoom: interactive, doubleClickZoom: interactive, boxZoom: false, keyboard: interactive,
  });
  L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
  if (interactive) L.control.zoom({ position: 'bottomright' }).addTo(map);
  return map;
}

const escapeAttr = (s: string) => s.replace(/"/g, '%22').replace(/'/g, '%27').replace(/\)/g, '%29').replace(/\(/g, '%28');
/** The icon's mask, with its quotes swapped so it can sit inside a double-quoted style attribute. */
const glyph = (kind: MemoryKind) => iconMaskUrl(KIND_GLYPH[kind]).replace(/"/g, "'");

function pinHtml(m: Memory, photo: string | undefined, count = 1) {
  const face = photo
    ? `<span class="mem-pin-face" style="background-image:url('${escapeAttr(photo)}')"></span>`
    : `<span class="mem-pin-face is-glyph"><i style="-webkit-mask-image:${glyph(m.kind)};mask-image:${glyph(m.kind)}"></i></span>`;
  const badge = count > 1 ? `<b class="mem-pin-count">${count}</b>` : '';
  return `<span class="mem-pin" style="--pin:${KIND_HUE[m.kind]}">${face}${badge}<i></i></span>`;
}

/**
 * Where your memories happened. Each one is a pin wearing its photo; pins that
 * would overlap at this zoom become one, with a count, and tapping it zooms in.
 * A run with a recorded route draws the route.
 */
export function MemoryMap({ memories, onOpen, className }: {
  memories: Memory[];
  onOpen: (m: Memory) => void;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef('');
  const { prefs } = usePrefs();
  const dark = themeIsDark(prefs.theme);
  const photos = useMemoryPhotos(memories);
  const placed = useMemo(() => memories.filter((m) => m.lat !== null && m.lng !== null), [memories]);
  const openRef = useRef(onOpen);
  openRef.current = onOpen;

  useEffect(() => {
    if (!host.current) return;
    const m = baseMap(host.current, dark);
    m.setView(FALLBACK, 12);
    map.current = m;
    layer.current = L.layerGroup().addTo(m);
    const resize = new ResizeObserver(() => m.invalidateSize());
    resize.observe(host.current);
    return () => { resize.disconnect(); m.remove(); map.current = null; layer.current = null; fitted.current = ''; };
  }, [dark]);

  useEffect(() => {
    const m = map.current, group = layer.current;
    if (!m || !group) return;

    const draw = () => {
      group.clearLayers();
      const zoom = m.getZoom();
      const cells = new Map<string, Memory[]>();
      for (const item of placed) {
        const point = m.project([item.lat!, item.lng!], zoom);
        const key = `${Math.floor(point.x / 58)}:${Math.floor(point.y / 58)}`;
        cells.set(key, [...(cells.get(key) ?? []), item]);
      }
      for (const items of cells.values()) {
        const lead = items[0];
        const at: L.LatLngExpression = items.length === 1
          ? [lead.lat!, lead.lng!]
          : [items.reduce((s, i) => s + i.lat!, 0) / items.length, items.reduce((s, i) => s + i.lng!, 0) / items.length];
        const marker = L.marker(at, {
          icon: L.divIcon({ className: 'mem-pin-host', html: pinHtml(lead, photos[lead.id], items.length), iconSize: [48, 56], iconAnchor: [24, 54] }),
          keyboard: true, title: items.length > 1 ? `${items.length} memories` : lead.place || lead.caption || 'Memory',
          riseOnHover: true,
        });
        marker.on('click', () => {
          if (items.length === 1 || m.getZoom() >= 18) openRef.current(lead);
          else m.fitBounds(L.latLngBounds(items.map((i) => [i.lat!, i.lng!] as [number, number])).pad(0.6), { maxZoom: 18 });
        });
        group.addLayer(marker);
      }
      for (const item of placed) {
        if (item.route && item.route.length > 1) {
          group.addLayer(L.polyline(item.route, { color: KIND_HUE.run, weight: 4, opacity: 0.85, lineCap: 'round' }).on('click', () => openRef.current(item)));
        }
      }
    };

    draw();
    const signature = placed.map((p) => p.id).join(',');
    if (signature && fitted.current !== signature) {
      fitted.current = signature;
      const bounds = L.latLngBounds(placed.map((p) => [p.lat!, p.lng!] as [number, number]));
      m.fitBounds(bounds.pad(0.25), { maxZoom: 15, animate: false });
    } else if (!signature && !fitted.current) {
      fitted.current = 'here';
      void currentSpot(8_000).then((s) => map.current?.setView([s.lat, s.lng], 14)).catch(() => undefined);
    }
    m.on('zoomend', draw);
    return () => { m.off('zoomend', draw); };
  }, [placed, photos]);

  return (
    <div className={'mem-map' + (className ? ` ${className}` : '')}>
      <div ref={host} className="mem-map-canvas" />
      {!placed.length && <p className="mem-map-empty"><Icon name="mapPin" size={15} />Memories with a place show up here.</p>}
    </div>
  );
}

/** One pin, not movable. For the memory viewer. */
export function MiniMap({ lat, lng, kind }: { lat: number; lng: number; kind: MemoryKind }) {
  const host = useRef<HTMLDivElement>(null);
  const { prefs } = usePrefs();
  useEffect(() => {
    if (!host.current) return;
    const m = baseMap(host.current, themeIsDark(prefs.theme), false);
    m.setView([lat, lng], 16);
    L.circleMarker([lat, lng], { radius: 9, color: '#fff', weight: 3, fillColor: KIND_HUE[kind], fillOpacity: 1 }).addTo(m);
    return () => { m.remove(); };
  }, [lat, lng, kind, prefs.theme]);
  return <div ref={host} className="mem-minimap" aria-label="Where this was" role="img" />;
}

/**
 * Choosing a place by hand: drag the map under the fixed pin, or search for
 * a name. "Use my location" jumps to where the device is.
 */
export function PlacePicker({ initial, onPick, onClose }: {
  initial: { lat: number; lng: number } | null;
  onPick: (p: { lat: number; lng: number; name: string }) => void;
  onClose: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [chosenName, setChosenName] = useState('');
  const [note, setNote] = useState('');
  const { prefs } = usePrefs();
  useOverlayBack(true, onClose);

  useEffect(() => {
    if (!host.current) return;
    const m = baseMap(host.current, themeIsDark(prefs.theme));
    m.setView(initial ? [initial.lat, initial.lng] : FALLBACK, initial ? 17 : 13);
    map.current = m;
    // A name from search only holds until the map is moved away from it.
    m.on('dragstart', () => setChosenName(''));
    if (!initial) void currentSpot(8_000).then((s) => map.current?.setView([s.lat, s.lng], 17)).catch(() => undefined);
    return () => { m.remove(); map.current = null; };
    // The map is built once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) { setHits([]); return; }
    const timer = setTimeout(() => {
      setSearching(true);
      const center = map.current?.getCenter();
      void searchPlaces(q, center ? { lat: center.lat, lng: center.lng, accuracy: null } : null)
        .then(setHits).finally(() => setSearching(false));
    }, 450);
    return () => clearTimeout(timer);
  }, [query]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="mem-scrim is-top" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mem-sheet is-picker" role="dialog" aria-modal="true" aria-label="Pick the place">
        <header className="mem-sheet-head">
          <h2>Pick the place</h2>
          <button type="button" className="mem-icon" aria-label="Close" onClick={onClose}><Icon name="close" size={18} /></button>
        </header>
        <div className="mem-search">
          <Icon name="search" size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a place, like UST Plaza Mayor" aria-label="Search places" />
          {searching && <span className="mem-search-busy" aria-hidden="true" />}
        </div>
        {hits.length > 0 && (
          <ul className="mem-hits">
            {hits.map((h) => (
              <li key={`${h.lat},${h.lng}`}>
                <button type="button" onClick={() => { map.current?.setView([h.lat, h.lng], 17); setChosenName(h.name); setHits([]); setQuery(''); }}>
                  <b>{h.name}</b><small>{h.detail}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mem-picker-map">
          <div ref={host} className="mem-map-canvas" />
          <span className="mem-picker-pin" aria-hidden="true"><Icon name="mapPin" size={30} /></span>
        </div>
        {note && <p className="mem-where-note is-warn">{note}</p>}
        <div className="mem-picker-actions">
          <button type="button" className="mem-ghost" onClick={() => {
            setNote('');
            void currentSpot().then((s) => { map.current?.setView([s.lat, s.lng], 17); setChosenName(''); }).catch((e: Error) => setNote(e.message));
          }}><Icon name="target" size={15} />Use my location</button>
          <button type="button" className="mem-save" onClick={() => {
            const c = map.current?.getCenter();
            if (c) onPick({ lat: c.lat, lng: c.lng, name: chosenName });
          }}>Use this place</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
