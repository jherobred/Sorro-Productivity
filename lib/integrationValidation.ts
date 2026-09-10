export function validateIntegration(kind:string,config:Record<string,string>):string|null {
  if(kind==='canvas_lms'){
    if(!config.token?.trim())return 'Paste a Canvas access token from Account → Settings.';
    try{const url=new URL(config.base_url.trim());if(url.protocol!=='https:'||url.username||url.password)return 'Use your school’s HTTPS Canvas address.';if(url.pathname!=='/'&&url.pathname!=='')return 'Use your Canvas home address, without a course or settings path.';}catch{return 'Enter a full Canvas address, starting with https://.';}
  }else if(kind==='gcal_ics'){
    try{const url=new URL(config.ics_url.trim());if(url.protocol!=='https:'||url.hostname!=='calendar.google.com'||!url.pathname.endsWith('.ics'))return 'Paste the Secret address in iCal format, not the calendar’s browser or sharing link.';}catch{return 'Paste a full Google Calendar iCal address, starting with https://.';}
  }else return 'This connection is not supported.';
  return null;
}
