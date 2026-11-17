import { BrowserProvider, Contract } from "ethers";

// After deploying SecureEVoting, paste its address below.
// ABI is intentionally kept in this file for a beginner-friendly starter.
// The deployment script prints the contract address; ABI is generated at artifacts/contracts/SecureEVoting.sol/SecureEVoting.json.
export const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

export const ABI = [
  "function administrator() view returns (address)",
  "function electionCount() view returns (uint256)",
  "function createElection(string title,string description,uint64 startTime,uint64 endTime) returns (uint256)",
  "function addCandidate(uint256 electionId,string name)",
  "function authorizeVoter(uint256 electionId,address voter)",
  "function vote(uint256 electionId,uint256 candidateId)",
  "function closeElection(uint256 electionId)",
  "function getElection(uint256 electionId) view returns (string title,string description,uint64 startTime,uint64 endTime,bool closed,uint256 candidateCount,uint256 totalVotes)",
  "function getCandidate(uint256 electionId,uint256 candidateId) view returns (string name,uint256 voteCount)",
  "function getResults(uint256 electionId) view returns (string[] names,uint256[] voteCounts)",
  "function authorizedVoter(uint256 electionId,address voter) view returns (bool)",
  "function hasVoted(uint256 electionId,address voter) view returns (bool)",
  "event ElectionCreated(uint256 indexed electionId,string title,uint64 startTime,uint64 endTime)",
  "event CandidateAdded(uint256 indexed electionId,uint256 indexed candidateId,string name)",
  "event VoteCast(uint256 indexed electionId,address indexed voter,uint256 indexed candidateId)"
];

export async function getWallet() {
  if (!window.ethereum) throw new Error("MetaMask was not found. Install the MetaMask browser extension.");
  const provider = new BrowserProvider(window.ethereum);
  const accounts = await provider.send("eth_requestAccounts", []);
  if (!accounts.length) throw new Error("No wallet account selected.");
  return { provider, signer: await provider.getSigner(), address: accounts[0] };
}

export async function getReadContract() {
  if (!window.ethereum) throw new Error("Install MetaMask to connect to the blockchain.");
  if (CONTRACT_ADDRESS === "PASTE_DEPLOYED_CONTRACT_ADDRESS_HERE") {
    throw new Error("Deploy the contract locally and set CONTRACT_ADDRESS in frontend/src/services/contract.js first.");
  }
  const provider = new BrowserProvider(window.ethereum);
  return new Contract(CONTRACT_ADDRESS, ABI, provider);
}

export async function getWriteContract() {
  const { signer } = await getWallet();
  if (CONTRACT_ADDRESS === "PASTE_DEPLOYED_CONTRACT_ADDRESS_HERE") {
    throw new Error("Deploy the contract and configure CONTRACT_ADDRESS first.");
  }
  return new Contract(CONTRACT_ADDRESS, ABI, signer);
}
