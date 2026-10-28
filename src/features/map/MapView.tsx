// Loaded only with a map, on the Map tab or a Day map: MapLibre is far larger than the rest of the app.
import type { FeatureCollection } from 'geojson';
import type {
  ExpressionSpecification,
  GeoJSONSource,
  LngLatBoundsLike,
  Map as MapLibreMap,
} from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { TrailIcon } from '../../app/icons.tsx';
import type { EntryId } from '../../db/schema.ts';
import { createMap, type MapStart, token, wholeWorld } from './mapSetup.ts';
import type { Points } from './points.ts';
import type { Trail } from './trail.ts';

const sourceId = 'entries';
const trailSourceId = 'trail';
const layers = {
  trail: 'trail',
  clusters: 'entry-clusters',
  clusterCounts: 'entry-cluster-counts',
  points: 'entry-points',
  selected: 'entry-selected',
} as const;

/** How long the Trail takes to draw itself, however long it is. */
const trailDrawMs = 2000;

/** The Trail is one plain amber line with no edge, so the map stays clean. */
const trailWidth = 5;

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
  // Never saved: the Trail is off each time a map opens.
  const [trailOn, setTrailOn] = useState(false);
  // How much of the Trail is drawn, so a style change mid-draw brings it back as it was.
  const trailDrawn = useRef(1);
  // With nothing to join the button goes, so the Trail turns off and draws in afresh next time.
  if (trailOn && !points.trail) setTrailOn(false);

  // Event handlers read the latest props through this, so the map is made only once.
  const latest = useRef({ points, selectedId, onSelect, trailOn });
  latest.current = { points, selectedId, onSelect, trailOn };

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
    // A Trail that is on comes back whole, without drawing in again.
    map.on('style.load', () => {
      const { points, selectedId, trailOn } = latest.current;
      addEntryLayers(map, points, selectedId, trailOn ? points.trail : null, trailDrawn.current);
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

    return () => {
      made.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    map?.getSource<GeoJSONSource>(sourceId)?.setData(points.collection);
    // New entries change the Trail in place, without drawing it in again.
    if (latest.current.trailOn) setTrailData(map, points.trail);
  }, [points]);

  // Turning the Trail on draws it from the first pin to the last once, then no more frames run.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!trailOn) {
      setTrailData(map, null);
      return;
    }
    setTrailData(map, latest.current.points.trail);
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      trailDrawn.current = 1;
      setTrailDrawn(map, token('accent'), 1);
      return;
    }
    // The colour is read once per draw, and again when a theme switch might change it.
    let colour = token('accent');
    let frame = 0;
    let started = false;
    const step = (start: number, now: number) => {
      const drawn = Math.min((now - start) / trailDrawMs, 1);
      trailDrawn.current = drawn;
      setTrailDrawn(map, colour, drawn);
      if (drawn < 1) frame = requestAnimationFrame((next) => step(start, next));
    };
    const begin = () => {
      started = true;
      frame = requestAnimationFrame((now) => step(now, now));
    };
    // Runs after the map's own handler has added the layers back.
    const onStyleLoad = () => {
      colour = token('accent');
      if (!started) begin();
    };
    trailDrawn.current = 0;
    setTrailDrawn(map, colour, 0);
    // Before the style first loads there is no line yet, so the draw-in waits for it.
    if (map.getLayer(layers.trail)) begin();
    map.on('style.load', onStyleLoad);
    return () => {
      cancelAnimationFrame(frame);
      map.off('style.load', onStyleLoad);
    };
  }, [trailOn]);

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
      {points.trail && (
        // Below the zoom buttons, clear of the credit at the top left and the card at the bottom.
        <button
          type="button"
          aria-pressed={trailOn}
          onClick={() => setTrailOn((on) => !on)}
          className={`absolute top-20 right-2.5 flex min-h-11 items-center gap-1.5 rounded-full px-4 font-medium text-sm shadow-sm ring-1 ring-line ${
            trailOn ? 'bg-accent text-on-accent' : 'bg-raised text-ink'
          }`}
        >
          <TrailIcon className="size-5" />
          Trail
        </button>
      )}
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

const noTrail: FeatureCollection = { type: 'FeatureCollection', features: [] };

function setTrailData(map: MapLibreMap | null, trail: Trail | null) {
  map?.getSource<GeoJSONSource>(trailSourceId)?.setData(trail ?? noTrail);
}

/**
 * Shows the Trail from its start to this share of its length, by changing only its colour along
 * the line, so the data isn't sent again each frame.
 */
function setTrailDrawn(map: MapLibreMap, colour: string, drawn: number) {
  if (map.getLayer(layers.trail)) {
    map.setPaintProperty(layers.trail, 'line-gradient', trailGradient(colour, drawn));
  }
}

function trailGradient(colour: string, drawn: number): ExpressionSpecification {
  if (drawn >= 1) return ['interpolate', ['linear'], ['line-progress'], 0, colour, 1, colour];
  // Step stops must be above zero, so the very start shows from the first frame.
  return ['step', ['line-progress'], colour, Math.max(drawn, 1e-6), 'rgba(0, 0, 0, 0)'];
}

function addEntryLayers(
  map: MapLibreMap,
  points: Points,
  selectedId: EntryId | null,
  trail: Trail | null,
  trailDrawn: number,
) {
  if (map.getSource(sourceId)) return;
  const accent = token('accent');
  const onAccent = token('on-accent');
  const ink = token('ink');
  const raised = token('raised');

  // The Trail joins every entry where it really is, so it has its own unclustered source. Its
  // layer goes first, under the clusters and pins, so the pins stay easy to tap.
  map.addSource(trailSourceId, { type: 'geojson', data: trail ?? noTrail, lineMetrics: true });
  map.addLayer({
    id: layers.trail,
    type: 'line',
    source: trailSourceId,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-width': trailWidth, 'line-gradient': trailGradient(accent, trailDrawn) },
  });

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
