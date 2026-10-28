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
import { Terrain } from './Terrain';
import { MapScenery } from './MapScenery';
import { playerColors } from './figures';
import { CharacterPortrait } from '../characters/CharacterPortrait';
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
  interactiveFighters?: string[];
  fighterLabels?: Record<string, string>;
  targetFighters?: string[];
  onFighter?: (id: string) => void;
  interactiveTokens?: string[];
  onToken?: (id: string) => void;
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
        resolution: Math.min(devicePixelRatio || 1, 3),
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
          const scale = Math.min(width / arenaSize.width, height / arenaSize.height);
          app.stage.scale.set(scale);
          app.stage.position.set(
            (width - arenaSize.width * scale) / 2,
            (height - arenaSize.height * scale) / 2,
          );
          render();
        });
        resize.observe(host.current!);
        setReady(true);
      })
      .catch(() => setError('Map graphics unavailable. Use the numbered spaces to play.'));
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
    scene.current?.update(props.game, props.events ?? [], props.reset ?? 0);
  }, [ready, props.game, props.events, props.reset]);
  return (
    <div className="board-viewport" role="region" aria-label="Map">
      <div
        className={`arena ${!ready || error ? 'native-figures' : ''}`}
        style={{ '--board-aspect': arenaSize.width / arenaSize.height } as CSSProperties}
        role="group"
        aria-label={`${basic.map.name}: ${basic.map.nodes.length} connected spaces, ${Object.keys(zoneStyles).length} colored zones and ${basic.map.portals?.length ?? 0} portals.`}
      >
        <MapScenery id={basic.map.id} />
        <Terrain
          highlights={props.highlights}
          selected={
            props.game?.fighters.find((fighter) => fighter.id === props.selected)?.position ??
            undefined
          }
        />
        <div className="board-tokens" aria-label="Board tokens">
          {(props.game?.boardTokens ?? [])
            .filter((t) => t.position !== null)
            .map((token, index, tokens) => {
              const point = spaces[token.position!];
              const player = props.game!.players.findIndex(
                (p) => p.id === props.game!.fighters.find((f) => f.id === token.owner)?.player,
              );
              const interactive = props.interactiveTokens?.includes(token.id);
              const stacked = tokens
                .slice(0, index)
                .filter(
                  (t) =>
                    t.position === token.position &&
                    (!interactive || props.interactiveTokens?.includes(t.id)),
                ).length;
              const label = `${token.name} · ${props.game!.players[player]?.name} · Space ${point.label}`;
              const Token = interactive ? 'button' : 'span';
              return (
                <Token
                  key={token.id}
                  className={`board-token ${interactive ? 'token-choice' : ''}`}
                  role={interactive ? undefined : 'img'}
                  onClick={interactive ? () => props.onToken?.(token.id) : undefined}
                  aria-label={label}
                  title={label}
                  style={{
                    left: `${(point.x / arenaSize.width) * 100}%`,
                    top: `${(point.y / arenaSize.height) * 100}%`,
                    color: `#${playerColors[player].toString(16)}`,
                    marginLeft: `${interactive ? stacked * 46 * (point.x > arenaSize.width / 2 ? -1 : 1) : stacked * 8}px`,
                    marginTop: interactive
                      ? `${point.y > arenaSize.height / 2 ? -30 : 30}px`
                      : undefined,
                  }}
                >
                  <svg viewBox="0 0 90 60" aria-hidden="true">
                    <path
                      d="M5 38Q-3 22 15 20Q18 2 37 13Q51-5 66 17Q88 10 86 33Q99 52 72 53H24Q2 54 5 38Z"
                      fill="#293b41"
                      stroke="currentColor"
                      strokeWidth="3"
                    />
                    <path
                      d="M18 33Q33 22 48 31T76 29 M12 42Q29 35 43 42T78 40"
                      fill="none"
                      stroke="#cfdbd5"
                      strokeWidth="3"
                    />
                  </svg>
                  <b>{token.name.split(' ').at(-1)}</b>
                </Token>
              );
            })}
        </div>
        <div className="pixi-surface" ref={host} aria-hidden="true" />
        <div className="board-inputs">
          <div
            className="board-fighters"
            role={props.interactiveFighters?.length ? 'group' : undefined}
            aria-label={props.interactiveFighters?.length ? 'Your fighters' : undefined}
          >
            {(props.game?.fighters ?? [])
              .filter((f) => f.position !== null && !f.defeated)
              .map((fighter) => {
                const point = spaces[fighter.position!];
                const interactive = props.interactiveFighters?.includes(fighter.id);
                const target = props.targetFighters?.includes(fighter.id);
                const label = `${fighterLabel(fighter, basic)} (${props.game?.players.find((p) => p.id === fighter.player)?.name})`;
                const Figure = interactive ? 'button' : 'span';
                return (
                  <Figure
                    key={fighter.id}
                    className={`fighter-hit ${interactive ? 'is-interactive' : ''} ${target ? 'is-target' : ''}`}
                    aria-label={
                      props.fighterLabels?.[fighter.id] ??
                      (target ? `Target ${label}` : fighterLabel(fighter, basic))
                    }
                    role={interactive ? undefined : 'img'}
                    aria-pressed={interactive ? props.selected === fighter.id : undefined}
                    aria-description={
                      target
                        ? `Zones: ${basic.map.zones[fighter.position!].map((zone) => zoneStyles[zone].name).join(', ')}`
                        : props.game?.phase.type === 'choosing-movement' &&
                            props.selected === fighter.id
                          ? 'Click this fighter’s current space to stay.'
                          : 'Choose this fighter.'
                    }
                    title={
                      props.game?.phase.type === 'choosing-movement' &&
                      props.selected === fighter.id
                        ? `${label} · Stay here`
                        : label
                    }
                    data-fighter={fighter.id}
                    style={{
                      left: `${(point.x / arenaSize.width) * 100}%`,
                      top: `${(point.y / arenaSize.height) * 100}%`,
                    }}
                    onClick={interactive ? () => props.onFighter?.(fighter.id) : undefined}
                  >
                    <CharacterPortrait character={fighter.definition} />
                    <span className="fighter-label">{fighterLabel(fighter, basic)}</span>
                  </Figure>
                );
              })}
          </div>
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
                    : `Choose space ${spaces[id].label}`
              }
              aria-description={`Zones: ${basic.map.zones[id].map((zone) => zoneStyles[zone].name).join(', ')}${basic.map.portals?.includes(id) ? '. Portal (passage arrows below the space): move to any other unoccupied portal for one movement point.' : ''}`}
              title={`Space ${spaces[id].label}${basic.map.portals?.includes(id) ? ' · Portal (passage arrows) · One movement point to another unoccupied portal' : ''}`}
              onClick={(event) => {
                if (!event.detail) {
                  props.onNode?.(id);
                  return;
                }
                // Touch targets can overlap on a fitted phone map. Choose the nearest center.
                const bounds = event.currentTarget.parentElement!.getBoundingClientRect();
                const distance = (node: string) =>
                  Math.hypot(
                    event.clientX - bounds.left - (spaces[node].x / arenaSize.width) * bounds.width,
                    event.clientY -
                      bounds.top -
                      (spaces[node].y / arenaSize.height) * bounds.height,
                  );
                const nearest = (props.highlights ?? []).reduce(
                  (nearest, node) => (distance(node) < distance(nearest) ? node : nearest),
                  id,
                );
                props.onNode?.(nearest);
              }}
            />
          ))}
        </div>
      </div>
      {error && (
        <p className="board-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
