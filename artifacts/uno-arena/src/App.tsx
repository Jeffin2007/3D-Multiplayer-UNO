import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, useParams, Router as WouterRouter } from 'wouter';
import { ArrowDownToLine, ArrowLeftRight, ArrowRight, AudioLines, Check, Clipboard, Copy, Crown, DoorOpen, LoaderCircle, Music2, RotateCcw, Send, ShieldAlert, Sparkles, Volume2, VolumeX } from 'lucide-react';
import * as THREE from 'three';
import {
  getGetGameQueryKey, useCreateGame, useDrawCard, useGetGame, useJoinGame,
  useCallOutUno, useCallUno, usePlayCard, useStartGame,
} from '@workspace/api-client-react';
import type { GameCard, GameState, UnoColor } from '@workspace/api-client-react';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });
type RoomIdentity = { code: string; playerId: string };
type ActionReaction = { emoji: string; label: string; mood: 'sad' | 'tense' | 'playful' | 'wild'; key: string };
const STORAGE_KEY = 'uno-arena-room';
const readIdentity = (): RoomIdentity | null => {
  try { const value = localStorage.getItem(STORAGE_KEY); return value ? JSON.parse(value) as RoomIdentity : null; } catch { return null; }
};
const saveIdentity = (state: GameState) => localStorage.setItem(STORAGE_KEY, JSON.stringify({ code: state.code, playerId: state.youPlayerId }));
const errorText = (error: unknown) => {
  if (error instanceof Error) {
    try { const parsed = JSON.parse(error.message) as { message?: string; error?: string }; return parsed.message || parsed.error || error.message; } catch { return error.message; }
  }
  return 'Something interrupted the room connection. Try again in a moment.';
};
const colorNames: UnoColor[] = ['red', 'yellow', 'green', 'blue'];
const colorName = (value: string | null | undefined) => value ? value[0].toUpperCase() + value.slice(1) : 'Wild';
const cardFace = (card: GameCard) => card.kind === 'number' ? String(card.value ?? card.label) : ({ skip: '⊘', reverse: '↻', draw2: '+2', wild: 'W', wild4: '+4' }[card.kind] || card.label);
const cardColorClass = (card: GameCard) => card.color ? `card-${card.color}` : 'card-wild';

function Logo() {
  return <div className="brand" aria-label="UNO Arena"><span className="brand-mark">U</span><span>UNO <span style={{ color: '#e85f42' }}>ARENA</span></span></div>;
}

function LandingArt() {
  return <div className="landing-art" aria-hidden="true"><div className="art-sun" /><div className="art-ring" /><div className="art-card coral">7</div><div className="art-card teal">↻</div><div className="art-card gold">+2</div><div className="art-caption">Tonight's table is yours</div></div>;
}

function Home() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [issue, setIssue] = useState('');
  const createGame = useCreateGame();
  const joinGame = useJoinGame();
  const busy = createGame.isPending || joinGame.isPending;
  const saved = readIdentity();
  const enterRoom = (state: GameState) => {
    saveIdentity(state);
    setLocation(`/game/${state.code}`);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIssue('');
    if (name.trim().length < 1 || name.trim().length > 20) { setIssue('Choose a name between 1 and 20 characters.'); return; }
    if (mode === 'create') createGame.mutate({ data: { playerName: name.trim() } }, { onSuccess: enterRoom, onError: (e) => setIssue(errorText(e)) });
    else {
      const cleanCode = code.trim().toUpperCase();
      if (!cleanCode) { setIssue('Enter the room code your friend shared.'); return; }
      joinGame.mutate({ code: cleanCode, data: { playerName: name.trim() } }, { onSuccess: enterRoom, onError: (e) => setIssue(errorText(e)) });
    }
  };
  return <main className="arena">
    <header className="topbar"><Logo /><span className="eyebrow">A little friendly chaos</span></header>
    <section className="landing">
      <div>
        <div className="eyebrow">The table is open</div>
        <h1 className="hero-title">Good cards.<br />Better <span>company.</span></h1>
        <p className="hero-copy">A fast, bright little game night for your favorite people. Make a room, pass the code, and let the table decide.</p>
        <div style={{ display: 'flex', gap: 20, marginTop: 30, color: '#6c6258', fontSize: 13 }}>
          <span><strong style={{ color: '#244f49' }}>02–10</strong> players</span><span>One room code</span><span>Zero setup</span>
        </div>
      </div>
      <div>
        <LandingArt />
        <div className="form-panel">
          <div className="tab-row">
            <button className={`tab ${mode === 'create' ? 'active' : ''}`} onClick={() => { setMode('create'); setIssue(''); }} data-testid="button-tab-create">Start a room</button>
            <button className={`tab ${mode === 'join' ? 'active' : ''}`} onClick={() => { setMode('join'); setIssue(''); }} data-testid="button-tab-join">Join friends</button>
          </div>
          <form onSubmit={submit}>
            <label className="field-label" htmlFor="player-name">Your name</label>
            <input id="player-name" className="field" maxLength={20} placeholder="What should we call you?" value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" data-testid="input-player-name" />
            {mode === 'join' && <><label className="field-label" htmlFor="room-code">Room code</label><input id="room-code" className="field" maxLength={16} placeholder="e.g. K7M4Q2" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} style={{ fontFamily: 'var(--app-font-mono)', letterSpacing: '.18em', textTransform: 'uppercase' }} data-testid="input-room-code" /></>}
            {issue && <div className="error-box" role="alert" data-testid="status-home-error">{issue}</div>}
            <button type="submit" className="btn-primary wide" disabled={busy} data-testid="button-submit-room">{busy ? <><LoaderCircle size={17} className="animate-spin" /> Finding your table…</> : <>{mode === 'create' ? 'Deal me in' : 'Join the room'} <ArrowRight size={17} /></>}</button>
          </form>
          {saved && <button className="btn-quiet wide" style={{ marginTop: 12 }} onClick={() => setLocation(`/game/${saved.code}`)} data-testid="button-reconnect"><RotateCcw size={15} /> Rejoin your last table <span className="room-code">{saved.code}</span></button>}
          <div style={{ textAlign: 'center', marginTop: 17, color: '#938779', fontSize: 11 }}>A browser game for people in the same group chat.</div>
        </div>
      </div>
    </section>
  </main>;
}

function ThreeTable() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true }); } catch { return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 100);
    camera.position.set(0, 9, 13);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.AmbientLight(0xffe7c0, 2.4));
    const key = new THREE.DirectionalLight(0xfff4df, 2.2); key.position.set(-5, 8, 5); scene.add(key);
    const table = new THREE.Mesh(new THREE.CylinderGeometry(6.1, 6.3, .48, 72), new THREE.MeshStandardMaterial({ color: 0x256357, roughness: .76 }));
    table.position.y = -.25; scene.add(table);
    const edge = new THREE.Mesh(new THREE.TorusGeometry(6.06, .12, 14, 80), new THREE.MeshStandardMaterial({ color: 0xd6ad68, roughness: .5 }));
    edge.rotation.x = Math.PI / 2; edge.position.y = -.01; scene.add(edge);
    const cards: THREE.Mesh[] = [];
    const palette = [0xe65340, 0xd9ad2d, 0x31806e, 0x3d6f9b];
    for (let i = 0; i < 7; i++) {
      const material = new THREE.MeshStandardMaterial({ color: palette[i % 4], roughness: .38 });
      const card = new THREE.Mesh(new THREE.BoxGeometry(.8, .085, 1.2), material);
      card.position.set((i - 3) * .22, .13 + i * .025, (i % 2 ? .18 : -.18));
      card.rotation.y = (i - 3) * .08;
      card.rotation.z = (i - 3) * .035;
      scene.add(card); cards.push(card);
    }
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      renderer.setSize(rect.width, rect.height, false); camera.aspect = rect.width / rect.height; camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
    let frame = 0;
    let animation = 0;
    const render = () => { animation += .006; cards.forEach((card, i) => { card.position.y = .12 + i * .025 + Math.sin(animation + i * .65) * .018; }); renderer.render(scene, camera); frame = requestAnimationFrame(render); };
    render();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); scene.traverse((obj: THREE.Object3D) => { if (obj instanceof THREE.Mesh) { obj.geometry.dispose(); const materials = Array.isArray(obj.material) ? obj.material : [obj.material]; materials.forEach((material: THREE.Material) => material.dispose()); } }); renderer.dispose(); };
  }, []);
  return <canvas ref={canvasRef} className="scene-canvas" aria-hidden="true" />;
}

function CardFace({ card }: { card: GameCard }) {
  return <div className={`playing-card ${cardColorClass(card)}`} aria-label={`${colorName(card.color)} ${card.label}`}><span className="card-corner" aria-hidden="true">{card.label}</span><span className="card-symbol" aria-hidden="true">{cardFace(card)}</span></div>;
}

function MusicControls() {
  const [music, setMusic] = useState(false);
  const [sfx, setSfx] = useState(() => localStorage.getItem('uno-arena-sfx') !== 'off');
  const [volume, setVolume] = useState(22);
  const audioRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const intervalRef = useRef<number | null>(null);
  const ensureAudio = () => {
    if (!audioRef.current) audioRef.current = new AudioContext();
    if (audioRef.current.state === 'suspended') void audioRef.current.resume();
    return audioRef.current;
  };
  const toggleMusic = () => {
    if (music) {
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
      intervalRef.current = null;
      gainRef.current?.disconnect();
      gainRef.current = null;
      setMusic(false);
      return;
    }
    const context = ensureAudio();
    const master = context.createGain();
    master.gain.value = volume / 100;
    master.connect(context.destination);
    gainRef.current = master;
    const notes = [130.81, 164.81, 196, 164.81, 146.83, 174.61, 220, 174.61];
    let noteIndex = 0;
    const playNote = () => {
      if (context.state === 'closed') return;
      const startsAt = context.currentTime + 0.025;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = notes[noteIndex % notes.length];
      noteIndex += 1;
      envelope.gain.setValueAtTime(0.001, startsAt);
      envelope.gain.exponentialRampToValueAtTime(0.12, startsAt + 0.08);
      envelope.gain.exponentialRampToValueAtTime(0.001, startsAt + 0.86);
      oscillator.connect(envelope);
      envelope.connect(master);
      oscillator.start(startsAt);
      oscillator.stop(startsAt + 0.88);
    };
    playNote();
    intervalRef.current = window.setInterval(playNote, 900);
    setMusic(true);
  };
  useEffect(() => { if (gainRef.current) gainRef.current.gain.value = volume / 100; }, [volume]);
  useEffect(() => () => {
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    gainRef.current?.disconnect();
    void audioRef.current?.close();
  }, []);
  return <div className="sidebar-actions">
    <button className="tiny-control" title={music ? 'Pause ambient tone' : 'Play ambient tone'} onClick={toggleMusic} data-testid="button-toggle-music">{music ? <Music2 size={14} /> : <AudioLines size={14} />}{music ? 'Music on' : 'Sound'}</button>
    <label className="tiny-control" title="Ambient volume"><Volume2 size={14} /><input aria-label="Volume" type="range" min="0" max="70" value={volume} onChange={(e) => setVolume(Number(e.target.value))} style={{ width: 54, accentColor: '#e85f42' }} data-testid="input-volume" /></label>
    <button className="tiny-control" title="Toggle card sounds" onClick={() => { const next = !sfx; setSfx(next); localStorage.setItem('uno-arena-sfx', next ? 'on' : 'off'); }} data-testid="button-toggle-sfx">{sfx ? <Volume2 size={14} /> : <VolumeX size={14} />} <span className="sr-only">Card sounds {sfx ? 'on' : 'off'}</span></button>
  </div>;
}

function GameRoom() {
  const params = useParams<{ code: string }>();
  const roomCode = (params.code || '').toUpperCase();
  const [identity, setIdentity] = useState<RoomIdentity | null>(() => {
    const current = readIdentity(); return current?.code.toUpperCase() === roomCode ? current : null;
  });
  const [joinName, setJoinName] = useState('');
  const [roomError, setRoomError] = useState('');
  const [copyLabel, setCopyLabel] = useState('Copy code');
  const [pendingCard, setPendingCard] = useState<GameCard | null>(null);
  const [colorCard, setColorCard] = useState<GameCard | null>(null);
  const [declareUnoWithPendingCard, setDeclareUnoWithPendingCard] = useState(false);
  const [soundPulse, setSoundPulse] = useState(0);
  const [unoFlash, setUnoFlash] = useState(false);
  const [actionReaction, setActionReaction] = useState<ActionReaction | null>(null);
  const observedAction = useRef<string | null>(null);
  const sfxAudioRef = useRef<AudioContext | null>(null);
  const reactionTimerRef = useRef<number | null>(null);
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const playerId = identity?.playerId || '';
  const queryKey = getGetGameQueryKey(roomCode, playerId);
  const gameQuery = useGetGame(roomCode, playerId, { query: { enabled: Boolean(roomCode && playerId), refetchInterval: 1000, queryKey } });
  const join = useJoinGame();
  const start = useStartGame();
  const play = usePlayCard();
  const draw = useDrawCard();
  const callUnoAction = useCallUno();
  const callOutUnoAction = useCallOutUno();
  const state = gameQuery.data as GameState | undefined;
  const openingColorPending = Boolean(
    state?.status === 'playing' &&
    state.currentColor === null &&
    (state.topCard?.kind === 'wild' || state.topCard?.kind === 'wild4'),
  );
  const actionKey = state
    ? `${state.code}|${state.lastAction ?? ''}|${state.topCard?.id ?? ''}|${state.currentPlayerId ?? ''}|${state.drawPileCount}|${state.players.map((player) => player.handCount).join(',')}`
    : null;
  const primeSfxAudio = useCallback(() => {
    if (typeof window.AudioContext === 'undefined') return;
    let audio = sfxAudioRef.current;
    if (!audio || audio.state === 'closed') {
      audio = new window.AudioContext();
      sfxAudioRef.current = audio;
    }
    if (audio.state === 'suspended') void audio.resume().catch(() => undefined);
  }, []);

  const updateFromAction = useCallback((next: GameState) => {
    queryClient.setQueryData(getGetGameQueryKey(next.code, next.youPlayerId), next);
    saveIdentity(next);
    setIdentity({ code: next.code, playerId: next.youPlayerId });
    setRoomError('');
    setPendingCard(null); setColorCard(null);
    setDeclareUnoWithPendingCard(false);
  }, [queryClient]);
  useEffect(() => {
    if (
      openingColorPending &&
      state?.topCard &&
      state.currentPlayerId === state.youPlayerId
    ) {
      setDeclareUnoWithPendingCard(false);
      setColorCard(state.topCard);
    }
  }, [openingColorPending, state?.currentPlayerId, state?.topCard?.id, state?.youPlayerId]);
  useEffect(() => { if (state) saveIdentity(state); }, [state]);
  useEffect(() => {
    if (!state || !actionKey) return;
    const previous = observedAction.current;
    observedAction.current = actionKey;
    if (previous === null || previous === actionKey) return;
    setSoundPulse((n) => n + 1);
    const action = state.lastAction?.toLowerCase() ?? '';
    const falseUnoCall = action.includes('called uno incorrectly') || action.includes('incorrectly called uno');
    const falseCallout = action.includes('called out') && action.includes('incorrectly');
    if (action.includes('called uno') && !falseUnoCall) {
      setUnoFlash(true);
      window.setTimeout(() => setUnoFlash(false), 1900);
    }
    if (reactionTimerRef.current !== null) window.clearTimeout(reactionTimerRef.current);
    const reaction = falseUnoCall
      ? { emoji: '😅', label: 'FALSE UNO. DRAW 3.', mood: 'tense' as const }
      : falseCallout
        ? { emoji: '😵', label: 'BAD CALL. DRAW 3.', mood: 'tense' as const }
      : action.includes('called uno')
        ? { emoji: '🎉', label: 'UNO!', mood: 'playful' as const }
        : action.includes('caught ')
          ? { emoji: '👀', label: 'UNO CALLED OUT', mood: 'tense' as const }
          : action.includes('played +4')
      ? { emoji: '😭', label: 'FOUR CARDS. OOF.', mood: 'sad' as const }
      : action.includes('played +2')
        ? { emoji: '😬', label: 'TWO MORE CARDS', mood: 'tense' as const }
        : action.includes('skipped')
          ? { emoji: '😎', label: 'YOU’RE SKIPPED', mood: 'playful' as const }
          : action.includes('reversed')
            ? { emoji: '🔄', label: 'TURN REVERSED', mood: 'wild' as const }
            : action.includes('chose ')
              ? { emoji: '🌈', label: 'COLOR CHANGE', mood: 'wild' as const }
              : null;
    setActionReaction(reaction ? { ...reaction, key: actionKey } : null);
    if (reaction) {
      reactionTimerRef.current = window.setTimeout(() => {
        setActionReaction(null);
        reactionTimerRef.current = null;
      }, 1750);
    }
  }, [actionKey, state?.lastAction]);
  useEffect(() => {
    const action = state?.lastAction?.toLowerCase() ?? '';
    if (!soundPulse || !action || localStorage.getItem('uno-arena-sfx') === 'off') return;
    const falsePenaltyCall = action.includes('incorrectly') || action.includes('incorrect');
    const tones = falsePenaltyCall ? [233, 196, 155]
      : action.includes('called uno') ? [784, 988, 1318]
      : action.includes('played +4') ? [392, 311, 233]
      : action.includes('played +2') ? [523, 392]
      : action.includes('reversed') ? [698, 587]
      : action.includes('skipped') ? [622, 466]
      : action.includes('won!') ? [784, 988, 1174]
      : action.includes('drew') ? [392]
      : [523];
    let audio = sfxAudioRef.current;
    if (!audio || audio.state === 'closed') {
      audio = new window.AudioContext();
      sfxAudioRef.current = audio;
    }
    if (audio.state === 'suspended') void audio.resume().catch(() => undefined);
    const isDrawFour = action.includes('played +4');
    const noteSpacing = isDrawFour ? 0.12 : 0.045;
    const noteDuration = isDrawFour ? 0.29 : 0.15;
    const peakVolume = isDrawFour ? 0.021 : 0.027;
    tones.forEach((frequency, index) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      const startsAt = audio.currentTime + index * noteSpacing;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(frequency, startsAt);
      gain.gain.setValueAtTime(0.001, startsAt);
      gain.gain.exponentialRampToValueAtTime(peakVolume, startsAt + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.001, startsAt + noteDuration);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start(startsAt);
      osc.stop(startsAt + noteDuration + 0.01);
    });
  }, [soundPulse]);
  useEffect(() => () => {
    if (reactionTimerRef.current !== null) window.clearTimeout(reactionTimerRef.current);
    const audio = sfxAudioRef.current;
    if (audio && audio.state !== 'closed') void audio.close();
  }, []);
  const reportMutationError = (error: unknown) => setRoomError(errorText(error));
  const joinRoom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setRoomError('');
    if (!joinName.trim()) { setRoomError('Enter a name to take a seat.'); return; }
    join.mutate({ code: roomCode, data: { playerName: joinName.trim() } }, { onSuccess: (next) => updateFromAction(next), onError: reportMutationError });
  };
  const startGame = () => state && start.mutate({ code: roomCode, data: { playerId: state.youPlayerId } }, { onSuccess: updateFromAction, onError: reportMutationError });
  const playCard = (card: GameCard, chosenColor?: UnoColor, declareUno = false) => {
    if (!state) return;
    play.mutate(
      { code: roomCode, data: { playerId: state.youPlayerId, cardId: card.id, chosenColor, declareUno } },
      { onSuccess: updateFromAction, onError: reportMutationError },
    );
  };
  const handleCard = (card: GameCard) => {
    if (!state || state.currentPlayerId !== state.youPlayerId || play.isPending) return;
    if (openingColorPending) return;
    if (!isPlayable(card, state)) return;
    if (state.yourHand.length === 2) { setPendingCard(card); return; }
    setDeclareUnoWithPendingCard(false);
    if (card.kind === 'wild' || card.kind === 'wild4') setColorCard(card); else playCard(card);
  };
  const drawOne = () => state && draw.mutate({ code: roomCode, data: { playerId: state.youPlayerId } }, { onSuccess: updateFromAction, onError: reportMutationError });
  const callUno = () => state && callUnoAction.mutate({ code: roomCode, data: { playerId: state.youPlayerId } }, { onSuccess: updateFromAction, onError: reportMutationError });
  const callOutPlayer = (targetPlayerId: string) => state && callOutUnoAction.mutate(
    { code: roomCode, data: { playerId: state.youPlayerId, targetPlayerId } },
    { onSuccess: updateFromAction, onError: reportMutationError },
  );
  const copyCode = async () => {
    try { await navigator.clipboard.writeText(`${window.location.origin}/game/${roomCode}`); setCopyLabel('Link copied'); window.setTimeout(() => setCopyLabel('Copy code'), 1600); }
    catch { setCopyLabel(`Code: ${roomCode}`); }
  };

  if (!identity) return <main className="arena" onPointerDownCapture={primeSfxAudio}><header className="topbar"><Logo /><button className="btn-quiet" onClick={() => setLocation('/')} data-testid="button-home"><DoorOpen size={15} /> Back home</button></header>
    <section className="lobby-wrap" style={{ maxWidth: 600 }}><div className="eyebrow">You have an invite</div><h1 className="lobby-title">Take a seat.</h1><p style={{ color: '#746b61', lineHeight: 1.6 }}>Join room <strong className="room-code">{roomCode}</strong> with your name. Your player identity will stay saved on this device.</p>
      <form className="lobby-card" onSubmit={joinRoom}><label className="field-label" htmlFor="rejoin-name">Your name</label><input id="rejoin-name" className="field" maxLength={20} value={joinName} onChange={(e) => setJoinName(e.target.value)} placeholder="Name at the table" data-testid="input-rejoin-name" />{roomError && <div className="error-box" role="alert">{roomError}</div>}<button className="btn-primary wide" disabled={join.isPending} data-testid="button-join-room">{join.isPending ? 'Taking a seat…' : 'Join this room'} <ArrowRight size={16} /></button></form>
    </section></main>;

  if (gameQuery.isLoading && !state) return <main className="game-shell" onPointerDownCapture={primeSfxAudio}><header className="game-top"><Logo /><span className="connection">RECONNECTING TO {roomCode}</span></header><section className="lobby-wrap"><div className="skeleton" style={{ width: 150, height: 12 }} /><div className="skeleton" style={{ width: 350, maxWidth: '80%', height: 42, marginTop: 18 }} /><div className="lobby-grid" style={{ marginTop: 28 }}><div className="lobby-card"><div className="skeleton" style={{ width: '50%', marginBottom: 25 }} />{[1, 2, 3].map((n) => <div key={n} className="skeleton" style={{ height: 54, margin: '12px 0' }} />)}</div><div className="lobby-card"><div className="skeleton" style={{ height: 170 }} /></div></div></section></main>;

  if (gameQuery.isError && !state) return <main className="arena" onPointerDownCapture={primeSfxAudio}><header className="topbar"><Logo /><button className="btn-quiet" onClick={() => setLocation('/')}><DoorOpen size={15} /> Home</button></header><section className="lobby-wrap" style={{ maxWidth: 650 }}><div className="lobby-card"><ShieldAlert size={27} color="#c64f37" /><h1 className="lobby-title" style={{ fontSize: 42 }}>Couldn't reconnect.</h1><p style={{ color: '#73695f', lineHeight: 1.6 }}>{errorText(gameQuery.error)} Your saved room may have closed, or this player identity is no longer available.</p><button className="btn-primary" onClick={() => { void gameQuery.refetch(); setRoomError(''); }} data-testid="button-retry">Try reconnecting <RotateCcw size={15} /></button> <button className="btn-quiet" onClick={() => setIdentity(null)} data-testid="button-join-another">Join as a new player</button></div></section></main>;

  if (!state) return null;
  const isLobby = state.status === 'lobby';
  const isFinished = state.status === 'finished';
  const isYourTurn = state.currentPlayerId === state.youPlayerId;
  const canDraw = !isLobby && !isFinished && isYourTurn;
  const you = state.players.find((player) => player.id === state.youPlayerId);
  const winner = state.players.find((player) => player.id === state.winnerId);
  const mutationPending =
    start.isPending ||
    play.isPending ||
    draw.isPending ||
    callUnoAction.isPending ||
    callOutUnoAction.isPending;
  return <main className="game-shell" onPointerDownCapture={primeSfxAudio}>
    <header className="game-top"><Logo /><div className="room-code"><span>ROOM</span><strong style={{ color: '#253a37' }}>{roomCode}</strong><button className="tiny-control" onClick={copyCode} data-testid="button-copy-code">{copyLabel === 'Link copied' ? <Check size={14} /> : <Copy size={14} />}{copyLabel}</button></div><MusicControls /></header>
    {isLobby ? <section className="lobby-wrap">
      <div className="lobby-head"><div><div className="eyebrow">Waiting for the crew</div><h1 className="lobby-title">Room is warming up.</h1><p style={{ color: '#736a61', margin: '9px 0 0' }}>Share the invite. Start when at least two people are at the table.</p></div><button className="btn-secondary" onClick={copyCode} data-testid="button-share-room"><Send size={16} /> {copyLabel === 'Link copied' ? 'Invite copied' : 'Share invite'}</button></div>
      <div className="lobby-grid"><div className="lobby-card"><div className="rail-title"><strong>At the table</strong><span className="hand-pill">{state.players.length}/10 seats</span></div>{state.players.map((p) => <div className="lobby-player" key={p.id} data-testid={`player-lobby-${p.id}`}><div className="avatar">{p.name.slice(0, 1).toUpperCase()}</div><div style={{ flex: 1 }}><div className="player-name">{p.name}{p.isYou ? ' · You' : ''}</div><div className="player-sub">{p.isHost ? 'HOST' : 'READY'}</div></div>{p.isHost && <Crown size={16} color="#c9912f" />}</div>)}{state.players.length < 10 && <div className="lobby-player" style={{ opacity: .48 }}><div className="avatar" style={{ background: '#e6ded2', color: '#827568' }}>+</div><span className="player-sub">ROOM FOR {10 - state.players.length} MORE</span></div>}</div>
        <div className="lobby-card" style={{ background: '#244f49', color: '#fff4e3', position: 'relative', overflow: 'hidden' }}><div style={{ position: 'absolute', width: 200, height: 200, right: -70, bottom: -90, borderRadius: '50%', background: '#f1c95c', opacity: .15 }} /><div className="eyebrow" style={{ color: '#d7c28e' }}>Your room code</div><div style={{ font: '500 clamp(34px,5vw,54px) var(--app-font-mono)', letterSpacing: '.11em', margin: '18px 0' }}>{roomCode}</div><p style={{ color: '#d2dfd3', lineHeight: 1.6, fontSize: 14, maxWidth: 250 }}>Send the code or invite link to your friends. They'll appear here when they join.</p><button className="btn-primary" onClick={copyCode} data-testid="button-copy-invite"><Clipboard size={15} /> Copy room invite</button><div style={{ marginTop: 28, borderTop: '1px solid #ffffff2b', paddingTop: 18 }}><div className="eyebrow" style={{ color: '#d7c28e' }}>Your move</div><p style={{ margin: '8px 0', fontWeight: 600 }}>{state.canStart ? 'The table is ready.' : 'Waiting on one more player.'}</p>{state.players.find((p) => p.id === state.youPlayerId)?.isHost && <button className="btn-primary wide" style={{ marginTop: 10 }} disabled={!state.canStart || mutationPending} onClick={startGame} data-testid="button-start-game">{start.isPending ? 'Dealing the cards…' : <><Sparkles size={16} /> Start the game</>}</button>}</div></div>
      </div>{roomError && <div className="error-box" role="alert">{roomError}</div>}
    </section> : <><div className="game-body">
        <section className="table-stage"><ThreeTable /><div className={`turn-banner ${isYourTurn ? 'yours' : ''}`} data-testid="status-turn">{isFinished ? 'Round complete' : isYourTurn ? 'Your turn' : `${state.players.find((p) => p.id === state.currentPlayerId)?.name || 'A player'} is playing`}</div>
          {actionReaction && <div key={actionReaction.key} className={`action-reaction reaction-${actionReaction.mood}`} role="status" aria-live="polite" data-testid="status-action-reaction"><span className="reaction-emoji" aria-hidden="true">{actionReaction.emoji}</span><span className="reaction-copy">{actionReaction.label}</span></div>}
          <div className="playfield"><div className="table-center"><div className="pile"><div className="playing-card card-wild" style={{ transform: 'perspective(900px) rotateX(8deg) rotateY(-8deg) rotateZ(-8deg)', background: '#f1ddba', color: '#29594f', fontSize: 35, textShadow: 'none' }}><span className="card-corner" style={{ color: '#29594f' }}>PILE</span><span className="card-symbol"><ArrowDownToLine size={34} /></span></div><div className="pile-count">{state.drawPileCount} in deck</div></div><div className="pile">{state.topCard ? <CardFace key={state.topCard.id} card={state.topCard} /> : <div className="playing-card card-wild">?</div>}<div className="pile-count">Discard · {colorName(state.currentColor)}</div></div></div></div>
        {isFinished && <div className="winner-panel" data-testid="status-winner"><div><div className="eyebrow" style={{ color: '#e4c969' }}>A fine finish</div><h2>{winner?.id === state.youPlayerId ? 'You got it.' : `${winner?.name || 'Someone'} wins.`}</h2><p style={{ color: '#e8dfd0' }}>{winner?.id === state.youPlayerId ? 'The table is yours. The rematch is calling.' : 'Nicely played. Who is calling the rematch?'}</p><button className="btn-primary" onClick={() => setLocation('/')} data-testid="button-new-game"><RotateCcw size={16} /> New table</button></div></div>}
      </section>
      <aside className="players-rail"><div className="rail-title"><strong>At the table</strong><span className="hand-pill">{state.players.length} players</span></div>{state.players.map((p, index) => <div key={p.id} className={`player-row ${p.id === state.currentPlayerId ? 'current' : ''}`} data-testid={`player-status-${p.id}`}><div className="avatar" style={{ background: avatarColor(index) }}>{p.name.slice(0, 1).toUpperCase()}</div><div className="player-meta"><div className="player-name">{p.name}{p.isYou ? ' · You' : ''}</div><div className="player-sub">{p.id === state.currentPlayerId ? 'AT THE WHEEL' : p.isHost ? 'HOST' : 'IN THE ROUND'}</div></div><span className="hand-pill">{p.handCount} <span className="sr-only">cards</span></span>{!p.isYou && <button className="tiny-control" style={{ marginLeft: 6, padding: '4px 7px', fontSize: 10 }} disabled={mutationPending} title={`Call out ${p.name} for not saying UNO`} onClick={() => callOutPlayer(p.id)} data-testid={`button-callout-${p.id}`}>Call out</button>}</div>)}<div style={{ marginTop: 'auto', borderTop: '1px solid #e1d7ca', paddingTop: 15 }}><div className="eyebrow">Table signals</div><div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 11, fontSize: 12 }}><span>Direction</span><strong style={{ display: 'flex', gap: 6, alignItems: 'center' }}><ArrowLeftRight size={14} /> {state.direction === 'clockwise' ? 'Clockwise' : 'Counterclockwise'}</strong></div><div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12 }}><span>Color in play</span><strong><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 20, background: colorHex(state.currentColor) }} /> {colorName(state.currentColor)}</strong></div>{state.lastAction && <div style={{ color: '#85796d', marginTop: 12, fontSize: 11, lineHeight: 1.4 }} data-testid="text-last-action">{state.lastAction}</div>}</div></aside>
    </div>
        <footer className="game-footer"><div className="footer-tools"><div><div className="action-status" data-testid="status-action">{isFinished ? `Round won by ${winner?.name || 'a player'}` : isYourTurn ? 'Your turn.' : `${state.players.find((p) => p.id === state.currentPlayerId)?.name || 'Opponent'} has the turn.`}</div><div className="action-hint">{isYourTurn ? 'Play one matching card or draw one. Drawing ends your turn.' : 'Your cards are ready when the turn comes around.'}</div></div><div className="sidebar-actions">{!isFinished && <button className="btn-primary" disabled={mutationPending} onClick={callUno} data-testid="button-call-uno">{callUnoAction.isPending ? 'Calling…' : 'Call UNO!'}</button>}<button className="btn-secondary" disabled={!canDraw || mutationPending} onClick={drawOne} data-testid="button-draw-card">{draw.isPending ? <LoaderCircle size={15} className="animate-spin" /> : <ArrowDownToLine size={15} />}Draw one card</button></div></div>
        <div className="hand-row" aria-label="Your hand">{state.yourHand.map((card, index) => {
          const playable = !isLobby && !isFinished && isYourTurn && !openingColorPending && isPlayable(card, state) && !mutationPending;
          return <button key={card.id} className="hand-card" style={{ animationDelay: `${index * 35}ms` }} disabled={!playable} onClick={() => handleCard(card)} title={playable ? `Play ${card.label}` : card.label} data-testid={`button-card-${card.id}`}><CardFace card={card} /></button>;
        })}</div>
      </footer>
    </>}
    {roomError && <div className="error-box" role="alert" style={{ position: 'fixed', right: 18, bottom: 18, zIndex: 8, maxWidth: 370 }} data-testid="status-action-error">{roomError}<button className="tiny-control" style={{ marginLeft: 10 }} onClick={() => setRoomError('')} data-testid="button-dismiss-error">Dismiss</button></div>}
    {unoFlash && <div className="uno-announcement" role="status" aria-live="assertive" data-testid="status-uno-call"><div className="uno-emoji" aria-hidden="true">🎉</div><span>UNO!</span><small>One card. Game on.</small></div>}
    {pendingCard && <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby="uno-title"><div className="modal-card"><div className="eyebrow">One card left</div><h2 id="uno-title" style={{ fontSize: 34, letterSpacing: '-.06em', margin: '8px 0' }}>Call UNO or take the risk.</h2><p style={{ color: '#71685f', lineHeight: 1.55 }}>You can play without calling. If someone catches you before the next turn action, you draw three cards.</p><div style={{ display: 'flex', alignItems: 'center', gap: 15, margin: '20px 0' }}><CardFace card={pendingCard} /><strong>{pendingCard.label}</strong></div><div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}><button className="btn-primary" disabled={play.isPending} onClick={() => { if (pendingCard.kind === 'wild' || pendingCard.kind === 'wild4') { setDeclareUnoWithPendingCard(true); setColorCard(pendingCard); setPendingCard(null); } else playCard(pendingCard, undefined, true); }} data-testid="button-declare-uno">{play.isPending ? 'Playing…' : <>UNO — play it <ArrowRight size={16} /></>}</button><button className="btn-secondary" disabled={play.isPending} onClick={() => { if (pendingCard.kind === 'wild' || pendingCard.kind === 'wild4') { setDeclareUnoWithPendingCard(false); setColorCard(pendingCard); setPendingCard(null); } else playCard(pendingCard); }} data-testid="button-play-without-uno">Play without UNO</button><button className="btn-quiet" onClick={() => setPendingCard(null)} data-testid="button-cancel-uno">Cancel</button></div></div></div>}
    {colorCard && <div className="modal-scrim" role="dialog" aria-modal="true" aria-labelledby="color-title"><div className="modal-card"><div className="eyebrow">{openingColorPending ? 'Opening card' : 'A wild moment'}</div><h2 id="color-title" style={{ fontSize: 34, letterSpacing: '-.06em', margin: '8px 0' }}>{openingColorPending ? 'Choose the starting color.' : 'Name the next color.'}</h2><p style={{ color: '#71685f' }}>Choose where the table goes next.</p><div className="color-options">{colorNames.map((color) => <button key={color} className={`color-choice card-${color}`} aria-label={`Choose ${color}`} onClick={() => { const selectedCard = colorCard; const declaresUno = declareUnoWithPendingCard; setDeclareUnoWithPendingCard(false); playCard(selectedCard, color, declaresUno); }} data-testid={`button-color-${color}`} />)}</div>{!openingColorPending && <button className="btn-quiet" onClick={() => { setColorCard(null); setDeclareUnoWithPendingCard(false); }} data-testid="button-cancel-color">Go back</button>}</div></div>}
  </main>;
}

function avatarColor(index: number) { return ['#315f54', '#bd684d', '#7274a0', '#c09035', '#50798a', '#8b6556'][index % 6]; }
function colorHex(color: UnoColor | null) { return color ? ({ red: '#e65340', yellow: '#d9ad2d', green: '#31806e', blue: '#3d6f9b' }[color]) : '#d9ad2d'; }
function isPlayable(card: GameCard, state: GameState) {
  if (!state.topCard) return false;
  if (card.kind === 'wild' || card.kind === 'wild4') return true;
  return card.color === state.currentColor || (card.kind === state.topCard.kind && card.kind !== 'number') || (card.kind === 'number' && card.value === state.topCard.value);
}

function Router() {
  return <RoutedErrorBoundary><Switch><Route path="/" component={Home} /><Route path="/game/:code" component={GameRoom} /><Route component={NotFound} /></Switch></RoutedErrorBoundary>;
}
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
