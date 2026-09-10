'use client';
import Link from 'next/link';
import { FeatureVisual } from '@/components/FeatureVisual';
import { Icon, type IconName } from '@/components/Icon';
import { Page } from '@/components/Page';
const GROUPS:{name:string;items:{id:string;name:string;desc:string;icon:IconName}[]}[]=[
 {name:'Plan & make progress',items:[{id:'projects',name:'Projects',desc:'Bring tasks, milestones, and ideas together.',icon:'proj'},{id:'habits',name:'Habits',desc:'Build routines and see your consistency.',icon:'habit'},{id:'money',name:'Money',desc:'Know where it goes. Plan what comes next.',icon:'money'}]},
 {name:'Think & keep',items:[{id:'notebooks/?focus=canvas',name:'Whiteboards',desc:'Sketch, connect, and move ideas freely.',icon:'grid'},{id:'notebooks/?focus=journal',name:'Journal',desc:'Keep a record of what mattered today.',icon:'pen'},{id:'files',name:'Files',desc:'A home for documents and attachments.',icon:'files'}]},
 {name:'Take care of yourself',items:[{id:'gym',name:'Gym',desc:'Plan workouts and track your sets.',icon:'heart'},{id:'fuel',name:'Fuel',desc:'Meals, water, sleep, and daily energy.',icon:'food'}]},
 {name:'Connect & share',items:[{id:'community',name:'Community',desc:'Questions, updates, messages, and challenges.',icon:'chat'},{id:'people',name:'People',desc:'Find your people and keep in touch.',icon:'people'},{id:'profile',name:'Your profile',desc:'Your identity, activity, and shared work.',icon:'focus'}]},
];
export default function MorePage(){return <Page name="A little more possibility." meta="Your essentials are always close. Explore the rest when you need it." actions={<button className="studio-button" onClick={()=>window.dispatchEvent(new CustomEvent('basedly:settings',{detail:'integrations'}))}><Icon name="plug" size={17}/>Connections</button>}><div className="explore-layout explore-visual-layout">{GROUPS.map(g=><section className="explore-group" key={g.name}><h2>{g.name}</h2>{g.items.map(i=><Link className="explore-link" key={i.id} href={`/${i.id}${i.id.includes('?')?'':'/'}`}><div className={`explore-art visual-tile-art visual-${i.id.split('/')[0]}`}><FeatureVisual kind={i.id.includes('canvas')?'canvas':i.id.includes('journal')?'journal':i.id}/></div><span><strong>{i.name}</strong><small>{i.desc}</small></span></Link>)}</section>)}</div></Page>;}
