// Loaded only with a map, on the Map tab or a Day map: MapLibre is far larger than the rest of the app.
import type { GeoJSONSource, LngLatBoundsLike, Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import type { EntryId } from '../../db/schema.ts';
import { createMap, type MapStart, token, wholeWorld } from './mapSetup.ts';
import type { Points } from './points.ts';

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
  cooperativeGestures = false,
}: {
  readonly points: Points;
  /** The map zooms to fit the points when this changes, for example a different trip. */
  readonly fitKey: string;
  readonly selectedId: EntryId | null;
  readonly focus: MapFocus | null;
  readonly onSelect: (id: EntryId | null) => void;
  /** One finger scrolls the page and two move the map, for a map inside a scrolling list. */
  readonly cooperativeGestures?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // Event handlers read the latest props through this, so the map is made only once.
  const latest = useRef({ points, selectedId, onSelect });
  latest.current = { points, selectedId, onSelect };

  // biome-ignore lint/correctness/useExhaustiveDependencies: the map is made once; its gestures are fixed for its life.
  useEffect(() => {
    const element = container.current;
    if (!element) return;

    const made = createMap(element, initialView(latest.current.points.bounds), setProblem, {
      cooperativeGestures,
    });
    if (!made) return;
    const { map } = made;
    mapRef.current = map;
    // Runs on the first load and after every style change, which removes added layers.
    map.on('style.load', () =>
      addEntryLayers(map, latest.current.points, latest.current.selectedId),
    );

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

    return () => {
      made.remove();
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

function initialView(bounds: Points['bounds']): MapStart {
  if (bounds) return { bounds: bounds as LngLatBoundsLike, fitBoundsOptions: fitOptions };
  return wholeWorld;
}

function selectedFilter(id: EntryId | null) {
  return ['==', ['get', 'id'], id ?? ''] as ['==', ['get', string], string];
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
