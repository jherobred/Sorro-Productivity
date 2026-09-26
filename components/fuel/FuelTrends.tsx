'use client';

import { useState } from 'react';
import { useMealHistory, sleepHours, type Day } from '@/lib/body';
import { ymd } from '@/lib/series';

export function FuelTrends({ days }: { days: Day[] }) {
  const [range, setRange] = useState<7 | 30>(7);
  const [opened, setOpened] = useState<string | null>(null);
  const meals = useMealHistory(30);
  const dates = Array.from({length:range},(_,i)=>{const d=new Date();d.setDate(d.getDate()-i);return ymd(d);});
  const rows = dates.map(date=>{
    const entries=(meals.data??[]).filter(m=>m.on_date===date);
    const body=days.find(d=>d.on_date===date);
    return {date,entries,body,kcal:entries.reduce((s,m)=>s+(m.kcal||0),0),protein:entries.reduce((s,m)=>s+(m.protein||0),0),sleep:body?sleepHours(body.sleep_from,body.sleep_to)??body.sleep_h:null};
  });
  const logged=rows.filter(r=>r.entries.length);
  const slept=rows.filter(r=>r.sleep!==null);
  const peak=Math.max(1,...rows.map(r=>r.kcal));
  return <section className="self-history" aria-labelledby="fuel-history-title">
    <header><div><h2 id="fuel-history-title">Your food & rest log</h2><p>Look back at what you recorded. Missing entries stay blank.</p></div><div className="self-views" role="group" aria-label="History range">{([7,30] as const).map(n=><button key={n} aria-pressed={range===n} onClick={()=>setRange(n)}>{n} days</button>)}</div></header>
    {!meals.isPending && !meals.isError && <dl className="self-readings"><div><dt>Days with meals logged</dt><dd>{logged.length} / {range}</dd></div><div><dt>Average per logged day</dt><dd>{logged.length?Math.round(logged.reduce((s,r)=>s+r.kcal,0)/logged.length).toLocaleString():'—'}<small> kcal</small></dd></div><div><dt>Average recorded sleep</dt><dd>{slept.length?(slept.reduce((s,r)=>s+(r.sleep??0),0)/slept.length).toFixed(1):'—'}<small> hours</small></dd></div></dl>}
    {meals.isPending?<p role="status">Loading your meal history…</p>:meals.isError?<p role="alert">Meal history could not load. <button className="studio-button" onClick={()=>void meals.refetch()}>Try again</button></p>:<div className="self-log-table"><table><caption>Select a date to see its meals. Energy and protein include only logged meals.</caption><thead><tr><th scope="col">Day</th><th scope="col">Energy</th><th scope="col">Protein</th><th scope="col">Sleep</th><th scope="col">Steps</th></tr></thead><tbody>{rows.map(r=><tr key={r.date}><th scope="row"><button aria-expanded={opened===r.date} onClick={()=>setOpened(opened===r.date?null:r.date)}>{new Date(r.date+'T12:00:00').toLocaleDateString([],{month:'short',day:'numeric'})}<small>{r.entries.length?r.entries.length+' meals':'No meals logged'}</small></button>{opened===r.date&&<ul className="self-meal-detail">{r.entries.map(m=><li key={m.id}>{m.name}<small>{m.kcal} kcal · {m.protein}g protein</small></li>)}{!r.entries.length&&<li>No meals recorded for this day.</li>}</ul>}</th><td><span>{r.entries.length?r.kcal.toLocaleString()+' kcal':'—'}</span>{!!r.entries.length&&<i className="self-log-bar" style={{width:Math.max(2,r.kcal/peak*100)+'%'}}/>}</td><td>{r.entries.length?r.protein+' g':'—'}</td><td>{r.sleep!==null?r.sleep+' h':'—'}</td><td>{r.body?.steps?r.body.steps.toLocaleString():'—'}</td></tr>)}</tbody></table></div>}
  </section>;
}
