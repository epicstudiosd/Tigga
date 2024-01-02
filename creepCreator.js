"use strict";
let util = require('util');
let roomIntel = require('roomIntel');
const constants = require('constants');

const utf15 = require('./utf15');
const Codec = utf15.Codec;

// TODO: Fixed function is not exactly ideal. 
// If we get variable strongholds, make this analyse the stronghold.
function getTowerDamageToTankForLevel(strongholdLevel, worryAboutSK) {
	switch (strongholdLevel) {
		case 1:
		case 2:
		case 3:
		case 4:
			return strongholdLevel * TOWER_POWER_ATTACK + (worryAboutSK ? 200 : 0);
		default:
			return Infinity
	}
}

function getDamageToTankForLevel(strongholdLevel) {
	switch (strongholdLevel) {
		case 1:
			return TOWER_POWER_ATTACK;
		case 2:
			// Attacking the corner tower
			return Math.max(2 * TOWER_POWER_ATTACK, TOWER_POWER_ATTACK + 15 * ATTACK_POWER)
		case 3:
			// Assume we attack an outer rampart tower and there's only one place the defenders can hit back from.
			return Math.max(3 * TOWER_POWER_ATTACK + 25 * ATTACK_POWER, 2 * TOWER_POWER_ATTACK + 25 * 2 * ATTACK_POWER)
		default:
			return Infinity
	}
}




var creepCreator = {
	// Be the biggest baddest dude across all target rooms
	createRambo(parentRoom, targetRooms, useBoosts, useToughBoost, overrideRangedParts, overrideHealParts, forceMaxSize, escalation, forceNoBoosts = false) {
		let returnObject = {body: [], boosts: []}

		let toughBoost
		let rangedBoost
		let healBoost
		let moveBoost

		useBoosts = useBoosts || 0

		if (forceNoBoosts) {
			useBoosts = 0
		}

		if (useBoosts) {
			if (useBoosts & 1) {
				rangedBoost = parentRoom.getAvailableBoost(util.isRangedBoost, 30 * LAB_BOOST_MINERAL);
			}
			if (useBoosts & 2) {
				healBoost  = parentRoom.getAvailableBoost(util.isHealBoost, 30 * LAB_BOOST_MINERAL);
			}
			if (useBoosts & 4) {
				moveBoost  = parentRoom.getAvailableBoost(util.isMoveBoost, 30 * LAB_BOOST_MINERAL);
			}
			if (useToughBoost) {
				toughBoost = parentRoom.getAvailableBoost(util.isToughBoost, 10 * LAB_BOOST_MINERAL);
			}
		}

		let toughNeeded = (useToughBoost && toughBoost) ? 1 : 0;
		let healNeeded = 1;
		let rangedNeeded = 1;

		for (let roomName of targetRooms) {
			let mem = Memory.rooms[roomName]

			if (!mem) continue

			let maxTowerDamage = mem.maxTowerDamage || 0;


			let hostileRangedParts;
			if (overrideRangedParts) {
				hostileRangedParts = overrideRangedParts;
			}
			else if (mem.creepCombatPartsRanged) {
				hostileRangedParts = mem.creepCombatPartsRanged
			}
			else if (Game.rooms[roomName]) {
				hostileRangedParts = 0;
				let hostileCreeps = Game.rooms[roomName].getAllHostileCreepsWithBodyParts([RANGED_ATTACK], false);
				for (let creep of hostileCreeps) {
					hostileRangedParts += creep.getBoostModifiedCombatParts(false).numRanged;
				}
			}
			let hostileHealParts;
			if (overrideHealParts) {
				hostileHealParts = overrideHealParts;
			}
			else if (mem.creepCombatPartsHeal) {
				hostileHealParts = mem.creepCombatPartsHeal
			}
			else if (Game.rooms[roomName]) {
				hostileHealParts = 0;
				let hostileCreeps = Game.rooms[roomName].getAllHostileCreepsWithBodyParts([HEAL], false);
				for (let creep of hostileCreeps) {
					hostileHealParts += creep.getBoostModifiedCombatParts(false).numHeal;
				}
			}

			if (mem.owner == util.getMyName()) {
				maxTowerDamage = 0
				hostileHealParts -= Game.rooms[roomName].towers.length * 150 / 12
				hostileRangedParts -= Game.rooms[roomName].towers.length * 20 / 10

				// Assume they're going to be bunched so we can assume lower heal as we'll RMA
				hostileHealParts /= 2
			}


			// console.log("Rambo needed #0:", toughNeeded, healNeeded, rangedNeeded, useToughBoost, toughBoost)

			if (useToughBoost && toughBoost) {
				toughNeeded = Math.max(toughNeeded, Math.ceil(((hostileRangedParts || 0) * RANGED_ATTACK_POWER + maxTowerDamage) * BOOSTS[TOUGH][toughBoost]["damage"] / 100));
				healNeeded = Math.max(healNeeded, ((0.8 + 0.2 / (mem.creepCnt || 1)) * (hostileRangedParts || 0) * RANGED_ATTACK_POWER + maxTowerDamage) * BOOSTS[TOUGH][toughBoost]["damage"] / HEAL_POWER)
			}
			else {
				// Assume they can't all hit me at once and I can absorb some
				healNeeded = Math.max(healNeeded, ((0.8 + 0.2 / (mem.creepCnt || 1)) * (hostileRangedParts || 0) * RANGED_ATTACK_POWER + maxTowerDamage) / HEAL_POWER)
			}
			rangedNeeded = Math.max(rangedNeeded, healNeeded, (1 + 0.25 / (mem.creepCnt || 1)) * (hostileHealParts || 0) * HEAL_POWER / RANGED_ATTACK_POWER)
		}

		toughNeeded = Math.round(toughNeeded * (1 + (escalation || 0) / 10));
		healNeeded = Math.round(healNeeded * (1 + (escalation || 0) / 10));
		rangedNeeded = Math.round(rangedNeeded * (1 + (escalation || 0) / 10));

		// console.log("Rambo needed #1:", toughNeeded, healNeeded, rangedNeeded, useToughBoost, toughBoost)

		// Sod it.
		if (useToughBoost && useBoosts == 7 && toughNeeded > 12) {
			return returnObject;
		}

		if (healBoost) {
			healNeeded = Math.ceil(healNeeded / BOOSTS[HEAL][healBoost][HEAL]);
		}
		if (rangedBoost) {
			rangedNeeded = Math.ceil(rangedNeeded / BOOSTS[RANGED_ATTACK][rangedBoost]["rangedAttack"]);
		}

		// console.log("Rambo needed #2:", toughNeeded, healNeeded, rangedNeeded)

		let moveScale = 1;
		if (moveBoost) {
			moveScale = BOOSTS[MOVE][moveBoost]["fatigue"];
		}

		let maxCreepParts = MAX_CREEP_SIZE - Math.ceil(MAX_CREEP_SIZE / (moveScale + 1) - 0.001);

		// Negative is bad!
		toughNeeded = Math.max(0, toughNeeded);
		healNeeded = Math.max(1, healNeeded);
		rangedNeeded = Math.max(1, rangedNeeded);

		if (healNeeded + rangedNeeded + toughNeeded <= Math.round(MAX_CREEP_SIZE / 2)) {
			moveBoost = undefined;
			moveScale = 1;
		}

		let moveUsed = Math.ceil((toughNeeded + healNeeded + rangedNeeded) / moveScale);
		if (forceMaxSize) {
			if (moveScale == 1) {
				moveUsed = 25;
			}
			else if (moveScale == 2) {
				moveUsed = 17;
			}
			else if (moveScale == 3) {
				moveUsed = 13;
			}
			else if (moveScale == 4) {
				moveUsed = 10;
			}
			rangedNeeded = Math.max(1, MAX_CREEP_SIZE - moveUsed - toughNeeded - healNeeded)
		}

		// console.log("Rambo needed #3:", toughNeeded, healNeeded, rangedNeeded, moveUsed)

		let cost = toughNeeded * BODYPART_COST[TOUGH] +
				   healNeeded * BODYPART_COST[HEAL] +
				   rangedNeeded * BODYPART_COST[RANGED_ATTACK] +
				   moveUsed * BODYPART_COST[MOVE];

		if (healNeeded + rangedNeeded + toughNeeded > maxCreepParts ||
			healNeeded + rangedNeeded + toughNeeded + moveUsed > MAX_CREEP_SIZE ||
			rangedNeeded < 1 ||
			healNeeded < 1 ||
			cost > parentRoom.energyCapacityAvailable) {

			if (forceNoBoosts) {
				return returnObject;
			}

			if (useBoosts == 7 && !useToughBoost) {
				return this.createRambo(parentRoom, targetRooms, (useBoosts + 1), true, overrideRangedParts, overrideHealParts)
			}
			else if (useBoosts < 16) {
				return this.createRambo(parentRoom, targetRooms, (useBoosts + 1), useToughBoost, overrideRangedParts, overrideHealParts)
			}
			else {
				// Fail :(
				return returnObject;
			}
		}

		let extraRanged = 0;
		let extraHeal = 0;

		while (1) {
			if (cost < parentRoom.energyCapacityAvailable - 2 * (BODYPART_COST[HEAL] + BODYPART_COST[MOVE]) &&
				   healNeeded + rangedNeeded + toughNeeded + moveUsed + extraRanged * 2 + extraHeal * 2 <= MAX_CREEP_SIZE - 2 &&
				   extraHeal < 5) {
				extraHeal += 1;
				cost += BODYPART_COST[HEAL] + BODYPART_COST[MOVE];
			}
			else {
				break;
			}
			if (cost < parentRoom.energyCapacityAvailable - 2 * (BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE]) &&
			   healNeeded + rangedNeeded + toughNeeded + moveUsed + extraRanged * 2 + extraHeal * 2 <= MAX_CREEP_SIZE - 2 &&
			   extraRanged < 5) {
				extraRanged += 1;
				cost += BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE];
			}
			else {
				break;
			}
		}


		// console.log(toughNeeded, healNeeded, rangedNeeded, moveUsed)

		let body = [];
		let boosts = {};

		for (var i = 0; i < toughNeeded; i++) {
			body.push(TOUGH)
		}
		for (var i = 0; i < Math.floor(rangedNeeded / 2) + extraRanged; i++) {
			body.push(RANGED_ATTACK)
		}
		for (var i = 0; i < Math.floor(moveUsed / 2); i++) {
			body.push(MOVE)
		}
		for (var i = 0; i < Math.ceil(rangedNeeded / 2); i++) {
			body.push(RANGED_ATTACK)
		}
		for (var i = 0; i < Math.ceil(moveUsed / 2) + extraRanged + extraHeal; i++) {
			body.push(MOVE)
		}
		for (var i = 0; i < healNeeded + extraHeal; i++) {
			body.push(HEAL)
		}

		if (toughBoost) {
			boosts[toughBoost] = toughNeeded;
		}
		if (moveBoost) {
			boosts[moveBoost] = moveUsed;
		}
		if (rangedBoost) {
			boosts[rangedBoost] = rangedNeeded;
		}
		if (healBoost) {
			boosts[healBoost] = healNeeded;
		}

		returnObject.body = body;
		returnObject.boosts = boosts;

		return returnObject;
	},

	createHeavyUnclaim(parentRoom, setupRoom, targetRoom) {
		let returnObject = {body: [], boosts: []}

		let toughBoost = parentRoom.getAvailableBoost(util.isToughBoost, 11 * LAB_BOOST_MINERAL);
		let rangedBoost = parentRoom.getAvailableBoost(util.isRangedBoost, 38 * LAB_BOOST_MINERAL);
		let healBoost = parentRoom.getAvailableBoost(util.isHealBoost, 39 * LAB_BOOST_MINERAL);
		let moveBoost = parentRoom.getAvailableBoost(util.isMoveBoost, 16 * LAB_BOOST_MINERAL);

		let toughNeeded = 0;
		let healNeeded = 0;
		let rangedNeeded = 0;
		let claimNeeded = 1;

		let mem = Memory.rooms[targetRoom]

		if (!mem.pathTowerDamageToControllerByEdge1x1) return;

		let towerDamage = 0;
		let exits = Game.map.describeExits(targetRoom);
		for (let exitDir in exits) {
			if (exits[exitDir] == setupRoom) {
				let exitIdx = Math.round((parseInt(exitDir) - 1) / 2);

				towerDamage = mem.pathTowerDamageToControllerByEdge1x1[exitIdx];
				break;
			}
		}


		if (toughBoost) {
			toughNeeded = Math.ceil(towerDamage * BOOSTS[TOUGH][toughBoost]["damage"] / 100);
			healNeeded = towerDamage * BOOSTS[TOUGH][toughBoost]["damage"] / HEAL_POWER
			if (healBoost) {
				healNeeded = Math.ceil(healNeeded / BOOSTS[HEAL][healBoost][HEAL]);
			}
		}
		else {
			healNeeded = towerDamage / HEAL_POWER
			if (healBoost) {
				healNeeded = Math.ceil(healNeeded / BOOSTS[HEAL][healBoost][HEAL]);
			}
		}

		let moveScale = 1;
		if (moveBoost) {
			moveScale = BOOSTS[MOVE][moveBoost]["fatigue"];
		}

		let maxCreepParts = MAX_CREEP_SIZE - Math.ceil(MAX_CREEP_SIZE / (moveScale + 1) - 0.001);

		let moveUsed;
		if (moveScale == 1) {
			moveUsed = 25;
		}
		else if (moveScale == 2) {
			moveUsed = 17;
		}
		else if (moveScale == 3) {
			moveUsed = 13;
		}
		else if (moveScale == 4) {
			moveUsed = 10;
		}

		if (moveUsed - toughNeeded - healNeeded - claimNeeded > MAX_CREEP_SIZE) {
			return returnObject;
		}

		rangedNeeded = Math.max(0, Math.floor((MAX_CREEP_SIZE - moveUsed - toughNeeded - healNeeded - claimNeeded) / 2))
		claimNeeded = Math.max(1, MAX_CREEP_SIZE - moveUsed - toughNeeded - healNeeded - rangedNeeded);

		let cost = toughNeeded * BODYPART_COST[TOUGH] +
				   healNeeded * BODYPART_COST[HEAL] +
				   claimNeeded * BODYPART_COST[CLAIM] +
				   rangedNeeded * BODYPART_COST[RANGED_ATTACK] +
				   moveUsed * BODYPART_COST[MOVE];

		while (cost > parentRoom.energyCapacityAvailable) {
			if (claimNeeded > 1) {
				rangedNeeded++;
				cost += BODYPART_COST[RANGED_ATTACK];
				claimNeeded--;
				cost -= BODYPART_COST[CLAIM];
			}
			else {
				return returnObject;
			}
		}

		let body = [];
		let boosts = {};

		for (var i = 0; i < toughNeeded; i++) {
			body.push(TOUGH)
		}
		for (var i = 0; i < Math.floor(rangedNeeded / 2); i++) {
			body.push(RANGED_ATTACK)
		}
		for (var i = 0; i < Math.floor(moveUsed / 2); i++) {
			body.push(MOVE)
		}
		for (var i = 0; i < Math.ceil(rangedNeeded / 2); i++) {
			body.push(RANGED_ATTACK)
		}
		for (var i = 0; i < claimNeeded; i++) {
			body.push(CLAIM)
		}
		for (var i = 0; i < Math.ceil(moveUsed / 2); i++) {
			body.push(MOVE)
		}
		for (var i = 0; i < healNeeded; i++) {
			body.push(HEAL)
		}

		if (toughBoost) {
			boosts[toughBoost] = toughNeeded;
		}
		if (moveBoost) {
			boosts[moveBoost] = moveUsed;
		}
		if (rangedBoost) {
			boosts[rangedBoost] = rangedNeeded;
		}
		if (healBoost) {
			boosts[healBoost] = healNeeded;
		}

		returnObject.body = body;
		returnObject.boosts = boosts;

		return returnObject;
	},

	createHeavyBlocker(parentRoom, setupRoom, targetRoom) {
		let returnObject = {body: [], boosts: []}

		let toughBoost = parentRoom.getAvailableBoost(util.isToughBoost, 11 * LAB_BOOST_MINERAL);
		let rangedBoost = parentRoom.getAvailableBoost(util.isRangedBoost, 38 * LAB_BOOST_MINERAL);
		let healBoost = parentRoom.getAvailableBoost(util.isHealBoost, 39 * LAB_BOOST_MINERAL);
		let moveBoost = parentRoom.getAvailableBoost(util.isMoveBoost, 16 * LAB_BOOST_MINERAL);

		let toughNeeded = 0;
		let healNeeded = 0;
		let claimNeeded = 1;

		let mem = Memory.rooms[targetRoom]

		if (!mem.pathTowerDamageToControllerByEdge1x1) return;

		let towerDamage = 0;
		let exits = Game.map.describeExits(targetRoom);
		for (let exitDir in exits) {
			if (exits[exitDir] == setupRoom) {
				let exitIdx = Math.round((parseInt(exitDir) - 1) / 2);

				towerDamage = mem.pathTowerDamageToControllerByEdge1x1[exitIdx];
				break;
			}
		}


		if (toughBoost) {
			toughNeeded = Math.ceil(towerDamage * BOOSTS[TOUGH][toughBoost]["damage"] / 100);
			healNeeded = towerDamage * BOOSTS[TOUGH][toughBoost]["damage"] / HEAL_POWER
			if (healBoost) {
				healNeeded = Math.ceil(healNeeded / BOOSTS[HEAL][healBoost][HEAL]);
			}
		}
		else {
			healNeeded = towerDamage / HEAL_POWER
			if (healBoost) {
				healNeeded = Math.ceil(healNeeded / BOOSTS[HEAL][healBoost][HEAL]);
			}
		}

		let moveScale = 1;
		if (moveBoost) {
			moveScale = BOOSTS[MOVE][moveBoost]["fatigue"];
		}

		let maxCreepParts = MAX_CREEP_SIZE - Math.ceil(MAX_CREEP_SIZE / (moveScale + 1) - 0.001);

		let moveUsed;
		if (moveScale == 1) {
			moveUsed = toughNeeded + healNeeded + claimNeeded;
		}
		else if (moveScale == 2) {
			moveUsed = Math.ceil((toughNeeded + healNeeded + claimNeeded) / 2);
		}
		else if (moveScale == 3) {
			moveUsed = Math.ceil((toughNeeded + healNeeded + claimNeeded) / 3);
		}
		else if (moveScale == 4) {
			moveUsed = Math.ceil((toughNeeded + healNeeded + claimNeeded) / 4);
		}

		if (moveUsed - toughNeeded - healNeeded - claimNeeded > MAX_CREEP_SIZE) {
			return returnObject;
		}

		let cost = toughNeeded * BODYPART_COST[TOUGH] +
				   healNeeded * BODYPART_COST[HEAL] +
				   claimNeeded * BODYPART_COST[CLAIM] +
				   moveUsed * BODYPART_COST[MOVE];

		if (cost > parentRoom.energyCapacityAvailable) {
			return returnObject;
		}

		let body = [];
		let boosts = {};

		for (var i = 0; i < toughNeeded; i++) {
			body.push(TOUGH)
		}
		for (var i = 0; i < Math.floor(moveUsed / 2); i++) {
			body.push(MOVE)
		}
		for (var i = 0; i < claimNeeded; i++) {
			body.push(CLAIM)
		}
		for (var i = 0; i < Math.ceil(moveUsed / 2); i++) {
			body.push(MOVE)
		}
		for (var i = 0; i < healNeeded; i++) {
			body.push(HEAL)
		}

		if (toughBoost) {
			boosts[toughBoost] = toughNeeded;
		}
		if (moveBoost) {
			boosts[moveBoost] = moveUsed;
		}
		if (healBoost) {
			boosts[healBoost] = healNeeded;
		}

		returnObject.body = body;
		returnObject.boosts = boosts;

		return returnObject;
	},

	createHeavyTransport(parentRoom, level, noBoost = false) {
		let returnObject = {body: [], boosts: []}

		level = Math.max(0, Math.min(6.4999, level))

		let toughBoost = noBoost ? undefined : parentRoom.getAvailableBoost(util.isToughBoost, Math.round(3 * level * LAB_BOOST_MINERAL));
		let healBoost = noBoost ? undefined : parentRoom.getAvailableBoost(util.isHealBoost, Math.round(9 * level * LAB_BOOST_MINERAL));
		let moveBoost = noBoost ? undefined : level >= 2 ? parentRoom.getAvailableBoost(util.isMoveBoost, 16 * LAB_BOOST_MINERAL) : undefined;

		// Could do this better...
		if (util.getBoostTier(toughBoost) != 3) {
			toughBoost = undefined
		}

		let toughNeeded = toughBoost ? Math.round(3 * level) : 0;
		let healNeeded = Math.round((toughBoost ? 3 : 9) * level * (util.getBoostTier(healBoost) + 1) / 4);

		let moveScale = 1;
		if (moveBoost) {
			moveScale = BOOSTS[MOVE][moveBoost]["fatigue"];
		}

		let moveUsed;
		if (moveScale == 1) {
			moveUsed = 25;
		}
		else if (moveScale == 2) {
			moveUsed = 17;
		}
		else if (moveScale == 3) {
			moveUsed = 13;
		}
		else if (moveScale == 4) {
			moveUsed = 10;
		}

		if (moveUsed + toughNeeded + healNeeded > MAX_CREEP_SIZE - 1) {
			return returnObject;
		}

		let carryParts = MAX_CREEP_SIZE - moveUsed - toughNeeded - healNeeded

		let cost = toughNeeded * BODYPART_COST[TOUGH] +
				   healNeeded * BODYPART_COST[HEAL] +
				   carryParts * BODYPART_COST[CARRY] +
				   moveUsed * BODYPART_COST[MOVE];

		if (cost > parentRoom.energyCapacityAvailable) {
			console.log("Not enough energy for heavy transporter", moveUsed, toughNeeded, healNeeded, carryParts, cost, parentRoom.energyCapacityAvailable)
			return returnObject;
		}

		if (moveUsed + toughNeeded + healNeeded + carryParts > MAX_CREEP_SIZE) {
			console.log("Trying to build too big heavy transporter", moveUsed, toughNeeded, healNeeded, carryParts)
			return returnObject;
		}


		let body = [];
		let boosts = {};

		for (var i = 0; i < toughNeeded; i++) {
			body.push(TOUGH)
		}
		for (var i = 0; i < Math.floor(moveUsed * 0.75); i++) {
			body.push(MOVE)
		}
		for (var i = 0; i < healNeeded; i++) {
			body.push(HEAL)
		}
		for (var i = 0; i < moveUsed - Math.floor(moveUsed * 0.75); i++) {
			body.push(MOVE)
		}
		for (var i = 0; i < carryParts; i++) {
			body.push(CARRY)
		}

		if (toughBoost) {
			boosts[toughBoost] = toughNeeded;
		}
		if (moveBoost) {
			boosts[moveBoost] = moveUsed;
		}
		if (healBoost) {
			boosts[healBoost] = healNeeded;
		}

		returnObject.body = body;
		returnObject.boosts = boosts;

		return returnObject;
	},

	createSeason4Scorer(parentRoom, resource) {
		let returnObject = {body: [], boosts: {}}


		if ((COMMODITIES[resource].level || 0) <= 1) {
			returnObject.body.push(MOVE)
			returnObject.body.push(MOVE)
			returnObject.body.push(MOVE)
			returnObject.body.push(MOVE)
			returnObject.body.push(MOVE)
			returnObject.body.push(MOVE)
			returnObject.body.push(MOVE)
			if ((COMMODITIES[resource].level || 0) == 0) {
				returnObject.body.push(MOVE)
				returnObject.body.push(MOVE)
				returnObject.body.push(MOVE)
				returnObject.body.push(MOVE)
				returnObject.body.push(MOVE)
				returnObject.body.push(MOVE)
			}
		}


		returnObject.body.push(MOVE)
		returnObject.body.push(MOVE)
		returnObject.body.push(MOVE)
		returnObject.body.push(MOVE)
		returnObject.body.push(MOVE)
		returnObject.body.push(MOVE)
		returnObject.body.push(MOVE)
		returnObject.body.push(MOVE)
		returnObject.body.push(MOVE)
		returnObject.body.push(MOVE)
		returnObject.body.push(MOVE)
		returnObject.body.push(HEAL)
		returnObject.body.push(HEAL)
		returnObject.body.push(HEAL)
		returnObject.body.push(HEAL)
		returnObject.body.push(CARRY)

		if ((COMMODITIES[resource].level || 0) <= 3) {		
			returnObject.body.push(CARRY)
		}

		if ((COMMODITIES[resource].level || 0) <= 1) {
			returnObject.body.push(CARRY)
			returnObject.body.push(CARRY)
			returnObject.body.push(CARRY)
			returnObject.body.push(CARRY)
			returnObject.body.push(CARRY)
			returnObject.body.push(CARRY)
			returnObject.body.push(CARRY)
			returnObject.body.push(CARRY)
			if ((COMMODITIES[resource].level || 0) == 0) {
				returnObject.body.push(CARRY)
				returnObject.body.push(CARRY)
				returnObject.body.push(CARRY)
				returnObject.body.push(CARRY)
				returnObject.body.push(CARRY)
				returnObject.body.push(CARRY)
			}
		}


		return returnObject;
	},

	createBestHeal(parentRoom, useTough, useRanged, useBoost, energyCap, targetHealRequired, maxRanged, buildToMaxSize, opts) {
		let returnObject = {body: [], boosts: []}
		energyCap = energyCap || parentRoom.energyCapacityAvailable

		opts = opts || {}
		let moveRatio = opts.moveRatio || 1

		let toughBoost 
		let moveBoost
		let healBoost
		let rangedBoost

		if (useBoost) {
			toughBoost = useTough ? parentRoom.getAvailableBoost(util.isToughBoost, 8 * LAB_BOOST_MINERAL) : undefined; 
			moveBoost = parentRoom.getAvailableBoost(util.isMoveBoost, 16 * LAB_BOOST_MINERAL);
			healBoost = parentRoom.getAvailableBoost(util.isHealBoost, 40 * LAB_BOOST_MINERAL);
			rangedBoost = useRanged ? parentRoom.getAvailableBoost(util.isRangedBoost, 40 * LAB_BOOST_MINERAL) : undefined;
		}

		let moveScale = 1;
		if (moveBoost) {
			moveScale = BOOSTS[MOVE][moveBoost]["fatigue"];
		}

		let toughNeeded = useTough && toughBoost ? 1 : 0;
		let healNeeded = 1;
		let rangedNeeded = useRanged ? 1 : 0;
		let moveNeeded = Math.ceil(moveRatio * (toughNeeded + healNeeded + rangedNeeded) / moveScale);

		let cost = BODYPART_COST[TOUGH] * toughNeeded + BODYPART_COST[RANGED_ATTACK] * rangedNeeded + BODYPART_COST[HEAL] * healNeeded + BODYPART_COST[MOVE] * moveNeeded


		let lastNumMove
		let lastNumHeal
		let lastNumTough
		let lastNumRanged

		while (cost <= energyCap && toughNeeded + healNeeded + moveNeeded + rangedNeeded <= MAX_CREEP_SIZE) {
			lastNumMove = moveNeeded
			lastNumHeal = healNeeded
			lastNumTough = toughNeeded
			lastNumRanged = rangedNeeded

			if (!buildToMaxSize && targetHealRequired && (healNeeded >= targetHealRequired || (healBoost && healNeeded * BOOSTS[HEAL][healBoost][HEAL] >= targetHealRequired))) {
				// console.log(parentRoom, useTough, useRanged, useBoost, energyCap, targetHealRequired, maxRanged, buildToMaxSize)
				break;
			}

			if (toughBoost && useTough && toughNeeded < 8 * useTough && toughNeeded * 3 < healNeeded * useTough) {
				toughNeeded++
				cost += BODYPART_COST[TOUGH]
			}
			else if (useRanged && rangedNeeded < 4 && rangedNeeded * 8 < healNeeded && rangedNeeded < maxRanged) {
				rangedNeeded++
				cost += BODYPART_COST[RANGED_ATTACK]
			}
			else {
				healNeeded++
				cost += BODYPART_COST[HEAL]
			}

			
			while (Math.ceil(5 * (toughNeeded + healNeeded + rangedNeeded) / moveNeeded) > (6 - moveRatio) * moveScale) {
				moveNeeded++;
				cost += BODYPART_COST[MOVE]
			}
		}

		moveNeeded = lastNumMove
		healNeeded = lastNumHeal
		toughNeeded = lastNumTough
		rangedNeeded = lastNumRanged


		/*while (toughNeeded + healNeeded + moveNeeded + rangedNeeded < MAX_CREEP_SIZE && cost <= energyCap - BODYPART_COST[HEAL]) {
			if (!buildToMaxSize && targetHealRequired && (healNeeded >= targetHealRequired || (healBoost && healNeeded * BOOSTS[HEAL][healBoost][HEAL] >= targetHealRequired))) {
				// console.log(parentRoom, useTough, useRanged, useBoost, energyCap, targetHealRequired, maxRanged, buildToMaxSize)
				break;
			}

			// Move
			if (toughNeeded + healNeeded + rangedNeeded + 1 > Math.floor(moveNeeded * moveScale)) {
				moveNeeded++
				cost += BODYPART_COST[MOVE]
			}
			else if (toughBoost && useTough && toughNeeded < 8 * useTough && toughNeeded * 3 < healNeeded * useTough) {
				toughNeeded++
				cost += BODYPART_COST[TOUGH]
			}
			else if (useRanged && rangedNeeded < 4 && rangedNeeded * 8 < healNeeded && rangedNeeded < maxRanged) {
				rangedNeeded++
				cost += BODYPART_COST[RANGED_ATTACK]
			}
			else {
				healNeeded++
				cost += BODYPART_COST[HEAL]
			}
		}*/

		if (targetHealRequired && healNeeded < targetHealRequired) {
			if (!useBoost) {
				return this.createBestHeal(parentRoom, useTough, useRanged, true, energyCap, targetHealRequired, maxRanged, buildToMaxSize, opts)
			}
			else if (!healBoost || healNeeded * BOOSTS[HEAL][healBoost][HEAL] < targetHealRequired) {
				return returnObject
			}
		}


		let body = [];
		let boosts = {};

		let headTough = Math.ceil(toughNeeded * .75)
		let midTough = toughNeeded - headTough

		if (toughBoost) {
			for (var i = 0; i < Math.floor(headTough * 0.25); i++) {
				body.push(TOUGH)
			}
		}
		else {
			for (var i = 0; i < toughNeeded; i++) {
				body.push(TOUGH)
			}
		}

		for (var i = 0; i < rangedNeeded; i++) {
			body.push(RANGED_ATTACK)
		}

		if (toughBoost) {
			for (var i = 0; i < Math.ceil(headTough * 0.75); i++) {
				body.push(TOUGH)
			}
		}		


		for (var i = 0; i < Math.ceil((moveNeeded - 1) / 2); i++) {
			body.push(MOVE)
		}
		if (toughBoost) {			
			for (var i = 0; i < midTough; i++) {
				body.push(TOUGH)
			}
		}
		for (var i = 0; i < Math.floor((moveNeeded - 1) / 2); i++) {
			body.push(MOVE)
		}
		for (var i = 0; i < healNeeded; i++) {
			body.push(HEAL)
		}

		body.push(MOVE)

		if (toughBoost) {
			boosts[toughBoost] = toughNeeded;
		}
		if (rangedBoost) {
			boosts[rangedBoost] = rangedNeeded;
		}
		if (moveBoost) {
			boosts[moveBoost] = moveNeeded;
		}
		if (healBoost) {
			boosts[healBoost] = healNeeded;
		}

		returnObject.body = body;
		returnObject.boosts = boosts;

		return returnObject;
	},

	// Target ranged and heal are pre-boost (ie. can be > 50)
	// Target tough is post boost
	createBestRanged(parentRoom, useTough, useHeal, useBoost, energyCap, targetRangedRequired, targetHealRequired, targetToughRequired, buildToMaxSize, opts) {
		let returnObject = {body: [], boosts: []}
		energyCap = energyCap || parentRoom.energyCapacityAvailable

		opts = opts || {}
		let moveRatio = opts.moveRatio || 1

		let toughBoost 
		let moveBoost
		let healBoost
		let rangedBoost

		if (targetHealRequired && !useHeal) {
			throw(new Error("target heal required but not allowing heal"))
		}
		if (targetToughRequired && !useTough) {
			throw(new Error("target tough required but not allowing tough"))
		}

		if (useBoost) {
			toughBoost = useTough ? parentRoom.getAvailableBoost(util.isToughBoost, 8 * LAB_BOOST_MINERAL) : undefined; 
			moveBoost = parentRoom.getAvailableBoost(util.isMoveBoost, 16 * LAB_BOOST_MINERAL);
			healBoost = useHeal ? parentRoom.getAvailableBoost(util.isHealBoost, 40 * LAB_BOOST_MINERAL) : undefined;
			rangedBoost = parentRoom.getAvailableBoost(util.isRangedBoost, 40 * LAB_BOOST_MINERAL);
		}

		let moveScale = 1;
		if (moveBoost) {
			moveScale = BOOSTS[MOVE][moveBoost]["fatigue"];
		}

		let toughNeeded = toughBoost && useTough ? (targetToughRequired || 1) : 0;
		let healNeeded = useHeal ? 1 : 0;
		let rangedNeeded = 1;
		let moveNeeded = Math.ceil((toughNeeded + healNeeded + rangedNeeded) / moveScale);

		let cost = BODYPART_COST[TOUGH] * toughNeeded + BODYPART_COST[RANGED_ATTACK] * rangedNeeded + BODYPART_COST[HEAL] * healNeeded + BODYPART_COST[MOVE] * moveNeeded

		/*while (toughNeeded + healNeeded + moveNeeded + rangedNeeded < MAX_CREEP_SIZE && cost <= energyCap - BODYPART_COST[HEAL]) {
			let allowRanged = buildToMaxSize || !(targetRangedRequired && (rangedNeeded >= targetRangedRequired || (rangedBoost && rangedNeeded * BOOSTS[RANGED_ATTACK][rangedBoost][RANGED_ATTACK] >= targetRangedRequired)))
			let allowHeal = !(targetHealRequired && (healNeeded >= targetHealRequired || (healBoost && healNeeded * BOOSTS[HEAL][healBoost][HEAL] >= targetHealRequired)))
			let allowTough = !(toughBoost && targetToughRequired && toughNeeded >= targetToughRequired)

			// Move
			if (toughNeeded + healNeeded + rangedNeeded + 1 > Math.floor(moveNeeded * moveScale)) {
				if (!allowRanged && !allowHeal && !allowTough) {
					break
				}
				moveNeeded++
				cost += BODYPART_COST[MOVE]
			}
			// else if (allowTough && toughBoost && useTough && toughNeeded < 8 && toughNeeded * 2 < healNeeded) {
			else if (allowTough && toughBoost && useTough && toughNeeded < (targetToughRequired || Math.min(8, Math.ceil(healNeeded / 2)))) {
				toughNeeded++
				cost += BODYPART_COST[TOUGH]
			}
			else if (allowHeal && useHeal && healNeeded < (targetHealRequired || Math.min(10, Math.ceil(rangedNeeded / 3)))) {
				healNeeded++
				cost += BODYPART_COST[HEAL]
			}
			else {
				if (!allowRanged) {
					break;
				}
				rangedNeeded++
				cost += BODYPART_COST[RANGED_ATTACK]
			}
		}*/

		let lastNumMove
		let lastNumHeal
		let lastNumTough
		let lastNumRanged

		while (cost <= energyCap && toughNeeded + healNeeded + moveNeeded + rangedNeeded <= MAX_CREEP_SIZE) {
			lastNumMove = moveNeeded
			lastNumHeal = healNeeded
			lastNumTough = toughNeeded
			lastNumRanged = rangedNeeded

			let allowRanged = buildToMaxSize || !(targetRangedRequired && (rangedNeeded >= targetRangedRequired || (rangedBoost && rangedNeeded * BOOSTS[RANGED_ATTACK][rangedBoost][RANGED_ATTACK] >= targetRangedRequired)))
			let allowHeal = !(targetHealRequired && (healNeeded >= targetHealRequired || (healBoost && healNeeded * BOOSTS[HEAL][healBoost][HEAL] >= targetHealRequired)))
			let allowTough = !(toughBoost && targetToughRequired && toughNeeded >= targetToughRequired)

			if (allowTough && toughBoost && useTough && toughNeeded < (targetToughRequired || Math.min(8, Math.ceil(healNeeded / 2)))) {
				toughNeeded++
				cost += BODYPART_COST[TOUGH]
			}
			else if (allowHeal && useHeal && healNeeded < (targetHealRequired || Math.min(10, Math.ceil(rangedNeeded / 3)))) {
				healNeeded++
				cost += BODYPART_COST[HEAL]
			}
			else {
				if (!allowRanged) {
					break;
				}
				rangedNeeded++
				cost += BODYPART_COST[RANGED_ATTACK]
			}

			
			while (Math.ceil(5 * (toughNeeded + healNeeded + rangedNeeded) / moveNeeded) > (6 - moveRatio) * moveScale) {
				moveNeeded++;
				cost += BODYPART_COST[MOVE]
			}
		}

		moveNeeded = lastNumMove
		healNeeded = lastNumHeal
		toughNeeded = lastNumTough
		rangedNeeded = lastNumRanged


		// Too big/expensive. This should never happen? The above loop handles all that. Actually this bit breaks stuff
		// as our "cost" is the next one over the cost cap
		// if ((toughNeeded + healNeeded + moveNeeded + rangedNeeded > MAX_CREEP_SIZE || cost > energyCap)) {
		// 	if (!useBoost) {
		// 		return this.createBestRanged(parentRoom, useTough, useHeal, true, energyCap, targetRangedRequired, targetHealRequired, targetToughRequired, buildToMaxSize, opts)
		// 	}
		// 	else {
		// 		return returnObject
		// 	}
		// }

		if (targetRangedRequired && rangedNeeded < targetRangedRequired) {
			if (!useBoost) {
				return this.createBestRanged(parentRoom, useTough, useHeal, true, energyCap, targetRangedRequired, targetHealRequired, targetToughRequired, buildToMaxSize, opts)
			}
			else if (!rangedBoost || rangedNeeded * BOOSTS[RANGED_ATTACK][rangedBoost][RANGED_ATTACK] < targetRangedRequired) {
				return returnObject
			}
		}
		if (targetHealRequired && healNeeded < targetHealRequired) {
			if (!useBoost) {
				return this.createBestRanged(parentRoom, useTough, useHeal, true, energyCap, targetRangedRequired, targetHealRequired, targetToughRequired, buildToMaxSize, opts)
			}
			else if (!healBoost || healNeeded * BOOSTS[HEAL][healBoost][HEAL] < targetHealRequired) {
				return returnObject
			}
		}
		if (targetToughRequired && toughNeeded < targetToughRequired) {
			if (!useBoost) {
				return this.createBestRanged(parentRoom, useTough, useHeal, true, energyCap, targetRangedRequired, targetHealRequired, targetToughRequired, buildToMaxSize, opts)
			}
			else {
				return returnObject
			}
		}


		let body = [];
		let boosts = {};

		for (var i = 0; i < toughNeeded; i++) {
			body.push(TOUGH)
		}
		for (var i = 0; i < rangedNeeded; i++) {
			body.push(RANGED_ATTACK)
		}
		for (var i = 0; i < moveNeeded - 1; i++) {
			body.push(MOVE)
		}
		for (var i = 0; i < healNeeded; i++) {
			body.push(HEAL)
		}

		body.push(MOVE)

		if (toughBoost) {
			boosts[toughBoost] = toughNeeded;
		}
		if (rangedBoost) {
			boosts[rangedBoost] = rangedNeeded;
		}
		if (moveBoost) {
			boosts[moveBoost] = moveNeeded;
		}
		if (healBoost) {
			boosts[healBoost] = healNeeded;
		}

		returnObject.body = body;
		returnObject.boosts = boosts;

		return returnObject;
	},

	createBestTank(parentRoom, useTough, useBoost, energyCap, targetAttackRequired, useRanged, buildToMaxSize, useOneRanged, opts) {
		let returnObject = {body: [], boosts: []}

		energyCap = energyCap || parentRoom.energyCapacityAvailable
		opts = opts || {}
		let moveRatio = opts.moveRatio || 1

		let toughBoost
		let moveBoost
		let attackBoost
		let rangedBoost

		if (useBoost) {
			toughBoost = useTough ? parentRoom.getAvailableBoost(util.isToughBoost, 12 * LAB_BOOST_MINERAL) : undefined; 
			moveBoost = parentRoom.getAvailableBoost(util.isMoveBoost, 16 * LAB_BOOST_MINERAL);
			attackBoost = parentRoom.getAvailableBoost(util.isAttackBoost, 40 * LAB_BOOST_MINERAL);
			rangedBoost = parentRoom.getAvailableBoost(util.isRangedBoost, 20 * LAB_BOOST_MINERAL);
		}

		let moveScale = 1;
		if (moveBoost) {
			moveScale = BOOSTS[MOVE][moveBoost]["fatigue"];
		}

		let toughNeeded = toughBoost && useTough ? 1 : 0;
		let rangedNeeded = useRanged || useOneRanged ? 1 : 0;
		let attackNeeded = 1;
		let moveNeeded = Math.ceil((toughNeeded + attackNeeded + rangedNeeded) / moveScale);

		let cost = BODYPART_COST[TOUGH] * toughNeeded + BODYPART_COST[ATTACK] * attackNeeded + BODYPART_COST[RANGED_ATTACK] * rangedNeeded + BODYPART_COST[MOVE] * moveNeeded

		let lastNumMove
		let lastNumAttack
		let lastNumTough
		let lastNumRanged

		while (cost <= energyCap && toughNeeded + attackNeeded + rangedNeeded + moveNeeded <= MAX_CREEP_SIZE) {
			lastNumMove = moveNeeded
			lastNumAttack = attackNeeded
			lastNumTough = toughNeeded
			lastNumRanged = rangedNeeded

			if (!buildToMaxSize && targetAttackRequired && (attackNeeded >= targetAttackRequired || (attackBoost && attackNeeded * BOOSTS[ATTACK][attackBoost][ATTACK] >= targetAttackRequired))) {
				break;
			}

			if (toughBoost && useTough && toughNeeded < 12 && toughNeeded * 2 < attackNeeded + rangedNeeded) {
				toughNeeded++
				cost += BODYPART_COST[TOUGH]
			}
			else if (useRanged && rangedNeeded < attackNeeded) {
				rangedNeeded++
				cost += BODYPART_COST[RANGED_ATTACK]
			}
			else {
				attackNeeded++
				cost += BODYPART_COST[ATTACK]
			}

			
			while (Math.ceil(5 * (toughNeeded + attackNeeded + rangedNeeded) / moveNeeded) > (6 - moveRatio) * moveScale) {
				moveNeeded++;
				cost += BODYPART_COST[MOVE]
			}
		}

		moveNeeded = lastNumMove
		attackNeeded = lastNumAttack
		toughNeeded = lastNumTough
		rangedNeeded = lastNumRanged



		/*while (toughNeeded + attackNeeded + rangedNeeded + moveNeeded < MAX_CREEP_SIZE && cost <= energyCap - BODYPART_COST[ATTACK]) {
			if (!buildToMaxSize && targetAttackRequired && (attackNeeded >= targetAttackRequired || (attackBoost && attackNeeded * BOOSTS[ATTACK][attackBoost][ATTACK] >= targetAttackRequired))) {
				break;
			}

			// Move
			if (toughNeeded + attackNeeded + rangedNeeded + 1 > Math.floor(moveNeeded * moveScale)) {
				moveNeeded++
				cost += BODYPART_COST[MOVE]
			}
			else if (toughBoost && useTough && toughNeeded < 12 && toughNeeded * 2 < attackNeeded + rangedNeeded) {
				toughNeeded++
				cost += BODYPART_COST[TOUGH]
			}
			else if (useRanged && rangedNeeded < attackNeeded && cost <= energyCap - BODYPART_COST[RANGED_ATTACK]) {
				rangedNeeded++
				cost += BODYPART_COST[RANGED_ATTACK]
			}
			else {
				attackNeeded++
				cost += BODYPART_COST[ATTACK]
			}
		}*/



		if (targetAttackRequired && attackNeeded < targetAttackRequired) {
			if (!useBoost) {
				return this.createBestTank(parentRoom, useTough, true, energyCap, targetAttackRequired, useRanged, buildToMaxSize, useOneRanged, opts)
			}
			else if (!attackBoost || attackNeeded * BOOSTS[ATTACK][attackBoost][ATTACK] < targetAttackRequired) {
				return returnObject
			}
		}


		let body = [];
		let boosts = {};

		if (toughBoost) {			
			//for (var i = 0; i < Math.ceil(toughNeeded * .75); i++) {
			for (var i = 0; i < toughNeeded; i++) {
				body.push(TOUGH)
			}
		}
		else {
			for (var i = 0; i < toughNeeded; i++) {
				body.push(TOUGH)
			}
		}

		if (useRanged) {
			for (var i = 0; i < rangedNeeded; i++) {
				body.push(RANGED_ATTACK)
			}
		}
		else {
			if (rangedNeeded) {
				for (var i = 0; i < rangedNeeded; i++) {
					body.push(RANGED_ATTACK)
				}
			}
			for (var i = 0; i < Math.floor(attackNeeded / 2); i++) {
				body.push(ATTACK)
			}
		}

		// Tough in middle is mostly for pre-heal uncertainty. This is usually used with snakes
		// Snakes don't have this uncertainty
		/*if (toughBoost) {			
			for (var i = 0; i < Math.floor(toughNeeded * .25); i++) {
				body.push(TOUGH)
			}
		}*/


		for (var i = 0; i < moveNeeded - 1; i++) {
			body.push(MOVE)
		}

		if (useRanged) {
			for (var i = 0; i < attackNeeded; i++) {
				body.push(ATTACK)
			}
		}
		else {			
			for (var i = 0; i < Math.ceil(attackNeeded / 2); i++) {
				body.push(ATTACK)
			}
		}

		body.push(MOVE)

		if (toughBoost) {
			boosts[toughBoost] = toughNeeded;
		}
		if (moveBoost) {
			boosts[moveBoost] = moveNeeded;
		}
		if (attackBoost) {
			boosts[attackBoost] = attackNeeded;
		}
		if (rangedBoost) {
			boosts[rangedBoost] = rangedNeeded;
		}

		returnObject.body = body;
		returnObject.boosts = boosts;

		return returnObject;
	},


	createStrongholdTank(parentRoom, strongholdLevel) {
		let returnObject = {body: [], boosts: []}

		let damageToTank = getDamageToTankForLevel(strongholdLevel);

		// Do something else.
		if (damageToTank > 3000) {
			console.log("Snake tank too much to tank", damageToTank)
			Game.notify("Snake tank too much to tank" + damageToTank)
			return returnObject;
		}

		let energyCap = parentRoom.energyCapacityAvailable

		let toughBoost = parentRoom.getAvailableBoost(util.isToughBoost, 32 * LAB_BOOST_MINERAL); 
		let moveBoost = parentRoom.getAvailableBoost(util.isMoveBoost, 32 * LAB_BOOST_MINERAL);
		let attackBoost = parentRoom.getAvailableBoost(util.isAttackBoost, 40 * LAB_BOOST_MINERAL);

		if (!toughBoost || !moveBoost || !attackBoost) {
			console.log("Snake tank missing boost", toughBoost, moveBoost, attackBoost)
			Game.notify("Snake tank missing boost" + toughBoost + moveBoost + attackBoost)
			return returnObject;
		}

		let moveScale = 1;
		if (moveBoost) {
			moveScale = BOOSTS[MOVE][moveBoost]["fatigue"];
		}

		let toughNeeded = toughBoost ? Math.ceil((damageToTank / 100) * BOOSTS[TOUGH][toughBoost]["damage"] * 2) : 0;
		let attackNeeded = 10;
		let moveNeeded = Math.ceil((toughNeeded + attackNeeded) / moveScale);

		let cost = BODYPART_COST[TOUGH] * toughNeeded + BODYPART_COST[ATTACK] * attackNeeded + BODYPART_COST[MOVE] * moveNeeded

		if (cost > energyCap) {
			console.log("Snake tank energy cost too high", cost, energyCap)
			Game.notify("Snake tank energy cap" + "_" + cost + "_" + energyCap + "_" + damageToTank + "_" + toughNeeded + "_" + attackNeeded + "_" + moveNeeded + toughBoost + moveBoost + attackBoost)
			return returnObject
		}

		while (toughNeeded + attackNeeded + moveNeeded < MAX_CREEP_SIZE && cost <= energyCap - BODYPART_COST[ATTACK]) {
			// Move
			if (toughNeeded + attackNeeded + 1 > Math.floor(moveNeeded * moveScale)) {
				moveNeeded++
				cost += BODYPART_COST[MOVE]
			}
			else {
				attackNeeded++
				cost += BODYPART_COST[ATTACK]
			}
		}

		if (toughNeeded + attackNeeded + moveNeeded > MAX_CREEP_SIZE) {
			console.log("Snake tank body too big", toughNeeded, attackNeeded, moveNeeded)
			Game.notify("Snake tank body too big" + toughNeeded + attackNeeded + moveNeeded)
			return returnObject
		}

		let body = [];
		let boosts = {};

		for (var i = 0; i < toughNeeded; i++) {
			body.push(TOUGH)
		}
		for (var i = 0; i < Math.floor(attackNeeded / 2); i++) {
			body.push(ATTACK)
		}
		for (var i = 0; i < moveNeeded - 1; i++) {
			body.push(MOVE)
		}
		for (var i = 0; i < Math.ceil(attackNeeded / 2); i++) {
			body.push(ATTACK)
		}

		body.push(MOVE)

		if (toughBoost) {
			boosts[toughBoost] = toughNeeded;
		}
		if (moveBoost) {
			boosts[moveBoost] = moveNeeded;
		}
		if (attackBoost) {
			boosts[attackBoost] = attackNeeded;
		}

		returnObject.body = body;
		returnObject.boosts = boosts;

		return returnObject;
	},

	createStrongholdHealer(parentRoom, strongholdLevel) {
		let returnObject = {body: [], boosts: []}
		let damageToTank = getDamageToTankForLevel(strongholdLevel);

		// Do something else.
		if (damageToTank > 3000) {
			console.log("Snake ranged too much to tank", damageToTank)
			Game.notify("Snake ranged too much to tank" + damageToTank)
			return returnObject;
		}

		let energyCap = parentRoom.energyCapacityAvailable

		let toughBoost = parentRoom.getAvailableBoost(util.isToughBoost, 32 * LAB_BOOST_MINERAL);
		let moveBoost = parentRoom.getAvailableBoost(util.isMoveBoost, 32 * LAB_BOOST_MINERAL);
		let healBoost = parentRoom.getAvailableBoost(util.isHealBoost, 40 * LAB_BOOST_MINERAL);

		if (!toughBoost || !moveBoost || !healBoost) {
			console.log("Snake ranged missing boost", toughBoost, moveBoost, healBoost)
			Game.notify("Snake ranged missing boost" + toughBoost + moveBoost + healBoost)
			return returnObject;
		}

		let moveScale = 1;
		if (moveBoost) {
			moveScale = BOOSTS[MOVE][moveBoost]["fatigue"];
		}


		let toughNeeded = Math.ceil((damageToTank / 100) * BOOSTS[TOUGH][toughBoost]["damage"] * 2);
		let healNeeded = Math.ceil(damageToTank * BOOSTS[TOUGH][toughBoost]["damage"] / (HEAL_POWER * BOOSTS[HEAL][healBoost][HEAL]));
		let moveNeeded = Math.ceil((toughNeeded + healNeeded) / moveScale);

		let cost = BODYPART_COST[TOUGH] * toughNeeded + BODYPART_COST[HEAL] * healNeeded + BODYPART_COST[MOVE] * moveNeeded
		if (cost > energyCap) {
			console.log("Snake ranged energy cap", cost, energyCap)
			Game.notify("Snake ranged energy cap" + "_" + cost + "_" + energyCap + "_" + damageToTank + "_" + toughNeeded + "_" + healNeeded + "_" + moveNeeded + toughBoost + moveBoost + healBoost)
			return returnObject
		}

		// while (toughNeeded + healNeeded + moveNeeded < MAX_CREEP_SIZE && cost <= energyCap - BODYPART_COST[HEAL]) {
		// 	// Move
		// 	if (toughNeeded + healNeeded + 1 >= Math.floor(moveNeeded * moveScale)) {
		// 		moveNeeded++
		// 		cost += BODYPART_COST[MOVE]
		// 	}
		// 	else {
		// 		healNeeded++
		// 		cost += BODYPART_COST[HEAL]
		// 	}
		// }

		if (toughNeeded + healNeeded + moveNeeded > MAX_CREEP_SIZE) {
			console.log("Snake ranged size", toughNeeded, healNeeded, moveNeeded)
			Game.notify("Snake ranged size" + toughNeeded + healNeeded + moveNeeded)
			return returnObject
		}


		let body = [];
		let boosts = {};

		for (var i = 0; i < toughNeeded; i++) {
			body.push(TOUGH)
		}
		for (var i = 0; i < moveNeeded - 1; i++) {
			body.push(MOVE)
		}
		for (var i = 0; i < healNeeded; i++) {
			body.push(HEAL)
		}

		body.push(MOVE)

		if (toughBoost) {
			boosts[toughBoost] = toughNeeded;
		}
		if (moveBoost) {
			boosts[moveBoost] = moveNeeded;
		}
		if (healBoost) {
			boosts[healBoost] = healNeeded;
		}

		returnObject.body = body;
		returnObject.boosts = boosts;

		return returnObject;

	},


	createSeason2Imposter(parentRoom, targetRoomName) {
		let returnObject = {body: [], boosts: {}}

		let incomingDamage = Memory.rooms[targetRoomName].maxTowerDamageAtOuterWall

		let numTough = Math.ceil(incomingDamage * 0.003 + 0.001);
		let numHeal = Math.ceil(incomingDamage * 0.3 / 48 + 0.001)

		let numMove = Math.ceil((numTough + numHeal) / 4);
		let numCarry = MAX_CREEP_SIZE - numMove - numTough - numHeal

		let toughBoost = parentRoom.getAvailableBoost(util.isToughBoost, numTough * LAB_BOOST_MINERAL);
		let moveBoost = parentRoom.getAvailableBoost(util.isMoveBoost, numMove * LAB_BOOST_MINERAL);
		let healBoost = parentRoom.getAvailableBoost(util.isHealBoost, numHeal * LAB_BOOST_MINERAL);
		let carryBoost = parentRoom.getAvailableBoost(util.isCarryBoost, numCarry * LAB_BOOST_MINERAL);

		if (util.getBoostTier(toughBoost) < 3 || util.getBoostTier(moveBoost) < 3 || util.getBoostTier(healBoost) < 3 || !carryBoost) {
			return returnObject
		}

		returnObject.boosts[toughBoost] = numTough
		returnObject.boosts[healBoost] = numHeal
		returnObject.boosts[moveBoost] = numMove
		returnObject.boosts[carryBoost] = numCarry

		for (let i = 0; i < numTough; i++) {
			returnObject.body.push(TOUGH)			
		}
		for (let i = 0; i < numCarry; i++) {
			returnObject.body.push(CARRY)			
		}
		for (let i = 0; i < numHeal; i++) {
			returnObject.body.push(HEAL)			
		}
		for (let i = 0; i < numMove; i++) {
			returnObject.body.push(MOVE)			
		}


		return returnObject
	},
	
	createStrongholdSniper(parentRoom, strongholdLevel, worryAboutSK, halfMove) {
		let returnObject = {body: [], boosts: []}
		let damageToTank = getTowerDamageToTankForLevel(strongholdLevel, worryAboutSK);

		// Do something else.
		if (damageToTank > 2700) {
			console.log("Sniper ranged too much to tank", damageToTank)
			Game.notify("Sniper ranged too much to tank" + damageToTank)
			return returnObject;
		}

		let energyCap = parentRoom.energyCapacityAvailable

		let toughBoost = parentRoom.getAvailableBoost(util.isToughBoost, 9 * LAB_BOOST_MINERAL);
		let moveBoost = parentRoom.getAvailableBoost(util.isMoveBoost, 10 * LAB_BOOST_MINERAL);
		let healBoost = parentRoom.getAvailableBoost(util.isHealBoost, 17 * LAB_BOOST_MINERAL);
		let rangedBoost = parentRoom.getAvailableBoost(util.isRangedBoost, 21 * LAB_BOOST_MINERAL);

		if (!toughBoost || !moveBoost || !healBoost || !rangedBoost) {
			console.log("Sniper ranged missing boost", toughBoost, moveBoost, healBoost, rangedBoost)
			Game.notify("Sniper ranged missing boost" + toughBoost + moveBoost + healBoost + rangedBoost)
			return returnObject;
		}

		let moveScale = 1;
		if (moveBoost) {
			moveScale = BOOSTS[MOVE][moveBoost]["fatigue"];
		}
		if (halfMove) {
			moveScale *= 2;
		}


		let toughNeeded = Math.ceil((damageToTank / 100) * BOOSTS[TOUGH][toughBoost]["damage"]);
		let healNeeded = Math.ceil(damageToTank * BOOSTS[TOUGH][toughBoost]["damage"] / (HEAL_POWER * BOOSTS[HEAL][healBoost][HEAL]));
		let rangedNeeded = 10;
		let moveNeeded = Math.ceil((toughNeeded + healNeeded + rangedNeeded) / moveScale);

		let cost = BODYPART_COST[TOUGH] * toughNeeded + BODYPART_COST[HEAL] * healNeeded + BODYPART_COST[MOVE] * moveNeeded + BODYPART_COST[RANGED_ATTACK] * rangedNeeded
		if (cost > energyCap) {
			console.log("Sniper ranged energy cap", cost, energyCap)
			Game.notify("Sniper ranged energy cap" + "_" + cost + "_" + energyCap + "_" + damageToTank + "_" + toughNeeded + "_" + healNeeded + "_" + moveNeeded + toughBoost + moveBoost + healBoost)
			return returnObject
		}

		while (toughNeeded + healNeeded + rangedNeeded + moveNeeded < MAX_CREEP_SIZE && cost <= energyCap - BODYPART_COST[RANGED_ATTACK]) {
			// Move
			if (toughNeeded + healNeeded + rangedNeeded + 1 > Math.floor(moveNeeded * moveScale)) {
				moveNeeded++
				cost += BODYPART_COST[MOVE]
			}
			else {
				rangedNeeded++
				cost += BODYPART_COST[RANGED_ATTACK]
			}
		}

		if (toughNeeded + healNeeded + moveNeeded + rangedNeeded > MAX_CREEP_SIZE) {
			console.log("Sniper ranged size", toughNeeded, healNeeded, moveNeeded, rangedNeeded)
			Game.notify("Sniper ranged size" + toughNeeded + healNeeded + moveNeeded + rangedNeeded)
			return returnObject
		}


		let body = [];
		let boosts = {};

		for (var i = 0; i < toughNeeded; i++) {
			body.push(TOUGH)
		}
		for (var i = 0; i < rangedNeeded; i++) {
			body.push(RANGED_ATTACK)
		}
		for (var i = 0; i < moveNeeded - 1; i++) {
			body.push(MOVE)
		}
		for (var i = 0; i < healNeeded; i++) {
			body.push(HEAL)
		}

		body.push(MOVE)

		if (toughBoost) {
			boosts[toughBoost] = toughNeeded;
		}
		if (moveBoost) {
			boosts[moveBoost] = moveNeeded;
		}
		if (rangedBoost) {
			boosts[rangedBoost] = rangedNeeded;
		}
		if (healBoost) {
			boosts[healBoost] = healNeeded;
		}

		returnObject.body = body;
		returnObject.boosts = boosts;

		return returnObject;

	},

	getHarvesterNumWorkWorkMove(count, opts) {
		opts = opts || {};
		count = count || MAX_CREEP_SIZE

		// Takes some time to move to the source
		let modifiedCreepLifeTime = CREEP_LIFE_TIME - (opts.boost ? 100 : 50)

		// Assume 3k sources
		// cpuPerTickHarvest = INTENT_CPU_COST * (SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME) / (workParts * 2)
		var energyPerTickWork = BODYPART_COST[WORK] / modifiedCreepLifeTime
		var energyPerTickMove = BODYPART_COST[MOVE] / modifiedCreepLifeTime
		// combinedCostPerTick = cpuPerTickHarvest * Game.energyPerCPU + workParts * energyPerTickWork
		// So - mimimize:
		// v = Game.energyPerCPU * INTENT_CPU_COST * (SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME) / (4 * workWorkMove) + (2 * workWorkMove * energyPerTickWork + workWorkMove * energyPerTickMove)
		// Declaring:
		// a = Game.energyPerCPU * INTENT_CPU_COST * (SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME)
		// x = workWorkMove
		// So: v = (a / 4x) + x(2 * energyPerTickWork + energyPerTickMove)
		// dv/dx = -a / (4(x^2)) + 2 * energyPerTickWork + energyPerTickMove = 0
		// a / (4 * (2 * energyPerTickWork + energyPerTickMove)) = (x^2)
		// x = sqrt(a / (8 * energyPerTickWork + energyPerTickMove))
		// var numWorkWorkMove = Math.sqrt(Game.energyPerCPU * INTENT_CPU_COST * (SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME) / (4 * (energyPerTickWork + energyPerTickWork + energyPerTickMove)))
		let sourceEnergy = SOURCE_ENERGY_CAPACITY;
		let harvestPower = HARVEST_POWER;

		if (Memory.season3 && opts.singleSourceRoom) {
			sourceEnergy *= 2
		}

		if (opts.boost && BOOSTS[WORK][opts.boost] && BOOSTS[WORK][opts.boost]["harvest"]) {
			harvestPower *= BOOSTS[WORK][opts.boost]["harvest"] 

			energyPerTickWork += LAB_BOOST_ENERGY / modifiedCreepLifeTime
			if (Memory.marketInfo && Memory.marketInfo.avgIValues && Memory.marketInfo.avgIValues[opts.boost] && Memory.marketInfo.energyPrice) {
				energyPerTickWork += (LAB_BOOST_MINERAL / modifiedCreepLifeTime) * Memory.marketInfo.avgIValues[opts.boost] / Memory.marketInfo.energyPrice
			}
			else {
			 	console.log("getHarvesterNumWorkWorkMove no boost value", boost)
			 	energyPerTickWork += (LAB_BOOST_MINERAL / modifiedCreepLifeTime)
			}
			// There's some overhead moving all this shit around. Terminal stuff is costed in.
			// Techs cost ~1 energy/tick, but are used for other shit. Also making it bigger doesn't actually
			// increase tech work much - not many boosts needed and it's busy moving shit anyway
			// energyPerTickWork += (LAB_BOOST_MINERAL / modifiedCreepLifeTime)

			 // count = Math.ceil(count / BOOSTS[WORK][opts.boost]["harvest"])

		}

		if (opts.powerLevel !== undefined) {
			sourceEnergy += POWER_INFO[PWR_REGEN_SOURCE].effect[opts.powerLevel] * ENERGY_REGEN_TIME / POWER_INFO[PWR_REGEN_SOURCE].period
		}

		let yieldPerCPU = Memory.stats.yieldPerCPU || 0;

		let numWorkWorkMove = Math.sqrt(yieldPerCPU * INTENT_CPU_COST * (sourceEnergy / ENERGY_REGEN_TIME) / (2 * harvestPower * (2 * energyPerTickWork + energyPerTickMove)))

		let int_numWorkWorkMove = Math.max(Math.ceil(sourceEnergy / (2 * harvestPower * ENERGY_REGEN_TIME)), Math.min(count, Math.round(numWorkWorkMove)))

		// Can hit this with power!
		int_numWorkWorkMove = Math.min(int_numWorkWorkMove, Math.floor(MAX_CREEP_SIZE / 3) - 1);

		return int_numWorkWorkMove;
	},

	getDoubleHarvesterNumWorkWorkMove(count, opts) {
		opts = opts || {};
		count = count || MAX_CREEP_SIZE

		// Assume 3k sources
		// cpuPerTickHarvest = INTENT_CPU_COST * (SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME) / (workParts * 2)
		var energyPerTickWork = BODYPART_COST[WORK] / CREEP_LIFE_TIME
		var energyPerTickMove = BODYPART_COST[MOVE] / CREEP_LIFE_TIME
		// combinedCostPerTick = cpuPerTickHarvest * Game.energyPerCPU + workParts * energyPerTickWork
		// So - mimimize:
		// v = Game.energyPerCPU * INTENT_CPU_COST * (SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME) / (workWorkMove) + (2 * workWorkMove * energyPerTickWork + workWorkMove * energyPerTickMove)
		// a = Game.energyPerCPU * INTENT_CPU_COST * (SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME)
		// x = workWorkMove
		// So: v = (a / x) + x(2 * energyPerTickWork + energyPerTickMove)
		// dv/dx = -a / (x^2) + 2 * energyPerTickWork + energyPerTickMove = 0
		// a / (2 * energyPerTickWork + energyPerTickMove) = (x^2)
		// x = sqrt(a / 2 * energyPerTickWork + energyPerTickMove)
		// var numWorkWorkMove = Math.sqrt(Game.energyPerCPU * INTENT_CPU_COST * (SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME) / (4 * (energyPerTickWork + energyPerTickWork + energyPerTickMove)))
		let sourceEnergy = 2 * SOURCE_ENERGY_CAPACITY;

		if (opts.powerLevel !== undefined) {
			sourceEnergy += POWER_INFO[PWR_REGEN_SOURCE].effect[opts.powerLevel] * ENERGY_REGEN_TIME / POWER_INFO[PWR_REGEN_SOURCE].period
		}

		let yieldPerCPU = Memory.stats.yieldPerCPU || 0;

		let numWorkWorkMove = Math.sqrt(yieldPerCPU * INTENT_CPU_COST * (sourceEnergy / ENERGY_REGEN_TIME) / (4 * (2 * energyPerTickWork + energyPerTickMove)))

		let int_numWorkWorkMove = Math.max(Math.ceil(sourceEnergy / (2 * HARVEST_POWER * ENERGY_REGEN_TIME)), Math.min(count, Math.round(numWorkWorkMove)))

		// Can hit this with power!
		int_numWorkWorkMove = Math.min(int_numWorkWorkMove, Math.floor(MAX_CREEP_SIZE / 3) - 1);

		return int_numWorkWorkMove;
	},

	getDesignForEnergyCap(role, energyCap, highUtilization, altDesign, willUseRoads, opts) {
		opts = opts || {}
		var hash = role + "_" + energyCap.toString() + "_" + highUtilization.toString() + "_" + altDesign.toString() + "_" + willUseRoads.toString() + "_" + JSON.stringify(opts);

		if (!global._designs) global._designs = {};

		var design = []
		let count
		let count1
		let count2
		if (!global._designs[hash] || Math.random() < 1 / 1000.) {
			switch (role) {
				case ("dummy"):
					design.push(MOVE)
					break;
				case ("sbs"):
					if (energyCap <= 2300) {
						design.push(CARRY)
						design.push(MOVE)
					}
					else if (energyCap <= 5600) {
						design.push(CARRY)
						design.push(CARRY)
						design.push(MOVE)
					}
					else {
						design.push(CARRY)
						design.push(CARRY)
						design.push(CARRY)
						design.push(CARRY)
						design.push(MOVE)
					}
					break;
				case ("ss"):
					if (energyCap <= 1300) {
						design.push(CARRY)
						design.push(MOVE)
					}
					else {
						if (opts.cheap) {
							opts.cheap = Math.min(opts.cheap, 3)
						}
						if (opts.cheap == 3) {
							for (let i = 0; i < 2; i++) {
								design.push(CARRY)
							}
							design.push(MOVE)
						}
						else if (opts.cheap == 2) {
							for (let i = 0; i < 4; i++) {
								design.push(CARRY)
							}
							design.push(MOVE)
						}
						else if (opts.cheap == 1) {
							for (let i = 0; i < 8; i++) {
								design.push(CARRY)
							}
							design.push(MOVE)
						}
						else {
							if (altDesign && energyCap >= 1650) {
								for (let i = 0; i < 32; i++) {
									design.push(CARRY)
								}
								design.push(MOVE)
							}
							else {
								for (let i = 0; i < 16; i++) {
									design.push(CARRY)
								}
								design.push(MOVE)
							}
						}
					}

					break;
				case ("advLabManager"):
					if (altDesign) {
						// Max 1000 carry.
						count = Math.floor(Math.min(energyCap, 1250) / 250)
						if (count > Math.floor(MAX_CREEP_SIZE / 5)) count = Math.floor(MAX_CREEP_SIZE / 5)
						for (var i = 0; i < count; i++) {
							design.push(CARRY)
							design.push(CARRY)
							design.push(CARRY)
							design.push(CARRY)
						}
						for (var i = 0; i < count; i++) {
							design.push(MOVE)
						}
					}
					else {
						// RCL 6, or battered, 400 carry
						if (energyCap < 4000) {
							count = Math.floor((Math.min(energyCap, 1000) / 2.) / 250)
						}
						// 600 carry
						else if (energyCap < 6000) {
							count = Math.floor((Math.min(energyCap, 1500) / 2.) / 250)
						}
						// Max 800 carry.
						else {							
							count = Math.floor((Math.min(energyCap, 2000) / 2.) / 250)
						}
						if (count > Math.floor(MAX_CREEP_SIZE / 5)) count = Math.floor(MAX_CREEP_SIZE / 5)
						for (var i = 0; i < count; i++) {
							design.push(CARRY)
							design.push(CARRY)
							design.push(CARRY)
							design.push(CARRY)
						}
						for (var i = 0; i < count; i++) {
							design.push(MOVE)
						}
					}
					break
				case ("labTech"):
					if (altDesign) {
						// Max 1000 carry.
						count = Math.floor(Math.min(energyCap, 1500) / 150)
						if (count > Math.floor(MAX_CREEP_SIZE / 3)) count = Math.floor(MAX_CREEP_SIZE / 3)
						for (var i = 0; i < count; i++) {
							design.push(CARRY)
							design.push(CARRY)
						}
						for (var i = 0; i < count; i++) {
							design.push(MOVE)
						}
					}
					else {
						// RCL 6, or battered, 300 carry
						if (energyCap < 4000) {
							count = Math.floor((Math.min(energyCap, 900) / 2.) / 150)
						}
						// 500 carry
						else if (energyCap < 6000) {
							count = Math.floor((Math.min(energyCap, 1500) / 2.) / 150)
						}
						// Max 600 carry.
						else {							
							count = Math.floor((Math.min(energyCap, 1800) / 2.) / 150)
						}
						if (count > Math.floor(MAX_CREEP_SIZE / 3)) count = Math.floor(MAX_CREEP_SIZE / 3)
						for (var i = 0; i < count; i++) {
							design.push(CARRY)
							design.push(CARRY)
						}
						for (var i = 0; i < count; i++) {
							design.push(MOVE)
						}
					}
					break
				case ("testTransporter"):
					design.push(CARRY)
					design.push(MOVE)
					break
				case ("season2ScoreShuffler"):
					count = Math.min(Math.floor(MAX_CREEP_SIZE / 3), Math.floor(energyCap / 150))

					for (let i = 0; i < Math.min(count, (opts.veryLarge ? 16 : opts.large ? 8 : 2)); i++) {						
						design.push(CARRY)
						design.push(CARRY)
						design.push(MOVE)
					}
					break
				case ("powerShuffler"):
					design.push(CARRY)
					design.push(CARRY)
					design.push(MOVE)
					break
				case("safeModeGenerator"):
					for (var i = 0; i < 10; i++) {
						design.push(CARRY)
						design.push(CARRY)
						design.push(MOVE)
					}
					break
				case("intershardSMG"):
					if (energyCap >= 2000) {
						for (var i = 0; i < 20; i++) {
							design.push(MOVE)
						}
						for (var i = 0; i < 20; i++) {
							design.push(CARRY)
						}
					}
					break

				case ("baseManager"):
					let limit
					let div

					if (altDesign) {
						limit = 2500
						div = 2.1
					}
					else {
						if (energyCap >= 8000) {
							limit = 5500
							div = 2.1
						}
						// RCL 7 needs a bit more as we need to feed
						// the upgraders and fill extensions
						else if (energyCap > 5000) {
							limit = 5500
							div = opts.restrictUpgraders ? 2.1 : 1.8
						}
						else {
							limit = energyCap * 2.1
							div = opts.restrictUpgraders ? 2.3 : 2.1
						}
					}

					if (opts.extensionEnergy !== undefined) {						
						console.log("BM throttling A", opts.extensionEnergy, Math.min(energyCap, limit / div), Math.floor(Math.min(energyCap, limit / div) / 150))

						if (opts.extensionEnergy > 0.96)  {
							// Lose up to 75% size.
							// 0 going to -0.04, negative so += lowers limit
							if (opts.lotsOfUpgrading >= 3) {
							}
							else if (opts.lotsOfUpgrading == 2) {
								limit += (0.96 - opts.extensionEnergy) * 25 * limit * 0.25
							}
							else if (opts.lotsOfUpgrading == 1) {
								limit += (0.96 - opts.extensionEnergy) * 25 * limit * 0.5
							}
							else {
								limit += (0.96 - opts.extensionEnergy) * 25 * limit * 0.75
							}
						}
						else {
							// Every 0.025 we are below gain 10% size.
							limit += (0.96 - opts.extensionEnergy) * 25 * limit * 0.1
						}

						console.log("BM throttling B", opts.extensionEnergy, Math.min(energyCap, limit / div), Math.floor(Math.min(energyCap, limit / div) / 150))
					}

					// Won't have so many extensions to fill
					if (opts.smallHaulers) {
						limit *= 0.7
					}
					// if (opts.small) {
					// 	limit *= 0.5
					// }

					if (willUseRoads) {
						count = Math.floor(Math.min(energyCap, limit / div) / 150)
						count = Math.max(1, count)
						if (energyCap >= 8000) {
							count = Math.max(2, count)
						}

						if (count > Math.floor(MAX_CREEP_SIZE / 3)) count = Math.floor(MAX_CREEP_SIZE / 3)
						for (var i = 0; i < count; i++) {
							design.push(CARRY)
							design.push(CARRY)
							design.push(MOVE)
						}
						if (count == 0 && energyCap >= 100) {
							design.push(CARRY)
							design.push(MOVE)
						}
					}
					else {
						count = Math.floor(Math.min(energyCap, limit / div) / 100)
						count = Math.max(1, count)

						if (energyCap >= 8000) {
							count = Math.max(2, count)
						}

						if (count > Math.floor(MAX_CREEP_SIZE / 2)) count = Math.floor(MAX_CREEP_SIZE / 2)
						for (var i = 0; i < count; i++) {
							design.push(CARRY)
							design.push(MOVE)
						}
					}
					break;

				case ("harvester"):
				case ("bHarvester"):
				case ("doubleHarvester"):
					// Altdesign means stay at home

					count1 = Math.floor(energyCap / 250)
					count2 = Math.floor((energyCap - 50) / 250)

					// console.log("Harvester opts", count1, count2, altDesign, JSON.stringify(opts))

					if (count1 == 0) {
						design.push(WORK)
						design.push(MOVE)
					}
					if (count1 == 1) {
						design.push(WORK)
						design.push(MOVE)
						design.push(WORK)
					}
					else if (count1 == 2) {
						// Assume it's not reserved, in which case 3 work is fine.
						if (!altDesign) {
							design.push(WORK)
							design.push(WORK)
							design.push(MOVE)
							design.push(MOVE)
							design.push(WORK)
						}
						else {
							design.push(WORK)
							design.push(WORK)
							design.push(WORK)
							design.push(MOVE)
							design.push(MOVE)
							design.push(WORK)
						}
					}
					else if (count1 == 3 && count2 == 2) {
						// Assume it's not reserved, in which case 3 work is fine.
						if (!altDesign) {
							design.push(WORK)
							design.push(WORK)
							design.push(MOVE)
							design.push(MOVE)
							design.push(WORK)
						}
						else {
							design.push(WORK)
							design.push(WORK)
							design.push(WORK)
							design.push(WORK)
							design.push(MOVE)
							design.push(MOVE)
							design.push(MOVE)
							design.push(WORK)
						}
					}
					else if (count2 == 3) {
						design.push(WORK)
						design.push(WORK)
						design.push(WORK)
						design.push(WORK)
						design.push(WORK)

						design.push(CARRY)
						design.push(MOVE)
						design.push(MOVE)
						design.push(MOVE)

						design.push(WORK)
					}
					else if (count2 > 3) {
						if ((highUtilization || Memory.stats.avgBucket >= 9000 || Memory.stats.bucket == 10000) && opts.powerLevel === undefined && role != "doubleHarvester") {
							if (Memory.season3 && opts.singleSourceRoom) {
								if (count2 == 4) {
									design.push(WORK)
									design.push(WORK)
									design.push(WORK)
									design.push(WORK)
									design.push(WORK)
									design.push(WORK)
									design.push(WORK)

									design.push(CARRY)
									design.push(MOVE)
									design.push(MOVE)
									design.push(MOVE)
									design.push(MOVE)

									design.push(WORK)
								}
								else if (count2 == 5) {
									design.push(WORK)
									design.push(WORK)
									design.push(WORK)
									design.push(WORK)
									design.push(WORK)
									design.push(WORK)
									design.push(WORK)
									design.push(WORK)
									design.push(WORK)

									design.push(CARRY)
									design.push(MOVE)
									design.push(MOVE)
									design.push(MOVE)
									design.push(MOVE)
									design.push(MOVE)

									design.push(WORK)

								}
								else if (count2 >= 6) {
									design.push(WORK)
									design.push(WORK)
									design.push(WORK)
									design.push(WORK)
									design.push(WORK)
									design.push(WORK)
									design.push(WORK)
									design.push(WORK)
									design.push(WORK)
									design.push(WORK)

									design.push(CARRY)
									design.push(MOVE)
									design.push(MOVE)
									design.push(MOVE)
									design.push(MOVE)
									design.push(MOVE)
									design.push(MOVE)

									design.push(WORK)
								}							
							}
							else {								
								design.push(WORK)
								design.push(WORK)
								design.push(WORK)
								design.push(WORK)
								design.push(WORK)

								design.push(CARRY)
								design.push(MOVE)
								design.push(MOVE)
								design.push(MOVE)

								design.push(WORK)
							}

						}
						else {
							let cost 
							if (altDesign) {
								cost = 0;
							}
							else {
								cost = BODYPART_COST[CARRY];
							}

							let int_numWorkWorkMove;
							if (role == "doubleHarvester") {
								int_numWorkWorkMove = this.getDoubleHarvesterNumWorkWorkMove(count2, opts)
							}
							else {
							 	int_numWorkWorkMove = this.getHarvesterNumWorkWorkMove(count2, opts)
							}

							// if (altDesign) {
							// 	int_numWorkWorkMove = Math.max(6, Math.min(count2, Math.floor(int_numWorkWorkMove / 6) * 6));
							// }

							for (var i = 0; i < int_numWorkWorkMove; i++) {
								if (cost + BODYPART_COST[WORK] * 2 + BODYPART_COST[MOVE] > energyCap || design.length + 3 > MAX_CREEP_SIZE) {
									int_numWorkWorkMove = i;
									break
								}

								design.push(WORK)
								design.push(WORK)
								cost += BODYPART_COST[WORK] * 2 + BODYPART_COST[MOVE]
							}

							// How many carry do I need?
							if (altDesign) {
								var energyPerTickCarry = BODYPART_COST[CARRY] / CREEP_LIFE_TIME
								// cpuPerTickTransfer = INTENT_CPU_COST * (SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME) / (carryParts * 50)
								// combinedCostPerTick = cpuPerTickTransfer * Game.energyPerCPU + carryParts * energyPerTickCarry
								// So - mimimize:
								// Game.energyPerCPU * INTENT_CPU_COST * (SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME) / (carryParts * 50) + carryParts * energyPerTickCarry
								// Game.energyPerCPU * INTENT_CPU_COST * (SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME) / 50 + carryParts*carryParts*energyPerTickCarry
								let yieldPerCPU = Memory.stats.yieldPerCPU || 0;
								let sourceEnergy = SOURCE_ENERGY_CAPACITY;

								if (Memory.season3 && opts.singleSourceRoom) {
									sourceEnergy *= 2
								}

								if (opts.powerLevel !== undefined) {
									sourceEnergy += POWER_INFO[PWR_REGEN_SOURCE].effect[opts.powerLevel] * ENERGY_REGEN_TIME / POWER_INFO[PWR_REGEN_SOURCE].period
								}
								
								let numCarry = Math.sqrt(yieldPerCPU * INTENT_CPU_COST * (sourceEnergy / ENERGY_REGEN_TIME) / (50 * energyPerTickCarry))
								var int_numCarry = Math.round(numCarry) 

								var energyLeft = energyCap - int_numWorkWorkMove * (2 * BODYPART_COST[WORK] + BODYPART_COST[MOVE]);


								int_numCarry = Math.min(int_numCarry, Math.ceil(energyLeft / BODYPART_COST[CARRY]))
								int_numCarry = Math.min(int_numCarry, MAX_CREEP_SIZE - int_numWorkWorkMove * 3);

								for (var i = 0; i < Math.max(1, int_numCarry); i++) {
									if (cost + BODYPART_COST[CARRY] > energyCap || design.length + 1 > MAX_CREEP_SIZE) {
										break
									}
									design.push(CARRY)
									cost += BODYPART_COST[CARRY]
								}
							}
							else {
								design.push(CARRY)
							}

							for (var i = 0; i < int_numWorkWorkMove; i++) {
								design.push(MOVE)
							}

							// Oh shit. To be honest, should loop this into above but this also works...
							if (cost > energyCap) {
								design = []
								design.push(WORK)
								design.push(WORK)
								design.push(WORK)
								design.push(WORK)
								design.push(WORK)

								design.push(CARRY)
								design.push(MOVE)
								design.push(MOVE)
								design.push(MOVE)
								
								design.push(WORK)
							}
						}
					}
					break;
				case ("centralHarvester"):
					count1 = Math.floor(energyCap / 250)
					count2 = Math.floor((energyCap - 50) / 250)

					if (count1 == 0) {
						design.push(WORK)
						design.push(MOVE)
					}
					if (count1 == 1) {
						design.push(WORK)
						design.push(WORK)
						design.push(MOVE)
					}
					else if (count1 == 2) {
						design.push(WORK)
						design.push(WORK)
						design.push(WORK)
						design.push(WORK)
						design.push(MOVE)
						design.push(MOVE)
					}
					else if (count2 == 3) {
						design.push(WORK)
						design.push(WORK)
						design.push(WORK)
						design.push(WORK)
						design.push(WORK)
						design.push(WORK)

						if (energyCap >= 950) {
							design.push(WORK)
						}

						design.push(CARRY)
						design.push(MOVE)
						design.push(MOVE)
						design.push(MOVE)

						if (energyCap >= 950) {
							design.push(MOVE)
						}
					}
					else if (count2 > 3) {
						if (highUtilization || Memory.stats.avgBucket >= 9000) {
							// Technically need 7 - 13.333 energy/tick.
							for (let i = 0; i < 8; i++) {
								design.push(WORK)
							}
							design.push(CARRY)
							design.push(MOVE)
							design.push(MOVE)
							design.push(MOVE)
							design.push(MOVE)
						}
						else {
							// Assume 3k sources
							// cpuPerTickHarvest = INTENT_CPU_COST * (SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME) / (workParts * 2)
							var energyPerTickWork = BODYPART_COST[WORK] / CREEP_LIFE_TIME
							var energyPerTickMove = BODYPART_COST[MOVE] / CREEP_LIFE_TIME
							// combinedCostPerTick = cpuPerTickHarvest * Game.energyPerCPU + workParts * energyPerTickWork
							// So - mimimize:
							// v = Game.energyPerCPU * INTENT_CPU_COST * (SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME) / (workWorkMove) + (2 * workWorkMove * energyPerTickWork + workWorkMove * energyPerTickMove)
							// a = Game.energyPerCPU * INTENT_CPU_COST * (SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME)
							// x = workWorkMove
							// So: v = (a / x) + x(2 * energyPerTickWork + energyPerTickMove)
							// dv/dx = -a / (x^2) + 2 * energyPerTickWork + energyPerTickMove = 0
							// a / (2 * energyPerTickWork + energyPerTickMove) = (x^2)
							// x = sqrt(a / 2 * energyPerTickWork + energyPerTickMove)
							// var numWorkWorkMove = Math.sqrt(Game.energyPerCPU * INTENT_CPU_COST * (SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME) / (4 * (energyPerTickWork + energyPerTickWork + energyPerTickMove)))
							let yieldPerCPU = Memory.stats.yieldPerCPU || 0;

							let numWorkWorkMove = Math.sqrt(yieldPerCPU * INTENT_CPU_COST * (SOURCE_ENERGY_KEEPER_CAPACITY / ENERGY_REGEN_TIME) / (4 * (2 * energyPerTickWork + energyPerTickMove)))

							var int_numWorkWorkMove = Math.max(4, Math.min(count2, Math.round(numWorkWorkMove)))

							// Just in case.
							int_numWorkWorkMove = Math.min(int_numWorkWorkMove, Math.floor(MAX_CREEP_SIZE / 3) - 1);

							for (var i = 0; i < int_numWorkWorkMove; i++) {
								design.push(WORK)
								design.push(WORK)
							}

							design.push(CARRY)

							for (var i = 0; i < int_numWorkWorkMove; i++) {
								design.push(MOVE)
							}
						}
					}
					break;
				case ("miner"):
					if (energyCap > 450) {
						count = Math.floor((energyCap) / 450)
						var maxBodySize = false;
						if (count > Math.floor((MAX_CREEP_SIZE) / 5)) {
							maxBodySize = true;
							count = Math.floor((MAX_CREEP_SIZE) / 5)
						}

						for (var i = 0; i < count * 4 - 1; i++) {
							design.push(WORK)
						}

						// if (maxBodySize) {
						// 	design.push(WORK)
						// 	design.push(WORK)
						// 	design.push(WORK)
						// 	design.push(MOVE)
						// }

						for (var i = 0; i < count; i++) {
							design.push(MOVE)
						}

						design.push(WORK)
					}
					else {
						design.push(WORK)
						design.push(WORK)
						design.push(MOVE)
					}

					break;
				case ("childMiner"):
					// TODO: Add carry for neighbour to container
					count = Math.floor(energyCap / 100)
					for (var i = 0; i < Math.min(MAX_CREEP_SIZE, count) - (opts.boosted ? 3 : 1); i++) {
						design.push(WORK)
					}
					for (var i = 0; i < (opts.boosted ? 3 : 1); i++) {
						design.push(CARRY)
					}
					break;

				case "season2ContainerManager":
					for (let i = 0; i < 7; i++) {
						design.push(WORK)
					}
					design.push(CARRY)
					for (let i = 0; i < 8; i++) {
						design.push(MOVE)
					}
					design.push(WORK)


					break

				case "season5ThoriumMiner":
					// Building for RCL 6 2300
					if (willUseRoads) {
						for (let i = 0; i < 15; i++) {
							design.push(WORK)
						}
						design.push(CARRY)
						design.push(CARRY)
						for (let i = 0; i < 9; i++) {
							design.push(MOVE)
						}
						design.push(WORK)
					} else {
						/*if (energyCap > 4000) {
							for (let i = 0; i < 22; i++) {
								design.push(WORK)
							}
							design.push(CARRY)
							design.push(CARRY)
							for (let i = 0; i < 27; i++) {
								design.push(MOVE)
							}
							design.push(WORK)
						} else*/ {
							for (let i = 0; i < 13; i++) {
								design.push(WORK)
							}
							design.push(CARRY)
							design.push(CARRY)
							for (let i = 0; i < 16; i++) {
								design.push(MOVE)
							}
							design.push(WORK)
						}
					}


					break
				case "roadTransporter":
				case ("fetcher"):
					if (opts.phatHaulers) {
						if (energyCap >= 1250 && altDesign == 1) {
							count = Math.floor((energyCap - 300) / 250)
							if (count > Math.floor((MAX_CREEP_SIZE - 5) / 5)) {
								count = Math.floor((MAX_CREEP_SIZE - 5) / 5)
							}

							for (var i = 0; i < count; i++) {
								design.push(CARRY)
								design.push(CARRY)
								design.push(CARRY)
								design.push(CARRY)
								design.push(MOVE)
							}

							design.push(CARRY)
							design.push(CARRY)
							design.push(CARRY)
							design.push(WORK)
							design.push(MOVE)
						}
						else if (energyCap >= 3000 && altDesign == 2) {
							count = Math.floor((energyCap - 350) / 250)
							if (count > Math.floor((MAX_CREEP_SIZE - 5) / 5)) {
								count = Math.floor((MAX_CREEP_SIZE - 5) / 5)
							}

							for (var i = 0; i < count; i++) {
								design.push(CARRY)
								design.push(CARRY)
								design.push(CARRY)
								design.push(CARRY)
								design.push(MOVE)
							}

							design.push(CARRY)
							design.push(CARRY)
							design.push(WORK)
							design.push(WORK)
							design.push(MOVE)
						}
						else {
							count = Math.floor(energyCap / 250)
							if (count > Math.floor(MAX_CREEP_SIZE / 5)) {
								count = Math.floor(MAX_CREEP_SIZE / 5)
							}
							for (var i = 0; i < count; i++) {
								design.push(CARRY)
								design.push(CARRY)
								design.push(CARRY)
								design.push(CARRY)
								design.push(MOVE)
							}
						}
					}
					else {
						let origEnergyCap = energyCap
						if (opts.verySmall) {
							energyCap = Math.round(11.5 * Math.pow(energyCap, 0.47));
							// 1-1-1-2-2-2-4-6
							if (opts.effectiveNumSpawns === 1) {
								energyCap = Math.min(energyCap, 300)
							}
							else if (opts.effectiveNumSpawns >= 2.5) {
								energyCap = Math.max(energyCap, 900)
							}
							else if (opts.effectiveNumSpawns >= 1.5) {
								energyCap = Math.max(energyCap, 600)
							}
						}
						else if (opts.small) {
							energyCap = 1.5 * Math.round(11.5 * Math.pow(energyCap, 0.47));
							// 1-2-2-3-3-4-6-9
							if (energyCap > 1200) {
								energyCap = 1200
							}
							// 1-2-2-3-3-4-6-8 (for links)
							if (opts.effectiveNumSpawns === 1) {
								energyCap = Math.min(energyCap, 600)
							}
							else if (opts.effectiveNumSpawns >= 2.5) {
								energyCap = Math.max(energyCap, 1200)
							}
							if (opts.effectiveNumSpawns >= 1.5) {
								energyCap = Math.max(energyCap, 950)
							}							
						}
						else if (opts.medium) {
							energyCap = 2 * Math.round(11.5 * Math.pow(energyCap, 0.47));
							// 2-2-3-4-5-5-8-13

							if (opts.effectiveNumSpawns === 1) {
								energyCap = Math.min(energyCap, 750)
							}
							else if (opts.effectiveNumSpawns >= 2.5) {
								energyCap = Math.max(energyCap, 1950)
							}
							else if (opts.effectiveNumSpawns >= 1.5) {
								energyCap = Math.max(energyCap, 1250)
							}						
						}

						if (energyCap < (willUseRoads ? 300 : 200)) {
							energyCap = (willUseRoads ? 300 : 200)
						}

						if (energyCap > origEnergyCap) {
							energyCap = origEnergyCap
						}

						if (energyCap >= 1200 && altDesign == 1) {
							count = Math.floor((energyCap - 200) / 150)
							var maxBodySize = false;
							if (count > Math.floor((MAX_CREEP_SIZE - 3) / 3)) {
								maxBodySize = true;
								count = Math.floor((MAX_CREEP_SIZE - 3) / 3)
							}

							for (var i = 0; i < count; i++) {
								design.push(CARRY)
								design.push(CARRY)
								design.push(MOVE)
							}
							design.push(CARRY)

							if (maxBodySize && count * 150 + 200 + 100 <= energyCap) {
								design.push(CARRY)
								design.push(MOVE)
							}

							design.push(WORK)
							design.push(MOVE)
						}
						else if (energyCap >= 2600 && altDesign == 2) {
							count = Math.floor((energyCap - 350) / 150)
							var maxBodySize = false;
							if (count > Math.floor((MAX_CREEP_SIZE - 5) / 3)) {
								count = Math.floor((MAX_CREEP_SIZE - 5) / 3)
							}

							for (var i = 0; i < count; i++) {
								design.push(CARRY)
								design.push(CARRY)
								design.push(MOVE)
							}
							design.push(CARRY)
							design.push(MOVE)
							design.push(WORK)
							design.push(WORK)
							design.push(MOVE)
						}
						else if (energyCap >= 2650 && altDesign == 3) {
							count = Math.floor((energyCap - 400) / 150)
							var maxBodySize = false;
							if (count > Math.floor((MAX_CREEP_SIZE - 5) / 3)) {
								count = Math.floor((MAX_CREEP_SIZE - 5) / 3)
							}

							for (var i = 0; i < count; i++) {
								design.push(CARRY)
								design.push(CARRY)
								design.push(MOVE)
							}
							design.push(WORK)
							design.push(MOVE)
							design.push(WORK)
							design.push(WORK)
							design.push(MOVE)
						}
						else {
							if (willUseRoads) {
								count = Math.floor(energyCap / 150)
								if (count > Math.floor(MAX_CREEP_SIZE / 3)) count = Math.floor(MAX_CREEP_SIZE / 3)
								for (var i = 0; i < count; i++) {
									design.push(CARRY)
									design.push(CARRY)
									design.push(MOVE)
								}

								if (count * 3 == MAX_CREEP_SIZE - 2 && count * 150 + 100 <= energyCap) {
									design.push(CARRY)
									design.push(MOVE)
								}
							}
							else {
								count = Math.floor(energyCap / 100)
								if (count > Math.floor(MAX_CREEP_SIZE / 2)) count = Math.floor(MAX_CREEP_SIZE / 2)
								for (var i = 0; i < count; i++) {
									design.push(CARRY)
									design.push(MOVE)
								}
							}
						}
					}
					break;
				case ("seasonFetcher"):
					count = Math.floor(energyCap / 100)
					if (count > Math.floor(MAX_CREEP_SIZE / 2)) count = Math.floor(MAX_CREEP_SIZE / 2)
					if (global.anySmallHaulers) {
						count = Math.round(count / 2)
					}

					// if (!Memory.anySeasonDropOffAvailable) {
					// 	count = Math.min(count, 1)
					// }
					for (var i = 0; i < count; i++) {
						design.push(CARRY)
						design.push(MOVE)
					}
					break

				case ("depositFetcher"):
				case ("powerFetcher"):
				case ("lootFetcher"):
				case ("transporter"):
				case ("isTransporter"):
					count = Math.floor(energyCap / 100)
					if (count > Math.floor(MAX_CREEP_SIZE / 2)) count = Math.floor(MAX_CREEP_SIZE / 2)
					for (var i = 0; i < count; i++) {
						design.push(CARRY)
						design.push(MOVE)
					}
					break;			
				case "season5UnclaimEmptier":
					count = Math.min(9, Math.floor(energyCap / 150))
					if (count > Math.floor(MAX_CREEP_SIZE / 3)) count = Math.floor(MAX_CREEP_SIZE / 3)
					for (var i = 0; i < count; i++) {
						design.push(CARRY)
						design.push(CARRY)
						design.push(MOVE)
					}
					break;			
				case ("season3TradeTransporter"):
					if (Memory.testForeignTransporters) {
						count = 1
					}
					else {						
						count = Math.floor(energyCap / 100)
					}
					if (count > Math.floor(MAX_CREEP_SIZE / 2)) count = Math.floor(MAX_CREEP_SIZE / 2)
					for (var i = 0; i < count; i++) {
						design.push(CARRY)
						design.push(MOVE)
					}
					break;
				case ("season2TerminalTransporter"):
				case ("season2ContainerShuffler"):
					if (opts.roads) {
						count = Math.floor(energyCap / 150)
						if (count > Math.floor(MAX_CREEP_SIZE / 3)) count = Math.floor(MAX_CREEP_SIZE / 3)
						for (var i = 0; i < count; i++) {
							design.push(CARRY)
							design.push(CARRY)
							design.push(MOVE)
						}
					}
					else {						
						count = Math.floor(energyCap / 100)
						if (count > Math.floor(MAX_CREEP_SIZE / 2)) count = Math.floor(MAX_CREEP_SIZE / 2)
						for (var i = 0; i < count; i++) {
							design.push(CARRY)
							design.push(MOVE)
						}
					}

					break
				case ("combatTransporter"):
				case ("intershardCombatTransporter"):
					count = Math.floor(energyCap / 200)
					if (count > Math.floor(MAX_CREEP_SIZE / 2)) count = Math.floor(MAX_CREEP_SIZE / 2)
					for (var i = 0; i < count; i++) {
						design.push(RANGED_ATTACK)
					}
					for (var i = 0; i < count; i++) {
						design.push(MOVE)
					}
					break;
				case ("upgrader"):
					if (opts.fast) {
						count = Math.floor((energyCap - 100) / 150)
						if (count > Math.floor((MAX_CREEP_SIZE) / 2) - 1) {
							count = Math.floor((MAX_CREEP_SIZE) / 2) - 1
						}

						for (let i = 0; i < count - 1; i++) {
							design.push(WORK)
						}
						design.push(CARRY)
						design.push(CARRY)
						
						for (let i = 0; i < count; i++) {
							design.push(MOVE)
						}

						design.push(WORK)
					}
					else if (opts.quiteFast) {
						count = Math.floor((energyCap - 100) / 250)
						if (count > Math.floor((MAX_CREEP_SIZE - 2) / 3)) {
							count = Math.floor((MAX_CREEP_SIZE - 2) / 3) 
						}

						for (let i = 0; i < count - 1; i++) {
							design.push(WORK)
							design.push(WORK)
						}
						design.push(WORK)

						design.push(CARRY)
						design.push(CARRY)
						
						for (let i = 0; i < count; i++) {
							design.push(MOVE)
						}

						design.push(WORK)
					}
					else {						
						// We want to have as much work as possible
						// But enough carry not to be using too much CPU
						// And enough move to get there quickly.
						if (energyCap >= 850) {
							count = Math.floor((energyCap - 50) / 450)
							let maxCount = false
							if (count > Math.floor((MAX_CREEP_SIZE - 1) / 5)) {
								count = Math.floor((MAX_CREEP_SIZE - 1) / 5)
								maxCount = true
							}

							var energyLeft = energyCap - 50 - 450 * count;

							// 49 part creep
							// End up as 36W, 4C, 9M
							if (maxCount && Memory.stats.avgBucket > 9000) {
								count -= 1
								design.push(WORK)
								design.push(WORK)
								design.push(WORK)
							}

							for (var i = 0; i < count; i++) {
								design.push(WORK)
								design.push(WORK)
								if (maxCount && i == count - 1) {
									design.push(CARRY)
								}
								else {
									design.push(WORK)
								}
								if (i != 0) design.push(WORK)
							}




							design.push(CARRY)
							let sizeLeft = MAX_CREEP_SIZE - design.length - count - 1

							// 49 part creep
							if (maxCount) {
								sizeLeft -= 1
							}

							if (Memory.stats.avgBucket > 9000) {

								// One carry isn't really enough: you get a hole when using links.
								// if (energyLeft >= 50 && energyCap >= 2000) {
								// 	design.push(CARRY)
								// 	energyLeft -= 50;
								// 	if (energyLeft >= 50 && energyCap >= 2000) {
								// 		design.push(CARRY)
								// 		energyLeft -= 50;
								// 	}
								// }
								if (energyLeft < 150 && energyCap > 1800) {
									design.shift()
									design.push(CARRY)
								}
								else if (energyLeft >= 150 && sizeLeft >= 2) {
									sizeLeft -= 2
									energyLeft -= 150;
									design.push(WORK)
									if (energyLeft >= 50 && energyCap > 1800 && sizeLeft >= 1) {
										design.push(CARRY)
										energyLeft -= 50;
										sizeLeft--
									}
									if (energyLeft >= 50 && energyCap > 1800 && sizeLeft >= 1) {
										design.push(CARRY)
										energyLeft -= 50;
										sizeLeft--
									}
									if (energyLeft >= 100 && sizeLeft >= 1) {
										design.push(WORK)
										energyLeft -= 100;
										sizeLeft--
									}
									if (energyLeft >= 100 && sizeLeft >= 1) {
										design.push(WORK)
										energyLeft -= 100;
										sizeLeft -=1
									}
									design.push(MOVE)
								}
							}
							else {
								// 1 carry per 4 work means we spend 0.016 cpu/tick on withdraw
								if (count >= 1 && energyLeft >= 50 && sizeLeft >= 1) {
									design.push(CARRY)
									energyLeft -= 50;
									sizeLeft--
								}
								if (count >= 2 && energyLeft >= 50 && sizeLeft >= 1) {
									design.push(CARRY)
									energyLeft -= 50;
									sizeLeft--
								}
								if (count >= 3 && energyLeft >= 50 && sizeLeft >= 1) {
									design.push(CARRY)
									energyLeft -= 50;
									sizeLeft--
								}
								if (count >= 4 && energyLeft >= 50 && sizeLeft >= 1) {
									design.push(CARRY)
									energyLeft -= 50;
									sizeLeft--
								}
							}

							for (var i = 0; i < count; i++) {
								design.push(MOVE)
							}

							// Tail-loading
							design.push(WORK)

							break;
						}
						else if (energyCap >= 450) {
							// We need one carry, then 4:1 WORK:MOVE ratio.
							count = Math.ceil((energyCap - 50) / 450)
							if (count > Math.floor((MAX_CREEP_SIZE - 1) / 5)) {
								count = Math.floor((MAX_CREEP_SIZE - 1) / 5)
							}

							design.push(CARRY)

							var energyLeft = energyCap - 50;

							for (var i = 0; i < count; i++) {
								design.push(MOVE)
								energyLeft -= 50;
							}

							while (energyLeft >= 100 && design.length < MAX_CREEP_SIZE) {
								design.push(WORK);
								energyLeft -= 100;
							}


							break;
						}
						else {
							count = Math.floor(energyCap / 250)
							var maxBodySize = false;

							for (var i = 0; i < count; i++) {
								design.push(WORK)
								design.push(CARRY)
							}
							for (var i = 0; i < count; i++) {
								design.push(MOVE)
								design.push(MOVE)
							}

							break;
						}
					}
					break
				case ("isUpgrader"):
					count = Math.floor((energyCap - 100) / 150)
					if (count > Math.floor((MAX_CREEP_SIZE - 2) / 2)) {
						count = Math.floor((MAX_CREEP_SIZE - 2) / 2)
					}

					for (let i = 0; i < count - 1; i++) {
						design.push(WORK)
					}
					design.push(CARRY)
					design.push(CARRY)
					
					for (let i = 0; i < count; i++) {
						design.push(MOVE)
					}

					design.push(WORK)

					break;
				case ("intershardRepairer"):
					count = Math.floor(energyCap / 200)
					var maxBodySize = false;
					if (count > Math.floor(MAX_CREEP_SIZE / 3)) {
						count = Math.floor(MAX_CREEP_SIZE / 3)
						maxBodySize = true;
					}

					for (let i = 0; i < count - 1; i++) {
						design.push(WORK)
					}
					for (let i = 0; i < count; i++) {
						design.push(CARRY)
					}

					if (maxBodySize && energyCap - 200 * count >= 100) {
						design.push(CARRY)
						design.push(MOVE)
					}

					for (let i = 0; i < count; i++) {
						design.push(MOVE)
					}

					design.push(WORK)

					break;
				case ("repairer"):
					if (energyCap < 1700) {
						count = Math.floor(energyCap / 200)
						if (count > 0) {
							var maxBodySize = false;
							if (count > Math.floor(MAX_CREEP_SIZE / 3)) {
								count = Math.floor(MAX_CREEP_SIZE / 3)
								maxBodySize = true;
							}

							for (let i = 0; i < count - 1; i++) {
								design.push(WORK)
							}
							for (let i = 0; i < count; i++) {
								design.push(CARRY)
							}

							if (maxBodySize && energyCap - 200 * count >= 100) {
								design.push(CARRY)
								design.push(MOVE)
							}

							for (let i = 0; i < count; i++) {
								design.push(MOVE)
							}

							design.push(WORK)
						}
					}
					else {
						if (willUseRoads) {							
							count = Math.floor(energyCap / 850)
							var maxBodySize = false;
							if (count > Math.floor(MAX_CREEP_SIZE / 12)) {
								count = Math.floor(MAX_CREEP_SIZE / 12)
								maxBodySize = true;
							}

							for (let i = 0; i < 5 * count - 1; i++) {
								design.push(WORK)
							}
							for (let i = 0; i < 3 * count; i++) {
								design.push(CARRY)
							}

							if (maxBodySize && energyCap - 850 * count >= 100) {
								design.push(CARRY)
								design.push(MOVE)
							}

							for (let i = 0; i < 4 * count; i++) {
								design.push(MOVE)
							}

							design.push(WORK)
						}
						else {
							count = Math.floor(energyCap / 200)
							var maxBodySize = false;
							if (count > Math.floor(MAX_CREEP_SIZE / 3)) {
								count = Math.floor(MAX_CREEP_SIZE / 3)
								maxBodySize = true;
							}

							for (let i = 0; i < count - 1; i++) {
								design.push(WORK)
							}
							for (let i = 0; i < count; i++) {
								design.push(CARRY)
							}

							if (maxBodySize && energyCap - 200 * count >= 100) {
								design.push(CARRY)
								design.push(MOVE)
							}

							for (let i = 0; i < count; i++) {
								design.push(MOVE)
							}

							design.push(WORK)
						}

					}
					break;
				case ("builder"):
					count = Math.floor(energyCap / 550)
					if (count > 0) {
						var maxBodySize = false;
						if (count > Math.floor(MAX_CREEP_SIZE / 9)) {
							count = Math.floor(MAX_CREEP_SIZE / 9)
							maxBodySize = true;
						}

						for (let i = 0; i < 2 * count - 1; i++) {
							design.push(WORK)
						}
						for (let i = 0; i < 4 * count; i++) {
							design.push(CARRY)
						}

						if (maxBodySize && energyCap - 550 * count >= 300) {
							design.push(WORK)
							design.push(CARRY)
							design.push(CARRY)
							design.push(MOVE)
							design.push(MOVE)
						}

						for (let i = 0; i < 3 * count; i++) {
							design.push(MOVE)
						}

						design.push(WORK)
					}
					else {
						count = Math.floor(energyCap / 200)
						if (count > 0) {
							design.push(WORK)
							design.push(CARRY)
							design.push(MOVE)
						}
					}
					break;
				case ("allyPioneer"):
					count = Math.floor((energyCap - 900) / 250)
					var maxBodySize = false;
					if (count > Math.floor((MAX_CREEP_SIZE - 4) / 4)) {
						count = Math.floor((MAX_CREEP_SIZE - 4) / 4)
						maxBodySize = true;
					}

					for (var i = 0; i < count; i++) {
						design.push(WORK)
					}
					for (var i = 0; i < count; i++) {
						design.push(CARRY)
					}

					// if (maxBodySize) {
					// 	design.push(CARRY)
					// 	design.push(MOVE)
					// }


					for (var i = 0; i < count; i++) {
						design.push(MOVE)
						design.push(MOVE)
					}
					design.push(MOVE)
					design.push(MOVE)
					design.push(HEAL)
					design.push(HEAL)
					design.push(MOVE)
					design.push(HEAL)
					break
				case ("pioneer"):
					if (false && energyCap > 2500) {
						var numHeals = 1
						var numAttacks = 1

						count = Math.floor(energyCap - (numHeals * 300 + numAttacks * 130) / 250)
						var maxBodySize = false;
						if (count > Math.floor((MAX_CREEP_SIZE - (numHeals + numAttacks) * 2) / 4)) {
							count = Math.floor((MAX_CREEP_SIZE - (numHeals + numAttacks) * 2) / 4)
							maxBodySize = true;
						}

						for (var i = 0; i < count; i++) {
							design.push(WORK)
						}
						for (var i = 0; i < count; i++) {
							design.push(CARRY)
						}

						for (var i = 0; i < count; i++) {
							design.push(MOVE)
							design.push(MOVE)
						}

						for (var i = 0; i < numAttacks+numHeals; i++) {
							design.push(MOVE)
						}
						for (var i = 0; i < numAttacks; i++) {
							design.push(ATTACK)
						}
						for (var i = 0; i < numHeals; i++) {
							design.push(HEAL)
						}
					}
					else {
						if (energyCap > 3000) {
							if (Memory.season3 || opts.swampy) {
								count = Math.floor(energyCap / 550)
								var maxBodySize = false;
								if (count > Math.floor(MAX_CREEP_SIZE / 10)) {
									count = Math.floor(MAX_CREEP_SIZE / 10)
									maxBodySize = true;
								}
								for (var i = 0; i < count; i++) {
									design.push(WORK)
								}
								for (var i = 0; i < count; i++) {
									design.push(CARRY)
									design.push(CARRY)
									design.push(CARRY)
									design.push(CARRY)
								}

								for (var i = 0; i < count; i++) {
									design.push(MOVE)
									design.push(MOVE)
									design.push(MOVE)
									design.push(MOVE)
									design.push(MOVE)
								}
							}
							else {								
								count = Math.floor(energyCap / 600)
								var maxBodySize = false;
								if (count > Math.floor(MAX_CREEP_SIZE / 10)) {
									count = Math.floor(MAX_CREEP_SIZE / 10)
									maxBodySize = true;
								}
								for (var i = 0; i < count; i++) {
									design.push(WORK)
									design.push(WORK)
								}
								for (var i = 0; i < count; i++) {
									design.push(CARRY)
									design.push(CARRY)
									design.push(CARRY)
								}

								for (var i = 0; i < count; i++) {
									design.push(MOVE)
									design.push(MOVE)
									design.push(MOVE)
									design.push(MOVE)
									design.push(MOVE)
								}
							}

						}
						else {							
							count = Math.floor(energyCap / 250)
							var maxBodySize = false;
							if (count > Math.floor(MAX_CREEP_SIZE / 4)) {
								count = Math.floor(MAX_CREEP_SIZE / 4)
								maxBodySize = true;
							}

							for (var i = 0; i < count; i++) {
								design.push(WORK)
							}
							for (var i = 0; i < count; i++) {
								design.push(CARRY)
							}

							if (maxBodySize) {
								design.push(CARRY)
								design.push(MOVE)
							}

							for (var i = 0; i < count; i++) {
								design.push(MOVE)
								design.push(MOVE)
							}
						}
					}
					break;
				case ("intershardPioneer"):
					if (false && energyCap > 2500) {
						var numHeals = 1
						var numAttacks = 1

						count = Math.floor(energyCap - (numHeals * 300 + numAttacks * 130) / 250)
						var maxBodySize = false;
						if (count > Math.floor((MAX_CREEP_SIZE - (numHeals + numAttacks) * 2) / 4)) {
							count = Math.floor((MAX_CREEP_SIZE - (numHeals + numAttacks) * 2) / 4)
							maxBodySize = true;
						}

						for (var i = 0; i < count; i++) {
							design.push(WORK)
						}
						for (var i = 0; i < count; i++) {
							design.push(CARRY)
						}

						for (var i = 0; i < count; i++) {
							design.push(MOVE)
							design.push(MOVE)
						}

						for (var i = 0; i < numAttacks+numHeals; i++) {
							design.push(MOVE)
						}
						for (var i = 0; i < numAttacks; i++) {
							design.push(ATTACK)
						}
						for (var i = 0; i < numHeals; i++) {
							design.push(HEAL)
						}
					}
					else {
						count = Math.floor(energyCap / 250)
						var maxBodySize = false;
						if (count > Math.floor(MAX_CREEP_SIZE / 4)) {
							count = Math.floor(MAX_CREEP_SIZE / 4)
							maxBodySize = true;
						}

						for (var i = 0; i < count; i++) {
							design.push(WORK)
						}
						for (var i = 0; i < count; i++) {
							design.push(CARRY)
						}

						if (maxBodySize) {
							design.push(CARRY)
							design.push(MOVE)
						}

						for (var i = 0; i < count; i++) {
							design.push(MOVE)
							design.push(MOVE)
						}
					}
					break;
				case ("reserver"):
					count = Math.floor(energyCap / (650))
					if (Memory.stats.avgBucket > 9750) {
						// Don't want to go from 2->1 but other strinking is fine
						count = Math.ceil(count * 0.501)
					}

					if (count > Math.floor(MAX_CREEP_SIZE / 2)) count = Math.floor(MAX_CREEP_SIZE / 2)


					// Things get a bit insane when we get too much CLAIM. 7 means 3000 ticks worth of claim
					if (count > 7) count = 7;

					for (var i = 0; i < count - 1; i++) {
						design.push(CLAIM)
					}
					for (var i = 0; i < count - 1; i++) {
						design.push(MOVE)
					}

					if (count > 0) {
						design.push(MOVE)
						design.push(CLAIM)
					}

					break;
				case ("controllerAttacker"):
					if (Memory.season3) {
						count = Math.floor(energyCap / (850))
						if (count > Math.floor(MAX_CREEP_SIZE / 6)) count = Math.floor(MAX_CREEP_SIZE / 6)

						//
						for (var i = 0; i < count * 4; i++) {
							design.push(MOVE)
						}					
						for (var i = 0; i < count; i++) {
							design.push(CLAIM)
						}
						for (var i = 0; i < count; i++) {
							design.push(MOVE)
						}
						break;						
					}
					else {						
						count = Math.floor(energyCap / (650))
						if (count > Math.floor(MAX_CREEP_SIZE / 2)) count = Math.floor(MAX_CREEP_SIZE / 2)

						//
						for (var i = 0; i < count; i++) {
							design.push(CLAIM)
						}
						for (var i = 0; i < count; i++) {
							design.push(MOVE)
						}
						break;
					}
				case ("defender"):
					energyLeft = energyCap


					let numRanged = 0
					let numAttack = 0
					let numHeal = 0
					let numMove = 0
					while (energyLeft >= BODYPART_COST[MOVE] && numRanged + numAttack + numHeal + numMove < MAX_CREEP_SIZE - 2) {
						if (numRanged + numAttack + numHeal >= numMove * 2) {
							numMove++
							energyLeft -= BODYPART_COST[MOVE]
						}
						else if (numHeal <= (numAttack + numRanged) / 4 - 1 && energyLeft >= BODYPART_COST[HEAL]) {
							numHeal++
							energyLeft -= BODYPART_COST[HEAL]
						}
						else if (numAttack <= numRanged && energyLeft >= BODYPART_COST[ATTACK]) {
							numAttack++
							energyLeft -= BODYPART_COST[ATTACK]
						}
						else if (numRanged <= numAttack && energyLeft >= BODYPART_COST[RANGED_ATTACK]) {
							numRanged++
							energyLeft -= BODYPART_COST[RANGED_ATTACK]
						}
						else {
							break
						}
					}

					for (var i = 0; i < numAttack; i++) {
						design.push(ATTACK)
					}
					for (var i = 0; i < numRanged; i++) {
						design.push(RANGED_ATTACK)
					}
					for (var i = 0; i < numHeal; i++) {
						design.push(HEAL)
					}
					for (var i = 0; i < numMove; i++) {
						design.push(MOVE)
					}
					
					break;
				case ("antiScout"):
					design = [RANGED_ATTACK,MOVE]
					break;
				case ("tankChildRoom"):
				case ("tank"):
					count = Math.floor(energyCap / 130)
					if (count > Math.floor((MAX_CREEP_SIZE) / 2)) count = Math.floor((MAX_CREEP_SIZE) / 2)
					for (var i = 0; i < Math.ceil(count / 2); i++) {
						design.push(ATTACK)
					}
					for (var i = 0; i < count - 1; i++) {
						design.push(MOVE)
					}
					for (var i = 0; i < Math.floor(count / 2); i++) {
						design.push(ATTACK)
					}
					design.push(MOVE)
					break;
				case ("healerChildRoom"):
				case ("healer"):
					count = Math.floor(energyCap / 300)
					if (count > Math.floor((MAX_CREEP_SIZE) / 2)) count = Math.floor((MAX_CREEP_SIZE) / 2)
					for (var i = 0; i < count - 1; i++) {
						design.push(MOVE)
					}
					for (var i = 0; i < count; i++) {
						design.push(HEAL)
					}
					design.push(MOVE)
					break;
				case ("intershardRanged"):
				
					break;

				case ("ranged"):
				case ("rangedChildRoom"):
					if (energyCap >= (4 * 200 + 1 * 300)) {
						let count1 = Math.floor(energyCap / (4 * 200 + 1 * 300))
						if (count1 > Math.floor((MAX_CREEP_SIZE) / 10)) count1 = Math.floor((MAX_CREEP_SIZE) / 10)

						let energyLeft = energyCap - count1 * 1100;
						let partsLeft = MAX_CREEP_SIZE - count1 * 10;
						let extraHeal = 0;
						let extraRanged = 0;

						if (energyLeft >= 300 && partsLeft > 0) {
							extraHeal++;
							energyLeft -= 300;
							partsLeft -= 1;
						}
						while (energyLeft >= 200 && partsLeft > 0) {
							extraRanged++;
							energyLeft -= 200;
							partsLeft -= 1;
						}

						for (var i = 0; i < count1 * 4 + extraRanged; i++) {
							design.push(RANGED_ATTACK)
						}
						for (var i = 0; i < count1 * 5 - 1 + extraRanged + extraHeal; i++) {
							design.push(MOVE)
						}
						for (var i = 0; i < count1 + extraHeal; i++) {
							design.push(HEAL)
						}
						design.push(MOVE)
					}
					else {
						count = Math.floor(energyCap / 200)
						if (count > Math.floor((MAX_CREEP_SIZE) / 2)) count = Math.floor((MAX_CREEP_SIZE) / 2)
						for (var i = 0; i < count; i++) {
							design.push(RANGED_ATTACK)
						}
						for (var i = 0; i < count; i++) {
							design.push(MOVE)
						}
					}
					break;
				case "raiderRoaming":
				case "raiderClose":
					if (energyCap >= (4 * 200 + 1 * 300 + 100)) {
						let count1 = Math.floor((energyCap - 100) / (4 * 200 + 1 * 300))
						if (count1 > Math.floor((MAX_CREEP_SIZE - 2) / 10)) {
							count1 = Math.floor((MAX_CREEP_SIZE - 2) / 10)
						}

						let energyLeft = energyCap - count1 * (4 * 200 + 1 * 300) - 100;
						let partsLeft = MAX_CREEP_SIZE - count1 * 10 - 2;
						let extraHeal = 0;
						let extraRanged = 0;

						if (energyLeft >= 300 && partsLeft >= 2) {
							extraHeal++;
							energyLeft -= 300;
							partsLeft -= 2;
						}
						while (energyLeft >= 200 && partsLeft >= 2) {
							extraRanged++;
							energyLeft -= 200;
							partsLeft -= 2;
						}

						design.push(CARRY)
						design.push(MOVE)
						for (var i = 0; i < count1 * 4 + extraRanged; i++) {
							design.push(RANGED_ATTACK)
						}
						for (var i = 0; i < count1 * 5 - 1 + extraRanged + extraHeal; i++) {
							design.push(MOVE)
						}
						for (var i = 0; i < count1 + extraHeal; i++) {
							design.push(HEAL)
						}
						design.push(MOVE)

					}
					else {
						if (energyCap < 300) {
							energyCap = 300;
						}
						count = Math.floor((energyCap - 100) / 200)
						if (count > Math.floor((MAX_CREEP_SIZE - 2) / 2)) count = Math.floor((MAX_CREEP_SIZE - 2) / 2)
						design.push(CARRY)
						design.push(MOVE)
						for (var i = 0; i < count; i++) {
							design.push(RANGED_ATTACK)
						}
						for (var i = 0; i < count; i++) {
							design.push(MOVE)
						}
					}


					break
				case "raiderHauler":
					if (energyCap >= (4 * 200 + 1 * 300 + 1000)) {
						let count1 = Math.floor((energyCap - 1000) / (4 * 200 + 1 * 300))
						if (count1 > Math.floor((MAX_CREEP_SIZE - 20) / 10)) {
							count1 = Math.floor((MAX_CREEP_SIZE - 20) / 10)
						}

						let energyLeft = energyCap - count1 * (4 * 200 + 1 * 300) - 1000;
						let partsLeft = MAX_CREEP_SIZE - count1 * 10 - 20;
						let extraHeal = 0;
						let extraRanged = 0;

						if (energyLeft >= 300 && partsLeft >= 2) {
							extraHeal++;
							energyLeft -= 300;
							partsLeft -= 2;
						}
						while (energyLeft >= 200 && partsLeft >= 2) {
							extraRanged++;
							energyLeft -= 200;
							partsLeft -= 2;
						}

						for (let i = 0; i < 10; i ++) {							
							design.push(CARRY)
							design.push(MOVE)
						}
						for (var i = 0; i < count1 * 4 + extraRanged; i++) {
							design.push(RANGED_ATTACK)
						}
						for (var i = 0; i < count1 * 5 - 1 + extraRanged + extraHeal; i++) {
							design.push(MOVE)
						}
						for (var i = 0; i < count1 + extraHeal; i++) {
							design.push(HEAL)
						}
						design.push(MOVE)

					}
					else {
						if (energyCap < 300) {
							energyCap = 300;
						}
						count = Math.floor((energyCap - 100) / 200)
						if (count > Math.floor((MAX_CREEP_SIZE - 2) / 2)) count = Math.floor((MAX_CREEP_SIZE - 2) / 2)
						design.push(CARRY)
						design.push(MOVE)
						for (var i = 0; i < count; i++) {
							design.push(RANGED_ATTACK)
						}
						for (var i = 0; i < count; i++) {
							design.push(MOVE)
						}
					}
					break

				case ("newPowerTank"):
				case ("powerTank"):
					if (opts.veryVeryFat && !opts.small) {
						count = Math.floor(energyCap / 370)
						if (opts.medium) {
							if (count > Math.floor(12 / 4)) {
								count = Math.floor(12 / 4)
							}
						}
						else {
							if (count > Math.floor((MAX_CREEP_SIZE) / 5)) {
								count = Math.floor((MAX_CREEP_SIZE) / 5)
							}
							if (opts.limitAttack) {
								count = Math.min(Math.ceil(opts.limitAttack / 4), count)
							}
						}						
					}
					else if (opts.veryFat && !opts.small) {
						count = Math.floor(energyCap / 290)
						if (opts.medium) {
							if (count > Math.floor(12 / 3)) count = Math.floor(12 / 3)
						}
						else {
							if (count > Math.floor((MAX_CREEP_SIZE) / 4)) count = Math.floor((MAX_CREEP_SIZE) / 4)
						}						
					}
					else if (opts.fat && !opts.small) {
						count = Math.floor(energyCap / 210)
						if (opts.medium) {
							if (count > Math.floor(12 / 2)) count = Math.floor(12 / 2)
						}
						else {
							if (count > Math.floor((MAX_CREEP_SIZE) / 3)) count = Math.floor((MAX_CREEP_SIZE) / 3)
						}						
					}
					else {
						count = Math.floor(energyCap / 130)
						if (opts.small) {
							if (count > Math.floor(10 / 2)) count = Math.floor(10 / 2)
						}
						else if (opts.medium) {
							if (count > Math.floor(24 / 2)) count = Math.floor(24 / 2)
						}
						else {
							if (count > Math.floor((MAX_CREEP_SIZE) / 2)) count = Math.floor((MAX_CREEP_SIZE) / 2)
						}
					}

					let attackPerCount = 1
					if (opts.veryVeryFat) {
						attackPerCount = 4
					}
					else if (opts.veryFat) {
						attackPerCount = 3
					}
					else if (opts.fat) {
						attackPerCount = 2
					}

					if (Memory.season3) {
						for (var i = 0; i < Math.floor(count / 2) * attackPerCount; i++) {
							design.push(ATTACK)
						}						
						for (var i = 0; i < count - 1; i++) {
							design.push(MOVE)
						}
						for (var i = 0; i < Math.ceil(count / 2) * attackPerCount; i++) {
							design.push(ATTACK)
						}
						design.push(MOVE)
					}
					else {						
						for (var i = 0; i < count; i++) {
							design.push(MOVE)
						}
						for (var i = 0; i < count * attackPerCount; i++) {
							design.push(ATTACK)
						}						
					}
					break;
				case ("powerGuard"):
					count = Math.floor(energyCap / 1100)
					if (count > Math.floor((MAX_CREEP_SIZE) / 10)) count = Math.floor((MAX_CREEP_SIZE) / 10)
					for (var i = 0; i < count; i++) {
						design.push(RANGED_ATTACK)
						design.push(RANGED_ATTACK)
						design.push(RANGED_ATTACK)
						design.push(RANGED_ATTACK)
					}
					for (var i = 0; i < count; i++) {
						design.push(MOVE)
						design.push(MOVE)
						design.push(MOVE)
						design.push(MOVE)
						design.push(MOVE)
					}
					for (var i = 0; i < count; i++) {
						design.push(HEAL)
					}
					break;
				case ("powerGuardMini"):
					count = Math.floor(energyCap / 1100)
					if (count > Math.floor((MAX_CREEP_SIZE) / 10)) count = Math.floor((MAX_CREEP_SIZE) / 10)
					if (count > 2) count = 2;
					for (var i = 0; i < count; i++) {
						design.push(RANGED_ATTACK)
						design.push(RANGED_ATTACK)
						design.push(RANGED_ATTACK)
						design.push(RANGED_ATTACK)
					}
					for (var i = 0; i < count; i++) {
						design.push(MOVE)
						design.push(MOVE)
						design.push(MOVE)
						design.push(MOVE)
						design.push(MOVE)
					}
					for (var i = 0; i < count; i++) {
						design.push(HEAL)
					}
					break;
				case ("newPowerHealer"):
				case ("powerHealer"):
					count = Math.floor(energyCap / 300)
					if (opts.small) {
						if (count > 7) count = 7;
					}
					else {
						if (count > 16) count = 16;
					}

					for (var i = 0; i < count; i++) {
						design.push(MOVE)
					}
					for (var i = 0; i < count; i++) {
						design.push(HEAL)
					}
					break;
				case ("powerTankMini"):
					count = Math.floor(energyCap / 130)
					if (count > Math.floor((MAX_CREEP_SIZE) / 2)) count = Math.floor((MAX_CREEP_SIZE) / 2)
					if (count > 20) count = 20;
					for (var i = 0; i < count; i++) {
						design.push(MOVE)
					}
					for (var i = 0; i < count; i++) {
						design.push(ATTACK)
					}
					break;
				case ("powerHealerMini"):
					count = Math.floor(energyCap / 300)
					if (count > 13) count = 13;
					for (var i = 0; i < count; i++) {
						design.push(MOVE)
					}
					for (var i = 0; i < count; i++) {
						design.push(HEAL)
					}
					break;
				case ("deconstructor"):
				case ("dismantler"):
					count = Math.floor(energyCap / 150)
					if (count > Math.floor((MAX_CREEP_SIZE) / 2)) count = Math.floor((MAX_CREEP_SIZE) / 2)
					for (var i = 0; i < count; i++) {
						design.push(WORK)
					}
					for (var i = 0; i < count; i++) {
						design.push(MOVE)
					}
					break;
				case ("strongholdDeconstructor"):
					count = Math.floor(energyCap / (2 * BODYPART_COST[MOVE] + BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[WORK]))
					let maxSize = false;
					if (count > Math.floor(MAX_CREEP_SIZE / 4)) {
						count = Math.floor(MAX_CREEP_SIZE / 4)
						maxSize = true;
					}
					for (var i = 0; i < count + (maxSize ? 1 : 0); i++) {
						design.push(WORK)
					}
					for (var i = 0; i < count; i++) {
						design.push(MOVE)
					}
					for (var i = 0; i < count; i++) {
						design.push(RANGED_ATTACK)
					}
					for (var i = 0; i < count + (maxSize ? 1 : 0); i++) {
						design.push(MOVE)
					}
					break;
				case ("coreDismantler"):
					count = Math.min(10, Math.floor(energyCap / (BODYPART_COST[MOVE] + BODYPART_COST[ATTACK])))
					if (count > Math.floor((MAX_CREEP_SIZE) / 2)) count = Math.floor((MAX_CREEP_SIZE) / 2)
					for (var i = 0; i < count; i++) {
						design.push(ATTACK)
					}
					for (var i = 0; i < count; i++) {
						design.push(MOVE)
					}
					break;
				case ("controllerRescuer"):
					if (energyCap >= 650) {
						for (var i = 0; i < 10; i++) {
							design.push(MOVE)
						}
						design.push(CARRY)
						design.push(WORK)
					}
					else {
						design.push(MOVE)
						design.push(MOVE)
						design.push(CARRY)
						design.push(WORK)
					}
					break;
				case ("claimer"):
				case ("intershardClaimer"):
					// if (altDesign) {
						// It's such a rare thing to do that we may as well make them big.
						// They can go through swamps and attack controllers and all sorts then.
						if (energyCap < BODYPART_COST[CLAIM] + BODYPART_COST[MOVE] * 5) {
							design.push(MOVE)
							design.push(CLAIM)
						}
						else {							
							count = Math.floor(energyCap / 850)
							if (count > Math.floor(MAX_CREEP_SIZE / 6)) {
								count = Math.floor(MAX_CREEP_SIZE / 6)
							}

							for (var i = 0; i < count * 5; i++) {
								design.push(MOVE)
							}
							for (var i = 0; i < count; i++) {
								design.push(CLAIM)
							}
						}
					// }
					// else {						
					// 	if (energyCap >= 850) {
					// 		design = [MOVE, MOVE, MOVE, MOVE, MOVE, CLAIM]
					// 	}
					// 	else {
					// 		design = [CLAIM, MOVE]
					// 	}
					// }
					break;
				case ("squisher"):
				case ("scout"):
				case ("powerScout"):
				case ("portalScout"):
				case ("intershardScout"):
				case ("observer"):
					design = [MOVE]
					break;
				case ("keeperHarvester2"):
					count = Math.floor((energyCap - 50) / 250)

					if ((highUtilization || Memory.stats.avgBucket >= 9000) && count >= 5) {
						design = [WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,WORK,CARRY,MOVE,MOVE,MOVE,MOVE,MOVE];
					}
					else {
						var energyPerTickWork = BODYPART_COST[WORK] / CREEP_LIFE_TIME
						var energyPerTickMove = BODYPART_COST[MOVE] / CREEP_LIFE_TIME

						let yieldPerCPU = Memory.stats.yieldPerCPU || 0;

						// Modify it up a bit as we spend some time running from the SK
						let SKenergyCapacity = SOURCE_ENERGY_KEEPER_CAPACITY * 1.1

						let numWorkWorkMove = Math.sqrt(yieldPerCPU * INTENT_CPU_COST * (SKenergyCapacity / ENERGY_REGEN_TIME) / (4 * (2 * energyPerTickWork + energyPerTickMove)))

						var int_numWorkWorkMove = Math.min(count, Math.max(5, Math.round(numWorkWorkMove)))
						int_numWorkWorkMove = Math.min(int_numWorkWorkMove, Math.floor(MAX_CREEP_SIZE / 3) - 1);

						for (var i = 0; i < int_numWorkWorkMove; i++) {
							design.push(WORK)
							design.push(WORK)
						}

						design.push(CARRY)

						for (var i = 0; i < int_numWorkWorkMove; i++) {
							design.push(MOVE)
						}
					}


					break;
				// case ("keeperGuard1"):
				// 	design = [ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
				// 			  ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,RANGED_ATTACK,RANGED_ATTACK,
				// 			  MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
				// 			  MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,MOVE,
				// 			  MOVE,MOVE,MOVE,MOVE,MOVE,HEAL,HEAL,HEAL,HEAL,HEAL,HEAL];
				// 	break;
				case ("keeperGuard2"):
					design = [ATTACK,
							  MOVE,MOVE,MOVE,MOVE,MOVE,
							  MOVE,MOVE,MOVE,MOVE,MOVE,
							  MOVE,MOVE,MOVE,MOVE,MOVE,
							  MOVE,MOVE,MOVE,MOVE,MOVE,
							  MOVE,MOVE,MOVE,
							  ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
							  ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
							  ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
							  ATTACK,
							  RANGED_ATTACK,
							  HEAL,HEAL,HEAL,HEAL,
							  HEAL,
							  RANGED_ATTACK,
							  MOVE,MOVE,
							  HEAL];
					break;
				case ("soloKeeperMiner"):
					design = [WORK,WORK,WORK,WORK,WORK,
							  WORK,WORK,WORK,WORK,WORK,
							  WORK,WORK,WORK,WORK,WORK,
							  WORK,WORK,
							  WORK,CARRY,
							  MOVE,MOVE,MOVE,MOVE,MOVE,
							  MOVE,MOVE,MOVE,ATTACK,
							  ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
							  ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
							  ATTACK,ATTACK,ATTACK,ATTACK,ATTACK,
							  MOVE,MOVE,
							  HEAL,HEAL,HEAL,HEAL,HEAL];
					break;
				case ("soloCentreMiner"):
					design = [];
					for (let i = 0; i < 32; i++) {
						design.push(WORK)
					}
					for (let i = 0; i < 16; i++) {
						design.push(MOVE)
					}
					design.push(WORK)
					design.push(MOVE)
					break;
				case ("depositMiner"):
					design = [];
					count = Math.floor((energyCap - 100) / BODYPART_COST[WORK])

					// console.log("depositMiner", "creepCreator opts", JSON.stringify(opts))

					let numCarry = 2
					if (opts.boost) {
						numCarry *= BOOSTS[WORK][opts.boost]["harvest"]
					}
					if (opts.lc !== undefined && opts.lc === 0) {
						if (opts.boost) {
							numCarry *= 2;
						}
						else {
							numCarry *= 4;
						}
					}

					for (let i = 0; i < Math.min(count, MAX_CREEP_SIZE - numCarry) - 1; i++) {
						design.push(WORK)
					}
					for (let i = 0; i < numCarry; i++) {
						design.push(CARRY)
					}
					design.push(WORK)

					break
				case ("depositTug"):
					design = [];
					// Yes that does say WORK. We're for pulling miners. with the above design.
					count = Math.floor((energyCap - 100) / BODYPART_COST[WORK])

					if (opts.maxCount) {
						count = Math.min(count, opts.maxCount)
					}

					count = Math.min(count, MAX_CREEP_SIZE - 2)

					for (let i = 0; i < count; i++) {
						design.push(MOVE)
					}
					// Lazy
					if (energyCap > 5000) {
						for (let i = 0; i < MAX_CREEP_SIZE - count; i++) {
							design.push(CARRY)
						}
					}


					break
				case ("depositTroll"):
					design = [WORK, MOVE];
					break
				case ("seasonWallGuard"):
					design = []
					count = Math.floor(energyCap / (9 * BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[HEAL]))

					count = Math.min(count, MAX_CREEP_SIZE / 10)

					for (let i = 0; i < count * 9; i++) {
						design.push(RANGED_ATTACK)
					}

					for (let i = 0; i < count; i++) {
						design.push(HEAL)
					}

					break

				case ("seasonWallBuilderD"):
				case ("seasonWallBuilderR"):
					design = [];
					count = Math.floor((energyCap - 100) / BODYPART_COST[WORK])

					if (opts.numRepairNeeded) {
						count = Math.min(count, opts.numRepairNeeded)
					}

					for (let i = 0; i < Math.min(count, MAX_CREEP_SIZE - 2); i++) {
						design.push(WORK)
					}
					design.push(CARRY)
					design.push(CARRY)

					break
				case ("seasonWallDestroyer"):
					design = [];
					count = Math.floor(energyCap / BODYPART_COST[WORK])

					for (let i = 0; i < (opts.tough || 0); i++) {
						design.push(TOUGH)
					}

					let spareParts = MAX_CREEP_SIZE - (opts.tough || 0) - (opts.move || 0)
					for (let i = 0; i < Math.floor((opts.move || 0) / 2); i++) {
						design.push(MOVE)
					}
					for (let i = 0; i < Math.min(count, spareParts) - 1; i++) {
						design.push(WORK)
					}
					for (let i = 0; i < Math.ceil((opts.move || 0) / 2); i++) {
						design.push(MOVE)
					}

					design.push(WORK)

					break
				case ("seasonTug"):
					design = [];

					if (Memory.season2 && !opts.long && !opts.boosted) {
						opts.requiredMove /= 2
					}

					if (opts.requiredMove) {
						count = Math.min(opts.requiredMove, Math.floor(energyCap / BODYPART_COST[MOVE]))

						if (count < opts.requiredMove) {
							console.log("Season tug required move greater than possible!", opts.requiredMove, count, energyCap)
						}
						if (count > MAX_CREEP_SIZE - (opts.heal || 0)) {
							console.log("Season tug required move greater than max creep size!", opts.requiredMove, count, energyCap)
							count = MAX_CREEP_SIZE - (opts.heal || 0)
						}
						else {
							count = opts.requiredMove
						}
					}
					else {
						// This happens when we check bodies for renew
						// console.log("Spawning season tug without required move")
						// try {
						// 	throw new Error("Spawning season tug without required move")
						// }
						// catch(e) {
						// 	console.log(e);
						// 	console.log(e.stack);
						// }
						count = Math.floor(energyCap / BODYPART_COST[MOVE])
					}

					if (!opts.boosted && !opts.heal && !opts.noCarry) {
						count2 = Math.min(count, MAX_CREEP_SIZE - count, (energyCap - count * BODYPART_COST[MOVE]) / BODYPART_COST[CARRY])
						for (let i = 0; i < count2; i++) {
							design.push(CARRY)	
						}
					}

					for (let i = 0; i < count; i++) {
						design.push(MOVE)
					}

					for (let i = 0; i < (opts.heal || 0); i++) {
						design.push(HEAL)
					}



					break
				case ("seasonTroll"):
					design = [ATTACK, MOVE];
					break

			}
			global._designs[hash] = design
		}
		else {
			design = global._designs[hash]
		}
		return design

	}

};

module.exports = creepCreator;
