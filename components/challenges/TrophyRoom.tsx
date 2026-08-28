'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../Icon';
import { usePrefs } from '@/lib/prefs';
import { rankOf } from '@/lib/rank';
import type { Challenge, Member } from '@/lib/challenges';

/**
 * The trophy room.
 *
 * Everything you have won, on a shelf. The medals are CSS — three rotated
 * discs, no download, drawn instantly — and that is the whole room until you
 * tap one.
 *
 * Tapping one loads three.js and lights an actual cup: metal, a real specular
 * highlight, turning slowly. This is the only place in the app that costs a
 * download, and it costs it **only when asked** (a dynamic `import()`, so the
 * bundle sits in its own chunk that nobody who never opens this screen ever
 * fetches). If the import fails — a flaky connection, a WebGL-less device —
 * the medal stays and says so. A brand image that breaks the app it is meant
 * to sell is not worth having.
 */

const PLACE_METAL: Record<number, { a: string; b: string; name: string }> = {
  1: { a: '#FFE9A8', b: '#B8891C', name: 'Gold' },
  2: { a: '#E4E9F2', b: '#8892A6', name: 'Silver' },
  3: { a: '#EDB58C', b: '#9A6338', name: 'Bronze' },
};

export type Won = { challenge: Challenge; place: number; rp: number };

export function TrophyRoom({ won, rp }: { won: Won[]; rp: number }) {
  const [open, setOpen] = useState<Won | null>(null);
  const rank = rankOf(rp);

  return (
    <div style={{
      background: 'var(--card)', borderRadius: 16, boxShadow: 'var(--sh)',
      border: '1px solid var(--line)', padding: '16px 16px 18px', position: 'relative', overflow: 'hidden',
    }}>
      {/* the wall behind the shelf is your tier */}
      <span aria-hidden style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `radial-gradient(120% 80% at 50% -20%, color-mix(in srgb, ${rank.tier.hue} 22%, transparent), transparent 65%)`,
      }} />

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
        <Icon name="trophy" size={15} color={rank.tier.hue} />
        <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '-.01em' }}>Trophy room</span>
        <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--tx3)' }}>
          {won.length ? `${won.length} finish${won.length === 1 ? '' : 'es'}` : 'nothing on the shelf yet'}
        </span>
      </div>

      {won.length === 0 ? (
        <p style={{ position: 'relative', fontSize: 11.5, color: 'var(--tx3)', lineHeight: 1.7, margin: 0 }}>
          Settle a challenge and what you placed shows up here, for the season.
        </p>
      ) : (
        <div className="hbar" style={{
          position: 'relative', display: 'flex', gap: 20, overflowX: 'auto', paddingBottom: 6, perspective: 800,
        }}>
          {won.map((w) => {
            const metal = PLACE_METAL[w.place] ?? { a: '#4A5268', b: '#2A3040', name: 'Finisher' };
            return (
              <button key={w.challenge.id} onClick={() => setOpen(w)} className="k-squish"
                title={`${w.challenge.name} — ${metal.name}`}
                style={{ flex: 'none', width: 84, textAlign: 'center' }}>
                <span style={{
                  display: 'grid', placeItems: 'center', width: 72, height: 72, margin: '0 auto',
                  borderRadius: '50%', transform: 'rotateY(-20deg) rotateX(8deg)',
                  background: `linear-gradient(150deg, ${metal.a}, ${metal.b})`,
                  fontSize: 21, fontWeight: 800, color: '#14131A',
                  boxShadow: '12px 9px 26px -12px rgba(0,0,0,.95), 0 0 0 3px rgba(255,255,255,.12) inset',
                }}>
                  {w.place}
                </span>
                <span style={{
                  display: 'block', marginTop: 8, fontSize: 10, color: 'var(--tx2)', lineHeight: 1.35,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {w.challenge.name}
                </span>
                <span style={{ display: 'block', fontSize: 9.5, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>
                  {w.rp > 0 ? `+${w.rp}` : w.rp} RP
                </span>
              </button>
            );
          })}
        </div>
      )}

      {open && <TrophyViewer won={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

/* ---------------------------------------------------------------- the cup */

function TrophyViewer({ won, onClose }: { won: Won; onClose: () => void }) {
  const { prefs } = usePrefs();
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const metal = PLACE_METAL[won.place] ?? { a: '#4A5268', b: '#2A3040', name: 'Finisher' };

  useEffect(() => {
    let stop = false;
    let dispose: (() => void) | undefined;

    // The one dynamic import in the app. Everything above this line renders
    // without it, which is the point.
    void (async () => {
      try {
        const THREE = await import('three');
        if (stop || !host.current) return;

        const el = host.current;
        const w = el.clientWidth || 320;
        const h = 260;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        renderer.setSize(w, h);
        el.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 100);
        camera.position.set(0, 1.1, 6.2);
        camera.lookAt(0, 0.6, 0);

        // A cup drawn as a profile revolved around its axis — a lathe is how a
        // real one is made, and it costs a dozen points instead of a model file.
        const profile: InstanceType<typeof THREE.Vector2>[] = [
          new THREE.Vector2(0.0, -1.55), new THREE.Vector2(0.95, -1.55), new THREE.Vector2(0.95, -1.42),
          new THREE.Vector2(0.34, -1.36), new THREE.Vector2(0.30, -0.72), new THREE.Vector2(0.24, -0.42),
          new THREE.Vector2(0.72, -0.18), new THREE.Vector2(1.04, 0.42), new THREE.Vector2(1.12, 1.18),
          new THREE.Vector2(1.02, 1.20), new THREE.Vector2(0.92, 0.46), new THREE.Vector2(0.60, -0.06),
          new THREE.Vector2(0.0, -0.20),
        ];
        const gold = new THREE.MeshStandardMaterial({
          color: new THREE.Color(metal.a), metalness: 0.96, roughness: 0.22,
          emissive: new THREE.Color(metal.b), emissiveIntensity: 0.12,
        });
        const cup = new THREE.Mesh(new THREE.LatheGeometry(profile, 96), gold);

        const handleGeo = new THREE.TorusGeometry(0.42, 0.075, 20, 60, Math.PI * 1.25);
        const left = new THREE.Mesh(handleGeo, gold);
        left.position.set(-1.0, 0.62, 0);
        left.rotation.z = -0.4;
        const right = left.clone();
        right.position.x = 1.0;
        right.rotation.z = Math.PI + 0.4;
        right.rotation.y = Math.PI;

        const stone = new THREE.MeshStandardMaterial({ color: 0x15182a, metalness: 0.3, roughness: 0.6 });
        const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.3, 0.3, 64), stone);
        plinth.position.y = -1.72;

        const rig = new THREE.Group();
        rig.add(cup, left, right, plinth);
        rig.position.y = 0.4;
        scene.add(rig);

        scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x0b0d14, 0.9));
        const key = new THREE.DirectionalLight(0xffffff, 2.6);
        key.position.set(3.2, 4.4, 4.0);
        const rim = new THREE.PointLight(new THREE.Color(prefs.accent), 26, 22);
        rim.position.set(-3.6, 1.4, -2.6);
        const fill = new THREE.PointLight(0xffe9c0, 12, 20);
        fill.position.set(2.4, -1.2, 3.2);
        scene.add(key, rim, fill);

        // Drag to turn it; it idles on its own unless motion is off.
        let spin = 0.5;
        let drag: number | null = null;
        const down = (e: PointerEvent) => { drag = e.clientX; };
        const move = (e: PointerEvent) => {
          if (drag === null) return;
          spin += (e.clientX - drag) * 0.01;
          drag = e.clientX;
        };
        const up = () => { drag = null; };
        renderer.domElement.style.touchAction = 'none';
        renderer.domElement.addEventListener('pointerdown', down);
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);

        let raf = 0;
        const tick = () => {
          if (drag === null && prefs.motion) spin += 0.0055;
          rig.rotation.y = spin;
          renderer.render(scene, camera);
          raf = requestAnimationFrame(tick);
        };
        tick();

        dispose = () => {
          cancelAnimationFrame(raf);
          renderer.domElement.removeEventListener('pointerdown', down);
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          renderer.dispose();
          handleGeo.dispose();
          cup.geometry.dispose();
          plinth.geometry.dispose();
          gold.dispose();
          stone.dispose();
          el.removeChild(renderer.domElement);
        };
      } catch {
        if (!stop) setFailed(true);
      }
    })();

    return () => { stop = true; dispose?.(); };
  }, [metal.a, metal.b, prefs.accent, prefs.motion]);

  const body = (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(4,4,8,.9)',
      display: 'grid', placeItems: 'center', padding: 18,
    }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${won.challenge.name} trophy`}
        className="k-bloom" style={{
          width: 380, maxWidth: '100%', background: 'var(--card)', border: '1px solid var(--line2)',
          borderRadius: 18, padding: 16, boxShadow: 'var(--shl)',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 800, flex: 1 }}>{won.challenge.name}</span>
          <button onClick={onClose} className="hov k-squish" aria-label="Close"
            style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center' }}>
            <Icon name="close" size={14} color="var(--tx2)" />
          </button>
        </div>

        {failed ? (
          <div style={{ display: 'grid', placeItems: 'center', height: 200, gap: 12 }}>
            <span style={{
              display: 'grid', placeItems: 'center', width: 92, height: 92, borderRadius: '50%',
              background: `linear-gradient(150deg, ${metal.a}, ${metal.b})`,
              fontSize: 30, fontWeight: 800, color: '#14131A',
            }}>
              {won.place}
            </span>
            <p style={{ fontSize: 11.5, color: 'var(--tx3)', margin: 0 }}>The lit version would not load — here it is flat.</p>
          </div>
        ) : (
          <div ref={host} style={{ height: 260, display: 'grid', placeItems: 'center' }} />
        )}

        <p style={{ fontSize: 11.5, color: 'var(--tx2)', margin: '4px 0 0', textAlign: 'center' }}>
          {metal.name} · {won.rp > 0 ? `+${won.rp}` : won.rp} RP
          <span style={{ color: 'var(--tx3)' }}> · drag to turn it</span>
        </p>
      </div>
    </div>
  );

  // `main` carries the font-scale zoom and the page-entry transform, so it is
  // the containing block for anything fixed inside it. Portal to the body or
  // this overlay is positioned against the page, not the viewport.
  return typeof document === 'undefined' ? null : createPortal(body, document.body);
}
