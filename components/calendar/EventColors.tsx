'use client';
import { Icon } from '@/components/Icon';

const COLORS = [
  ['Blue','#3165f5'],['Sky','#38bdf8'],['Cyan','#06b6d4'],['Teal','#14b8a6'],
  ['Green','#22c55e'],['Lime','#a3e635'],['Yellow','#f4d65d'],['Amber','#f59e0b'],
  ['Orange','#f97316'],['Red','#ef4444'],['Rose','#f43f5e'],['Pink','#ec4899'],
  ['Purple','#a855f7'],['Indigo','#6366f1'],['Brown','#a16207'],['Gray','#94a3b8'],
  ['Black','#171a1d'],['White','#ffffff'],
] as const;

export function EventColors({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return <div className="calendar-color-picker" role="group" aria-label="Event colors">
    {COLORS.map(([name, color]) => <button type="button" key={color} aria-label={name} title={name} aria-pressed={value.toLowerCase() === color} style={{background:color}} onClick={()=>onChange(color)}>
      {value.toLowerCase() === color && <Icon name="check" size={16} color={['White','Yellow','Lime','Sky','Gray'].includes(name)?'#171a1d':'#fff'}/>}
    </button>)}
    <label>Any color<input type="color" aria-label="Custom event color" value={/^#[\da-f]{6}$/i.test(value)?value:'#3165f5'} onInput={e=>onChange(e.currentTarget.value)} onChange={e=>onChange(e.target.value)}/></label>
  </div>;
}
