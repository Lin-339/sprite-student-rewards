import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, Clock3, Gift, Menu, ShoppingBag, Sparkles, UserRound, X } from "lucide-react";
import "./styles.css";

const money = (n) => `${new Intl.NumberFormat("en-RW").format(n)} RWF`;

async function api(path, options = {}) {
  const token = localStorage.getItem("sprite_token");
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Something went wrong.");
  return data;
}

function useAuth() {
  const [user, setUser] = useState(null);
  useEffect(() => {
    if (!localStorage.getItem("sprite_token")) return;
    api("/api/me").then((r) => setUser(r.user)).catch(() => {
      localStorage.removeItem("sprite_token");
    });
  }, []);
  return { user, setUser };
}

function Layout({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const links = [
    ["/", "Home"], ["/shop", "Shop"], ["/rewards", "Rewards"],
    ["/invite", "Invite"], ["/dashboard", "Dashboard"]
  ];
  return (
    <div className="app">
      <header className="topbar">
        <Link className="brand" to="/" onClick={() => setOpen(false)}>
          <span className="brand-mark">S</span><span>SPRITE <b>STUDENT REWARDS</b></span>
        </Link>
        <button className="menu" onClick={() => setOpen(!open)}>{open ? <X/> : <Menu/>}</button>
        <nav className={open ? "nav open" : "nav"}>
          {links.map(([to, label]) => <NavLink key={to} to={to} end={to === "/"} onClick={() => setOpen(false)}>{label}</NavLink>)}
          {user ? <button className="nav-button" onClick={onLogout}>Log out</button> : <NavLink to="/login" onClick={() => setOpen(false)}>Log in</NavLink>}
        </nav>
      </header>
      <main>{user && <div className="session-strip">Signed in as <strong>{user.name}</strong> · {user.phone}</div>}<Routes>
        <Route path="/" element={<Home/>}/>
        <Route path="/shop" element={<Shop user={user}/>}/>
        <Route path="/checkout/:productId" element={<Checkout user={user}/>}/>
        <Route path="/rewards" element={<Rewards user={user}/>}/>
        <Route path="/invite" element={<Invite user={user}/>}/>
        <Route path="/dashboard" element={<Dashboard user={user}/>}/>
        <Route path="/login" element={<Login onLogin={setUserFromStorage(user)}/>}/>
        <Route path="/register" element={<Register/>}/>
      </Routes></main>
      <footer>SPRITE STUDENT REWARDS · BUILD FOR STUDENTS</footer>
    </div>
  );
}

function setUserFromStorage() {
  return () => window.location.reload();
}

function Home() {
  return <section className="hero shell">
    <div className="hero-copy">
      <span className="tag">STUDENT REWARDS · RWANDA</span>
      <h1>Refresh your day. <em>Unlock your reward.</em></h1>
      <p>Buy Sprite, confirm your payment, then watch your real 30-day reward countdown tick down to the second.</p>
      <div className="actions"><Link className="button" to="/shop">Explore products <ArrowRight/></Link><Link className="button secondary" to="/register">Create account</Link></div>
    </div>
    <div className="hero-card">
      <div className="hero-orb"><Sparkles/></div>
      <h3>30-DAY REWARD CLOCK</h3>
      <div className="hero-time">30 <small>DAYS</small></div>
      <p>The timer starts from the backend's confirmed payment time.</p>
    </div>
  </section>;
}

function Shop({ user }) {
  const [products, setProducts] = useState([]);
  useEffect(() => { api("/api/products").then(setProducts); }, []);
  return <section className="shell page">
    <span className="tag">THE SHOP</span><h1>Find your fresh fit.</h1><p className="lead">Choose a Sprite product. Your reward amount is calculated from the verified order.</p>
    <div className="cards">{products.map(p => <article className="card" key={p.id}>
      <img src={p.imageUrl} alt={p.name}/>
      <span className="badge">30-DAY REWARD</span><h2>{p.name}</h2><p>{p.description}</p>
      <div className="price-row"><span>Price</span><strong>{money(p.priceRwf)}</strong></div>
      <div className="reward-row"><span>Reward</span><strong>{money(p.rewardRwf)}</strong></div>
      <Link className="button full" to={user ? `/checkout/${p.id}` : "/login"}>Buy now <ArrowRight/></Link>
    </article>)}</div>
  </section>;
}

function Login() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault(); setError("");
    try { const r = await api("/api/auth/login", {method:"POST", body:JSON.stringify({phone,password})}); localStorage.setItem("sprite_token",r.token); navigate("/dashboard"); window.location.reload(); }
    catch (err) { setError(err.message); }
  }
  return <AuthForm title="Welcome back" submit={submit} error={error}><input placeholder="+250 78X XXX XXX" value={phone} onChange={e=>setPhone(e.target.value)} required/><input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} required/><button className="button full">Log in</button><p>New here? <Link to="/register">Create an account</Link></p></AuthForm>;
}

function Register() {
  const navigate = useNavigate();
  const [form,setForm]=useState({name:"",phone:"",password:"",referralCode:""}); const [error,setError]=useState("");
  async function submit(e) {
    e.preventDefault(); setError("");
    try { const r=await api("/api/auth/register",{method:"POST",body:JSON.stringify(form)}); localStorage.setItem("sprite_token",r.token); navigate("/dashboard"); window.location.reload(); }
    catch(err){setError(err.message);}
  }
  return <AuthForm title="Create your account" submit={submit} error={error}><input placeholder="Full name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/><input placeholder="+250 78X XXX XXX" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} required/><input type="password" placeholder="Password (8+ characters)" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} required/><input placeholder="Referral code (optional)" value={form.referralCode} onChange={e=>setForm({...form,referralCode:e.target.value})}/><button className="button full">Create account</button><p>Already registered? <Link to="/login">Log in</Link></p></AuthForm>;
}

function AuthForm({title,submit,error,children}) {
  return <section className="auth shell"><form className="form-card" onSubmit={submit}><span className="tag">SPRITE STUDENT REWARDS</span><h1>{title}</h1>{error&&<div className="error">{error}</div>}{children}</form></section>;
}

function Checkout({user}) {
  const {productId}=useParamsSafe(); const [product,setProduct]=useState(null); const [quantity,setQuantity]=useState(1); const [phone,setPhone]=useState(user?.phone||""); const [provider,setProvider]=useState("MTN_MOMO"); const [order,setOrder]=useState(null); const [error,setError]=useState("");
  useEffect(()=>{api("/api/products").then(ps=>setProduct(ps.find(p=>p.id===productId)));},[productId]);
  if(!user) return <section className="page shell"><h1>Please log in first.</h1><Link className="button" to="/login">Log in</Link></section>;
  async function createOrder(e){e.preventDefault();setError("");try{const r=await api("/api/orders",{method:"POST",body:JSON.stringify({productId,quantity:Number(quantity),phone,provider})});setOrder(r);}catch(err){setError(err.message);}}
  async function confirm(){try{await api(`/api/dev/payments/${order.orderId}/confirm`,{method:"POST"}); window.location.href="/rewards";}catch(err){setError(err.message);}}
  if(!product)return <section className="page shell"><p>Loading…</p></section>;
  return <section className="shell page"><span className="tag">SECURE CHECKOUT</span><h1>Confirm your order.</h1><div className="checkout-grid"><form className="form-card" onSubmit={createOrder}>
    <h2>{product.name}</h2><p>{product.description}</p><label>Quantity<input type="number" min="1" max="20" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
    <label>Phone number<input value={phone} onChange={e=>setPhone(e.target.value)} required/></label>
    <label>Payment provider<select value={provider} onChange={e=>setProvider(e.target.value)}><option value="MTN_MOMO">MTN Mobile Money</option><option value="AIRTEL_MONEY">Airtel Money</option></select></label>
    <div className="summary"><b>Total</b><strong>{money(product.priceRwf*quantity)}</strong><span>Reward after 30 days</span><strong>{money(product.rewardRwf*quantity)}</strong></div>
    {error&&<div className="error">{error}</div>}
    {!order ? <button className="button full">Create payment request <ArrowRight/></button> : <div className="success"><CheckCircle2/><b>Payment request created.</b><p>Development mode: confirm the simulated payment to start the server-controlled reward timer.</p><button type="button" className="button full" onClick={confirm}>Confirm payment</button></div>}
  </form></div></section>;
}

function useParamsSafe(){const m=window.location.pathname.match(/checkout\/([^/]+)/);return {productId:m?.[1]};}

function formatRemaining(ms) {
  const s=Math.max(0,Math.floor(ms/1000)); return {days:Math.floor(s/86400),hours:Math.floor(s%86400/3600),minutes:Math.floor(s%3600/60),seconds:s%60};
}

function Countdown({eligibleAt}) {
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id)},[]);
  const remaining=Math.max(0,new Date(eligibleAt).getTime()-now), t=formatRemaining(remaining);
  return <div className="countdown"><div><b>{String(t.days).padStart(2,"0")}</b><small>DAYS</small></div><span>:</span><div><b>{String(t.hours).padStart(2,"0")}</b><small>HOURS</small></div><span>:</span><div><b>{String(t.minutes).padStart(2,"0")}</b><small>MINUTES</small></div><span>:</span><div><b>{String(t.seconds).padStart(2,"0")}</b><small>SECONDS</small></div></div>;
}

function Rewards({user}) {
  const [rewards,setRewards]=useState([]); const [error,setError]=useState("");
  async function load(){try{setRewards(await api("/api/rewards"));}catch(err){setError(err.message)}}
  useEffect(()=>{if(user)load()},[user]);
  if(!user)return <section className="shell page"><h1>Your rewards are waiting.</h1><Link className="button" to="/login">Log in to view</Link></section>;
  return <section className="shell page"><span className="tag">YOUR REWARDS</span><h1>Watch your reward countdown.</h1><p className="lead">The countdown begins only after the backend confirms payment.</p>{error&&<div className="error">{error}</div>}
    {rewards.length===0?<div className="empty"><Gift/><h2>No rewards yet</h2><p>Make your first verified purchase to start a 30-day reward.</p><Link className="button" to="/shop">Shop now</Link></div>:
    <div className="reward-list">{rewards.map(r=><RewardCard key={r.id} reward={r} refresh={load}/>)}</div>}</section>;
}

function RewardCard({reward,refresh}) {
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id)},[]);
  const remaining=Math.max(0,new Date(reward.eligibleAt).getTime()-now); const ready=remaining===0 || reward.status==="CLAIMABLE";
  async function claim(){await api(`/api/rewards/${reward.id}/claim`,{method:"POST"});refresh();}
  return <article className="reward-card"><div className="reward-head"><div><span className="badge">REWARD</span><h2>{money(reward.amountRwf)}</h2><p>{reward.order.product.name} · {reward.order.quantity} unit(s)</p></div><Gift size={42}/></div>
    {!ready ? <><div className="clock-label"><Clock3/> Reward available in</div><Countdown eligibleAt={reward.eligibleAt}/><div className="progress"><span style={{width:`${Math.max(0,Math.min(100,100-(remaining/(30*24*60*60*1000))*100))}%`}}/></div><p className="muted">Eligibility: {new Date(reward.eligibleAt).toLocaleString()}</p></>:
    reward.status==="CLAIMED"?<div className="ready claimed"><CheckCircle2/> Reward claimed</div>:<div className="ready"><CheckCircle2/><div><b>Your reward is ready!</b><p>You have completed the 30-day waiting period.</p></div><button className="button" onClick={claim}>Claim reward</button></div>}
  </article>;
}

function Invite({user}) {
  if(!user)return <section className="shell page"><h1>Invite friends.</h1><Link className="button" to="/login">Log in</Link></section>;
  const link=`${window.location.origin}/register?ref=${encodeURIComponent(user.referralCode)}`;
  return <section className="shell page"><span className="tag">REFER A FRIEND</span><h1>Share your referral code.</h1><div className="invite-card"><Gift/><h2>{user.referralCode}</h2><p>Share this code when a friend creates an account.</p><button className="button" onClick={()=>navigator.clipboard.writeText(link)}>Copy referral link</button></div></section>;
}

function Dashboard({user}) {
  const [data,setData]=useState(null);
  useEffect(()=>{if(user)api("/api/dashboard").then(setData)},[user]);
  if(!user)return <section className="shell page"><h1>Your dashboard</h1><Link className="button" to="/login">Log in</Link></section>;
  return <section className="shell page"><span className="tag">DASHBOARD</span><h1>Welcome, {user.name}.</h1>{data&&<><div className="stats"><div><span>Total spent</span><b>{money(data.totalSpentRwf)}</b></div><div><span>Total rewards</span><b>{money(data.totalRewardsRwf)}</b></div><div><span>Waiting rewards</span><b>{data.waitingRewards}</b></div><div><span>Claimable</span><b>{data.claimableRewards}</b></div></div><h2 className="section-title">Purchase history</h2><div className="history">{data.orders.map(o=><div key={o.id}><span>{o.product.name} × {o.quantity}</span><b>{money(o.totalRwf)}</b><small>{o.status} · {new Date(o.createdAt).toLocaleString()}</small></div>)}</div></>}</section>;
}

function App(){
  const {user}=useAuth();
  function logout(){localStorage.removeItem("sprite_token");window.location.href="/";}
  return <Layout user={user} onLogout={logout}/>;
}

createRoot(document.getElementById("root")).render(<BrowserRouter><App/></BrowserRouter>);
