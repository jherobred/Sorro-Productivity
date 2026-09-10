'use client';
import { Bar } from './Skeleton';
export function WorkspaceSkeleton({ kind = 'home' }: { kind?: string }) {
  if(kind==='notebooks')return <div className="notes-library" role="status" aria-label="Loading notes" aria-busy="true"><div className="notes-library-heading"><div style={{width:'60%'}}><Bar w="70%" h={32}/><Bar w="90%" h={14} style={{marginTop:12}}/></div><Bar w={110} h={42}/></div><div className="notes-modes">{Array.from({length:6},(_,i)=><div key={i} className="notes-mode"><Bar h={124}/><Bar w="65%" h={14} style={{margin:15}}/></div>)}</div><div className="notes-library-content">{[0,1].map(col=><section key={col}><Bar w="40%" h={20}/>{[0,1,2,3].map(i=><div className="workspace-skeleton-row" key={i}><Bar w={32} h={32}/><Bar w="70%" h={18}/></div>)}</section>)}</div></div>;
  return <div className={`workspace-skeleton workspace-skeleton-${kind}`} role="status" aria-label={`Loading ${kind === 'notebooks' ? 'notes' : kind}`} aria-busy="true"><span className="sronly">Loading your workspace</span><div className="workspace-skeleton-heading"><Bar w="42%" h={32} /><Bar w={110} h={40} /></div>
    {kind === 'calendar' ? <div className="workspace-skeleton-calendar">{Array.from({ length: 7 }, (_, i) => <div key={i}><Bar w="65%" h={18} /><Bar h={72 + i % 3 * 30} style={{ marginTop: 30 + i % 2 * 70 }} /></div>)}</div>
    : <div className="workspace-skeleton-columns">{[0, 1].map(col => <div key={col} className="workspace-skeleton-panel"><Bar w="38%" h={20} />{[0, 1, 2, 3].map(i => <div key={i} className="workspace-skeleton-row"><Bar w={32} h={32} /><span style={{ flex: 1 }}><Bar w={`${75 - i * 9}%`} h={14} /><Bar w="35%" h={10} style={{ marginTop: 10 }} /></span></div>)}</div>)}</div>}
  </div>;
}
export function NoteToolSkeleton({ kind }: { kind: 'write' | 'canvas' | 'graph' | 'journal' | 'code' }) {
  return <div className={`note-tool-skeleton note-tool-${kind}`} role="status" aria-busy="true" aria-label={`Loading ${kind}`}><div className="note-tool-skeleton-toolbar">{[80, 36, 36, 36, 110].map((w, i) => <Bar key={i} w={w} h={32} />)}</div>
    {kind === 'canvas' || kind === 'graph' ? <div className="note-tool-skeleton-board"><Bar w="24%" h={100} style={{ position: 'absolute', left: '12%', top: '20%' }} /><Bar w="24%" h={120} style={{ position: 'absolute', right: '16%', top: '45%' }} /><Bar w="18%" h={70} style={{ position: 'absolute', left: '25%', bottom: '12%' }} /></div>
    : <div className={`note-tool-skeleton-document ${kind === 'journal' ? 'two-leaves' : ''}`}>{Array.from({ length: kind === 'journal' ? 2 : 1 }, (_, col) => <div key={col}><Bar w="60%" h={28} style={{ marginBottom: 36 }} />{Array.from({ length: 9 }, (_, i) => <Bar key={i} w={`${i % 4 === 3 ? 60 : 92}%`} h={kind === 'code' ? 12 : 14} style={{ marginBottom: 18, marginLeft: kind === 'code' && i % 3 ? 20 : 0 }} />)}</div>)}</div>}
  </div>;
}
