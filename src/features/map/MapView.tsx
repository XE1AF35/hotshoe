// Loaded only when the Map tab opens: MapLibre is far larger than the rest of the app.
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  AttributionControl,
  type GeoJSONSource,
  type LngLatBoundsLike,
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { useEffect, useRef, useState } from 'react';
import type { EntryId } from '../../db/schema.ts';
import { currentTheme, onThemeChange } from '../../lib/theme.ts';
import { mapStyleUrl } from './mapConfig.ts';
import type { Points } from './points.ts';

// MapLibre looks for its worker beside its own file, which bundling moves. This points it at the
// copy Vite emits, served from this origin so the Content Security Policy allows it.
setWorkerUrl(workerUrl);

const sourceId = 'entries';
const layers = {
  clusters: 'entry-clusters',
  clusterCounts: 'entry-cluster-counts',
  points: 'entry-points',
  selected: 'entry-selected',
} as const;

/** Taps this close to a point count as hitting it, so each point is at least a 24 px target. */
const tapSlopPx = 14;

export interface MapFocus {
  /** Changes each time the map should move, even to the same place. */
  readonly key: number;
  readonly lon: number;
  readonly lat: number;
}

export default function MapView({
  points,
  fitKey,
  selectedId,
  focus,
  onSelect,
}: {
  readonly points: Points;
  /** The map zooms to fit the points when this changes, for example a different trip. */
  readonly fitKey: string;
  readonly selectedId: EntryId | null;
  readonly focus: MapFocus | null;
  readonly onSelect: (id: EntryId | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // Event handlers read the latest props through this, so the map is made only once.
  const latest = useRef({ points, selectedId, onSelect });
  latest.current = { points, selectedId, onSelect };

  useEffect(() => {
    const element = container.current;
    if (!element) return;

    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container: element,
        style: mapStyleUrl(currentTheme() === 'dark'),
        ...initialView(latest.current.points.bounds),
        attributionControl: false,
        maxZoom: 18,
      });
    } catch {
      setProblem("The map can't be shown on this device.");
      return;
    }
    mapRef.current = map;
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    // Top left, so the entry card never covers the OpenStreetMap credit. It starts open and
    // folds into a button once the map is moved.
    map.addControl(new AttributionControl({ compact: true }), 'top-left');

    let styleLoaded = false;
    // Runs on the first load and after every style change, which removes added layers.
    map.on('style.load', () => {
      styleLoaded = true;
      setProblem(null);
      addEntryLayers(map, latest.current.points, latest.current.selectedId);
    });
    map.on('error', () => {
      // Missing tiles are expected offline; only a style that never loaded leaves a blank map.
      if (!styleLoaded) {
        setProblem(
          "The map couldn't load. It needs an internet connection to show an area for the first time.",
        );
      }
    });

    map.on('click', (event) => {
      const { x, y } = event.point;
      const hits = map.queryRenderedFeatures(
        [
          [x - tapSlopPx, y - tapSlopPx],
          [x + tapSlopPx, y + tapSlopPx],
        ],
        { layers: [layers.clusters, layers.points] },
      );
      const cluster = hits.find((hit) => hit.layer.id === layers.clusters);
      const point = hits.find((hit) => hit.layer.id === layers.points);
      if (point) {
        latest.current.onSelect(point.properties.id as EntryId);
      } else if (cluster && cluster.geometry.type === 'Point') {
        const center = cluster.geometry.coordinates as [number, number];
        void map
          .getSource<GeoJSONSource>(sourceId)
          ?.getClusterExpansionZoom(cluster.properties.cluster_id as number)
          .then((zoom) => map.easeTo({ center, zoom }));
      } else {
        latest.current.onSelect(null);
      }
    });

    const stopFollowingTheme = onThemeChange((theme) =>
      map.setStyle(mapStyleUrl(theme === 'dark'), { diff: false }),
    );

    return () => {
      stopFollowingTheme();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    mapRef.current?.getSource<GeoJSONSource>(sourceId)?.setData(points.collection);
  }, [points]);

  useEffect(() => {
    const map = mapRef.current;
    if (map?.getLayer(layers.selected)) map.setFilter(layers.selected, selectedFilter(selectedId));
  }, [selectedId]);

  // Zoom to fit when the filter changes. The first fit happens when the map is made.
  const firstFit = useRef(true);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refits only for a new filter, not for each new entry.
  useEffect(() => {
    if (firstFit.current) {
      firstFit.current = false;
      return;
    }
    const bounds = latest.current.points.bounds;
    if (bounds) mapRef.current?.fitBounds(bounds as LngLatBoundsLike, fitOptions);
  }, [fitKey]);

  useEffect(() => {
    if (!focus) return;
    const map = mapRef.current;
    map?.flyTo({ center: [focus.lon, focus.lat], zoom: Math.max(map.getZoom(), 16) });
  }, [focus]);

  return (
    <>
      {/* MapLibre makes its container position: relative, so it sits inside the filling box. */}
      <div className="absolute inset-0">
        <div ref={container} className="size-full" />
      </div>
      {problem && (
        <p
          role="alert"
          className="absolute inset-x-3 top-3 rounded-2xl bg-warning p-3 text-on-warning text-sm"
        >
          {problem}
        </p>
      )}
    </>
  );
}

const fitOptions = { padding: 56, maxZoom: 15 } as const;

function initialView(bounds: Points['bounds']) {
  if (bounds) return { bounds: bounds as LngLatBoundsLike, fitBoundsOptions: fitOptions };
  // Nothing logged yet: the whole world.
  return { center: [0, 20] as [number, number], zoom: 1 };
}

function selectedFilter(id: EntryId | null) {
  return ['==', ['get', 'id'], id ?? ''] as ['==', ['get', string], string];
}

/** The app's colour tokens, read from the stylesheet so the map matches light and dark mode. */
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
}

function addEntryLayers(map: MapLibreMap, points: Points, selectedId: EntryId | null) {
  if (map.getSource(sourceId)) return;
  const accent = token('accent');
  const onAccent = token('on-accent');
  const ink = token('ink');
  const raised = token('raised');

  map.addSource(sourceId, {
    type: 'geojson',
    data: points.collection,
    cluster: true,
    clusterRadius: 44,
    // Past this zoom every entry shows on its own, even ones logged a few metres apart.
    clusterMaxZoom: 15,
  });
  map.addLayer({
    id: layers.clusters,
    type: 'circle',
    source: sourceId,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': accent,
      'circle-radius': ['step', ['get', 'point_count'], 16, 10, 20, 50, 24],
      'circle-stroke-width': 3,
      'circle-stroke-color': raised,
    },
  });
  map.addLayer({
    id: layers.clusterCounts,
    type: 'symbol',
    source: sourceId,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-font': ['Noto Sans Bold'],
      'text-size': 13,
      'text-allow-overlap': true,
    },
    paint: { 'text-color': onAccent },
  });
  map.addLayer({
    id: layers.points,
    type: 'circle',
    source: sourceId,
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-color': accent,
      'circle-radius': 8,
      'circle-stroke-width': 3,
      'circle-stroke-color': raised,
    },
  });
  map.addLayer({
    id: layers.selected,
    type: 'circle',
    source: sourceId,
    filter: selectedFilter(selectedId),
    paint: {
      'circle-color': 'rgba(0, 0, 0, 0)',
      'circle-radius': 14,
      'circle-stroke-width': 3,
      'circle-stroke-color': ink,
    },
  });
}
