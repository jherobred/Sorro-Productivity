'use client';
import { useEffect,useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { CircleBuddy } from '@/components/CircleBuddy';
import { Icon,type IconName } from '@/components/Icon';
const STARTS:{path:string;name:string;desc:string;icon:IconName}[]=[{path:'/calendar/',name:'Plan my day',desc:'Make room for classes, work, and yourself.',icon:'cal'},{path:'/tasks/',name:'Get something done',desc:'Start with one small, clear next step.',icon:'task'},{path:'/notebooks/',name:'Get an idea down',desc:'Write, sketch, connect, journal, or code.',icon:'book'}];
export default function Onboarding(){
 const router=useRouter();const [name,setName]=useState('');const [path,setPath]=useState('/home/');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 useEffect(()=>{void supabase.auth.getSession().then(({data})=>{const u=data.session?.user;setName(u?.user_metadata?.full_name||u?.user_metadata?.name||u?.email?.split('@')[0]||'');});},[]);
 async function finish(){setBusy(true);setError('');try{const {error}=await supabase.rpc('bd_complete_onboarding',{p_name:name.trim()||'Student',p_handle:'',p_course:'',p_year:'',p_timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,p_interests:[]});if(error)throw error;router.replace(path);}catch(e){setError(e instanceof Error?e.message:'Could not create your workspace. Please try again.');setBusy(false);}}
 return <main className="studio-onboarding"><div className="studio-welcome"><CircleBuddy size={96} happy/><h1>A little space.<br/>For a lot of you.</h1><p>I’m your little study buddy. Let’s start with what you need today. You can explore everything else in your own time.</p><div className="studio-welcome-options">{STARTS.map(s=><button key={s.path} className="studio-welcome-option" onClick={()=>setPath(s.path)} aria-pressed={path===s.path}><Icon name={s.icon} size={24} color="var(--studio-blue)"/><span><strong>{s.name}</strong><small>{s.desc}</small></span><span className="today-check" style={{flex:'none'}}>{path===s.path&&<Icon name="check" size={15}/>}</span></button>)}</div>{error&&<p role="alert">{error}</p>}<div className="studio-welcome-footer"><button className="studio-button primary" disabled={busy} onClick={()=>void finish()}>{busy?'Creating your space…':path==='/home/'?'Let’s begin':'Open my workspace'}<Icon name="chev" size={17}/></button></div><p className="studio-welcome-note">No tour to sit through. Your buddy is here whenever you need a hand.</p></div></main>;
}
