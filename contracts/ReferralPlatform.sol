// main/contracts/CommunityPlatform.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * CommunityPlatform (Unified)
 * - Registration (USDT fee) + 3-level commission (40/20/10), remainder -> admin (owner) commission
 * - Fund-code protected user withdrawal (commission balance)
 * - Admin commission withdrawal (owner only)
 * - Mining (on-chain): only records purchase and holds USDT as vault
 *   - Off-chain will calculate points; on-chain keeps only per-user minerCount and total deposited
 * - Liquidity withdrawal (owner): withdraw USDT collected via miner purchases (vault)
 * - Root (owner) auto-registered on deploy with given userId + fund-code hash
 */
contract CommunityPlatform is ReentrancyGuard, Ownable {
    // ---------- Config ----------
    IERC20 public immutable usdtToken;
    uint256 public immutable registrationFee;   // e.g., 12e18
    uint256 public immutable minMinerPurchase;  // e.g., 5e18
    uint16  public constant MINING_DURATION_DAYS = 30;

    // ---------- Users / Referral ----------
    mapping(address => bool) public isRegistered;
    mapping(string => address) public userIdToAddress;
    mapping(address => string) public addressToUserId;
    mapping(address => address) public referrerOf;

    // Commission balances (USDT)
    mapping(address => uint256) public userBalances;     // user commissions (withdraw via fund code)
    mapping(address => uint256) public adminCommissions; // owner commissions

    // Fund code hashes
    mapping(address => bytes32) private userFundCodeHashes;

    // Admin view (owner is the only admin; no add/remove)
    mapping(address => bool) public admins;

    // ---------- Mining (vault + counters only) ----------
    // Per-user miner purchase count and total USDT deposited via miners
    mapping(address => uint256) public minerCount;
    mapping(address => uint256) public totalMinerDeposited;

    // Total USDT collected via miner purchases
    uint256 public totalCollected;

    // ---------- Events ----------
    event UserRegistered(address indexed user, string userId, address indexed referrer);
    event FundCodeHashSet(address indexed user);
    event Withdrawal(address indexed user, uint256 amount);
    event CommissionWithdrawn(address indexed admin, uint256 amount);

    // Mining purchase recorded (off-chain will calculate points)
    event MinerPurchased(
        address indexed user,
        uint256 amount,      // raw units (USDT smallest units)
        uint256 startTime,   // block timestamp
        uint256 endTime      // startTime + 30 days
    );

    // Liquidity withdrawal (owner)
    event LiquidityWithdrawn(address indexed to, uint256 amount);

    // ---------- Constructor ----------
    constructor(
        address _usdtToken,
        uint256 _registrationFee,
        string memory _rootUserId,
        bytes32 _rootUserFundCodeHash,
        uint256 _minMinerPurchase
    ) Ownable(msg.sender) {
        require(_usdtToken != address(0), "USDT address required");
        require(_registrationFee > 0, "Fee must be > 0");
        require(_minMinerPurchase > 0, "Min purchase must be > 0");
        require(bytes(_rootUserId).length == 6, "Root User ID must be 6 characters.");

        usdtToken = IERC20(_usdtToken);
        registrationFee = _registrationFee;
        minMinerPurchase = _minMinerPurchase;

        // Seed owner as admin + root registered user
        address ownerAddress = msg.sender;
        admins[ownerAddress] = true;

        isRegistered[ownerAddress] = true;
        userIdToAddress[_rootUserId] = ownerAddress;
        addressToUserId[ownerAddress] = _rootUserId;
        referrerOf[ownerAddress] = address(0);
        userFundCodeHashes[ownerAddress] = _rootUserFundCodeHash;

        emit UserRegistered(ownerAddress, _rootUserId, address(0));
        emit FundCodeHashSet(ownerAddress);
    }

    // ---------- Registration ----------
    function register(
        string calldata _userId,
        string calldata _referrerId,
        string calldata _fundCode
    ) external nonReentrant {
        require(!isRegistered[msg.sender], "Already registered");
        require(bytes(_userId).length == 6, "User ID must be 6 characters.");
        require(userIdToAddress[_userId] == address(0), "User ID already taken");
        require(bytes(_fundCode).length >= 4, "Fund code too short");

        address referrerAddress = userIdToAddress[_referrerId];
        require(isRegistered[referrerAddress], "Invalid referrer ID");
        require(referrerAddress != msg.sender, "Cannot refer yourself");

        // Take registration fee
        require(usdtToken.transferFrom(msg.sender, address(this), registrationFee), "USDT transfer failed");

        // Save user
        isRegistered[msg.sender] = true;
        userIdToAddress[_userId] = msg.sender;
        addressToUserId[msg.sender] = _userId;
        referrerOf[msg.sender] = referrerAddress;
        userFundCodeHashes[msg.sender] = keccak256(abi.encodePacked(_fundCode));

        // Distribute commissions
        _distributeCommissions(referrerAddress);

        emit UserRegistered(msg.sender, _userId, referrerAddress);
        emit FundCodeHashSet(msg.sender);
    }

    // ---------- User commission withdrawal (fund code) ----------
    function withdrawWithFundCode(string calldata _code) external nonReentrant {
        require(isRegistered[msg.sender], "Not registered");
        require(userFundCodeHashes[msg.sender] != bytes32(0), "Fund code not set");
        require(keccak256(abi.encodePacked(_code)) == userFundCodeHashes[msg.sender], "Incorrect fund code");

        uint256 amount = userBalances[msg.sender];
        require(amount > 0, "No balance");

        userBalances[msg.sender] = 0;
        require(usdtToken.transfer(msg.sender, amount), "Transfer failed");
        emit Withdrawal(msg.sender, amount);
    }

    // ---------- Admin commission withdrawal (owner only) ----------
    function withdrawCommission() external onlyOwner nonReentrant {
        uint256 amount = adminCommissions[owner()];
        require(amount > 0, "No commission");
        adminCommissions[owner()] = 0;
        require(usdtToken.transfer(owner(), amount), "Transfer failed");
        emit CommissionWithdrawn(owner(), amount);
    }

    // ---------- Mining (on-chain vault + minimal user record) ----------
    function buyMiner(uint256 amount) external nonReentrant returns (uint256 newCount) {
        require(isRegistered[msg.sender], "Not registered");
        require(amount >= minMinerPurchase, "Below minimum");

        require(usdtToken.transferFrom(msg.sender, address(this), amount), "USDT transfer failed");

        minerCount[msg.sender] += 1;
        totalMinerDeposited[msg.sender] += amount;
        totalCollected += amount;

        uint256 startTime = block.timestamp;
        uint256 endTime = startTime + uint256(MINING_DURATION_DAYS) * 1 days;

        emit MinerPurchased(msg.sender, amount, startTime, endTime);
        return minerCount[msg.sender];
    }

    // Liquidity withdrawal (owner) — withdraw USDT collected via miner purchases
    function withdrawLiquidity(uint256 amount) external onlyOwner nonReentrant {
        require(amount > 0, "Zero amount");
        uint256 bal = usdtToken.balanceOf(address(this));
        require(amount <= bal, "Insufficient balance");
        require(usdtToken.transfer(owner(), amount), "Transfer failed");
        emit LiquidityWithdrawn(owner(), amount);
    }

    // Emergency: withdraw all USDT to owner
    function emergencyWithdrawAll() external onlyOwner nonReentrant {
        uint256 bal = usdtToken.balanceOf(address(this));
        require(bal > 0, "No balance");
        require(usdtToken.transfer(owner(), bal), "Withdraw failed");
        emit LiquidityWithdrawn(owner(), bal);
    }

    // ---------- Internal: commissions ----------
    function _distributeCommissions(address _referrerAddress) internal {
        address parent1 = _referrerAddress;

        if (parent1 == address(0)) {
            adminCommissions[owner()] += registrationFee;
            return;
        }

        uint256 remaining = registrationFee;

        // Level 1: 40%
        uint256 c1 = (registrationFee * 40) / 100;
        userBalances[parent1] += c1;
        remaining -= c1;

        // Level 2: 20%
        address parent2 = referrerOf[parent1];
        if (parent2 != address(0)) {
            uint256 c2 = (registrationFee * 20) / 100;
            userBalances[parent2] += c2;
            remaining -= c2;

            // Level 3: 10%
            address parent3 = referrerOf[parent2];
            if (parent3 != address(0)) {
                uint256 c3 = (registrationFee * 10) / 100;
                userBalances[parent3] += c3;
                remaining -= c3;
            }
        }

        if (remaining > 0) {
            adminCommissions[owner()] += remaining;
        }
    }

    // ---------- Views ----------
    function getContractBalance() external view returns (uint256) {
        return usdtToken.balanceOf(address(this));
    }

    function hasSetFundCode(address _user) external view returns (bool) {
        return userFundCodeHashes[_user] != bytes32(0);
    }

    // Helper view for off-chain UI
    function getUserMiningStats(address user) external view returns (uint256 count, uint256 totalDeposited) {
        return (minerCount[user], totalMinerDeposited[user]);
    }
}
