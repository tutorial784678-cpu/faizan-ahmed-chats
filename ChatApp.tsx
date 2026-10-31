"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase, configured } from "@/lib/supabase";
import { AudioLines, Check, CheckCheck, ImagePlus, LogOut, MessageCircle, Mic, Paperclip, Search, Send, Shield, UserPlus, Users, X } from "lucide-react";

type Profile = {id:string; username:string; email:string; role:string};
type ChatMessage = {id:string; sender_id:string; body:string|null; media_url:string|null; media_type:string|null; created_at:string};
type Contact = Profile;

export default function ChatApp(){
  const [session,setSession]=useState<any>(null);
  const [profile,setProfile]=useState<Profile|null>(null);
  const [mode,setMode]=useState<"login"|"signup">("signup");
  const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [username,setUsername]=useState("");
  const [authError,setAuthError]=useState(""); const [busy,setBusy]=useState(false);
  const [contacts,setContacts]=useState<Contact[]>([]); const [active,setActive]=useState<Contact|null>(null);
  const [messages,setMessages]=useState<ChatMessage[]>([]); const [draft,setDraft]=useState("");
  const [search,setSearch]=useState(""); const [notice,setNotice]=useState("");
  const [adminOpen,setAdminOpen]=useState(false); const [recording,setRecording]=useState(false);
  const mediaRecorder=useRef<MediaRecorder|null>(null); const chunks=useRef<Blob[]>([]); const bottom=useRef<HTMLDivElement>(null);
  const [users,setUsers]=useState<Profile[]>([]);
  const filtered=useMemo(()=>contacts.filter(c=>c.username.toLowerCase().includes(search.toLowerCase())),[contacts,search]);

  useEffect(()=>{
    if(!supabase) return;
    supabase.auth.getSession().then(({data})=>setSession(data.session));
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));
    return ()=>subscription.unsubscribe();
  },[]);
  useEffect(()=>{ if(session?.user) loadProfile(); else {setProfile(null);setContacts([]);setActive(null);} },[session?.user?.id]);
  async function loadProfile(){
    if(!supabase||!session?.user) return;
    const {data,error}=await supabase.from("profiles").select("*").eq("id",session.user.id).single();
    if(error){setNotice("Profile setup is pending. Check that the database SQL has been installed.");return;}
    setProfile(data); await loadContacts();
  }
  async function loadContacts(){
    if(!supabase||!session?.user) return;
    const {data}=await supabase.from("profiles").select("id,username,email,role").neq("id",session.user.id).order("username");
    setContacts(data||[]);
  }
  useEffect(()=>{
    if(!supabase||!session?.user||!active) {setMessages([]);return;}
    let alive=true;
    async function load(){
      const {data,error}=await supabase!.rpc("get_or_create_dm",{other_user:active!.id});
      if(error){setNotice(error.message);return;}
      const conversationId=data as string;
      const {data:rows}=await supabase!.from("messages").select("*").eq("conversation_id",conversationId).order("created_at");
      if(alive)setMessages(rows||[]);
      const channel=supabase!.channel("messages-"+conversationId)
        .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:"conversation_id=eq."+conversationId},payload=>{
          setMessages(prev=>prev.some(m=>m.id===payload.new.id)?prev:[...prev,payload.new as ChatMessage]);
        }).subscribe();
      return ()=>supabase!.removeChannel(channel);
    }
    let cleanup:(()=>void)|undefined;
    load().then(c=>{cleanup=c;});
    return ()=>{alive=false;cleanup?.();};
  },[active?.id,session?.user?.id]);
  useEffect(()=>{bottom.current?.scrollIntoView({behavior:"smooth"});},[messages]);

  async function authenticate(e:React.FormEvent){
    e.preventDefault(); if(!supabase)return; setBusy(true);setAuthError("");
    if(mode==="signup"){
      const {error}=await supabase.auth.signUp({email,password,options:{data:{username}}});
      if(error)setAuthError(error.message); else setNotice("Account created. If email confirmation is enabled, verify your email then log in.");
    }else{
      const {error}=await supabase.auth.signInWithPassword({email,password});
      if(error)setAuthError(error.message);
    }
    setBusy(false);
  }
  async function sendMessage(body:string|null, file?:File){
    if(!supabase||!active||!session?.user)return;
    const {data:conversationId,error:convError}=await supabase.rpc("get_or_create_dm",{other_user:active.id});
    if(convError){setNotice(convError.message);return;}
    let media_url:string|null=null, media_type:string|null=null;
    if(file){
      const ext=file.name.split(".").pop()||"bin";
      const path=`${session.user.id}/${crypto.randomUUID()}.${ext}`;
      const {error}=await supabase.storage.from("chat-media").upload(path,file,{contentType:file.type,upsert:false});
      if(error){setNotice("Upload failed: "+error.message);return;}
      const {data}=supabase.storage.from("chat-media").getPublicUrl(path);
      media_url=data.publicUrl; media_type=file.type.startsWith("audio/")?"audio":file.type.startsWith("image/")?"image":"file";
    }
    const {error}=await supabase.from("messages").insert({conversation_id:conversationId,sender_id:session.user.id,body,media_url,media_type});
    if(error)setNotice(error.message); setDraft("");
  }
  async function upload(e:React.ChangeEvent<HTMLInputElement>){const f=e.target.files?.[0];if(f)await sendMessage(null,f);e.target.value="";}
  async function startRecording(){
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const recorder=new MediaRecorder(stream); mediaRecorder.current=recorder;chunks.current=[];
      recorder.ondataavailable=e=>{if(e.data.size)chunks.current.push(e.data);};
      recorder.onstop=async()=>{const blob=new Blob(chunks.current,{type:recorder.mimeType||"audio/webm"});const file=new File([blob],"voice-message.webm",{type:blob.type});await sendMessage(null,file);stream.getTracks().forEach(t=>t.stop());};
      recorder.start();setRecording(true);
    }catch{setNotice("Microphone permission is required to record a voice message.");}
  }
  function stopRecording(){mediaRecorder.current?.stop();setRecording(false);}
  async function openAdmin(){
    if(!supabase||profile?.role!=="admin")return;
    const {data,error}=await supabase.from("profiles").select("id,username,email,role").order("username");
    if(!error)setUsers(data||[]);setAdminOpen(true);
  }
  async function changeRole(id:string,role:string){
    if(!supabase)return;
    const {error}=await supabase.from("profiles").update({role}).eq("id",id);
    if(error)setNotice(error.message);else await openAdmin();
  }
  async function signOut(){await supabase?.auth.signOut();}

  if(!configured)return <main className="setup"><div className="setup-card"><img src="/logo.jpg"/><p className="eyebrow">REAL-TIME MESSAGING</p><h1>FAIZAN AHMED <span>CHATS</span></h1><p className="muted">Your glassmorphism chat app is ready for backend setup.</p><div className="setup-steps"><b>To activate the website</b><ol><li>Create a Supabase project.</li><li>Run <code>supabase/schema.sql</code> in SQL Editor.</li><li>Copy the project URL and publishable/anon key into Vercel environment variables.</li><li>Redeploy on Vercel.</li></ol></div><p className="muted small">See README.md for exact setup instructions. No passwords are embedded in this project.</p></div></main>;

  if(!session)return <main className="auth-shell"><div className="auth-card"><div className="brand"><img src="/logo.jpg"/><div><b>FAIZAN AHMED</b><span>CHATS</span></div></div><p className="eyebrow">YOUR PRIVATE SPACE</p><h1>{mode==="signup"?"Create your account":"Welcome back"}</h1><p className="muted">A calmer way to stay connected.</p><form onSubmit={authenticate}>
    {mode==="signup"&&<label>Username<input value={username} onChange={e=>setUsername(e.target.value)} required minLength={3} placeholder="Choose a username"/></label>}
    <label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="you@example.com"/></label>
    <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={8} placeholder="At least 8 characters"/></label>
    {authError&&<p className="error">{authError}</p>}<button className="primary" disabled={busy}>{busy?"Please wait…":mode==="signup"?"Create account":"Log in"}</button>
  </form><p className="switch">{mode==="signup"?"Already have an account?":"New here?"} <button onClick={()=>{setMode(mode==="signup"?"login":"signup");setAuthError("");}}>{mode==="signup"?"Log in":"Create account"}</button></p><p className="fine">Messages and shared media are stored by the service. Admin moderation access is disclosed in the site policy.</p></div></main>;

  return <main className="app-shell"><aside className="sidebar"><div className="side-brand"><img src="/logo.jpg"/><div><b>FAIZAN AHMED</b><span>CHATS</span></div><button className="icon-btn logout" title="Log out" onClick={signOut}><LogOut size={18}/></button></div><div className="me"><div className="avatar">{profile?.username?.[0]?.toUpperCase()||"U"}</div><div><b>{profile?.username||"Your account"}</b><small>Online</small></div><span className="online-dot"/></div><div className="search"><Search size={17}/><input placeholder="Find people…" value={search} onChange={e=>setSearch(e.target.value)}/></div><div className="list-head">PEOPLE <span>{filtered.length}</span></div><div className="contact-list">{filtered.map(c=><button className={"contact "+(active?.id===c.id?"selected":"")} key={c.id} onClick={()=>{setActive(c);setAdminOpen(false);}}><div className="avatar">{c.username[0]?.toUpperCase()}</div><div><b>{c.username}</b><small>Start a conversation</small></div><MessageCircle size={16}/></button>)}</div><div className="side-bottom">{profile?.role==="admin"&&<button className="admin-link" onClick={openAdmin}><Shield size={16}/> Admin dashboard</button>}<div className="secure-note"><span/> End-to-end encryption is not enabled. Avoid sharing highly sensitive information.</div></div></aside>
  <section className="chat-area">{adminOpen?<div className="admin-panel"><div className="panel-title"><div><p className="eyebrow">CONTROL CENTER</p><h2><Shield/> Admin dashboard</h2></div><button className="icon-btn" onClick={()=>setAdminOpen(false)}><X/></button></div><p className="muted">User management. Moderation access is disclosed to all users.</p><div className="user-table">{users.map(u=><div className="user-row" key={u.id}><div className="avatar">{u.username[0]?.toUpperCase()}</div><div><b>{u.username}</b><small>{u.email}</small></div><span className="role">{u.role}</span>{u.role==="admin"?<button className="outline" onClick={()=>changeRole(u.id,"user")}>Remove admin</button>:<button className="outline" onClick={()=>changeRole(u.id,"admin")}>Make admin</button>}</div>)}</div></div>:active?<><header className="chat-header"><div className="avatar">{active.username[0]?.toUpperCase()}</div><div><b>{active.username}</b><small><span className="online-dot"/> FAIZAN AHMED CHATS</small></div><span className="header-tag">PRIVATE CHAT</span></header><div className="messages">{messages.map(m=><div className={"bubble-wrap "+(m.sender_id===session.user.id?"mine":"")} key={m.id}><div className="bubble">{m.body&&<p>{m.body}</p>}{m.media_type==="image"&&m.media_url&&<a href={m.media_url} target="_blank"><img className="shared-image" src={m.media_url}/></a>}{m.media_type==="audio"&&m.media_url&&<audio controls src={m.media_url} />}{m.media_type==="file"&&m.media_url&&<a href={m.media_url} target="_blank">Open attachment</a>}<small>{new Date(m.created_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})} {m.sender_id===session.user.id&&<CheckCheck size={13}/>}</small></div></div>)}<div ref={bottom}/></div><form className="composer" onSubmit={e=>{e.preventDefault();if(draft.trim())sendMessage(draft.trim());}}><label className="attach icon-btn" title="Attach image or file"><Paperclip/><input type="file" accept="image/*,audio/*,.pdf" onChange={upload}/></label><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Write a message…" /><button type="button" className={"icon-btn "+(recording?"recording":"")} onClick={recording?stopRecording:startRecording} title={recording?"Stop recording":"Record voice message"}><Mic/></button><button className="send" disabled={!draft.trim()}><Send size={18}/></button></form></>:<div className="empty-state"><div className="orb"><MessageCircle size={44}/></div><h2>Your conversations start here</h2><p>Choose someone from the people list to send a private message.</p></div>}</section>
  {notice&&<div className="toast" onClick={()=>setNotice("")}>{notice}<button><X size={14}/></button></div>}</main>;
}
