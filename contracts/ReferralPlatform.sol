// main/contracts/ReferralPlatform.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract ReferralPlatform is ReentrancyGuard, Ownable {
    IERC20 public usdtToken;
    uint256 public immutable registrationFee; // immutable: cannot be changed after deploy

    mapping(address => bool) public isRegistered;
    mapping(string => address) public userIdToAddress;
    mapping(address => string) public addressToUserId;
    mapping(address => address) public referrerOf;

    // earnings for users (from referrals)
    mapping(address => uint256) public userBalances;

    // fund code (hashed) needed for withdrawal
    mapping(address => bytes32) private userFundCodeHashes;

    // admin controls — only seeded in constructor (no add/remove functions)
    mapping(address => bool) public admins;
    mapping(address => uint256) public adminCommissions;

    event UserRegistered(address indexed user, string userId, address indexed referrer);
    event FundCodeHashSet(address indexed user);
    event Withdrawal(address indexed user, uint256 amount);
    event CommissionWithdrawn(address indexed admin, uint256 amount);

    constructor(
        address _usdtToken,
        uint256 _registrationFee,
        string memory _rootUserId,
        bytes32 _rootUserFundCodeHash
    ) Ownable(msg.sender) {
        require(bytes(_rootUserId).length == 6, "Root User ID must be 6 characters.");

        usdtToken = IERC20(_usdtToken);
        registrationFee = _registrationFee;

        address ownerAddress = msg.sender;

        // seed owner as admin and root registered user
        admins[ownerAddress] = true;
        isRegistered[ownerAddress] = true;

        userIdToAddress[_rootUserId] = ownerAddress;
        addressToUserId[ownerAddress] = _rootUserId;
        referrerOf[ownerAddress] = address(0);
        userFundCodeHashes[ownerAddress] = _rootUserFundCodeHash;

        emit UserRegistered(ownerAddress, _rootUserId, address(0));
        emit FundCodeHashSet(ownerAddress);
    }

    function register(
        string calldata _userId,
        string calldata _referrerId,
        string calldata _fundCode
    ) external nonReentrant {
        require(!isRegistered[msg.sender], "User is already registered.");
        require(bytes(_userId).length == 6, "User ID must be 6 characters.");
        require(userIdToAddress[_userId] == address(0), "This User ID is already taken.");
        require(bytes(_fundCode).length >= 4, "Fund code must be at least 4 characters long.");

        address referrerAddress = userIdToAddress[_referrerId];
        require(isRegistered[referrerAddress], "The referrer ID is invalid.");
        require(referrerAddress != msg.sender, "You cannot refer yourself.");

        require(usdtToken.transferFrom(msg.sender, address(this), registrationFee), "USDT transfer failed.");

        isRegistered[msg.sender] = true;
        userIdToAddress[_userId] = msg.sender;
        addressToUserId[msg.sender] = _userId;
        referrerOf[msg.sender] = referrerAddress;
        userFundCodeHashes[msg.sender] = keccak256(abi.encodePacked(_fundCode));

        _distributeCommissions(referrerAddress);

        emit UserRegistered(msg.sender, _userId, referrerAddress);
        emit FundCodeHashSet(msg.sender);
    }

    function withdrawWithFundCode(string calldata _code) external nonReentrant {
        require(isRegistered[msg.sender], "You are not a registered user.");
        require(userFundCodeHashes[msg.sender] != bytes32(0), "Fund code not set.");
        require(keccak256(abi.encodePacked(_code)) == userFundCodeHashes[msg.sender], "Incorrect fund code.");

        uint256 amount = userBalances[msg.sender];
        require(amount > 0, "You have no balance to withdraw.");

        userBalances[msg.sender] = 0;
        require(usdtToken.transfer(msg.sender, amount), "Withdrawal transfer failed.");

        emit Withdrawal(msg.sender, amount);
    }

    // ---------- Admin / Owner controls ----------
    modifier onlyAdmin() {
        require(admins[msg.sender], "Caller is not an admin.");
        _;
    }

    // No add/remove admin functions — fixed admin set (owner seeded as admin in constructor)

    function withdrawCommission() external nonReentrant onlyAdmin {
        uint256 amount = adminCommissions[msg.sender];
        require(amount > 0, "No commission to withdraw.");
        adminCommissions[msg.sender] = 0;
        require(usdtToken.transfer(msg.sender, amount), "Commission transfer failed.");
        emit CommissionWithdrawn(msg.sender, amount);
    }

    function emergencyWithdrawAll() external onlyOwner nonReentrant {
        uint256 balance = usdtToken.balanceOf(address(this));
        require(balance > 0, "Contract has no balance.");
        require(usdtToken.transfer(owner(), balance), "Emergency transfer failed.");
    }

    // ---------- Views / Helpers ----------
    function getContractBalance() external view returns (uint256) {
        return usdtToken.balanceOf(address(this));
    }

    function hasSetFundCode(address _user) external view returns (bool) {
        return userFundCodeHashes[_user] != bytes32(0);
    }

    // ---------- Internal ----------
    function _distributeCommissions(address _referrerAddress) internal {
        address parent1 = _referrerAddress;

        if (parent1 == address(0)) {
            adminCommissions[owner()] += registrationFee;
            return;
        }

        uint256 remainingAmount = registrationFee;

        // Level 1: 40%
        uint256 commissionL1 = (registrationFee * 40) / 100;
        userBalances[parent1] += commissionL1;
        remainingAmount -= commissionL1;

        // Level 2: 20%
        address parent2 = referrerOf[parent1];
        if (parent2 != address(0)) {
            uint256 commissionL2 = (registrationFee * 20) / 100;
            userBalances[parent2] += commissionL2;
            remainingAmount -= commissionL2;

            // Level 3: 10%
            address parent3 = referrerOf[parent2];
            if (parent3 != address(0)) {
                uint256 commissionL3 = (registrationFee * 10) / 100;
                userBalances[parent3] += commissionL3;
                remainingAmount -= commissionL3;
            }
        }

        // Remainder -> admin commission (owner)
        if (remainingAmount > 0) {
            adminCommissions[owner()] += remainingAmount;
        }
    }
}