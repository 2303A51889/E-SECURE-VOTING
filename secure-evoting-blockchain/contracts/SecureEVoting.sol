// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Educational e-voting prototype. Not audited or suitable for real elections.
contract SecureEVoting {
    address public immutable administrator;
    uint256 public electionCount;

    struct Candidate {
        string name;
        uint256 voteCount;
    }

    struct Election {
        string title;
        string description;
        uint64 startTime;
        uint64 endTime;
        bool exists;
        bool closed;
        uint256 candidateCount;
        uint256 totalVotes;
    }

    mapping(uint256 => Election) private elections;
    mapping(uint256 => mapping(uint256 => Candidate)) private candidates;
    mapping(uint256 => mapping(address => bool)) public authorizedVoter;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    event ElectionCreated(uint256 indexed electionId, string title, uint64 startTime, uint64 endTime);
    event CandidateAdded(uint256 indexed electionId, uint256 indexed candidateId, string name);
    event VoterAuthorized(uint256 indexed electionId, address indexed voter);
    event VoteCast(uint256 indexed electionId, address indexed voter, uint256 indexed candidateId);
    event ElectionClosed(uint256 indexed electionId);

    modifier onlyAdmin() {
        require(msg.sender == administrator, "Only administrator");
        _;
    }

    modifier electionExists(uint256 electionId) {
        require(elections[electionId].exists, "Election does not exist");
        _;
    }

    constructor() {
        administrator = msg.sender;
    }

    function createElection(
        string calldata title,
        string calldata description,
        uint64 startTime,
        uint64 endTime
    ) external onlyAdmin returns (uint256 electionId) {
        require(bytes(title).length > 0, "Title required");
        require(startTime < endTime, "Invalid voting period");
        require(endTime > block.timestamp, "End time must be in future");

        electionId = ++electionCount;
        elections[electionId] = Election({
            title: title,
            description: description,
            startTime: startTime,
            endTime: endTime,
            exists: true,
            closed: false,
            candidateCount: 0,
            totalVotes: 0
        });
        emit ElectionCreated(electionId, title, startTime, endTime);
    }

    function addCandidate(uint256 electionId, string calldata name)
        external onlyAdmin electionExists(electionId)
    {
        require(!elections[electionId].closed, "Election closed");
        require(block.timestamp < elections[electionId].startTime, "Candidate registration closed");
        require(bytes(name).length > 0, "Candidate name required");

        uint256 candidateId = ++elections[electionId].candidateCount;
        candidates[electionId][candidateId] = Candidate(name, 0);
        emit CandidateAdded(electionId, candidateId, name);
    }

    function authorizeVoter(uint256 electionId, address voter)
        external onlyAdmin electionExists(electionId)
    {
        require(voter != address(0), "Invalid voter address");
        require(block.timestamp < elections[electionId].startTime, "Authorization closed");
        authorizedVoter[electionId][voter] = true;
        emit VoterAuthorized(electionId, voter);
    }

    function vote(uint256 electionId, uint256 candidateId)
        external electionExists(electionId)
    {
        Election storage election = elections[electionId];
        require(!election.closed, "Election closed");
        require(block.timestamp >= election.startTime, "Voting has not started");
        require(block.timestamp <= election.endTime, "Voting has ended");
        require(authorizedVoter[electionId][msg.sender], "Voter not authorized");
        require(!hasVoted[electionId][msg.sender], "Already voted");
        require(candidateId > 0 && candidateId <= election.candidateCount, "Invalid candidate");

        hasVoted[electionId][msg.sender] = true;
        candidates[electionId][candidateId].voteCount += 1;
        election.totalVotes += 1;
        emit VoteCast(electionId, msg.sender, candidateId);
    }

    function closeElection(uint256 electionId)
        external onlyAdmin electionExists(electionId)
    {
        require(block.timestamp > elections[electionId].endTime, "Voting period not ended");
        elections[electionId].closed = true;
        emit ElectionClosed(electionId);
    }

    function getElection(uint256 electionId)
        external view electionExists(electionId)
        returns (
            string memory title,
            string memory description,
            uint64 startTime,
            uint64 endTime,
            bool closed,
            uint256 candidateCount,
            uint256 totalVotes
        )
    {
        Election storage e = elections[electionId];
        return (e.title, e.description, e.startTime, e.endTime, e.closed, e.candidateCount, e.totalVotes);
    }

    function getCandidate(uint256 electionId, uint256 candidateId)
        external view electionExists(electionId)
        returns (string memory name, uint256 voteCount)
    {
        require(candidateId > 0 && candidateId <= elections[electionId].candidateCount, "Invalid candidate");
        Candidate storage c = candidates[electionId][candidateId];
        return (c.name, c.voteCount);
    }

    function getResults(uint256 electionId)
        external view electionExists(electionId)
        returns (string[] memory names, uint256[] memory voteCounts)
    {
        Election storage e = elections[electionId];
        require(e.closed || block.timestamp > e.endTime, "Results not available until election ends");
        names = new string[](e.candidateCount);
        voteCounts = new uint256[](e.candidateCount);
        for (uint256 i = 1; i <= e.candidateCount; i++) {
            names[i - 1] = candidates[electionId][i].name;
            voteCounts[i - 1] = candidates[electionId][i].voteCount;
        }
    }
}
