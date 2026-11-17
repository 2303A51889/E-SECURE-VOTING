import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Vote, Wallet, Blocks, Users, Clock3, RefreshCw, PlusCircle, ExternalLink, AlertTriangle, CheckCircle2, Menu, X } from "lucide-react";
import { getWallet, getReadContract, getWriteContract, CONTRACT_ADDRESS } from "./services/contract.js";

const short = (value) => value ? `${value.slice(0, 6)}…${value.slice(-4)}` : "";
const date = (seconds) => new Date(Number(seconds) * 1000).toLocaleString();

export default function App() {
  const [account, setAccount] = useState("");
  const [network, setNetwork] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [elections, setElections] = useState([]);
  const [selected, setSelected] = useState("1");
  const [candidates, setCandidates] = useState([]);
  const [eligible, setEligible] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", start: "", end: "" });
  const [candidateName, setCandidateName] = useState("");
  const [voterAddress, setVoterAddress] = useState("");

  async function connect() {
    setError(""); setNotice("");
    try {
      const wallet = await getWallet();
      setAccount(wallet.address);
      const net = await wallet.provider.getNetwork();
      setNetwork(`${net.name} · chain ${net.chainId}`);
      await refresh(wallet.address);
    } catch (e) { setError(e.shortMessage || e.message || "Wallet connection failed."); }
  }

  async function refresh(address = account) {
    setError("");
    try {
      const contract = await getReadContract();
      const count = Number(await contract.electionCount());
      const rows = [];
      for (let i = 1; i <= count; i++) {
        const e = await contract.getElection(i);
        rows.push({ id: i, title: e.title, description: e.description, start: Number(e.startTime), end: Number(e.endTime), closed: e.closed, candidateCount: Number(e.candidateCount), totalVotes: Number(e.totalVotes) });
      }
      setElections(rows);
      const admin = await contract.administrator();
      setIsAdmin(Boolean(address && admin.toLowerCase() === address.toLowerCase()));
      if (address && selected) {
        setEligible(await contract.authorizedVoter(Number(selected), address).catch(() => false));
        setHasVoted(await contract.hasVoted(Number(selected), address).catch(() => false));
      }
    } catch (e) { setError(e.shortMessage || e.message || "Could not read contract. Check the network and deployed address."); }
  }

  async function loadCandidates(id = selected) {
    try {
      const contract = await getReadContract();
      const e = await contract.getElection(Number(id));
      const list = [];
      for (let i = 1; i <= Number(e.candidateCount); i++) {
        const c = await contract.getCandidate(Number(id), i);
        list.push({ id: i, name: c.name, votes: Number(c.voteCount) });
      }
      setCandidates(list);
      if (account) {
        setEligible(await contract.authorizedVoter(Number(id), account).catch(() => false));
        setHasVoted(await contract.hasVoted(Number(id), account).catch(() => false));
      }
    } catch { setCandidates([]); }
  }

  useEffect(() => {
    if (window.ethereum) {
      const onAccounts = (accounts) => { setAccount(accounts[0] || ""); if (accounts[0]) refresh(accounts[0]); };
      const onChain = () => window.location.reload();
      window.ethereum.on?.("accountsChanged", onAccounts);
      window.ethereum.on?.("chainChanged", onChain);
      return () => {
        window.ethereum.removeListener?.("accountsChanged", onAccounts);
        window.ethereum.removeListener?.("chainChanged", onChain);
      };
    }
  }, []);

  useEffect(() => { if (account) refresh(account); }, [account]);
  useEffect(() => { if (selected && account) loadCandidates(selected); }, [selected, account, elections.length]);

  const activeCount = elections.filter(e => Date.now() / 1000 >= e.start && Date.now() / 1000 <= e.end && !e.closed).length;
  const totalVotes = elections.reduce((sum, e) => sum + e.totalVotes, 0);
  const chosenElection = elections.find(e => e.id === Number(selected));
  const votingOpen = chosenElection && Date.now() / 1000 >= chosenElection.start && Date.now() / 1000 <= chosenElection.end && !chosenElection.closed;

  async function runTx(action, successText) {
    setBusy(true); setError(""); setNotice("");
    try {
      const tx = await action();
      setNotice(`Transaction submitted: ${tx.hash}. Waiting for confirmation…`);
      await tx.wait();
      setNotice(`${successText} Transaction confirmed: ${short(tx.hash)}`);
      await refresh();
      await loadCandidates();
    } catch (e) { setError(e.shortMessage || e.reason || e.message || "Transaction failed."); }
    finally { setBusy(false); }
  }

  async function createElection(event) {
    event.preventDefault();
    const start = Math.floor(new Date(form.start).getTime() / 1000);
    const end = Math.floor(new Date(form.end).getTime() / 1000);
    if (!form.title.trim() || !Number.isFinite(start) || !Number.isFinite(end)) return setError("Enter a title and valid start/end times.");
    if (start >= end || end <= Date.now() / 1000) return setError("Choose a valid future voting period.");
    await runTx(() => getWriteContract().then(c => c.createElection(form.title.trim(), form.description.trim(), start, end)), "Election created.");
    setForm({ title: "", description: "", start: "", end: "" });
  }

  async function addCandidate(event) {
    event.preventDefault();
    if (!candidateName.trim()) return setError("Enter a candidate name.");
    await runTx(() => getWriteContract().then(c => c.addCandidate(Number(selected), candidateName.trim())), "Candidate added.");
    setCandidateName("");
  }

  async function authorizeVoter(event) {
    event.preventDefault();
    if (!/^0x[a-fA-F0-9]{40}$/.test(voterAddress)) return setError("Enter a valid wallet address.");
    await runTx(() => getWriteContract().then(c => c.authorizeVoter(Number(selected), voterAddress)), "Voter authorized.");
    setVoterAddress("");
  }

  async function castVote(candidateId) {
    if (!account) return connect();
    if (!eligible) return setError("This wallet is not authorized for this election.");
    if (hasVoted) return setError("This wallet has already voted in this election.");
    if (!votingOpen) return setError("Voting is not currently open.");
    if (!window.confirm("Submit your vote? Confirm the transaction in MetaMask.")) return;
    await runTx(() => getWriteContract().then(c => c.vote(Number(selected), candidateId)), "Vote recorded.");
  }

  async function closeElection() {
    await runTx(() => getWriteContract().then(c => c.closeElection(Number(selected))), "Election closed.");
  }

  async function showResults() {
    try {
      const c = await getReadContract();
      const result = await c.getResults(Number(selected));
      setCandidates(result.names.map((name, i) => ({ id: i + 1, name, votes: Number(result.voteCounts[i]) })));
      setNotice("Results loaded from the smart contract.");
      setError("");
    } catch (e) { setError(e.shortMessage || e.reason || e.message || "Results are unavailable until the election ends."); }
  }

  const resultsAvailable = chosenElection && (chosenElection.closed || Date.now() / 1000 > chosenElection.end);

  return <div className="app-shell">
    <header className="topbar">
      <a href="#home" className="brand"><span className="brand-icon"><ShieldCheck size={22}/></span><span>Secure<span className="accent">Vote</span><small>BLOCKCHAIN E-VOTING</small></span></a>
      <button className="mobile-toggle" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Toggle navigation">{mobileMenu ? <X/> : <Menu/>}</button>
      <nav className={mobileMenu ? "nav-links open" : "nav-links"}>
        <a href="#dashboard" onClick={() => setMobileMenu(false)}>Dashboard</a>
        <a href="#elections" onClick={() => setMobileMenu(false)}>Elections</a>
        <a href="#admin" onClick={() => setMobileMenu(false)}>Admin</a>
        <a href="#about" onClick={() => setMobileMenu(false)}>About</a>
      </nav>
      <button className="wallet-btn" onClick={connect}><Wallet size={17}/>{account ? short(account) : "Connect Wallet"}</button>
    </header>

    <main>
      <section className="hero" id="home">
        <div className="hero-copy">
          <div className="eyebrow"><span className="pulse"></span> BLOCKCHAIN-POWERED VOTING</div>
          <h1>Your vote.<br/><span>Your voice.</span><br/>Verifiable by design.</h1>
          <p>A transparent educational voting prototype using smart contracts and blockchain transaction records.</p>
          <div className="hero-actions"><a className="primary-btn" href="#elections"><Vote size={18}/> Explore Elections</a><button className="secondary-btn" onClick={connect}><Wallet size={18}/> {account ? "Wallet Connected" : "Connect MetaMask"}</button></div>
          <div className="trust-note"><ShieldCheck size={16}/> Smart-contract validation · On-chain records</div>
        </div>
        <div className="hero-visual" aria-label="Illustration of a secure digital vote">
          <div className="orbit orbit-one"></div><div className="orbit orbit-two"></div>
          <div className="hero-glow"></div>
          <div className="vote-card"><div className="vote-card-head"><span className="mini-logo"><Vote size={20}/></span><span><b>Secure Ballot</b><small>Blockchain verified</small></span><span className="live-dot"></span></div>
            <div className="candidate-line"><span className="candidate-avatar">A</span><span><b>Candidate A</b><small>Candidate</small></span><span className="radio-dot"></span></div>
            <div className="candidate-line"><span className="candidate-avatar purple">B</span><span><b>Candidate B</b><small>Candidate</small></span><span className="radio-dot"></span></div>
            <div className="verified"><CheckCircle2 size={16}/> Votes recorded on-chain</div>
          </div>
          <div className="floating-block block-top"><Blocks size={18}/><span>Smart Contract<small>Rules enforced</small></span></div>
          <div className="floating-block block-bottom"><ShieldCheck size={18}/><span>Verifiable Records<small>Transaction history</small></span></div>
        </div>
      </section>

      {(error || notice) && <div className={error ? "notice error" : "notice success"}><span>{error ? <AlertTriangle size={18}/> : <CheckCircle2 size={18}/>}</span><div>{error || notice}</div><button onClick={() => {setError("");setNotice("");}} aria-label="Dismiss message"><X size={16}/></button></div>}

      <section className="stats-grid" id="dashboard">
        <Stat icon={<Blocks/>} label="Total Elections" value={elections.length}/>
        <Stat icon={<Vote/>} label="Active Elections" value={activeCount}/>
        <Stat icon={<Users/>} label="Votes Recorded" value={totalVotes}/>
        <Stat icon={<Wallet/>} label="Wallet Status" value={account ? "Connected" : "Not connected"}/>
      </section>

      <section className="section" id="elections">
        <div className="section-heading"><div><div className="eyebrow">PARTICIPATE</div><h2>Election Center</h2><p>Choose an election and review your voting eligibility.</p></div><button className="outline-btn" onClick={() => refresh()}><RefreshCw size={16}/> Refresh</button></div>
        {!elections.length ? <div className="empty-state"><div className="empty-icon"><Vote size={28}/></div><h3>No elections loaded</h3><p>Connect MetaMask and configure a deployed contract. An administrator can then create an election.</p><button className="primary-btn" onClick={connect}>Connect Wallet</button></div> :
          <div className="election-layout">
            <div className="election-list">{elections.map(e => <button key={e.id} className={`election-item ${Number(selected) === e.id ? "selected" : ""}`} onClick={() => setSelected(String(e.id))}>
              <div className="election-icon"><Vote size={20}/></div><div className="election-item-copy"><b>{e.title}</b><small>Election #{e.id}</small><span className={`status ${e.closed || Date.now()/1000 > e.end ? "ended" : Date.now()/1000 < e.start ? "upcoming" : "active"}`}>{e.closed || Date.now()/1000 > e.end ? "Ended" : Date.now()/1000 < e.start ? "Upcoming" : "Active"}</span></div>
            </button>)}</div>
            {chosenElection && <div className="election-detail"><div className="detail-top"><div><span className="tag">ELECTION #{chosenElection.id}</span><h3>{chosenElection.title}</h3><p>{chosenElection.description || "No description provided."}</p></div><div className="vote-count"><b>{chosenElection.totalVotes}</b><small>Recorded votes</small></div></div>
              <div className="time-grid"><div><Clock3 size={17}/><span><small>Voting starts</small><b>{date(chosenElection.start)}</b></span></div><div><Clock3 size={17}/><span><small>Voting ends</small><b>{date(chosenElection.end)}</b></span></div></div>
              <div className="candidate-heading"><h4>Candidates</h4><span>{candidates.length} listed</span></div>
              {candidates.length ? <div className="candidate-list">{candidates.map(c => <div className="candidate-row" key={c.id}><span className="candidate-avatar">{c.name.slice(0,1).toUpperCase()}</span><span className="candidate-name"><b>{c.name}</b><small>Candidate #{c.id}</small></span>{resultsAvailable && <span className="candidate-votes">{c.votes} votes</span>}{!resultsAvailable && <button className="vote-btn" disabled={busy || !votingOpen || !account || !eligible || hasVoted} onClick={() => castVote(c.id)}>{hasVoted ? "Already voted" : !account ? "Connect wallet" : !eligible ? "Not authorized" : !votingOpen ? "Voting closed" : "Vote"}</button>}</div>)}</div> : <p className="muted">No candidates registered yet.</p>}
              <div className="election-footer"><span>{account ? (eligible ? hasVoted ? "This wallet has voted." : "This wallet is authorized." : "This wallet is not authorized.") : "Connect a wallet to check eligibility."}</span>{resultsAvailable && <button className="outline-btn" onClick={showResults}>Load results</button>}</div>
            </div>}
          </div>}
      </section>

      {isAdmin && <section className="section admin-section" id="admin"><div className="section-heading"><div><div className="eyebrow">ADMINISTRATOR ACCESS</div><h2>Election Management</h2><p>Administrative actions are enforced by the smart contract.</p></div><span className="admin-pill"><ShieldCheck size={15}/> Admin wallet</span></div>
        <div className="admin-grid">
          <form className="panel" onSubmit={createElection}><h3><PlusCircle size={19}/> Create election</h3><label>Election title<input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Student Council Election" required/></label><label>Description<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Election details" rows="2"/></label><div className="form-two"><label>Start date/time<input type="datetime-local" value={form.start} onChange={e=>setForm({...form,start:e.target.value})} required/></label><label>End date/time<input type="datetime-local" value={form.end} onChange={e=>setForm({...form,end:e.target.value})} required/></label></div><button className="primary-btn full" disabled={busy}>{busy ? "Processing…" : "Create election"}</button></form>
          <div className="panel"><h3><Users size={19}/> Manage selected election</h3><label>Select election<select value={selected} onChange={e=>setSelected(e.target.value)}>{elections.map(e=><option key={e.id} value={e.id}>#{e.id} — {e.title}</option>)}</select></label>
            <form onSubmit={addCandidate}><label>Candidate name<input value={candidateName} onChange={e=>setCandidateName(e.target.value)} placeholder="Enter candidate name" required/></label><button className="outline-btn full" disabled={busy || !chosenElection}>Add candidate</button></form>
            <form onSubmit={authorizeVoter}><label>Authorize wallet address<input value={voterAddress} onChange={e=>setVoterAddress(e.target.value)} placeholder="0x..." required/></label><button className="outline-btn full" disabled={busy || !chosenElection}>Authorize voter</button></form>
            {chosenElection && Date.now()/1000 > chosenElection.end && !chosenElection.closed && <button className="danger-btn full" disabled={busy} onClick={closeElection}>Close election</button>}
          </div>
        </div>
      </section>}

      {!isAdmin && <section className="admin-locked" id="admin"><div className="lock-icon"><ShieldCheck size={23}/></div><div><h3>Administrator tools</h3><p>Connect the wallet that deployed the smart contract to manage elections.</p></div><button className="outline-btn" onClick={connect}>Connect wallet</button></section>}

      <section className="section about-section" id="about"><div className="section-heading"><div><div className="eyebrow">ABOUT THE PROJECT</div><h2>Built for transparent verification</h2><p>An academic prototype demonstrating blockchain-based voting controls.</p></div></div>
        <div className="feature-grid"><Feature icon={<ShieldCheck/>} title="Contract-enforced rules" text="Authorization, election timing, and one-vote-per-wallet checks are validated by the smart contract."/><Feature icon={<Blocks/>} title="On-chain records" text="Successful voting transactions can be checked against blockchain receipts and contract state."/><Feature icon={<Users/>} title="Eligibility controls" text="Administrators authorize wallet addresses for each election. This does not prove unique real-world identity."/></div>
        <div className="disclaimer"><AlertTriangle size={19}/><p><b>Academic demonstration only.</b> This prototype is not audited or suitable for official elections. Public blockchain transactions may expose candidate selections, and wallet addresses do not establish unique voter identities. Do not use real personal data or real elections.</p></div>
      </section>
    </main>
    <footer><a href="#home" className="brand"><span className="brand-icon"><ShieldCheck size={19}/></span><span>Secure<span className="accent">Vote</span><small>SR UNIVERSITY · CSE PROJECT</small></span></a><span>Blockchain Technology · Academic prototype</span><span className="contract-address">Contract: {CONTRACT_ADDRESS === "PASTE_DEPLOYED_CONTRACT_ADDRESS_HERE" ? "Not configured" : short(CONTRACT_ADDRESS)}</span></footer>
  </div>;
}

function Stat({icon,label,value}) { return <div className="stat-card"><div className="stat-icon">{icon}</div><div><small>{label}</small><b>{value}</b></div></div>; }
function Feature({icon,title,text}) { return <div className="feature-card"><div className="feature-icon">{icon}</div><h3>{title}</h3><p>{text}</p></div>; }
