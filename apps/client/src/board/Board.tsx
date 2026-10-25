import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
} from 'react';
import { Application } from 'pixi.js';
import { basic, zoneStyles } from '@open-boards/content';
import { fighterLabel } from '@open-boards/game';
import type { GameView } from '@open-boards/protocol';
import type { PresentationEvent } from '../animation/events';
import { ArenaScene } from './scene';
import { arenaSize, spaces } from './layout';
import type { Present } from '../presentation/sequence';
export interface BoardPlayback {
  present: Present;
}
interface Props {
  ref?: Ref<BoardPlayback>;
  game?: GameView;
  selected?: string;
  highlights?: string[];
  events?: PresentationEvent[];
  reset?: number;
  onNode?: (id: string) => void;
}
export function Board(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<ArenaScene | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  useImperativeHandle(
    props.ref,
    () => ({
      present: (event, active) =>
        scene.current?.present(event, active) ??
        new Promise<void>((resolve) => setTimeout(resolve, event.duration)),
    }),
    [],
  );
  useEffect(() => {
    let disposed = false;
    let resize: ResizeObserver | undefined;
    const app = new Application();
    void app
      .init({
        ...arenaSize,
        backgroundAlpha: 0,
        antialias: true,
        autoStart: false,
        preference: 'webgl',
        resolution: Math.min(devicePixelRatio || 1, 2),
        autoDensity: true,
      })
      .then(() => {
        if (disposed) {
          app.destroy(true);
          return;
        }
        host.current?.appendChild(app.canvas);
        const render = () => {
          if (!disposed && host.current?.clientWidth) app.render();
        };
        scene.current = new ArenaScene(app, render);
        resize = new ResizeObserver(([entry]) => {
          const { width, height } = entry.contentRect;
          if (!width || !height) return;
          app.renderer.resize(width, height);
          app.stage.scale.set(width / arenaSize.width, height / arenaSize.height);
          render();
        });
        resize.observe(host.current!);
        setReady(true);
      })
      .catch(() => setError('WebGL could not start. Use the labeled board controls to play.'));
    return () => {
      disposed = true;
      resize?.disconnect();
      if (scene.current) {
        scene.current.destroy();
        scene.current = null;
        app.destroy(true, { children: true });
      }
    };
  }, []);
  useEffect(() => {
    scene.current?.update(
      props.game,
      props.selected,
      props.highlights ?? [],
      props.events ?? [],
      props.reset ?? 0,
    );
  }, [ready, props.game, props.selected, props.highlights, props.events, props.reset]);
  return (
    <div
      className="arena"
      style={{ '--board-aspect': arenaSize.width / arenaSize.height } as CSSProperties}
      role="group"
      aria-label={`${basic.map.name}: ${basic.map.nodes.length} connected spaces, ${Object.keys(zoneStyles).length} colored zones and ${basic.map.portals?.length ?? 0} portals.`}
    >
      <div className="pixi-surface" ref={host} aria-hidden="true" />
      <div className="board-inputs">
        {(props.highlights ?? []).map((id) => (
          <button
            key={id}
            className="node-hit"
            style={{
              left: `${(spaces[id].x / arenaSize.width) * 100}%`,
              top: `${(spaces[id].y / arenaSize.height) * 100}%`,
            }}
            aria-label={
              props.game?.phase.type === 'placing-allies'
                ? `Place ally at ${spaces[id].label}`
                : props.game?.phase.type === 'choosing-movement'
                  ? `Move to ${spaces[id].label}`
                  : props.game?.phase.type === 'ability-choice'
                    ? `Choose space ${spaces[id].label}`
                    : `Target ${(() => {
                        const f = props.game?.fighters.find(
                          (f) => f.position === id && !f.defeated,
                        );
                        return f?.role === 'ally'
                          ? `${fighterLabel(f, basic)} (${props.game?.players.find((p) => p.id === f.player)?.name})`
                          : props.game?.players.find((p) => p.id === f?.player)?.name;
                      })()}`
            }
            aria-description={`Zones: ${basic.map.zones[id].map((zone) => zoneStyles[zone].name).join(', ')}${basic.map.portals?.includes(id) ? '. Portal: move to any other portal for one movement point.' : ''}`}
            title={`Space ${spaces[id].label}${basic.map.portals?.includes(id) ? ' · Portal' : ''}`}
            onClick={() => props.onNode?.(id)}
          />
        ))}
      </div>
      {error && (
        <p className="board-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
