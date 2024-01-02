"use strict";


var roomAI = require('roomAI');
var util = require('util');
var safeRoute = require('safeRoute');
require('proto.creep')();
var powerRangerAI = require('powerRangerAI');
var formationAI = require('formationAI');
var constants = require('constants');
var roomIntel = require('roomIntel');
var intelAI = require('intelAI');
const segments = require('segments');
const snakeAI = require('snakeAI');
const scouting = require('scouting');

const roomCombat = require("roomCombat")
const moveResolver = require("moveResolver")

const combatCreepAI = require("combatCreepAI")

const interShardMemoryManager = require('interShardMemoryManager');


function changeCreepRole(creep, newRole) {
	var room = Game.rooms[creep.mem.sR]
	if (room && room.mem.owner) {
		if (!room.mem.ownedCreeps[newRole]) room.mem.ownedCreeps[newRole] = []
		room.mem.ownedCreeps[newRole].push(creep.name)

		if (room.mem.ownedCreeps[creep.mem.role] && room.mem.ownedCreeps[creep.mem.role].indexOf(creep.name) != -1) {
			room.mem.ownedCreeps[creep.mem.role].splice(room.mem.ownedCreeps[creep.mem.role].indexOf(creep.name), 1);
		}
	}

	creep.mem.role = newRole
}


function formUp(creep, combatMoveOptions) {
	if (creep.fatigue) return 
	let myCombatCreeps = creep.room.getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], false);

	if (myCombatCreeps.length == 1) return


	let movePos = creep.room.currentFormUpPos
	let meanPosTargetRange = creep.room.currentFormUpRange

	if (!movePos) {		
		let meanX = 0
		let meanY = 0
		let cnt = 0

		for (let myCombatCreep of myCombatCreeps) {
			if (myCombatCreep.pos.findFirstInRange(myCombatCreep.room.getAllHostileCreepsWithBodyParts([ATTACK, HEAL, RANGED_ATTACK], false), 7)) {
				cnt += 0.5
				meanX += myCombatCreep.pos.x * 0.5
				meanY += myCombatCreep.pos.y * 0.5
			}
			else {				
				cnt++
				meanX += myCombatCreep.pos.x
				meanY += myCombatCreep.pos.y
			}
		}

		if (!cnt) {
			return
		}

		meanX /= cnt
		meanY /= cnt

		meanX = Math.round(meanX)
		meanY = Math.round(meanY)

		meanPosTargetRange = Math.round(Math.sqrt(myCombatCreeps.length))
		creep.room.currentFormUpRange = meanPosTargetRange


		if (creep.pos.getRangeToXY(meanX, meanY) <= meanPosTargetRange + 1) {
			return false
		}
		let terrain = Game.map.getRoomTerrain(creep.room.name)

		function isValidExtrapolationPos(x, y, room, terrain) {
			if (x < 1 || x > 48 || y < 1 || y > 48 || terrain.get(x, y)) {
				return false;
			}
			else {
				let structs = creep.room.lookForAt(LOOK_STRUCTURES, x, y)
				for (let struct of structs) {
					if (struct.structureType == STRUCTURE_PORTAL || OBSTACLE_OBJECT_TYPES.includes(struct.structureType)) {
						return false;
					}
				}
			}
			return true
		}

		let targetX = meanX
		let targetY = meanY

		// Just has to be good enough
		let validPos = isValidExtrapolationPos(targetX, targetY, creep.room, terrain);
		if (!validPos) {
			for (var radius = 0; radius <= 5; radius++) {
				var limit = radius * 8;
				for (var iter = 0; iter < limit; iter++) {
					var direction = iter % 4;
					var offsetDirection = Math.floor(iter / 4) % 2;
					var offsetAmount = Math.floor((iter + 4) / 8);

					var i;
					var j;

					if (direction == 0) {
						i = offsetAmount * (offsetDirection == 1 ? 1 : -1)
						j = -radius;
					}
					else if (direction == 2) {
						i = offsetAmount * (offsetDirection == 1 ? -1 : 1)
						j = radius;
					}
					else if (direction == 1) {
						i = radius;
						j = offsetAmount * (offsetDirection == 1 ? 1 : -1)
					}
					else if (direction == 3) {
						i = -radius;
						j = offsetAmount * (offsetDirection == 1 ? -1 : 1)
					}

					targetX = meanX + i
					targetY = meanY + j
					validPos = isValidExtrapolationPos(targetX, targetY, creep.room, terrain);
					if (validPos) break
				}
				if (validPos) break
			}
		}

		if (!validPos) return

		creep.room.currentFormUpRange += radius

		creep.room.currentFormUpPos = new RoomPosition(targetX, targetY, creep.room.name)
		movePos = creep.room.currentFormUpPos;
	}


	// This doesn't check we're globally formed, only that this creep is near enough to the forming position

	// let movePos = creep.room.currentFormUpPos;
	if (creep.mem.path && creep.mem.path.length > 0 && creep.mem.pTgtRoom == movePos.roomName) {
		// Don't repath
		if (movePos.getRangeToXY(creep.mem.pTX, creep.mem.pTY) < creep.pos.getRangeToPos(movePos) / 4 && Game.cpu.bucket != 10000) {
			movePos = new RoomPosition(creep.mem.pTX, creep.mem.pTY, creep.mem.pTgtRoom);
		}
	}

	if (creep.combatSnake) {
		snakeAI.moveSnake(creep.mem.formationCreeps, movePos, combatMoveOptions, meanPosTargetRange, true, false)
	}
	else {
		creep.uncachedMoveTo(movePos, meanPosTargetRange, combatMoveOptions);
	}
	creep.say("form")
	creep.room.visual.line(creep.pos.x, creep.pos.y, movePos.x, movePos.y, {color: "#80ff80"})

	return true
}


function getCombatStance(creep, enemy, combatLocation, areaFriends, areaHostile, friendlyHeals, enemyHeals, closeCombat) {
	var etotalAttack = 0;
	var etotalRanged = 0;
	var etotalHeal = 0;

	combatLocation = combatLocation || creep.pos

	let advancedHostileDamageTracking = false;

	if (creep.ignoreInvaders) {
		areaHostile = _.filter(areaHostile, function(hostile) { return hostile.owner.username != "Invader" });
	}

	// if (enemyHeals) {
	// 	for (var hostileCreep of areaHostile) {
	// 		if (hostileCreep.hits <= hostileCreep.hitsMax - 100) {
	// 			advancedHostileDamageTracking = true;
	// 			break;
	// 		}
	// 	}
	// }

	// This is pessimistic.
	/*let advancedHostileDamageTrackingHeal = 0;
	if (advancedHostileDamageTracking) {
		for (var hostileCreep of areaHostile) {
			// This assumes they're at full health.
			let combatPartsInActive = hostileCreep.getBoostModifiedCombatParts(false);
			heal += combatPartsInActive.numHeal;

			// If they can heal (and are damaged), take average of active and inactive.
			if (enemyHeals && hostileCreep.hits <= hostileCreep.hitsMax - 100) {
				let combatPartsActive = hostileCreep.getBoostModifiedCombatParts(true);
				heal += combatPartsActive.numHeal;
				heal /= 2;
			}

			advancedHostileDamageTrackingHeal += heal;
		}
	}*/

	for (var hostileCreep of areaHostile) {
		let attack = 0;
		let ranged = 0;
		let heal = 0;

		if (advancedHostileDamageTracking && advancedHostileDamageTrackingHeal) {
			if (hostileCreep.hits <= hostileCreep.hitsMax - 100) {
				// Let them heal fully twice in our danger estimates. This is a hack... I'll be doing damage they're healing won't
				// be focused. The unadvanced version was just average of max and current though, which kinda sucked because it
				// didn't take body order into account.
				let combatParts = hostileCreep.getBoostModifiedCombatParts(true, false, advancedHostileDamageTrackingHeal * 2);

				attack += combatParts.numAttack;
				ranged += combatParts.numRanged;
				heal += combatParts.numHeal;
			}
			else {
				let combatPartsInActive = hostileCreep.getBoostModifiedCombatParts(false);

				attack += combatPartsInActive.numAttack;
				ranged += combatPartsInActive.numRanged;
				heal += combatPartsInActive.numHeal;
			}
		}
		else {
			// This assumes they're at full health.
			let combatPartsActive = hostileCreep.getBoostModifiedCombatParts(true);

			// If they can heal (and are damaged) treat dead parts as a third
			if (enemyHeals && hostileCreep.hits <= hostileCreep.hitsMax - 100) {
				let combatPartsInActive = hostileCreep.getBoostModifiedCombatParts(false);

				attack = combatPartsActive.numAttack + (combatPartsInActive.numAttack - combatPartsActive.numAttack) / 3
				ranged = combatPartsActive.numRanged + (combatPartsInActive.numRanged - combatPartsActive.numRanged) / 3
				heal = combatPartsActive.numHeal + (combatPartsInActive.numHeal - combatPartsActive.numHeal) / 3
			}
			else {
				attack = combatPartsActive.numAttack;
				ranged = combatPartsActive.numRanged;
				heal = combatPartsActive.numHeal;					
			}
			if (hostileCreep.owner.username == "Source Keeper") {
				if (hostileCreep.pos.findFirstInRange(FIND_SOURCES, 1) || hostileCreep.pos.findFirstInRange(FIND_MINERALS, 1)) {
					attack *= 0.25
					ranged *= 0.5
				}
				else {
					attack *= 0.5
					ranged *= 0.5
				}
			}
			// A bit lazy
			else if (hostileCreep.owner.username == "Invader" && hostileCreep.room.keeperRoom && hostileCreep.room.towers.length && !hostileCreep.room.invaderCore) {
				continue
			}
		}

		let rangeToHostile = creep.pos.getWorldRangeToPos(hostileCreep.pos);

		if (rangeToHostile >= 4) {
			attack *= 3 / rangeToHostile;
			
		}
		if (rangeToHostile >= 6 && areaHostile.length > 1) {
			heal *= 5 / rangeToHostile; 
			ranged *= 5 / rangeToHostile; 
		}

		if (rangeToHostile > 5 && util.isEdgeOfRoom(hostileCreep.pos)) {
			attack *= 0.8;
			ranged *= 0.8;
			heal *= 0.8;
		}

		// Don't worry about their attack so much if they're far away.
		if (rangeToHostile > 3 || hostileCreep.room.name != creep.room.name) {
			attack /= 2;
		}

		if (rangeToHostile >= 2 && hostileCreep.fatigue > 0) {
			attack /= 2;
		}
		if (hostileCreep.body && rangeToHostile >= 2 && hostileCreep.fatigue > 2 * hostileCreep.body.length) {
			attack /= 2;
		}

		// We won't have our healer
		if (creep.combatSnake && hostileCreep.room.name != creep.room.name) {
			if (util.isNearEdgeOfRoom(hostileCreep.pos, 1)) {
				attack *= 10
				ranged *= 10
			}
			else if (util.isNearEdgeOfRoom(hostileCreep.pos, 2)) {
				attack *= 5
				ranged *= 5
			}
			else {				
				attack *= 3
				ranged *= 3
			}		
		}

		// Don't push too far out
		if (hostileCreep.room.name == creep.room.name && creep.room.isMyRoom() && !creep.room.breached) {
			if (!hostileCreep.pos.findFirstInRange(creep.room.ramparts, 3)) {
				if (creep.mem.formationCreeps && creep.mem.formationCreeps > 2) {
					attack *= 1.5
					ranged *= 1.5
					heal *= 1.5
				}
				else {
					attack *= 2
					ranged *= 2
					heal *= 2
				}
			}
		}

		// Don't push hard against somebody who is about to die.
		if (hostileCreep.ticksToLive < 10) {
			attack *= 1.5;
			ranged *= 1.5;
			heal *= 1.5;
		}
		else if (hostileCreep.ticksToLive < 20) {
			attack *= 1.25;
			ranged *= 1.25;
			heal *= 1.25;
		}
		else if (hostileCreep.ticksToLive < 30) {
			attack *= 1.1;
			ranged *= 1.1;
			heal *= 1.1;
		}

		if (hostileCreep.owner.username == "Invader") {
			attack *= .75;
			ranged *= .75;
			heal *= .75;
		}

		etotalAttack += attack;
		etotalRanged += ranged;
		etotalHeal += heal;
	}

	if (etotalAttack == 0 && etotalRanged == 0) {
		return {"agression": 999, "eClose": 0, "eLong": 0, "fClose": undefined, "fLong": undefined}
	}

	var ftotalAttack = 0;
	var ftotalRanged = 0;
	var ftotalHeal = 0;
	let numFriendlyRamparters = 0

	for (var friendlyCreep of areaFriends) {
		let attack = 0;
		let ranged = 0;
		let heal = 0;

		if (friendlyCreep.ramparter) {
			numFriendlyRamparters++;
		}


		/*var combatPartsInActive = friendlyCreep.getBoostModifiedCombatParts(false);
		attack += combatPartsInActive.numAttack;
		ranged += combatPartsInActive.numRanged;
		heal += combatPartsInActive.numHeal;

		if (friendlyHeals && friendlyCreep.hits <= friendlyCreep.hitsMax - 100) {
			let combatPartsActive = friendlyCreep.getBoostModifiedCombatParts(true);

			attack = combatPartsActive.numAttack + (combatPartsInActive.numAttack - combatPartsActive.numAttack) / 3
			ranged = combatPartsActive.numRanged + (combatPartsInActive.numRanged - combatPartsActive.numRanged) / 3
			heal = combatPartsActive.numHeal + (combatPartsInActive.numHeal - combatPartsActive.numHeal) / 3
		}*/

		// This assumes they're at full health.
		let combatPartsActive = friendlyCreep.getBoostModifiedCombatParts(true);

		// If they can heal (and are damaged) treat dead parts as a third
		if (friendlyHeals && friendlyCreep.hits <= friendlyCreep.hitsMax - 100) {
			let combatPartsInActive = friendlyCreep.getBoostModifiedCombatParts(false);

			attack = combatPartsActive.numAttack + (combatPartsInActive.numAttack - combatPartsActive.numAttack) / 3
			ranged = combatPartsActive.numRanged + (combatPartsInActive.numRanged - combatPartsActive.numRanged) / 3
			heal = combatPartsActive.numHeal + (combatPartsInActive.numHeal - combatPartsActive.numHeal) / 3
		}
		else {
			attack = combatPartsActive.numAttack;
			ranged = combatPartsActive.numRanged;
			heal = combatPartsActive.numHeal;					
		}


		if (friendlyCreep != creep) {

			// Don't count on these guys to help
			if (/*(friendlyCreep.ramparter && !friendlyCreep.room.breached) ||*/ friendlyCreep.assaulter) {
				if (!friendlyCreep.pos.findFirstInRange(areaHostile, 1)) {
					attack = 0;
				}
				if (!friendlyCreep.pos.findFirstInRange(areaHostile, 3)) {
					ranged /= 2;
				}
				heal = 0;
			}
			else if (attack && friendlyCreep.ramparter && !friendlyCreep.room.breached) {
				if (!friendlyCreep.pos.findFirstInRange(areaHostile, 1)) {
					attack = 0;
				}
			}

			let rangeToFriend = creep.pos.getWorldRangeToPos(friendlyCreep.pos);
			let mod = friendlyCreep.mem.engaged ? 0.75 : 0.5;

			if (friendlyCreep.body && rangeToFriend >= 2 && friendlyCreep.fatigue > 2 * friendlyCreep.body.length) {
				attack *= mod
				heal *= mod
			}
			if (rangeToFriend > 2 - (friendlyCreep.fatigue ? 1 : 0)) {
				attack *= mod
				heal *= mod
			}
			if (rangeToFriend > 4 - (friendlyCreep.fatigue ? 1 : 0)) {
				attack *= mod
				heal *= mod
				ranged *= mod
			}

			// Hmm. Range or world range. Not sure. I think range. Don't think we can count on friendlies in different rooms
			let rangeToEnemy = enemy ? friendlyCreep.pos.getRangeTo(enemy.pos) : 0
			let fatigueRangeMod = (friendlyCreep.fatigue ? -1 : 0) + (enemy ? (enemy.fatigue ? 1 : 0) : 0)

			let mod2Ranged = (rangeToEnemy <= 4 + fatigueRangeMod ? 1 : (friendlyCreep.mem.engaged ? .75 : .5));
			let mod2Attack = (rangeToEnemy <= 2 + fatigueRangeMod ? 1 : (friendlyCreep.mem.engaged ? .75 : .5));
			attack *= mod2Ranged;
			ranged *= mod2Attack;
		}

		ftotalAttack += attack;
		ftotalRanged += ranged;

		// Assume they won't help in my rooms. Handled later for combat snakes
		if (!friendlyCreep.room.isMyRoom()) {
			ftotalHeal += heal;
		}
	}

	// Don't charge into close combat due to nearby friendly attack
	if (!closeCombat) {
		ftotalAttack *= .5;
	}


	// console.log(areaFriends, areaHostile)
	let eHealMod = etotalHeal * HEAL_POWER * (0.9 + 0.1 / (areaHostile.length || 1))

	// .8 on heals as I assume they're not idealized
	var friendlyCloseRangeThreat = ftotalAttack * ATTACK_POWER + ftotalRanged * RANGED_ATTACK_POWER * (1. + (0.25 * Math.sqrt((areaHostile.length || 1) - 1))) - eHealMod;
	var friendlyLongRangeThreat = ftotalRanged * RANGED_ATTACK_POWER * (1. + (0.1 * Math.sqrt((areaHostile.length || 1) - 1))) - eHealMod;

	var enemyCloseRangeThreat; 
	var enemyLongRangeThreat; 


	let pairedHeal = 0
	if (creep.combatSnake && creep.mem.formationCreeps && /*creep.mem.formationCreeps.length == 2 &&*/ creep.room.isMyRoom()) {

		// Assume they're here for us
		for (let otherCreepName of creep.mem.formationCreeps) {
			let otherCreep = Game.creeps[otherCreepName]
			if (!otherCreep || !otherCreep.hasBodypart(HEAL)) continue
			
			let combatPartsInActive = otherCreep.getBoostModifiedCombatParts(false);
			let heal = combatPartsInActive.numHeal;

			if (!creep.hasActiveBodypart(TOUGH)) {
				let unModdedCombatPartsInActive = otherCreep.getBoostModifiedCombatParts(false, true);
				heal = (heal + combatPartsInActive.numHeal) / 2;

			}

			if (otherCreep.hits <= otherCreep.hitsMax - 100) {
				let combatPartsActive = otherCreep.getBoostModifiedCombatParts(true);

				// pairedHeal = combatPartsActive.numHeal + pairedHeal / 3;
				heal = combatPartsActive.numHeal + (combatPartsInActive.numHeal - combatPartsActive.numHeal) / 3
			}

			pairedHeal += heal

			// If we're damaged, nerf heal that assumes tough boosted
		}

		pairedHeal *= HEAL_POWER;


		let numFriends = Math.max(1, areaFriends.length - numFriendlyRamparters);

		let fHealMod = (ftotalHeal * HEAL_POWER - pairedHeal) * (0.6 + 0.4 / numFriends)

		// [00:39:55]t7610_116 0 69.73333333333333 2 15 0 661.1999999999997

		enemyCloseRangeThreat = etotalAttack * ATTACK_POWER + etotalRanged * RANGED_ATTACK_POWER * (1. + (0.25 * Math.sqrt(numFriends - 1))) - fHealMod - pairedHeal;
		enemyLongRangeThreat  = etotalRanged * RANGED_ATTACK_POWER * (1. + (0.1 * Math.sqrt(numFriends - 1))) - fHealMod - pairedHeal;
	}
	else {
		let numFriends = Math.max(1, areaFriends.length - numFriendlyRamparters);

		if (creep.combatSnake) {
			let fHealMod = ftotalHeal * HEAL_POWER * (0.9 + 0.1 / numFriends)

			enemyCloseRangeThreat = etotalAttack * ATTACK_POWER + etotalRanged * RANGED_ATTACK_POWER * (1. + (0.25 * Math.sqrt(numFriends - 1))) - fHealMod;
			enemyLongRangeThreat  = etotalRanged * RANGED_ATTACK_POWER * (1. + (0.1 * Math.sqrt(numFriends - 1))) - fHealMod;

		}
		else {			
			let fHealMod = ftotalHeal * HEAL_POWER * (0.8 + 0.2 / numFriends)

			enemyCloseRangeThreat = etotalAttack * ATTACK_POWER + etotalRanged * RANGED_ATTACK_POWER * (1. + (0.25 * Math.sqrt(numFriends - 1))) - fHealMod;
			enemyLongRangeThreat  = etotalRanged * RANGED_ATTACK_POWER * (1. + (0.1 * Math.sqrt(numFriends - 1))) - fHealMod;
		}
	}
	// console.log(creep.name, etotalAttack, etotalRanged, numFriends, areaFriends.length, fHealMod, pairedHeal)


	let agression = 0;

	if (creep.exRamparter) {
		agression -= 2;
	}
	if (creep.moveRooms) {
		agression -= 2;	
	}


	if ((creep.room.effectiveLevel || 0) >= 3) {
		let towers = creep.room.getMyActiveTowers();
		for (let tower of towers) {
			let range = tower.pos.getRangeTo(combatLocation);
			// Towers will tend to attack adn not heal, and don't have 100% up time. Call it 7-2-1
			friendlyCloseRangeThreat += util.getTowerDamageForDist(range) * 0.7;
			friendlyLongRangeThreat += util.getTowerDamageForDist(range) * 0.7;

			enemyCloseRangeThreat -= util.getTowerHealForDist(range) * 0.2;
			enemyLongRangeThreat -= util.getTowerHealForDist(range) * 0.2;
		}

		if (creep.room.breached) {
			agression += 2;
		}
		else if (enemyLongRangeThreat > 0 || enemyCloseRangeThreat > 0) {
			agression -= 2;	
		}
	}
	else if (Memory.swc && global.whiteList.includes(Memory.rooms[creep.room.name].owner)) {
		let towers = _.filter(creep.room.towers, (tower) => tower.energy >= TOWER_ENERGY_COST && tower.isActive())

		for (let tower of towers) {
			let range = tower.pos.getRangeTo(combatLocation);
			// Towers will tend to attack adn not heal, and don't have 100% up time. Call it 7-2-1
			friendlyCloseRangeThreat += util.getTowerDamageForDist(range) * 0.35;
			friendlyLongRangeThreat += util.getTowerDamageForDist(range) * 0.35;

			enemyCloseRangeThreat -= util.getTowerHealForDist(range) * 0.1;
			enemyLongRangeThreat -= util.getTowerHealForDist(range) * 0.1;
		}
	}
	else if (Memory.season2 && Memory.rooms[creep.room.name].owner == "Cub") {
		let towers = _.filter(creep.room.towers, (tower) => tower.energy >= TOWER_ENERGY_COST && tower.isActive())

		for (let tower of towers) {
			let range = tower.pos.getRangeTo(combatLocation);
			// Towers will tend to attack adn not heal, and don't have 100% up time. Call it 7-2-1
			friendlyCloseRangeThreat += util.getTowerDamageForDist(range) * 0.35;
			friendlyLongRangeThreat += util.getTowerDamageForDist(range) * 0.35;

			enemyCloseRangeThreat -= util.getTowerHealForDist(range) * 0.1;
			enemyLongRangeThreat -= util.getTowerHealForDist(range) * 0.1;
		}
	}
	
	else if (creep.room.isEnemyRoom()) {
		let towers = _.filter(creep.room.towers, (tower) => tower.energy >= TOWER_ENERGY_COST && tower.isActive())

		for (let tower of towers) {
			let range = tower.pos.getRangeTo(combatLocation);

			enemyCloseRangeThreat += util.getTowerDamageForDist(range) * 0.7;
			enemyLongRangeThreat += util.getTowerDamageForDist(range) * 0.7;

			friendlyCloseRangeThreat -= util.getTowerHealForDist(range) * 0.2;
			friendlyLongRangeThreat -= util.getTowerHealForDist(range) * 0.2;
		}
	}


	if (creep.room.controller && creep.room.controller.my && (creep.room.controller.safeMode || 0) > 10) {
		enemyCloseRangeThreat = 0;
		enemyLongRangeThreat = 0;
	}

	/*let hash = friendlyCloseRangeThreat.toString() + "_" +
			   friendlyLongRangeThreat.toString() + "_" +
			   enemyCloseRangeThreat.toString() + "_" +
			   enemyLongRangeThreat.toString() + "_" +
			   creep.hits.toString() + "_" +
			   Memory.rooms[creep.room.name].cS.toString();

	if (global.combatStances[hash]) {
		return global.combatStances[hash]
	}*/
	// [00:39:55]t7610_116 -2 -3673.5308230375304 -4844.652329215014 122.46666666666704 17.866666666667015
	// if (creep.combatSnake) console.log(creep.name, agression, friendlyCloseRangeThreat, friendlyLongRangeThreat, enemyCloseRangeThreat, enemyLongRangeThreat)

	// console.log(creep, friendlyCloseRangeThreat, friendlyLongRangeThreat, enemyCloseRangeThreat, enemyLongRangeThreat)
	// console.log(etotalAttack, etotalRanged, etotalHeal, ftotalAttack, ftotalRanged, ftotalHeal)


	if (creep.ticksToLive < 50) agression += 1
	if (creep.ticksToLive < 20) agression += 1
	if (creep.ticksToLive < 10) agression += 1
	if (creep.ticksToLive < 5) agression += 2
	if (creep.ticksToLive <= 2) agression += 10

	if (ftotalHeal == 0 && pairedHeal == 0) {
		// Can't hurt, can't heal.
		if (!creep.hasActiveBodypart(ATTACK) && !creep.hasActiveBodypart(RANGED_ATTACK)) {
			agression -= 5;
		}
		else {
			agression -= 1;
		}
	}

	if (creep.combatSnake) console.log(creep.name, agression, enemyCloseRangeThreat, enemyLongRangeThreat, friendlyCloseRangeThreat, friendlyLongRangeThreat)

	let myBodyLength = creep.body.length


	// Should be able to just out heal them
	if (enemyCloseRangeThreat < 0 && enemyLongRangeThreat < 0  && (friendlyCloseRangeThreat > 0 || friendlyLongRangeThreat > 0)) {
		agression += 4;
	}
	// Shit, they'll probably out heal us.
	if (friendlyCloseRangeThreat < 0 && friendlyLongRangeThreat < 0 && (enemyCloseRangeThreat > 0 || enemyLongRangeThreat > 0)) {
		agression -= 4;
	}

	if (creep.combatSnake) console.log(creep.name, agression)

	// We're just better. Kill them.
	if (friendlyCloseRangeThreat >= enemyCloseRangeThreat && 
		friendlyLongRangeThreat >= enemyLongRangeThreat) {

		if (enemyCloseRangeThreat > 0) {
			agression += Math.min(4, 4 * (friendlyCloseRangeThreat / enemyCloseRangeThreat - 1))
		}
		else {
			agression += 4;
		}

	}

	// if (friendlyCloseRangeThreat >= 2 * enemyCloseRangeThreat && friendlyLongRangeThreat >= 2 * enemyLongRangeThreat) {
	// 	agression += 2;
	// }

	if (creep.combatSnake) console.log(creep.name, agression)
	// We're just worse. Eeek
	if (enemyCloseRangeThreat >= friendlyCloseRangeThreat && 
		enemyLongRangeThreat >= friendlyLongRangeThreat) {
		// agression -= 2;
		if (friendlyCloseRangeThreat > 0) {
			// A bit different from the above. If we're winning we want to balance agression and not push close if we're much stronger long
			// If we're losing we just want to run if we're worse alround
			agression -= Math.min(4, 4 * (Math.max(enemyLongRangeThreat / Math.max(1, friendlyLongRangeThreat), enemyCloseRangeThreat / friendlyCloseRangeThreat) - 1))
		}
		else {
			agression -= 4;
		}
	}

	if (creep.combatSnake) console.log(creep.name, agression)
	// TODO: Next two are only one way
	// Hardly any damage
	if (enemyCloseRangeThreat < myBodyLength / 2 && enemyLongRangeThreat < myBodyLength / 2) {
		agression += 2;
	}
	// As above
	if (enemyCloseRangeThreat < myBodyLength && enemyLongRangeThreat < myBodyLength) {
		agression += 1;
	}

	if (creep.combatSnake) console.log(creep.name, agression)
	
	if (closeCombat) {
		// They're stronger than us close up
		if (enemyCloseRangeThreat > 0) {	
			if (enemyCloseRangeThreat > 3 * friendlyCloseRangeThreat) {
				agression -= 2;
			}
			else if (enemyCloseRangeThreat > 2 * friendlyCloseRangeThreat) {
				agression -= 1.5;
			}
			else if (enemyCloseRangeThreat > 1.5 * friendlyCloseRangeThreat) {
				agression -= 1;
			}
			else if (enemyCloseRangeThreat > friendlyCloseRangeThreat) {
				agression -= 0.5;
			}
		}

		// Enemy is strong close up
		if (enemyLongRangeThreat * 3 < enemyCloseRangeThreat) {
			agression -= 2;
		}
		else if (enemyLongRangeThreat * 2 < enemyCloseRangeThreat) {
			agression -= 1.5;
		}
		else if (enemyLongRangeThreat * 1.5 < enemyCloseRangeThreat) {
			agression -= 1;
		}
		else if (enemyLongRangeThreat < enemyCloseRangeThreat) {
			agression -= 0.5;
		}
		// console.log("agg E", agression)
		
		// We're stronger than them close up
		if (friendlyCloseRangeThreat > 0) {			
			if (friendlyCloseRangeThreat > 3 * enemyCloseRangeThreat) {
				agression += 2;
			}
			else if (friendlyCloseRangeThreat > 2 * enemyCloseRangeThreat) {
				agression += 1.5;
			}
			else if (friendlyCloseRangeThreat > 1.5 * enemyCloseRangeThreat) {
				agression += 1;
			}
			else if (friendlyCloseRangeThreat > enemyCloseRangeThreat) {
				agression += 0.5;
			}
		}

		// Friendlies are strong close up
		if (friendlyLongRangeThreat * 3 < friendlyCloseRangeThreat) {
			agression += 2;
		}
		else if (friendlyLongRangeThreat * 2 < friendlyCloseRangeThreat) {
			agression += 1.5;
		}
		else if (friendlyLongRangeThreat * 1.5 < friendlyCloseRangeThreat) {
			agression += 1;
		}
		else if (friendlyLongRangeThreat < friendlyCloseRangeThreat) {
			agression += 0.5;
		}		
	}

	// Should be able to just out heal them
	/*if (enemyCloseRangeThreat < 0 && enemyLongRangeThreat < 0  && (friendlyCloseRangeThreat > 0 || friendlyLongRangeThreat > 0)) {
		agression += 4;
	}
	// Hardly any damage
	if (enemyCloseRangeThreat < myBodyLength / 2 && enemyLongRangeThreat < myBodyLength / 2) {
		agression += 2;
	}
	// As above
	if (enemyCloseRangeThreat < myBodyLength && enemyLongRangeThreat < myBodyLength) {
		agression += 1;
	}

	// Shit, they'll probably out heal us.
	if (friendlyCloseRangeThreat < 0 && friendlyLongRangeThreat < 0 && (enemyCloseRangeThreat > 0 || enemyLongRangeThreat > 0)) {
		agression -= 4;
	}

	if (creep.combatSnake) console.log(creep.name, agression)

	// Enemy is weak close up
	// This isn't actually possible. Close range can't be less than long range
	// if (enemyCloseRangeThreat < 3 * enemyLongRangeThreat) {
	// 	agression += 2;
	// }
	// else if (enemyCloseRangeThreat < 1.5 * enemyLongRangeThreat) {
	// 	agression += 1;
	// }

	if (creep.combatSnake) console.log(creep.name, agression)
	// Enemy is strong close up
	if (enemyLongRangeThreat < 3 * enemyCloseRangeThreat) {
		agression -= 2;
	}
	else if (enemyLongRangeThreat < 1.5 * enemyCloseRangeThreat) {
		agression -= 1;
	}
	else if (enemyLongRangeThreat < enemyCloseRangeThreat) {
		agression -= 0.5;
	}
	if (creep.combatSnake) console.log(creep.name, agression)

	// We're stronger than them close up
	if (friendlyCloseRangeThreat > 3 * enemyCloseRangeThreat) {
		agression += 2;
	}
	else if (friendlyCloseRangeThreat > 1.5 * enemyCloseRangeThreat) {
		agression += 1;
	}
	else if (friendlyCloseRangeThreat > enemyCloseRangeThreat) {
		agression += 0.5;
	}

	if (creep.combatSnake) console.log(creep.name, agression)

	if (creep.combatSnake) console.log(creep.name, agression)

	// We're just better. Kill them.
	if (friendlyCloseRangeThreat > enemyCloseRangeThreat && friendlyLongRangeThreat > enemyLongRangeThreat) {
		agression += 2;
	}

	if (friendlyCloseRangeThreat > 2 * enemyCloseRangeThreat && friendlyLongRangeThreat > 2 * enemyLongRangeThreat) {
		agression += 2;
	}

	if (creep.combatSnake) console.log(creep.name, agression)
	// We're just worse. Eeek
	if (friendlyCloseRangeThreat < enemyCloseRangeThreat && friendlyLongRangeThreat < enemyLongRangeThreat) {
		agression -= 2;
	}
	if (2 * friendlyCloseRangeThreat < enemyCloseRangeThreat && 2 * friendlyLongRangeThreat < enemyLongRangeThreat) {
		agression -= 2;
	}
	if (creep.combatSnake) console.log(creep.name, agression)

	// Friendlies are strong close up
	if (friendlyCloseRangeThreat > 3 * friendlyLongRangeThreat) {
		agression += 2;
	}
	else if (friendlyCloseRangeThreat > 1.5 * friendlyLongRangeThreat) {
		agression += 1;
	}
	else if (friendlyCloseRangeThreat > friendlyLongRangeThreat) {
		agression += 0.5;
	}*/
	if (creep.combatSnake) console.log(creep.name, agression)




	// Friendlies are weak close up
	// Not actually possible. Close range can't be lower than long range
	// if (friendlyLongRangeThreat > 2.5 * friendlyCloseRangeThreat) {
	// 	agression -= 2;
	// }
	// else if (friendlyLongRangeThreat > 1.25 * friendlyCloseRangeThreat) {
	// 	agression -= 1;
	// }

	if (creep.combatSnake) console.log(creep.name, agression)
	if (creep.combatSnake) {
		for (let formationCreepName of creep.mem.formationCreeps) {
			let formationCreep = Game.creeps[formationCreepName]
			if (!formationCreep) continue
			if (!creep.pos.isNearToPos(formationCreep.pos)) continue

			if (formationCreep.getToughBoostLevel() > 1) {
				// Ow ow ow ow ow.
				if (formationCreep.hits < 0.6 * formationCreep.hitsMax) {
					agression -= 5;
					agression = Math.min(agression, -4)
				}
				else if (formationCreep.hits < 0.7 * formationCreep.hitsMax) {
					agression -= 4;
					agression = Math.min(agression, -2)
				}
				else if (formationCreep.hits < 0.8 * formationCreep.hitsMax) {
					agression -= 3;
				}
				else if (formationCreep.hits < 0.9 * formationCreep.hitsMax) {
					agression -= 2;
				}
				else if (formationCreep.hits < 0.95 * formationCreep.hitsMax) {
					agression -= 1;
				}
			}
			else {		
				// Ow ow ow ow ow.
				if (formationCreep.hits < 0.2 * formationCreep.hitsMax) {
					agression -= 5;
					agression = Math.min(agression, -4)
				}
				else if (formationCreep.hits < 0.4 * formationCreep.hitsMax) {
					agression -= 4;
					agression = Math.min(agression, -2)
				}
				else if (formationCreep.hits < 0.6 * formationCreep.hitsMax) {
					agression -= 3;
				}
				else if (formationCreep.hits < 0.8 * formationCreep.hitsMax) {
					agression -= 2;
				}
				else if (formationCreep.hits < 0.9 * formationCreep.hitsMax) {
					agression -= 1;
				}
			}
		}
	}
	else {		
		if (creep.getToughBoostLevel() > 1) {
			// Ow ow ow ow ow.
			if (creep.hits < 0.6 * creep.hitsMax) {
				agression -= 5;
				agression = Math.min(agression, -4)
			}
			else if (creep.hits < 0.7 * creep.hitsMax) {
				agression -= 4;
				agression = Math.min(agression, -2)
			}
			else if (creep.hits < 0.8 * creep.hitsMax) {
				agression -= 3;
			}
			else if (creep.hits < 0.9 * creep.hitsMax) {
				agression -= 2;
			}
			else if (creep.hits < 0.95 * creep.hitsMax) {
				agression -= 1;
			}
		}
		else {		
			// Ow ow ow ow ow.
			if (creep.hits < 0.2 * creep.hitsMax) {
				agression -= 5;
				agression = Math.min(agression, -4)
			}
			else if (creep.hits < 0.4 * creep.hitsMax) {
				agression -= 4;
				agression = Math.min(agression, -2)
			}
			else if (creep.hits < 0.6 * creep.hitsMax) {
				agression -= 3;
			}
			else if (creep.hits < 0.8 * creep.hitsMax) {
				agression -= 2;
			}
			else if (creep.hits < 0.9 * creep.hitsMax) {
				agression -= 1;
			}
		}
	}



	if (creep.combatSnake) console.log(creep.name, agression)

	switch ((Memory.rooms[creep.room.name].cS || constants.COMBAT_STRATEGY_DEFAULT) % 100) {
		case (constants.ROOM_COMBAT_STRATEGY_HYPER_AGGRESSIVE):
			agression += 3;
			break;
		case (constants.ROOM_COMBAT_STRATEGY_AGGRESSIVE):
			agression += 2;
			break;
		case (constants.ROOM_COMBAT_STRATEGY_QUITE_AGGRESSIVE):
			agression += 1;
			break;
		case (constants.ROOM_COMBAT_STRATEGY_DEFAULT):
			break;
		case (constants.ROOM_COMBAT_STRATEGY_QUITE_COWARDLY):
			agression -= 1;
			break;
		case (constants.ROOM_COMBAT_STRATEGY_COWARDLY):
			agression -= 2;
			break;
		case (constants.ROOM_COMBAT_STRATEGY_SUPER_COWARDLY):
			agression -= 3;
			break;
	}

	agression -= (creep.caution || 0)

	if (creep.room.roomStrength && !creep.room.isMyRoom()) {
		if (creep.room.roomStrength < 1) {
			agression -= Math.ceil(1 / creep.room.roomStrength)
			// Only creep here and we're the underdog. Just get out and maybe try to get to where we want to be a different way
			if (creep.room.find(FIND_MY_CREEPS).length == 1 && creep.mem.targetRoom != creep.room.name && !util.isEdgeOfRoom(creep.pos)) {
				agression -= Math.ceil(1 / creep.room.roomStrength)
				if (creep.room.roomStrength < 0.5) {
					agression -= 5
				}
			}
		}
	}


	// We're stronger than them far away. If we're going to be agressive, dial it down. No need to charge in and meet something unexpected
	if (friendlyLongRangeThreat > 3 * enemyLongRangeThreat && agression > 2) {
		agression -= 2;
	}
	else if (friendlyLongRangeThreat > 1.5 * enemyLongRangeThreat && agression > 1) {
		agression -= 1;
	}
	else if (friendlyLongRangeThreat > enemyLongRangeThreat && agression > 0.5) {
		agression -= 0.5;
	}
	// They're stronger than us further away. If we're not going to be agressive, maybe consider it.
	else if (enemyLongRangeThreat > 3 * friendlyLongRangeThreat && agression < -2) {
		agression += 2;
	}
	else if (enemyLongRangeThreat > 1.5 * friendlyLongRangeThreat && agression < -1) {
		agression += 1;
	}
	else if (enemyLongRangeThreat > friendlyLongRangeThreat && agression < -0.5) {
		agression += 0.5;
	}	


	if (creep.combatSnake) console.log(creep.name, agression)

	// global.combatStances[hash] = ;

	return {"agression": Math.round(agression), "eClose": enemyCloseRangeThreat, "eLong": enemyLongRangeThreat, "fClose": friendlyCloseRangeThreat, "fLong": friendlyLongRangeThreat};
}

function getBestEnemyFromTargets(creep, attackRange, targets) {
	let bestEnemy;
	let bestEnemyScore = Infinity;

	// let enemyRoom = creep.room.isEnemyRoom()

	global.inTickObject.creepAttackAnalysis = global.inTickObject.creepAttackAnalysis || {}

	// Targets contains all healers (amongst other things). Hostiles contains all enemies.
	let enemyHealers = _.filter(targets, hostile => hostile.hasActiveBodypart(HEAL));

	// Lowest score best
	for (let testEnemy of targets) {
		// if (enemyRoom) {
		// 	let roomMap = roomIntel.getEnemyRoomMap(creep.room.name);
		// 	if (roomMap && creep.pos.getRangeTo(testEnemy.pos) > attackRange && 
		// 		(parseInt(roomMap[testEnemy.pos.x][testEnemy.pos.y]) !== parseInt(roomMap[creep.pos.x][creep.pos.y]))) {
		// 		continue;
		// 	}
		// }
		
		// LOW SCORE WINS
		// This is all constant over the tick and hence cacheable
		let score;
		let totalHeal
		let effectiveHits
		// let effectiveHitsMax
		if (global.inTickObject.creepAttackAnalysis[testEnemy.id]) {
			score = global.inTickObject.creepAttackAnalysis[testEnemy.id].score
			totalHeal = global.inTickObject.creepAttackAnalysis[testEnemy.id].totalHeal
			effectiveHits = global.inTickObject.creepAttackAnalysis[testEnemy.id].effectiveHits
		}
		else {	
			score = ((creep.room.mem.requestHelpAgainst[1 - (Game.time % 2)] || {})[testEnemy.id] || 0) * 4;

			// Accounts for tough. 
			effectiveHits = testEnemy.getEffectiveHitPoints();
			let effectiveHitsMax = testEnemy.getEffectiveMaxHitPoints();

			// Hit injured more. If it's on 50% health it'll fire one extra range 
			score += (effectiveHits / effectiveHitsMax) * 2;

			// Hit ones with lower numbers of tough parts (ie. no tough is 1, 10 T3 tough on 50 part creep is 2.17)
			// If I multiply it by 3 we'll hit a low-tough thing further away preferentially.
			score += 3 * (effectiveHitsMax / testEnemy.hitsMax) * (effectiveHitsMax / testEnemy.hitsMax)

			// Enemy heals. Try to hit ones that can't be healed. The above mostly takes priority
			totalHeal = 0
			for (let potentialHealer of enemyHealers) {
				let healerRange = potentialHealer.pos.getRangeToPos(testEnemy.pos)
				if (healerRange <= 1) {
					let bmh = potentialHealer.getActiveBoostModifiedHeal();
					// Can be up to 200 (50 T3 heal)
					score += bmh / 500;
					totalHeal += bmh * HEAL_POWER
				}
				else if (healerRange <= 3) {
					let bmh = potentialHealer.getActiveBoostModifiedHeal();
					score += bmh / 2000;
					totalHeal += bmh * RANGED_HEAL_POWER
				}
			}

			// Screw the healers first.
			if (testEnemy.hasBodypart(HEAL)) {
				score -= testEnemy.getBoostModifiedHeal() / 1000
			}
			if (testEnemy.hasBodypart(RANGED_ATTACK)) {
				if (testEnemy.pos.findFirstInRange(FIND_MY_CREEPS, 1)) {
					// RMA is annoying
					score -= testEnemy.getBoostModifiedRangedAttack() / 1000
				}
				else {
					score -= testEnemy.getBoostModifiedRangedAttack() / 3000
				}
			}
			if (testEnemy.hasBodypart(ATTACK)) {
				// Kill kill kill. Danger!
				if (testEnemy.pos.findFirstInRange(FIND_MY_CREEPS, 1)) {
					score -= testEnemy.getActiveBoostModifiedAttack() / 500
				}
				else {
					score -= testEnemy.getActiveBoostModifiedAttack() / 5000
				}
			}


			// Hit big people more, but not much more.
			score -= effectiveHits / 1000000;

			// Hot old people more, but not much more
			score -= testEnemy.ticksToLive / 10000

			// Don't do keepers if there's non keepers
			if (creep.room.keeperRoom && testEnemy.owner.username == "Source Keeper") {
				score += 1e6;
			}
			else if (Memory.debugEnemyTargeting) {
				creep.room.visual.text(Math.round(score * 2), testEnemy.pos.x, testEnemy.pos.y, {color: "#ff8080"})
			}

			score = score * (0.75 + 0.5 * Math.random())	

			global.inTickObject.creepAttackAnalysis[testEnemy.id] = {score: score, totalHeal: totalHeal, effectiveHits: effectiveHits};

		}

		// They're dead. Hard stop.
		if ((testEnemy.numDamageSoFar || 0) >= effectiveHits + totalHeal && !(creep.room.isEnemyRoom() && creep.room.towers)) {
			continue
		}


		// Closer is better
		if (attackRange > 1) {					
			score += creep.pos.getRangeToPos(testEnemy.pos);
		}

		// Focus fire.
		// This can cause overkill
		// Note: this assumes they get zero healing. 
		if ((testEnemy.numDamageSoFar || 0) < effectiveHits) {
			score -= (testEnemy.numAttacksSoFar || 0) * 2;
		}




		if (score < bestEnemyScore) {
			bestEnemy = testEnemy;
			bestEnemyScore = score;
		}
	}

	return bestEnemy
}


function assaulterRangedAttack(creep) {
	let targetCreeps = creep.pos.findInRange(creep.room.getAllHostileCreepsWithBodyParts([ATTACK, HEAL, RANGED_ATTACK, WORK], false), 3);

	// Simple. Save CPU
	if (Game.cpu.bucket < 750) {
		if (Memory.swc || Memory.season2) {
			targetCreeps = _.filter(targetCreeps, (targetCreep) => (global.whiteList.indexOf(targetCreep.owner.username) == -1));
		}
		else if (Memory.season) {
			targetCreeps = _.filter(targetCreeps, (targetCreep) => (!scouting.isPlayerMediumWhiteListed(targetCreep.owner.username)));
			targetCreeps = _.filter(targetCreeps, (targetCreep) => (!scouting.isPlayerSoftWhiteListed(targetCreep.owner.username) || creep.hits != creep.hitsMax))// || targetCreep.hasBodypart(ATTACK) || targetCreep.hasBodypart(RANGED_ATTACK) || targetCreep.hasBodypart(HEAL) || targetCreep.hasBodypart(CLAIM)));
		}

		if (targetCreeps.length) {
			let closestCreep = creep.pos.findClosestByRange(targetCreeps);
			if (creep.pos.isNearToPos(closestCreep.pos)) {
				creep.rangedMassAttack()
			}
			else {
				creep.rangedAttack(closestCreep)	
			}
		}
		else if (creep.room.isEnemyRoom()) {
			// let target = creep.pos.findClosestByRange(FIND_STRUCTURES)
			let targets = creep.pos.findInRange(FIND_STRUCTURES, 3)

			let target = creep.pos.findClosestByRange(targets)

			if (target && !target.my) {				
				if (creep.pos.isNearToPos(target.pos)) {
					if (target.owner) {
						creep.rangedMassAttack()
					}
					else {
						creep.rangedAttack(target)	
					}
				}
				else {
					creep.rangedAttack(target)				
				}
			}
		}

		return
	}

	let powerCreeps = creep.pos.findInRange(FIND_HOSTILE_POWER_CREEPS, 3)
	let allTargetCreeps = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 3).concat(powerCreeps);
	if (Memory.swc) {
		targetCreeps = _.filter(targetCreeps, (targetCreep) => (global.whiteList.indexOf(targetCreep.owner.username) == -1));
		allTargetCreeps = _.filter(allTargetCreeps, (targetCreep) => (global.whiteList.indexOf(targetCreep.owner.username) == -1));
		powerCreeps = _.filter(powerCreeps, (targetCreep) => (global.whiteList.indexOf(targetCreep.owner.username) == -1));
	}
	else if (Memory.season) {
		targetCreeps = _.filter(targetCreeps, (targetCreep) => (!scouting.isPlayerMediumWhiteListed(targetCreep.owner.username)));
		allTargetCreeps = _.filter(allTargetCreeps, (targetCreep) => (!scouting.isPlayerMediumWhiteListed(targetCreep.owner.username)));
		powerCreeps = _.filter(powerCreeps, (targetCreep) => (!scouting.isPlayerMediumWhiteListed(targetCreep.owner.username)));

		targetCreeps = _.filter(targetCreeps, (targetCreep) => (!scouting.isPlayerSoftWhiteListed(targetCreep.owner.username) || creep.hits != creep.hitsMax))// || targetCreep.hasBodypart(ATTACK) || targetCreep.hasBodypart(RANGED_ATTACK) || targetCreep.hasBodypart(HEAL) || targetCreep.hasBodypart(CLAIM)));
		allTargetCreeps = _.filter(allTargetCreeps, (targetCreep) => (!scouting.isPlayerSoftWhiteListed(targetCreep.owner.username) || creep.hits != creep.hitsMax))// || targetCreep.hasBodypart(ATTACK) || targetCreep.hasBodypart(RANGED_ATTACK) || targetCreep.hasBodypart(HEAL) || targetCreep.hasBodypart(CLAIM)));
		powerCreeps = _.filter(powerCreeps, (targetCreep) => (!scouting.isPlayerSoftWhiteListed(targetCreep.owner.username) || creep.hits != creep.hitsMax))// || targetCreep.hasBodypart(ATTACK) || targetCreep.hasBodypart(RANGED_ATTACK) || targetCreep.hasBodypart(HEAL) || targetCreep.hasBodypart(CLAIM)));

	}



	let RMAOnunRamparted = 0;
	let RMAOnRampart = 0;
	let allUnrampartedCreeps = [];
	let unrampartedCreeps = [];

	let isEnemyRoom = creep.room.isEnemyRoom()


	// Find uncovered creeps for stats tracking
	if (isEnemyRoom) {
		for (let targetCreep of allTargetCreeps) {
			let ramparted = false;
			let roaded = false;
			let structsOnCreep = targetCreep.pos.lookFor(LOOK_STRUCTURES);
			for (let structOnCreep of structsOnCreep) {
				if (structOnCreep.structureType == STRUCTURE_RAMPART) {
					ramparted = true;
				}
				else if (structOnCreep.structureType == STRUCTURE_ROAD) {
					roaded = true;
				}
			}
			let damage = 0;
			if (!ramparted) {
				let add = 1;

				if (targetCreep.body) {					
					let numMove = targetCreep.getNumOfBodyPart(MOVE);
					if (!roaded) {
						if (numMove < targetCreep.body.length / 4 + 0.01) {
							add = 2;
						}
						else if (numMove < targetCreep.body.length / 2 + 0.01) {
							add = 1.5;
						}
					}
					else {
						if (numMove < targetCreep.body.length / 4 + 0.01) {
							add = 1.5;
						}
					}
				}
				
				creep.room.exposedCreeps = (creep.room.exposedCreeps || 0) + add;

				let range = creep.pos.getRangeTo(targetCreep);
				if (range == 3) {
					damage += 1;
				}
				else if (range == 2) {
					damage += 4;
				}
				else if (range == 1) {
					damage += 10;
				}

				// Not quite sure why I had this
				// if (targetCreep.getActiveBodyparts(TOUGH)) {
				// 	let toughBoostLevel = targetCreep.getActiveToughBoostLevel();
				// 	if (toughBoostLevel == 4) {
				// 		damage *= 0.3;
				// 	}
				// 	else if (toughBoostLevel == 3) {
				// 		damage *= 0.5;
				// 	}
				// 	else if (toughBoostLevel == 2) {
				// 		damage *= 0.7;
				// 	}
				// }

				RMAOnunRamparted += damage;

				allUnrampartedCreeps.push(targetCreep)
				if (targetCreeps.includes(targetCreep) || powerCreeps.includes(targetCreep)) {
					unrampartedCreeps.push(targetCreep);
				}
			}
			else {
				let range = creep.pos.getRangeTo(targetCreep);
				if (range == 3) {
					RMAOnRampart += 1;
				}
				else if (range == 2) {
					RMAOnRampart += 4;
				}
				else if (range == 1) {
					RMAOnRampart += 10;
				}
			}
		}
	}


	if (RMAOnunRamparted >= 10) {
		return creep.rangedMassAttack();
	}
	else if (unrampartedCreeps.length) {
		let potentialTargets;
		if (creep.mem.closeCombatFormation || !creep.hasBoost() || (creep.mem.boostLevel || 0) != 3) {
			potentialTargets = _.clone(unrampartedCreeps)
		}
		else {
			// we're T3 boosted. Ignore people who aren't repairing or are unboosted
			potentialTargets = _.clone(unrampartedCreeps)
			for (let unrampartedCreep of unrampartedCreeps) {
				if (!unrampartedCreep.hasBodypart(WORK) && !unrampartedCreep.hasBoost()) {
					_.pull(potentialTargets, unrampartedCreep)
				}
			}
		}



		if (potentialTargets.length == 1) {
			return creep.rangedAttack(potentialTargets[0]);
		}
		else if (potentialTargets.length > 0) {
			let bestTarget = getBestEnemyFromTargets(creep, 3, potentialTargets)
			if (!bestTarget) {
				console.log("---------- CREEP NO BEST TARGET 1")
				let bestScore = Infinity;
				for (let potentialTarget of potentialTargets) {
					// 1 point for every 1000 lost hit points. 1 point for every step closer
					let score = creep.pos.getRangeTo(potentialTarget) - (potentialTarget.hitsMax - potentialTarget.hits) / 1000;

					if (potentialTarget.getActiveBodyparts(TOUGH)) {
						score += potentialTarget.getActiveToughBoostLevel() - 1;
					}

					if (score < bestScore) {
						bestScore = score;
						bestTarget = potentialTarget
					}
				}
			}

			if (bestTarget) {				
				if (creep.pos.isNearToRoomObject(bestTarget)) {
					return creep.rangedMassAttack();
				}
				else {
					return creep.rangedAttack(bestTarget);
				}
			}
			else {
				console.log("---------- CREEP NO BEST TARGET 2")
			}

		}
	}

	if (RMAOnRampart >= 10) {
		return creep.rangedMassAttack();
	}

	let targetStructs = creep.pos.findInRange(FIND_HOSTILE_STRUCTURES, 3).concat(creep.pos.findInRange(creep.room.constructedWalls, 3));
	targetCreeps = (isEnemyRoom ? allUnrampartedCreeps : allTargetCreeps)
	let targets = targetCreeps.concat(targetStructs);

	if (Memory.swc === 1) {
		targets = _.filter(targets, (target) => (!target.owner || !global.whiteList.includes(target.owner.username)));
	}
	else if (Memory.season) {
		targets = _.filter(targets, (target) => (!target.owner || !scouting.isPlayerMediumWhiteListed(target.owner.username)));
		targets = _.filter(targets, (target) => (!target.owner || !scouting.isPlayerSoftWhiteListed(target.owner.username) || creep.hits != creep.hitsMax))// || target.hasBodypart(ATTACK) || target.hasBodypart(RANGED_ATTACK) || target.hasBodypart(HEAL) || target.hasBodypart(CLAIM)));

	}


	if (targets.length > 0) {
		let alwaysAllowMaxDamage = 0
		let maybeDontAllowMaxDamage = 0

		var massDamage = 0;
		let usedPositions = [];
		for (var i in targets) {
			if (targets[i].structureType === STRUCTURE_KEEPER_LAIR) {
				continue
			}
			if (targets[i].blockingFormation) {
				if (targets[i].structureType == STRUCTURE_WALL) {
					maybeDontAllowMaxDamage = 1
				}
				else if (targets[i].structureType == STRUCTURE_RAMPART) {
					alwaysAllowMaxDamage = 1
				}
			}

			// Screw RMA, kill it.
			if (targets[i].structureType === STRUCTURE_INVADER_CORE && (targets[i].level < 4 || !Memory.rooms[creep.room.name].creepFortifier)) {
				let range = creep.pos.getRangeTo(targets[i]);
				if (range == 1) {
					return creep.rangedMassAttack();
				}
				else {
					return creep.rangedAttack(targets[i]);
				}
			}

			if (targets[i].structureType === STRUCTURE_CONTROLLER) {
				continue
			}
			else if ((targets[i].structureType === STRUCTURE_STORAGE && !creep.room.mem.killStorage) ||
				(targets[i].structureType === STRUCTURE_TERMINAL && !creep.room.mem.killTerminal)) {
				let range = creep.pos.getRangeTo(targets[i]);
				massDamage -= range == 3 ? 1 : range == 2 ? 4 : 10
			}

			let used = false;
			for (let position of usedPositions) {
				if (position.isEqualToPos(targets[i].pos)) {
					used = true;
					break;
				}
			}
			if (used) {
				continue;
			}

			let range = creep.pos.getRangeToRoomObject(targets[i]);
			if (range == 3) {
				if (targets[i].structureType != STRUCTURE_WALL) massDamage += 1;
				usedPositions.push(targets[i].pos)
			}
			else if (range == 2) {
				if (targets[i].structureType != STRUCTURE_WALL) massDamage += 4;
				usedPositions.push(targets[i].pos)
			}
			else if (range == 1) {
				if (targets[i].structureType != STRUCTURE_WALL) massDamage += 10;
				usedPositions.push(targets[i].pos)
			}
			if (massDamage > 10 && alwaysAllowMaxDamage) {
				break;
			}
		}


		//
		if(massDamage > 10 && !maybeDontAllowMaxDamage) {
			return creep.rangedMassAttack();
		}
		else {
			if (targetCreeps.length > 0) {
				return creep.rangedAttack(creep.pos.findClosestByRange(targetCreeps));
			}
			else {
				let bestStruct;
				let bestStructScore = Infinity;

				let pathDir;

				if (creep.mem.path) {
					pathDir = creep.mem.path[0]
				}
				else if (creep.mem.formationCreeps) {
					for (let creepName of creep.mem.formationCreeps) {
						if (Memory.creeps[creepName] && Memory.creeps[creepName].path) {
							pathDir = Memory.creeps[creepName].path[0]
							break
						}
					}

				}

				for (let struct of targetStructs) {
					if (struct.structureType === STRUCTURE_CONTROLLER) continue
					if (struct.structureType === STRUCTURE_STORAGE && !creep.room.mem.killStorage) continue
					if (struct.structureType === STRUCTURE_TERMINAL && !creep.room.mem.killTerminal) continue
					if (struct.structureType === STRUCTURE_KEEPER_LAIR) continue


					if (struct.structureType === STRUCTURE_INVADER_CORE) {
						bestStruct = struct;
						break
					}

					let distPos;
					let range
					if (pathDir) {
						let newX = creep.pos.x
						let newY = creep.pos.y

						switch(pathDir) {
							case TOP:
								newY -= 1
								break
							case TOP_RIGHT:
								newY -= 1
								newX += 1
								break
							case RIGHT:
								newX += 1
								break
							case BOTTOM_RIGHT:
								newY += 1
								newX += 1
								break
							case BOTTOM:
								newY += 1
								break
							case BOTTOM_LEFT:
								newY += 1
								newX -= 1
								break
							case LEFT:
								newX -= 1
								break
							case TOP_LEFT:
								newY -= 1
								newX -= 1
								break

						}
						if (newX >= 0 && newX < 50 && newY >= 0 && newY < 50) {
							let newPos = new RoomPosition(newX, newY, creep.room.name)
							let newRange = newPos.getRangeToRoomObject(struct)
							if (newRange <= 3) {
								range = newRange
							}
							else {
								range = creep.pos.getRangeToRoomObject(struct);
							}
						}
						else {
							range = creep.pos.getRangeToRoomObject(struct);	
						}
					}
					else {
						range = creep.pos.getRangeToRoomObject(struct);
					}


					let score = range * WALL_HITS_MAX + struct.hits

					if (struct.blockingFormation) {
						score -= 1e9
					}

					if (score < bestStructScore) {
						bestStructScore = score;
						bestStruct = struct;
					}
				}

				if (bestStruct) {					
					if (creep.pos.isNearToPos(bestStruct.pos) && bestStruct.owner) {
						return creep.rangedMassAttack();
					}
					else {
						return creep.rangedAttack(bestStruct);
					}
				}

			}
		}
	}
	else if (unrampartedCreeps.length) {
		if (unrampartedCreeps.length == 1) {
			return creep.rangedAttack(unrampartedCreeps[0]);
		}
		else {
			return creep.rangedAttack(creep.pos.findClosestByRange(unrampartedCreeps));
		}
	}
	else if (creep.room.name == creep.mem.targetRoom && (creep.room.controller && creep.room.controller.owner && !creep.room.controller.my)) {
		if (Memory.swc && global.whiteList.includes(creep.room.controller.owner.username)) {
			return;
		}
		// Probably faster to do it this way as findInRange will use lookForAtArea
		targets = creep.pos.findInRange(FIND_STRUCTURES, 3);

		if (Memory.swc === 1) {
			targets = _.filter(targets, (target) => (!target.owner || global.whiteList.indexOf(target.owner.username) == -1));
		}

		for (let target of _.clone(targets)) {
			if (target.my) _.pull(targets, target);
			if (target.structureType == STRUCTURE_STORAGE && !creep.room.mem.killStorage) _.pull(targets, target);
			if (target.structureType == STRUCTURE_TERMINAL && !creep.room.mem.killTerminal) _.pull(targets, target)
			if (!target.hits) _.pull(targets, target)
		}

		let bestStruct;
		let bestStructScore = Infinity;

		// console.log(creep, targets)

		for (let struct of targets) {
			// Seems to do the same as above?
			// if (struct.my) continue
			// if (struct.structureType === STRUCTURE_STORAGE && !creep.room.mem.killStorage) continue
			// if (struct.structureType === STRUCTURE_TERMINAL && !creep.room.mem.killTerminal) continue
			// if (!struct.hits) continue

			let score = creep.pos.getRangeTo(struct) * WALL_HITS_MAX + struct.hits

			if (score < bestStructScore) {
				bestStructScore = score;
				bestStruct = struct;
			}
		}


		return creep.rangedAttack(bestStruct);
	}
	else if ((!creep.room.controller || !creep.room.controller.my) && creep.mem.setupPos && creep.room.name == creep.mem.setupPos.roomName) {
		// Probably faster to do it this way as findInRange will use lookForAtArea
		targets = creep.pos.findInRange(FIND_STRUCTURES, 3, {
			filter: (structure) => {
				return structure.structureType == STRUCTURE_WALL && structure.hits;
			}
		});
		return creep.rangedAttack(creep.pos.findClosestByRange(targets));
	}
	else if (Game.time - creep.mem.pIncompleteTick < 10 && (!creep.room.controller || !creep.room.controller.my)) {
		let secondaryTarget = creep.pos.findFirstInRange(FIND_STRUCTURES, 1, {
			filter: (structure) => {
				return structure.structureType == STRUCTURE_WALL && structure.hits;
			}
		});
		if (secondaryTarget) {
			return creep.rangedAttack(secondaryTarget)
		}
	}
}


function skirmisherRangedAttackAndHeal(creep, enemy, enemyRange) {
	let mem = creep.mem
	let rangedAttackTarget = combatFindBestAttackTarget(creep, 3) || enemy

	if (Memory.season && rangedAttackTarget) {
		if (rangedAttackTarget.owner && scouting.isPlayerMediumWhiteListed(rangedAttackTarget.owner.username)) {
			rangedAttackTarget = undefined
		}
		else if (rangedAttackTarget.owner && scouting.isPlayerSoftWhiteListed(rangedAttackTarget.owner.username) && creep.hits == creep.hitsMax) {// && !rangedAttackTarget.hasBodypart(ATTACK) && !rangedAttackTarget.hasBodypart(RANGED_ATTACK) && !rangedAttackTarget.hasBodypart(HEAL) && !rangedAttackTarget.hasBodypart(CLAIM)) {
			rangedAttackTarget = undefined
		}

		// if (rangedAttackTarget && scouting.isPlayerSoftWhiteListed("Telemac")) {				
		// 	if (rangedAttackTarget.room.name == "E10S20" && rangedAttackTarget.owner.username == 'Telemac') {
		// 		rangedAttackTarget = undefined
		// 	}
		// 	else if (rangedAttackTarget.room.name == "E10S10" && rangedAttackTarget.owner.username == 'Telemac') {
		// 		rangedAttackTarget = undefined
		// 	}
		// }
		// if (rangedAttackTarget && scouting.isPlayerSoftWhiteListed("Cub")) {
		// 	if ((rangedAttackTarget.room.name == "E20S20" || rangedAttackTarget.room.name == "E30S0" || rangedAttackTarget.room.name == "E30N0" || rangedAttackTarget.room.name == "E20S10" || rangedAttackTarget.room.name == "E30S10") && rangedAttackTarget.owner.username == 'Cub') {
		// 		rangedAttackTarget = undefined
		// 	}
		// }
		// if (rangedAttackTarget && scouting.isPlayerSoftWhiteListed("Pyrodogg")) {
		// 	if ((rangedAttackTarget.room.name == "E10S30" || rangedAttackTarget.room.name == "E20S30") && rangedAttackTarget.owner.username == 'Pyrodogg') {
		// 		rangedAttackTarget = undefined
		// 	}
		// }
		// if (rangedAttackTarget && scouting.isPlayerSoftWhiteListed("Modus")) {
		// 	if ((rangedAttackTarget.room.name == "E10S30" || rangedAttackTarget.room.name == "E20S30") && rangedAttackTarget.owner.username == 'Modus') {
		// 		rangedAttackTarget = undefined
		// 	}
		// }		
	}



	if (rangedAttackTarget && rangedAttackTarget != enemy) {
		enemyRange = creep.pos.getRangeTo(rangedAttackTarget);
	}
	// if (rangedAttackTarget) {
	// 	console.log(creep, rangedAttackTarget, enemy, enemyRange)
	// }

	// Don't move toward it, but do kill it.
	if (!rangedAttackTarget || enemyRange > 3) {
		// if ((creep.room.mem.numStructures || 2) > 1) {
			rangedAttackTarget = creep.pos.findFirstInRange(FIND_HOSTILE_STRUCTURES, 3, {
				filter: (object) => {
					return (object.structureType != STRUCTURE_STORAGE || creep.room.mem.killStorage) &&
						   (object.structureType != STRUCTURE_TERMINAL || creep.room.mem.killTerminal);
				}
			});
		// }
		if (Memory.swc === 1) {
			if (rangedAttackTarget && rangedAttackTarget.owner && global.whiteList.indexOf(rangedAttackTarget.owner.username) != -1) {
				rangedAttackTarget = undefined;
			}
		}
		else if (Memory.season) {
			if (rangedAttackTarget && rangedAttackTarget.owner && scouting.isPlayerMediumWhiteListed(rangedAttackTarget.owner.username)) {
				rangedAttackTarget = undefined;
			}
			else if (rangedAttackTarget && rangedAttackTarget.owner && scouting.isPlayerSoftWhiteListed(rangedAttackTarget.owner.username) && creep.hits == creep.hitsMax) {// && !rangedAttackTarget.hasBodypart(ATTACK) && !rangedAttackTarget.hasBodypart(RANGED_ATTACK) && !rangedAttackTarget.hasBodypart(HEAL) && !rangedAttackTarget.hasBodypart(CLAIM)) {
				rangedAttackTarget = undefined
			}

		}
		if (!rangedAttackTarget && creep.room.isEnemyRoom()) {
			rangedAttackTarget = creep.pos.findFirstInRange(FIND_STRUCTURES, 3, {
				filter: (object) => {
					return !object.owner;
				}
			});
		}

		if (rangedAttackTarget) {
			enemyRange = creep.pos.getRangeTo(rangedAttackTarget);
		}
	}


	if ((rangedAttackTarget || creep.killAllStructures) && creep.hasActiveBodypart(RANGED_ATTACK)) {
		let hasAttacked = 0
		if (enemyRange == 1 && !rangedAttackTarget.structureType) {
			creep.rangedMassAttack();
			hasAttacked = 1
		}
		else {			
			var targets = (creep.room.hasHostiles ? creep.pos.findInRange(creep.room.getAllHostileCreepsAndPowerCreeps(), 3) : []).concat(creep.pos.findInRange(FIND_HOSTILE_STRUCTURES, 3));
			// var useMassDamage = false;
			var massDamage = 0;
			for (var i in targets) {
				if (targets[i].structureType && (targets[i].structureType == STRUCTURE_CONTROLLER || targets[i].structureType == STRUCTURE_KEEPER_LAIR)) continue;
				if (creep.pos.getRangeTo(targets[i]) == 3) {
					massDamage += 1;
				}
				else if (creep.pos.getRangeTo(targets[i]) == 2) {
					massDamage += 4;
				}
				else if (creep.pos.getRangeTo(targets[i]) == 1) {
					// useMassDamage = true;
					massDamage += 10;
				}
				if (massDamage > (creep.room.hasHostiles ? 16 : 10)) {
					break;
				}
			}
			// Don't be too predicatable
			if(massDamage > (creep.room.hasHostiles ? 8 + 8 * Math.random() : 10) || (massDamage >= 10 && (!rangedAttackTarget || enemyRange > 3))) {
				creep.rangedMassAttack();
				hasAttacked = 1
			}
			else if (enemyRange <= 3) {
				let skip = false
				if ((Game.cpu.bucket < 3000 || Memory.stats.avgBucket < 4000) && rangedAttackTarget.structureType && creep.getNumOfBodyPart(RANGED_ATTACK) < 5 && rangedAttackTarget.hits > 2e6) {
					skip = true
				}

				if (!skip) {
					creep.rangedAttack(rangedAttackTarget);
				}
				hasAttacked = 1
			}
		}

		if (!creep.healOrdersGiven && creep.hasActiveBodypart(HEAL)) {				
			if (creep.hits < creep.hitsMax || (creep.room.dangerous && (enemyRange <= 3 || creep.room.isEnemyRoom()))) {
				creep.heal(creep)
			}
			else {
				let injuredCreeps = creep.room.getMyInjuredCreeps();
				if (injuredCreeps.length > 0) {
					let bestCreep = creep.pos.findClosestByRange(injuredCreeps);
					if (creep.pos.getRangeTo(bestCreep) <= 1) {
						creep.heal(bestCreep);
					}
					else if (!hasAttacked && creep.pos.getRangeTo(bestCreep) <= 3) {
						creep.rangedHeal(bestCreep);
					}
					else if (creep.room.isEnemyRoom() && creep.room.dangerous) {
						creep.heal(creep);
					}
				}
				else if (creep.room.isEnemyRoom() && creep.room.dangerous) {
					creep.heal(creep);
				}
			}
		}
	}
	else if (!creep.healOrdersGiven && creep.hasActiveBodypart(HEAL) && (creep.hits < creep.hitsMax || (creep.room.isEnemyRoom() && creep.room.dangerous)) ) {
		creep.heal(creep)
	}
	else if (!creep.healOrdersGiven && creep.hasActiveBodypart(HEAL) && (!rangedAttackTarget || !creep.hasActiveBodypart(RANGED_ATTACK))) {
		let injuredCreeps = creep.room.getMyInjuredCreeps();
		if (injuredCreeps.length > 0) {
			let bestCreep = creep.pos.findClosestByRange(injuredCreeps);
			if (creep.pos.getRangeTo(bestCreep) <= 1) {
				creep.heal(bestCreep);
			}
			else if (creep.pos.getRangeTo(bestCreep) <= 3) {
				creep.rangedHeal(bestCreep);
			}
			else if (creep.room.isEnemyRoom() && creep.room.dangerous) {
				creep.heal(creep);
			}
		}
	}
	else if (!rangedAttackTarget && Game.time - mem.pIncompleteTick < 10 && (!creep.room.controller || !creep.room.controller.my)) {
		let secondaryTarget = creep.pos.findFirstInRange(FIND_STRUCTURES, 3, {
			filter: (structure) => {
				return structure.structureType == STRUCTURE_WALL && structure.hits;
			}
		});
		if (secondaryTarget) {
			creep.rangedAttack(secondaryTarget);
		}
	}
}


function combatFindBestAttackTarget(creep, attackRange, hostiles) {
	let enemy;
	if (hostiles || creep.room.hasHostiles) {

		if (!hostiles) {
			if (Game.cpu.bucket < 750) {
				return creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS)
			}
			hostiles = creep.pos.findInRange(FIND_HOSTILE_CREEPS, attackRange).concat(creep.pos.findInRange(FIND_HOSTILE_POWER_CREEPS, attackRange));
			if (Memory.season) {
				// hostiles = _.filter(hostiles, (hostile) => (scouting.isPlayerMediumWhiteListed(hostile.owner.username)));
				// if (scouting.isPlayerSoftWhiteListed("Telemac")) {
				// 	if (creep.room.name == "E10S20" || creep.room.name == "E10S10") {
				// 		hostiles = _.filter(hostiles, (hostile) => (hostile.owner.username != 'Telemac'));
				// 	}
				// }
				// if (scouting.isPlayerSoftWhiteListed("Cub")) {
				// 	if (creep.room.name == "E20S20" || creep.room.name == "E30S0" || creep.room.name == "E30N0" || creep.room.name == "E20S10" || creep.room.name == "E30S10") {
				// 		hostiles = _.filter(hostiles, (hostile) => (hostile.owner.username != 'Cub'));
				// 	}
				// }
				// if (scouting.isPlayerSoftWhiteListed("Pyrodogg")) {
				// 	if (creep.room.name == "E20S30" || creep.room.name == "E10S30" ) {
				// 		hostiles = _.filter(hostiles, (hostile) => (hostile.owner.username != 'Pyrodogg'));
				// 	}
				// }
				// if (scouting.isPlayerSoftWhiteListed("Modus")) {
				// 	if (creep.room.name == "E20S30" || creep.room.name == "E10S30" ) {
				// 		hostiles = _.filter(hostiles, (hostile) => (hostile.owner.username != 'Modus'));
				// 	}
				// }					
			}
			if ((creep.room.keeperRoom && (creep.room.name != creep.mem.targetRoom)) || creep.combatSnake) {
				hostiles = _.filter(hostiles, hostile => hostile.owner.username != "Source Keeper");
			}
			if (creep.room.controller && creep.room.controller.owner && !creep.room.isMyRoom()) {
				hostiles = _.filter(hostiles, (threat) => (!threat.spawning));				
			}

			if (Memory.swc === 1) {
				hostiles = _.filter(hostiles, (threat) => (global.whiteList.indexOf(threat.owner.username) == -1));
			}
			else if (Memory.season) {
				hostiles = _.filter(hostiles, (threat) => (!scouting.isPlayerMediumWhiteListed(threat.owner.username)));
				hostiles = _.filter(hostiles, (threat) => (!scouting.isPlayerSoftWhiteListed(threat.owner.username) || creep.hits != creep.hitsMax))// || threat.hasBodypart(ATTACK) || threat.hasBodypart(RANGED_ATTACK) || threat.hasBodypart(HEAL) || threat.hasBodypart(CLAIM)));
			}
		}

		// if (creep.room.keeperRoom && creep.ignoreSKs) {
		// 	hostiles = _.filter(hostiles, hostile => hostile.owner.username != "Source Keeper");
		// }



		// if (creep.ignoreCivilians) {
		// 	hostiles = _.filter(hostiles, (threat) => (threat.hasBodypart(ATTACK) || threat.hasBodypart(RANGED_ATTACK) || threat.hasBodypart(HEAL)));	
		// }

		// Filter to remove those we've got pretty much splatted already.
		if (hostiles.length == 1) {
			enemy = hostiles[0];

			if (creep.room.isEnemyRoom()) {
				let roomMap = roomIntel.getEnemyRoomMap(creep.room.name);

				if (roomMap && creep.pos.getRangeTo(enemy.pos) > 3 && parseInt(roomMap[enemy.pos.x][enemy.pos.y]) != parseInt(roomMap[creep.pos.x][creep.pos.y])) {
					enemy = undefined;
				}
			}
		}
		else if (hostiles.length > 1) {
			let targets = [];

			if (creep.room.dangerous) {
				targets = _.filter(hostiles, hostile => hostile.hasCombatBodypart(false))

				// Get rid of SKs if there are other people.
				if (targets.length != hostiles.length && creep.room.keeperRoom) {
					// Gets fighty non-SKs
					targets = _.filter(targets, hostile => hostile.owner.username != "Source Keeper");
					if (targets.length == 0) {
						// Gets all non-SKs.
						targets = _.filter(hostiles, hostile => hostile.owner.username != "Source Keeper");
					}
				}

			}
			if (targets.length == 0) {
				targets = hostiles;
			}

			let bestEnemy = getBestEnemyFromTargets(creep, attackRange, targets)


			// Eh, takes all creep attacks equally. I guess it's alright
			if (bestEnemy) {
				if (Memory.debugEnemyTargeting) {
					console.log(creep, "bestEnemy", bestEnemy)
				}
				// Doens't deal with boosts yet
				bestEnemy.numDamageSoFar = (bestEnemy.numDamageSoFar || 0) + creep.getActiveBoostModifiedRangedAttack() * RANGED_ATTACK_POWER + (attackRange == 1 ? creep.getActiveBoostModifiedAttack() * ATTACK_POWER : 0)
				bestEnemy.numAttacksSoFar = (bestEnemy.numAttacksSoFar || 0) + 1
				enemy = bestEnemy;
			}
		}
	}

	return enemy;
}


function combatFindBestEnemy(creep, room, lastEnemy, closeCombat, secondCall = false) {
	let enemy;
	if (room.hasHostiles) {
		if (Memory.season5) {			
			let flags = room.find(FIND_FLAGS)

			if (flags.length) {
				for (let flag of flags) {
					if (flag.name.startsWith("IGNORE_HOSTILES")) {
						return
					}
				}
			}
		}

		if (Game.cpu.bucket < 750 && room == creep.room) {
			let enemy = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS)
			creep.mem.enemyCreep = enemy.id;
			return enemy
		}
		let hostiles = room.find(FIND_HOSTILE_CREEPS).concat(room.find(FIND_HOSTILE_POWER_CREEPS));
		if (Memory.season) {
			// if (scouting.isPlayerSoftWhiteListed("Telemac")) {				
			// 	if (creep.room.name == "E10S20" || room.name == "E10S20") {
			// 		hostiles = _.filter(hostiles, (hostile) => (hostile.owner.username != 'Telemac'));
			// 	}
			// 	if (creep.room.name == "E10S10" || room.name == "E10S10") {
			// 		hostiles = _.filter(hostiles, (hostile) => (hostile.owner.username != 'Telemac'));
			// 	}
			// }
			// if (scouting.isPlayerSoftWhiteListed("Cub")) {				
			// 	if (creep.room.name == "E20S20" || room.name == "E10S20" || room.name == "E30S0" ||room.name == "E30N0" || room.name == "E20S10" || room.name == "E30S10") {
			// 		hostiles = _.filter(hostiles, (hostile) => (hostile.owner.username != 'Cub'));
			// 	}
			// }
			// if (scouting.isPlayerSoftWhiteListed("Pyrodogg")) {
			// 	if (creep.room.name == "E20S30" || creep.room.name == "E10S30" ) {
			// 		hostiles = _.filter(hostiles, (hostile) => (hostile.owner.username != 'Pyrodogg'));
			// 	}
			// }
			// if (scouting.isPlayerSoftWhiteListed("Modus")) {
			// 	if (creep.room.name == "E20S30" || creep.room.name == "E10S30" ) {
			// 		hostiles = _.filter(hostiles, (hostile) => (hostile.owner.username != 'Modus'));
			// 	}
			// }					
		}

		if (((room.keeperRoom && (room.name != creep.mem.targetRoom)) || creep.combatSnake) && creep.hits > creep.hitsMax * 0.75) {
			hostiles = _.filter(hostiles, hostile => hostile.owner.username != "Source Keeper");
		}

		if (Memory.swc === 1) {
			hostiles = _.filter(hostiles, (threat) => (global.whiteList.indexOf(threat.owner.username) == -1));
		}
		else if (Memory.season) {
			hostiles = _.filter(hostiles, (threat) => (!scouting.isPlayerMediumWhiteListed(threat.owner.username)));
			hostiles = _.filter(hostiles, (threat) => (!scouting.isPlayerSoftWhiteListed(threat.owner.username) || creep.hits != creep.hitsMax))// || threat.hasBodypart(ATTACK) || threat.hasBodypart(RANGED_ATTACK) || threat.hasBodypart(HEAL) || threat.hasBodypart(CLAIM)));

			if (Memory.season4 && room.highway) {
				hostiles = _.filter(hostiles, (threat) => (threat.owner.username) != "Screeps");
			}
		}

		if (room.keeperRoom && creep.ignoreSKs) {
			hostiles = _.filter(hostiles, hostile => hostile.owner.username != "Source Keeper");
		}


		if (creep.ignoreCivilians && (creep.room.name != creep.mem.targetRoom || creep.room.mem.DT > 1)) {
			let newHostiles = _.filter(hostiles, (threat) => (threat.hasBodypart(ATTACK) || threat.hasBodypart(RANGED_ATTACK) || threat.hasBodypart(HEAL)));

			if (newHostiles.length == 0 && creep.room.name == creep.mem.targetRoom) {
				newHostiles = hostiles
			}
			hostiles = newHostiles
		}
		if (creep.targetCivilians) {
			if (creep.room.find(FIND_MY_CREEPS).length == 1) {
				let newHostiles = _.filter(hostiles, (threat) => (((!creep.room.roomStrength || creep.room.roomStrength < 1.5) && creep.pos.getRangeToPos(threat.pos) <= 6) || 
																  (!threat.hasBodypart(ATTACK) && !threat.hasBodypart(RANGED_ATTACK) && !threat.hasBodypart(HEAL))));

				if (newHostiles.length == 0) {
					newHostiles = hostiles
				}
				hostiles = newHostiles

				// I think Geno sends 1M scouts through to see if the path is clear. Let them through if they're not blocking me.
				hostiles = _.filter(hostiles, (threat) => (threat.body.length > 1 || creep.pos.inRangeToPos(threat.pos, 1)));
			}
		}

		// Don't want boosted creeps hitting civilians or weak creeps if they're not where they should be
		if (creep.mem.targetRoom && creep.mem.targetRoom !== creep.room.name && (creep.ignoreEnemies || creep.hasBoost())) {
			hostiles = _.filter(hostiles, (threat) => ((threat.hasBoost() || creep.pos.getRangeToPos(threat.pos) <= 5) && (threat.hasBodypart(ATTACK) || threat.hasBodypart(RANGED_ATTACK))));	
		}

		// console.log(creep, hostiles)

		// Filter to remove those we've got pretty much splatted already.
		if (hostiles.length == 1) {
			let distToTargetRoom = creep.mem.targetRoom ? Game.map.getRoomLinearDistance(room.name, creep.mem.targetRoom) : 0

			let bodyLockThreshold = Math.ceil(6 / (distToTargetRoom + 1 * (creep.moveRooms ? 4 : 1))) * (room.dangerous ? 1 : 0.25);

			// 4x mod for boost here, 8x below. Is that sensible? It's 4x for my creeps
			if (!hostiles[0].body || (hostiles[0].currentTargetLockBodyCount || 0) < hostiles[0].body.length * bodyLockThreshold * (hostiles[0].hasBoost() ? 4 : 1) || creep.pos.getWorldRangeToPos(hostiles[0].pos) <= 3) {
				enemy = hostiles[0];
			}

			if (room.isEnemyRoom() && enemy) {
				let roomMap = roomIntel.getEnemyRoomMap(room.name);

				if (creep.pos.getWorldRangeToPos(enemy.pos) > 3 && roomMap && parseInt(roomMap[enemy.pos.x][enemy.pos.y]) != parseInt(roomMap[creep.pos.x][creep.pos.y])) {
					enemy = undefined;
				}
			}
		}
		else if (hostiles.length > 1) {
			let targets = [];

			if (room.dangerous && !secondCall) {

				if (creep.targetCivilians && creep.room.find(FIND_MY_CREEPS).length == 1) {
					targets = hostiles
				}
				else {
					targets = room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], false).concat(room.find(FIND_HOSTILE_POWER_CREEPS))
				}


				// Get rid of SKs if there are other people.
				if (targets.length != hostiles.length && room.keeperRoom) {
					// Gets fighty non-SKs
					targets = _.filter(targets, hostile => hostile.owner.username != "Source Keeper");
					if (targets.length == 0) {
						// Gets all non-SKs.
						targets = _.filter(hostiles, hostile => hostile.owner.username != "Source Keeper");
					}
				}

			}
			if (targets.length == 0) {
				targets = hostiles;
			}

			let bestEnemy;
			let bestEnemyScore = Infinity;

			let enemyRoom = room.isEnemyRoom()

			let closestEnemy = creep.pos.findClosestByWorldRange(targets)
			let closestEnemyRange = closestEnemy ? creep.pos.getWorldRangeToPos(closestEnemy.pos) : Infinity
			// if (room == creep.room) {
				// closestEnemyRange = creep.pos.getWorldRangeToPos(creep.pos.findClosestByWorldRange(targets).pos)
			// }
			// else {
			// 	closestEnemyRange = creep.pos.getRangeToPos(creep.pos.findClosestByRange(targets).pos)
			// }

			// creep.say(closestEnemyRange + "_")

			// Lowest score best
			for (let testEnemy of targets) {
				if (enemyRoom) {
					let roomMap = roomIntel.getEnemyRoomMap(room.name);
					if (creep.pos.getWorldRangeToPos(testEnemy.pos) > (closeCombat ? 1 : 3) && roomMap &&
						(parseInt(roomMap[testEnemy.pos.x][testEnemy.pos.y]) !== parseInt(roomMap[creep.pos.x][creep.pos.y]))) {
						continue;
					}
				}

				let distToTargetRoom = creep.mem.targetRoom ? Game.map.getRoomLinearDistance(room.name, creep.mem.targetRoom) : 0

				let bodyLockThreshold = Math.ceil(6 / (distToTargetRoom + 1 * (creep.moveRooms ? 4 : 1))) * (room.dangerous ? 1 : 0.25);
				// let bodyLockThreshold = Math.ceil(6 / (distToTargetRoom + 1));

				// let bodyLockThreshold = ((!creep.mem.targetRoom || creep.room.name == creep.mem.targetRoom) ? 6 : 3)

				if (!testEnemy.body || ((testEnemy.currentTargetLockBodyCount || 0) > testEnemy.body.length * bodyLockThreshold * (testEnemy.hasBoost() ? 8 : 1) && creep.pos.getWorldRangeToPos(testEnemy.pos) > 3)) {
					continue;
				}

				let score = 0;

				let range = creep.pos.getWorldRangeToPos(testEnemy.pos)
				// Closer is better
				score += range;
				// Help others. Cap range at 7 as above 7 from the target enemy we stop doing combat analysis
				// As in... we don't do any checks for agression so don't understand people are on our faces
				// None. You thought this was wrong before and removed it but that was wrong! This is right!
				// Basically we _never_ want to be picking enemies more than 7 range away if there's ones close.
				if ((range <= 7 || closestEnemyRange > 7) && (creep.mem.lastAgression || 0) >= 4) {
					score -= ((room.mem.requestHelpAgainst[1 - (Game.time % 2)] || {})[testEnemy.id] || 0) * 4;
				}
				// Hit big people more, but not much more.
				score -= testEnemy.hitsMax / 1000000;
				// Hit hurt people more
				score += (testEnemy.hits / testEnemy.hitsMax) * 1.5;

				score -= testEnemy.ticksToLive / 10000

				// These two combined will make our attack creeps go after healers in attack heal pairs
				if (closeCombat) {					
					if (testEnemy.getNumOfBodyPart(HEAL) >= 25) {
						score -= 0.75
					}
					if (testEnemy.getNumOfBodyPart(ATTACK) >= 25) {
						score += 0.75
					}
				}




				// But if they're really far away look at locked. We want to be 2v1
				if (range >= 6 && closestEnemyRange > 7) {
					// If they have 1 on them favour it. 2 be indifferent, 3+ unfavour
					if (testEnemy.currentTargetLockCount) {
						score += (testEnemy.currentTargetLockCount - 2) * 4
					}
					// Don't bounce when you see a new shiny thing
					if (lastEnemy && lastEnemy.id == testEnemy.id) {
						score -= 4;
					}
				}


				// Don't do keepers if there's non keepers
				if (room.keeperRoom && testEnemy.owner.username == "Source Keeper") {
					score += 1e6;
				}

				if (score < bestEnemyScore) {
					bestEnemy = testEnemy;
					bestEnemyScore = score;
				}
			}

			// Why do we recurse? Not sure
			if (!bestEnemy && !secondCall) {
				return combatFindBestEnemy(creep, room, lastEnemy, closeCombat, true)
			}

			enemy = bestEnemy;

			/*enemy = creep.pos.findClosestByRange(targets, {
				filter: (object) => {
					if (room.isEnemyRoom()) {
						let roomMap = roomIntel.getEnemyRoomMap(room.name);
						if (creep.pos.getRangeTo(object.pos) > (closeCombat ? 1 : 3) && roomMap &&
							(parseInt(roomMap[object.pos.x][object.pos.y]) !== parseInt(roomMap[creep.pos.x][creep.pos.y]))) {
							return false;
						}
					}

					// console.log(object.currentTargetLockBodyCount)
					return (object.currentTargetLockBodyCount || 0) < object.body.length * 6;
				}
			});*/
		}

		if (enemy) {
			creep.mem.enemyCreep = enemy.id;
		}
	}

	if (!enemy && !room.keeperRoom) {
		if (Memory.swc && room.controller && room.controller.owner && global.whiteList.includes(room.controller.owner.username)) {
			return undefined
		}

		if (room.isEnemyRoom() && (!creep.ignoreCivilians || creep.room.name == creep.mem.targetRoom || Game.time - (creep.mem.pIncompleteTick || 0) < 50)) {
			if (creep.mem.enemyStructId && Game.getObjectById(creep.mem.enemyStructId) && (Math.random() < 0.95 || creep.pos.isNearToPos(Game.getObjectById(creep.mem.enemyStructId).pos))) {
				enemy = Game.getObjectById(creep.mem.enemyStructId)
			}
			else if (room.mem.numStructures > 1) {				
				let roomMap = roomIntel.getEnemyRoomMap(room.name);

				let isStructureValid = function(object) {
					if (!roomMap) {
						return true
					}
					if (object.my) {
						return false
					}
					if (creep.pos.getRangeToPos(object.pos) <= (closeCombat ? 1 : 3)) {
						return true
					}
					if (parseInt(roomMap[object.pos.x][object.pos.y]) === parseInt(roomMap[creep.pos.x][creep.pos.y])) {
						return true
					}
					if (parseInt(roomMap[object.pos.x][object.pos.y]) !== 3) {
						return false
					}

					if (closeCombat && object.pos.x < 49 && object.pos.x > 0 && object.pos.y < 49 && object.pos.y > 0) {						
						let freeSlots = 0
						for (let i = -1; i <= 1; i++) {
							if (freeSlots) break
							for (let j = -1; j <= 1; j++) {
								if (i == 0 && j == 0) continue
								let pos = new RoomPosition(object.pos.x + i, object.pos.y + j, object.room.name)

								if (pos.lookFor(LOOK_CREEPS).length) {
									continue
								}
								let otherStructs = pos.lookFor(LOOK_STRUCTURES)
								if (otherStructs.length == 0) {
									freeSlots++
									break
								}
								else {
									for (let otherStruct of otherStructs) {
										if (otherStruct.structureType == STRUCTURE_ROAD) continue
										if (otherStruct.structureType == STRUCTURE_CONTAINER) continue
										if (otherStruct.structureType == STRUCTURE_RAMPART && otherStruct.my) continue
										freeSlots++
										break
									}
									if (freeSlots) break
								}

							}
						}
						if (!freeSlots) {
							return false;
						}
					}

					for (let i = -1; i <= 1; i++) {
						if (!roomMap[object.pos.x + i]) continue
						for (let j = -1; j <= 1; j++) {
							if (!roomMap[object.pos.x + i][object.pos.y + j] === undefined) continue
							if (parseInt(roomMap[object.pos.x + i][object.pos.y + j]) === parseInt(roomMap[creep.pos.x][creep.pos.y])) {
								return true
							}
						}
					}

					return false
				}

				enemy = creep.pos.findClosestByRange(FIND_HOSTILE_SPAWNS, {
					filter: (struct) => {
						return isStructureValid(struct)
					}
				});
				if (!enemy && !room.controller.my) {
					enemy = creep.pos.findClosestByRange(room.towers, {
						filter: (struct) => {
							return isStructureValid(struct)
						}
					});
				}
				if (!enemy) {
					enemy = room.controller.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {
						filter: (object) => {
							// Spread out
							if (Math.random() < 0.5) {
								return false
							}
							if (!isStructureValid(object)) {
								return false;
							}

							return object.hits &&
								   object.structureType != STRUCTURE_RAMPART &&
								   (object.structureType != STRUCTURE_STORAGE || room.mem.killStorage) &&
								   (object.structureType != STRUCTURE_TERMINAL || room.mem.killTerminal)
						}
					});
				}
				if (!enemy && !closeCombat) {
					enemy = room.controller.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {
						filter: (object) => {
							// Spread out
							if (Math.random() < 0.5) {
								return false
							}
							if (!isStructureValid(object)) {
								return false;
							}

							return object.hits &&
								   (object.structureType != STRUCTURE_STORAGE || room.mem.killStorage) &&
								   (object.structureType != STRUCTURE_TERMINAL || room.mem.killTerminal)
						}
					});
				}
				if (!enemy && !room.controller.my) {
					enemy = room.controller.pos.findClosestByRange(FIND_STRUCTURES, {
						filter: (object) => {
							if (!isStructureValid(object)) {
								return false;
							}

							return !object.my &&
								   object.hits &&
							  	   object.structureType != STRUCTURE_ROAD &&
								   (object.structureType != STRUCTURE_STORAGE || room.mem.killStorage) &&
								   (object.structureType != STRUCTURE_TERMINAL || room.mem.killTerminal)
						}
					});

				}

				if (enemy) {
					creep.mem.enemyStructId = enemy.id;
				}

				// console.log(enemy)
			}
		}
		else if (creep.pos.roomName === creep.mem.targetRoom && room.controller && !room.controller.my) {
			enemy = creep.pos.findClosestByWorldRange(room.constructedWalls);
			if (!enemy) {
				enemy = room.invaderCore
			}
		}

	}
	return enemy;
}

function getAttackCreepTarget(creep, currentTarget) {
	// We already have a target. If it doesn't reflect, that'll do.
	if (currentTarget && (!currentTarget.hasBodypart || !currentTarget.hasBodypart(ATTACK))) {
		return currentTarget
	}


	// If we're ramparted don't care about reflection.
	let myStrctures = creep.room.lookForAt(LOOK_STRUCTURES, creep.pos.x, creep.pos.y);

	let ramparted = false
	for (let structure of myStrctures) {
		if (structure.structureType == STRUCTURE_RAMPART) {
			ramparted = true;
			if (currentTarget) {
				return currentTarget
			}
			else {
				break
			}
		}
	}


	let targets 
	if (ramparted) {
		targets = creep.pos.findInRange(creep.room.getAllHostileCreepsAndPowerCreeps(), 1);
	}
	else {
		let hasHealer
		targets = creep.pos.findInRange(creep.room.getAllHostileCreepsAndPowerCreeps(), 1, {
			filter: (otherCreep) => {
				if (otherCreep.hasActiveBodypart(ATTACK) && creep.hits < creep.hitsMax * 0.8) {
					return false;
				}
				else if (otherCreep.hasActiveBodypart(ATTACK) && otherCreep.hasBoost() && otherCreep.getActiveBodyparts(ATTACK) > 10) {
					let bcmp = otherCreep.getBoostModifiedCombatParts(true, true)

					if (bcmp.numAttack * ATTACK_POWER >= creep.hits / 2) {
						return false;
					}

					// Huh. This could hurt.
					if (hasHealer === undefined) {						
						hasHealer = 0
						let friendlyCreeps = creep.pos.findInRange(FIND_MY_CREEPS, 1)
						for (let friendlyCreep of friendlyCreeps) {
							if (friendlyCreep.hasActiveBodypart(HEAL)) {
								hasHealer = 1;
								break;
							}
						}
					}
					if (!hasHealer) {
						return false;
					}
				}
				let structures = creep.room.lookForAt(LOOK_STRUCTURES, otherCreep.pos.x, otherCreep.pos.y);

				for (let structure of structures) {
					if (structure.structureType == STRUCTURE_RAMPART) {
						return false;
					}
				}

				return true;
			}
		});
	}

	let bestTarget
	let bestScore = -Infinity;

	if (targets.length == 1) {
		bestTarget = targets[0];
	}
	else {				
		for (let target of targets) {
			let score = 0;

			// HEAL->RA->ATTACK->WORK->rest
			let bmcp = target.getBoostModifiedCombatParts(false, true);

			score += bmcp.numHeal * 64 + bmcp.numRanged * 16 + bmcp.numAttack * 4 + bmcp.numWork + (target.powerCreep ? 100 : 0);

			score -= target.hits / 4

			if (score > bestScore) {
				bestScore = score;
				bestTarget = target;
			}
		}
	}

	return bestTarget
}


var creepAI = {
	dummyCreep: function(creep) {

	},

	runCreepObserver: function(creep) {
		if (!creep.mem.targetRoom) {
			for (var roomIdx in Game.rooms[creep.mem.sR].goodRooms) {
				if (!Game.rooms[Game.rooms[creep.mem.sR].goodRooms[roomIdx]]) {
					creep.mem.targetRoom = Game.rooms[creep.mem.sR].goodRooms[roomIdx];
					break;
				}
			}
		}

		// Scouts are low priority. When bucket is getting really low start curtting them
		if (Game.cpu.bucket > 2000 || (Game.cpu.bucket > 1000 && Math.random() < 0.25) || (Math.random() < 0.25)) {
			if (creep.mem.targetRoom) {
				if (creep.room.name != creep.mem.targetRoom || util.isNearEdgeOfRoom(creep.pos, 8)) {
					if (Game.cpu.bucket < 4000 && Math.random() < 0.5) {
						return;
					}

					if (creep.mem.c * 0.5 > 1500 - creep.ticksToLive && Math.random() < 0.5) {
						return
					}

					var targetPos = new RoomPosition(25, 25, creep.mem.targetRoom);
					let moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.5, "minKD" : -0.5};

					creep.cachedMoveTo(targetPos, 15, moveOptions);

				}
				else {
					// Tidy up.
					creep.mem = {c: creep.mem.c}
					creep.mem.targetRoom = creep.room.name
					creep.mem.role = "observer"
					// creep.mem.rN = creep.room.name;
					// creep.mem.ttl = creep.ticksToLive;
					creep.mem.bC = 50;
				}
			}
		}
	},

	runScout: function(creep) {
		let moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.5, "minKD" : -0.5};


		if (Game.cpu.bucket < 4000 && Math.random() < 0.5) {
			return;
		}
		if (Game.cpu.bucket < 2000 && Math.random() < 0.5) {
			return;
		}
		if (Game.cpu.bucket < 1500 && Math.random() < 0.5) {
			return;
		}
		if (Game.cpu.bucket < 1000 && Math.random() < 0.5) {
			return;
		}
		if (Game.cpu.bucket < 750) {
			return;
		}

		var cpuStart = Game.cpu.getUsed();
		if (cpuStart > 300) {
			return;
		}

		creep.mem.scoutMode = creep.mem.scoutMode || (Math.random() * 1000 > Game.cpu.bucket * 0.75 ? 2 : 1)

		if (util.isEdgeOfRoom(creep.pos)) {
			_.pull(Memory.scoutRooms, creep.room.name);
		}

		if (creep.mem.targetRoom && creep.mem.targetRoom == creep.room.name) {
			creep.mem.targetRoom = undefined;
		}
		// Find unvisited places
		if (creep.mem.scoutMode == 1 && Memory.scoutRooms.length > 0) {
			if (creep.mem.targetRoom && Game.cpu.bucket < 4000 && !intelAI.getEnemyRoomSet().has(creep.mem.targetRoom)) {
				if (Memory.tick > 10000) creep.mem.scoutMode = 2;
				Memory.scoutRooms.push(creep.mem.targetRoom);
				// console.log("add scout targetroom 1", creep, creep.mem.targetRoom, Memory.scoutRooms.includes(creep.mem.targetRoom))
				creep.mem.targetRoom = undefined;
			}
			else {
				if (creep.mem.targetRoom && Game.rooms[creep.mem.targetRoom]) {
					creep.mem.targetRoom = undefined;
				}

				let idx = Memory.scoutRooms.length - 1;
				while ((!creep.mem.targetRoom || (Memory.rooms[creep.mem.targetRoom] && Game.time - Memory.rooms[creep.mem.targetRoom].lo < 100)) && idx >= 0) {
					let targetRoomName = Memory.scoutRooms[idx];

					if (targetRoomName && safeRoute.getSafeRouteCost(creep.room.name, targetRoomName) * 75 < Math.min(1000, creep.ticksToLive) && (!Memory.rooms[targetRoomName] || Game.time - Memory.rooms[targetRoomName].lo >= 100)) {
						creep.mem.targetRoom = targetRoomName;
						_.pull(Memory.scoutRooms, targetRoomName)
						// console.log("setting scout targetroom", creep, targetRoomName, Memory.scoutRooms.includes(targetRoomName))
					}
					else {
						idx--;
					}
				}
				if (!creep.mem.targetRoom) {
					if (Memory.tick > 10000) creep.mem.scoutMode = 2;
				}
			}
		}
		else {
			if (Memory.tick > 10000) creep.mem.scoutMode = 2;
		}
		// Randomish walk. Go to the exit with the lowest lastObs
		if (creep.mem.scoutMode == 2 || (Memory.scoutRooms.length == 0 && !creep.mem.targetRoom)) {
			if (!creep.mem.targetRoom) {
				var exits = Game.map.describeExits(creep.room.name);
				var minObserved = Infinity;
				var bestRoom;
				var exitRooms = [];

				if (Math.random() < 0.05 || !creep.mem.pIncompleteTick) {
					for (var exitDir in exits) {
						var exitRoom = exits[exitDir];
						if (!util.isRoomAccessible(exitRoom)) {
							continue;
						}

						if (creep.mem.sR && Memory.rooms[creep.mem.sR] && Memory.rooms[creep.mem.sR].ownedCreeps) {							
							let doing = false
							for (let otherScoutName of (Memory.rooms[creep.mem.sR].ownedCreeps["scout"] || [])) {
								if (otherScoutName == creep.name) continue
								if (!Game.creeps[otherScoutName]) continue

								if (Memory.creeps[otherScoutName].targetRoom === exitRoom) {
									doing = true
									break
								}
							}
							if (doing) {
								continue
							}
						}

						exitRooms.push(exitRoom);

						var lastObserved = -Infinity;
						if (Memory.rooms[exitRoom]) {
							lastObserved = Memory.rooms[exitRoom].lo || -Infinity;
						}

						if (lastObserved < minObserved && Game.time - lastObserved > 10) {
							minObserved = lastObserved;
							bestRoom = exitRoom;
						}
					}
				}

				if (bestRoom) {
					creep.mem.targetRoom = bestRoom;
				}
				else {
					creep.mem.targetRoom = _.sample(exitRooms);
				}
			}
		}
		if (creep.mem.targetRoom) {
			var targetPos = new RoomPosition(25, 25, creep.mem.targetRoom);
			creep.cachedMoveTo(targetPos, 24, moveOptions);
		}

		if (creep.mem.scoutMode == 1 && creep.ticksToLive < 1400 && creep.mem.c / (1500 - creep.ticksToLive) > 1 && Game.cpu.bucket < 7500) {
			if (creep.mem.targetRoom) Memory.scoutRooms.push(creep.mem.targetRoom);
			if (Memory.tick > 10000) creep.mem.scoutMode = 2;
			creep.mem.targetRoom = undefined;
		}

		if (creep.mem.pIncompleteTick == Game.time) {
			if (creep.mem.targetRoom) {
				Memory.scoutRooms.push(creep.mem.targetRoom);
				// console.log("add scout targetroom 2", creep, creep.mem.targetRoom, Memory.scoutRooms.includes(creep.mem.targetRoom))
			}
			creep.mem.targetRoom = undefined
		}

		// If we've lived more than 100 ticks and we're averaging more than 1 CPU a tick, death to me.
		if (Game.cpu.bucket < 9000 && creep.ticksToLive < 1300 && creep.mem.c / (1500 - creep.ticksToLive) > 1) {
			console.log("Suiciding expensive CPU scout", creep.ticksToLive, creep.mem.c / (1500 - creep.ticksToLive), creep.room.name, creep.mem.targetRoom)
			if (creep.mem.targetRoom) {
				Memory.scoutRooms.push(creep.mem.targetRoom);
			}
			creep.suicide();
		}
	},

	runPortalScout: function(creep) {
		let moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.5, "minKD" : -0.5};

		if (creep.room.name != creep.mem.portalTargetRoom && !creep.mem.portalled) {
			var targetPos = new RoomPosition(25, 25, creep.mem.portalTargetRoom);
			creep.cachedMoveTo(targetPos, 23);
		}
		else if (creep.room.name == creep.mem.portalTargetRoom) {
			let portal = creep.pos.findClosestByRange(creep.room.portals);
			if (portal) {
				// Will portal next tick
				if (creep.pos.isNearToRoomObject(portal)) {
					creep.mem.portalDestRoom = portal.destination.roomName;
					creep.mem.portalled = 1;
				}
				creep.cachedMoveTo(portal, 0);
			}
			else {
				creep.mem.scoutMode = 2;
				return this.runScout(creep)
			}
		}
		else {
			creep.mem.scoutMode = 2;
			let struct = creep.pos.lookFor(LOOK_STRUCTURES)[0]
			// We seem to struggle getting off portals
			if (struct && struct.structureType == STRUCTURE_PORTAL) {
				creep.move(Math.ceil(Math.random() * 8))
			}
			else {
				return this.runScout(creep)
			}
		}
	},


	runIntershardCivilian: function(creep, origRole) {
		let moveOptions = {"avoidEnemyRooms": 1, "maxDT" : 1.5, "minKD" : -0.5};

		if (Game.shard.name == creep.mem.shardTarget) {
			if (creep.mem.targetRoom && (!Game.rooms[creep.mem.sR] || !Game.rooms[creep.mem.sR].isMyRoom())) {
				let minDist = Infinity
				for (let room of Game.myRooms) {
					let dist = safeRoute.getSafeRouteCost(room.name, creep.mem.targetRoom, false, true, Math.ceil(creep.ticksToLive / 40))


					// Find a good place to unboost
					let valid = true;
					if (creep.mem.role == "isRecycler" && creep.hasBoost()) {
						valid = false
						for (let lab of room.labs) {
							if (!lab.cooldown) {
								valid = true
								break
							}
						}
					}

					if (dist < minDist && valid) {
						minDist = dist
						creep.mem.sR = room.name
					}
				}

				// Clearly we can't go where we wanted, so just go to the closest
				if (!creep.mem.sR) {
					for (let room of Game.myRooms) {
						let dist = safeRoute.getSafeRouteCost(room.name, creep.mem.targetRoom, false, true, Math.ceil(creep.ticksToLive / 40))
						if (dist < minDist) {
							minDist = dist
							creep.mem.sR = room.name
						}
					}
				}

				if (creep.mem.sR) {					
					if (creep.mem.role == "isUpgrader") {
						changeCreepRole(creep, "upgrader")
					}
					else if (creep.mem.role == "intershardRepairer") {
						changeCreepRole(creep, "repairer")
					}
				}
			}
			return origRole.call(this, creep)
		}

		if (creep.mem.role == "intershardPioneer" || creep.mem.role == "intershardRepairer") {
			if (creep.getBoosts()) {
				return;
			}
		}
		else if (creep.mem.role == "isTransporter") {
			if (creep.store.getFreeCapacity()) {
				return origRole.call(this, creep)
			}
		}
		else if (creep.mem.role == "isHeavyTransport") {
			if (creep.getStoreUsedCapacity() == 0) {
				let target = creep.room.terminal

				let freeCap = creep.store.getFreeCapacity()
				if (target.store[creep.mem.resource] < freeCap) {
					target = creep.room.storage
				}

				if (target.store[creep.mem.resource] < freeCap) {
					return this.runRecycler(creep);
				}

				let ret = creep.withdraw(target, creep.mem.resource, freeCap)

				if (ret == ERR_NOT_IN_RANGE) {
					creep.cachedMoveTo(target, 1, moveOptions);
				}
				return				
			}

			if (creep.getBoosts()) {
				return;
			}

			if (creep.room.dangerous || creep.hits != creep.hitsMax) {
				creep.heal(creep)
			}
		}
		else if (creep.mem.role == "intershardSMG") {
			if (!creep.carry[RESOURCE_GHODIUM]) {
				creep.mem.f = 1;
			}

			if(creep.mem.f) {
				let target
				if (creep.room.storage && creep.room.storage.store.getUsedCapacity(RESOURCE_GHODIUM) >= 1000) {
					target = creep.room.storage
				}
				else {
					target = creep.room.terminal
				}


				
				var ret = creep.withdraw(target, RESOURCE_GHODIUM, 1000);
				if (ret == ERR_NOT_IN_RANGE) {
					creep.cachedMoveTo(target, 1, moveOptions);
				}
				else if (ret == OK) {
					creep.mem.f = 0;
				}
			}
			if (creep.mem.f) {
				return;
			}
		}




		if (creep.room.name != creep.mem.portalTargetRoom) {
			var targetPos = new RoomPosition(25, 25, creep.mem.portalTargetRoom);
			creep.cachedMoveTo(targetPos, 23, moveOptions);
		}
		else {
			let isMemory = interShardMemoryManager.getMem(Game.shard.name)

			isMemory.creepData = isMemory.creepData || {}
			isMemory.creepData[creep.name] = {t: Game.time, m: _.clone(creep.mem)};

			delete isMemory.creepData[creep.name].m.pIncompleteTick

			interShardMemoryManager.touchLocal();



			for (let portal of creep.room.portals) {
				if (portal.destination.shard == creep.mem.shardTarget) {
					// Will portal next tick
					if (creep.pos.isNearToRoomObject(portal)) {
						creep.mem.portalDestRoom = portal.destination.roomName;
						creep.mem.portalled = 1;
					}

					let targetRange = 0

					if (creep.mem.targetRoom && creep.ticksToLive > 250 + Game.map.getRoomLinearDistance(portal.destination.room, creep.mem.targetRoom) * 50) {
						if (!util.isNearEdgeOfRoom(creep.pos, 2)) {
							// Our combat creeps are holding, we should too
							for (let otherCreep of creep.room.find(FIND_MY_CREEPS)) {
								if (otherCreep.mem.enterPortal === 0) {
									let distFromEdge = Math.min(portal.pos.x, 49 - portal.pos.x, portal.pos.y, 49 - portal.pos.y)

									targetRange = Math.max(distFromEdge, 8);
									break
								}
								// TODO: Turns out my civilians get enter portal.
								// I want to stop them going in while there's combat creeps trying to get in. 
								// else if (otherCreep.mem.enterPortal === 1) {
								// 	targetRange = 4;
								// 	break
								// }
							}
						}
					}

					creep.cachedMoveTo(portal, targetRange, moveOptions);
					break;
				}
			}
		}
	},

	runIntershardCombat: function(creep, origRole) {
		let moveOptions = {"avoidEnemyRooms": 1};



		if (Game.shard.name == creep.mem.shardTarget) {
			if (!Game.rooms[creep.mem.sR] || !Game.rooms[creep.mem.sR].isMyRoom()) {
				let minDist = Infinity
				for (let room of Game.myRooms) {
					let dist = Game.map.getRoomLinearDistance(room.name, creep.mem.targetRoom)

					if (dist < minDist) {
						minDist = dist
						creep.mem.sR = room.name
					}
				}
				delete creep.mem.enterPortal
				delete creep.mem.lastDangerous
			}
			if (!creep.mem.ttlAtPortal) {
				creep.mem.ttlAtPortal = creep.ticksToLive
			}

			// If we're boosted and have time to go home, do that to unboost
			if (!creep.room.dangerous && creep.mem.allowUnboost && creep.ticksToLive > (CREEP_LIFE_TIME - creep.mem.ttlAtPortal) * 1.1 && creep.ticksToLive < (CREEP_LIFE_TIME - creep.mem.ttlAtPortal) * 1.25 && creep.ticksToLive < 300 - creep.room.mem.DT * 200 /*&& creep.room.mem.DT < 0.1*/ && creep.hasBoost()) {
				for (let portal of creep.room.portals) {
					if (portal.destination.shard == creep.mem.spawnShard && portal.destination.room == creep.mem.portalTargetRoom) {
						creep.mem.portalTargetRoom = creep.room.name
						creep.mem.shardTarget = creep.mem.spawnShard
						creep.mem.role = "isRecycler"
						console.log("Recycling", creep.name)
						return this.runIntershardCivilian(creep)
					}
				}
			}


			switch (origRole) {
				case "ranged":
					return this.runRanged(creep)
				case "pairedHealer":
					if (creep.mem.role == "intershardPairedHealer") {
						creep.combatSnake = 1;
						creep.mem.combatSnake = 1;
					}
					return this.runPairedHealer(creep)
				case "tank":
					if (creep.mem.role == "intershardPairedTank") {
						creep.combatSnake = 1;
						creep.mem.combatSnake = 1;
					}
					return this.runTank(creep)

			}
			// return origRole(creep)
		}

		if (creep.mem.formationCreeps) {
			let allAlive = creep.mem.formationAlive || 0;

			if (!allAlive) {
				allAlive = true;
				let anySpawning = false;
				for (let creepName of creep.mem.formationCreeps) {
					if (!Game.creeps[creepName]) {
						allAlive = false;
					}
					else if (Game.creeps[creepName].spawning) {
						anySpawning = true
					}
				}

				if (allAlive && !anySpawning) {
					creep.mem.formationAlive = 1;
				}
				else if (!creep.ramparter && (anySpawning || !creep.mem.haveSnaked)) {
					creep.renew = 1
					return this.runRenewer(creep, true);					
				}
			}
		}

		if (creep.getBoosts()) {
			return;
		}



		if (creep.room.dangerous || (creep.mem.lastDangerous && Math.random() < 0.95)) {
			creep.mem.lastDangerous = 1
			switch (origRole) {
				case "ranged":
					return this.runRanged(creep)
				case "pairedHealer":
					if (creep.mem.role == "intershardPairedHealer") {
						creep.combatSnake = 1;
						creep.mem.combatSnake = 1;
					}
					return this.runPairedHealer(creep)
				case "tank":
					if (creep.mem.role == "intershardPairedTank") {
						creep.combatSnake = 1;
						creep.mem.combatSnake = 1;
					}
					return this.runTank(creep)
			}
		}
		else {
			delete creep.mem.lastDangerous
			let moveOptions = {avoidEnemyRooms: 1}

			if (creep.room.name != creep.mem.portalTargetRoom) {
				var targetPos = new RoomPosition(25, 25, creep.mem.portalTargetRoom);
				if (creep.mem.formationCreeps) {
					if (!creep.moveOrdersGiven) {
						snakeAI.moveSnake(creep.mem.formationCreeps, targetPos, moveOptions, 23, true, false)
					}
				}
				else {
					creep.cachedMoveTo(targetPos, 23, moveOptions);
				}
			}
			else {
				let localISMem = interShardMemoryManager.getMem(Game.shard.name)

				localISMem.creepData = localISMem.creepData || {}				
				localISMem.creepData[creep.name] = {t: Game.time, m: _.clone(creep.mem)};

				delete localISMem.creepData[creep.name].m.pIncompleteTick
				delete creep.mem.ID
				delete creep.mem.maxRenewTime
				delete creep.mem.boostsChecked

				creep.mem.enterPortal = creep.mem.enterPortal || 0

				// if (creep.room.dangerous) {
				// 	creep.mem.enterPortal = 1
				// }

				interShardMemoryManager.touchLocal();

				let isMemory

				for (let portal of creep.room.portals) {
					if (portal.destination.shard == creep.mem.shardTarget) {
						let targetRange = 0

						// let dangerous = !creep.noWaitForOtherCreeps && isMemory.portalStatus && isMemory.portalStatus[portal.destination.room] && isMemory.portalStatus[portal.destination.room].DT && isMemory.portalStatus[portal.destination.room].DT > 0.8

						// console.log(creep, "Check IS danger", dangerous, isMemory.portalStatus && isMemory.portalStatus[portal.destination.room] ? JSON.stringify(isMemory.portalStatus[portal.destination.room].ccp), isMemory.portalStatus[portal.destination.room].DT : "")

						// If it's dangerous, wait for all other creeps portalling with us and go with them
						if (!creep.mem.enterPortal) {
							if (Math.random() < 0.1) {
								isMemory = isMemory || interShardMemoryManager.getMem(creep.mem.shardTarget)
								if (isMemory.portalStatus[portal.destination.room]) {									
									console.log(creep, "Check IS danger", JSON.stringify(isMemory.portalStatus[portal.destination.room].ccp), isMemory.portalStatus[portal.destination.room].DT)

									let waitAnyway = false
									let noWait = false
									if (isMemory.portalStatus[portal.destination.room] && isMemory.portalStatus[portal.destination.room].ccp && isMemory.portalStatus[portal.destination.room].myccp) {
										let targetParts = 0
										targetParts += (isMemory.portalStatus[portal.destination.room].ccp.r || 0)
										targetParts += (isMemory.portalStatus[portal.destination.room].ccp.a || 0)
										targetParts += (isMemory.portalStatus[portal.destination.room].ccp.h || 0)

										let myParts = 0
										myParts += (isMemory.portalStatus[portal.destination.room].myccp.r || 0)
										myParts += (isMemory.portalStatus[portal.destination.room].myccp.a || 0)
										myParts += (isMemory.portalStatus[portal.destination.room].myccp.h || 0)

										let totalParts = 0;
										for (let otherCreep of creep.room.getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL])) {
											if (otherCreep.pos.getRangeToPos(portal.pos) < 6) {
												// Why is it unmodified in room? I don't want to screw with it as I don't know what leans on that. It's not any more
												var combatParts = otherCreep.getBoostModifiedCombatParts(false, false);

												totalParts += combatParts.numAttack;
												totalParts += combatParts.numRanged;
												totalParts += combatParts.numHeal;

											}
										}
										// We have less than them. Wait
										if (totalParts + myParts < targetParts) {
											waitAnyway = true
										}
										// Fight on the other side and we're down, but won't be if we move in
										else if (myParts && targetParts) {
											noWait = true
											targetRange = 0
										}
										// We're going here anyway. Better in than out
										else if (Game.map.getRoomLinearDistance(creep.mem.targetRoom, portal.destination.room) <= 1 && totalParts + myParts > targetParts * 1.5)  {
											noWait = true
											targetRange = 0
										}
										console.log(totalParts, targetParts)
									}

									if (!noWait) {									
										if (waitAnyway && creep.ticksToLive > 250 + Game.map.getRoomLinearDistance(portal.destination.room, creep.mem.targetRoom) * 50) {
											console.log(creep, "is clustering before portal (ccp)", creep.room.name)
											targetRange = 3
										}
										else if (creep.aliveMissionCreeps) {								
											let waitRange = 150 * Math.max(1, isMemory.portalStatus[portal.destination.room].DT);
											for (let otherCreep of creep.aliveMissionCreeps) {
												if (otherCreep != creep && otherCreep.mem.portalTargetRoom == creep.room.name && otherCreep.hasDamagingBodypart()) {
													let otherCreepRange = otherCreep.pos.getWorldRangeToPos(portal.pos);
													if (otherCreepRange > 6 && otherCreepRange < waitRange && creep.ticksToLive - otherCreepRange > 250 + Game.map.getRoomLinearDistance(portal.destination.room, creep.mem.targetRoom) * 50) {
														console.log(creep, "is clustering before portal (DT)", creep.room.name, creep.ticksToLive, otherCreepRange, otherCreep)
														targetRange = 3
														break
													}
												}
											}
										}
										else {
											// Shouldn't ever call?
											for (let otherCreep of creep.room.getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], false)) {
												if (otherCreep != creep && otherCreep.mem.portalTargetRoom == creep.room.name && otherCreep.pos.getRangeToPos(portal.pos) > 6) {
													console.log(creep, "is clustering before portal (not called")
													targetRange = 3
													break
												}
											}
										}							
									}
								}
								else {
									targetRange = 0
								}
							}
							else {
								targetRange = 3;
							}
						}

						if (targetRange == 0) {
							for (let allCreep of creep.room.find(FIND_MY_CREEPS)) {
								allCreep.mem.enterPortal = 1
							}
						}


						// Will portal next tick
						if (creep.pos.isNearToRoomObject(portal)) {
							creep.mem.portalDestRoom = portal.destination.room;
							creep.mem.portalled = 1;
						}
						if (creep.mem.formationCreeps) {
							if (!creep.moveOrdersGiven) {
								snakeAI.moveSnake(creep.mem.formationCreeps, portal.pos, moveOptions, targetRange, true, false)
							}
						}
						else {
							creep.cachedMoveTo(portal, targetRange, moveOptions);
						}
						break;
					}
				}
			}
		}
	},


	runAntiScout: function(creep) {
		if (creep.mem.targetRoom == creep.room.name) {
			this.runRanged(creep);
			return;
		}

		if (!creep.mem.targetRoom) {
			creep.mem.targetRoom = Memory.scoutRooms.pop();
		}
		if (creep.mem.targetRoom) {
			var targetPos = new RoomPosition(25, 25, creep.mem.targetRoom);
			creep.cachedMoveTo(targetPos, 23);
		}
		creep.rangedAttack(creep.pos.findFirstInRange(creep.room.getAllHostileCreepsAndPowerCreeps(), 3));
	},


	// Designed as a skirmisher, not as a base attacker
	runTank: function(creep) {
		if (creep.renew && !creep.ramparter && creep.room.name == creep.mem.sR) {
			return this.runRenewer(creep, true);
		}

		// Get the boosts!
		if (creep.getBoosts()) {
			return;
		}
		if (creep.room.name == creep.mem.sR && !creep.room.dangerous && creep.ticksToLive < 50 && creep.hasBoost()) {
			let res = this.attempToUnBoost(creep)
			if (res) {
				return;
			}
		}

		// if (creep.name == "t6963_4420") console.log(Game.cpu.getUsed())

		delete creep.mem.engaged

		if (creep.swarmer) {
			return this.runSwarmerTank(creep);
		}
		else if (creep.recycle) {
			return this.runRecycler(creep)
		}
		else if (creep.ramparter && 
			    ((creep.room.bestRampartsTank && creep.room.bestRampartsTank.length)) || (creep.mem.forceRamparter && !creep.room.breached) && 
			     creep.ticksToLive > 20) {
			return this.runTankRamparter(creep);
		}
		else if (creep.exitCamper && creep.room.name == creep.mem.targetRoom && (!creep.room.controller || !creep.room.controller.my)) {
			return this.runTankCamper(creep);
		}
		else if (creep.assaulter) {
			return this.runCloseCombatAssaulter(creep);
		}

		if (creep.mem.sleep && !creep.mem.retreat && !creep.room.keeperRoom) {
			if (creep.room.hasHostiles || creep.room.name != creep.mem.targetRoom || Math.random() < 0.05) {
				delete creep.mem.sleep
				if (!creep.room.hasHostiles && creep.room.name == creep.mem.targetRoom) {
					let flags = creep.room.find(FIND_FLAGS)

					if (flags.length) {
						for (let flag of flags) {
							if (flag.name.startsWith("form")) {
								creep.uncachedMoveTo(flag, 2, {maxRooms:1, avoidEnemyRooms: 1, avoidCombatEdges: 1})
								return
							}
						}
					}
				}

			}
			else {
				return;
			}
		}

		// if (creep.name == "t6963_4420") console.log(Game.cpu.getUsed())


		var forceRetreat = false;
		if (creep.pos.roomName != creep.mem.targetRoom && creep.room.isEnemyRoom()) {
			if (creep.room.controller && (creep.room.controller.safeMode || 0) > 0) {
				forceRetreat = true;
			}
			else if (creep.room.towers.length > 0) {
				for (let tower of creep.room.towers) {
					if (tower.isActive() && tower.energy >= 10) {
						forceRetreat = true;
						break;
					}
				}
			}
		}

		if (creep.mem.retreat && creep.room.name == creep.mem.sR && creep.room.hasHostiles) {
			creep.mem.retreat = false;
		}

		// if (creep.name == "t6963_4420") console.log(Game.cpu.getUsed())


		let enemy;
		let enemyOnEdge = false;
		let lastEnemy

		if (creep.mem.enemyCreep) {
			lastEnemy = Game.getObjectById(creep.mem.enemyCreep)
			// if (enemyObj && creep.pos.isNearToRoomObject(enemyObj) && enemyObj.hits != enemyObj.hitsMax) {
			// 	enemy = enemyObj;
			// }
			// else {

				// Often enemies will go off the edge then come back. If no hostiles nearby wait for them sometimes
				if (creep.mem.enemyPos && Math.random() < (creep.mem.targetRoom === creep.room.name ? 0.8 : 0.4) && util.isNearEdgeOfRoom(creep.mem.enemyPos, 1) && (Math.random() < 0.5 || !creep.pos.findFirstInRange(FIND_HOSTILE_CREEPS, 7))) {
					enemyOnEdge = true;
				}
				// If the shortest path to the enemy is through my room stuff can get confused. Lock the enemy if we're safe in our room and we can still see them
				else if (lastEnemy && !creep.room.dangerous && lastEnemy.room != creep.room && !util.isNearEdgeOfRoom(creep.pos, 1)) {
					enemy = lastEnemy
				}
				else {
					delete creep.mem.enemyCreep
				}
			// }
		}

		if (!enemy && !enemyOnEdge) {
			enemy = combatFindBestEnemy(creep, creep.room, lastEnemy, 1);
		}

		if (!enemy && creep.mem.formationCreeps) {
			for (let formationCreepName of creep.mem.formationCreeps) {
				if (formationCreepName == creep.name) continue
				let formationCreep = Game.creeps[formationCreepName]

				if (!formationCreep) continue

				enemy = combatFindBestEnemy(formationCreep, formationCreep.room, lastEnemy, 1);
			}
		}

		if (!enemy && util.isNearEdgeOfRoom(creep.pos, 1)) {
			// Get the neighbour room and find best enemy
			let exits = Game.map.describeExits(creep.room.name)

			if (exits[LEFT] && Game.rooms[exits[LEFT]] && creep.pos.x <= 1) {
				enemy = combatFindBestEnemy(creep, Game.rooms[exits[LEFT]], lastEnemy, 1);
			}
			else if (exits[RIGHT] && Game.rooms[exits[RIGHT]] && creep.pos.x >= 48) {
				enemy = combatFindBestEnemy(creep, Game.rooms[exits[RIGHT]], lastEnemy, 1);
			}

			if (exits[TOP] && Game.rooms[exits[TOP]] && creep.pos.y <= 1) {
				enemy = combatFindBestEnemy(creep, Game.rooms[exits[TOP]], lastEnemy, 1);
			}
			else if (exits[BOTTOM] && Game.rooms[exits[BOTTOM]] && creep.pos.y >= 48) {
				enemy = combatFindBestEnemy(creep, Game.rooms[exits[BOTTOM]], lastEnemy, 1);
			}

			if (enemy) {
				console.log("Tank seeing enemy across border", creep, creep.pos, enemy, enemy.pos)
			}

		}

		// if (creep.name == "t6963_4420") console.log(Game.cpu.getUsed())

		let agression;
		let enemyRange;
		var myParts;
		var enemyPos;
		let chasePos

		if (creep.hits != creep.hitsMax && creep.room.towers.length > 0 && creep.room.isEnemyRoom() && _.any(creep.room.towers, function(tower) { return tower.energy >= TOWER_ENERGY_COST && tower.isActive()})) {
			forceRetreat = true;
		}
		else if (enemy) {
			enemyPos = enemy.pos;
			creep.mem.enemyPos = enemy.pos;

			// This shouldn't be expensive if they're the same room
			// Edge case is when we've got a formation creep in a different room
			enemyRange = creep.pos.getWorldRangeToPos(enemy.pos);


			// Well, not gonna reach him. Suiciding may mess up people's kill trackers.
			// if (enemyRange > 2 * creep.ticksToLive) {
			// 	return creep.suicide()
			// }

			// Don't need to calculat this if we're far away, or tired
			let dangerousCreeps
			if (enemyRange > 4 && enemy.owner && enemy.owner.username == "Source Keeper") {
				agression = 0;
			}
			else if (enemyRange <= 7 && creep.fatigue == 0) {
				dangerousCreeps = enemy.room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK], true);
				if (dangerousCreeps.length > 0) {
					let clx
					let cly

					if (enemy.room.name != creep.room.name) {
						clx = enemy.pos.x
						cly = enemy.pos.y
					}
					else {
						clx = Math.round((creep.pos.x + enemy.pos.x) / 2)
						cly = Math.round((creep.pos.y + enemy.pos.y) / 2)
					}

					var combatLocation = new RoomPosition(clx, cly, enemy.room.name)
					let combatRoom = enemy.room

					let friendlyHeals = combatLocation.findFirstInRange(combatRoom.getAllFriendlyCreepsWithBodyParts([HEAL], true), 9);
					let hostileHeals = combatLocation.findFirstInRange(combatRoom.getAllHostileCreepsWithBodyParts([HEAL], true), 9);

					var areaFriends = combatLocation.findInRange(combatRoom.getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true), 8); // Active only
					var areaHostile = combatLocation.findInRange(combatRoom.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], !hostileHeals), 8); // If the enemy has heals, assume inactive is active

					let exits;
					if (combatLocation.x < 6) {
						exits = Game.map.describeExits(combatRoom.name);
						if (exits[LEFT] && Game.rooms[exits[LEFT]]) {
							let pos = new RoomPosition(48, combatLocation.y, exits[LEFT])
							let range = 6 - combatLocation.x;
							areaFriends = areaFriends.concat(pos.findInRange(Game.rooms[exits[LEFT]].getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true), range));
							areaHostile = areaHostile.concat(pos.findInRange(Game.rooms[exits[LEFT]].getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], !hostileHeals), range));
						}
					}
					else if (combatLocation.x > 49 - 6) {
						exits = Game.map.describeExits(combatRoom.name);
						if (exits[RIGHT] && Game.rooms[exits[RIGHT]]) {
							let pos = new RoomPosition(1, combatLocation.y, exits[RIGHT])
							let range = 6 - (49 - combatLocation.x);
							areaFriends = areaFriends.concat(pos.findInRange(Game.rooms[exits[RIGHT]].getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true), range));
							areaHostile = areaHostile.concat(pos.findInRange(Game.rooms[exits[RIGHT]].getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], !hostileHeals), range));
						}
					}
					if (combatLocation.y < 6) {
						if (!exits) {
							exits = Game.map.describeExits(combatRoom.name);
						}
						if (exits[TOP] && Game.rooms[exits[TOP]]) {
							let pos = new RoomPosition(combatLocation.x, 48, exits[TOP])
							let range = 6 - combatLocation.y;
							areaFriends = areaFriends.concat(pos.findInRange(Game.rooms[exits[TOP]].getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true), range));
							areaHostile = areaHostile.concat(pos.findInRange(Game.rooms[exits[TOP]].getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], !hostileHeals), range));
						}
					}
					else if (combatLocation.y > 49 - 6) {
						if (!exits) {
							exits = Game.map.describeExits(combatRoom.name);
						}
						if (exits[BOTTOM] && Game.rooms[exits[BOTTOM]]) {
							let pos = new RoomPosition(combatLocation.x, 1, exits[BOTTOM])
							let range = 6 - (49 - combatLocation.y);
							areaFriends = areaFriends.concat(pos.findInRange(Game.rooms[exits[BOTTOM]].getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true), range));
							areaHostile = areaHostile.concat(pos.findInRange(Game.rooms[exits[BOTTOM]].getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], !hostileHeals), range));
						}
					}

					// myParts = creep.getBoostModifiedCombatParts(true);

					let stance = getCombatStance(creep, enemy, combatLocation, areaFriends, areaHostile, friendlyHeals, hostileHeals, true);
					agression = stance.agression;

					agression -= 5 * (1 - (creep.getActiveBodyparts(ATTACK) / creep.getNumOfBodyPart(ATTACK)))

					let hasAttack = creep.hasActiveBodypart(ATTACK);

					// They're tired. Pounce!
					if (enemy.fatigue > 0 && hasAttack) {
						agression += 1;
					}

					// We're hitting them. HIT THEM!
					if (enemyRange == 1 && hasAttack) {
						agression += 2;
					}
					// A chase!
					else if (enemyRange == 2 && hasAttack) {
						agression += 1;
					}

					// if (util.isEdgeOfRoom(creep.pos)) {
					// 	agression += 2;
					// }
					// else if (util.isNearEdgeOfRoom(creep.pos, 1)) {
					// 	agression += 1;
					// }
				}
				else {
					agression = 1;
				}
			}
			else {
				agression = creep.fatigue == 0 ? 3 : (creep.mem.lastAgression || 0)
			}

			if (creep.mem.lastAgression !== undefined) {
				agression = 0.75 * agression + 0.25 * creep.mem.lastAgression;
			}



			creep.mem.lastAgression = agression;

			if (agression < 0 && dangerousCreeps) {
				creep.room.mem.requestHelpAgainst = creep.room.mem.requestHelpAgainst || [];
				creep.room.mem.requestHelpAgainst[Game.time % 2] = creep.room.mem.requestHelpAgainst[Game.time % 2] || {};

				let rha = creep.room.mem.requestHelpAgainst[Game.time % 2];
				for (let dangerCreep of dangerousCreeps) {
					// Not world range. Don't worry if it's in a different room (returns infinity)
					let range = (creep.pos.getRangeToPos(dangerCreep.pos) || 1)
					if (range <= (dangerCreep.hasBodypart(RANGED_ATTACK) ? 5 : 3)) {
						rha[dangerCreep.id] = (rha[dangerCreep.id] || 0) - agression / Math.sqrt(range);
					}
				}
			}
			// console.log(Game.time, creep.name, agression)
		}
		else if (creep.mem.enemyPos) {
			// What does it mean if this is in another room?

			// No enemy, but a pos. They've exited or died.
			if (creep.mem.enemyPos.x <= 1 || creep.mem.enemyPos.x >= 48 || creep.mem.enemyPos.y <= 1 || creep.mem.enemyPos.y >= 48) {
				enemyPos = creep.mem.enemyPos;
				agression = creep.mem.lastAgression || 4;

				let newPos = creep.room.findExitPosForCreepID(creep.mem.enemyCreep)

				if (newPos) {					
					if (newPos.x == 0 || newPos.x == 49) {
						enemyPos.y = newPos.y;
					}
					if (newPos.y == 0 || newPos.y == 49) {
						enemyPos.x = newPos.x;
					}
					// console.log(creep, creep.room.name, "enemy creep ran")
				}
				else {
					// console.log(creep, creep.room.name, "enemy creep died")	
				}

				if (newPos && agression > 4 && creep.hits >= creep.hitsMax * .95 && creep.mem.enemyCreep) {
					// let newPos = creep.room.findExitPosForCreepID(creep.mem.enemyCreep)

					// Do we want to chase?
					let isRoomValidForChase = function(roomName) {
						if (!Memory.rooms[roomName]) {
							return false;
						}
						// We're allowed to roam to other rooms
						if (creep.mem.combatRooms && Game.rooms[roomName] && creep.mem.combatRooms.includes(roomName)) {
							return true;
						}
						if (!creep.mem.roam && creep.mem.targetRoom && creep.room.name != creep.mem.targetRoom && roomName != creep.mem.targetRoom) {
							return false;
						}
						if ((Memory.rooms[roomName].kd || 0) < 0) {
							return false;
						}
						if (Memory.rooms[roomName].owner && Memory.rooms[roomName].owner != util.getMyName()) {
							return false;
						}

						return true
					}

					if (isRoomValidForChase(newPos.roomName)) {
						chasePos = newPos
						console.log("-------------------", creep, creep.pos, "wants to chase to", newPos)
					}
				}

				// Move to the enemy pos and reset to default in an unpredictable manner.
				if (!chasePos && Math.random() < 0.2) {
					delete creep.mem.enemyPos;
					delete creep.mem.lastAgression;
				}
			}
			else {
				agression = 4;
				delete creep.mem.enemyPos;
				delete creep.mem.lastAgression;
			}
		}
		else if (util.isNearEdgeOfRoom(creep.pos, 1)) {
			let exits = Game.map.describeExits(creep.room.name)


			let areaFriends = []
			let areaHostile = []
			if (exits[LEFT] && Game.rooms[exits[LEFT]] && Game.rooms[exits[LEFT]].dangerous && creep.pos.x <= 1) {
				console.log(creep.pos, "Tank in second edge detection which should no longer be needed, LEFT")
				let pos = new RoomPosition(48, creep.pos.y, exits[LEFT])
				let range = 6;
				areaFriends = areaFriends.concat(pos.findInRange(Game.rooms[exits[LEFT]].getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true), range));
				areaHostile = areaHostile.concat(pos.findInRange(Game.rooms[exits[LEFT]].getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], false), range));
			}
			else if (exits[RIGHT] && Game.rooms[exits[RIGHT]] && Game.rooms[exits[RIGHT]].dangerous && creep.pos.x >= 48) {
				console.log(creep.pos, "Tank in second edge detection which should no longer be needed, RIGHT")
				let pos = new RoomPosition(1, creep.pos.y, exits[RIGHT])
				let range = 6;
				areaFriends = areaFriends.concat(pos.findInRange(Game.rooms[exits[RIGHT]].getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true), range));
				areaHostile = areaHostile.concat(pos.findInRange(Game.rooms[exits[RIGHT]].getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], false), range));
			}

			if (exits[TOP] && Game.rooms[exits[TOP]] && Game.rooms[exits[TOP]].dangerous && creep.pos.y <= 1) {
				console.log(creep.pos, "Tank in second edge detection which should no longer be needed, TOP")
				let pos = new RoomPosition(creep.pos.x, 48, exits[TOP])
				let range = 6;
				areaFriends = areaFriends.concat(pos.findInRange(Game.rooms[exits[TOP]].getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true), range));
				areaHostile = areaHostile.concat(pos.findInRange(Game.rooms[exits[TOP]].getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], false), range));
			}
			else if (exits[BOTTOM] && Game.rooms[exits[BOTTOM]] && Game.rooms[exits[BOTTOM]].dangerous && creep.pos.y >= 48) {
				console.log(creep.pos, "Tank in second edge detection which should no longer be needed, BOTTOM")
				let pos = new RoomPosition(creep.pos.x, 1, exits[BOTTOM])
				let range = 6;
				areaFriends = areaFriends.concat(pos.findInRange(Game.rooms[exits[BOTTOM]].getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true), range));
				areaHostile = areaHostile.concat(pos.findInRange(Game.rooms[exits[BOTTOM]].getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], false), range));
			}

			let stance = getCombatStance(creep, undefined, undefined, areaFriends, areaHostile, false, true, true);
			agression = stance.agression;

			if (creep.mem.lastAgression !== undefined) {
				agression = 0.75 * agression + 0.25 * creep.mem.lastAgression;
			}

			creep.mem.lastAgression = agression;

			// moveOptions = {"avoidEnemyRooms" : 1, "avoidHostiles": 1, "reusePath" : pathRefresh};
		}
		else {
			agression = 4;
		}

		// if (creep.name == "t6963_4420") console.log(Game.cpu.getUsed())


		var pathRefresh = undefined;
		if (!util.isEdgeOfRoom(creep.pos)) {
			if (enemy && creep.room.dangerous == 2 && agression <= 4) {
				pathRefresh = 6;
			}
			if (enemyRange !== undefined && enemyRange <= 5 && agression <= 2) {
				pathRefresh = 2;
			}
		}

		let moveOptions;
		if ((enemy && creep.room.dangerous == 2) || agression <= 0) {
			moveOptions = {"avoidEnemyRooms" : 1, "avoidHostiles": creep.exRamparter ? 8 : (agression <= 0 ? (-agression / 2 - 0.01) : 0), "reusePath" : pathRefresh};
		}
		else {
			moveOptions = {"avoidEnemyRooms" : 1, "reusePath" : pathRefresh};
		}


		// Why do I not avoidCombatEdges with combat snakes?
		// var combatMoveOptions = {"avoidEnemyRooms" : 1, "avoidCombatEdges" : (creep.combatSnake ? 0 : 1), "reusePath" : pathRefresh, "maxRooms": (creep.combatSnake ? 2 : 1)};
		var combatMoveOptions;
		// TODO: Remove this
		if (creep.combatSnake) {
			// Ok, I think this can screw up when they try to re-pair after one crosses the edge. 
			combatMoveOptions = {"avoidEnemyRooms" : 1, "avoidCombatEdges" : 1, "reusePath" : pathRefresh, "maxRooms": 1};
		}
		else {
			combatMoveOptions = {"avoidEnemyRooms" : 1, "avoidCombatEdges" : 1, "reusePath" : pathRefresh, "maxRooms": 1};
		}
		if (enemy && enemy.room != creep.room) {
			combatMoveOptions.avoidCombatEdges = 0 
			combatMoveOptions.maxRooms = 2
			combatMoveOptions.avoidEnemyRooms = !creep.room.isEnemyRoom() && !enemy.room.isEnemyRoom()
		}


		// We might have enough healing for this? 
		if (creep.combatSnake && Game.time - (creep.mem.pIncompleteTick || 0) < 10 && (!creep.mem.path || !creep.mem.path.length)) {
			moveOptions.ignoreKeepers = 1
			combatMoveOptions.ignoreKeepers = 1
		}


		if ((creep.mem.blockingFormation || 0) > 0) {
			creep.mem.blockingFormation -= 1;
			forceRetreat = true;
			moveOptions.avoidLocalCreeps = 1;
			if (creep.mem.blockingFormation == 0) {
				delete creep.mem.blockingFormation;
			}
		}


		// if (creep.name == "t590_9473") console.log(creep, forceRetreat || creep.retreat || creep.mem.retreat || (!enemy && (creep.mem.retreatTimer || 0) > 0), agression, enemyPos);


		// if (forceRetreat || creep.retreat || creep.mem.retreat || ((!enemy || creep.hits < creeep.hitsMax * 0.5) && (creep.mem.retreatTimer || 0) > 0)) {

		if (forceRetreat || creep.retreat || creep.mem.retreat || (!enemy && (creep.mem.retreatTimer || 0) > 0)) {
			delete creep.mem.fleeTimer
			if (creep.mem.retreatTimer) {
				creep.mem.retreatTimer--;
			}
			if (creep.mem.retreatTimer == 0) {
				delete creep.mem.retreatTimer
			}

			let fallbackRoom = creep.mem.fallbackRoom || creep.mem.sR
			moveOptions.heuristicWeight = 1.1;
			let fallbackPos
			let fallbackRange

			if ((!enemy && (creep.mem.retreatTimer || 0) > 0) && !creep.room.dangerous && creep.room.name != (creep.mem.fallbackRoom || creep.mem.sR) && util.isNearEdgeOfRoom(creep.pos, 2)) {
				fallbackPos = new RoomPosition(25, 25, creep.room.name);
				fallbackRange = 20
			}
			else {				
				fallbackPos = new RoomPosition(Memory.rooms[fallbackRoom].fallbackX || 25,
											   Memory.rooms[fallbackRoom].fallbackY || 25,
												fallbackRoom)
				fallbackRange = 2
			}

			if (creep.combatSnake) {
				snakeAI.moveSnake(creep.mem.formationCreeps, fallbackPos, moveOptions, fallbackRange, true, true)
			}
			else {
				creep.uncachedMoveTo(fallbackPos, fallbackRange, moveOptions);
			}
		}
		else if (((enemy || enemyPos || (creep.mem.fleeTimer || 0) < 3 + (10000 - Game.cpu.bucket) / 1000) && agression < 0) || creep.forceMoveRooms) {
			if ((areaHostile || []).length > 0 || creep.forceMoveRooms) {
				// FFS, fleeTimer goes up, retreat timer goes down. Gah.

				// Flee is the low CPU option. We'll flee for a few ticks then retreat to room.
				if (!creep.forceMoveRooms && ((creep.mem.fleeTimer || 0) < 3 + (10000 - Game.cpu.bucket) / 1000 || creep.room.name == creep.mem.fallbackRoom || creep.room.name == creep.mem.sR)) {
					creep.mem.fleeTimer = (creep.mem.fleeTimer || 0) + (Math.random() < 0.8 ? 1 : 0);


					let fleeCreep = creep.pos.findClosestByRange(areaHostile) || enemy;
					if (fleeCreep) {
						let fleeOptions = _.clone(moveOptions);
						fleeOptions.flee = true;
						if (creep.combatSnake) {
							snakeAI.moveSnake(creep.mem.formationCreeps, fleeCreep.pos, fleeOptions, 8, true, true)
						}
						else {
							creep.uncachedMoveTo(fleeCreep, 8, fleeOptions);
						}
					}
					else {
						let fallbackRoom = creep.mem.fallbackRoom || creep.mem.sR

						if (creep.combatSnake) {
							snakeAI.moveSnake(creep.mem.formationCreeps, new RoomPosition(25, 25, fallbackRoom), moveOptions, creep.room.name == fallbackRoom ? 2 : 20, true, creep.forceMoveRooms ? false : true)
						}
						else {
							creep.retreatToRoom(fallbackRoom, moveOptions);
						}

						if (agression < -2 && util.isEdgeOfRoom(creep.pos)) {
							creep.mem.retreatTimer = 2 + Math.round(2 * Math.random());
						}
					}
				}
				else {
					if (agression < -2) {
						creep.mem.retreatTimer = 4 + Math.round(2 * Math.random());;
					}
					moveOptions.heuristicWeight = 1.1;

					let fallbackRoom = creep.mem.fallbackRoom || creep.mem.sR

					if (creep.combatSnake) {
						snakeAI.moveSnake(creep.mem.formationCreeps, new RoomPosition(25, 25, fallbackRoom), moveOptions, creep.room.name == fallbackRoom ? 2 : 20, true, creep.forceMoveRooms ? false : true)
					}
					else {
						creep.retreatToRoom(fallbackRoom, moveOptions);
					}
				}


			/*	if (creep.mem.fallbackRoom) {
					creep.uncachedMoveTo(new RoomPosition(Memory.rooms[creep.mem.fallbackRoom].fallbackX || 25,
												 		  Memory.rooms[creep.mem.fallbackRoom].fallbackY || 25,
														  creep.mem.fallbackRoom),
										3,
										moveOptions);
				}
				else {
					creep.uncachedMoveTo(new RoomPosition(Memory.rooms[creep.mem.targetRoom].fallbackX || 25,
												 		  Memory.rooms[creep.mem.targetRoom].fallbackY || 25,
														  creep.mem.targetRoom),
										3,
										moveOptions);
				}*/
			}
			else {
				if (creep.mem.fleeTimer) {
					creep.mem.fleeTimer = (creep.mem.fleeTimer || 0) + (Math.random() < 0.8 ? 1 : 0);
				}
				if (agression < -2) {
					creep.mem.retreatTimer = 5;
				}
				moveOptions.heuristicWeight = 1.1;

				let fallbackRoom = creep.mem.fallbackRoom || creep.mem.sR

				if (creep.combatSnake) {
					snakeAI.moveSnake(creep.mem.formationCreeps, new RoomPosition(25, 25, fallbackRoom), moveOptions, creep.room.name == fallbackRoom ? 2 : 20, true, creep.forceMoveRooms ? false : true)
				}
				else {
					creep.retreatToRoom(fallbackRoom, moveOptions);
				}

			}
		}
		else if (enemyPos && agression >= 0) {// && (!util.isNearEdgeOfRoom(enemyPos, 2) || (enemy && enemy.owner.username == "Invader"))) {
			delete creep.mem.fleeTimer;


			let formingUp = false
			// We're <1.5x stronger across the room . Form up if we're not.
			// Not tested on tank yet
			if (creep.room.roomStrength && creep.room.roomStrength < 1.5 && enemyRange > 7) {
				// This will issue a move if we're forming up
				formingUp = formUp(creep, combatMoveOptions)
			}

			if (Memory.season2 && creep.combatSnake) {
				let flags = creep.room.find(FIND_FLAGS)
				for (let flag of flags) {
					if (flag.name.startsWith("sTgt")) {
						if (!creep.pos.inRangeToPos(enemyPos, 3)) {							
							enemyPos = flag.pos
							formingUp = false
							enemy = null
							break
						}
					}
					else if (flag.name.startsWith("fsTgt")) {
						enemyPos = flag.pos
						formingUp = false
						enemy = null
						break
					}
				}
			}


			if (!formingUp) {
				if (enemy) {
					// Tanks aren't good enough to kill on their own
					// enemy.currentTargetLockBodyCount = (enemy.currentTargetLockBodyCount || 0) + creep.body.length;
					enemy.currentTargetLockCount = (enemy.currentTargetLockCount || 0) + 1;
				}

				let movePos = enemyPos;

				// Do a bit of interception
				if (enemyRange > 2 && !chasePos) {
					if (enemy && enemyRange > 2) {
						for (let hostileCreepInfo of (enemy.room.mem.hostileCreeps || [])) {
							if (enemy.id === hostileCreepInfo.id) {
								// We have their last pos. Assume they'll travel in the same direction for a bit

								let extrapX = (enemyPos.x - hostileCreepInfo.meanPos.x) * enemyRange / 3;
								let extrapY = (enemyPos.y - hostileCreepInfo.meanPos.y) * enemyRange / 3;

								// Play with diagonals a bit
								// The idea is to keep the non-diagonal offset
								// Rather than dropping into the diagonal
								if (hostileCreepInfo.meanPos.x != enemyPos.x || hostileCreepInfo.meanPos.y != enemyPos.y) {
									let absdx = Math.abs(enemyPos.x - creep.pos.x);
									let absdy = Math.abs(enemyPos.y - creep.pos.y);

									// Shift left or right
									if (absdx > absdy && enemyPos.x != creep.pos.x) {
										extrapY += enemyPos.x > creep.pos.x ? -1 : 1
									}
									// Shift up or down
									else if (absdy > absdx && enemyPos.y != creep.pos.y) {
										extrapX += enemyPos.y > creep.pos.y ? -1 : 1
									}
								}




								// left flank
								/*if (creep.combatMoveSkew == 1) {
									let dx = enemyPos.x - creep.pos.x;
									let dy = enemyPos.y - creep.pos.y;

									extrapY += dx * enemyRange / 3
									extrapX += dy * enemyRange / 3
								}
								// Right flank
								else if (creep.combatMoveSkew == 2) {
									let dx = enemyPos.x - creep.pos.x;
									let dy = enemyPos.y - creep.pos.y;

									extrapY -= dx * enemyRange / 3
									extrapX -= dy * enemyRange / 3
								}*/

								let terrain = Game.map.getRoomTerrain(enemy.room.name)

								// Can probably make this smarter. The extrapolated values have a half-life
								// of four ticks as I write this
								let overflow = 0;
								let validPos = true;


								let extrapolatedX = enemyPos.x + Math.round(extrapX);
								let extrapolatedY = enemyPos.y + Math.round(extrapY);

								if (extrapolatedX < 1 || extrapolatedX > 48 || extrapolatedY < 1 || extrapolatedY > 48 || terrain.get(extrapolatedX, extrapolatedY)) {
									validPos = false;
								}
								else {
									let structs = enemy.room.lookForAt(LOOK_STRUCTURES, extrapolatedX, extrapolatedY)
									for (let struct of structs) {
										if (struct.structureType == STRUCTURE_PORTAL || OBSTACLE_OBJECT_TYPES.includes(struct.structureType)) {
											validPos = false;
										}
									}
								}

								let maxInterceptRange = enemyRange / Math.max(1.5, (3 - (enemy.currentTargetLockCount - 1) * 0.25))

								while (!validPos || Math.max(Math.abs(extrapX), Math.abs(extrapY)) > maxInterceptRange) {
									extrapX /= 1.2
									extrapY /= 1.2

									extrapolatedX = enemyPos.x + Math.round(extrapX);
									extrapolatedY = enemyPos.y + Math.round(extrapY);

									if (extrapolatedX == enemyPos.x && extrapolatedY == enemyPos.y) {
										validPos = true;
										break;
									}

									validPos = true;
									if (extrapolatedX < 1 || extrapolatedX > 48 || extrapolatedY < 1 || extrapolatedY > 48 || terrain.get(extrapolatedX, extrapolatedY)) {
										validPos = false;
									}
									else {
										let structs = enemy.room.lookForAt(LOOK_STRUCTURES, extrapolatedX, extrapolatedY)
										for (let struct of structs) {
											if (struct.structureType == STRUCTURE_PORTAL || OBSTACLE_OBJECT_TYPES.includes(struct.structureType)) {
												validPos = false;
											}
										}
									}

									overflow++;
									if (overflow >= 100) {
										break;
									}
								}
								if (overflow >= 100) {
									console.log("---INTERCEPTION OVERFLOW---", creep.pos)
								}



								if (validPos) {
									movePos = new RoomPosition(extrapolatedX, extrapolatedY, enemy.pos.roomName);
								}
								break;
							}
						}
					}
					creep.room.visual.circle(movePos.x, movePos.y, {fill: "#ff8080"})

					// Don't repath if they're fairly close to where they were before.
					if (enemyRange !== undefined && creep.mem.path && creep.mem.path.length > 0 && creep.mem.pTgtRoom == movePos.roomName) {
						if (movePos.inRangeToXY(creep.mem.pTX, creep.mem.pTY, enemyRange / 4) && Game.cpu.bucket != 10000 && !util.isEdgeOfRoom(movePos)) {
							movePos = new RoomPosition(creep.mem.pTX, creep.mem.pTY, creep.mem.pTgtRoom);
						}
					}

					creep.room.visual.line(creep.pos.x, creep.pos.y, movePos.x, movePos.y, {color: "#ff8080"})
					creep.room.visual.text(Math.round(agression), creep.pos.x, creep.pos.y, {color: "#ff8080"})
					// if (enemy) {
					// 	creep.room.visual.text(enemy.pos.x, enemy.pos.y, {color: "#ff0000"})
					// }
					// console.log(creep, creep.pos)
				}

				if (chasePos) {
					movePos = chasePos
					combatMoveOptions.avoidCombatEdges = 0;
					combatMoveOptions.maxRooms = Math.max(combatMoveOptions.maxRooms, 2);

					if (creep.combatSnake) {
						snakeAI.moveSnake(creep.mem.formationCreeps, movePos, combatMoveOptions, 0, true, false)
					}
					else { 
						creep.uncachedMoveTo(movePos,
											 0,
											 combatMoveOptions);
					}
				}
				else {
					if (util.isEdgeOfRoom(movePos)) {
						if (movePos.x == 0) {
							movePos.x = 1
						}
						if (movePos.y == 0) {
							movePos.y = 1
						}
						if (movePos.x == 49) {
							movePos.x = 48
						}
						if (movePos.y == 49) {
							movePos.y = 48
						}
					}
					else if (util.isEdgeOfRoom(creep.pos) && enemyPos.x == movePos.x && enemyPos.y == movePos.y && creep.pos.isNearToPos(enemyPos) && util.isNearEdgeOfRoom(enemyPos, 1)) {
						let candidates = []
						// This case is tricky - if we want to move in we want to move in, not be blocked by the enemy on the exit
						let terrain = Game.map.getRoomTerrain(movePos.roomName)
						for (let i = -1; i <= 1; i++) {
							let x = movePos.x + i
							if (x <= 0 || x >= 49) {
								continue
							}
							for (let j = -1; j <= 1; j++) {
								let y = movePos.y + j
								if (y <= 0 || y >= 49) {
									continue
								}

								// Don't move to the enemy. This is 50% here and 50% later, making 25% total
								if (x == enemyPos.x && y == enemyPos.y && Math.random() < 0.5) {
									continue
								}

								// Don't move to swamps or walls
								if ((terrain.get(x, y) & TERRAIN_MASK_WALL) || (terrain.get(x, y) & TERRAIN_MASK_SWAMP)) {
									continue
								}

								let p = new RoomPosition(x, y, movePos.roomName)		
								// Don't move to creeps
								if (Math.random() < 0.5 && p.lookFor(LOOK_CREEPS).length) {
									continue
								}
								candidates.push(p)
							}
						}

						if (candidates.length) {
							movePos = _.sample(candidates)
						}
					}

					if (movePos.roomName != creep.room.name) {
						combatMoveOptions.avoidCombatEdges = 0;
						combatMoveOptions.maxRooms = Math.max(combatMoveOptions.maxRooms, 2);
					}

					if ((areaHostile || []).length > 1) {
						// Just a smidgen 
						combatMoveOptions.avoidHostiles = 0.1
					}

				// if (!util.isEdgeOfRoom(movePos) || Math.random() > 0.5) {

					let targetRange = enemy && enemy.structureType ? 1 : 0

					if (creep.combatSnake) {
						snakeAI.moveSnake(creep.mem.formationCreeps, movePos, combatMoveOptions, targetRange, true, false)
					}
					else {
						creep.uncachedMoveTo(movePos,
											 targetRange,
											 combatMoveOptions);
					}
				// }

				}
			}
		}
		else {

			// No enemy pos
			delete creep.mem.fleeTimer;
			if (creep.hits < creep.hitsMax * .75 && creep.hasActiveBodypart(HEAL)) {
				if (creep.combatSnake) {
					snakeAI.moveSnake(creep.mem.formationCreeps, new RoomPosition(25, 25, creep.room.name), moveOptions, 20, true, false)
				}
				else {					
					creep.uncachedMoveTo(new RoomPosition(25, 25, creep.room.name),
										 20,
										 moveOptions);
				}
			}
			else {
				if (creep.room.name == creep.mem.targetRoom && !creep.room.hasHostiles) {
					let flags = creep.room.find(FIND_FLAGS)
					for (let flag of flags) {
						if (flag.name.startsWith("RALLY")) {
							if (!creep.pos.inRangeToPos(flag.pos, 2) || Math.random() < 0.1) {
								if (creep.combatSnake) {
									snakeAI.moveSnake(creep.mem.formationCreeps, flag.pos, moveOptions, 2, true, false)
								}
								else {
									creep.cachedMoveTo(flag.pos, 2, moveOptions);
								}							
								return
							}

							delete creep.mem.path
							delete creep.mem.easyFight
							creep.mem.sleep = 1
							return
						}
					}
				}

				// if (creep.name.startsWith("t298")) console.log(creep.name)
				if (creep.room.name == creep.mem.targetRoom && !creep.room.hasHostiles && (creep.combatSnake ? !util.isNearEdgeOfRoom(creep.pos, 5) : !util.isEdgeOfRoom(creep.pos))) {
					// if (creep.name.startsWith("t298")) console.log("a", creep.name)
					if (!creep.combatSnake && (!creep.room.controller || !creep.room.controller.my)) {						
						creep.exitCamper = true;
						return this.runTankCamper(creep);
					}
					else {
						if (creep.mem.formationCreeps) {
							for (let formationCreepName of creep.mem.formationCreeps) {
								let formationCreep = Game.creeps[formationCreepName]
								if (!formationCreep) continue
								delete formationCreep.mem.path
								delete formationCreep.mem.easyFight
								formationCreep.mem.sleep = 1
							}
						}

						delete creep.mem.path
						delete creep.mem.easyFight
						creep.mem.sleep = 1
						return
					}
				}
				else {
					// if (creep.name == "t590_9473") console.log(creep, targetPos);
					if (creep.room.name == creep.mem.sR && Memory.rooms[creep.mem.sR] && Memory.rooms[creep.mem.sR].fallbackX) {
						let targetPos = new RoomPosition(Memory.rooms[creep.mem.targetRoom] ? (Memory.rooms[creep.mem.targetRoom].fallbackX || 25) : 25,
													     Memory.rooms[creep.mem.targetRoom] ? (Memory.rooms[creep.mem.targetRoom].fallbackY || 25) : 25,
														 creep.mem.targetRoom);

						// if (creep.name.startsWith("t298")) console.log("b", creep.name)
						if (creep.combatSnake && !creep.pos.inRangeToPos(targetPos, 2)) {
							snakeAI.moveSnake(creep.mem.formationCreeps, targetPos, moveOptions, 2, true, false)
						}
						else {
							creep.cachedMoveTo(targetPos, 2, moveOptions);
						}
					}
					else {
						let targetPos
						let precise

						if (creep.mem.pTgtRoom == creep.mem.targetRoom && creep.mem.pTX !== undefined && creep.mem.pTY !== undefined) {
							targetPos = new RoomPosition(creep.mem.pTX,
														 creep.mem.pTY,
														 creep.mem.targetRoom);
							moveOptions.noRePathOnOptsChange = creep.mem.path && creep.mem.path.length;
							precise = 1
						}
						else {
							targetPos = new RoomPosition(Memory.rooms[creep.mem.targetRoom] ? (Memory.rooms[creep.mem.targetRoom].fallbackX || 25) : 25,
														 Memory.rooms[creep.mem.targetRoom] ? (Memory.rooms[creep.mem.targetRoom].fallbackY || 25) : 25,
														 creep.mem.targetRoom);
							precise = 0
						}
						// if (creep.name.startsWith("t298")) console.log("c", creep.name, targetPos, JSON.stringify(moveOptions))
						if (Memory.rooms[creep.mem.targetRoom] && Memory.rooms[creep.mem.targetRoom].fallbackX) {


							if (creep.combatSnake) {
								// console.log("a", creep, targetPos)
								snakeAI.moveSnake(creep.mem.formationCreeps, targetPos, moveOptions, 2, true, false)
							}
							else {
								// console.log("b", creep, targetPos)
								creep.uncachedMoveTo(targetPos, 2, moveOptions);
							}
						}
						else {
							if (creep.combatSnake) {
								// console.log("c", creep, targetPos)
								snakeAI.moveSnake(creep.mem.formationCreeps, targetPos, moveOptions, precise ? 0 : 18, true, false)
							}
							else {
								// console.log("d", creep, targetPos)
								creep.uncachedMoveTo(targetPos, 18, moveOptions);
							}
						}
					}
				}
			}
		}

		// if (creep.name == "t6963_4420") console.log(Game.cpu.getUsed())

		let closeAttackTarget = combatFindBestAttackTarget(creep, 1) || enemy

		// if (creep.name == "t6963_4420") console.log(Game.cpu.getUsed())

		// Don't move toward it, but do kill it.
		if (!closeAttackTarget && creep.room.dangerous) {
			closeAttackTarget = creep.pos.findFirstInRange(creep.room.getAllHostileCreepsAndPowerCreeps(), 1);
			if (Memory.swc === 1) {
				if (closeAttackTarget && global.whiteList.indexOf(closeAttackTarget.owner.username) != -1) {
					closeAttackTarget = undefined;
				}
			}
			else if (Memory.season && closeAttackTarget) {
				if (scouting.isPlayerMediumWhiteListed(closeAttackTarget.owner.username)) {
					closeAttackTarget = undefined;
				}
				else if (scouting.isPlayerSoftWhiteListed(closeAttackTarget.owner.username) && creep.hits == creep.hitsMax) {// && !closeAttackTarget.hasBodypart(ATTACK) && !closeAttackTarget.hasBodypart(RANGED_ATTACK) && !closeAttackTarget.hasBodypart(HEAL) && !closeAttackTarget.hasBodypart(CLAIM)) {
					closeAttackTarget = undefined;
				}
			}
			enemyRange = 1;
		}

		var acted = false;
		if (closeAttackTarget) {
			// Um. This is kinda annoying. We find the best attack target above...
			// Then this validates it for overattacking and if it's not good it kinda
			// uses a less good thing to pick a new target. Really should pull the logic
			// for this into combatFindBestAttackTarget
			let bestTarget = getAttackCreepTarget(creep, closeAttackTarget)

			// if (enemyRange <= 1) {
			// 	acted = true;
			// 	creep.attack(enemy);
			// }
			// else if (creep.hasActiveBodypart(HEAL) && creep.hits < creep.hitsMax) {
			// 	acted = true;
			// 	creep.heal(creep)
			// }
			if (bestTarget) {
				// acted = true;
				let skip = false;
				// Eh, just let it be.
				if ((Game.cpu.bucket < 3000 || Memory.stats.avgBucket < 4000) && bestTarget.structureType && creep.getNumOfBodyPart(ATTACK) < 5 && bestTarget.hits > 2e6) {
					skip = true
				}

				if (!skip) {
					let ret = creep.attack(bestTarget);
					if (ret == OK) {
						acted = true;
					}
					// else {
					// 	console.log("attack failed a", creep, bestTarget)
					// }
				}
			}
			else if (!creep.healOrdersGiven && creep.hasActiveBodypart(HEAL) && creep.hits < creep.hitsMax) {
				acted = true;
				creep.heal(creep)
			}
		}

		// if (creep.name == "t6963_4420") console.log(Game.cpu.getUsed())

		if (!acted) {
			// let secondaryTarget = creep.pos.findFirstInRange(creep.room.getAllHostileCreepsAndPowerCreeps(), 1);
			// if (Memory.swc === 1) {
			// 	if (secondaryTarget && global.whiteList.indexOf(secondaryTarget.owner.username) != -1) {
			// 		secondaryTarget = undefined;
			// 	}
			// }

			// console.log(secondaryTarget)
			// if (secondaryTarget) {
			// 	creep.attack(secondaryTarget);
			// 	acted = true;
			// }
			// else {
				let secondaryTarget = creep.pos.findFirstInRange(FIND_HOSTILE_STRUCTURES, 1);
				if (Memory.swc === 1) {
					if (secondaryTarget && global.whiteList.indexOf(secondaryTarget.owner.username) != -1) {
						secondaryTarget = undefined;
					}
				}
				else if (Memory.season && secondaryTarget) {
					if (scouting.isPlayerMediumWhiteListed(secondaryTarget.owner.username)) {
						secondaryTarget = undefined;
					}
					else if (scouting.isPlayerSoftWhiteListed(secondaryTarget.owner.username) && creep.hits == creep.hitsMax) {// && !secondaryTarget.hasBodypart(ATTACK) && !secondaryTarget.hasBodypart(RANGED_ATTACK) && !secondaryTarget.hasBodypart(HEAL) && !secondaryTarget.hasBodypart(CLAIM)) {
						secondaryTarget = undefined;
					}
				}


				if (secondaryTarget) {
					let ret = creep.attack(secondaryTarget);
					if (ret == OK) {
						acted = true;
					}
					// else {
					// 	console.log("attack failed b", creep, secondaryTarget)
					// }
				}
				else if (Game.time - creep.mem.pIncompleteTick < 10 && !(creep.room.isMyRoom())) {
					secondaryTarget = creep.pos.findFirstInRange(FIND_STRUCTURES, 1, {
						filter: (structure) => {
							return structure.structureType == STRUCTURE_WALL && structure.hits;
						}
					});
					if (secondaryTarget) {
						let ret = creep.attack(secondaryTarget);
						if (ret == OK) {
							acted = true;
						}
						// else {
						// 	console.log("attack failed c", creep, secondaryTarget)
						// }
					}
				}
			// }
		}

		if (!acted && !creep.combatSnake && !creep.healOrdersGiven && creep.hasActiveBodypart(HEAL)) {
			let injuredCreeps = creep.room.getMyInjuredCreeps()
			
			// console.log("injured creeps in runTank a", creep)

			for (let injuredCreep of injuredCreeps)	{
				if (creep.pos.isNearToPos(injuredCreep.pos)) {
					creep.heal(injuredCreep);
					// console.log("injured creeps in runTank b", injuredCreep)
					acted = true;
					break
				}
			}
			if (!acted) {
				for (let injuredCreep of injuredCreeps)	{
					if (creep.pos.inRangeToPos(injuredCreep.pos, 3)) {
						creep.rangedHeal(injuredCreep);
						acted = true;
						break
					}
				}
			}
		}


		if (creep.hasActiveBodypart(RANGED_ATTACK)) {
			// Hm. Heal? Attack? Same difference
			if (acted) {
				creep.healOrdersGiven = 1
			}
			skirmisherRangedAttackAndHeal(creep, enemy, enemyRange)
		}
	},

	runTankRamparter: function(creep) {
		// Room is fooked, only run to ramparts if we're hurt
		if ((creep.room.breached && creep.room.effectiveLevel < 3) && creep.hits > creep.hitsMax * 0.8) {
			creep.ramparter = false;
			creep.exRamparter = true;
			creep.mem.forceRamparter = false;
			return this.runTank(creep)
		}

		delete creep.mem.engaged

		if (creep.room.allowRoamingRamparters || creep.combatSnake) {
			// TODO: This is really ugly copy-paste
			let enemy;

			if (creep.mem.enemyCreep) {
				let enemyObj = Game.getObjectById(creep.mem.enemyCreep)
				if (enemyObj && creep.pos.isNearToRoomObject(enemyObj) && enemyObj.hits != enemyObj.hitsMax) {
					enemy = enemyObj;
				}
				else {
					delete creep.mem.enemyCreep
				}
			}

			if (!enemy) {
				enemy = combatFindBestEnemy(creep, creep.room, undefined, 1);
			}

			if (enemy) {
				let enemyRange = creep.pos.getRangeTo(enemy)
				let agression

				let dangerousCreeps = creep.room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK], true);
				if (dangerousCreeps.length > 0) {
					var combatLocation = new RoomPosition(Math.round((creep.pos.x + enemy.pos.x) / 2), Math.round((creep.pos.y + enemy.pos.y) / 2), creep.room.name)

					let friendlyHeals = combatLocation.findFirstInRange(creep.room.getAllFriendlyCreepsWithBodyParts([HEAL], true), 8);
					let hostileHeals = combatLocation.findFirstInRange(creep.room.getAllHostileCreepsWithBodyParts([HEAL], true), 8);

					var areaFriends = combatLocation.findInRange(creep.room.getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true), 8); // Active only
					var areaHostile = combatLocation.findInRange(creep.room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], !hostileHeals), 8); // If the enemy has heals, assume inactive is active

					let exits;
					if (combatLocation.x < 6) {
						exits = Game.map.describeExits(creep.room.name);
						if (exits[LEFT] && Game.rooms[exits[LEFT]]) {
							let pos = new RoomPosition(48, combatLocation.y, exits[LEFT])
							let range = 6 - combatLocation.x;
							areaFriends = areaFriends.concat(pos.findInRange(Game.rooms[exits[LEFT]].getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true), range));
							areaHostile = areaHostile.concat(pos.findInRange(Game.rooms[exits[LEFT]].getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], !hostileHeals), range));
						}
					}
					else if (combatLocation.x > 49 - 6) {
						exits = Game.map.describeExits(creep.room.name);
						if (exits[RIGHT] && Game.rooms[exits[RIGHT]]) {
							let pos = new RoomPosition(1, combatLocation.y, exits[RIGHT])
							let range = 6 - (49 - combatLocation.x);
							areaFriends = areaFriends.concat(pos.findInRange(Game.rooms[exits[RIGHT]].getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true), range));
							areaHostile = areaHostile.concat(pos.findInRange(Game.rooms[exits[RIGHT]].getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], !hostileHeals), range));
						}
					}
					if (combatLocation.y < 6) {
						if (!exits) {
							exits = Game.map.describeExits(creep.room.name);
						}
						if (exits[TOP] && Game.rooms[exits[TOP]]) {
							let pos = new RoomPosition(combatLocation.x, 48, exits[TOP])
							let range = 6 - combatLocation.y;
							areaFriends = areaFriends.concat(pos.findInRange(Game.rooms[exits[TOP]].getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true), range));
							areaHostile = areaHostile.concat(pos.findInRange(Game.rooms[exits[TOP]].getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], !hostileHeals), range));
						}
					}
					else if (combatLocation.y > 49 - 6) {
						if (!exits) {
							exits = Game.map.describeExits(creep.room.name);
						}
						if (exits[BOTTOM] && Game.rooms[exits[BOTTOM]]) {
							let pos = new RoomPosition(combatLocation.x, 1, exits[BOTTOM])
							let range = 6 - (49 - combatLocation.y);
							areaFriends = areaFriends.concat(pos.findInRange(Game.rooms[exits[BOTTOM]].getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true), range));
							areaHostile = areaHostile.concat(pos.findInRange(Game.rooms[exits[BOTTOM]].getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], !hostileHeals), range));
						}
					}

					let myParts = creep.getBoostModifiedCombatParts(true);

					let stance = getCombatStance(creep, enemy, combatLocation, areaFriends, areaHostile, friendlyHeals, hostileHeals, true);
					agression = stance.agression;

					agression -= 5 * (1 - (creep.getActiveBodyparts(ATTACK) / creep.getNumOfBodyPart(ATTACK)))

					// They're tired. Pounce!
					if (enemy.fatigue > 0 && myParts.numAttack > 0) {
						agression += 1;
					}

					// We're hitting them. HIT THEM!
					if (enemyRange == 1 && myParts.numAttack > 0) {
						agression += 2;
					}
					// A chase!
					else if (enemyRange == 2 && myParts.numAttack > 0) {
						agression += 1;
					}

					// if (util.isEdgeOfRoom(creep.pos)) {
					// 	agression += 2;
					// }
					// else if (util.isNearEdgeOfRoom(creep.pos, 1)) {
					// 	agression += 1;
					// }
				}
				else {
					agression = 1;
				}

				if (agression >= 2) {
					creep.ramparter = false;
					creep.mem.forceRamparter = false;
					return this.runTank(creep)
				}
			}
		}

		var combatMoveOptions = {"avoidEnemyRooms" : 1,
								 "avoidCombatEdges" : 1,
								 "avoidAllCreeps": 1,
								 "avoidHostiles": 1,
								 "reusePath": 3,
								 "rampartFocus" : 1,
								 "maxRooms": 1,
								 "maxOptsMod": 2};



		var bestRamparts = creep.room.bestRampartsTank || [];

		let hostiles = creep.room.getAllHostileCreepsAndPowerCreeps()

		// Don't move unsafely if we have a target.
		let currentTarget = creep.pos.findFirstInRange(hostiles, 1);

		let dangerClose;
		if (!currentTarget) {
			dangerClose = creep.pos.findFirstInRange(hostiles, 7);			
		}

		let currentRampart;
		let isOnRampart = false;
		let currentStructures = creep.pos.lookFor(LOOK_STRUCTURES);
		for (let currentStructure of currentStructures) {
			if (currentStructure.structureType == STRUCTURE_RAMPART && currentStructure.hits > 10000) {
				isOnRampart = true;
				currentRampart = currentStructure;
				break;
			}
		}

		let noMoving = 0;
		if (currentTarget || dangerClose) {
			if (isOnRampart) {
				if (creep.combatSnake) {
					for (let creepName of creep.mem.formationCreeps) {
						let otherCreep = Game.creeps[creepName]
						if (!otherCreep) continue
						isOnRampart = false;
						let currentStructures = otherCreep.pos.lookFor(LOOK_STRUCTURES);
						for (let currentStructure of currentStructures) {
							if (currentStructure.structureType == STRUCTURE_RAMPART && currentStructure.hits > 10000) {
								isOnRampart = true;
								break;
							}
						}
					}
				}

				if (isOnRampart) {					
					combatMoveOptions.rampartForced = 1;
					combatMoveOptions.creepsBlockMovement = 1;
				}
			}

			if (isOnRampart && Game.cpu.bucket < 1000 && Math.random() < 0.5) {
				noMoving = 1;
			}
		}

		if (!isOnRampart) {			
			let segementData = segments.loadSegmentData(50 + creep.room.mem.ID % 45);
			if (segementData) {
				let floodedDesign = segementData[creep.room.name].floodedDesign;

				if (floodedDesign) {
					// Outside. Get inside.
					if (parseInt(floodedDesign[creep.pos.x][creep.pos.y]) === 0) {
						combatMoveOptions.reusePath = creep.pos.findFirstInRange(creep.room.getAllHostileCreepsAndPowerCreeps(), 6) ? 1 : 2;
						combatMoveOptions.avoidHostiles = 10;
						combatMoveOptions.avoidAllCreeps = 0;
						combatMoveOptions.maxOptsMod = 5;
						delete creep.mem.pIncompleteTick
						creep.say("Outside")
					}
				}
			}
		}



		if (bestRamparts.length > 0) {
			var targetRampart;
			if (!currentTarget || !currentRampart || !bestRamparts.includes(currentRampart)) {
				let bestRampart


				if ((Game.cpu.bucket > 2000 && Math.random() < .75) || Math.random() < 0.25 || (!Game.getObjectById(creep.mem.bestRampartId) || Game.getObjectById(creep.mem.bestRampartId).hits < 10000)) {				
					// The later we get on the list, the less they want to walk
					let rangePow = 0.5 + 0.5 / ((creep.room.tankRampartersAssigned || 0) + 1)		

					let bestScore = 0

					// TODO: I think something may be broken here. All my creeps went dumb when I enabled it
					// console.log(creep, "finding best rampart")
					let pressurePoints = Memory.roomPressurePoints[creep.room.name] || {}

					if (dangerClose) {
						for (let testRampart of bestRamparts) {
							// This can happen with snakes - isOnRampart means the "tail" is not on a rampart
							// but current rampart is of the "head"
							if (!isOnRampart && currentRampart == testRampart) {
								continue
							}

							// Nothing is better
							if (testRampart.tankDamage < bestScore) {
								break
							}
							let score = testRampart.tankDamage * (1 - Math.pow(0.02 * creep.pos.getRangeToPos(testRampart.pos), rangePow))

							if (score > bestScore) {
								bestScore = score;
								bestRampart = testRampart
								// console.log(score, bestRampart)
							}
						}
					}
					else {						
						for (let testRampart of bestRamparts) {
							// This can happen with snakes - isOnRampart means the "tail" is not on a rampart
							// but current rampart is of the "head"
							if (!isOnRampart && currentRampart == testRampart) {
								continue
							}
							// Nothing is better
							if (testRampart.tankDamage * 4 < bestScore) {
								break
							}
							let score = testRampart.tankDamage * (1 - Math.pow(0.02 * creep.pos.getRangeToPos(testRampart.pos), rangePow))

							// Defend the pressure points
							if (pressurePoints[testRampart.id]) {
								/*if (testRampart.isInRange3OfEnemy === undefined) {
									testRampart.isInRange3OfEnemy = testRampart.pos.findFirstInRange(FIND_HOSTILE_CREEPS, 3) ? 1 : 0
								}
								// If the rampart is close to the enemy then prefer ones with higher scores
								if (!testRampart.isInRange3OfEnemy) {							
									// 1-4x
									score *= 1 + Math.max(0, Math.min(3, pressurePoints[testRampart.id].d / 0.5e6))
								}*/
								// 1-4x
								score *= 1 + Math.max(0, Math.min(3, pressurePoints[testRampart.id].d / 0.5e6))
								
							}

							// Don't like this as it doesn't distinguish main ramparts from "backups"
							/*if (testRampart.hits < 2e6) {
								// 1-2x
								score *= 2 - testRampart.hits / 2e6
							}*/

							if (score > bestScore) {
								bestScore = score;
								bestRampart = testRampart
								// console.log(score, bestRampart)
							}
						}
					}
				}
				else {
					bestRampart = Game.getObjectById(creep.mem.bestRampartId)
				}

				// Can happen with formations. Shouldn't
				// be in here unless there is at least one eligable, but if there are not two
				// eligable our snake can want to move and not be able to
				if (currentRampart && !bestRampart) {
					bestRampart = currentRampart
				}

				creep.room.tankRampartersAssigned = (creep.room.tankRampartersAssigned || 0) + 1
				creep.mem.bestRampartId = bestRampart.id;

				// console.log(bestRampart, bestRamparts[0], bestRamparts[0].tankDamage, creep.pos.getRangeToPos(bestRamparts[0].pos))

				// targetRampart = bestRamparts[0];
				targetRampart = bestRampart;
				if (!noMoving) {
					if (creep.combatSnake) {
						snakeAI.moveSnake(creep.mem.formationCreeps, targetRampart.pos, combatMoveOptions, 0, true, false)
					}
					else {
						creep.uncachedMoveTo(targetRampart.pos,
											 0,
											 combatMoveOptions);
					}
					// creep.uncachedMoveTo(targetRampart, 0, combatMoveOptions);
				}
				else {
					moveResolver.static(creep)
				}
			}
			else {
				targetRampart = currentRampart;
			}

			if (targetRampart) {
				_.pull(creep.room.bestRampartsRanged, targetRampart)
				_.pull(creep.room.bestRampartsTank, targetRampart)
			}
		}
		else if (!creep.mem.forceRamparter || creep.room.breached) {
			creep.ramparter = false;
			creep.exRamparter = true;
			// creep.mem.forceRamparter = false;
			return this.runTank(creep)
		}
		else {
			// creep.ramparter = false;
			// creep.exRamparter = true;
			// return this.runTank(creep)
			if (Math.random() < 0.03) {
				if (creep.combatSnake) {
					snakeAI.moveSnake(creep.mem.formationCreeps, new RoomPosition(creep.room.mem.fallbackX || 25, creep.room.mem.fallbackY || 25, creep.room.name), combatMoveOptions, 2, true, true)
				}
				else {
					creep.uncachedMoveTo(new RoomPosition(creep.room.mem.fallbackX || 25, creep.room.mem.fallbackY || 25, creep.room.name),
										 2,
										 combatMoveOptions);
				}
			}
		}


		let acted = false
		if (currentTarget && creep.hasActiveBodypart(ATTACK)) {
			creep.attack(currentTarget);
			acted = true
		}
		else if (creep.hasActiveBodypart(HEAL) && creep.hits < creep.hitsMax) {
			creep.heal(creep)
			acted = true
		}
		if (creep.hasActiveBodypart(RANGED_ATTACK)) {
			// Hm. Heal? Attack? Same difference
			if (acted) {
				creep.healOrdersGiven = 1
			}
			skirmisherRangedAttackAndHeal(creep)
		}

	},

	runTankCamper: function(creep) {
		var moveOptions = {"avoidEnemyRooms" : 1};
		var combatMoveOptions = {"avoidEnemyRooms" : 1, "avoidCombatEdges" : 1, "maxRooms": 1};

		if ((creep.mem.blockingFormation || 0) > 0) {
			creep.exitCamper = false;
			return this.runTank(creep);
		}

		delete creep.mem.engaged

		let target;
		if (creep.mem.target) {
			target = Game.getObjectById(creep.mem.target);
			delete creep.mem.bestBorderIdx;
			delete creep.mem.campSite;

			if (!target || target.pos.getRangeTo(creep.pos) > 1)  {
				delete creep.mem.target;
				target = undefined;
			}
		}

		if (!creep.mem.target) {
			target = creep.pos.findFirstInRange(creep.room.getAllHostileCreepsAndPowerCreeps(), 1);
			if (target) {
				creep.mem.target = target.id;
				delete creep.mem.bestBorderIdx;
				delete creep.mem.campSite;
			}
			else {
				// Hmm. Nasty guys and we're not next to them.
				// Normally, we'd just go after them, but we have no support guareneteed.
				// Ok:
				// 1) If they can outdamage our heal with RA then run normal tank
				// 2) If they can out tank us, then run normal tank
				if (creep.room.dangerous) {
					let hostiles = creep.room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], false);

					let myHeal = creep.getActiveBodyparts(HEAL);

					let etotalAttack = 0;
					let etotalRanged = 0;
					let etotalHeal = 0;
					for (let hostile of hostiles) {
						let combatParts = hostile.getBoostModifiedCombatParts(false, true);
						etotalAttack += combatParts.numAttack;
						etotalRanged += combatParts.numRanged;
						etotalHeal += combatParts.numHeal;

						if (etotalRanged * 10 > myHeal * 12) {
							creep.exitCamper = false;
							delete creep.mem.bestBorderIdx;
							delete creep.mem.campSite;
							return this.runTank(creep);
						}
					}

					if (etotalRanged * 10 + etotalAttack * 30 - myHeal * 12 > creep.getActiveBodyparts(ATTACK) * 30 - etotalHeal * 12) {
						creep.exitCamper = false;
						delete creep.mem.bestBorderIdx;
						delete creep.mem.campSite;
						return this.runTank(creep);
					}

					target = creep.pos.findClosestByRange(hostiles);
					delete creep.mem.bestBorderIdx;
					delete creep.mem.campSite;
				}
				else if (!creep.mem.campSite) {
					// Find the best exit pos and camp it
					let borderInfos = creep.room.mem.borderInfos;
					if (!borderInfos || Object.keys(borderInfos).length == 0) {
						if (creep.room.hasHostiles) {
							creep.exitCamper = false;
							return this.runTank(creep);
						}
						else {
							if (Memory.rooms[creep.room.name].fallbackX) {
								creep.uncachedMoveTo(new RoomPosition(Memory.rooms[creep.room.name].fallbackX,
																	  Memory.rooms[creep.room.name].fallbackY,
																	  creep.room.name), 0, combatMoveOptions);
							}
							else {
								creep.uncachedMoveTo(new RoomPosition(25,
																	  25,
																	  creep.room.name), 20, combatMoveOptions);
							}
							if (creep.hits < creep.hitsMax && creep.hasActiveBodypart(HEAL)) {
								creep.heal(creep);
							}

							return;
						}
					}

					// Find the highest energy border that's been used in the last 300 ticks
					let highestScore = 0;
					let bestBorderIdx = -1;
					for (let borderIdx in borderInfos) {
						let borderInfo = borderInfos[borderIdx];

						// Does somebody already have it?
						if (borderInfo.allocatedCreep) {
							let allocatedCreep = Game.getObjectById(borderInfo.allocatedCreep);
							if (allocatedCreep &&
								allocatedCreep.exitCamper &&
								allocatedCreep.room.name == creep.room.name &&
								allocatedCreep.mem.bestBorderIdx &&
								allocatedCreep.mem.bestBorderIdx == borderIdx) {
								continue;
							}
							else {
								delete borderInfo.allocatedCreep;
							}
						}

						let score = borderInfo.avgEnergyCost * Math.sqrt(Game.time - borderInfo.lastTick);
						if (score > highestScore && borderInfo.maxdps < creep.getNumOfBodyPart(ATTACK) * ATTACK_POWER) {
							highestScore = score;
							bestBorderIdx = borderIdx;
						}
					}

					if (bestBorderIdx == -1) {
						if (creep.room.hasHostiles) {
							creep.exitCamper = false;
							return this.runTank(creep);
						}
						else {
							if (Memory.rooms[creep.room.name].fallbackX) {
								creep.uncachedMoveTo(new RoomPosition(Memory.rooms[creep.room.name].fallbackX,
																	  Memory.rooms[creep.room.name].fallbackY,
																	  creep.room.name), 0, combatMoveOptions);
							}
							else {
								creep.uncachedMoveTo(new RoomPosition(25,
																	  25,
																	  creep.room.name), 20, combatMoveOptions);
							}
							if (creep.hits < creep.hitsMax && creep.hasActiveBodypart(HEAL)) {
								creep.heal(creep);
							}

							return;
						}
					}

					let borderX = Math.floor(bestBorderIdx / 50);
					let borderY = bestBorderIdx % 50;

					let campX = borderX;
					let campY = borderY;

					if (borderX == 0) {
						campX = 1;
					}
					else if (borderX == 49) {
						campX = 48;
					}
					else if (borderY == 0) {
						campY = 1;
					}
					else if (borderY == 49) {
						campY = 48;
					}


					borderInfos[bestBorderIdx].allocatedCreep = creep.id;
					creep.mem.bestBorderIdx = bestBorderIdx;
					creep.mem.campSite = new RoomPosition(campX, campY, creep.room.name);
				}

				if (creep.mem.campSite) {
					let campPos = new RoomPosition(creep.mem.campSite.x, creep.mem.campSite.y, creep.mem.campSite.roomName)
					if (creep.pos.isEqualToPos(campPos)) {
						creep.mem.sleep = creep.room.hasHostiles ? 0 : 1;
					}
					else {
						creep.uncachedMoveTo(new RoomPosition(creep.mem.campSite.x, creep.mem.campSite.y, creep.mem.campSite.roomName), 0, creep.room.name == creep.mem.campSite.roomName ? combatMoveOptions : moveOptions);
					}
				}
				else {
					if (Memory.rooms[creep.room.name].fallbackX) {
						creep.uncachedMoveTo(new RoomPosition(Memory.rooms[creep.room.name].fallbackX,
															  Memory.rooms[creep.room.name].fallbackY,
															  creep.room.name), 0, combatMoveOptions);
					}
					else {
						creep.uncachedMoveTo(new RoomPosition(25,
															  25,
															  creep.room.name), 20, combatMoveOptions);
					}
				}
			}
		}


		if (target && creep.hasActiveBodypart(ATTACK)) {
			if (creep.pos.getRangeTo(target.pos) == 1) {
				creep.attack(target);
				creep.mem.damageDone = (creep.mem.damageDone || 0) + creep.getActiveBodyparts(ATTACK) * 30;
				// console.log(creep.mem.damageDone)
				if (!util.isEdgeOfRoom(target.pos)) {
					creep.move(creep.pos.getDirectionTo(target));
				}
				// We want to be N/S/E/W, not on a diagonal.
				else {
					if (creep.pos.getDirectionTo(target) == TOP_LEFT) {
						if (target.pos.x == 0) {
							creep.move(TOP)
						}
						else if (target.pos.y == 0) {
							creep.move(LEFT)
						}
					}
					else if (creep.pos.getDirectionTo(target) == BOTTOM_LEFT) {
						if (target.pos.x == 0) {
							creep.move(BOTTOM)
						}
						else if (target.pos.y == 49) {
							creep.move(LEFT)
						}
					}
					if (creep.pos.getDirectionTo(target) == BOTTOM_RIGHT) {
						if (target.pos.x == 49) {
							creep.move(BOTTOM)
						}
						else if (target.pos.y == 49) {
							creep.move(RIGHT)
						}
					}
					if (creep.pos.getDirectionTo(target) == TOP_RIGHT) {
						if (target.pos.x == 49) {
							creep.move(TOP)
						}
						else if (target.pos.y == 0) {
							creep.move(RIGHT)
						}
					}
				}
			}
			else if (creep.hits < creep.hitsMax && creep.hasActiveBodypart(HEAL)) {
				creep.heal(creep);
			}
		}
		else if (creep.hits < creep.hitsMax && creep.hasActiveBodypart(HEAL)) {
			creep.heal(creep);
		}
	},

	// Designed as a skirmisher, not as a base attacker
	runRanged: function(creep) {
		if (creep.renew && !creep.ramparter) {
			return this.runRenewer(creep, true);
		}
		// Get the boosts!
		else if (creep.getBoosts()) {
			return;
		}

		let mem = Memory.creeps[creep.name]

		if (creep.room.name == mem.sR && !creep.room.dangerous && creep.ticksToLive < 50 && creep.hasBoost()) {
			let res = this.attempToUnBoost(creep)
			if (res) {
				return;
			}
		}

		delete mem.engaged

		// Rather than branch all over the place, lets just call it
		// if (creep.ramparter && creep.room.bestRampartsRanged && creep.room.bestRampartsRanged.length && creep.ticksToLive > 5) {
		// 	return this.runRangedRamparter(creep);
		// }
		// TODO: Separate these two out
		if (creep.recycle) {
			return this.runRecycler(creep)
		}
		else if (creep.assaulter) {
			return this.runRangedAssaulter(creep);
		}
		else if (creep.combatSnake) {
			return this.runPairedHealer(creep);
		}
		else if (creep.moon) {
			return this.runRangedMoon(creep);
		}
		else if (creep.convoyRaider) {
			return this.runRangedConvoyRaider(creep);
		}
		else if (creep.strongholdSniper) {
			return this.runRangedStrongholdSniper(creep);
		}
		else if (creep.edgeBouncer) {
			return this.runMissionEdgeBouncer(creep);
		}
		else if (creep.swarmer) {
			mem.retreat = false;
		}
		else if (!creep.hasBodypart(RANGED_ATTACK) && creep.hasBodypart(HEAL)) {
			return this.runHealer(creep)
		}

		if (mem.sleep && !mem.retreat) {
			if (creep.room.hasHostiles || creep.room.name != mem.targetRoom || Math.random() < 0.05) {
				delete mem.sleep
				if (!creep.room.hasHostiles && creep.room.name == mem.targetRoom) {
					let flags = creep.room.find(FIND_FLAGS)

					if (flags.length) {
						for (let flag of flags) {
							if (flag.name.startsWith("form")) {
								creep.uncachedMoveTo(flag, 2, {maxRooms:1, avoidEnemyRooms: 1, avoidCombatEdges: 1})
								return
							}
						}
					}
				}
			}
			else {
				return;
			}
		}

		if (mem.retreat && creep.room.name == mem.sR && creep.room.hasHostiles) {
			mem.retreat = false;
		}

		var forceRetreat = false;
		if ((creep.pos.roomName != mem.targetRoom || (creep.room.controller && creep.room.controller.safeMode || 0) > 0) && creep.room.isEnemyRoom()) {
			if ((creep.room.controller && creep.room.controller.safeMode || 0) > 0) {
				forceRetreat = true;
			}
			else if (creep.room.towers.length > 0) {
				for (let tower of creep.room.towers) {
					if (tower.energy >= TOWER_ENERGY_COST && tower.isActive()) {
						forceRetreat = true;
						break;
					}
				}
			}
		}

		let enemy;
		let enemyOnEdge = false;
		let lastEnemy

		if (mem.enemyCreep) {
			lastEnemy = Game.getObjectById(mem.enemyCreep)
			// if (enemyObj && creep.pos.getRangeTo(enemy) <= 3 && enemy.hits != enemy.hitsMax) {
			// 	enemy = enemyObj;
			// }
			// else if (!enemyObj) {
				// Often enemies will go off the edge then come back. If no hostiles nearby wait for them sometimes
				if (mem.enemyPos && Math.random() < (creep.mem.targetRoom === creep.room.name ? 0.8 : 0.4) && util.isEdgeOfRoom(mem.enemyPos) && (Math.random < 0.5 || !creep.pos.findFirstInRange(FIND_HOSTILE_CREEPS, 10))) {
					enemyOnEdge = true;
				}
				else {
					delete mem.enemyCreep
				}
			// }
		}

		if (!enemy && !enemyOnEdge) {
			enemy = combatFindBestEnemy(creep, creep.room, lastEnemy, 0);
		}


		if (!enemy && util.isNearEdgeOfRoom(creep.pos, 2)) {
			// Get the neighbour room and find best enemy
			let exits = Game.map.describeExits(creep.room.name)

			if (exits[LEFT] && Game.rooms[exits[LEFT]] && creep.pos.x <= 2) {
				enemy = combatFindBestEnemy(creep, Game.rooms[exits[LEFT]], lastEnemy, 0);
			}
			else if (exits[RIGHT] && Game.rooms[exits[RIGHT]] && creep.pos.x >= 48) {
				enemy = combatFindBestEnemy(creep, Game.rooms[exits[RIGHT]], lastEnemy, 0);
			}

			if (exits[TOP] && Game.rooms[exits[TOP]] && creep.pos.y <= 2) {
				enemy = combatFindBestEnemy(creep, Game.rooms[exits[TOP]], lastEnemy, 0);
			}
			else if (exits[BOTTOM] && Game.rooms[exits[BOTTOM]] && creep.pos.y >= 48) {
				enemy = combatFindBestEnemy(creep, Game.rooms[exits[BOTTOM]], lastEnemy, 0);
			}
		}


		var targetDist;
		var push = false;
		var pull = false;
		var enemyPos;
		var enemyRange = Infinity;
		let dangerousCreeps = [];
		let agression;

		if (creep.hits != creep.hitsMax && creep.room.towers.length > 0 && creep.room.isEnemyRoom() && _.any(creep.room.towers, function(tower) { return tower.energy >= TOWER_ENERGY_COST && tower.isActive()})) {
			forceRetreat = true;
			if (enemy) {
				enemyPos = enemy.pos;
				mem.enemyPos = enemy.pos;
				enemyRange = creep.pos.getWorldRangeToPos(enemy.pos);
				dangerousCreeps = creep.room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK], true);
			}
		}
		else if (enemy) {
			enemyPos = enemy.pos;
			mem.enemyPos = enemy.pos;

			enemyRange = creep.pos.getWorldRangeToPos(enemy.pos);

			// If we're not going to check agression, fall back to the ramparts. If they're 7 tiles away they're probably doing bugger all anyway.
			if (creep.ramparter && enemyRange > 7 && creep.room.bestRampartsRanged && creep.room.bestRampartsRanged.length && creep.ticksToLive > 20) {
				// console.log(creep, "RRR a")
				return this.runRangedRamparter(creep);
			}

			// Well, not gonna reach him. Suiciding may mess up people's kill trackers.
			// if (enemyRange - 3 > 2 * creep.ticksToLive) {
			// 	return creep.suicide()
			// }

			

			// Skip every other tick if we think this is going to be easy.
			if (mem.easyFight && (!creep.room.roomStrength || creep.room.roomStrength > 1.5)) {
				targetDist = 0;
				agression = 5;
				push = true
				creep.say("Easy")
			}
			// Don't need to calculate this if we're far away, or tired
			else if (enemyRange <= 7) {
				let enemyCanRangedDamage
				let enemyCanCloseDamage

				let isSK = enemy.owner && enemy.owner.username == "Source Keeper"

				dangerousCreeps = enemy.room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK], true);

				if (creep.fatigue == 0) {
					let clx
					let cly

					if (enemy.room.name != creep.room.name) {
						clx = enemy.pos.x
						cly = enemy.pos.y
					}
					else {
						clx = Math.round((creep.pos.x + enemy.pos.x) / 2)
						cly = Math.round((creep.pos.y + enemy.pos.y) / 2)
					}

					var combatLocation = new RoomPosition(clx, cly, enemy.room.name)
					let combatRoom = enemy.room

					let hostileHeals = combatLocation.findFirstInRange(combatRoom.getAllHostileCreepsWithBodyParts([HEAL], true), 8);
					let friendlyHeals = combatLocation.findFirstInRange(combatRoom.getAllFriendlyCreepsWithBodyParts([HEAL], true), 8);

					let areaFriends = combatLocation.findInRange(combatRoom.getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true), 8); // Active only
					let areaHostile = combatLocation.findInRange(combatRoom.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], !hostileHeals), 8); // If the enemy has heals, assume inactive is active

					let exits;
					if (combatLocation.x < 6) {
						exits = Game.map.describeExits(combatRoom.name);
						if (exits[LEFT] && Game.rooms[exits[LEFT]]) {
							let pos = new RoomPosition(48, combatLocation.y, exits[LEFT])
							let range = 6 - combatLocation.x;
							areaFriends = areaFriends.concat(pos.findInRange(Game.rooms[exits[LEFT]].getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true), range));
							areaHostile = areaHostile.concat(pos.findInRange(Game.rooms[exits[LEFT]].getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], !hostileHeals), range));
						}
					}
					else if (combatLocation.x > 49 - 6) {
						exits = Game.map.describeExits(combatRoom.name);
						if (exits[RIGHT] && Game.rooms[exits[RIGHT]]) {
							let pos = new RoomPosition(1, combatLocation.y, exits[RIGHT])
							let range = 6 - (49 - combatLocation.x);
							areaFriends = areaFriends.concat(pos.findInRange(Game.rooms[exits[RIGHT]].getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true), range));
							areaHostile = areaHostile.concat(pos.findInRange(Game.rooms[exits[RIGHT]].getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], !hostileHeals), range));
						}
					}
					if (combatLocation.y < 6) {
						if (!exits) {
							exits = Game.map.describeExits(combatRoom.name);
						}
						if (exits[TOP] && Game.rooms[exits[TOP]]) {
							let pos = new RoomPosition(combatLocation.x, 48, exits[TOP])
							let range = 6 - combatLocation.y;
							areaFriends = areaFriends.concat(pos.findInRange(Game.rooms[exits[TOP]].getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true), range));
							areaHostile = areaHostile.concat(pos.findInRange(Game.rooms[exits[TOP]].getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], !hostileHeals), range));
						}
					}
					else if (combatLocation.y > 49 - 6) {
						if (!exits) {
							exits = Game.map.describeExits(combatRoom.name);
						}
						if (exits[BOTTOM] && Game.rooms[exits[BOTTOM]]) {
							let pos = new RoomPosition(combatLocation.x, 1, exits[BOTTOM])
							let range = 6 - (49 - combatLocation.y);
							areaFriends = areaFriends.concat(pos.findInRange(Game.rooms[exits[BOTTOM]].getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true), range));
							areaHostile = areaHostile.concat(pos.findInRange(Game.rooms[exits[BOTTOM]].getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], !hostileHeals), range));
						}
					}

					let stance = getCombatStance(creep, enemy, combatLocation, areaFriends, areaHostile, friendlyHeals, hostileHeals, false);
					agression = stance.agression;

					enemyCanRangedDamage = stance.eLong > 0 || isSK;
					enemyCanCloseDamage = stance.eClose > 0;

					// var enemyRange = creep.pos.getRangeTo(enemy);

					if (enemyRange <= 3) {
						if (areaHostile.length > 1) {
							var closeAttackers = creep.pos.findInRange(areaHostile, 3, {
								filter: (hostile) => {
									return hostile.hasActiveBodypart(ATTACK);
								}
							});
							agression -= closeAttackers.length;
						}
						else if (enemy.hasActiveBodypart && enemy.hasActiveBodypart(ATTACK)) {
							agression -= 1;
						}
					}

					if (!creep.hasActiveBodypart(RANGED_ATTACK)) {
						if (isSK) {
							agression = Math.min(agression - 5, -3);
						}
						else {
							agression = Math.min(agression - 5, -2);
						}
					}
					else if (isSK) {
						agression = Math.min(agression, 0);
					}

					var enemyCanMove = false;
					if (areaHostile.length > 1) {
						var closeEnemies = creep.pos.findInRange(areaHostile, enemyRange);
						for (var closeEnemy of closeEnemies) {
							if (enemy.fatigue == 0 && enemy.hasDamagingBodypart(true)) {
								enemyCanMove = true;
								break;
							}
						}
					}
					else {
						enemyCanMove = !enemy.fatigue;
					}
				}
				else {
					agression = mem.lastAgression || 0
				}

				// if (enemyCanRangedDamage) {
				// 	agression -= 1;
				// }
				// if (enemyCanCloseDamage) {
				// 	agression -= 1;
				// }

				// creep.say(agression)

				if (agression < -10 || util.isNearEdgeOfRoom(creep.pos, 2)) {
					enemyCanRangedDamage = true
					// agression += 3
				}



				if (agression >= 4 && !isSK && !enemyCanCloseDamage && !util.isEdgeOfRoom(enemy.pos) && !enemy.structureType) {
					targetDist = 0;
					push = enemyCanMove;
				}
				else if (agression >= 2 && !isSK && !enemyCanCloseDamage) {
					targetDist = 1;
					push = enemyCanMove;
				}
				else if (agression >= 1 && !isSK && !enemyCanCloseDamage) {
					targetDist = 2;
					push = enemyCanMove;
				}
				else if (agression >= 0 && !isSK) {
					targetDist = 2;
				}
				else if (agression >= -1) {
					targetDist = 2;
					pull = enemyCanMove;
				}
				// Don't go longer than 3 if the enemy can't long range.
				else if (agression >= -2 || !enemyCanRangedDamage) {
					targetDist = 3;
					pull = enemyCanMove && enemyCanRangedDamage;
				}
				else if (agression >= -3) {
					targetDist = 4;
					pull = enemyCanMove && enemyCanRangedDamage;
				}
				else if (agression >= -4) {
					targetDist = 5;
					pull = enemyCanMove && enemyCanRangedDamage;
				}
				else if (agression >= -5) {
					targetDist = 6;
					pull = enemyCanMove && enemyCanRangedDamage;
				}
				else {
					targetDist = 7;
					pull = true;
				}

					// if (creep.name == "r1594_3589") console.log(agression, targetDist, push, pull)

					// console.log(creep.name, targetDist, agression, pull, push)

				if (targetDist > 0 && util.isEdgeOfRoom(creep.pos)) {
					// Don't linger on the edges
					targetDist -= 1;
				}
				// console.log(creep.name, agression, targetDist, enemyRange)

			}
			else {
				targetDist = 1;
				agression = 5;
			}

			if (agression >= 4 && !mem.easyFight && (enemyRange <= 7 || enemyRange >= 10) && (!creep.room.roomStrength || creep.room.roomStrength > 1.5)) {
				mem.easyFight = 1;
			}
			else {
				if (mem.easyFight && (creep.hits != creep.hitsMax || creep.room.dangerous || Math.random() < 0.1)) {
					delete mem.easyFight;
				}
			}

			mem.lastAgression = agression;

			// console.log(creep, targetDist, dangerousCreeps)

			if (targetDist > 3 && dangerousCreeps) {
				creep.room.mem.requestHelpAgainst = creep.room.mem.requestHelpAgainst || [];
				creep.room.mem.requestHelpAgainst[Game.time % 2] = creep.room.mem.requestHelpAgainst[Game.time % 2] || {};

				let rha = creep.room.mem.requestHelpAgainst[Game.time % 2];
				for (let dangerCreep of dangerousCreeps) {
					let range = (creep.pos.getRangeToPos(dangerCreep.pos) || 1)
					if (range <= (dangerCreep.hasBodypart(RANGED_ATTACK) ? 5 : 3)) {
						rha[dangerCreep.id] = (rha[dangerCreep.id] || 0) - agression / Math.sqrt(range);
					}
				}
			}
		}
		else if (mem.enemyPos && (mem.enemyPos.x <= 1 || mem.enemyPos.x >= 48 || mem.enemyPos.y <= 1 || mem.enemyPos.y >= 48)) {
			enemyPos = new RoomPosition(mem.enemyPos.x, mem.enemyPos.y, mem.enemyPos.roomName);
			enemyRange = creep.pos.getRangeTo(enemyPos);

			// Move to the enemy pos and reset to default in an unpredictable manner.
			if (Math.random() < 0.25) {
				delete mem.enemyPos;
			}

			agression = mem.lastAgression;
			if (agression > 4) {
				targetDist = 1;
			}
			else if (agression >= -1) {
				targetDist = 2;
			}
			else if (mem.lastAgression >= -3) {
				targetDist = 3;
			}
			else {
				targetDist = 4;
			}
			// targetDist = mem.lastAgression > 4 ? 1 : 3;
		}
		else if (mem.attackPower && creep.room.highway && creep.room.name == mem.targetRoom) {
			enemy = creep.room.powerBanks[0];

			if (enemy) {
				enemyPos = enemy.pos
			}
			enemyRange = creep.pos.getRangeTo(enemyPos);

			targetDist = 3;
			agression = 4;
		}
		else if (creep.killAllStructures) {
			enemy = creep.pos.findClosestByRange(FIND_HOSTILE_STRUCTURES, {
				filter: (structure) => {
					return structure.structureType != STRUCTURE_CONTROLLER &&
						  structure.structureType != STRUCTURE_KEEPER_LAIR;
				}
			})

			if (enemy) {
				enemyPos = enemy.pos
			}
			enemyRange = creep.pos.getRangeTo(enemyPos);

			targetDist = 1;
			agression = 4;
		}
		else if (util.isNearEdgeOfRoom(creep.pos, 1)) {
			let exits = Game.map.describeExits(creep.room.name)

			let areaFriends = []
			let areaHostile = []
			if (exits[LEFT] && Game.rooms[exits[LEFT]] && creep.pos.x == 1) {
				let pos = new RoomPosition(48, creep.pos.y, exits[LEFT])
				let range = 6;
				areaFriends = areaFriends.concat(pos.findInRange(Game.rooms[exits[LEFT]].getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true), range));
				areaHostile = areaHostile.concat(pos.findInRange(Game.rooms[exits[LEFT]].getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], false), range));
			}
			else if (exits[RIGHT] && Game.rooms[exits[RIGHT]] && creep.pos.x == 48) {
				let pos = new RoomPosition(1, creep.pos.y, exits[RIGHT])
				let range = 6;
				areaFriends = areaFriends.concat(pos.findInRange(Game.rooms[exits[RIGHT]].getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true), range));
				areaHostile = areaHostile.concat(pos.findInRange(Game.rooms[exits[RIGHT]].getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], false), range));
			}

			if (exits[TOP] && Game.rooms[exits[TOP]] && creep.pos.y == 1) {
				let pos = new RoomPosition(creep.pos.x, 48, exits[TOP])
				let range = 6;
				areaFriends = areaFriends.concat(pos.findInRange(Game.rooms[exits[TOP]].getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true), range));
				areaHostile = areaHostile.concat(pos.findInRange(Game.rooms[exits[TOP]].getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], false), range));
			}
			else if (exits[BOTTOM] && Game.rooms[exits[BOTTOM]] && creep.pos.y == 48) {
				let pos = new RoomPosition(creep.pos.x, 1, exits[BOTTOM])
				let range = 6;
				areaFriends = areaFriends.concat(pos.findInRange(Game.rooms[exits[BOTTOM]].getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true), range));
				areaHostile = areaHostile.concat(pos.findInRange(Game.rooms[exits[BOTTOM]].getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], false), range));
			}

			let stance = getCombatStance(creep, undefined, undefined, areaFriends, areaHostile, false, true, true);
			agression = stance.agression;

			// console.log(JSON.stringify(stance))

			let enemyCanRangedDamage = stance.eLong > 0;
			let enemyCanCloseDamage = stance.eClose > 0;


			if (agression >= 4 && !enemyCanCloseDamage) {
				targetDist = 0;
				push = true;
			}
			else if (agression >= 2 && !enemyCanCloseDamage) {
				targetDist = 1;
				push = true;
			}
			else if (agression >= 1 && !enemyCanCloseDamage) {
				targetDist = 2;
				push = true;
			}
			else if (agression >= 0) {
				targetDist = 2;
			}
			else if (agression >= -1) {
				targetDist = 2;
				pull = true;
			}
			// Don't go longer than 3 if the enemy can't long range.
			else if (agression >= -2 || !enemyCanRangedDamage) {
				targetDist = 3;
				pull = true && enemyCanRangedDamage;
			}
			else if (agression >= -3) {
				targetDist = 4;
				pull = true && enemyCanRangedDamage;
			}
			else if (agression >= -4) {
				targetDist = 5;
				pull = true && enemyCanRangedDamage;
			}
			else if (agression >= -5) {
				targetDist = 6;
				pull = true && enemyCanRangedDamage;
			}
			else {
				targetDist = 7;
				// pull = enemyCanMove;
			}


			mem.lastAgression = agression;

			// moveOptions = {"avoidEnemyRooms" : 1, "avoidHostiles": 1, "reusePath" : pathRefresh};
		}
		else {
			targetDist = 1;
			agression = 4;
		}

		// Skirmishing isn't what we want to do... so don't if we're a ramparter and scared
		if (creep.ramparter && (!enemyPos || agression < 2) && creep.room.bestRampartsRanged && creep.room.bestRampartsRanged.length && creep.ticksToLive > 20) {
			// console.log("RRR b")
			return this.runRangedRamparter(creep);
		}

		// console.log("c")



		var pathRefresh = undefined;
		// This will also trigger a repath when we move between the brackets :/
		if (dangerousCreeps.length > 0 && agression <= 3) {
			if (enemyRange <= 3) {
				pathRefresh = 2;
			}
			else if (enemyRange <= 5) {
				pathRefresh = 4;
			}
			else {
				pathRefresh = 6;
			}
		}


		let moveOptions;
		let combatMoveOptions;
		if (creep.room.dangerous == 2 || agression <= 0) {
			moveOptions = {"avoidEnemyRooms" : 1, "avoidHostiles" : agression <= 0 ? (-agression / 2 - 0.01) : undefined, "reusePath" : pathRefresh, "ignoreKeepers": !creep.mem.noAutoIgnoreKeepers && (creep.getNumOfBodyPart(HEAL) > 5) ? 1 : 0};
			// moveOptions.visMatrix = 1
		}
		else {
			moveOptions = {"avoidEnemyRooms" : 1, "ignoreKeepers": !creep.mem.noAutoIgnoreKeepers && (creep.getNumOfBodyPart(HEAL) > 5) ? 1 : 0};
			// moveOptions = {"avoidEnemyRooms" : 1, "ignoreKeepers": (creep.getNumOfBodyPart(HEAL) > 5) ? 1 : 0};
		}

		// if (enemy && enemy.room != creep.room) {
		// 	combatMoveOptions.avoidCombatEdges = 0 
		// 	combatMoveOptions.maxRooms = 2
		// 	combatMoveOptions.avoidEnemyRooms = !creep.room.isEnemyRoom() && !enemy.room.isEnemyRoom()
		// }



		if ((mem.blockingFormation || 0) > 0) {
			mem.blockingFormation -= 1;
			forceRetreat = true;
			moveOptions.avoidLocalCreeps = 1;
			if (mem.blockingFormation == 0) {
				delete mem.blockingFormation;
			}
		}


		// console.log(creep.name, forceRetreat || creep.retreat || mem.retreat, enemyPos || creep.forceMoveRooms)


		// Memory.stats.test = Memory.stats.test || {};
		// Memory.stats.test["cnt"] = (Memory.stats.test["cnt"] || 0) + 1;

		// let startCPU = Game.cpu.getUsed();
		if (forceRetreat || creep.retreat || mem.retreat || ((!enemy || !enemyPos) && (mem.retreatTimer || 0) > 0)) {
			delete mem.fleeTimer
			if (mem.retreatTimer) {
				mem.retreatTimer--;
			}
			if (mem.retreatTimer == 0) {
				delete mem.retreatTimer
			}
			moveOptions.heuristicWeight = 1.1;

			// Just move into the room. Probably just bounced away from a dangerous room
			if ((!enemy && (mem.retreatTimer || 0) > 0) && !creep.room.dangerous && creep.room.name != (mem.fallbackRoom || mem.sR) && util.isNearEdgeOfRoom(creep.pos, 2)) {
				creep.cachedMoveTo(new RoomPosition(25, 25, creep.room.name), 20, moveOptions);
				// console.log("R1", creep.name)
			}
			else if (mem.fallbackRoom) {
				// if (forceRetreat) {
				// 	creep.retreatToRoom(mem.fallbackRoom, moveOptions);
				// }
				// else {
					// console.log("R2", creep.name)
					creep.uncachedMoveTo(new RoomPosition(Memory.rooms[mem.fallbackRoom].fallbackX || 25,
												 		  Memory.rooms[mem.fallbackRoom].fallbackY || 25,
														  mem.fallbackRoom),
										(creep.room.name == mem.fallbackRoom || Memory.rooms[mem.fallbackRoom].fallbackX) ? 2 : 20,
										moveOptions);
				// }
			}
			else {
				// if (forceRetreat) {
				// 	creep.retreatToRoom(mem.sR, moveOptions);
				// }
				// else {
					// console.log("R3", creep.name)
					creep.uncachedMoveTo(new RoomPosition(Memory.rooms[mem.sR].fallbackX || 25,
												 		  Memory.rooms[mem.sR].fallbackY || 25,
														  mem.sR),
										2,
										moveOptions);
				// }
			}
		}

		else if (!enemyPos || creep.forceMoveRooms) {
			delete mem.fleeTimer
			if (creep.hits < creep.hitsMax * .75 && creep.hasActiveBodypart(HEAL)) {
				// console.log("R4", creep.name)

				if (creep.room.name == mem.targetRoom) {
					if (mem.fallbackRoom) {
						creep.uncachedMoveTo(new RoomPosition(Memory.rooms[mem.fallbackRoom].fallbackX || 25,
													 		  Memory.rooms[mem.fallbackRoom].fallbackY || 25,
															  mem.fallbackRoom),
											(creep.room.name == mem.fallbackRoom || Memory.rooms[mem.fallbackRoom].fallbackX) ? 2 : 20,
											moveOptions);
						// Memory.stats.test["c"] = (Memory.stats.test["c"] || 0) + Game.cpu.getUsed() - startCPU;
					}
					else {
						creep.uncachedMoveTo(new RoomPosition(Game.rooms[mem.sR].mem.fallbackX || 25,
													 		  Game.rooms[mem.sR].mem.fallbackY || 25,
															  mem.sR),
											(creep.room.name == mem.sR || Game.rooms[mem.sR].mem.fallbackX) ? 2 : 20,
											moveOptions);
						// Memory.stats.test["d"] = (Memory.stats.test["d"] || 0) + Game.cpu.getUsed() - startCPU;
					}
				}
				else {
					creep.uncachedMoveTo(new RoomPosition(25, 25, creep.room.name),
										 20,
										 moveOptions);
					// Memory.stats.test["e"] = (Memory.stats.test["e"] || 0) + Game.cpu.getUsed() - startCPU;
				}
			}
			else {
				// console.log("R5", creep.name)
				let targetPos //= new RoomPosition(25, 25, mem.targetRoom);
				let precise


				if (mem.pTgtRoom == mem.targetRoom && mem.pTX !== undefined && mem.pTY !== undefined) {
					targetPos = new RoomPosition(mem.pTX,
												 mem.pTY,
												 mem.targetRoom);
					precise = 1
					moveOptions.noRePathOnOptsChange = mem.path && mem.path.length;					
				}
				else {
					targetPos = new RoomPosition(25, 25, mem.targetRoom);
					precise = 0
				}

				// TODO: Hysteresis: go closer
				// if (creep.room.name != mem.targetRoom || creep.pos.getRangeTo(25, 25) > )

				if (creep.room.name == mem.sR) {
					if (mem.sR == mem.targetRoom && !creep.room.hasHostiles && !util.isNearEdgeOfRoom(creep.pos, 5)) {
						if (creep.hasActiveBodypart(HEAL) && creep.room.getMyInjuredCreeps().length) {
							return this.runHealer(creep)
						}
						delete creep.mem.path
						delete creep.mem.easyFight						
						mem.sleep = 1;
					}
					else {
						creep.cachedMoveTo(targetPos, creep.room.highway ? 20 : 18, moveOptions);
					}
					
					// Memory.stats.test["f"] = (Memory.stats.test["f"] || 0) + Game.cpu.getUsed() - startCPU;
				}
				else {
					if (creep.room.name != targetPos.roomName || !creep.pos.inRangeToPos(targetPos, creep.room.highway ? 20 : 18)) {
						creep.uncachedMoveTo(targetPos, precise ? 0 : (creep.room.highway ? 20 : 18), moveOptions);
					}
					// The world is boring. No enemies.
					else if (creep.hits == creep.hitsMax && !creep.room.hasHostiles && !creep.killAllStructures) {
						if (creep.hasActiveBodypart(HEAL) && creep.room.getMyInjuredCreeps().length) {
							return this.runHealer(creep)
						}

						delete creep.mem.path
						delete creep.mem.easyFight
						mem.sleep = 1;
					}
					// Memory.stats.test["g"] = (Memory.stats.test["g"] || 0) + Game.cpu.getUsed() - startCPU;
				}
			}
		}
		// Pull back
		else if (enemyPos && (enemyRange <= targetDist && (pull || enemyRange < targetDist))) {
			if (!creep.fatigue) {
				if (!(enemy && enemy.structureType && (enemy.structureType == STRUCTURE_WALL || enemy.structureType == STRUCTURE_CONTAINER))) {
					// console.log(creep, agression)
					// FFS, fleeTimer goes up, retreat timer goes down. Gah.
					if (agression < -4) {
						mem.retreatTimer = 5;
					}

					// Too close to start trying to path round them to home. Keep fleeing
					if (enemyRange <= targetDist - 1 && (mem.fleeTimer || 0) > 0) {
						mem.fleeTimer--;
					}

					// Flee is the low CPU option. We'll flee for a few ticks then retreat to room.
					if ((mem.fleeTimer || 0) < 5 + (10000 - Game.cpu.bucket) / 1000 || creep.room.name == mem.fallbackRoom || creep.room.name == mem.sR) {
						creep.room.visual.text(agression + "f", creep.pos.x, creep.pos.y, {color: "#8080ff"})
						creep.room.visual.text(targetDist, enemyPos.x, enemyPos.y, {color: "#8080ff"})						
						mem.fleeTimer = (mem.fleeTimer || 0) + (Math.random() < 0.8 ? 1 : 0);

						let fleeOptions = _.clone(moveOptions);
						fleeOptions.flee = true;
						// if (fleeOptions.avoidHostiles) {
						// 	fleeOptions.avoidHostiles *= 2
						// }
						// Setting this to 1 gets them stuck at room edges
						fleeOptions.reusePath = Math.min((moveOptions.reusePath || 2), 2 + Math.max(Math.floor((enemyRange - 6) / 2), 0))

						creep.uncachedMoveTo(enemyPos, (enemyRange <= targetDist && pull) ? targetDist + 5 : targetDist + 5, fleeOptions);

						if (agression < -2 && util.isEdgeOfRoom(creep.pos)) {
							mem.retreatTimer = 2 + Math.round(2 * Math.random());
						}

						// console.log(creep.p
					}
					else {
						creep.room.visual.text(agression + "r", creep.pos.x, creep.pos.y, {color: "#8080ff"})

						// TODO: Fix this
						moveOptions.reusePath = Math.min((moveOptions.reusePath || 2), 2 + Math.max(Math.floor((enemyRange - 6) / 2), 0))

						moveOptions.heuristicWeight = 1.1;
						if (enemyPos) {
							creep.retreatToRoom(mem.fallbackRoom || mem.sR, moveOptions);
							// Memory.stats.test["h"] = (Memory.stats.test["h"] || 0) + Game.cpu.getUsed() - startCPU;
							// We should retreat from the other chap rather than back to home. Maybe to go back home avoiding the other chaps.
							/*creep.uncachedMoveTo(new RoomPosition(Game.rooms[mem.fallbackRoom].mem.fallbackX || 25,
														 		  Game.rooms[mem.fallbackRoom].mem.fallbackY || 25,
																  mem.fallbackRoom),
												creep.room.name == mem.fallbackRoom ? 10 : 20,
												moveOptions);*/
						}
						else {
							creep.uncachedMoveTo(new RoomPosition(25, 25, mem.targetRoom),
												 18,
												 moveOptions);
							// Memory.stats.test["i"] = (Memory.stats.test["i"] || 0) + Game.cpu.getUsed() - startCPU;
						}
					}
				}
			}
		}
		else if (enemyPos && (!enemy || (enemyRange >= targetDist && (push || enemyRange > targetDist)))) {
			let formingUp = false;
			// We're <1.5x stronger across the room . Form up if we're not.
			if (creep.room.roomStrength && creep.room.roomStrength < 1.5 && enemyRange > 7) {
				// This will issue a move if we're forming up
				formingUp = formUp(creep, moveOptions)
			}

			if (!formingUp) {
				if (enemy) {
					enemy.currentTargetLockBodyCount = (enemy.currentTargetLockBodyCount || 0) + creep.body.length * (creep.hasBoost() ? 4 : 1);
					enemy.currentTargetLockCount = (enemy.currentTargetLockCount || 0) + 1;
				}

				if (!creep.fatigue) {
					delete mem.fleeTimer
					let movePos = enemyPos;
					let chasePos;

					let done = false;

					// if (creep.room.my) {

					// }
					if (!enemy && (enemyPos.x <= 1 || enemyPos.x >= 48 || enemyPos.y <= 1 || enemyPos.y >= 48)) {
						if (mem.enemyCreep && mem.lastAgression > 4 && creep.hits >= creep.hitsMax * .95 && Math.random() < 0.9) {
							let newPos = creep.room.findExitPosForCreepID(mem.enemyCreep)

							// Do we want to chase?
							if (newPos) {
								let isRoomValidForChase = function(roomName) {
									if (!Memory.rooms[roomName]) {
										return false;
									}
									if (creep.mem.combatRooms && Game.rooms[roomName] && creep.mem.combatRooms.includes(roomName)) {
										return true;
									}
									if (!creep.mem.roam && creep.mem.targetRoom && creep.room.name != creep.mem.targetRoom && roomName != creep.mem.targetRoom) {
										return false;
									}
									if ((Memory.rooms[roomName].kd || 0) < 0) {
										return false;
									}
									if (Memory.rooms[roomName].owner && Memory.rooms[roomName].owner != util.getMyName()) {
										return false;
									}

									return true
								}

								if (isRoomValidForChase(newPos.roomName)) {
									chasePos = newPos
									console.log("------------------------", creep, creep.pos, "wants to chase to", newPos)
								}
							}
						}
					}



					// Do a bit of interception
					if (!done && enemy && enemyRange > 4) {
						for (let hostileCreepInfo of (creep.room.mem.hostileCreeps || [])) {
							if (enemy.id === hostileCreepInfo.id) {
								// We have their last pos. Assume they'll travel in the same direction for a bit

								let extrapX = (enemyPos.x - hostileCreepInfo.meanPos.x) * enemyRange / 4;
								let extrapY = (enemyPos.y - hostileCreepInfo.meanPos.y) * enemyRange / 4;


								// left flank
								/*if (creep.combatMoveSkew == 1) {
									let dx = enemyPos.x - creep.pos.x;
									let dy = enemyPos.y - creep.pos.y;

									extrapY += dx * enemyRange / 3
									extrapX += dy * enemyRange / 3
								}
								// Right flank
								else if (creep.combatMoveSkew == 2) {
									let dx = enemyPos.x - creep.pos.x;
									let dy = enemyPos.y - creep.pos.y;

									extrapY -= dx * enemyRange / 3
									extrapX -= dy * enemyRange / 3
								}*/

								let backwards = enemy.currentTargetLockCount % 4 == 3;
								if (backwards) {
									extrapX = -extrapX / 4
									extrapY = -extrapY / 4
								}

								// Play with diagonals a bit
								// The idea is to keep the non-diagonal offset
								// Rather than dropping into the diagonal
								if (hostileCreepInfo.meanPos.x != enemyPos.x || hostileCreepInfo.meanPos.y != enemyPos.y) {
									if (!backwards) {									
										let absdx = Math.abs(enemyPos.x - creep.pos.x);
										let absdy = Math.abs(enemyPos.y - creep.pos.y);

										// Shift left or right
										if (absdx > absdy && enemyPos.x != creep.pos.x) {
											extrapX += enemyPos.x > creep.pos.x ? -1 : 1
										}
										// Shift up or down
										else if (absdy > absdx && enemyPos.y != creep.pos.y) {
											extrapY += enemyPos.y > creep.pos.y ? -1 : 1
										}
									}
								}

								let terrain = Game.map.getRoomTerrain(creep.room.name)

								// Can probably make this smarter. The extrapolated values have a half-life
								// of four ticks as I write this, and extrapX and extrapY shouldn't go over 4.
								let overflow = 0;
								let validPos = true;
								let extrapolatedX = enemyPos.x + Math.round(extrapX);
								let extrapolatedY = enemyPos.y + Math.round(extrapY);





								if (extrapolatedX < 1 || extrapolatedX > 48 || extrapolatedY < 1 || extrapolatedY > 48 || terrain.get(extrapolatedX, extrapolatedY)) {
									validPos = false;
								}
								else {
									let structs = creep.room.lookForAt(LOOK_STRUCTURES, extrapolatedX, extrapolatedY)
									for (let struct of structs) {
										if (struct.structureType == STRUCTURE_PORTAL || OBSTACLE_OBJECT_TYPES.includes(struct.structureType)) {
											validPos = false;
										}
									}
								}


								let maxInterceptRange = enemyRange / Math.max(1.5, (4 - (enemy.currentTargetLockCount - 1) * 0.25))

								while (!validPos || Math.max(Math.abs(extrapX), Math.abs(extrapY)) > maxInterceptRange) {
									extrapX /= 1.2
									extrapY /= 1.2

									extrapolatedX = enemyPos.x + Math.round(extrapX);
									extrapolatedY = enemyPos.y + Math.round(extrapY);

									if (extrapolatedX == enemyPos.x && extrapolatedY == enemyPos.y) {
										validPos = true;
										break;
									}

									validPos = true
									if (extrapolatedX < 1 || extrapolatedX > 48 || extrapolatedY < 1 || extrapolatedY > 48 || terrain.get(extrapolatedX, extrapolatedY)) {
										validPos = false;
									}
									else {
										let structs = creep.room.lookForAt(LOOK_STRUCTURES, extrapolatedX, extrapolatedY)
										for (let struct of structs) {
											if (struct.structureType == STRUCTURE_PORTAL || OBSTACLE_OBJECT_TYPES.includes(struct.structureType)) {
												validPos = false;
											}
										}
									}

									overflow++;
									if (overflow >= 100) {
										break;
									}
								}
								if (overflow >= 100) {
									console.log("---INTERCEPTION OVERFLOW---", creep.pos)
								}

								if (validPos) {
									movePos = new RoomPosition(extrapolatedX, extrapolatedY, enemy.pos.roomName);
								}
								break;
							}
						}
					}

					if (chasePos) {
						combatMoveOptions = {"avoidEnemyRooms" : 1, "avoidCombatEdges" : 0, "maxRooms": 2};
						creep.uncachedMoveTo(chasePos,
											 0,
											 combatMoveOptions);

					}
					else {				
						creep.room.visual.circle(movePos.x, movePos.y, {fill: "#8080ff"})

						if (mem.path && mem.path.length > 0 && mem.pTgtRoom == movePos.roomName) {
							if (enemyRange > 4 && movePos.getRangeTo(mem.pTX, mem.pTY) < enemyRange / 4 && Game.cpu.bucket != 10000 && !util.isEdgeOfRoom(movePos)) {
								movePos = new RoomPosition(mem.pTX, mem.pTY, mem.pTgtRoom);
							}
						}

						creep.room.visual.line(creep.pos.x, creep.pos.y, movePos.x, movePos.y, {color: "#8080ff"})
						creep.room.visual.text(targetDist, movePos.x, movePos.y, {color: "#8080ff"})
						creep.room.visual.text(agression + "a", creep.pos.x, creep.pos.y, {color: "#8080ff"})
						if (enemy) {
							creep.room.visual.text(enemy.pos.x, enemy.pos.y, {color: "#ff0000"})
						}
						// console.log(creep, creep.pos)

						if (creep.room.dangerous && dangerousCreeps.length > 1 && targetDist > 1) {
							combatMoveOptions = {"avoidEnemyRooms" : 1, "avoidCombatEdges" : 1, "avoidHostiles" : creep.exRamparter ? 8 : (agression <= 0 ? (-agression / 4) : undefined), "reusePath" : pathRefresh, "maxRooms": 1};
							// combatMoveOptions.visMatrix = 1
						}
						else {
							combatMoveOptions = {"avoidEnemyRooms" : 1, "avoidCombatEdges" : 1, "maxRooms": 1};
							if (enemy && enemy.room != creep.room) {
								combatMoveOptions.avoidCombatEdges = 0 
								combatMoveOptions.maxRooms = 2
								combatMoveOptions.avoidEnemyRooms = !creep.room.isEnemyRoom() && !enemy.room.isEnemyRoom()
							}

							// combatMoveOptions.visMatrix = 1
						}

						if (movePos.roomName != creep.room.name) {
							combatMoveOptions.avoidCombatEdges = 0;
							combatMoveOptions.maxRooms = Math.max(combatMoveOptions.maxRooms, 2);
						}

						// combatMoveOptions.visMatrix = 1

						if (util.isEdgeOfRoom(movePos) && !util.isEdgeOfRoom(creep.pos)) {
							creep.uncachedMoveTo(movePos,
												 3,
												 combatMoveOptions);
							// Memory.stats.test["j"] = (Memory.stats.test["j"] || 0) + Game.cpu.getUsed() - startCPU;
						}
						else {
							if (util.isEdgeOfRoom(creep.pos) && enemyPos.x == movePos.x && enemyPos.y == movePos.y && creep.pos.isNearToPos(enemyPos) && util.isNearEdgeOfRoom(enemyPos, 1)) {
								let candidates = []
								// This case is tricky - if we want to move in we want to move in, not be blocked by the enemy on the exit
								let terrain = Game.map.getRoomTerrain(movePos.roomName)
								for (let i = -1; i <= 1; i++) {
									let x = movePos.x + i
									if (x <= 0 || x >= 49) {
										continue
									}
									for (let j = -1; j <= 1; j++) {
										let y = movePos.y + j
										if (y <= 0 || y >= 49) {
											continue
										}

										// Don't move to the enemy. This is 50% here and 50% later, making 25% total
										if (x == enemyPos.x && y == enemyPos.y && Math.random() < 0.5) {
											continue
										}

										// Don't move to swamps or walls
										if ((terrain.get(x, y) & TERRAIN_MASK_WALL) || (terrain.get(x, y) & TERRAIN_MASK_SWAMP)) {
											continue
										}

										let p = new RoomPosition(x, y, movePos.roomName)		
										// Don't move to creeps
										if (Math.random() < 0.5 && p.lookFor(LOOK_CREEPS).length) {
											continue
										}
										candidates.push(p)
									}
								}

								if (candidates.length) {
									movePos = _.sample(candidates)
								}
							}

							creep.uncachedMoveTo(movePos, targetDist, combatMoveOptions);
							// Memory.stats.test["k"] = (Memory.stats.test["k"] || 0) + Game.cpu.getUsed() - startCPU;
						}
					}

				}
			}
		}
		else {
			delete mem.fleeTimer
		}

		// creep.say("b")


		skirmisherRangedAttackAndHeal(creep, enemy, enemyRange)
	},

	runHealer: function(creep) {
		// Get the boosts!
		if (creep.getBoosts()) {
			return;
		}
		if (creep.room.name == creep.mem.sR && !creep.room.dangerous && creep.ticksToLive < 50 && creep.hasBoost()) {
			let res = this.attempToUnBoost(creep)
			if (res) {
				return;
			}
		}

		if (creep.recycle) {
			return this.runRecycler(creep)
		}
		else if (creep.combatSnake) {
			return this.runPairedHealer(creep);
		}

		if (creep.mem.sleep && !creep.mem.retreat && !creep.room.keeperRoom) {
			if (creep.room.hasHostiles || creep.room.name != creep.mem.targetRoom || Math.random() < 0.05 || creep.hits != creep.hitsMax) {
				delete creep.mem.sleep
			}
			else {
				return;
			}
		}


		delete creep.mem.engaged

		var moveOptions = {"avoidEnemyRooms" : 1, "avoidHostiles": creep.room.dangerous == 2 ? 1 : undefined, "reusePath" : (creep.room.dangerous == 2 ? 5 : undefined)};
		var combatMoveOptions = {"avoidEnemyRooms" : 1, "avoidCombatEdges" : 1, "avoidHostiles": 1, "reusePath" : (creep.room.dangerous ? 5 : undefined), "maxRooms": 1};

		if (!creep.room.allowRoamingRamparters && creep.ramparter && (creep.room.name == creep.mem.targetRoom || creep.room.dangerous) && !creep.room.breached && creep.room.controller && creep.room.controller.my) {
			moveOptions.rampartFocus = 1;
			combatMoveOptions.rampartFocus = 1;
			moveOptions.maxRooms = 1;
		}



		var forceRetreat = false;
		if (moveOptions.avoidEnemyRooms && (creep.pos.roomName != creep.mem.targetRoom || (creep.room.controller && creep.room.controller.safeMode || 0) > 0) && creep.room.isEnemyRoom()) {
			if (creep.room.towers.length > 0 || (creep.room.controller && creep.room.controller.safeMode || 0) > 0) {
				forceRetreat = true;
			}
		}

		if (creep.mem.retreat && creep.room.name == creep.mem.sR && creep.room.hasHostiles) {
			creep.mem.retreat = 0;
		}

		let enemy;
		if (creep.room.hasHostiles) {			
			enemy = creep.pos.findClosestByRange(creep.room.getAllHostileCreepsAndPowerCreeps(), {
				filter: (object) => {
					if (creep.room.keeperRoom && object.owner.username == "Source Keeper" && creep.room.name != creep.mem.targetRoom) {
						return false;
					}
					return true;
				}
			});
		}

		var eligableHealTargets = creep.room.getMyInjuredCreeps();

		let lockedTarget = false;
		var bestHealTargetScore = Infinity;
		var bestHealTarget;
		var moveToTarget = undefined;
		for (var i in eligableHealTargets) {
			if (creep.room.name != creep.mem.targetRoom && !eligableHealTargets[i].hasDamagingBodypart(false)) {
				continue;
			}
			let score = eligableHealTargets[i].hits / eligableHealTargets[i].hitsMax;


			let range = creep.pos.getRangeTo(eligableHealTargets[i]);
			score += range / 50;

			if (range <= 1) {
				score /= 2;
			}

			if (score < bestHealTargetScore) {
				bestHealTargetScore = score;
				bestHealTarget = eligableHealTargets[i];
				moveToTarget = eligableHealTargets[i].pos;
			}
		}
		if (bestHealTarget) {
			creep.mem.lockedTarget = bestHealTarget.id;
		}

		if (eligableHealTargets.length == 0 && !moveToTarget && (creep.room.dangerous || creep.room.name == creep.mem.targetRoom)) {
			if (!creep.mem.lockedTarget) {
				let eligableTarget = creep.pos.findClosestByRange(FIND_MY_CREEPS, {
					filter: (friendCreep) => {
						return (!friendCreep.healerLocked && friendCreep != creep && friendCreep.hasDamagingBodypart(false) && !friendCreep.hasBodypart(HEAL));
					}
				});

				if (eligableTarget) {
					creep.mem.lockedTarget = eligableTarget.id;
				}
				else {
					eligableTarget = creep.pos.findClosestByRange(FIND_MY_CREEPS, {
						filter: (friendCreep) => {
							return (friendCreep != creep && friendCreep.hasDamagingBodypart(false) && !friendCreep.hasBodypart(HEAL));
						}
					});
					if (eligableTarget) {
						creep.mem.lockedTarget = eligableTarget.id;
					}
					else {
						eligableTarget = creep.pos.findClosestByRange(FIND_MY_CREEPS, {
							filter: (friendCreep) => {
								return (!friendCreep.healerLocked && friendCreep != creep && friendCreep.hasDamagingBodypart(false));
							}
						});
						if (eligableTarget) {
							creep.mem.lockedTarget = eligableTarget.id;
						}
						else {
							eligableTarget = creep.pos.findClosestByRange(FIND_MY_CREEPS, {
								filter: (friendCreep) => {
									return (friendCreep != creep && friendCreep.hasDamagingBodypart(false));
								}
							});
							if (eligableTarget) {
								creep.mem.lockedTarget = eligableTarget.id;
							}
						}
					}

				}


			}
			if (creep.mem.lockedTarget) {
				let target = Game.getObjectById(creep.mem.lockedTarget);
				if (target && target.room.name == creep.room.name) {
					moveToTarget = target;
					target.healerLocked = true;
					lockedTarget = true;
				}
				else {
					delete creep.mem.lockedTarget;
				}
			}
		}

		let agression = 0;
		if (enemy) {
			var enemyRange = creep.pos.getWorldRangeToPos(enemy.pos);

			let dangerousCreeps = creep.room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK], true);

			// Don't need to calculate this if we're far away, or tired
			if (dangerousCreeps.length > 0 && enemyRange <= 7 && creep.fatigue == 0) {
				var combatLocation
				if (creep.room.name == enemy.room.name) {
					combatLocation = new RoomPosition(Math.round((creep.pos.x + enemy.pos.x) / 2), Math.round((creep.pos.y + enemy.pos.y) / 2), creep.room.name)
				}
				else {
					// TODO: This isn't quite right
					combatLocation = creep.pos
				}

				let hostileHeals = combatLocation.findFirstInRange(creep.room.getAllHostileCreepsWithBodyParts([HEAL], true), 8);
				let friendlyHeals = combatLocation.findFirstInRange(creep.room.getAllFriendlyCreepsWithBodyParts([HEAL], true), 8);

				var areaFriends = combatLocation.findInRange(creep.room.getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true), 8); // Active only
				var areaHostile = combatLocation.findInRange(creep.room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], false), 8); // Assume they'll come back

				let exits;
				if (combatLocation.x < 6) {
					exits = Game.map.describeExits(creep.room.name);
					if (exits[LEFT] && Game.rooms[exits[LEFT]]) {
						let pos = new RoomPosition(48, combatLocation.y, exits[LEFT])
						let range = 6 - combatLocation.x;
						areaFriends = areaFriends.concat(pos.findInRange(Game.rooms[exits[LEFT]].getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true), range));
						areaHostile = areaHostile.concat(pos.findInRange(Game.rooms[exits[LEFT]].getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], !hostileHeals), range));
					}
				}
				else if (combatLocation.x > 49 - 6) {
					exits = Game.map.describeExits(creep.room.name);
					if (exits[RIGHT] && Game.rooms[exits[RIGHT]]) {
						let pos = new RoomPosition(1, combatLocation.y, exits[RIGHT])
						let range = 6 - (49 - combatLocation.x);
						areaFriends = areaFriends.concat(pos.findInRange(Game.rooms[exits[RIGHT]].getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true), range));
						areaHostile = areaHostile.concat(pos.findInRange(Game.rooms[exits[RIGHT]].getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], !hostileHeals), range));
					}
				}
				if (combatLocation.y < 6) {
					if (!exits) {
						exits = Game.map.describeExits(creep.room.name);
					}
					if (exits[TOP] && Game.rooms[exits[TOP]]) {
						let pos = new RoomPosition(combatLocation.x, 48, exits[TOP])
						let range = 6 - combatLocation.y;
						areaFriends = areaFriends.concat(pos.findInRange(Game.rooms[exits[TOP]].getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true), range));
						areaHostile = areaHostile.concat(pos.findInRange(Game.rooms[exits[TOP]].getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], !hostileHeals), range));
					}
				}
				else if (combatLocation.y > 49 - 6) {
					if (!exits) {
						exits = Game.map.describeExits(creep.room.name);
					}
					if (exits[BOTTOM] && Game.rooms[exits[BOTTOM]]) {
						let pos = new RoomPosition(combatLocation.x, 1, exits[BOTTOM])
						let range = 6 - (49 - combatLocation.y);
						areaFriends = areaFriends.concat(pos.findInRange(Game.rooms[exits[BOTTOM]].getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true), range));
						areaHostile = areaHostile.concat(pos.findInRange(Game.rooms[exits[BOTTOM]].getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], !hostileHeals), range));
					}
				}


				var myParts = creep.getBoostModifiedCombatParts(true);

				let stance = getCombatStance(creep, enemy, combatLocation, areaFriends, areaHostile, friendlyHeals, hostileHeals, false);
				agression = stance.agression;

				if (eligableHealTargets.length > 0) {
					agression += 2;
				}
			}
			else {
				agression = 1;
			}

			if (lockedTarget) {
				agression += 5;
			}
		}


		var pathRefresh = undefined;
		if (enemy) {
			if (enemyRange <= 3) {
				moveOptions.reusePath = 2;
				combatMoveOptions.reusePath = 2;
			}
			else if (enemyRange <= 5) {
				moveOptions.reusePath = 4;
				combatMoveOptions.reusePath = 4;
			}
			else {
				moveOptions.reusePath = 6;
				combatMoveOptions.reusePath = 6;
			}
		}


		if ((creep.mem.blockingFormation || 0) > 0) {
			creep.mem.blockingFormation -= 1;
			forceRetreat = true;
			moveOptions.avoidLocalCreeps = 1;
			if (creep.mem.blockingFormation == 0) {
				delete creep.mem.blockingFormation;
			}
		}

		// if ((forceRetreat || creep.retreat || creep.mem.retreat) && (!creep.room.dangerous || creep.room.name != creep.mem.fallbackRoom || (!enemy && (creep.mem.retreatTimer || 0) > 0))) {
		if (forceRetreat || creep.retreat || creep.mem.retreat || (!enemy && (creep.mem.retreatTimer || 0) > 0)) {
			delete creep.mem.fleeTimer;
			moveOptions.heuristicWeight = 1.1;

			if ((!enemy && (creep.mem.retreatTimer || 0) > 0) && !creep.room.dangerous && creep.room.name != (creep.mem.fallbackRoom || creep.mem.sR) && util.isNearEdgeOfRoom(creep.pos, 2)) {
				creep.cachedMoveTo(new RoomPosition(25, 25, creep.room.name), 20, moveOptions);
				creep.mem.retreatTimer--
			}
			else if (creep.mem.fallbackRoom) {
				// creep.retreatToRoom(creep.mem.fallbackRoom, moveOptions);
				creep.uncachedMoveTo(new RoomPosition(Memory.rooms[creep.mem.fallbackRoom].fallbackX || 25,
											 		  Memory.rooms[creep.mem.fallbackRoom].fallbackY || 25,
													  creep.mem.fallbackRoom),
									(creep.room.name == creep.mem.fallbackRoom || Memory.rooms[creep.mem.fallbackRoom].fallbackX) ? 2 : 20,
									moveOptions);
			}
			else {
				// creep.retreatToRoom(creep.mem.sR, moveOptions);
				creep.uncachedMoveTo(new RoomPosition(Memory.rooms[creep.mem.sR].fallbackX || 25,
											 		  Memory.rooms[creep.mem.sR].fallbackY || 25,
													  creep.mem.sR),
									2,
									moveOptions);
			}
		}
		else if (agression < -1 && (!creep.room.dangerous || creep.room.name != creep.mem.fallbackRoom) && (areaHostile || []).length > 0) {
			// Flee is the low CPU option. We'll flee for a few ticks then retreat to room.
			if (((creep.mem.fleeTimer || 0) < 3 || creep.room.name == creep.mem.fallbackRoom || creep.room.name == creep.mem.sR) && areaHostile && areaHostile.length > 0) {
				// Don't be predicatable
				creep.mem.fleeTimer = (creep.mem.fleeTimer || 0) + (Math.random() < 0.8 ? 1 : 0);

				let fleeOptions = _.clone(moveOptions);
				fleeOptions.flee = true;

				creep.uncachedMoveTo(creep.pos.findClosestByRange(areaHostile), 5, fleeOptions);
			}
			else {
				moveOptions.heuristicWeight = 1.1;
				if (creep.mem.fallbackRoom) {
					creep.retreatToRoom(creep.mem.fallbackRoom, moveOptions);
				}
				else {
					creep.retreatToRoom(creep.mem.sR, moveOptions);
				}
			}
		}
		else if (moveToTarget) {
			delete creep.mem.fleeTimer;
			if (lockedTarget) {
				if (moveToTarget.room.name == creep.room.name && creep.pos.isNearToPos(moveToTarget.pos) && !util.isEdgeOfRoom(creep.pos)) {
					if (moveToTarget.movedThisTick) {
						creep.move(creep.pos.getDirectionTo(moveToTarget.pos));
					}
					else {
						creep.mem.sleep = 1
						delete creep.mem.easyFight
					}
				}
				// Don't sit near room edges with locked targets.
				else if (((!creep.mem.path || creep.mem.path.length < 2) && util.isNearEdgeOfRoom(creep.pos, 1)) || util.isEdgeOfRoom(creep.pos)) {
					creep.uncachedMoveTo(new RoomPosition(25, 25, moveToTarget.room.name), 22, moveOptions);
				}
				else {
					let moveRange = 0;
					/*if ((creep.mem.mS || 0) > 0) {
						moveRange = 1;
					}
					else */if (util.isEdgeOfRoom(moveToTarget)) {
						moveRange = 1;
					}

					if (!creep.pos.isNearToRoomObject(moveToTarget) || moveToTarget.movedThisTick || moveRange) {
						creep.uncachedMoveTo(moveToTarget, moveRange, combatMoveOptions);
					}
				}
			}
			else {
				let moveRange = 0;
				/*if ((creep.mem.mS || 0) > 0) {
					moveRange = 1;
				}
				else*/ if (util.isEdgeOfRoom(moveToTarget)) {
					moveRange = 1;
				}

				creep.uncachedMoveTo(moveToTarget, moveRange, combatMoveOptions);
			}
		}
		else if (creep.mem.targetRoom) {
			delete creep.mem.fleeTimer;
			let targetPos = new RoomPosition(25, 25, creep.mem.targetRoom);

			if (creep.room.name == creep.mem.sR) {
				creep.cachedMoveTo(targetPos, 18, moveOptions);
			}
			else {
				creep.uncachedMoveTo(targetPos, 18, moveOptions);
			}
		}	

		skirmisherRangedAttackAndHeal(creep);

/*
		let rangedHeal = 0

		if (!creep.healOrdersGiven) {			
			if (eligableHealTargets.length) {
				if (creep.pos.isNearTo(bestHealTarget)) {
					creep.heal(bestHealTarget);
				}
				else {
					var target = creep.pos.findClosestByRange(eligableHealTargets);
					if(creep.pos.isNearTo(target)) {
						creep.heal(target);
					}
					else {
						creep.rangedHeal(target);
						rangedHeal = 1
					}
				}
			}
			else if (creep.room.dangerous) {
				creep.heal(creep)
			}
		}

		if (!rangedHeal && !creep.hasDoneRangedHeal && creep.hasActiveBodypart(RANGED_ATTACK)) {
			assaulterRangedAttack(creep)
		}*/
	},


	runDefender: function(creep) {
		return this.runTank(creep)
		if (creep.spawning) return;

		var moveOptions = {"avoidEnemyRooms" : 1, "avoidHostiles" : 1, "reusePath" : (creep.room.dangerous ? 5 : undefined)};
		var combatMoveOptions = {"avoidEnemyRooms" : 1, "avoidCombatEdges" : 1, "avoidHostiles" : 1, "reusePath" : (creep.room.dangerous ? 5 : undefined)};


		var enemies = creep.room.find2(FIND_HOSTILE_CREEPS, {
			filter: function(object) {
				return object.owner.username != "Source Keeper";
			}
		});


		var closestEnemy = creep.pos.findClosestByRange(enemies);

		// WTF?
		if (!creep.mem.targetRoom) {
			// Seen this before. Not sure what caused it.
			console.log("No target room for defender... recycling")
			changeCreepRole(creep, "recycler")
			return this.runRecycler(creep)
		}

		delete creep.mem.engaged


		if (creep.hits < 2 * creep.hitsMax / 3 || creep.mem.retreat) {
			if (creep.hasActiveBodypart(HEAL)) {
				creep.mem.healing = 1;
			}
			if (closestEnemy) {
				if (!creep.hasActiveBodypart(ATTACK) || creep.attack(closestEnemy) == ERR_NOT_IN_RANGE) {
					creep.heal(creep)
				};
				if (creep.pos.getRangeTo(closestEnemy) <= 3) {
					var massDamage = 0;
					for (var i in enemies) {
						if (creep.pos.getRangeTo(enemies[i]) == 3) massDamage += 1;
						else if (creep.pos.getRangeTo(enemies[i]) == 2) massDamage += 4;
						else if (creep.pos.getRangeTo(enemies[i]) == 1) massDamage += 10;
					}
					//
					if(massDamage >= 10) {
						creep.rangedMassAttack();
					}
					else {
						creep.rangedAttack(closestEnemy);
					}
				}
			}
			else {
				creep.heal(creep)
			}
			creep.uncachedMoveTo(new RoomPosition(Memory.rooms[creep.mem.fallbackRoom].fallbackX || 25,
										 		  Memory.rooms[creep.mem.fallbackRoom].fallbackY || 25,
												  creep.mem.fallbackRoom),
								(creep.room.name == creep.mem.fallbackRoom || Memory.rooms[creep.mem.fallbackRoom].fallbackX) ? 2 : 20,
								moveOptions);
		}
		else {
			if (creep.hasActiveBodypart(HEAL) && creep.mem.healing && creep.hits < creep.hitsMax *.95) {
				creep.heal(creep)
				if (closestEnemy) {
					if (creep.pos.getRangeTo(closestEnemy) <= 3) {
						var massDamage = 0;
						for (var i in enemies) {
							if (creep.pos.getRangeTo(enemies[i]) == 3) massDamage += 1;
							else if (creep.pos.getRangeTo(enemies[i]) == 2) massDamage += 4;
							else if (creep.pos.getRangeTo(enemies[i]) == 1) massDamage += 10;
						}
						//
						if(massDamage >= 10) {
							creep.rangedMassAttack();
						}
						else {
							creep.rangedAttack(closestEnemy);
						}
					}
				}
			}
			else {
				creep.mem.healing = false;
				if (creep.mem.targetRoom == creep.room.name && closestEnemy != undefined) {
					if (!creep.hasActiveBodypart(ATTACK) || creep.attack(closestEnemy) == ERR_NOT_IN_RANGE) {
						creep.heal(creep)
					};
					if (creep.pos.getRangeTo(closestEnemy) <= 3) {
						var massDamage = 0;
						for (var i in enemies) {
							if (creep.pos.getRangeTo(enemies[i]) == 3) massDamage += 1;
							else if (creep.pos.getRangeTo(enemies[i]) == 2) massDamage += 4;
							else if (creep.pos.getRangeTo(enemies[i]) == 1) massDamage += 10;
						}
						//
						if(massDamage >= 10) {
							creep.rangedMassAttack();
						}
						else {
							creep.rangedAttack(closestEnemy);
						}
					}

					if (creep.mem.retreat) {
						creep.uncachedMoveTo(new RoomPosition(Game.rooms[creep.mem.fallbackRoom].mem.fallbackX || 25,
													  Game.rooms[creep.mem.fallbackRoom].mem.fallbackY || 25,
													  creep.mem.fallbackRoom));
					}
					else {
						creep.moveTo(closestEnemy, {reusePath: 0,
							costCallback: function(roomName, costMatrix) {
								for (var i = 0; i < 50; i++) {
									costMatrix.set(i, 0, 255);
									costMatrix.set(i, 49, 255);
									costMatrix.set(0, i, 255);
									costMatrix.set(49, i, 255);
								}
							}
						});
					}

				}
				else if (creep.mem.targetRoom != creep.room.name) {
					if (creep.hits < creep.hitsMax) {
						creep.heal(creep)
					}
					if (creep.mem.retreat) {
						creep.uncachedMoveTo(new RoomPosition(Game.rooms[creep.mem.fallbackRoom].mem.fallbackX || 25,
													  Game.rooms[creep.mem.fallbackRoom].mem.fallbackY || 25,
													  creep.mem.fallbackRoom),
											2,
											moveOptions);
					}
					else {
						creep.uncachedMoveTo(new RoomPosition(25, 25, creep.mem.targetRoom), 20, moveOptions);
					}
				}
				else if (creep.mem.retreat) {
					creep.uncachedMoveTo(new RoomPosition(Game.rooms[creep.mem.fallbackRoom].mem.fallbackX || 25,
														  Game.rooms[creep.mem.fallbackRoom].mem.fallbackY || 25,
														  creep.mem.fallbackRoom), 2, moveOptions);
				}

			}

		}
	},

	runSeasonRaider: function(creep) {
		if (creep.room.name != creep.mem.targetRoom || util.isEdgeOfRoom(creep.pos)) {
			return this.runRanged(creep)
		}

		let hostileCreeps = creep.room.find(FIND_HOSTILE_CREEPS)
	

		if (hostileCreeps.length && creep.mem.role == "raiderRoaming") {
			return this.runRanged(creep)
		}
		else if (creep.room.dangerous && creep.mem.role == "raiderHauler") {
			return this.runRanged(creep)
		}
		else if (hostileCreeps.length && creep.mem.role == "raiderClose") {
			let collector = creep.pos.findClosestByRange(FIND_SCORE_COLLECTORS)

			let collectorDist = creep.pos.getRangeToPos(collector.pos)

			if (creep.pos.findFirstInRange(hostileCreeps, collectorDist > 9 ? 3 : 5)) {
				return this.runRanged(creep)	
			}

			if (hostileCreeps.length) {
				skirmisherRangedAttackAndHeal(creep)

				let closeHauler = false
				if (collectorDist <= 5) {					
					for (let friend of creep.pos.findInRange(FIND_MY_CREEPS, 1)) {
						if (friend.getNumOfBodyPart(CARRY) > 1) {
							closeHauler = true
							break
						}
					}
				}

				if (closeHauler) {
					creep.uncachedMoveTo(collector, 6, {flee: 1, maxRooms: 1, avoidCombatEdges: 1})
				}
				else {
					creep.uncachedMoveTo(collector, 5, {maxRooms: 1, avoidCombatEdges: 1})	
				}
				// if (creep.pos.inRangeToPos(collector, 6)) {
				// 	delete creep.mem.p
				// }
				return
			}
		}

		// if (hostileCreeps.length) {
		// }

		// ... hauler??
		let moved = 0
		if (creep.store[RESOURCE_SCORE]) {
			let collector = creep.pos.findClosestByRange(FIND_SCORE_COLLECTORS)
			if (!creep.pos.isNearToPos(collector.pos)) {
				creep.uncachedMoveTo(collector, 1)
				moved = 1
			}
			else {
				creep.transfer(collector, RESOURCE_SCORE)
			}
		}
		else if (Math.random() < 0.1 || creep.mem.fTgt) {
			if (creep.mem.fTgt && Game.getObjectById(creep.mem.fTgt) && !creep.pos.isNearToPos(Game.getObjectById(creep.mem.fTgt).pos)) {
				creep.uncachedMoveTo(Game.getObjectById(creep.mem.fTgt), 1)
				moved = 1
			}
			else {
				delete creep.mem.fTgt	
				let dropped = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
					filter: function(resource) {
						return resource.resourceType == RESOURCE_SCORE;
					}
				});

				if (dropped) {
					if (!creep.pos.isNearToPos(dropped.pos)) {
						creep.uncachedMoveTo(dropped.pos, 1)
						creep.mem.fTgt = dropped.id
						moved = 1
					}
					else {
						moved = 1
						creep.pickup(dropped)
					}
				}
				else {
					let genericStore = creep.pos.findClosestByRange(FIND_TOMBSTONES, {
						filter: function(genericStore) {
							return genericStore.store[RESOURCE_SCORE];
						}
					});

					if (!genericStore) {
						genericStore = creep.pos.findClosestByRange(FIND_SCORE_CONTAINERS, {
							filter: function(genericStore) {
								return genericStore.store[RESOURCE_SCORE];
							}
						});					
					}
					// if (!genericStore) {
					// 	genericStore = creep.pos.findClosestByRange(creep.room.containers, {
					// 		filter: function(genericStore) {
					// 			return genericStore.store[RESOURCE_SCORE];
					// 		}
					// 	});					
					// }

					if (genericStore) {
						if (!creep.pos.isNearToPos(genericStore.pos)) {
							creep.mem.fTgt = genericStore.id
							creep.uncachedMoveTo(genericStore.pos, 1)
							moved = 1
						}
						else {
							moved = 1
							creep.withdraw(genericStore, RESOURCE_SCORE)
						}
					}
				}
			}
		}
		if (!moved) {
			if (hostileCreeps.length && creep.mem.role == "raiderHauler") {
				return this.runRanged(creep)
			}
			let collector = creep.room.find(FIND_SCORE_COLLECTORS)[0]
			let range = creep.pos.getRangeToPos(collector.pos)
			if (range <= 6) {
				creep.uncachedMoveTo(collector, 7, {flee: 1, maxRooms: 1, avoidCombatEdges: 1})
			}
			else if (range > 7) {
				creep.uncachedMoveTo(collector, 7, {maxRooms: 1, avoidCombatEdges: 1})
			}
			else {
				delete creep.mem.path
			}
		}
		if (creep.room.dangerous || creep.hits != creep.hitsMax) {
			skirmisherRangedAttackAndHeal(creep)
		}
	},


	runRangedRamparter: function(creep) {
		// Room is fooked, only run to ramparts if we're hurt
		if ((creep.room.breached && creep.room.effectiveLevel < 3) && creep.hits > creep.hitsMax * 0.8) {
			creep.ramparter = false;
			creep.exRamparter = true;
			return this.runRanged(creep)
		}
		// if (creep.room.allowRoamingRamparters) {
		// 	creep.ramparter = false;
		// 	return this.runRanged(creep)
		// }

		delete creep.mem.engaged

		// var moveOptions = {"avoidEnemyRooms" : 1, "rampartFocus" : true};
		var combatMoveOptions = {"avoidEnemyRooms" : 1,
								 "avoidCombatEdges" : 1,
								 "avoidAllCreeps": 1,
								 "avoidHostiles": creep.hasBodyPart(HEAL) ? 0.5 : 1,
								 "reusePath": 3,
								 "rampartFocus" : 1,
								 "maxRooms": 1,
								 "maxOptsMod": 2};


		var bestRamparts = creep.room.bestRampartsRanged || [];

		let hostiles = creep.room.getAllHostileCreepsAndPowerCreeps()

		// Don't move unsafely if we have a target.
		let currentTarget = creep.pos.findFirstInRange(creep.room.getAllHostileCreepsAndPowerCreeps(), 3);

		let noMoving = 0;
		let isOnRampart = false;
		let currentStructures = creep.pos.lookFor(LOOK_STRUCTURES);

		for (let currentStructure of currentStructures) {
			if (currentStructure.structureType == STRUCTURE_RAMPART && currentStructure.hits > 10000) {
				isOnRampart = true;
				break;
			}
		}

		// let outside = 0
		if (!isOnRampart) {
			let segementData = segments.loadSegmentData(50 + creep.room.mem.ID % 45);

			if (segementData) {
				let floodedDesign = segementData[creep.room.name].floodedDesign;

				if (floodedDesign) {
					// Outside. Get inside.
					if (parseInt(floodedDesign[creep.pos.x][creep.pos.y]) === 0) {
						// outside = 1
						combatMoveOptions.reusePath = creep.pos.findFirstInRange(creep.room.getAllHostileCreepsAndPowerCreeps(), 6) ? 1 : 2;
						combatMoveOptions.avoidHostiles = 10;
						combatMoveOptions.avoidAllCreeps = 0;
						combatMoveOptions.maxOptsMod = 5;
						delete creep.mem.pIncompleteTick
						creep.say("Outside")
					}
				}
			}
		}

		let dangerClose;
		if (!currentTarget) {
			dangerClose = creep.pos.findFirstInRange(hostiles, 7);			
		}

		if (currentTarget || dangerClose) {
			if (isOnRampart) {
				combatMoveOptions.rampartForced = 1;
				combatMoveOptions.creepsBlockMovement = 1;
			}

			if (Game.cpu.bucket < 1000 && Math.random() < 0.5) {
				noMoving = 1;
			}
		}

		if (bestRamparts.length > 0) {
			// Best is relative. /
			// Chop 1% off it's score for every tile it is away from me



			let bestRampart
			// TODO: I think something may be broken here. All my creeps went dumb when I enabled it
			// console.log(creep, "finding best rampart")g

			if ((Game.cpu.bucket > 2000 && Math.random() < .75) || Math.random() < 0.25 || (!Game.getObjectById(creep.mem.bestRampartId) || Game.getObjectById(creep.mem.bestRampartId).hits < 10000)) {				
				// The later we get on the list, the less they want to walk
				let rangePow = 0.5 + 0.5 / ((creep.room.rangedRampartersAssigned || 0) + 1)

				let bestScore = 0
				let pressurePoints = Memory.roomPressurePoints[creep.room.name] || {}

				if (currentTarget) {
					for (let testRampart of bestRamparts) {
						// Nothing is better
						if (testRampart.rangedDamage < bestScore) {
							break
						}
						let score = testRampart.rangedDamage * (1 - Math.pow(0.02 * creep.pos.getRangeToPos(testRampart.pos), rangePow))

						if (score > bestScore) {
							bestScore = score;
							bestRampart = testRampart
							// console.log(score, bestRampart)
						}
					}
				}
				else {					
					for (let testRampart of bestRamparts) {
						// Nothing is better
						if (testRampart.rangedDamage * 4 < bestScore) {
							break
						}
						let score = testRampart.rangedDamage * (1 - Math.pow(0.02 * creep.pos.getRangeToPos(testRampart.pos), rangePow))

						// Defend the pressure points
						if (pressurePoints[testRampart.id]) {
							/*if (testRampart.isInRange3OfEnemy === undefined) {
								testRampart.isInRange3OfEnemy = testRampart.pos.findFirstInRange(FIND_HOSTILE_CREEPS, 3) ? 1 : 0
							}
							// If the rampart is close to the enemy then prefer ones with higher scores
							if (!testRampart.isInRange3OfEnemy) {							
								// 1-4x
								score *= 1 + Math.max(0, Math.min(3, pressurePoints[testRampart.id].d / 0.5e6))
							}*/
							// 1-4x
							score *= 1 + Math.max(0, Math.min(3, pressurePoints[testRampart.id].d / 0.5e6))
						}

						// Don't like this as it doesn't distinguish main ramparts from "backups"
						/*if (testRampart.hits < 2e6) {
							// 1-2x
							score *= 2 - testRampart.hits / 2e6
						}*/

						if (score > bestScore) {
							bestScore = score;
							bestRampart = testRampart
							// console.log(score, bestRampart)
						}
					}
				}
			}
			else {
				bestRampart = Game.getObjectById(creep.mem.bestRampartId)
			}

			creep.mem.bestRampartId = bestRampart.id;

			creep.room.rangedRampartersAssigned = (creep.room.rangedRampartersAssigned || 0) + 1

			// console.log(bestRampart, bestRamparts[0], bestRamparts[0].rangedDamage, creep.pos.getRangeToPos(bestRamparts[0].pos))


			var targetRampart = bestRampart;
			// var targetRampart = bestRamparts[0];

			// if (creep.pos.getRangeTo(targetRampart) < 8) {
				_.pull(creep.room.bestRampartsRanged, targetRampart)
			// }
			// Attackers have right of way.
			if (creep.nudged && creep.fatigue == 0 && Game.creeps[creep.nudged] && Game.creeps[creep.nudged].hasBodypart(ATTACK)) {
				// This will let nudging logic take over
				delete creep.mem.path
			}
			else if (!noMoving) {			
				creep.uncachedMoveTo(targetRampart, 0, combatMoveOptions);
			}
			else {
				moveResolver.static(creep)
			}

			creep.room.visual.line(creep.pos.x, creep.pos.y, targetRampart.pos.x, targetRampart.pos.y, {color: "#ffff00"})

		}
		else {
			creep.ramparter = false;
			creep.exRamparter = true;
			return this.runRanged(creep)
		}

		// creep.say("a")


		skirmisherRangedAttackAndHeal(creep, currentTarget, currentTarget ? creep.pos.getRangeToPos(currentTarget.pos) : 4)

		/*var targets = currentTarget ? creep.pos.findInRange(creep.room.getAllHostileCreepsAndPowerCreeps(), 3) : [];
		var massDamage = 0;
		for (var i in targets) {
			if (creep.pos.getRangeTo(targets[i]) == 3) {
				massDamage += 1;
			}
			else if (creep.pos.getRangeTo(targets[i]) == 2) {
				massDamage += 4;
			}
			else if (creep.pos.getRangeTo(targets[i]) == 1) {
				massDamage += 10;
				break;
			}
			if (massDamage >= 10) {
				break;
			}
		}

		if (massDamage >= 10) {
			creep.rangedMassAttack();
		}
		else {
			creep.rangedAttack(creep.pos.findClosestByRange(targets));
		}

		if (!creep.healOrdersGiven) {			
			if (creep.hasActiveBodypart(HEAL)) {
				if (creep.hits < creep.hitsMax) {
					creep.heal(creep)
				}
				else {
					let targets = creep.pos.findInRange(FIND_MY_CREEPS, 1, {filter: (otherCreep) => {return  (otherCreep.hits != otherCreep.hitsMax) }});

					if (targets.length) {
						creep.heal(_.sample(targets))
					}
					else if (!creep.room.dangerous) {
						targets = creep.pos.findInRange(FIND_MY_CREEPS, 3, {filter: (otherCreep) => {return  (otherCreep.hits != otherCreep.hitsMax) }});
						if (targets.length) {
							creep.rangedHeal(_.sample(targets))
						}
					}
				}
			}
		}*/
	},

	runRangedAssaulter: function(creep) {
		// let profile = Math.random() < 0.01
		// let startCPU = Game.cpu.getUsed()
		// let cpuHash = creep.mem.role + (creep.assaulter ? "ass" : "") + (creep.ramparter ? "ramp" : "") + (creep.moon ? "moon" : "") + (creep.renew ? "renew" : "");
			
		if (creep.renew && !creep.ramparter) {
			return this.runRenewer(creep, true);
		}

		// Get the boosts!
		if (creep.getBoosts()) {
			return;
		}
		if (creep.room.name == creep.mem.sR && !creep.room.dangerous && creep.ticksToLive < 50 && creep.hasBoost()) {
			let res = this.attempToUnBoost(creep)
			if (res) {
				return;
			}
		}

		delete creep.mem.engaged
		// Memory.stats.creepCPUs[cpuHash + "a"] = (Memory.stats.creepCPUs[cpuHash + "a"] || 0) + Game.cpu.getUsed() - startCPU
		// startCPU = Game.cpu.getUsed()

		// Memory.stats.creepCPUs[cpuHash + "b"] = (Memory.stats.creepCPUs[cpuHash + "b"] || 0) + Game.cpu.getUsed() - startCPU
		// startCPU = Game.cpu.getUsed()


		// if (profile) {
		// 	console.log("b", Game.cpu.getUsed() - startCPU, creep.healOrdersGiven)
		// }


		if (!creep.assaulter && !creep.combatSnake) {
			console.log("Assaulter not assaulter", creep)
			if (creep.getActiveBodyparts(RANGED_ATTACK) >= 5) {
				return this.runRanged(creep);
			}
			else if (creep.hasBodypart(HEAL)) {
				return this.runHealer(creep);
			}
		}



		let ret;
		let numHealsBase;
		let numHeals;
		let mostLostHits;
		let mostLostHitsCreep;
		let totalLostHits;
		if (!creep.healOrdersGiven || !creep.moveOrdersGiven) {
		 	ret = roomCombat.calcGroupHealStatus(creep.mem.formationCreeps);
			numHealsBase = ret.numHealsBase;
			numHeals = ret.numHeals;
			mostLostHits = ret.mostLostHits;
			mostLostHitsCreep = ret.mostLostHitsCreep;
			totalLostHits = ret.totalLostHits;
		}

		// console.log(creep, creep.mem.retreat, creep.moveOrdersGiven, creep.mem.retreatTimer)
		// First one to hit this decides on move orders.
		if (!creep.moveOrdersGiven && !creep.mem.retreat && !creep.mem.retreatTimer && !creep.powerCreepHealer) {
			// if (profile) {
			// 	console.log("formationMovement", creep.moveOrdersGiven)
			// }

			// console.log("formationMovement")
			formationAI.formationMovement(creep, mostLostHits, mostLostHitsCreep, totalLostHits, numHeals, numHealsBase, ret.numHealsActive);
		}
		else if (creep.mem.retreat || (creep.mem.retreatTimer || 0) > 0) {
			var moveOptions = {"avoidEnemyRooms" : 1, "avoidHostiles": 1};

			if (creep.mem.setupPos && creep.mem.setupPos.roomName != creep.room.name && creep.room.isEnemyRoom() && !intelAI.getEnemyRoomSet().has(creep.mem.setupPos.roomName)) {
				// if (profile) {
				// 	console.log("Move setup", creep.moveOrdersGiven)
				// }

				creep.uncachedMoveTo(creep.mem.setupPos, 0, moveOptions);
			}
			else {
				// if (profile) {
				// 	console.log("Move fallback", creep.moveOrdersGiven)
				// }

				let fallbackRoom = creep.mem.fallbackRoom || creep.mem.sR;
				// We should avoid baddies here.
				creep.uncachedMoveTo(new RoomPosition(Memory.rooms[fallbackRoom].fallbackX || 25,
											 		  Memory.rooms[fallbackRoom].fallbackY || 25,
													  fallbackRoom),
									(creep.room.name == fallbackRoom || Memory.rooms[fallbackRoom].fallbackX) ? 2 : 20,
									moveOptions);
			}

			if (creep.mem.retreatTimer) {
				creep.mem.retreatTimer -= 1;
			}
		}
		// Memory.stats.creepCPUs[cpuHash + "c"] = (Memory.stats.creepCPUs[cpuHash + "c"] || 0) + Game.cpu.getUsed() - startCPU
		// startCPU = Game.cpu.getUsed()

		// if (profile) {
		// 	console.log("c", Game.cpu.getUsed() - startCPU)
		// }

		// Orient
		if (creep.mem.directionalFormation && !creep.assaultSnake && !creep.powerCreepHealer && !creep.combatSnake) {
			let zeroName;
			let zeroCreep;

			for (let creepName of creep.mem.formationCreeps) {
				if (Game.creeps[creepName] || Game.powerCreeps[zeroName]) {
					zeroName = creepName;
					zeroCreep = Game.creeps[zeroName] || Game.powerCreeps[zeroName];
					break
				}
			}



			formationAI.formation2x2CheckBlockedReorientV2(zeroCreep);
		}
		// Memory.stats.creepCPUs[cpuHash + "d"] = (Memory.stats.creepCPUs[cpuHash + "d"] || 0) + Game.cpu.getUsed() - startCPU
		// startCPU = Game.cpu.getUsed()

		// if (profile) {
		// 	console.log("d", Game.cpu.getUsed() - startCPU)
		// }

		if (!creep.healOrdersGiven) {
			roomCombat.groupApplyHeal(creep, creep.mem.formationCreeps)
			// roomCombat.groupApplyHeal(creep, numHealsBase, mostLostHits, mostLostHitsCreep, creep.mem.formationCreeps)
			// We're not doing any other healing
			for (let creepName of creep.mem.formationCreeps) {
				if (Game.creeps[creepName]) {
					Game.creeps[creepName].healOrdersGiven = 1;
				}
			}
		}
		// Memory.stats.creepCPUs[cpuHash + "e"] = (Memory.stats.creepCPUs[cpuHash + "e"] || 0) + Game.cpu.getUsed() - startCPU
		// startCPU = Game.cpu.getUsed()

		// if (profile) {
		// 	console.log("e", Game.cpu.getUsed() - startCPU)
		// }

		// console.log(creep)

		if (creep.hasActiveBodypart(RANGED_ATTACK)) {
			assaulterRangedAttack(creep)
		}
		// Memory.stats.creepCPUs[cpuHash + "f"] = (Memory.stats.creepCPUs[cpuHash + "f"] || 0) + Game.cpu.getUsed() - startCPU

		// if (profile) {
		// 	console.log("f", Game.cpu.getUsed() - startCPU)
		// }

	},

	runPairedHealer: function(creep) {
		// if (creep.name == "r6963_3762") console.log(Game.cpu.getUsed())
		delete creep.mem.engaged
		if (!creep.moveOrdersGiven) {	
			let anyAlive = false;
			let anyRamparter = false
			let anyNonHealer = false
			// If none of my formation is alive, run as a crap healer
			for (let otherCreepName of creep.mem.formationCreeps) {
				if (Game.powerCreeps[otherCreepName] && Game.powerCreeps[otherCreepName].room) {
					anyAlive = true;
					anyNonHealer = true;
				}
				else if ((Game.creeps[otherCreepName] && otherCreepName != creep.name)) {
					anyAlive = true;
					if (Game.creeps[otherCreepName] && Game.creeps[otherCreepName].mem.role != creep.mem.role) {
						anyNonHealer = true;
					}
					if (Game.creeps[otherCreepName] && Game.creeps[otherCreepName] && Game.creeps[otherCreepName].ramparter) {
						anyRamparter = true
					}
				}
			}

			if ((creep.mem.retreat || (creep.mem.retreatTimer || 0) > 0) && !anyNonHealer) {
				var moveOptions = {"avoidEnemyRooms" : 1, "avoidHostiles": 1};

				if (creep.mem.setupPos && creep.mem.setupPos.roomName != creep.room.name && creep.room.isEnemyRoom() && !intelAI.getEnemyRoomSet().has(creep.mem.setupPos.roomName)) {
					creep.uncachedMoveTo(creep.mem.setupPos, 0, moveOptions);
				}
				else {
					let fallbackRoom = creep.mem.fallbackRoom || creep.mem.sR;

					if (!creep.movedThisTick) {					
						// We should avoid baddies here.
						creep.uncachedMoveTo(new RoomPosition(Memory.rooms[fallbackRoom].fallbackX || 25,
													 		  Memory.rooms[fallbackRoom].fallbackY || 25,
															  fallbackRoom),
											(creep.room.name == fallbackRoom || Memory.rooms[fallbackRoom].fallbackX) ? 2 : 20,
											moveOptions);
					}
				}

				if (creep.mem.retreatTimer) {
					creep.mem.retreatTimer -= 1;
				}
			}
			else {
				if (anyRamparter && creep.room.isMyRoom() && creep.hits != creep.hitsMax && creep.hasBodypart(RANGED_ATTACK)) {
					creep.combatSnake = 0
					creep.ramparter = 1
					return this.runRanged(creep)
				}
				else if (!anyAlive) {
					// console.log(creep, "has lost buddies and falling back to ranged")
					// Kinda important. Otherwise I get an infinite loop
					creep.combatSnake = 0
					creep.mem.combatSnake = 0;
					return this.runHealer(creep)
				}
			}
		}

		// if (creep.name == "r6963_3762") console.log(Game.cpu.getUsed())

		let ret;
		let numHealsBase;
		let numHeals;
		let mostLostHits;
		let mostLostHitsCreep;
		let totalLostHits;
		if (!creep.healOrdersGiven) {
		 	ret = roomCombat.calcGroupHealStatus(creep.mem.formationCreeps);
			numHealsBase = ret.numHealsBase;
			numHeals = ret.numHeals;
			mostLostHits = ret.mostLostHits;
			mostLostHitsCreep = ret.mostLostHitsCreep;
			totalLostHits = ret.totalLostHits;
		}

		// if (creep.name == "r6963_3762") console.log(Game.cpu.getUsed())


		if (!creep.healOrdersGiven && (mostLostHits || creep.room.dangerous)) {
			roomCombat.groupApplyHeal(creep, creep.mem.formationCreeps)
		}

		// if (creep.name == "r6963_3762") console.log(Game.cpu.getUsed())

		// Assaulter ranged attack and skirmisher ranged attack are similar
		// Assualter is heavier duty and focussed on countering room defense
		// and trying to break though. Skirmisher is probably more appropriate here
		// as it is more about general combat.
		skirmisherRangedAttackAndHeal(creep);

		// if ((creep.room.dangerous || !creep.room.controller || !creep.room.controller.my) && creep.hasActiveBodypart(RANGED_ATTACK)) {
		// 	assaulterRangedAttack(creep)
		// }

		// if (creep.name == "r6963_3762") console.log(Game.cpu.getUsed())
	},


	// Orbit the formation.
	runRangedMoon: function(creep) {
		if (Math.random() < 0.1) creep.say("MOON")

		let moveOptions;
		if (creep.room.dangerous) {
			moveOptions = {"avoidEnemyRooms" : 1};
		}
		else {
			moveOptions = {"avoidEnemyRooms" : 1};
		}

		delete creep.mem.engaged

		let forceRetreat = 0;
		if ((creep.mem.blockingFormation || 0) > 0) {
			creep.mem.blockingFormation -= 1;
			forceRetreat = 1;
			moveOptions.avoidLocalCreeps = 1;
			if (creep.mem.blockingFormation == 0) {
				delete creep.mem.blockingFormation;
			}
		}

		if (creep.hits != creep.hitsMax && creep.room.name != creep.mem.targetRoom) {
			forceRetreat = 1;
		}

		let formationMoved = false;
		let farAway = false;

		if (!creep.moveOrdersGiven) {
			let excludedPositions = [];

			let parentFormationCreepNames = creep.mem.parentFormationCreeps;
			let parentFormationCreeps = [];
			let setup = 0;
			for (let creepName of parentFormationCreepNames) {
				let formationCreep = Game.creeps[creepName]
				if (formationCreep) {
					parentFormationCreeps.push(formationCreep)
					if (formationCreep.setupFormation) {
						setup = 1;
					}
					else {
						if (creep.pos.getRangeTo(formationCreep.pos) > 3) {
							farAway = true;
						}
						if (formationCreep.expectedPos) {
							formationMoved = true;
							excludedPositions.push(formationCreep.expectedPos);
							if (formationCreep.blockedMove) {
								excludedPositions.push(formationCreep.pos);
							}
						}
						else {
							excludedPositions.push(formationCreep.pos);
						}
					}
				}
			}

			creep.room.moonPositions = creep.room.moonPositions || []
			for (let moonPosition of creep.room.moonPositions) {
				excludedPositions.push(moonPosition);
			}

			moveOptions.excludedPositions = excludedPositions;

			if (forceRetreat || creep.retreat || creep.mem.retreat) {
				moveOptions.heuristicWeight = 1.1;
				// if (creep.room.name == "E15S19") console.log(creep, "retreat")
				if (creep.room.isEnemyRoom()) {
					creep.uncachedMoveTo(creep.mem.setupPos,
										0,
										moveOptions);

				}
				else if (creep.mem.fallbackRoom) {
					// creep.retreatToRoom(creep.mem.fallbackRoom, moveOptions);
					creep.uncachedMoveTo(new RoomPosition(Memory.rooms[creep.mem.fallbackRoom].fallbackX || 25,
												 		  Memory.rooms[creep.mem.fallbackRoom].fallbackY || 25,
														  creep.mem.fallbackRoom),
										2,
										moveOptions);
				}
				else {
					// creep.retreatToRoom(creep.mem.sR, moveOptions);
					creep.uncachedMoveTo(new RoomPosition(Memory.rooms[creep.mem.sR].fallbackX || 25,
												 		  Memory.rooms[creep.mem.sR].fallbackY || 25,
														  creep.mem.sR),
										2,
										moveOptions);
				}
				creep.mem.allowSavePosition = 0;
			}
			else {
				let targetPositions = [];

				if (setup) {
					// if (creep.room.name == creep.mem.setupPos.roomName) {
						if (creep.room.isEnemyRoom() && (creep.room.dangerous == 2 || creep.room.towers.length)) {
							moveOptions.forceMoveRooms = 1;
							moveOptions.avoidEnemyRooms = 0;
						}

						if (creep.room.name == creep.mem.setupPos.roomName &&
							util.isNearEdgeOfRoom(creep.pos, 5) &&
							creep.pos.getRangeTo(creep.mem.setupPos.x, creep.mem.setupPos.y) <= 3) {
							if (creep.room.dangerous) {
								creep.moon = 0;
								return this.runRanged(creep);
							}
							else {
								creep.uncachedMoveTo(new RoomPosition(25, 25, creep.mem.setupPos.roomName), 10, moveOptions)
							}
						}
						else {
							if (creep.room.dangerous && !moveOptions.forceMoveRooms) {
								creep.moon = 0;
								return this.runRanged(creep);
							}
							else {
								creep.uncachedMoveTo(new RoomPosition(creep.mem.setupPos.x, creep.mem.setupPos.y, creep.mem.setupPos.roomName), 3, moveOptions)
							}
						}
					/*}
					else {
						creep.forceMoveRooms = 1;
						creep.moon = 0;
						creep.uncachedMoveTo(new RoomPosition(creep.mem.setupPos.x, creep.mem.setupPos.y, creep.mem.setupPos.roomName), 3, moveOptions)
						// return this.runRanged(creep);
					}*/
				}
				else {
					if (!farAway && !formationMoved && creep.hits == creep.hitsMax && creep.mem.pTX && creep.mem.pTY && creep.mem.pTgtRoom && creep.mem.pTgtRoom == creep.mem.targetRoom && Game.time % 13 != 0 && creep.mem.allowSavePosition) {
						let targetPos = new RoomPosition(creep.mem.pTX, creep.mem.pTY, creep.mem.pTgtRoom)

						if (!creep.pos.isEqualToPos(targetPos)) {
							creep.uncachedMoveTo(targetPos, 0, moveOptions)
							creep.room.moonPositions.push(targetPos)
						}
					}
					else if (farAway && parentFormationCreeps.length && creep.room.name == creep.mem.targetRoom) {
						let closest = creep.pos.findClosestByRange(parentFormationCreeps);
						if (closest) {
							creep.uncachedMoveTo(closest, 1, moveOptions);
						}
						else {
							closest = creep.pos.findClosestObjectByWorldRange(parentFormationCreeps);
							if (closest) {
								creep.uncachedMoveTo(closest, 1, moveOptions);
							}
						}
					}
					else {
						creep.mem.allowSavePosition = 1;
						let roomTerrain = Game.map.getRoomTerrain(creep.room.name)

						// if (creep.room.name == "E15S19") console.log(creep, "not setup")
						for (let creepName of parentFormationCreepNames) {
							let formationCreep = Game.creeps[creepName]
							if (formationCreep) {
								let terrain = formationCreep.room.getTerrain();
								let srcPos = formationCreep.expectedPos || formationCreep.pos

								for (let i = -1; i <= 1; i++) {
									for (let j = -1; j <= 1; j++) {
										if (i == 0 && j == 0) continue;

										let x = srcPos.x + i;
										let y = srcPos.y + j;

										if (x < 0 || x > 49 || y < 0 || y > 49) continue
										if (terrain.get(x, y) & TERRAIN_MASK_WALL) continue;

										let targetPos = new RoomPosition(x, y, srcPos.roomName);

										let blocked = 0;
										let structs = targetPos.lookFor(LOOK_STRUCTURES);
										for (let struct of structs) {
											if (struct.structureType != STRUCTURE_ROAD && struct.structureType != STRUCTURE_CONTAINER) {
												blocked=  1;
												break;
											}
										}

										if (blocked) continue;

										let exists = 0;
										for (let otherPos of targetPositions) {
											if (targetPos.isEqualToPos(otherPos)) {
												exists = 1;
												break;
											}
										}
										if (exists) continue;
										for (let otherPos of excludedPositions) {
											if (targetPos.isEqualToPos(otherPos)) {
												exists = 1;
												break;
											}
										}
										if (exists) continue;
										targetPositions.push(targetPos);
									}
								}
							}
						}


						// targetPositions contains a list of places I can go which won't cause issues.
						let bestScore = -Infinity;
						let bestPos;
						if (targetPositions.length == 1) {
							bestPos = targetPositions[0]
						}
						else {
							let hostileCreeps = creep.room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK])
							for (let targetPos of targetPositions) {
								let score = 0;
								//
								if (creep.hits != creep.hitsMax) {
									for (let creepName of parentFormationCreepNames) {
										let formationCreep = Game.creeps[creepName]
										if (formationCreep) {
											let numHeals = formationCreep.getBoostModifiedHeal()
											if (!numHeals) continue;
											let pos = formationCreep.expectedPos || formationCreep.pos

											if (targetPos.isNearTo(pos)) {
												score += 0.5 * Math.min(numHeals * HEAL_POWER, creep.hitsMax - creep.hits);
												score += 0.5 * (numHeals * HEAL_POWER + creep.hitsMax - creep.hits)
											}
										}
									}
								}			

								let myParts = creep.getBoostModifiedCombatParts(true, true)

								// Early continue. Assume max ranged damage is 50
								if (bestScore > score + myParts.numRanged * 50) continue;

								let rangedDamage = 0;
								let rmaDamage = 0;

								// Enemy creep damage
								for (let hostileCreep of hostileCreeps) {
									let range = targetPos.getRangeTo(hostileCreep)
									if (range < 5) {
										let parts = hostileCreep.getBoostModifiedCombatParts(true, true)
										score -= parts.numRanged * RANGED_ATTACK_POWER
										if (range < 4) {
											rangedDamage = RANGED_ATTACK_POWER;
											rmaDamage = (range == 3 ? 1 : (range == 2 ? 4 : 10));
											if (range < 3) {
												score -= parts.numAttack * ATTACK_POWER
											}
										}
									}
								}

								// Favour close
								score += creep.pos.getRangeTo(targetPos) / 1e3

								// Tiebreaker
								score += creep.ticksToLive / 1e6 + creep.mem.c / 1e12;

								// Early continue. Assume max ranged damage is 50
								if (bestScore > score + myParts.numRanged * 50) continue;

								// look for sturctures
								for (let struct of targetPos.findInRange(FIND_HOSTILE_STRUCTURES, 3)) {
									let range = targetPos.getRangeTo(struct)
									if (range == 3) {
										rangedDamage = RANGED_ATTACK_POWER
										rmaDamage += 1;
									}
									else if (range == 2) {
										rangedDamage = RANGED_ATTACK_POWER
										rmaDamage += 4;
									}
									else if (range == 1) {
										rangedDamage = RANGED_ATTACK_POWER
										rmaDamage += 10;
									}
								}
								// Not quite true as my RMA is slightly overestimated
								score += Math.max(rangedDamage, rmaDamage) * myParts.numRanged;

								if (roomTerrain.get(targetPos.x, targetPos.y) & TERRAIN_MASK_SWAMP) {
									score -= 50;
								}

								if (score > bestScore) {
									bestScore = score;
									bestPos = targetPos;
								}
							}
						}



						// Ok. Go there!
						if (bestPos) {
							creep.room.moonPositions.push(bestPos)
							creep.uncachedMoveTo(bestPos, 0, moveOptions)
						}
						else {
							creep.moon = 0;
							return this.runRanged(creep);
						}

					}

				}
			}
		}


		if (creep.hits != creep.hitsMax) {
			creep.heal(creep);
		}
		else {
			let hurtFriends = creep.pos.findInRange(FIND_MY_CREEPS, 1, {
				filter: (otherCreep) => {
					return (otherCreep.hits / otherCreep.hitsMax < 0.75)
				}
			});

			if (hurtFriends.length) {
				creep.heal(_.sample(hurtFriends))
			}
			else {
				creep.heal(creep);
			}
		}
		
		assaulterRangedAttack(creep)
	},



	runRangedConvoyRaider: function(creep) {
		if (creep.room.name != creep.mem.targetRoom || !creep.targetCreep || creep.targetCreep.room.name != creep.room.name) {
			creep.convoyRaider = false;
			if (creep.room.name == creep.mem.targetRoom) {
				creep.forceMoveRooms = false;
			}
			return this.runRanged(creep);
		}

		delete creep.mem.engaged

		// creep.say("\uD83D\uDC2F", true)

		let targetPosX = creep.targetCreep.pos.x
		let targetPosY = creep.targetCreep.pos.y
		let pathRange = 0;
		let targetRange = 3;

		let carriers = creep.room.find(FIND_HOSTILE_CREEPS, {
			filter: (otherCreep) => {
				return (otherCreep.owner.username == "Screeps" && otherCreep.hasBodypart(CARRY))
			}
		});

		if (carriers.length && carriers[0].fatigue == 0 && carriers[0].hasActiveBodypart(MOVE)) {
			if (creep.targetCreep.fatigue == 0 && creep.targetCreep.hasActiveBodypart(MOVE)) {
				targetRange -= 1;
			}
		}

		if (creep.hits / creep.hitsMax < 0.5) {
			targetRange += 1;
		}

		let friends2 = creep.pos.findInRange(FIND_MY_CREEPS, 2, {
			filter: (otherCreep) => {
				if (otherCreep.hits / otherCreep.hitsMax < 0.5) return false;
				if (!otherCreep.convoyRaider) return false;

				if (creep.convoyDirection == LEFT && otherCreep.pos.x > creep.pos.x) {
					return false;
				}
				else if (creep.convoyDirection == RIGHT && otherCreep.pos.x < creep.pos.x) {
					return false;
				}
				else if (creep.convoyDirection == TOP && otherCreep.pos.y > creep.pos.y) {
					return false;
				}
				else if (creep.convoyDirection == BOTTOM && otherCreep.pos.y < creep.pos.y) {
					return false;
				}

				if (otherCreep.notPushing) {
					return false;
				}

				return true;
			}
		});
		let friends1 = creep.pos.findInRange(friends2, 1);
		let hasFriends = friends2.length > 2 && friends1.length > 1;
		if (!hasFriends) {
			targetRange += 1;
		}

		if (targetRange > 4) {
			creep.notPushing = 1;
		}

		if (creep.convoyDirection == LEFT) {
			targetPosX += targetRange
			targetPosY += creep.mem.carMissionID - Math.floor(creep.mem.carMissionNumCreeps / 2);
		}
		else if (creep.convoyDirection == RIGHT) {
			targetPosX -= targetRange
			targetPosY += creep.mem.carMissionID - Math.floor(creep.mem.carMissionNumCreeps / 2);
		}
		else if (creep.convoyDirection == TOP) {
			targetPosX += creep.mem.carMissionID - Math.floor(creep.mem.carMissionNumCreeps / 2);
			targetPosY += targetRange
		}
		else if (creep.convoyDirection == BOTTOM) {
			targetPosX += creep.mem.carMissionID - Math.floor(creep.mem.carMissionNumCreeps / 2);
			targetPosY -= targetRange
		}

		let targetPos;
		if (targetPosX < 0 || targetPosX > 49 || targetPosY < 0 || targetPosY > 49) {
			targetPos = new RoomPosition(25, 25, creep.room.name)
			pathRange = 7;
		}
		else {
			targetPos = new RoomPosition(targetPosX, targetPosY, creep.room.name)
			if (targetPos.lookFor(LOOK_TERRAIN)[0] != "plain") {
				pathRange = targetRange;
			}
		}


		let attacked = false;
		if (creep.pos.getRangeTo(creep.targetCreep) <= 3) {
			creep.targetCreep.expectedHealth = creep.targetCreep.expectedHealth || (creep.targetCreep.hits);

			let targetHits = creep.targetCreep.getNumOfBodyPart(HEAL) > 4 ? 200 : 0;

			let numRanged = creep.getActiveBodyparts(RANGED_ATTACK);
			if (creep.targetCreep.expectedHealth - numRanged * RANGED_ATTACK_POWER > targetHits) {
				creep.targetCreep.expectedHealth -= numRanged * RANGED_ATTACK_POWER;
				creep.rangedAttack(creep.targetCreep);
				attacked = true;
			}
			else {
				let RMADamage = 10;
				if (creep.pos.getRangeTo(creep.targetCreep) == 3) {
					RMADamage = 1;
				}
				else if (creep.pos.getRangeTo(creep.targetCreep) == 2) {
					RMADamage = 4;
				}

				if (creep.targetCreep.expectedHealth - numRanged * RMADamage > targetHits) {
					creep.targetCreep.expectedHealth -= numRanged * RMADamage;
					creep.rangedMassAttack();
					attacked = true;
				}
			}

			if (!attacked) {
				let otherTargets = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 3);
				if (otherTargets.length > 1) {
					for (let otherTarget of otherTargets) {
						if (otherTarget == creep.targetCreep) continue
						if (!otherTarget.targetCreep) continue

						otherTarget.expectedHealth = otherTarget.expectedHealth || otherTarget.hits;

						let targetHits2 = otherTarget.targetCreep.getNumOfBodyPart(HEAL) > 4 ? 200 : 0;
						if (otherTarget.expectedHealth - numRanged * RANGED_ATTACK_POWER > targetHits2) {
							otherTarget.expectedHealth -= numRanged * RANGED_ATTACK_POWER;
							creep.rangedAttack(otherTarget);
							attacked = true;
						}
					}
				}
			}
		}

		// console.log(creep, targetPos, creep.pos.getRangeTo(targetPos))

		// Got to be a bit careful as avoidHostiles will try to make them maximize lateral distance when moving >2 tiles
		// This causes the guy right behind the caravan to get confused.
		let moveOptions;
		if (creep.pos.getRangeTo(targetPos) <= 3) {
			moveOptions = {"avoidEnemyRooms" : 1, "pathEveryDamnTick" : Game.time, "avoidLocalCreeps" : 1 };
		}
		else {
			moveOptions = {"avoidEnemyRooms" : 1, "pathEveryDamnTick" : Game.time, "avoidHostiles": 4, "avoidLocalCreeps" : 1 };
		}

		if (creep.pos.getRangeTo(creep.targetCreep) == 5 && pathRange == 4 && Math.random() < 0.25) {
			// Skip pathing to try and noise out some annoying glitches
		}
		else {
			creep.uncachedMoveTo(targetPos, pathRange, moveOptions)
		}

		if (creep.hits != creep.hitsMax || creep.pos.findFirstInRange(FIND_HOSTILE_CREEPS, 3)) {
			creep.heal(creep);
		}
		else {
			let hurtFriends = creep.pos.findInRange(creep.room.getMyInjuredCreeps(), 3);

			if (hurtFriends.length) {
				let healed = false;
				for (let hurtFriend of hurtFriends) {
					if (creep.pos.getRangeTo(hurtFriend) <= 1) {
						creep.heal(hurtFriend);
						healed = true;
						break;
					}
				}
				if (!healed) {
					creep.rangedHeal(_.sample(hurtFriends));
				}
			}
		}
	},

	runRangedStrongholdSniper: function(creep) {
		// Get the boosts!
		if (creep.getBoosts()) {
			return;
		}
		if (creep.room.name == creep.mem.sR && !creep.room.dangerous && creep.ticksToLive < 50 && creep.hasBoost()) {
			let res = this.attempToUnBoost(creep)
			if (res) {
				return;
			}
		}
		if (creep.ticksToLive < creep.mem.travelTime * 1.5 && creep.mem.travelTime < 200 && Game.rooms[creep.mem.sR].labs.length) {
			if (creep.room.name == creep.mem.targetRoom) {
				creep.uncachedMoveTo(Game.rooms[creep.mem.sR].labs[0].pos, 1, {"avoidEnemyRooms" : 1, "ignoreKeepers": 1, "avoidHostiles": 1, "avoidRamparts": 1, "avoidStronghold": 1})
				creep.heal(creep)
				assaulterRangedAttack(creep)
				return
			}
			else {		
				// changeCreepRole(creep, newRole) {
				changeCreepRole(creep, "recycler");
				return this.runRecycler(creep)
			}
		}

		delete creep.mem.engaged

		if (creep.hits != creep.hitsMax) {
			creep.mem.retreatTimer = 5;
		}

		if (!creep.mem.retreat && !creep.mem.retreatTimer) {
			if (!creep.mem.snipePos) {
				let snipePositions = []
				for (let snipePoint of creep.mem.snipePoints) {
					snipePositions.push(new RoomPosition(snipePoint.x, snipePoint.y, creep.mem.targetRoom));

				}
				creep.mem.snipePos = creep.pos.findClosestPosByWorldRange(snipePositions)
			}

			let snipePos = new RoomPosition(creep.mem.snipePos.x, creep.mem.snipePos.y, creep.mem.targetRoom);

			if (creep.room.name != creep.mem.targetRoom) {
				creep.uncachedMoveTo(snipePos, 3, {"avoidEnemyRooms" : 1, "ignoreKeepers": 1, "avoidStronghold": 1})
			}
			else {
				let snipePosStructs = snipePos.findInRange(FIND_STRUCTURES, 1);
				let snipePosRampart;
				let snipePosCreep;

				for (let struct of snipePosStructs) {
					if (struct.structureType == STRUCTURE_RAMPART) {
						snipePosRampart = struct;
						break;
					}
				}

				if (!snipePosRampart) {
					snipePosCreep = snipePos.findFirstInRange(FIND_HOSTILE_CREEPS, 1);
				}

				if (snipePosRampart || snipePosCreep) {
					creep.uncachedMoveTo(snipePos, 2, {"maxRooms": 1, "avoidEnemyRooms" : 1, "ignoreKeepers": 1, "avoidHostiles": 1, "avoidRamparts": 1, "avoidStronghold": 1})
					if (creep.pos.inRangeToPos(snipePos, 2)) {
						if (!creep.mem.travelTime) {
							creep.mem.travelTime = CREEP_LIFE_TIME - creep.ticksToLive
						}
						if (util.isEdgeOfRoom(creep.pos)) {
							creep.uncachedMoveTo(snipePos, 1, {"maxRooms": 1, "avoidEnemyRooms" : 1, "ignoreKeepers": 1, "avoidHostiles": 1, "avoidRamparts": 1, "avoidStronghold": 1})
						}
					}
				}
				else {
					creep.uncachedMoveTo(snipePos, 0, {"maxRooms": 1, "avoidEnemyRooms" : 1, "ignoreKeepers": 1, "avoidHostiles": 1, "avoidRamparts": 1, "avoidStronghold": 1})	
					if (creep.pos.isEqualToPos(snipePos)) {
						if (!creep.mem.travelTime) creep.mem.travelTime = CREEP_LIFE_TIME - creep.ticksToLive
					}
				}

			}
		}
		else if (creep.mem.retreat || (creep.mem.retreatTimer || 0) > 0) {
			var moveOptions = {"avoidEnemyRooms" : 1, "avoidHostiles": 1, "ignoreKeepers": 1, "avoidHostiles": 1, "avoidRamparts": 1, "avoidStronghold": 1}

			if (creep.mem.setupPos && creep.mem.setupPos.roomName != creep.room.name && creep.room.isEnemyRoom() && !intelAI.getEnemyRoomSet().has(creep.mem.setupPos.roomName)) {
				creep.uncachedMoveTo(creep.mem.setupPos, 0, moveOptions);
			}
			else {
				let fallbackRoom = creep.mem.fallbackRoom || creep.mem.sR;
				// We should avoid baddies here.
				creep.uncachedMoveTo(new RoomPosition(Memory.rooms[fallbackRoom].fallbackX || 25,
											 		  Memory.rooms[fallbackRoom].fallbackY || 25,
													  fallbackRoom),
									(creep.room.name == fallbackRoom || Memory.rooms[fallbackRoom].fallbackX) ? 2 : 20,
									moveOptions);
			}

			if (creep.mem.retreatTimer) {
				creep.mem.retreatTimer -= 1;
			}
		}
		creep.heal(creep)

		if (creep.room.name != creep.mem.targetRoom) {
			assaulterRangedAttack(creep)
		}
		else {
			let badCreeps = creep.pos.findInRange(FIND_HOSTILE_CREEPS, 3, {filter: (c) => {return c.owner.username !== "Invader"}});

			if (badCreeps.length) {
				creep.mem.retreatTimer = 5;
				if (creep.pos.isNearToPos[badCreeps[0].pos]) {
					creep.rangedMassAttack();
				}
				else {
					creep.rangedAttack(badCreeps[0])
				}
			}
			else {
				if (creep.room.invaderCore && creep.pos.inRangeTo(creep.room.invaderCore.pos, 3)) {
					if (creep.pos.isNearToPos(creep.room.invaderCore.pos)) {
						creep.rangedMassAttack();
					}
					else {
						creep.rangedAttack(creep.room.invaderCore)
					}
				}
				else {					
					let snipePos = new RoomPosition(creep.mem.snipePos.x, creep.mem.snipePos.y, creep.mem.targetRoom);
					let snipePosStructs = snipePos.findInRange(FIND_STRUCTURES, 1);
					let snipePosRampart;

					for (let struct of snipePosStructs) {
						if (struct.structureType == STRUCTURE_RAMPART) {
							snipePosRampart = struct;
							break;
						}
					}

					if (snipePosRampart && creep.pos.inRangeToPos(snipePosRampart.pos, 3)) {
						if (creep.pos.isNearToPos(snipePosRampart.pos)) {
							creep.rangedMassAttack();
						}
						else {
							creep.rangedAttack(snipePosRampart)
						}
					}
					else {
						assaulterRangedAttack(creep)
					}
				}
			}
		}
	},

	runMissionEdgeBouncer: function(creep) {
		// NOTE: Healing is done at the mission level

		creep.mem.realTargetRoom = creep.mem.realTargetRoom || creep.mem.targetRoom
		creep.mem.targetRoom = creep.room.name == creep.mem.setupRoom ? creep.mem.realTargetRoom : creep.mem.setupRoom
		// Not in the enemy room
		if (creep.room.name != creep.mem.realTargetRoom) {
			// Not in the setup room or the target room and have never been int the target room... or not on an edge
			if ((creep.room.name != creep.mem.targetRoom && !creep.mem.arrivalTime) || !util.isEdgeOfRoom(creep.pos)) {
				// Fighting in setup or going to setup
				if (creep.room.dangerous || creep.room.name != creep.mem.setupRoom) {
					if (creep.room.name != creep.mem.setupRoom) {
						creep.forceMoveRooms = 1;
					}
					creep.edgeBouncer = false;
					this.runRanged(creep);
					return
				}
			}
		}

		delete creep.mem.engaged

		if (creep.room.name == creep.mem.setupRoom) {
			let opts = {"maxRooms": 1, "avoidEnemyRooms": 1}
			let exitDir = creep.room.findExitTo(creep.mem.realTargetRoom);

			let targetPos;
			if (exitDir == LEFT) {
				targetPos = new RoomPosition(1, creep.borderPostion, creep.mem.setupRoom)
			}
			else if (exitDir == TOP) {
				targetPos = new RoomPosition(creep.borderPostion, 1, creep.mem.setupRoom)
			}
			else if (exitDir == RIGHT) {
				targetPos = new RoomPosition(48, creep.borderPostion, creep.mem.setupRoom)
			}
			else if (exitDir == BOTTOM) {
				targetPos = new RoomPosition(creep.borderPostion, 48, creep.mem.setupRoom)
			}

			let isOnEdge = util.isEdgeOfRoom(creep.pos) && creep.pos.isNearTo(targetPos);

			if (!isOnEdge && !creep.pos.isEqualTo(targetPos)) {
				creep.say(creep.borderPostion)

				creep.uncachedMoveTo(targetPos, 0, opts);
			}
			// Look up, look down.
			else if (creep.expectedHealth >= creep.hitsMax) {
				let offset = isOnEdge ? -1 : 1;
				let friend1;
				let friend2;
				if (exitDir == LEFT || exitDir == RIGHT) {
					friend1 = creep.room.lookForAt(LOOK_CREEPS, creep.pos.x, creep.pos.y + 1)[0];
					if (!friend1) {
						friend1 = creep.room.lookForAt(LOOK_CREEPS, creep.pos.x + (exitDir == LEFT ? -offset : offset), creep.pos.y + 1)[0];
					}
					friend2 = creep.room.lookForAt(LOOK_CREEPS, creep.pos.x, creep.pos.y - 1)[0];
					if (!friend2) {
						friend2 = creep.room.lookForAt(LOOK_CREEPS, creep.pos.x + (exitDir == LEFT ? -offset : offset), creep.pos.y - 1)[0];
					}
				}
				else if (exitDir == TOP || exitDir == BOTTOM) {
					friend1 = creep.room.lookForAt(LOOK_CREEPS, creep.pos.x + 1, creep.pos.y)[0];
					if (!friend1) {
						friend1 = creep.room.lookForAt(LOOK_CREEPS, creep.pos.x + 1, creep.pos.y + (exitDir == TOP ? -offset : offset))[0];
					}
					friend2 = creep.room.lookForAt(LOOK_CREEPS, creep.pos.x - 1, creep.pos.y)[0];
					if (!friend2) {
						friend2 = creep.room.lookForAt(LOOK_CREEPS, creep.pos.x - 1, creep.pos.y + (exitDir == TOP ? -offset : offset))[0];
					}
				}

				if ((friend1 && (friend1.expectedHealth || 0) >= friend1.hitsMax) ||
					(friend2 && (friend2.expectedHealth || 0) >= friend2.hitsMax)) {
					if 		(exitDir == LEFT) creep.move(LEFT);
					else if (exitDir == RIGHT) creep.move(RIGHT);
					else if (exitDir == TOP) creep.move(TOP);
					else if (exitDir == BOTTOM) creep.move(BOTTOM);
				}
			}
		}



		if (creep.room.name == creep.mem.setupRoom && creep.expectedHealth < creep.hitsMax && util.isEdgeOfRoom(creep.pos)) {
			if 		(creep.pos.x == 0) creep.move(RIGHT);
			else if (creep.pos.x == 49) creep.move(LEFT);
			else if (creep.pos.y == 0) creep.move(BOTTOM);
			else if (creep.pos.y == 49) creep.move(TOP);
		}
		else if (creep.room.name == creep.mem.realTargetRoom) {
			creep.mem.arrivalTime = creep.mem.arrivalTime || Game.time;

			let hostile = creep.pos.findFirstInRange(creep.room.getAllHostileCreepsWithBodyParts([RANGED_ATTACK], true), 5, {filter: (c) => {return Math.abs(creep.pos.y - c.pos.y) <= 4}});
			if (!hostile) {
				hostile = creep.pos.findFirstInRange(creep.room.getAllHostileCreepsWithBodyParts([ATTACK], true), 3, {filter: (c) => {return Math.abs(creep.pos.y - c.pos.y) <= 2}});
			}

			let canAdvance = !hostile && creep.expectedHealth >= creep.hitsMax

			if (canAdvance) {
				if 		(creep.pos.x == 0) creep.move(RIGHT);
				else if (creep.pos.x == 49) creep.move(LEFT);
				else if (creep.pos.y == 0) creep.move(BOTTOM);
				else if (creep.pos.y == 49) creep.move(TOP);
			}
			else if (!util.isEdgeOfRoom(creep.pos) && !canAdvance) {
				if 		(creep.pos.x <= 1) creep.move(LEFT);
				else if (creep.pos.x >= 48) creep.move(RIGHT);
				else if (creep.pos.y <= 1) creep.move(TOP);
				else if (creep.pos.y >= 48) creep.move(BOTTOM);
			}
		}

		// TODO: Detect ramparts and prioritze creeps.
		var targetCreeps = creep.pos.findInRange(creep.room.getAllHostileCreepsAndPowerCreeps(), 3);
		var targetStructs = creep.pos.findInRange(FIND_HOSTILE_STRUCTURES, 3);

		let targets = targetCreeps.concat(targetStructs);

		if (targets.length > 0) {
			var massDamage = 0;
			let usedPositions = [];
			for (var i in targets) {
				let used = false;
				for (let position of usedPositions) {
					if (position.isEqualTo(targets[i].pos)) {
						used = true;
						break;
					}
				}
				if (used) {
					continue;
				}

				let range = creep.pos.getRangeTo(targets[i]);
				if (range == 3) {
					massDamage += 1;
					usedPositions.push(targets[i].pos)
				}
				else if (range == 2) {
					massDamage += 4;
					usedPositions.push(targets[i].pos)
				}
				else if (range == 1) {
					massDamage += 10;
					usedPositions.push(targets[i].pos)
				}
				if (massDamage > 10) {
					break;
				}
			}


			//
			if(massDamage > 10) {
				creep.rangedMassAttack();
			}
			else if (targets.length > 0) {
				if (targetCreeps.length > 0) {
					creep.rangedAttack(creep.pos.findClosestByRange(targetCreeps));
				}
				else {
					creep.rangedAttack(creep.pos.findClosestByRange(targetStructs));
				}
			}
		}
		else {
			var targetStructs = creep.pos.findInRange(FIND_STRUCTURES, 3, {filter: (s) => (s.structureType == STRUCTURE_WALL && s.hits)});

			if (targetStructs.length) {
				creep.rangedAttack(targetStructs[0])
			}

		}
	},



	runEdgeBouncer: function(creep) {
		creep.mem.realTargetRoom = creep.mem.realTargetRoom || creep.mem.targetRoom
		creep.mem.targetRoom = creep.room.name == creep.mem.setupRoom ? creep.mem.realTargetRoom : creep.mem.setupRoom
		if (creep.room.name != creep.mem.realTargetRoom) {
			if ((creep.room.name != creep.mem.targetRoom && !creep.mem.arrivalTime) || !util.isEdgeOfRoom(creep.pos)) {
				this.runRanged(creep);
				if (creep.room.name == creep.mem.setupRoom) {
					let opts = {maxRooms: 1}
					const exitDir = creep.room.findExitTo(creep.mem.realTargetRoom);
					const exit = creep.pos.findClosestByRange(exitDir);
					creep.uncachedMoveTo(exit, 0, opts)
				}
				return
			}
		}

		delete creep.mem.engaged


		if (creep.room.name == creep.mem.setupRoom && creep.hits != creep.hitsMax && util.isEdgeOfRoom(creep.pos)) {
			if (creep.hitsMax - creep.hits > creep.getActiveBoostModifiedHeal(HEAL) * HEAL_POWER) {
				if (creep.pos.x == 0) creep.move(RIGHT);
				else if (creep.pos.x == 49) creep.move(LEFT);
				else if (creep.pos.y == 0) creep.move(BOTTOM);
				else if (creep.pos.y == 49) creep.move(TOP);
			}
			if (creep.hitsMax != creep.hits) {
				creep.mem.hasTakenDamage = true;
			}
		}
		else if (creep.room.name == creep.mem.realTargetRoom) {
			creep.mem.arrivalTime = creep.mem.arrivalTime || Game.time;

			if (creep.hitsMax != creep.hits) {
				creep.mem.hasTakenDamage = true;
			}

			let hostile = creep.pos.findFirstInRange(creep.room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK], true), 4);
			if (Game.time - creep.mem.arrivalTime > 100 && !creep.mem.hasTakenDamage && util.isEdgeOfRoom(creep.pos) && !hostile) {
				if (creep.pos.x == 0) creep.move(RIGHT);
				else if (creep.pos.x == 49) creep.move(LEFT);
				else if (creep.pos.y == 0) creep.move(BOTTOM);
				else if (creep.pos.y == 49) creep.move(TOP);
			}
			else if (!util.isEdgeOfRoom(creep.pos) && (creep.mem.hasTakenDamage || hostile)) {
				if 		(creep.pos.x < 25) creep.move(LEFT);
				else if (creep.pos.x > 25) creep.move(RIGHT);
				else if (creep.pos.y < 25) creep.move(TOP);
				else if (creep.pos.y > 25) creep.move(BOTTOM);
			}
		}


		creep.heal(creep);

		// TODO: Detect ramparts and prioritze creeps.
		var targetCreeps = creep.pos.findInRange(creep.room.getAllHostileCreepsAndPowerCreeps(), 3);
		var targetStructs = creep.pos.findInRange(FIND_HOSTILE_STRUCTURES, 3);

		let targets = targetCreeps.concat(targetStructs);

		if (targets.length > 0) {
			var massDamage = 0;
			let usedPositions = [];
			for (var i in targets) {
				let used = false;
				for (let position of usedPositions) {
					if (position.isEqualTo(targets[i].pos)) {
						used = true;
						break;
					}
				}
				if (used) {
					continue;
				}

				let range = creep.pos.getRangeTo(targets[i]);
				if (range == 3) {
					massDamage += 1;
					usedPositions.push(targets[i].pos)
				}
				else if (range == 2) {
					massDamage += 4;
					usedPositions.push(targets[i].pos)
				}
				else if (range == 1) {
					massDamage += 10;
					usedPositions.push(targets[i].pos)
				}
				if (massDamage > 10) {
					break;
				}
			}


			//
			if(massDamage > 10) {
				creep.rangedMassAttack();
			}
			else if (targets.length > 0) {
				if (targetCreeps.length > 0) {
					creep.rangedAttack(creep.pos.findClosestByRange(targetCreeps));
				}
				else {
					creep.rangedAttack(creep.pos.findClosestByRange(targetStructs));
				}
			}
		}
	},

	runDeconstructor: function(creep) {
		if (creep.renew) {
			return this.runRenewer(creep, true);
		}

		// Get the boosts!
		if (creep.getBoosts()) {
			return;
		}

		if (creep.assaulter || creep.assaultSnake) {
			return this.runCloseCombatAssaulter(creep);
		}

		var forceRetreat = false;
		if (creep.pos.roomName != creep.mem.targetRoom && creep.room.isEnemyRoom()) {
			if (creep.room.towers.length > 0 || (creep.room.controller && (creep.room.controller.safeMode || 0) > 0)) {
				forceRetreat = true;
			}
		}


		if (creep.mem.retreat && creep.room.name == creep.mem.sR && creep.room.hasHostiles) {
			creep.mem.retreat = false;
		}


		let target;
		if (creep.room.name == creep.mem.targetRoom) {
			if (!creep.room.controller || !creep.room.controller.my) {
				if (creep.mem.targetId) {
					target = Game.getObjectById(creep.mem.targetId)
					if (target && Math.random() < 0.05 && !creep.pos.isNearToPos(target.pos)) {
						delete creep.mem.targetId
						target = undefined;
					}
				}
				if (!target) {
					let structs;
					if (creep.mem.role == "strongholdDeconstructor") {
						structs = creep.room.find(FIND_HOSTILE_STRUCTURES);
					}
					else {
					 	structs = creep.room.find(FIND_STRUCTURES);
					}

					if (structs.length > 1) {						
						let roomMap = creep.room.isEnemyRoom() ? roomIntel.getEnemyRoomMap(creep.room.name) : undefined;
						target = creep.pos.findClosestByRange(structs, {
							filter: (structure) => {
								// Randomly return false so we don't overcrowd a single target
								if (Math.random() < 0.5) return false;
								if (!structure.hits) return false;

								if (roomMap && !creep.pos.isNearToPos(structure.pos)) {
									let valid = false;
									for (let i = -1; i <= 1; i++) {
										for (let j = -1; j <= 1; j++) {
											if (parseInt(roomMap[structure.pos.x + i][structure.pos.y + j]) == parseInt(roomMap[creep.pos.x][creep.pos.y])) {
												valid = true;
												break;
											}
										}
									}
									if (!valid) {
										return false;
									}
								} 

								if (!creep.hasBodypart(ATTACK) && structure.structureType == STRUCTURE_INVADER_CORE) {
									return false
								}

								return !structure.my && 
										structure.structureType != STRUCTURE_CONTROLLER &&
									   (structure.structureType != STRUCTURE_STORAGE || structure.store.getUsedCapacity() == 0) &&
									   (structure.structureType != STRUCTURE_CONTAINER || !creep.room.isEnemyRoom() || structure.store.getUsedCapacity() == 0) &&
									   structure.structureType != STRUCTURE_KEEPER_LAIR &&
									   (structure.structureType != STRUCTURE_EXTRACTOR || structure.owner) &&
									   (structure.structureType != STRUCTURE_TERMINAL || structure.store.getUsedCapacity() == 0);
							}
						});

						if (target) {
							creep.mem.targetId = target.id;
						}
					}
				}
			}
		}
		else {
			delete creep.mem.targetId
		}

		// if (creep.room.dangerous) {
		// 	forceRetreat = true;
		// }

		var pathRefresh = undefined;
		if (creep.room.dangerous == 2) {
			pathRefresh = 6;
		}

		var moveOptions = {"avoidEnemyRooms" : 1, "reusePath" : pathRefresh, "ignoreKeepers": creep.room.name == creep.mem.targetRoom ? 1 : undefined};
		var combatMoveOptions = {"avoidEnemyRooms" : 1, "avoidHostiles" : 1, "avoidCombatEdges" : 1, "reusePath" : pathRefresh, "maxRooms": 1, "ignoreKeepers": creep.room.name == creep.mem.targetRoom ? 1 : undefined};

		if ((creep.mem.blockingFormation || 0) > 0) {
			creep.mem.blockingFormation -= 1;
			forceRetreat = true;
			moveOptions.avoidLocalCreeps = 1;
			if (creep.mem.blockingFormation == 0) {
				delete creep.mem.blockingFormation;
			}
		}

		if (forceRetreat || creep.retreat || creep.mem.retreat) {
			if (creep.mem.fallbackRoom) {
				creep.uncachedMoveTo(new RoomPosition(Memory.rooms[creep.mem.fallbackRoom].fallbackX || 25,
											 		  Memory.rooms[creep.mem.fallbackRoom].fallbackY || 25,
													  creep.mem.fallbackRoom),
									(creep.room.name == creep.mem.fallbackRoom || Memory.rooms[creep.mem.fallbackRoom].fallbackX) ? 2 : 20,
									moveOptions);
			}
			else {
				creep.uncachedMoveTo(new RoomPosition(Memory.rooms[creep.mem.sR].fallbackX || 25,
											 		  Memory.rooms[creep.mem.sR].fallbackY || 25,
													  creep.mem.sR),
									2,
									moveOptions);
			}

		}
		else if (target) {
			creep.uncachedMoveTo(target,
								 util.isEdgeOfRoom(creep.pos) ? 0 : 1,
								 combatMoveOptions);
		}
		else {
			// if (!creep.mem.targetRoom) {
			// 	creep.mem.role = "recycler"
			// }
			if (creep.room.name != creep.mem.targetRoom || util.isNearEdgeOfRoom(creep.pos, 1)) {
				creep.uncachedMoveTo(new RoomPosition(25,
											 		  25,
													  creep.mem.targetRoom),
									22,
									moveOptions);
			}
		}

		if (target && creep.pos.getRangeTo(target) <= 1) {
			creep.dismantle(target);
		}

		if (creep.hasBodypart(RANGED_ATTACK)) {
			assaulterRangedAttack(creep);
		}

	},

	runCloseCombatAssaulter: function(creep) {
		if (creep.renew && !creep.ramparter) {
			return this.runRenewer(creep, true);
		}

		// Get the boosts!
		if (creep.getBoosts()) {
			return;
		}
		if (creep.room.name == creep.mem.sR && !creep.room.dangerous && creep.ticksToLive < 50 && creep.hasBoost()) {
			let res = this.attempToUnBoost(creep)
			if (res) {
				return;
			}
		}

		delete creep.mem.engaged

		let ret;
		let numHealsBase;
		let numHeals;
		let mostLostHits;
		let mostLostHitsCreep;
		let totalLostHits;
		if (!creep.healOrdersGiven || !creep.moveOrdersGiven) {
		 	ret = roomCombat.calcGroupHealStatus(creep.mem.formationCreeps);
			numHealsBase = ret.numHealsBase;
			numHeals = ret.numHeals;
			mostLostHits = ret.mostLostHits;
			mostLostHitsCreep = ret.mostLostHitsCreep;
			totalLostHits = ret.totalLostHits;
		}

		if (!creep.assaulter) {
			if (creep.hasBodypart(WORK)) {
				return this.runDeconstructor(creep);
			}
			else if (creep.hasBodypart(ATTACK)) {
				return this.runTank(creep);
			}
		}

		// First one to hit this decides on move orders. Ranged won't hit it if we're directional
		if (!creep.moveOrdersGiven && !creep.mem.retreat && !creep.mem.retreatTimer) {
			formationAI.formationMovement(creep, mostLostHits, mostLostHitsCreep, totalLostHits, numHeals, numHealsBase, ret.numHealsActive);
		}
		else if (creep.mem.retreat || (creep.mem.retreatTimer || 0) > 0) {
			var moveOptions = {"avoidEnemyRooms" : 1, "avoidHostiles": 1};

			if (creep.mem.setupPos && creep.mem.setupPos.roomName != creep.room.name && creep.room.isEnemyRoom() && !intelAI.getEnemyRoomSet().has(creep.mem.setupPos.roomName)) {
				creep.uncachedMoveTo(creep.mem.setupPos, 0, moveOptions);
			}
			else {
				// We should avoid baddies here.
				creep.uncachedMoveTo(new RoomPosition(Memory.rooms[creep.mem.fallbackRoom].fallbackX || 25,
											 		  Memory.rooms[creep.mem.fallbackRoom].fallbackY || 25,
													  creep.mem.fallbackRoom),
									(creep.room.name == creep.mem.fallbackRoom || Memory.rooms[creep.mem.fallbackRoom].fallbackX) ? 2 : 20,
									moveOptions);

			}

			if (creep.mem.retreatTimer) {
				creep.mem.retreatTimer -= 1;
			}
		}

		let isAttack = creep.hasActiveBodypart(ATTACK);
		let acted = false;

		if (isAttack) {
			let bestTarget = getAttackCreepTarget(creep)
			
			if (bestTarget) {
				if (isAttack) {
					creep.attack(bestTarget)
				}
				else {
					creep.dismantle(bestTarget)
				}
				acted = true;
			}
		}

		if (!acted && creep.mem.target && creep.room.name == creep.mem.targetRoom) {
			var primaryTargetPos = new RoomPosition(creep.mem.target.x, creep.mem.target.y, creep.mem.targetRoom);
			if (creep.pos.isNearToPos(primaryTargetPos)) {
				var targets = creep.room.lookForAt(LOOK_STRUCTURES, creep.mem.target.x, creep.mem.target.y);
				if (targets.length > 0 && !targets[0].my) {
					if (isAttack) {
						acted = true;
						creep.attack(targets[0])
					}
					else {
						for (let target of targets) {
							if (target.structureType == STRUCTURE_INVADER_CORE) continue
							creep.dismantle(target)
							acted = true;
							break
						}
					}
				}
			}
		}

		// We need to sort out orientation. Done late as the above appies to assault snakes and this doesn't
		if (creep.mem.directionalFormation && !creep.assaultSnake) {
			let zeroName;
			let zeroCreep;

			for (let creepName of creep.mem.formationCreeps) {
				if (Game.creeps[creepName]) {
					zeroName = creepName;
					zeroCreep = Game.creeps[zeroName];
					break
				}
			}
			// Targets. Any end up being defined we can hit them.
			let s = formationAI.formation2x2CheckBlockedReorientCC(zeroCreep);

			let s0 = s.s0;
			let s1 = s.s1;
			let s2 = s.s2;

			if (!acted && creep.mem.target) {
				var primaryTargetPos = new RoomPosition(creep.mem.target.x, creep.mem.target.y, creep.mem.targetRoom);
				if (creep.pos.isNearTo(primaryTargetPos)) {
					var targets = creep.room.lookForAt(LOOK_STRUCTURES, creep.mem.target.x, creep.mem.target.y);


					if (targets.length > 0 && !targets[0].my) {
						if (isAttack) {
							creep.attack(targets[0])
							acted = true;
						}
						else {
							for (let target of targets) {
								if (target.structureType == STRUCTURE_INVADER_CORE) continue
								creep.dismantle(target)
								acted = true;
								break
							}
						}
					}
				}
			}

			if (!acted) {
				if ((s0 && creep.pos.isNearTo(s0)) || (s1 && creep.pos.isNearTo(s1)) || (s2 && creep.pos.isNearTo(s2))) {
					var a = [];
					if (s0 && creep.pos.isNearTo(s0) && !s0.my) a.push(s0)
					if (s1 && creep.pos.isNearTo(s1) && !s1.my) a.push(s1)
					if (s2 && creep.pos.isNearTo(s2) && !s2.my) a.push(s2)

					let minHits = Infinity;
					let bestTarget;
					for (let target of a) {
						if (!isAttack && target.structureType == STRUCTURE_INVADER_CORE) continue;

						let hits = target.hits;
						// Add 10% of the surrounding wall hits.
						// Aim is to poke a wide hole
						for (let struct2 of target.pos.findInRange(FIND_STRUCTURES, 1)) {
							if (struct2.hits && !struct2.my) {
								hits += struct2.hits * 0.1;
							}
						}

						if (hits < minHits && (target.hits > creep.getNumOfBodyPart(RANGED_ATTACK) * RANGED_ATTACK_POWER || a.length == 1)) {
							minHits = hits;
							bestTarget = target;
						}
					}

					// console.log(creep.name, bestTarget, a)

					let target = bestTarget;
					if (!target) {
						target = _.sample(a);
					}

					if (isAttack) {
						creep.attack(target)
					}
					else {
						creep.dismantle(target)
					}
				}
				else if (creep.room.name == creep.mem.targetRoom) {
					var targets = creep.pos.findInRange(FIND_STRUCTURES, 1);

					let minHits = Infinity;
					let bestTarget;
					for (let target of targets) {
						if (target.my) continue;
						if (!isAttack && target.structureType == STRUCTURE_INVADER_CORE) continue;
						if (target.structureType == STRUCTURE_STORAGE && !creep.room.mem.killStorage) continue;
						if (target.structureType == STRUCTURE_TERMINAL && !creep.room.mem.killTerminal) continue;
						if (target.hits < minHits) {
							minHits = target.hits;
							bestTarget = target;
						}
					}

					if (bestTarget) {
						if (isAttack) {
							creep.attack(bestTarget)
						}
						else {
							creep.dismantle(bestTarget)
						}
					}
				}
				else if ((Game.time - creep.mem.pIncompleteTick < 10 || (creep.mem.setupPos && creep.room.name == creep.mem.setupPos.roomName)) && !creep.room.isMyRoom()) {
					let secondaryTarget = creep.pos.findFirstInRange(FIND_STRUCTURES, 1, {
						filter: (structure) => {
							return structure.structureType == STRUCTURE_WALL && structure.hits;
						}
					});
					if (secondaryTarget) {
						if (isAttack) {
							creep.attack(secondaryTarget)
						}
						else {
							creep.dismantle(secondaryTarget)
						}
					}
				}
			}
		}
		else if (!creep.room.isMyRoom()) {
			let targetStructs = creep.pos.findInRange(FIND_STRUCTURES, 1, {
				filter: (structure) => {
					if (!structure.hits) return false
					if (structure.my) return false
					if (structure.structureType == STRUCTURE_ROAD) return false
					if (structure.structureType == STRUCTURE_INVADER_CORE && !isAttack) return false
					if (structure.structureType === STRUCTURE_CONTROLLER) return false
					if (structure.structureType === STRUCTURE_STORAGE && !creep.room.mem.killStorage) return false
					if (structure.structureType === STRUCTURE_TERMINAL && !creep.room.mem.killTerminal) return false

					return true;
				}
			});

			let target 
			if (!target && isAttack) {
				for (let struct of targetStructs) {
					if (struct.structureType == STRUCTURE_INVADER_CORE) {
						target = struct
					}
				}
			}			
			if (!target) {
				for (let struct of targetStructs) {
					if (struct.structureType == STRUCTURE_TOWER) {
						target = struct
					}
				}
			}
			if (!target) {
				for (let struct of targetStructs) {
					if (struct.structureType == STRUCTURE_SPAWN) {
						target = struct
					}
				}
			}
			if (!target) {
				target = targetStructs[0];
			}

			if (isAttack) {
				creep.attack(target)
			}
			else {
				creep.dismantle(target)
			}
		}

		if (creep.hasActiveBodypart(RANGED_ATTACK)) {
			assaulterRangedAttack(creep)
		}
	},

	runSwarmerTank: function(creep) {
		// var start = Game.cpu.getUsed();
		var attacked = false;
		var target;
		if (creep.launchedAttack == false) {
			// console.log(Game.cpu.getUsed(), Game.cpu.tickLimit);
			if (Game.cpu.getUsed() > 500 * .75) {
				return;
			}


			if (Game.cpu.bucket >= 1000 || Math.random() > 0.25) {
				if (creep.mem.retreat) {
					if (Math.random() < 0.25 || creep.ticksToLive > 1450) {
						var moveOptions = {"avoidEnemyRooms" : 1, "maxOps": 100};
					// 	creep.uncachedMoveTo(new RoomPosition(Game.rooms[creep.mem.fallbackRoom].mem.fallbackX || 25,
					// 								 		  Game.rooms[creep.mem.fallbackRoom].mem.fallbackY || 25,
					// 										  creep.mem.fallbackRoom),
					// 						1,
					// 						moveOptions);
						creep.cachedMoveTo(new RoomPosition(creep.mem.fallbackX || 25,
													 		  creep.mem.fallbackY || 25,
															  creep.mem.fallbackRoom),
											2,
											moveOptions);
					}
					else if (Math.random() < 0.5) {
						creep.move(Math.ceil(Math.random() * 8))
					}
				}
				else {
					if (creep.setupRoomLocs.length > 0 && creep.room.name == creep.setupRoom) {
						var moveOptions = {"avoidEnemyRooms" : 1, "maxOps" : 400};
						var bestPos = creep.pos.findClosestByRange(creep.setupRoomLocs);
						if (!bestPos) bestPos = creep.setupRoomLocs[0];
						// The last one gets mobbed. Hopefully there won't be a last one.
						if (creep.setupRoomLocs.length > 1) {
							_.pull(creep.setupRoomLocs, bestPos);
						}

						if (creep.pos.x != bestPos.x || creep.pos.y != bestPos.y) {
							creep.uncachedMoveTo(bestPos,
												0,
												moveOptions);

						}
					}
					else {
						var moveOptions = {"avoidEnemyRooms" : 1, "maxOps" : 4000};

						// console.log("Fallback swarm loc. Should not be hit")
						// Staggers the long path finding at the start... otherwise we get all creeps
						// trying to path in the same tick.
						if ((creep.mem.pTgtRoom == creep.setupRoom && !creep.mem.mS) || Math.random() < 0.25) {
							creep.uncachedMoveTo(new RoomPosition(25,
														 		  25,
																  creep.setupRoom),
												20,
												moveOptions);
						}
						// console.log(Game.cpu.getUsed())
					}
				}
			}
		}
		else {
			if (Game.cpu.getUsed() > 500 * .75) {
				return;
			}

			var moveOptions = {"avoidHostiles": 1, "avoidEnemyRooms" : 1, "noiseMap": 1, "maxOps" : 2000};
			var combatMoveOptions = {"avoidEnemyRooms" : 1, "avoidCombatEdges" : 1, "noiseMap": 1, "maxOps" : 1000, "maxRooms": 1};

			if (creep.mem.retreat) {
				creep.uncachedMoveTo(new RoomPosition(Game.rooms[creep.mem.fallbackRoom].mem.fallbackX || 25,
											 		  Game.rooms[creep.mem.fallbackRoom].mem.fallbackY || 25,
													  creep.mem.fallbackRoom),
									3,
									moveOptions);
				// creep.uncachedMoveTo(new RoomPosition(Game.rooms[creep.mem.fallbackRoom].mem.fallbackX || 25,
				// 							 		  Game.rooms[creep.mem.fallbackRoom].mem.fallbackY || 25,
				// 									  creep.mem.fallbackRoom),
				// 					1,
				// 					moveOptions);
			}
			else if (creep.room.name != creep.mem.targetRoom) {
				creep.uncachedMoveTo(new RoomPosition(Memory.rooms[creep.mem.targetRoom].twrX[0] || 25,
											 		  Memory.rooms[creep.mem.targetRoom].twrY[0] || 25,
													  creep.mem.targetRoom),
									1,
									moveOptions);
			}
			else {
				var towers = creep.room.getTowers();


				if (towers.length) {
					target = creep.pos.findClosestByRange(towers);
				}
				else {
					var spawns = creep.room.find2(FIND_HOSTILE_SPAWNS);
					target = creep.pos.findClosestByRange(spawns);
				}

				if (!target) {
					var secondaryTargets = creep.room.find2(creep.room.getAllHostileCreepsAndPowerCreeps()).concat(creep.room.find2(FIND_HOSTILE_STRUCTURES));
					target = creep.pos.findClosestByRange(secondaryTargets)
				}

				if (target && (!target.structureType || (target.structureType != STRUCTURE_CONTROLLER && target.structureType != STRUCTURE_KEEPER_LAIR))) {
					if (creep.pos.getRangeTo(target) > 1) {
						creep.uncachedMoveTo(target, 1, combatMoveOptions);
					}
					else {
						if (creep.hasActiveBodypart(ATTACK)) {
							attacked = true;
							creep.attack(target);
						}
						else {
							creep.suicide();
						}
					}

				}
			}
		}

		if (Game.cpu.bucket >= 3000 && !creep.mem.retreat) {
			if (!attacked) {
				var secondaryTargets = creep.pos.findInRange(creep.room.getAllHostileCreepsAndPowerCreeps(), 1).concat(creep.pos.findInRange(FIND_HOSTILE_STRUCTURES, 1));
				if (secondaryTargets.length >= 1) {
					creep.attack(secondaryTargets[0]);
				}
			}
		}
		// console.log(Game.cpu.getUsed() - start)
	},

	// Healer is in change of moving us
	runPairedPowerTank: function(creep) {
		// TODO: Remove. Grandfathered
		creep.mem.alwaysPulled = 1
		if (creep.room.dangerous) {
			let target = creep.pos.findFirstInRange(FIND_HOSTILE_CREEPS, 1)
			if (target) {
				creep.attack(target)
				return
			}
		}
		if (creep.hits == creep.hitsMax) {
			let powerBank = creep.pos.findFirstInRange(creep.room.powerBanks, 1)
			if (powerBank) {
				creep.attack(powerBank)
			}
		}
	},

	runPairedPowerHealer: function(creep) {
		var moveOptions = {"avoidEnemyRooms" : 1};

		let buddy = Game.creeps[creep.mem.pairedName];

		if (!buddy || buddy.spawning) {
			if (Math.random() < 0.05) {
				creep.move(Math.ceil(Math.random() * 8))
			}
		}
		else if (creep.pos.isNearToRoomObject(buddy) || util.isEdgeOfRoom(creep.pos) || util.isEdgeOfRoom(buddy.pos)) {
			let powerPos = new RoomPosition(creep.mem.target.x, creep.mem.target.y, creep.mem.target.roomName);


			// Budy wants boosts
			if (buddy.getBoosts(false, true)) {
				let boost = Object.keys(buddy.mem.targetBoosts)[0]
				for (let lab of buddy.room.labs) {
					if (!buddy.room.mem.labMemory || !buddy.room.mem.labMemory[lab.id]) continue;

					if (lab.mineralType == boost && buddy.room.mem.labMemory[lab.id].lockedForBoosts) {
						if (creep.pos.isNearToPos(lab.pos)) {
							snakeAI.moveSnake([creep.name, creep.mem.pairedName], buddy.pos, moveOptions, 0, false, false)
						}
						else {
							snakeAI.moveSnake([creep.name, creep.mem.pairedName], lab.pos, moveOptions, 1, false, false)
						}
						break;
					}
				}
				// Might want them too
				creep.getBoosts(false, true)
			}
			else if (creep.getBoosts(true, true)) {
				return
			}
			else if (creep.mem.powerKilled || (creep.room.name == powerPos.roomName && !creep.room.powerBanks.length)) {
				creep.mem.powerKilled = 1;
				buddy.mem.powerKilled = 1;

				let target = Game.rooms[creep.mem.sR].getUnboostLab();
				if (!target) {
					target = Game.rooms[creep.mem.sR].spawns[0]
				}
				if (creep.pos.isNearToPos(target.pos)) {
					changeCreepRole(creep, "recycler")
					changeCreepRole(buddy, "recycler")
					return this.runRecycler(creep);
				}
				else {
					snakeAI.moveSnake([creep.name, creep.mem.pairedName], target.pos, {}, 1, false, false)
				}
			}
			else if (creep.room.name == powerPos.roomName && buddy.pos.isNearToPos(powerPos)) {
				creep.heal(buddy)
			}
			else if (creep.room.name == powerPos.roomName && creep.pos.isNearToPos(powerPos)) {
				// Got to pull it into to the last step. Do that with a swap
				snakeAI.moveSnake([creep.name, creep.mem.pairedName], buddy.pos, moveOptions, 0, false, false)
			}
			else {
				// console.log(creep, buddy)
				snakeAI.moveSnake([creep.name, creep.mem.pairedName], powerPos, moveOptions, 1, false, false)
			}
		}
		else {
			creep.uncachedMoveTo(buddy, 1)
		}
	},

	// Healer is in change of moving us
	runPowerTank: function(creep) {		
		if (creep.room.name != creep.mem.target.roomName) {
			let moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.5, "minKD" : -0.5};
			creep.cachedMoveTo(new RoomPosition(creep.mem.target.x, creep.mem.target.y, creep.mem.target.roomName), 4, moveOptions);
			let enemy = creep.pos.findFirstInRange(FIND_HOSTILE_CREEPS, 1)
			if (enemy) {
				creep.attack(enemy)
			}
			return;
		}

		var targets = creep.room.powerBanks;

		// Done!
		if (targets.length == 0) {
			return
		}

		if (creep.room.dangerous) {
			return this.runTank(creep)
		}
		else if (creep.hits > creep.hitsMax * .5 - 100 || creep.ticksToLive < 20 || Memory.season3) {
			var ret = creep.attack(targets[0]);
			if (ret == ERR_NOT_IN_RANGE) {
				creep.cachedMoveTo(targets[0], 1)
			}
			// Hack - not sure why he thinks he's stuck. Probably because it only gets cleared
			// on a successful move
			else if (ret == OK) {
				creep.mem.mS = 0;
			}
		}

		return
	},

	runPowerHealer: function(creep) {
		if (creep.hits != creep.hitsMax) {
			creep.heal(creep)
		}

		if (creep.room.name != creep.mem.target.roomName) {
			let moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.5, "minKD" : -0.5};
			creep.cachedMoveTo(new RoomPosition(creep.mem.target.x, creep.mem.target.y, creep.mem.target.roomName), 4, moveOptions);
			return 0;
		}

		var powerBanks = creep.room.powerBanks;

		if (powerBanks.length == 0) {
			return 
		}

		var targets = creep.room.find(FIND_MY_CREEPS, {
			filter: (targetCreep) => {
				return targetCreep.hits <= 0.5 * targetCreep.hitsMax && targetCreep.mem && targetCreep.mem.role && targetCreep.mem.role == "newPowerTank";
			}
		});

		if (!targets.length) {			
			targets = creep.room.find(FIND_MY_CREEPS, {
				filter: (targetCreep) => {
					return targetCreep.mem && targetCreep.mem.role && targetCreep.mem.role == "newPowerTank";
				}
			});
		}

		// Sit around
		if (targets.length == 0) {
			creep.cachedMoveTo(new RoomPosition(creep.mem.target.x, creep.mem.target.y, creep.mem.target.roomName), 4);
			return 0;
		}

		if (targets[0] && ((targets[0].mem.mS || 0) >= 2 || (creep.pos.findFirstInRange(powerBanks, 1) && !targets[0].pos.findFirstInRange(powerBanks, 1)))) {
			// Aaah, my tank is stuck! Maybe it's my fault? I don't know. I'm going to move!
			creep.move(Math.floor(Math.random() * 8) + 1)
		}

		if (creep.hits == creep.hitsMax) {
			if (creep.heal(targets[0]) == ERR_NOT_IN_RANGE) {
				creep.moveTo(targets[0])
				creep.rangedHeal(targets[0])
			}
		}
		else {
			creep.heal(creep)
		}

		return 0
	},

	runPowerScout(creep) {
		let moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.5, "minKD" : -0.5};


		if (Game.cpu.bucket < 4000 && Math.random() < 0.5) {
			return;
		}
		if (Game.cpu.bucket < 2000 && Math.random() < 0.5) {
			return;
		}
		if (Game.cpu.bucket < 1500 && Math.random() < 0.5) {
			return;
		}
		if (Game.cpu.bucket < 1000 && Math.random() < 0.5) {
			return;
		}
		if (Game.cpu.bucket < 750) {
			return;
		}

		var cpuStart = Game.cpu.getUsed();
		if (cpuStart > 300) {
			return;
		}

		if (!creep.mem.scoutRooms || !creep.mem.scoutRooms.length || !creep.mem.targetRoom) {
			creep.mem.scoutRooms = _.clone(Memory.rooms[creep.mem.sR].powerRooms)
		}

		if (!creep.mem.scoutRooms.length) {
			return
		}

		if (util.isEdgeOfRoom(creep.pos)) {
			_.pull(creep.mem.scoutRooms, creep.room.name);
		}

		if (creep.mem.targetRoom && Game.rooms[creep.mem.targetRoom]) {
			creep.mem.targetRoom = undefined;
		}

		if (!creep.mem.targetRoom) {
			let bestRoom 
			let bestScore = -Infinity
			for (let scoutRoomName of creep.mem.scoutRooms) {
				let score = 0
				if (!Memory.rooms[scoutRoomName]) {
					score = 1e9
				}
				else {
					score = Game.time - Memory.rooms[scoutRoomName].lo
				}

				if (score > bestScore) {
					bestScore = score
					bestRoom = scoutRoomName
				}
			}

			creep.mem.targetRoom = bestRoom		
		}

		if (creep.mem.targetRoom) {
			var targetPos = new RoomPosition(25, 25, creep.mem.targetRoom);
			creep.cachedMoveTo(targetPos, 24, moveOptions);
		}
	},




	runBoostGrabber: function(creep) {
		var moveOptions = {"avoidEnemyRooms" : 1, "avoidHostiles": 1, "reusePath" : (creep.room.dangerous ? 5 : undefined)};

		if (creep.mem.retreat) {
			creep.uncachedMoveTo(new RoomPosition(Memory.rooms[creep.mem.fallbackRoom].fallbackX || 25,
										 		  Memory.rooms[creep.mem.fallbackRoom].fallbackY || 25,
												  creep.mem.fallbackRoom),
								1,
								moveOptions);
			return;
		}

		if (creep.room.name != creep.mem.targetRoom) {
			creep.uncachedMoveTo(new RoomPosition(25, 25, creep.mem.targetRoom),
						 10,
						 moveOptions);
			return;
		}

		var resource = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
			filter: function(resource) {
				return resource.resourceType != RESOURCE_ENERGY && creep.pos.getRangeTo(resource) < resource.amount;
			}
		});

		let tombStone = creep.pos.findClosestByRange(FIND_TOMBSTONES, {
			filter: function(tombStone) {
				// more than one key means energy + something else.
				return Object.keys(tombStone.store).length > 1;
			}
		});

		var lootEnemy = undefined;
		if (tombStone) {
			let mineral = Object.keys(tombStone.store)[1];
			var err = creep.withdraw(tombStone, mineral)
			if (err == ERR_NOT_IN_RANGE) {
				creep.uncachedMoveTo(tombStone, 1)
			}
		}
		else if (resource) {
			var err = creep.pickup(resource)
			if (err == ERR_NOT_IN_RANGE) {
				creep.uncachedMoveTo(resource, 1)
			}
		}
		else {
			lootEnemy = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS, {
				filter: function(creep) {
					return creep.hasBoost() && !creep.hasDamagingBodypart(false);
				}
			});

			if (lootEnemy) {
				creep.uncachedMoveTo(lootEnemy, 1)
			}
		}

		if (!resource && !tombStone && !lootEnemy) {
			var boostedEnemy = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS, {
				filter: function(creep) {
					return creep.hasBoost();
				}
			});

			if (!boostedEnemy) {
				changeCreepRole(creep, "fetcher")
				creep.mem.f = 0;
				delete creep.mem.ID;
				return this.runFetcher(creep);
			}
			else if (creep.pos.getRangeTo(boostedEnemy) >= 7) {
				creep.uncachedMoveTo(boostedEnemy, 6, moveOptions);
			}
			else if (creep.pos.getRangeTo(boostedEnemy) < 7) {
				var result = PathFinder.search(creep.pos, {pos: boostedEnemy.pos, range: 6}, {flee: true});
				creep.moveByPath(result.path);
			}
		}
	},


	runKeeperGuard1: function(creep) {
		if (creep.mem.targetRoom != creep.room.name) {
			creep.cachedMoveTo(new RoomPosition(25, 25, creep.mem.targetRoom), 20);
			if (creep.hits != creep.hitsMax) creep.heal(creep)
		}
		else {
			var enemies = creep.room.find2(FIND_HOSTILE_CREEPS, {
				filter: function(object) {
					return (object.hasActiveBodypart(ATTACK) || object.hasActiveBodypart(RANGED_ATTACK) || object.hasActiveBodypart(HEAL))  && object.owner.username != "Source Keeper";
				}
			});

			if (enemies.length > 0) {
				var closestEnemy = creep.pos.findClosestByRange(enemies);

				var closestThreat = creep.pos.findClosestByRange(enemies, {
					filter: function(object) {
						return (object.hasActiveBodypart(ATTACK) || object.hasActiveBodypart(RANGED_ATTACK)) && object.owner.username != "Source Keeper";
					}
				});

				if (!closestEnemy) {
					closestEnemy = creep.pos.findClosestByRange(creep.room.getAllHostileCreepsAndPowerCreeps());
				}
				if (!closestThreat) {
					closestThreat = creep.pos.findClosestByRange(creep.room.getAllHostileCreepsAndPowerCreeps());
				}


				var healthy = creep.hits > 4 * creep.hitsMax / 5;
				if (healthy) {
					creep.moveTo(closestEnemy, {range : 0, ignoreCreeps: creep.pos.getRangeTo(closestThreat) < 3,
						costCallback: function(roomName, costMatrix) {
							for (var i = 0; i < 50; i++) {
								costMatrix.set(i, 0, 64);
								costMatrix.set(i, 49, 64);
								costMatrix.set(0, i, 64);
								costMatrix.set(49, i, 64);
							}
							if (!util.isNearEdgeOfRoom(creep.pos, 2)) {
								for (var i = 0; i < 50; i++) {
									costMatrix.set(i, 1, 32);
									costMatrix.set(i, 48, 32);
									costMatrix.set(1, i, 32);
									costMatrix.set(48, i, 32);
								}
							}
						}
					});

					// if (creep.pos.getRangeTo(closestThreat) <= 3) {
					// 	creep.rangedAttack(closestThreat);
					// }
					// if (creep.pos.getRangeTo(closestThreat) <= 2) {
					// 	var result = PathFinder.search(creep.pos, {pos: closestThreat.pos, range: 3}, {flee: true});
					// 	creep.moveByPath(result.path);
					// }
					if (creep.pos.getRangeTo(closestEnemy) <= 1) {
						creep.attack(closestEnemy);
					}
					else if (creep.hits != creep.hitsMax) {
						creep.heal(creep)
					}

					if (creep.pos.getRangeTo(closestEnemy) <= 3) {
						var massDamage = 0;
						for (var i in enemies) {
							if (creep.pos.getRangeTo(enemies[i]) == 3) massDamage += 1;
							else if (creep.pos.getRangeTo(enemies[i]) == 2) massDamage += 4;
							else if (creep.pos.getRangeTo(enemies[i]) == 1) massDamage += 10;
						}
						//
						if(massDamage >= 10) {
							creep.rangedMassAttack();
						}
						else {
							creep.rangedAttack(closestEnemy);
						}

					}

					// if (creep.pos.getRangeTo(closestThreat) <= 2) {
					// 	var result = PathFinder.search(creep.pos, {pos: closestThreat.pos, range: 3}, {flee: true});
					// 	creep.moveByPath(result.path);
					// }
				}
				else {
					var friends = creep.room.find2(FIND_MY_CREEPS, {
						filter: function(object) {
							return object != creep;
						}
					});

					if (friends.length > 0) {
						var fleeGoals = [];
						for (var enemy of enemies) {
							fleeGoals.push({pos: enemy.pos, range: 5})
						}
						var result = PathFinder.search(creep.pos, fleeGoals, {flee: true});
						creep.moveByPath(result.path);
					}
					else {
						creep.uncachedMoveTo(new RoomPosition(25, 25, creep.mem.sR), 20);
					}

					creep.heal(creep)

					if (creep.pos.getRangeTo(closestEnemy) <= 3) {
						var massDamage = 0;
						for (var i in enemies) {
							if (creep.pos.getRangeTo(enemies[i]) == 3) massDamage += 1;
							else if (creep.pos.getRangeTo(enemies[i]) == 2) massDamage += 4;
							else if (creep.pos.getRangeTo(enemies[i]) == 1) massDamage += 10;
						}
						//
						if(massDamage >= 10) {
							creep.rangedMassAttack();
						}
						else {
							creep.rangedAttack(closestEnemy);
						}

					}
				}
			}
			else {
				var friend = creep.pos.findClosestByRange(FIND_MY_CREEPS, {
					filter: function(object) {
						return object.hits != object.hitsMax && (!object.hasActiveBodypart(HEAL) || (object.hits < 0.5 * object.hitsMax && closestEnemy));
					}
				});

				if (creep.hits != creep.hitsMax) creep.heal(creep)

				if (friend > 0) {
					if (creep.pos.isNearTo(friend)) {
						if (creep.hits == creep.hitsMax) creep.heal(friend)
					}
					else {
						creep.uncachedMoveTo(friend, 1);
						if (creep.hits == creep.hitsMax) creep.rangedHeal(friend)
					}
				}
				else {
					if (creep.mem.targetRoom2) {
						var tmp = creep.mem.targetRoom;
						creep.mem.targetRoom = creep.mem.targetRoom2
						if (creep.mem.targetRoom3) {
							creep.mem.targetRoom2 = creep.mem.targetRoom3
							if (creep.mem.targetRoom4) {
								creep.mem.targetRoom3 = creep.mem.targetRoom4;
								creep.mem.targetRoom4 = tmp;
							}
							else {
								creep.mem.targetRoom3 = tmp;
							}
						}
						else {
							creep.mem.targetRoom2 = tmp;
						}
					}
					creep.cachedMoveTo(new RoomPosition(25, 25, creep.mem.targetRoom), 23);
				}
			}
		}
	},

	runKeeperGuard2: function(creep) {
		// console.log(creep.name, creep.room.name, creep.mem.targetRoom)

		if (!creep.mem.targetRoom) {
			var otherGuards = _.filter(Game.creeps, (otherCreep) => (otherCreep.mem.role == 'keeperGuard2' && otherCreep != creep));

			for (var keeperRoom of Game.rooms[creep.mem.sR].keeperHarvestRooms) {
				var valid = true;
				for (var otherGuard of otherGuards) {
					if (otherGuard.mem.targetRoom == keeperRoom) {
						valid = false;
						break;
					}
				}
				if (valid) {
					creep.mem.targetRoom = keeperRoom;
					break;
				}
			}
		}

		if (!creep.mem.targetRoom) {
			if (creep.room.dangerous || creep.hits != creep.hitsMax) {
				this.runTank(creep)
			}
			return;
		}

		delete creep.mem.engaged

		if (creep.mem.travelDistance && creep.ticksToLive == Math.round(creep.body.length * 4.5 + creep.mem.travelDistance)) {
			var guards = _.filter(Game.creeps, (creep) => creep.mem.role == 'keeperGuard2');

			var currentCount = 0;
			for (var guard of guards) {
				if (guard.mem.targetRoom == creep.mem.targetRoom) {
					currentCount++;
				}
			}

			if (Game.rooms[creep.mem.sR] && Game.rooms[creep.mem.sR].keeperHarvestRooms.includes(creep.mem.targetRoom)) {
				if (currentCount == 1 && Game.rooms[creep.mem.sR]) {
					let spawn = Game.rooms[creep.mem.sR].find(FIND_MY_SPAWNS)[0];
					if (spawn) {
						spawn.addPrioritySpawn("keeperGuard2", {"targetRoom": creep.mem.targetRoom});
						console.log("keeperGuard 2 respawn for", creep.mem.targetRoom)
					}
				}
			}

		}

			// console.log(creep.name, creep.room.name, creep.mem.targetRoom)

		if (creep.room.name != creep.mem.targetRoom) {
			if (creep.mem.pTgtRoom === creep.mem.targetRoom && creep.mem.keeperPath) {
				let moveOpts = {"avoidEnemyRooms": 1, "maxRooms" : 2, "ignoreKeepers": undefined, "noRePathOnOptsChange" : 1}
				creep.cachedMoveTo(new RoomPosition(creep.mem.pTX, creep.mem.pTY, creep.mem.pTgtRoom), 1, moveOpts);
			}
			else {				
				let moveOpts;
				if (creep.room.dangerous) {
					moveOpts = {"avoidEnemyRooms" : 1, "avoidHostiles" : 2, "maxDT" : 1.5, "minKD" : -0.5};
				}
				else {
					moveOpts = {"avoidEnemyRooms" : 1, "maxDT" : 1.5, "minKD" : -0.5, "noRePathOnOptsChange" : 1};
				}

				creep.cachedMoveTo(new RoomPosition(25, 25, creep.mem.targetRoom), 20, moveOpts);
			}
			if (creep.hits != creep.hitsMax) creep.heal(creep)
		}
		else {
			creep.mem.keeperPath = 0
			if (!creep.mem.travelDistance) {
				creep.mem.travelDistance = CREEP_LIFE_TIME - creep.ticksToLive;
			}

			let targetRoom = Game.rooms[creep.mem.targetRoom];

			var enemies = targetRoom.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK], true);

			var sourceKeepers = _.filter(enemies, (otherCreep) => otherCreep.owner.username == "Source Keeper");

			// console.log(enemies, sourceKeepers)

			var closeNonSKs = [];
			let invaders = []
			if (enemies.length != sourceKeepers.length) {
				invaders = _.filter(enemies, function(object) {return object.owner.username == "Invader"})
				if (!invaders) {					
					closeNonSKs = creep.pos.findInRange(enemies, 5, {
						filter: function(object) {
							return object.owner.username != "Source Keeper";
						}
					});
				}
			}

			var isCloseNonSk = closeNonSKs.length > 0;

			if (invaders.length || isCloseNonSk) {
				creep.healOrdersGiven = 0
				return this.runTank(creep)
			}

			let acted = false;

			// console.log(creep.name, sourceKeepers)

			if (sourceKeepers.length > 0 && creep.room.name == creep.mem.targetRoom) {
				delete creep.mem.targetLair
				var healthy;
				if (isCloseNonSk) {
					healthy = creep.hits > 4 * creep.hitsMax / 5;
				}
				else {
					healthy = creep.hits > 1 * creep.hitsMax / 3;
				}
				if (healthy) {
					var closestTarget = creep.pos.findClosestByRange(sourceKeepers);
					var closestEnemy;
					if (creep.pos.getRangeTo(closestTarget) == 1) {
						closestEnemy = closestTarget;
					}
					else {
						closestEnemy = creep.pos.findClosestByRange(creep.room.getAllHostileCreepsAndPowerCreeps());
					}

					if (creep.mem.lastEnemy && closestTarget.id != creep.mem.lastEnemy && creep.pos.getRangeTo(closestTarget) > 3 && Game.getObjectById(creep.mem.lastEnemy)) {
						closestTarget = Game.getObjectById(creep.mem.lastEnemy)
					}


					let range = creep.pos.getRangeTo(closestEnemy);
					if (range <= 3 || range > 6 || creep.hits > 4 * creep.hitsMax / 5) {
						let moveOpts = {"avoidEnemyRooms": 1, "maxRooms" : creep.room == targetRoom ? 2 : undefined, "ignoreKeepers": creep.room == targetRoom ? 1 : undefined}
						creep.mem.keeperPath = 1
						creep.cachedMoveTo(closestTarget, 1, moveOpts);

						creep.mem.lastEnemy = closestTarget.id
					}

					// if (creep.pos.isNearTo(closestEnemy)) {
					// 	creep.attack(closestEnemy);
					// 	acted = true;
					// }

					if (creep.pos.isNearTo(closestEnemy) && closestEnemy.owner.username != "Source Keeper") {
						creep.attack(closestEnemy);
						acted = true;
					}
					else if (creep.pos.isNearTo(closestEnemy) && !closestEnemy.hasActiveBodypart(ATTACK)) {
						creep.attack(closestEnemy);
						acted = true;
					}
					else if (creep.hits != creep.hitsMax) {
						creep.heal(creep)
						if (!creep.fatigue && !closestEnemy.fatigue && creep.pos.isNearToPos(closestEnemy.pos)) {							
							let terrain = Game.map.getRoomTerrain(creep.room.name)
							if (!terrain.get(closestEnemy.pos.x, closestEnemy.pos.y)) {
								creep.uncachedMoveTo(closestEnemy.pos, 0)
							}
						}
						acted = true;
					}
				}
				else {
					creep.uncachedMoveTo(new RoomPosition(25, 25, creep.mem.sR), 10);
					creep.heal(creep)
					acted = true;
				}
			}
			else if (isCloseNonSk) {
				creep.uncachedMoveTo(new RoomPosition(25, 25, creep.mem.sR), 10);
				creep.heal(creep)
				acted = true;
			}
			else {
				if (creep.hits != creep.hitsMax) {
					creep.heal(creep)
					acted = true;
				}

				if (!creep.mem.targetLair) {
					var keeperLairs = targetRoom.getSKLairs();

					var minSpawnTime = Infinity;
					creep.mem.targetLair = undefined;

					for (var keeperLair of keeperLairs) {
						if (keeperLair.ticksToSpawn < minSpawnTime) {
							minSpawnTime = keeperLair.ticksToSpawn
							creep.mem.targetLair = keeperLair.id;
						}
					}
				}

				if (creep.mem.targetLair && Game.getObjectById(creep.mem.targetLair)) {
					let moveOpts = {"avoidEnemyRooms": 1, "maxRooms" : creep.room == targetRoom ? 2 : undefined, "ignoreKeepers": creep.room == targetRoom ? 1 : undefined}
					creep.mem.keeperPath = 1
					creep.cachedMoveTo(Game.getObjectById(creep.mem.targetLair), 1, moveOpts);
				}
			}

			if (!acted) {
				let healTarget = creep.pos.findClosestByRange(creep.room.getMyInjuredCreeps());

				if (healTarget) {
					if (creep.pos.getRangeTo(healTarget) == 1) {
						creep.heal(healTarget);
					}
					else if (creep.pos.getRangeTo(healTarget) <= 3) {
						creep.rangedHeal(healTarget);
					}
				}
			}

		}
		skirmisherRangedAttackAndHeal(creep)
	},

	runBoostedHarvester: function(creep) {
		if (creep.getBoosts()) {
			return
		}

		if (creep.mem.replaced && creep.ticksToLive <= creep.mem.travelDistance + 1) {
			if (creep.hasBoost()) {
				delete creep.mem.hSource
				changeCreepRole(creep, "recycler")
				// creep.mem.role = "recycler"
				creep.drop(RESOURCE_ENERGY)
				return this.runRecycler(creep)
			}
		}

		return this.runHarvester(creep)
	},

	runHarvester: function(creep) {
		var mem = creep.mem;

		if (mem.travelDistance && !mem.replaced && creep.ticksToLive <= creep.body.length * CREEP_SPAWN_TIME + mem.travelDistance + 1 && Game.rooms[mem.sR]) {
			mem.replaced = 1
			// We have guys doing nothing. Let them do it.
			if (Game.getObjectById(mem.hSource) && (!Memory.rooms[mem.sR].idleHarvesters || (Game.getObjectById(mem.hSource).effects || []).length || (Memory.season3 && Game.getObjectById(mem.hSource).room.find(FIND_SOURCES).length == 1))) {
				if (Game.rooms[mem.sR].regularHarvestRooms.includes(creep.room.name) || 
					Game.rooms[mem.sR].centreHarvestRooms.includes(creep.room.name) || 
					Game.rooms[mem.sR].keeperHarvestRooms.includes(creep.room.name)) {
					// I've seen multiple harvesters on one patch, not quite sure how, but check against it.
					let harvesters = _.filter(util.getAllHarvesters(), (c) => c.mem.hSource == mem.hSource);

					if (harvesters.length == 1 && Game.getObjectById(mem.hSource)) {
						let spawn = Game.rooms[mem.sR].find(FIND_MY_SPAWNS)[0];

						let newRole = mem.role == "bHarvester" ? "harvester" : mem.role;

						if (spawn && !spawn.hasPrioritySpawn(newRole, {"tLoc": creep.pos, "hSource": mem.hSource})) {
							spawn.addPrioritySpawn(newRole, {"tLoc": creep.pos, "hSource": mem.hSource});
						}
					}
				}
			}
			/*if (creep.mem.role == "bHarvester") {
				if (creep.hasBoost()) {
					delete mem.hSource
					changeCreepRole(creep, "recycler")
					// creep.mem.role = "recycler"
					creep.drop(RESOURCE_ENERGY)
					return this.runRecycler(creep)
				}
			}*/
		}

		if ((!creep.room.controller || !creep.room.controller.owner || !creep.room.controller.my || creep.mem.spooked) && creep.civilianSpookedSK()) {
			// console.log(creep)
			creep.drop(RESOURCE_ENERGY);
			if (!creep.room.keeperRoom) {
				delete mem.container;
				delete mem.primaryTarget;
				delete mem.tLoc;
				delete mem.hSource;
			}
			return;
		}


		if (!mem.hSource && Game.rooms[mem.sR]) {
			if (mem.wT) {
				if (Game.time >= mem.wT) {
					mem.wT = undefined;
				}
				else {
					return;
				}
			}

			delete creep.mem.path

			// This will ping every
			// if (creep.mem.role == "bHarvester") {
			// 	if (creep.getBoosts()) {
			// 		return
			// 	}
			// }
			mem.hpt = mem.hpt || creep.getBoostModifiedHarvest()

			var sources = [];
			let rooms = [];

			if (mem.role == "keeperHarvester2") {
				rooms = Game.rooms[mem.sR].keeperHarvestRooms;
			}
			else if (mem.role == 'centralHarvester') {
				rooms = Game.rooms[mem.sR].centreHarvestRooms;
			}
			else {
				rooms = Game.rooms[mem.sR].regularHarvestRooms;
			}

			for (var roomName of rooms) {
				if (Game.rooms[roomName]) {
					if (Memory.rooms[roomName] && Memory.rooms[roomName].reservedBy && Memory.rooms[roomName].reservedBy != util.getMyName()) {
						continue;
					}

					if (!Game.rooms[roomName].keeperRoom && Game.rooms[roomName].dangerous && roomName !== mem.sR) {
						continue;
					}

					var sectorCoords = util.getSectorCoords(roomName)
					if (sectorCoords.x == 5 && sectorCoords.y == 5) {
						if (mem.role == 'centralHarvester') {
							sources = sources.concat(Game.rooms[roomName].find(FIND_SOURCES));
						}
					}
					else if (sectorCoords.x <= 6 && sectorCoords.x >= 4 && sectorCoords.y <= 6 && sectorCoords.y >= 4 && !(sectorCoords.x == 5 && sectorCoords.y == 5)) {
						if (mem.role == 'keeperHarvester2') {
							sources = sources.concat(Game.rooms[roomName].find(FIND_SOURCES));
						}
					}
					else if (mem.role == 'harvester' || mem.role == 'bHarvester') {
						if (!Game.rooms[roomName].keeperRoom) {
							sources = sources.concat(Game.rooms[roomName].find(FIND_SOURCES));
						}
					}
				}
			}

			if (mem.role == "centralHarvester" && sources.length == 0) {
				changeCreepRole(creep, "harvester");
				return this.runHarvester(creep);
			}

			var harvesters = util.getAllHarvesters();

			for (let pass = 0; pass < 2; pass++) {				
				for (var sourceIdx in sources) {
					var source = sources[sourceIdx];
					let currentHpt = 0;
					let numHarvesters = 0;
					let valid = true;

					let tiles = source.pos.countAccessibleTiles();

					if (source.room.dangerous == 2 && source.room.controller && source.room.controller.my && source.room.mem.ID) {
						let segementData = segments.loadSegmentData(50 + source.room.mem.ID % 45);
						if (segementData) {
							let floodedDesign = segementData[source.room.name].floodedDesign;
							if (floodedDesign) {
								valid == false

								for (let i = -1; i <= 1; i++) {
									for (let j = -1; j <= 1; j++) {
										let des = parseInt(floodedDesign[source.pos.x + i][source.pos.y + j])

										if (des >= 1) {
											valid = true;
											break
										}
									}
								}


							}
							else {
								valid = false;
							}
						}
						else {
							valid = false;
						}
					}

					for (var harvesterIdx in harvesters) {
						if (harvesters[harvesterIdx].mem.hSource == source.id) {
							numHarvesters++

							// Don't double up if there's any source free
							if (pass == 0) {
								valid = false
								break
							}
							else {								
								let otherHarvester = harvesters[harvesterIdx];
								otherHarvester.mem.hpt = otherHarvester.mem.hpt || otherHarvester.getBoostModifiedHarvest()

								currentHpt += otherHarvester.mem.hpt;
								if (currentHpt >= source.energyCapacity / ENERGY_REGEN_TIME || numHarvesters >= tiles) {
									valid = false;
									break;
								}
							}
						}
					}
					if (valid) {
						mem.hSource = source.id;
						mem.tLoc = source.pos
						break;
					}
				}
				if (mem.hSource) {
					break
				}
			}

			if (!mem.hSource) {
				// Should we just recycle?
				let localHarvesterNames = []
				localHarvesterNames = localHarvesterNames.concat(Memory.rooms[mem.sR].ownedCreeps["harvester"] || [])
				localHarvesterNames = localHarvesterNames.concat(Memory.rooms[mem.sR].ownedCreeps["bHarvester"] || [])
				localHarvesterNames = localHarvesterNames.concat(Memory.rooms[mem.sR].ownedCreeps["centralHarvester"] || [])
				localHarvesterNames = localHarvesterNames.concat(Memory.rooms[mem.sR].ownedCreeps["keeperHarvester2"] || [])

				let numIdle = 1
				for (let localHarvesterName of localHarvesterNames) {
					let localHarvester = Game.creeps[localHarvesterName]
					if (!localHarvester) {
						continue
					}
					if (localHarvester == creep) {
						continue
					}
					if (localHarvester.mem.hSource && localHarvester.ticksToLive < 100) {
						let claimed = 0
						for (let otherLocalHarvesterName of localHarvesterNames) {
							let otherLocalHarvester = Game.creeps[otherLocalHarvesterName]
							if (!otherLocalHarvester) {
								continue
							}
							if (otherLocalHarvester.mem.hSource == localHarvester.mem.hSource && otherLocalHarvester.ticksToLive >= 100) {
								claimed = 1
								break;
							}
						}

						if (!claimed) {							
							numIdle--
						}
						continue
					}
					if (!localHarvester.mem.hSource && (localHarvester.mem.wT || 0) >= Game.time) {
						numIdle++
					}
				}

				if (numIdle > 1) {
					changeCreepRole(creep, "recycler")
					return this.runRecycler(creep)
				}
				else {					
					Memory.rooms[mem.sR].idleHarvesters = 1;
					if (Game.cpu.bucket < 9000) {
						mem.wT = Game.time + 10;
					}
				}

				return
			}
			else {
				delete Memory.rooms[mem.sR].idleHarvesters;
			}
		}



		if (mem.wT) {
			if (Game.time >= mem.wT) {
				mem.wT = undefined;
			}
			else {
				return;
			}
		}


		if (mem.hSource) {
			// Smart-assery doesn't work in a post power world
			// if (creep.room.controller && creep.room.controller.my && mem.hpt && mem.travelDistance) {
			// 	if (mem.hpt >= 42) {
			// 		if (Game.time % 4) {
			// 			return;
			// 		}
			// 	}
			// 	else if (mem.hpt >= 32) {
			// 		if (Game.time % 3) {
			// 			return;
			// 		}
			// 	}
			// 	else if (mem.hpt >= 22 && Game.time % 2) {
			// 		return;
			// 	}
			// }

			if ((mem.simpleHarvest || 0) > 0) {
				mem.simpleHarvest--
				if (creep.harvest(Game.getObjectById(mem.hSource)) != OK) {
					delete mem.simpleHarvest
				}
				return
			}

			delete mem.simpleHarvest


			mem.hpt = mem.hpt || creep.getBoostModifiedHarvest()


			var repairing = false;
			var movingToContainer = false;
			// console.log(creep, creep.getStoreUsedCapacity(), creep.carryCapacity - Math.min(50, mem.hpt))
			if (creep.carryCapacity && creep.getStoreUsedCapacity() > creep.carryCapacity - Math.min(50, mem.hpt)) {
				// If the timing happens just wrong we can run away and get a bad dTgt. Hmmph.
				if ((!mem.primaryTarget || !Game.getObjectById(mem.primaryTarget)) &&
						(Game.getObjectById(mem.hSource) &&
						 creep.room.name == Game.getObjectById(mem.hSource).room.name &&
						 creep.pos.inRangeToPos(Game.getObjectById(mem.hSource).pos, 2))) {

					var targets = []
					if (creep.room.controller && creep.room.controller.my) {
						targets = Game.getObjectById(mem.hSource).pos.findInRange(FIND_MY_STRUCTURES, 2, {
							filter: (structure) => {
								if (structure.structureType == STRUCTURE_STORAGE) {
									return true;
								}
								if (structure.structureType == STRUCTURE_LINK) {
									return true;
								}
							}
						});
					}

					if (targets.length == 0 || !mem.container) {
						let containers = Game.getObjectById(mem.hSource).pos.findInRange(creep.room.containers, 1);

						if (containers.length > 0) {
							if (containers.length > 1) {
								for (let container of containers) {
									let anyUsingContainer = _.some(util.getAllHarvesters(), (c) => c.mem.hSource != mem.hSource && c.mem.container == container.id);
									if (!anyUsingContainer) {
										mem.container = container.id;
										break
									}
								}
							}
							if (!mem.container) {
								mem.container = containers[0].id;
							}

							if (targets.length == 0) {
								if (Game.getObjectById(mem.container)) {
									targets = [Game.getObjectById(mem.container)];
								}
								else {
									delete mem.container
								}
							}
						}
					}

					if (targets.length > 0) {
						if (targets.length > 1) {
							mem.primaryTarget = creep.pos.findClosestByRange(targets).id
						}
						else {
							mem.primaryTarget = targets[0].id;
						}
					}

					if (!mem.primaryTarget) {
						let constructionSites = creep.pos.lookFor(LOOK_CONSTRUCTION_SITES);

						if (constructionSites.length && constructionSites[0].my) {
							creep.build(constructionSites[0]);
						}
					}
				}
				let extensionDrop = false;
				if (creep.room.controller && creep.room.controller.my && creep.room.energyAvailable != creep.room.energyCapacityAvailable) {
					if (creep.pos.x > 0 && creep.pos.x < 49 && creep.pos.y > 0 && creep.pos.y < 49) {
						var structures = creep.room.lookForAtArea(LOOK_STRUCTURES, creep.pos.y - 1, creep.pos.x - 1, creep.pos.y + 1, creep.pos.x + 1, true);
						for (var structure of structures) {
							if (structure.structure.structureType == STRUCTURE_EXTENSION && structure.structure.energy < structure.structure.energyCapacity) {
								let currentE = creep.getStoreUsedCapacity()
								if (creep.transfer(structure.structure, RESOURCE_ENERGY) == OK) {
									let delta = Math.min(structure.structure.energyCapacity - structure.structure.energy, currentE)
									Game.haulerTransferredEnergy += delta
									creep.room.haulerTransferredEnergy += delta
								}

								extensionDrop = true;
								break;
							}
						}
					}
				}

				if (mem.primaryTarget && Game.getObjectById(mem.primaryTarget)) {
					if (!extensionDrop) {
						var container = Game.getObjectById(mem.primaryTarget)
						if (container.structureType == STRUCTURE_CONTAINER) {
							if (!Game.getObjectById(mem.hSource)) {
								mem.primaryTarget = undefined;
							}
							else if (!Game.getObjectById(mem.hSource).pos.isNearToPos(container.pos)) {
								mem.primaryTarget = undefined;
							}
							else {
								if (!creep.pos.isEqualTo(container.pos)) {
									creep.transfer(container, RESOURCE_ENERGY)
									let occupied = false
									for (let otherCreep of container.pos.lookFor(LOOK_CREEPS)) {
										if (otherCreep.mem.role == "harvester") {
											occupied = true
											break
										}
									}
									let moveOptions;
									if (creep.room.dangerous) {
										moveOptions = {"avoidEnemyRooms" : 1, "avoidHostiles" : (creep.hits == creep.hitsMax ? 2 : 8), "maxDT" : 1.25, "minKD" : -0.5};
									}
									else {
										moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.25, "minKD" : -0.5};
									}
									if (occupied) {
										creep.uncachedMoveTo(Game.getObjectById(mem.hSource), 1, moveOptions);
									}
									else {								
										movingToContainer = true;

										creep.uncachedMoveTo(container, 0, moveOptions);
									}
								}
								// if (creep.carryCapacity > 0 && container.hits < container.hitsMax * .8) {
								if (container.hits < container.hitsMax * .8) {
									repairing = creep.repair(container) == OK;
									repairing = true;
								}
							}
						}
						else {
							if (container.structureType == STRUCTURE_LINK && container.energy >= container.energyCapacity) {
								mem.primaryTarget = undefined;
							}
							else {
								let ret = creep.transfer(container, RESOURCE_ENERGY)
								let currentE = creep.getStoreUsedCapacity()
								if (ret == OK) {
									let delta = Math.min(container.energyCapacity - container.energy, currentE);
									Game.haulerTransferredEnergy += delta
									creep.room.haulerTransferredEnergy += delta
								}
								else if (ret == ERR_NOT_IN_RANGE) {									
									movingToContainer = true;
									let moveOptions;
									if (creep.room.dangerous) {
										moveOptions = {"avoidEnemyRooms" : 1, "avoidHostiles" : (creep.hits == creep.hitsMax ? 2 : 8), "maxDT" : 1.25, "minKD" : -0.5};
									}
									else {
										moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.25, "minKD" : -0.5};
									}

									// if (creep.pos.getRangeTo(container) <= 3) {
										creep.uncachedMoveTo(container, 1, moveOptions);
									// }
									// else {
									// 	mem.primaryTarget = undefined;
									// }
								}


							}
						}
					}
				}

			}
			if (!movingToContainer) {
				var source = Game.getObjectById(mem.hSource);
				if (!source && mem.tLoc) {
					let moveOptions;
					if (creep.room.dangerous) {
						moveOptions = {"avoidEnemyRooms" : 1, "avoidHostiles" : (creep.hits == creep.hitsMax ? 2 : 8), "maxDT" : 1.25, "minKD" : -0.5};
					}
					else {
						moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.25, "minKD" : -0.5};
					}

					creep.cachedMoveTo(new RoomPosition(mem.tLoc.x, mem.tLoc.y, mem.tLoc.roomName), 1, moveOptions)
				}
				else {
					if (!repairing) {
						var err;
						if (!creep.pos.isNearToPos(source.pos)) {
							err = ERR_NOT_IN_RANGE
						}
						else if (source.energy === 0) {
							err = ERR_NOT_ENOUGH_RESOURCES;
						}
						else {
							let acted = false;
							var container = Game.getObjectById(mem.primaryTarget)
							if (container && container.structureType == STRUCTURE_CONTAINER) {
								if (container.hits < container.hitsMax * .9 && creep.getStoreUsedCapacity() > 0) {
									if (container.store.getUsedCapacity() >= container.storeCapacity - (mem.hpt || 0)) {
										creep.repair(container);
										acted = true;
										err = OK;
									}
								}
								else if (container.store.getUsedCapacity() >= container.storeCapacity) {
									let ticksToClear = source.energy / (mem.hpt || 1);

									// Container is full and we can have time spare to clear it
									// So just nap a bit
									if (source.ticksToRegeneration !== undefined && (source.ticksToRegeneration || ENERGY_REGEN_TIME) > ticksToClear + 10 && creep.ticksToLive > ticksToClear + 10 && !(source.effects || []).length) {
										acted = true;
										mem.wT = Game.time + 8;
										err = OK;
									}
								}
								if (!acted) {
									let freeCap = container.store.getFreeCapacity()
									if (freeCap >= (mem.hpt || 0) && !creep.room.isMyRoom() && Game.cpu.bucket < 9900) {
										mem.simpleHarvest = Math.min(20, Math.floor(Math.min(source.energy / mem.hpt, freeCap / mem.hpt)));
									}								
									err = creep.harvest(source)
									acted = true
								}
							}
							if (!acted) {
								err = creep.harvest(source)
							}
						}

						if (err === ERR_NOT_IN_RANGE) {
							if (!mem.container) {
								let container = Game.getObjectById(mem.hSource).pos.findFirstInRange(creep.room.containers, 1);

								if (container) {
									mem.container = container.id;
								}
							}

							let moveOptions;
							if (creep.room.dangerous) {
								moveOptions = {"avoidEnemyRooms" : 1, "avoidHostiles" : (creep.hits == creep.hitsMax ? 2 : 8), "maxDT" : 1.25, "minKD" : -0.5};
							}
							else {
								moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.25, "minKD" : -0.5};
							}


							// console.log(Game.getObjectById(mem.primaryTarget))
							if (mem.container && Game.getObjectById(mem.container)) {
								creep.cachedMoveTo(Game.getObjectById(mem.container), 0, moveOptions);
							}
							else {
								creep.cachedMoveTo(source, 1, moveOptions);
							}
						}
						else if (err === ERR_NOT_ENOUGH_RESOURCES) {
							let acted = false;
							if (creep.getStoreUsedCapacity() > 0 && mem.primaryTarget) {
								var container = Game.getObjectById(mem.primaryTarget)
								if (container && container.structureType == STRUCTURE_CONTAINER) {
									if (container.hits < container.hitsMax * .95) {
										creep.repair(container);
										acted = true;
									}
								}
							}
							else if (source.ticksToRegeneration !== undefined && (source.ticksToRegeneration || ENERGY_REGEN_TIME) > creep.ticksToLive) {
								// We have guys doing nothing. Let them do it.

								if (mem.travelDistance && !mem.replaced && creep.ticksToLive > creep.body.length * CREEP_SPAWN_TIME + mem.travelDistance + 1) {								
									mem.replaced = 1
									if (source && (!Memory.rooms[mem.sR].idleHarvesters || (source.effects || []).length || (Memory.season3 && source.room.find(FIND_SOURCES).length == 1))) {
										if (Game.rooms[mem.sR].regularHarvestRooms.includes(creep.room.name) || 
											Game.rooms[mem.sR].centreHarvestRooms.includes(creep.room.name) || 
											Game.rooms[mem.sR].keeperHarvestRooms.includes(creep.room.name)) {
											// I've seen multiple harvesters on one patch, not quite sure how, but check against it.
											var harvesters = _.filter(util.getAllHarvesters(), (c) => c.mem.hSource == mem.hSource);


											if (harvesters.length == 1 && Game.getObjectById(mem.hSource)) {
												let spawn = Game.rooms[mem.sR].find(FIND_MY_SPAWNS)[0];

												let newRole = mem.role == "bHarvester" ? "harvester" : mem.role;

												if (spawn && !spawn.hasPrioritySpawn(newRole, {"tLoc": creep.pos, "hSource": mem.hSource})) {
													spawn.addPrioritySpawn(newRole, {"tLoc": creep.pos, "hSource": mem.hSource});
												}
											}
										}
									}
								}

								let fetchers = creep.pos.findInRange(FIND_MY_CREEPS, 1, {filter: (otherCreep) => {return otherCreep.mem.role == "fetcher"}})

								for (let fetcher of fetchers) {
									delete fetcher.mem.wT
								}

								/*if (mem.role == "bHarvester") {
									if (creep.hasBoost()) {
										mem.role = "recycler"
										creep.drop(RESOURCE_ENERGY)
										return this.runRecycler(creep)
									}
								}*/

								creep.suicide()
								return
							}

							var droppedEnergy = creep.pos.lookFor(LOOK_RESOURCES)[0];

							if (droppedEnergy && droppedEnergy.resourceType == RESOURCE_ENERGY) {
								creep.pickup(droppedEnergy)
							}
							else if (source.ticksToRegeneration !== undefined && !acted) {
								if ((source.effects || []).length) {
									mem.wT = Game.time + Math.min(POWER_INFO[PWR_REGEN_SOURCE].period, (source.ticksToRegeneration - POWER_INFO[PWR_REGEN_SOURCE].period));
								}
								else {
									mem.wT = Game.time + (source.ticksToRegeneration || ENERGY_REGEN_TIME);	
								}
								
							}
						}
						else if (err === OK && !mem.travelDistance) {
							let spawn = Game.rooms[mem.sR].find(FIND_MY_SPAWNS)[0];
							if (spawn) {
								var pathResult = PathFinder.search(spawn.pos, {pos: creep.pos, range: 1})
								if (pathResult.incomplete == false) {
									if (mem.role == "bHarvester") {
										// We have to go there and back again, so need to spawn earlier
										mem.travelDistance = Math.max(40, Math.round(pathResult.path.length * 1.5))
									}
									else {
										mem.travelDistance = pathResult.path.length
									}
									// Gonna be here a while, so clean up
									delete mem.pTX;
									delete mem.pTY;
									delete mem.pTgtRoom;
									delete mem.pO;
									delete mem.path;
									delete mem.mS;
									delete mem.lP;
								}
								else {
									mem.travelDistance = 5;
								}
							}
							else {
								mem.travelDistance = 5;
							}

						}
						else if (err === ERR_NO_BODYPART) {
							creep.suicide()
						}
					}
				}
			}
		}
	},	

	runDoubleHarvester: function(creep, secondCall) {
		var mem = creep.mem;

		if (creep.civilianSpookedNonSK()) {
			creep.drop(RESOURCE_ENERGY);
			delete mem.targetContainer;
			delete mem.targetSource;
			delete mem.targetPos;
			return;
		}

		if (mem.wT) {
			if (Game.time >= mem.wT) {
				mem.wT = undefined;
			}
			else {
				return;
			}
		}
		mem.hpt = mem.hpt || creep.getBoostModifiedHarvest()

		if (!mem.targetRoom && Game.rooms[mem.sR]) {
			// mem.hpt = mem.hpt || (creep.getActiveBodyparts(WORK) * 2)

			let availableRoomNames = [];
			let rooms = Game.rooms[mem.sR].doubleHarvestRooms;

			for (var roomName of rooms) {
				if (Game.rooms[roomName]) {
					if (Memory.rooms[roomName] && Memory.rooms[roomName].reservedBy && Memory.rooms[roomName].reservedBy != util.getMyName()) {
						continue;
					}

					if (Game.rooms[roomName].dangerous && roomName !== creep.mem.sR) {
						continue;
					}

					availableRoomNames.push(roomName);
				}
			}

			var harvesters = _.filter(Game.creeps, (creep) => creep.mem.role == 'doubleHarvester');

			for (var availableRoomName of availableRoomNames) {
				let valid = true;

				for (var harvesterIdx in harvesters) {
					if (harvesters[harvesterIdx].mem.targetRoom == availableRoomName) {
						valid = false;
						break;
					}
				}
				if (valid) {
					mem.targetRoom = availableRoomName;
					break;
				}
			}

			if (!mem.targetRoom) {
				creep.mem.wT = Game.time + 10;
				return
			}
		}

		function tryRespawn() {
			if (_.includes(Game.rooms[mem.sR].doubleHarvestRooms, creep.room.name)) {
				// I've seen multiple harvesters on one patch, not quite sure how, but check against it.
				var harvesters = _.filter(Game.creeps, (c) => (c.mem.role == 'doubleHarvester' && c.mem.targetRoom == creep.room.name));

				if (harvesters.length == 1) {
					let spawn = Game.rooms[creep.mem.sR].find(FIND_MY_SPAWNS)[0];
					if (spawn && !spawn.hasPrioritySpawn(mem.role, {"targetRoom": mem.targetRoom})) {
						spawn.addPrioritySpawn(mem.role, {"targetRoom": mem.targetRoom});
					}
				}
			}
		}


		if (mem.travelDistance && creep.ticksToLive === creep.body.length * CREEP_SPAWN_TIME + mem.travelDistance + 1 && Game.rooms[mem.sR]) {
			tryRespawn();		
		}

		if (mem.targetRoom) {
			if (!mem.targetPos) {
				// Go to the one with most energy/cooldown, if we know. 
				if (Game.rooms[mem.targetRoom]) {
					let bestScore = -Infinity;
					let bestSource;
					let bestContainer;
					for (let source of Game.rooms[mem.targetRoom].find(FIND_SOURCES)) {
						let container = source.pos.findFirstInRange(Game.rooms[mem.targetRoom].containers, 1);

						// TODO: This isn't a great heuristic. We'll see how it works.
						let score = source.energy / (source.ticksToRegeneration || 1) - (source.ticksToRegeneration || 0);

						// Go to empty containers first.
						if (!container || container.store.getUsedCapacity() >= container.storeCapacity - (mem.hpt || 0)) {
							score -= 100
						}
						if (score > bestScore) {
							bestContainer = container;
							bestSource = source;
							bestScore = score;
						}

					}

					mem.targetSource = bestSource.id;


					if (bestContainer) {					
						mem.targetContainer = bestContainer.id;
						mem.targetPos = bestContainer.pos;
					}
					else {
						mem.targetPos = bestSource.pos;
					}
				}
				// Otherwise, go to closest
				else {
					let sourcePos0 = new RoomPosition(roomIntel.getSourceX(mem.targetRoom, 0), roomIntel.getSourceY(mem.targetRoom, 0), mem.targetRoom)
					let sourcePos1 = new RoomPosition(roomIntel.getSourceX(mem.targetRoom, 1), roomIntel.getSourceY(mem.targetRoom, 1), mem.targetRoom)

					if (creep.pos.getWorldRangeToPos(sourcePos0) < creep.pos.getWorldRangeToPos(sourcePos1)) {
						mem.targetPos = sourcePos0;
					}
					else {
						mem.targetPos = sourcePos1;	
					}
				}
			}

			let moveRange = mem.targetContainer ? 0 : 1

			if (creep.room.name != mem.targetRoom || !creep.pos.inRangeToPos(mem.targetPos, moveRange)) {
				creep.cachedMoveTo(mem.targetPos, moveRange, {});
				if (!mem.targetSource && Game.rooms[mem.targetRoom]) {
					let bestScore = -Infinity;
					let bestSource;
					let bestContainer;
					for (let source of Game.rooms[mem.targetRoom].find(FIND_SOURCES)) {
						let container = source.pos.findFirstInRange(Game.rooms[mem.targetRoom].containers, 1);

						// TODO: This isn't a great heuristic. We'll see how it works.
						let score = source.energy / (source.ticksToRegeneration || 1) - (source.ticksToRegeneration || 0);

						// Go to empty containers first.
						if (!container || container.store.getUsedCapacity() >= container.storeCapacity - (mem.hpt || 0)) {
							score -= 100
						}
						if (score > bestScore) {
							bestContainer = container;
							bestSource = source;
							bestScore = score;
						}

					}

					mem.targetSource = bestSource.id;


					if (bestContainer) {					
						mem.targetContainer = bestContainer.id;
						mem.targetPos = bestContainer.pos;
					}
					else {
						mem.targetPos = bestSource.pos;
					}
				}
				return;
			}
			
			if (secondCall) {
				if (mem.lastTargetPos.x == mem.targetPos.x && mem.lastTargetPos.y == mem.targetPos.y) {
					mem.wT = Game.time + 5;
				}
				return;
			}

			// If we're here we should have a target source, possibly a target container, and be next to the source and (if it exists) on the container
			if (mem.simpleHarvest && Game.time % 5) {
				creep.harvest(Game.getObjectById(mem.targetSource))
				return
			}
			mem.simpleHarvest = 0

			if (!mem.travelDistance) {				
				let spawn = Game.rooms[mem.sR].find(FIND_MY_SPAWNS)[0];
				if (spawn) {
					var pathResult = PathFinder.search(spawn.pos, {pos: creep.pos, range: 1})
					if (pathResult.incomplete == false) {
						mem.travelDistance = pathResult.path.length
						// Gonna be here a while, so clean up
						delete creep.mem.pTX;
						delete creep.mem.pTY;
						delete creep.mem.pTgtRoom;
						delete creep.mem.pO;
						delete creep.mem.path;
						delete creep.mem.mS;
						delete creep.mem.lP;
					}
					else {
						mem.travelDistance = 5;
					}
				}
				else {
					mem.travelDistance = 5;
				}
			}


			let source = Game.getObjectById(mem.targetSource);
			let container = Game.getObjectById(mem.targetContainer)

			let acted;

			if (container) {
				if (container.hits < container.hitsMax * .9 && creep.getStoreUsedCapacity() > 0) {
					if (creep.repair(container) == OK) {
						acted = true;
					}
				}
				if (!acted && container.store.getUsedCapacity() >= container.storeCapacity - (mem.hpt || 0) - creep.getStoreUsedCapacity() && source.ticksToRegeneration) {
					// New source

					if (creep.getStoreUsedCapacity()) {
						creep.drop(RESOURCE_ENERGY)
					}

					mem.lastTargetPos = mem.targetPos

					delete mem.targetContainer;
					delete mem.targetSource;
					delete mem.targetPos;

					return this.runDoubleHarvester(creep, true)
				}
			}
			if (!acted) {
				creep.harvest(source)
				if (source.energy <= mem.hpt) {
					// New source
					if (creep.getStoreUsedCapacity()) {
						creep.drop(RESOURCE_ENERGY)
					}

					mem.lastTargetPos = mem.targetPos

					delete mem.targetContainer;
					delete mem.targetSource;
					delete mem.targetPos;


					return this.runDoubleHarvester(creep, true)
				}
				else if (container) {
					if (container.store.getUsedCapacity() < container.storeCapacity - creep.getStoreUsedCapacity() - (mem.hpt || 0) * 5) {
						mem.simpleHarvest = 1;
					}
				}
			}
		}
	},

	runMiner: function(creep) {
		var mem = Memory.creeps[creep.name];

		if (creep.mem.hSource == undefined && Game.rooms[creep.mem.sR]) {
			if (creep.getBoosts()) {
				return
			}
			var minerals = []

			for (var roomName of [creep.mem.sR].concat(Game.rooms[creep.mem.sR].keeperHarvestRooms).concat(Game.rooms[creep.mem.sR].centreHarvestRooms)) {
				if (Game.rooms[roomName]) {
					minerals = minerals.concat(Game.rooms[roomName].find2(FIND_MINERALS, {
						filter: (mineral) => {
							if (mineral.mineralAmount == 0) return false;

							if (Memory.season5 && mineral.mineralType == RESOURCE_THORIUM) {
								return false
							}

							var structures = Game.rooms[roomName].lookForAt(LOOK_STRUCTURES, mineral);

							if (structures.length == 1) {
								structures = _.filter(structures, (structure) => structure.structureType == STRUCTURE_EXTRACTOR && (structure.my || Game.rooms[roomName].keeperRoom || Game.rooms[roomName].centreRoom));
								return structures.length == 1
							}
							return false;
						}
					}));
				}
			}

			var miners = _.filter(Game.creeps, (creep) => creep.mem.role == 'miner');

			for (var mineralIdx in minerals) {
				var mineral = minerals[mineralIdx];
				var valid = true;
				for (var minerIdx in miners) {
					if (miners[minerIdx].mem.hSource == mineral.id) {
						valid = false;
						break;
					}
				}
				if (valid) {
					creep.mem.hSource = mineral.id;
					break;
				}
			}
		}

		if (creep.civilianSpookedSK()) {
			return;
		}


		if (mem.travelDistance && !mem.replaced && creep.ticksToLive <= mem.travelDistance + 1 && Game.rooms[mem.sR]) {
			mem.replaced = 1
			if (creep.hasBoost()) {
				delete creep.mem.hSource
				creep.mem.role = "recycler"
				return this.runRecycler(creep)
			}
		}


		if (creep.mem.hSource != undefined) {
			var movingToContainer = false;
			// If the timing happens just wrong we can run away and get a bad dTgt. Hmmph.

			if (!creep.mem.container || !Game.getObjectById(creep.mem.container)) {
				var source = Game.getObjectById(creep.mem.hSource);
				if (source) {
					var containers = source.pos.findInRange(creep.room.containers, 1);

					if (containers.length > 0) {
						if (containers.length > 1) {
							for (let container of containers) {
								let flags = container.pos.lookFor(LOOK_FLAGS)
								for (let flag of flags) {
									if (flag.name.startsWith("sourceContainer_6")) {
										creep.mem.container = container.id;
									}
								}
							}
							if (!creep.mem.container) {
								creep.mem.container = creep.pos.findClosestByRange(containers).id
							}
						}
						else {
							creep.mem.container = containers[0].id;
						}
					}
				}
			}


			if (creep.mem.container && Game.getObjectById(creep.mem.container)) {
				var container = Game.getObjectById(creep.mem.container)
				if (!creep.pos.isEqualTo(container.pos)) {
					movingToContainer = true;
					creep.cachedMoveTo(container, 0)
				}
			}
			if (!movingToContainer) {
				var source = Game.getObjectById(creep.mem.hSource);
				if (!source && creep.mem.tLoc) {
					creep.cachedMoveTo(new RoomPosition(creep.mem.tLoc.x, creep.mem.tLoc.y, creep.mem.tLoc.roomName), 1)
				}
				else {
					var err = creep.harvest(source)
					if(err == ERR_NOT_IN_RANGE) {
						creep.cachedMoveTo(source, 1);
					}
					else if (err == OK && !creep.mem.travelDistance) {
						let spawn = Game.rooms[creep.mem.sR].find(FIND_MY_SPAWNS)[0];
						if (spawn) {
							creep.mem.travelDistance = Math.max(75, PathFinder.search(spawn.pos, creep.pos, {range: 1}).path.length * 2)
						}
					}
				}
			}

		}

		// if (creep.mem.hSource != undefined) {
		// 	if (_.sum(creep.carry) > 0) {
		// 		var containers = creep.pos.findInRange(FIND_STRUCTURES, 4, {
		// 			filter: (structure) => {
		// 				return (structure.structureType == STRUCTURE_CONTAINER || structure.structureType == STRUCTURE_STORAGE);
		// 			}
		// 		});

		// 		if (containers.length > 0) {
		// 			if (creep.transferFirst(containers[0]) == ERR_NOT_IN_RANGE) {
		// 				creep.cachedMoveTo(containers[0], 1);
		// 			}
		// 		}
		// 		else {
		// 			creep.dropAll()
		// 		}
		// 	}
		// 	else {
		// 		var source = Game.getObjectById(creep.mem.hSource);
		// 		if(creep.harvest(source) == ERR_NOT_IN_RANGE) {
		// 			creep.cachedMoveTo(source, 1);
		// 		}
		// 	}
		// }
	},

	runSeason5ThoriumMiner: function(creep) {
		var mem = Memory.creeps[creep.name];

		if (creep.mem.hSource == undefined && Game.rooms[creep.mem.sR]) {
			if (creep.getBoosts()) {
				return
			}

			let mineral = Game.rooms[creep.mem.sR].find(FIND_MINERALS, {
				filter: (mineral) => {
					return (mineral.mineralType == RESOURCE_THORIUM);
				}
			})[0]

			if (!mineral) {
				changeCreepRole(creep, "recycler")
				return this.runRecycler(creep)
			}

			creep.mem.hSource = mineral.id;
		}

		if (creep.civilianSpookedNonSK()) {
			return;
		}

		if (creep.ticksToLive < 100) {
			if (creep.store.getUsedCapacity(RESOURCE_THORIUM)) {
				let dropoff = creep.room.storage
				if (creep.pos.inRangeTo(dropoff, 1)) {
					creep.transfer(dropoff, RESOURCE_THORIUM)
				} else {
					creep.cachedMoveTo(dropoff, 1, {maxRooms: 1})
				}
			} 
			else {
				changeCreepRole(creep, "recycler")
				return this.runRecycler(creep)
			}
			return
		}


		if (mem.travelDistance && !mem.replaced && creep.ticksToLive <= mem.travelDistance + 1 && Game.rooms[mem.sR]) {
			mem.replaced = 1
			if (creep.hasBoost()) {
				delete creep.mem.hSource
				changeCreepRole(creep, "recycler")
				return this.runRecycler(creep)
			}
		}

		if (creep.mem.hSource != undefined) {
			let source = Game.getObjectById(creep.mem.hSource);
			if (creep.store.getUsedCapacity(RESOURCE_THORIUM) >= 90 || !source || !source.mineralAmount) {
				let dropoff = creep.room.storage
				if (creep.pos.inRangeTo(dropoff, 1)) {
					creep.transfer(dropoff, RESOURCE_THORIUM)
					if (source) {
						creep.cachedMoveTo(source, 1, {maxRooms: 1})
					}
					else {
						changeCreepRole(creep, "recycler")
						return this.runRecycler(creep)
					}
				} else {
					creep.cachedMoveTo(dropoff, 1, {maxRooms: 1})
				}
			} else {
				if (source.mineralAmount < 200 && !creep.room.mem.claimToUnclaimRoom) {
					delete creep.mem.hSource
					changeCreepRole(creep, "recycler")
					return this.runRecycler(creep)
				}
				let err = creep.harvest(source)
				if (err == ERR_NOT_IN_RANGE) {
					creep.cachedMoveTo(source, 1, {maxRooms: 1});
				}
				else if (err == OK && !creep.mem.travelDistance) {
					let spawn = Game.rooms[creep.mem.sR].find(FIND_MY_SPAWNS)[0];
					if (spawn) {
						creep.mem.travelDistance = Math.max(75, PathFinder.search(spawn.pos, creep.pos, {range: 1}).path.length * 2)
					}
				}
			}
		}
	},


	runSeason5UnclaimEmptier: function(creep) {
		if (!creep.mem.f && creep.getStoreUsedCapacity() == 0) {
			creep.mem.f = 1;
			creep.mem.dTgt = undefined;
		}
		if (creep.mem.f && creep.getStoreUsedCapacity() > (2 * creep.carryCapacity) / 3) {
			creep.mem.f = 0;
			creep.mem.fT = undefined;
		}

		if (creep.mem.sourceRoom) {
			creep.mem.sR = creep.mem.sourceRoom
		}
		
		if (creep.mem.f) {
			if (creep.ticksToLive < 500) {
				changeCreepRole(creep, "fetcher")
				return this.runFetcher(creep)
			}
	 		if (creep.mem.sR != creep.room.name) {
	 			if (Game.rooms[creep.mem.sR] && Game.rooms[creep.mem.sR].terminal) {
	 				creep.cachedMoveTo(Game.rooms[creep.mem.sR].terminal, 1);
	 			}
	 			else if (Game.rooms[creep.mem.sR] && Game.rooms[creep.mem.sR].storage) {
	 				creep.cachedMoveTo(Game.rooms[creep.mem.sR].storage, 1);
	 			}	 			
	 			else {
					creep.cachedMoveTo(new RoomPosition(25, 25, creep.mem.sR), 20);
	 			}
			}
			else {
				var target;
				if (creep.room.terminal) {
					target = creep.room.terminal;
				}
				else if (creep.room.storage) {
					target = creep.room.storage;
				}

				if (target) {
					if (target.store.getUsedCapacity() == 0) {
						creep.mem.f = 0;
						creep.mem.fT = undefined;
					}
					else if (creep.withdrawFirst(target, true) == ERR_NOT_IN_RANGE) {
						creep.cachedMoveTo(target, 1);
					}
				}
			}
		}
		else {
			let moveOptions;
			if (creep.room.dangerous) {
				moveOptions = {"avoidEnemyRooms" : 1, "avoidHostiles" : 2, "maxDT" : 1.25, "minKD" : -0.5};
			}
			else {
				moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.25, "minKD" : -0.5};
			}

			if (creep.mem.targetRoom != creep.room.name) {
	 			if (Game.rooms[creep.mem.targetRoom] && Game.rooms[creep.mem.targetRoom].storage) {
	 				creep.cachedMoveTo(Game.rooms[creep.mem.targetRoom].storage, 1, moveOptions);
	 			}
			}
			else {
				if (creep.room.storage) {
					var ret = creep.transferFirst(creep.room.storage)
					if(ret == ERR_NOT_IN_RANGE) {
						creep.cachedMoveTo(creep.room.storage, 1);
					}
				}
			}
		}

		creep.grabBonusEnergy()
	},


	runSoloKeeperMiner: function(creep) {
		let moveOptions = {"avoidEnemyRooms" : 1, "ignoreKeepers" : 1};

		// console.log(creep, creep.pos)
		var mem = Memory.creeps[creep.name];

		if (creep.getBoosts()) {
			return
		}

		if (creep.combatCivilianSpookedSK()) {
			delete mem.tLoc;
			delete mem.hSource;
			creep.heal(creep);
			return;
		}

		if (creep.store.getUsedCapacity() && creep.store.getUsedCapacity() != creep.store.getUsedCapacity(RESOURCE_ENERGY)) {
			let transferred = false
			for (let otherCreep of creep.pos.findInRange(FIND_MY_CREEPS)) {
				if (otherCreep.mem.role != "fetcher") continue

				if (otherCreep.store.getFreeCapacity() < creep.store.getUsedCapacity()) {
					for (let key in creep.store) {
						if (key != RESOURCE_ENERGY) {
							creep.transfer(otherCreep, key)
							transferred = true
							break
						}
					}
				}
				if (transferred) {
					break
				}
			}
		}


		if (creep.mem.hSource == undefined && Game.rooms[creep.mem.sR]) {
			var minerals = []

			if (Game.rooms[creep.mem.sR].keeperMineRooms.length == 0) {
				return this.runRecycler(creep)
			}

			for (var roomName of Game.rooms[creep.mem.sR].keeperMineRooms) {
				if (Game.rooms[roomName] && !Game.rooms[roomName].centreRoom) {
					minerals = minerals.concat(Game.rooms[roomName].find2(FIND_MINERALS, {
						filter: (mineral) => {
							return (mineral.mineralAmount != 0);
						}
					}));
				}
			}

			// Oh shit, don't do this every tick
			var miners = _.filter(Game.creeps, (creep) => (creep.mem && creep.mem.role == 'soloKeeperMiner'));

			for (var mineralIdx in minerals) {
				var mineral = minerals[mineralIdx];
				var valid = true;
				for (var minerIdx in miners) {
					if (miners[minerIdx].mem.hSource == mineral.id) {
						valid = false;
						break;
					}
				}
				if (valid) {
					creep.mem.hSource = mineral.id;
					creep.mem.tLoc = mineral.pos;
					break;
				}
			}

			if (!creep.mem.hSource) {
				if (!creep.mem.tLoc) {
					let mineralLocs = []

					for (var roomName of Game.rooms[creep.mem.sR].keeperMineRooms) {
						var roomPos = util.getSectorCoords(roomName);

						if (Memory.rooms[roomName] && !(roomPos.x == 5 && roomPos.y == 5) && Memory.rooms[roomName].mineralAmount) {
							let mX = roomIntel.getMineralX(roomName);
							let mY = roomIntel.getMineralY(roomName);

							mineralLocs = mineralLocs.concat({roomName: roomName, x: mX, y: mY});
						}
					}

					for (var mineralIdx in mineralLocs) {
						var mineralLoc = mineralLocs[mineralIdx];
						var valid = true;
						for (var minerIdx in miners) {
							let minerTLoc = miners[minerIdx].mem.tLoc
							if (minerTLoc && mineralLoc && minerTLoc.roomName == mineralLoc.roomName && minerTLoc.x == mineralLoc.x && minerTLoc.y == mineralLoc.y) {
								valid = false;
								break;
							}
						}
						if (valid) {
							creep.mem.tLoc = mineralLoc;
							break;
						}
					}

				}

				if (creep.mem.tLoc) {
					creep.uncachedMoveTo(new RoomPosition(creep.mem.tLoc.x, creep.mem.tLoc.y, creep.mem.tLoc.roomName), 1);
				}
			}

			if (creep.mem.tLoc && Memory.rooms[creep.mem.tLoc.roomName]) {
				Memory.rooms[creep.mem.tLoc.roomName].lastSKM = Game.time;
			}
		}

		if (creep.mem.hSource != undefined) {
			var movingToContainer = false;
			// If the timing happens just wrong we can run away and get a bad dTgt. Hmmph.

			if (!creep.mem.container || !Game.getObjectById(creep.mem.container)) {
				let source = Game.getObjectById(creep.mem.hSource);
				if (source) {
					var containers = source.pos.findInRange(creep.room.containers, 1);

					if (containers.length > 0) {
						if (containers.length > 1) {
							creep.mem.container = creep.pos.findClosestByRange(containers).id
						}
						else {
							creep.mem.container = containers[0].id;
						}
					}
					else if (creep.room.name == source.room.name && creep.pos.isNearToPos(source.pos)) {
						// Look for construction sites
						var sites = source.pos.findInRange(FIND_MY_CONSTRUCTION_SITES, 1);

						if (sites.length) {
							for (let resourceName in creep.carry) {
								if (resourceName != RESOURCE_ENERGY) {
									creep.drop(creep.carry[resourceName], resourceName);
								}
							}
							var target = creep.pos.findInRange(FIND_DROPPED_RESOURCES, 1, {
								filter: (resource) => {return resource.resourceType == RESOURCE_ENERGY}
							})[0];

							if (target) {
								creep.pickup(target);
							}
							else {
								var target = creep.pos.findInRange(FIND_TOMBSTONES, 1, {
									filter: (tombStone) => {return tombStone.store[RESOURCE_ENERGY] }
								})[0];
								if (target) {
									creep.withdraw(target, RESOURCE_ENERGY);
								}
							}

							if (creep.carry[RESOURCE_ENERGY] && creep.hits == creep.hitsMax) {
								creep.build(sites[0]);
							}
						}
						else {
							creep.room.createConstructionSite(creep.pos, STRUCTURE_CONTAINER);
						}
					}
				}
			}

			let hostiles = creep.pos.findInRange(creep.room.getAllHostileCreepsAndPowerCreeps(), 4);

			let source = Game.getObjectById(creep.mem.hSource);

			hostiles = hostiles.filter(e => e.owner.username != "Source Keeper" || !source || e.pos.inRangeToPos(source.pos, 5))

			let healed = false;
			if (hostiles.length > 0) {
				let target = creep.pos.findClosestByRange(hostiles);

				if (creep.pos.inRangeToPos(target.pos, 3) || !target.fatigue) {
					creep.uncachedMoveTo(target, 1);
					if (!creep.pos.isNearToPos(target.pos)) {
						for (let resourceName in creep.carry) {
							creep.drop(resourceName, creep.carry[resourceName]);
						}
					}
					if (!target.hasActiveBodypart(ATTACK)) {
						creep.attack(target);
					}
					else {
						creep.heal(creep);
					}
					healed = true;
				}
			}

			if (source && !creep.mem.extractor) {
				creep.mem.extractor = source.pos.lookFor(LOOK_STRUCTURES)[0].id;
			}
			let extractor = Game.getObjectById(creep.mem.extractor);


			if (!healed && creep.hits != creep.hitsMax && (!extractor || extractor.cooldown || !creep.pos.isNearTo(source))) {
				healed = true;
				creep.heal(creep);
			}


			if (hostiles.length == 0 && creep.mem.container && Game.getObjectById(creep.mem.container)) {
				var container = Game.getObjectById(creep.mem.container)
				if (!creep.pos.isEqualTo(container.pos)) {
					movingToContainer = true;

					if (creep.pos.getRangeTo(container) < 4 || creep.hits == creep.hitsMax) {
						creep.cachedMoveTo(container, 0, moveOptions);
						if (creep.hits != creep.hitsMax && !healed) {
							creep.heal(creep);
						}
					}

				}
			}
			if (!movingToContainer) {
				if (hostiles.length == 0 && !source && creep.mem.tLoc) {
					creep.cachedMoveTo(new RoomPosition(creep.mem.tLoc.x, creep.mem.tLoc.y, creep.mem.tLoc.roomName), 1, moveOptions)
				}
				else if (source && extractor) {
					let err = -999;
					if (creep.pos.isNearTo(source))  {
						if (!healed && !extractor.cooldown && (creep.hits == creep.hitsMax || (creep.mem.container && creep.hasActiveBodypart(WORK)))) {
							err = creep.harvest(source)
						}
						else if (!healed && creep.hits != creep.hitsMax) {
							creep.heal(creep);
						}
					}
					else if (hostiles.length == 0 && (creep.pos.getRangeTo(source) < 4 || creep.hits == creep.hitsMax)) {
						creep.cachedMoveTo(source, 1, moveOptions);
					}

					if (err == OK && !creep.mem.travelDistance) {
						let spawn = Game.rooms[creep.mem.sR].find(FIND_MY_SPAWNS)[0];
						if (spawn) {
							creep.mem.travelDistance = PathFinder.search(spawn.pos, creep.pos, {range: 1}).path.length;
						}
					}
				}
			}
		}
		else if (creep.hits != creep.hitsMax) {
			creep.heal(creep)
		}
	},


	runSoloCentreMiner: function(creep) {
		let moveOptions = {"avoidEnemyRooms" : 1};

		// console.log(creep, creep.pos)
		var mem = Memory.creeps[creep.name];

		if (creep.mem.hSource == undefined && Game.rooms[creep.mem.sR]) {
			var minerals = []
			for (var roomName of Game.rooms[creep.mem.sR].keeperMineRooms) {
				if (Game.rooms[roomName] && Game.rooms[roomName].centreRoom) {
					minerals = minerals.concat(Game.rooms[roomName].find(FIND_MINERALS, {
						filter: (mineral) => {
							return (mineral.mineralAmount != 0);
						}
					}));
				}
			}

			var miners = _.filter(Game.creeps, (creep) => creep.mem.role == 'runSoloCentreMiner');

			for (var mineralIdx in minerals) {
				var mineral = minerals[mineralIdx];
				var valid = true;
				for (var minerIdx in miners) {
					if (miners[minerIdx].mem.hSource == mineral.id) {
						valid = false;
						break;
					}
				}
				if (valid) {
					creep.mem.hSource = mineral.id;
					break;
				}
			}
		}

		if (creep.civilianSpookedSK()) {
			delete mem.tLoc;
			delete mem.hSource;
			return;
		}

		if (creep.mem.hSource != undefined) {
			var movingToContainer = false;
			// If the timing happens just wrong we can run away and get a bad dTgt. Hmmph.

			if (!creep.mem.container || !Game.getObjectById(creep.mem.container)) {
				let source = Game.getObjectById(creep.mem.hSource);
				if (source) {
					var containers = source.pos.findInRange(creep.room.containers, 1);

					if (containers.length > 0) {
						if (containers.length > 1) {
							creep.mem.container = creep.pos.findClosestByRange(containers).id
						}
						else {
							creep.mem.container = containers[0].id;
						}
					}
				}
			}

			let hostiles = creep.pos.findInRange(creep.room.getAllHostileCreepsAndPowerCreeps(), 3);

			let source = Game.getObjectById(creep.mem.hSource);
			if (source && !creep.mem.extractor) {
				creep.mem.extractor = source.pos.lookFor(LOOK_STRUCTURES)[0].id;
			}
			let extractor = Game.getObjectById(creep.mem.extractor);

			if (hostiles.length == 0 && creep.mem.container && Game.getObjectById(creep.mem.container)) {
				var container = Game.getObjectById(creep.mem.container)
				if (!creep.pos.isEqualTo(container.pos)) {
					movingToContainer = true;
					creep.cachedMoveTo(container, 0, moveOptions);
				}
			}
			if (!movingToContainer) {
				if (hostiles.length == 0 && !source && creep.mem.tLoc) {
					creep.cachedMoveTo(new RoomPosition(creep.mem.tLoc.x, creep.mem.tLoc.y, creep.mem.tLoc.roomName), 1, moveOptions)
				}
				else if (source) {
					let err = -999;
					if (creep.pos.isNearTo(source))  {
						if (!extractor.cooldown && creep.hasActiveBodypart(WORK)) {
							err = creep.harvest(source)
						}
					}
					else if (hostiles.length == 0) {
						creep.cachedMoveTo(source, 1, moveOptions);
					}

					if (err == OK && !creep.mem.travelDistance) {
						let spawn = Game.rooms[creep.mem.sR].find(FIND_MY_SPAWNS)[0];
						if (spawn) {
							creep.mem.travelDistance = PathFinder.search(spawn.pos, creep.pos, {range: 1}).path.length;
						}
					}
				}
			}
		}
	},


	runPowerFetcher: function(creep, secondCall = false) {
		if (!creep.mem.f && creep.getStoreUsedCapacity() == 0) {
			creep.mem.f = 1;
			creep.mem.dTgt = undefined;
			creep.mem.path = undefined;
			creep.mem.checkedBestDrop = undefined
			if (!creep.mem.ID) {				
				if (Memory.season1 || Memory.season2) {
					changeCreepRole(creep, "seasonFetcher")
					return this.runSeasonFetcher(creep)
				}
				else {
					changeCreepRole(creep, "fetcher")
					return this.runFetcher(creep)
				}
			}

			// changeCreepRole(creep, "fetcher")
			return this.runPowerFetcher(creep, true)
		}
		else if (creep.mem.f && creep.store.getFreeCapacity() == 0) {
			creep.mem.f = 0;
		}

		if (creep.mem.f) {
			if (creep.room.name != creep.mem.targetRoom) {
				creep.cachedMoveTo(new RoomPosition(creep.mem.targetX, creep.mem.targetY, creep.mem.targetRoom), 3);
			}
			else {
				let power = []
				power = power.concat(creep.room.find(FIND_RUINS, {
					filter: (ruin) => {
						return ruin.store[RESOURCE_POWER];
					}
				}));

				power = power.concat(creep.room.find(FIND_DROPPED_RESOURCES, {
					filter: (resource) => {
						return resource.resourceType == RESOURCE_POWER;
					}
				}));

				if (power.length > 0) {
					let err;
					if (power[0].ticksToDecay !== undefined) {
						err = creep.withdraw(power[0], RESOURCE_POWER)
					}
					else {
						err = creep.pickup(power[0])
					}
					if (err == ERR_NOT_IN_RANGE) {
						creep.uncachedMoveTo(power[0], 1)
					}
					else if (err == OK) {
						creep.mem.f = 0;
					}
					else {
						console.log(err, power[0], power[0].destroyTime, power[0].ticksToDecay, power[0].structure)
						throw(new Error("Mysterious pickup error "))
					}
				}
				else {
					var banks = creep.room.powerBanks || [];

					if (banks.length > 0) {
						creep.cachedMoveTo(new RoomPosition(creep.mem.targetX, creep.mem.targetY, creep.mem.targetRoom), 3);
					}
					else {
						if ((Memory.season1 || Memory.season2) && creep.getStoreUsedCapacity() == 0) {
							changeCreepRole(creep, "seasonFetcher")
						}
						else {
							changeCreepRole(creep, "fetcher")
						}
						// creep.mem.role = "fetcher"
					}
				}

			}
		}
		else {
			if (!creep.mem.checkedBestDrop && Game.rooms[creep.mem.sR].terminal) {
				let bestRoom
				let bestScore = Infinity
				// This will change the spawn room of the creep to a closer one if the closer one has a terminal
				// with a slight bias toward the initial room
				for (let room of Game.myRooms) {
					if (!room.terminal) continue
					let dist = safeRoute.getSafeRouteCost(creep.room.name, room.name, true, true)

					if (room.name == creep.mem.sR) {
						dist -= 1
					}

					if (dist < bestScore) {
						bestScore = dist
						bestRoom = room.name
					}
				}

				if (bestRoom) {
					creep.mem.sR = bestRoom
				}

				creep.mem.checkedBestDrop = 1
			}

			if (creep.room.name != creep.mem.sR) {
				if (Game.rooms[creep.mem.sR] && Game.rooms[creep.mem.sR].storage) {
					creep.cachedMoveTo(Game.rooms[creep.mem.sR].storage, 1);
				}
				else {
					creep.cachedMoveTo(new RoomPosition(25, 25, creep.mem.sR), 20);
				}
			}
			else {
				if (creep.mem.dTgt == undefined) {
					let dTgt = creep.room.storage;
					if (!dTgt) {
						dTgt = creep.room.terminal
					}

					if (dTgt) {
						creep.mem.dTgt = dTgt.id
					}
				}

				if(creep.mem.dTgt != undefined) {
					var target = Game.getObjectById(creep.mem.dTgt);
					var ret = creep.transferFirst(target);
					if(ret == ERR_NOT_IN_RANGE) {
						creep.cachedMoveTo(target, 1);
					}
					else if (ret == OK) {
						// creep.mem.role = "fetcher"
						creep.mem.dTgt = undefined
					}
					else {
						creep.mem.dTgt = undefined
					}
				}
			}
		}
	},


	runOpHauler: function(creep) {
		if (!creep.mem.f && creep.getStoreUsedCapacity() == 0) {
			creep.mem.f = 1;
			creep.mem.dTgt = undefined;
			creep.mem.path = undefined;
			if (creep.ticksToLive < 500) {
				changeCreepRole(creep, "fetcher")
				return
			}
		}
		else if (creep.mem.f && creep.store.getFreeCapacity() == 0) {
			creep.mem.f = 0;
		}

		if (creep.mem.ID == 0) {
			changeCreepRole(creep, "fetcher")
			return
		}

		if (creep.mem.f) {
			let target = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
				filter: (dropped) => {
					return dropped.resourceType == RESOURCE_OPS
				}
			});

			if (target) {
				if (!creep.pos.inRangeToPos(target.pos)) {
					creep.uncachedMoveTo(target, 1)
				}
				else {
					creep.pickup(target)
				}
			}
			else {
				let sourceRoom = Game.rooms[creep.mem.sR]
				for (let source of [sourceRoom.terminal, sourceRoom.storage]) {
					// Hmmph.
					if (!source || !source.store[RESOURCE_OPS]) {
						continue;
					}

					if (creep.room.name != creep.mem.sR || !creep.pos.isNearToPos(source.pos)) {
						creep.uncachedMoveTo(source, 1, {avoidEnemyRooms: 1})
						break
					}
					else {
						let pc = Game.powerCreeps[creep.mem.pc];
						if (pc && pc.pos && pc.mem.ID) {	
							let dist = safeRoute.getSafeRouteCost(pc.room.name, creep.room.name, true, true)
							if (dist * 60 > creep.ticksToLive) {
								changeCreepRole(creep, "fetcher")
								return
							}
							else {
								creep.withdraw(source, RESOURCE_OPS, Math.min(source.store[RESOURCE_OPS], creep.store.getFreeCapacity()))
							}
						}			

						break
					}
				}
			}


		}
		else {
			let pc = Game.powerCreeps[creep.mem.pc];

			if (pc && pc.pos && pc.mem.ID) {				
				// Go out to meet
				let roomDist = Game.map.getRoomLinearDistance(creep.room.name, pc.room.name);

				let moveOptions;
				if (creep.room.dangerous) {
					moveOptions = {"avoidEnemyRooms" : 1, "avoidHostiles" : 2, "maxDT" : 1.5, "minKD" : -0.5, "ignoreKeepers": creep.room.name == creep.mem.targetRoom ? 1 : undefined};
				}
				else {
					moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.5, "minKD" : -0.5, "ignoreKeepers": creep.room.name == creep.mem.targetRoom ? 1 : undefined};
				}
				if (roomDist > 1) {
					let pos = new RoomPosition(25, 25, pc.room.name)
					creep.uncachedMoveTo(pos, 22, moveOptions)
				}
				else {
					let moved = false;
					if (creep.pos.isNearToRoomObject(pc)) {
						creep.transfer(pc, RESOURCE_OPS)
					}
					else if (pc.store.getFreeCapacity()) {
						if (pc.room.dangerous) {							
							moved = true;
							creep.uncachedMoveTo(new RoomPosition(25, 25, pc.mem.setupRoom), 20, moveOptions)
						}
						else {
							moved = true;
							creep.uncachedMoveTo(pc, 1, moveOptions)
						}
					}
					if (!moved) {
						// Look for free ramparts
						if (creep.store.getUsedCapacity(RESOURCE_OPS) > pc.store.getFreeCapacity()) {
							// This is lazy. There could be a road or container.
							if (creep.pos.lookFor(LOOK_STRUCTURES).length == 0) {								
								let openRampart = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
									filter: (structure) => {
										return structure.structureType == STRUCTURE_RAMPART && structure.pos.lookFor(LOOK_CREEPS).length == 0 && structure.pos.lookFor(LOOK_POWER_CREEPS).length == 0
									}
								});

								if (openRampart) {
									moved = true;
									creep.uncachedMoveTo(openRampart, 0, moveOptions)
								}
							}
						}
						if (!moved) {
							creep.uncachedMoveTo(new RoomPosition(25, 25, pc.mem.setupRoom), 20, moveOptions)
						}
					}
				}
			}
			else {
				// Shit
				changeCreepRole(creep, "fetcher")
				return
			}
		}
	},

	/*runChainFetcher: function(creep) {
		var mem = creep.mem
		if (creep.civilianSpookedSK()) {
			delete mem.fT;
			return;
		}

		if (creep.fatigue && creep.mem.path && creep.mem.path.length) {
			let nextPos = creep.pos.findPosInDirection(creep.mem.path[0])

			let otherCreep = newPos.lookFor(LOOK_CREEPS)[0]
			if (otherCreep.my && otherCreep.mem.role == "chainFetcher") {

			}

		}


	},*/


	runFetcher: function(creep) {
		// Whatever we were going to do, do it next tick.
		// Some times it is useful to run this tick. Eg. For delivering to upgraders. Mostly "early" game
		if (creep.fatigue && (Game.cpu.bucket < 9000 || creep.mem.f)) return

		var mem = creep.mem
		if (creep.civilianSpookedSK(creep.room.ignoreInvaders)) {
			// If we're unable to get our fetch targets supress new spawns
			Game.rooms[mem.sR].mem.supressFetchers = Math.min(200, Math.max((Game.rooms[mem.sR].mem.supressFetchers || 0), 0) + 1);
			delete mem.fT;
			return;
		}

		if (mem.wT !== undefined && Game.time < mem.wT) {
			delete creep.mem.path
			return;
		}

		// let usedCapacity = creep.store.getUsedCapacity()
		let usedCapacity = creep.getStoreUsedCapacity()
		let carryCapacity = creep.carryCapacity

		if (!mem.f && usedCapacity == 0) {
			if (creep.ticksToLive < 50 && ((Game.cpu.bucket < 8250 && (!global.anySmallHaulers || Game.cpu.bucket < 2000)) || Memory.rooms[creep.mem.sR].spawnUtilization < 0.8)) {
				changeCreepRole(creep, "recycler")
				return this.runRecycler(creep)
			}
			else {
				// Free stuff. Likely to trigger at state change.
				if (usedCapacity != carryCapacity) {
					var target = creep.pos.findFirstInRange(FIND_DROPPED_RESOURCES, 1)
					// var target = creep.pos.findFirstInRange(FIND_DROPPED_RESOURCES, 1)
					if (target) {
						var ret = creep.pickupAndUpdateCarry(target);
						// We've changed weight. Path will be invalid now.
						if (ret == OK && usedCapacity - carryCapacity >= 50) {
							mem.path = undefined
						}
					}
					else {
						target = creep.pos.findFirstInRange(FIND_TOMBSTONES, 1);
						if (target) {
							var ret = creep.withdrawFirst(target);
							// We've changed weight. Path will be invalid now.
							if (ret == OK && usedCapacity - carryCapacity >= 50) {
								mem.path = undefined
							}
						}
						else {
							target = creep.pos.findFirstInRange(FIND_RUINS, 1);
							if (target) {
								var ret = creep.withdrawFirst(target);
								// We've changed weight. Path will be invalid now.
								if (ret == OK && usedCapacity - carryCapacity >= 50) {
									mem.path = undefined
								}
							}
						}
					}
				}

				mem.f = 1;
				mem.dTgt = undefined;
				mem.path = undefined;
				// delete mem.l
			}
		}


		let carry = creep.store;

		let moveOptions;
		if (creep.room.dangerous || creep.hits != creep.hitsMax) {
			moveOptions = {"avoidEnemyRooms" : 1, "avoidHostiles" : 2, "maxDT" : 1.25, "minKD" : -0.5, "ignoreKeepers": (creep.room.name == mem.targetRoom && mem.f) ? 1 : undefined};
		}
		else {
			moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.25, "minKD" : -0.5, "noRePathOnOptsChange": 1, "ignoreKeepers": (creep.room.name == mem.targetRoom && mem.f) ? 1 : undefined};
		}

		/*function disablef() {
			mem.f = 0;
			mem.fT = undefined;
			mem.path = undefined;
			// Free stuff. Likely to trigger at state change.
			if (usedCapacity != creep.carryCapacity) {
				var target = creep.pos.findFirstInRange(FIND_DROPPED_RESOURCES, 1)
				// var target = creep.pos.findFirstInRange(FIND_DROPPED_RESOURCES, 1)
				if (target) {
					var ret = creep.pickup(target);
					// We've changed weight. Path will be invalid now.
					if (ret == OK && usedCapacity - creep.carryCapacity >= 50) {
						mem.path = undefined
					}
				}
				else {
					var target = creep.pos.findFirstInRange(FIND_TOMBSTONES, 1);
					if (target) {
						var ret = creep.withdrawFirst(target);
						// We've changed weight. Path will be invalid now.
						if (ret == OK && usedCapacity - creep.carryCapacity >= 50) {
							mem.path = undefined
						}
					}
					else {
						var target = creep.pos.findFirstInRange(FIND_RUINS, 1);
						if (target) {
							var ret = creep.withdrawFirst(target);
							// We've changed weight. Path will be invalid now.
							if (ret == OK && usedCapacity - creep.carryCapacity >= 50) {
								mem.path = undefined
							}
						}
					}
				}
			}
			delete mem.fct			
		}*/

		let nearlyFull;
		if (usedCapacity >= carryCapacity / 2) {
			nearlyFull = 1
		}
		// if (mem.f && creep.store.getFreeCapacity() == 0 && !mem.withdrawNextTick) {
		if (mem.f && nearlyFull && usedCapacity - carryCapacity == 0 && !mem.withdrawNextTick) {
			mem.f = 0;
			mem.fT = undefined;
			mem.path = undefined;
			// console.log(creep, "repathing as fatching while nearly full")
			// I don't understand why this code existed
			// Free stuff. Likely to trigger at state change.
			/*if (usedCapacity != creep.carryCapacity) {
				var target = creep.pos.findFirstInRange(FIND_DROPPED_RESOURCES, 1)
				// var target = creep.pos.findFirstInRange(FIND_DROPPED_RESOURCES, 1)
				if (target) {
					var ret = creep.pickup(target);
					// We've changed weight. Path will be invalid now.
					if (ret == OK && usedCapacity - creep.carryCapacity >= 50) {
						mem.path = undefined
					}
				}
				else {
					var target = creep.pos.findFirstInRange(FIND_TOMBSTONES, 1);
					if (target) {
						var ret = creep.withdrawFirst(target);
						// We've changed weight. Path will be invalid now.
						if (ret == OK && usedCapacity - creep.carryCapacity >= 50) {
							mem.path = undefined
						}
					}
					else {
						var target = creep.pos.findFirstInRange(FIND_RUINS, 1);
						if (target) {
							var ret = creep.withdrawFirst(target);
							// We've changed weight. Path will be invalid now.
							if (ret == OK && usedCapacity - creep.carryCapacity >= 50) {
								mem.path = undefined
							}
						}
					}
				}
			}*/
			delete mem.fct	
		}

		if (mem.withdrawNextTick) {
			delete mem.withdrawNextTick
		}

		if (usedCapacity - carry[RESOURCE_ENERGY] > 0) {
			// Something has gone wrong - I guess picked up minerals from a corpse.
			// We'd rather have minerals in storage, so assign this guy to another spawn and he can pop the minerals in there.

			if (Game.rooms[mem.sR] && !Game.rooms[mem.sR].storage) {
				// We can arrive in here with a mismatch between carry and getStoreUsedCapacity() due to quick turn-around
				// Double check against creep.store.getUsedCapacty()
				if (creep.store.getUsedCapacity() == usedCapacity) {					
					console.log("Creep is not carrying energy and no storage", creep, mem.sR, usedCapacity, carry.energy)
					for (var spawnName in Game.spawns) {
						var spawn = Game.spawns[spawnName];
						if (spawn.room.storage) {
							mem.sR = spawn.room.name;
							delete mem.fR
							break;
						}
					}
				}
			}
		}



		if (mem.f) {
			if ((mem.fT == undefined || !Game.getObjectById(mem.fT)) && (!mem.fct || Game.time >= mem.fct)) {
				// Pretty unlikely we'll have time to do anything meaningful.
				if (creep.ticksToLive < 20 && usedCapacity == 0 && ((Game.cpu.bucket < 8250 && (!global.anySmallHaulers || Game.cpu.bucket < 2000)) || Memory.rooms[creep.mem.sR].spawnUtilization < 0.8)) {
					changeCreepRole(creep, "recycler");
					this.runRecycler(creep)
					return;
				}

				if (!Memory.rooms[mem.sR].owner) {
					let bestRoom 
					let bestRoomRange = Infinity
					for (let room of Game.myRooms) {
						let range = Game.map.getRoomLinearDistance(room.name, creep.room.name)
						if (range < bestRoomRange) {
							bestRoom = room
							bestRoomRange = range
						}
					}
					if (bestRoom) {
						mem.sR = bestRoom.name
					}
				}

				// var s1 = Game.cpu.getUsed()
				var fetchers = (Memory.rooms[mem.sR].ownedCreeps["fetcher"] || []).concat(Memory.rooms[mem.sR].ownedCreeps["lootFetcher"] || []);

				var targetsDropped = [];

				// 1 is fast on plains
				// 0.5 is fast on roads
				// less is slow
				let numMove = creep.getNumOfBodyPart(MOVE)
				let speed = numMove / (creep.body.length - numMove)

				if (!mem.fR) {
					if (speed >= 0.5 && creep.ticksToLive > 1000) {
						// Fat haulers don't do loot rooms
						mem.fR = _.clone(Game.rooms[mem.sR].goodRooms);
						for (let lootRoom of Game.rooms[mem.sR].lootRooms) {
							if (safeRoute.getSafeRouteCost(lootRoom, mem.sR) * 4 < creep.ticksToLive / 50) {
								mem.fR.push(lootRoom)
							}
						}
					}
					else {
						mem.fR = _.clone(Game.rooms[mem.sR].goodRooms);	
					}
				}

				if (creep.mem.targetRoom && !mem.fR.includes(creep.mem.targetRoom)) {
					mem.fR.push(creep.mem.targetRoom)
				}

				// Well this code can't possibly go wrong...
				if (mem.pIncompleteTick && Game.time - mem.pIncompleteTick < 5) {
					if (mem.fR.length > 1) {
						_.pull(mem.fR, creep.room.name);
					}
					else {
						mem.fR = _.clone(Game.rooms[mem.sR].goodRooms);
					}
				}

				for (var roomIdx in mem.fR) {
					var roomName = mem.fR[roomIdx];
					if (Game.rooms[roomName] && (!Game.rooms[roomName].dangerous || Game.rooms[roomName].keeperRoom)) {
						let droppedResources = Game.rooms[roomName].find(FIND_DROPPED_RESOURCES)

						targetsDropped = targetsDropped.concat(droppedResources);
					}
				}

				var finalTarget;
				let bestScore = -Infinity;

				for (var target of targetsDropped) {
					if (Game.rooms[creep.mem.sR] && !Game.rooms[creep.mem.sR].storage && target.resourceType != RESOURCE_ENERGY) {
						continue
					}
					// Don't haul energy miles
					if (target.resourceType == RESOURCE_ENERGY && !Game.rooms[creep.mem.sR].goodRooms.includes(target.room.name) && safeRoute.getSafeRouteCost(target.room.name, mem.sR, false, false, 3) > (speed >= 1 ? 3 : 2)) {
						continue
					}

					// TODO: This could be more clever. Right now we assume there's 20% more than there actually
					// is to account for travel time. This could be based on distance
					var targetSize = target.amount;

					// Err. Kinda lazy. Assuming there's a harvester of some sort here so it'll be bigger when we get there
					if (target.pos.lookFor(LOOK_CREEPS).length > 0) {
						targetSize *= 1.15
					}
					// Gonna be smaller when we get there
					else {
						// Never want 1 of a thing from the floor
						targetSize -= 1
						targetSize *= 0.95;
					}

					for (var fetcherName of fetchers) {
						if (Game.creeps[fetcherName] && Game.creeps[fetcherName].mem.fT == target.id) {
							targetSize -= Game.creeps[fetcherName].carryCapacity - Game.creeps[fetcherName].getStoreUsedCapacity();
							if (targetSize <= 0) break;
						}
					}

					if (targetSize <= 0) continue;

					// Avoid nasties. This only avoids them at target selection time. I guess that could be an issue.
					if (Game.rooms[target.pos.roomName].dangerous) {
						var hostiles = Game.rooms[target.pos.roomName].getAllHostileCreepsWithBodyParts([ATTACK,RANGED_ATTACK], true);

						if (hostiles.length > 0 && target.pos.findFirstInRange(hostiles, 5)) {
							continue
						}
					}


					let mod;

					if (target.resourceType == RESOURCE_ENERGY) {
						// Don't worry about energy so much if we are a looter
						if (creep.mem.targetRoom && creep.mem.role == "lootFetcher") {
							mod = 1 / 100000;
						}
						else {
							mod = 1;
						}
					}
					else if (COMMODITIES[target.resourceType]) {
						mod = Math.pow(3, ((COMMODITIES[target.resourceType].level || 0) + 1) * 2);
					}
					else if (RECIPES[target.resourceType]) {
						// eh, a bit of a hack
						mod = 5 * (1 + target.resourceType.length)
					}
					else {
						mod = 2;
					}

					let score = targetSize * mod;

					if (Memory.season5 && target.resourceType === RESOURCE_THORIUM) {
						score *= 10
					}

					if (creep.mem.targetRoom && target.room.name == creep.mem.targetRoom) {
						score *= 10;
					}

					if (score > bestScore) {
						finalTarget = target;
						bestScore = score;
					}
				}


				// This seems awfully complicated for just avoiding extra work when two haulers do it in the same tick.
				var targetsContainers = [];
				for (var roomIdx in mem.fR) {
					let roomName = mem.fR[roomIdx];
					if (Game.rooms[roomName] && (!Game.rooms[roomName].dangerous || Game.rooms[roomName].keeperRoom || roomName == mem.sR)) {
						let myRoom = Game.rooms[roomName].controller && Game.rooms[roomName].controller.my
						let looting = !myRoom && Game.rooms[mem.sR] && Game.rooms[mem.sR].effectiveLevel >= 4 && Game.rooms[mem.sR].storage;


						let roomTargetsContainers = Game.rooms[roomName].find(FIND_STRUCTURES, { 
							filter: (structure) => {
								// This looks silly but I'm tired so not "fixing" it.
								if (looting && (structure.structureType == STRUCTURE_STORAGE || structure.structureType == STRUCTURE_TERMINAL || structure.structureType == STRUCTURE_FACTORY)) {
								}
								else if (structure.structureType != STRUCTURE_CONTAINER || roomAI.isDropoffPoint(structure)) {
									return false;
								}
								let otherStructs = structure.pos.lookFor(LOOK_STRUCTURES);
								for (let otherStructure of otherStructs) {
									if (otherStructure.structureType == STRUCTURE_RAMPART && !otherStructure.my && !otherStructure.isPublic) {
										return false;
									}
								}
								if (nearlyFull && !creep.pos.inRangeToPos(structure.pos, 5)) {
									return false;
								}

								let minLoad;
								if (myRoom && Game.rooms[roomName].effectiveLevel >= 7) {
									minLoad = carryCapacity;
								}
								else {
									minLoad = 0;
								}

								return structure.store.getUsedCapacity() > minLoad;
							}
						});

						let tombStones = Game.rooms[roomName].find(FIND_TOMBSTONES, {
							filter: (tombStone) => {
								let otherStructs = tombStone.pos.lookFor(LOOK_STRUCTURES);
								for (let otherStructure of otherStructs) {
									if (otherStructure.structureType == STRUCTURE_RAMPART && !otherStructure.my && !otherStructure.isPublic) {
										return false;
									}
								}
								if (nearlyFull && !creep.pos.inRangeToPos(tombStone.pos, 5)) {
									return false;
								}

								let usedCap = tombStone.store.getUsedCapacity();

								// Sometimes dead creeps leave one energy on a tombstone.
								if (tombStone.store[RESOURCE_ENERGY] == 1 && usedCap == 1) {
									return
								}

								return usedCap > 0;
							}
						});

						let ruins = [];
						ruins = Game.rooms[roomName].find(FIND_RUINS, {
							filter: (ruin) => {
								let otherStructs = ruin.pos.lookFor(LOOK_STRUCTURES);
								for (let otherStructure of otherStructs) {
									if (otherStructure.structureType == STRUCTURE_RAMPART && !otherStructure.my && !otherStructure.isPublic) {
										return false;
									}
								}
								if (nearlyFull && !creep.pos.inRangeToPos(ruin.pos, 5)) {
									return false;
								}

								return ruin.store.getUsedCapacity() > 0;
							}
						});
						

						let priorityTombStone = false;
						for (let tombStone of tombStones) {
							// Resources, this is top proirtoy
							if (Object.keys(tombStone.store).length > 1 && (Game.rooms[mem.sR] && !Game.rooms[mem.sR].storage)) {
								priorityTombStone = true;
								break;
							}
						}

						// Go get the good shit.
						if (priorityTombStone) {
							targetsContainers = _.filter(tombStones, (tombStone) => (Object.keys(tombStone.store).length > 1));
							break;
						}
						else {
							targetsContainers = targetsContainers.concat(roomTargetsContainers).concat(tombStones).concat(ruins);
						}

						if (targetsContainers.length == 0 && nearlyFull) {
							mem.f = 0;
							mem.fT = undefined;
							mem.path = undefined;
							// Free stuff. Likely to trigger at state change.
							if (usedCapacity != carryCapacity) {
								var target = creep.pos.findFirstInRange(FIND_DROPPED_RESOURCES, 1)
								// var target = creep.pos.findFirstInRange(FIND_DROPPED_RESOURCES, 1)
								if (target) {
									var ret = creep.pickupAndUpdateCarry(target);
									// We've changed weight. Path will be invalid now.
									if (ret == OK && usedCapacity - carryCapacity >= 50) {
										mem.path = undefined
									}
								}
								else {
									var target = creep.pos.findFirstInRange(FIND_TOMBSTONES, 1);
									if (target) {
										var ret = creep.withdrawFirst(target);
										// We've changed weight. Path will be invalid now.
										if (ret == OK && usedCapacity - carryCapacity >= 50) {
											mem.path = undefined
										}
									}
									else {
										var target = creep.pos.findFirstInRange(FIND_RUINS, 1);
										if (target) {
											var ret = creep.withdrawFirst(target);
											// We've changed weight. Path will be invalid now.
											if (ret == OK && usedCapacity - carryCapacity >= 50) {
												mem.path = undefined
											}
										}
									}
								}
							}
							delete mem.fct								
							return this.runFetcher(creep)
						}
					}
				}

				let maxRange = creep.ticksToLive / (creep.getNumOfBodyPart(MOVE) >= creep.body.length / 2 ? 2.5 : 3.75)

				// They'll likely run swaps. And we have stuff to pick up from tombstones
				if (Memory.rooms[creep.mem.sR].verySmallHaulers) {
					maxRange *= 8
				}
				else if (Memory.rooms[creep.mem.sR].smallHaulers) {
					maxRange *= 6
				}
				else if (Memory.rooms[creep.mem.sR].mediumHaulers) {
					maxRange *= 3
				}


				for (var target of targetsContainers) {
					let isTombStone = !!target.creep;
					let isRuin = !!target.destroyTime;
					let isContainer = !isRuin && target.structureType == STRUCTURE_CONTAINER;

					let mulModifier = 1
					let addModifier = 0

					let range
					if (isContainer) {
						let harvester = target.pos.findInRange(FIND_MY_CREEPS, 0, {filter: (c) => (c.mem.hpt !== undefined)})[0];

						if (harvester) {								
							let source = target.pos.findFirstInRange(FIND_SOURCES, 1);

							if (source) {
								range = creep.pos.getWorldRangeToPos(target.pos);

								if ((source.energy || 0) < range * (harvester.mem.hpt || 0)) {
									addModifier = (source.energy || 0) + Math.max(0, (range - (source.ticksToRegeneration || ENERGY_REGEN_TIME) * (harvester.mem.hpt || 0)))
								}
								else {
									addModifier = range * (harvester.mem.hpt || 0);
								}
							}
						}
					}

					// Tombstone
					/*else if (isTombStone && Object.keys(target.store).length > 1) {
						mulModifier *= 10000 / target.ticksToDecay;
					}
					else if (isRuin) {
						console.log("TODO: Ruin mod on featcher is stupid")
						// mulModifier *= 1000;
					}*/

					var targetEnergy = (target.store[RESOURCE_ENERGY] || 0) * mulModifier + addModifier;
					var targetStuff = target.store.getUsedCapacity() * mulModifier + addModifier;

					// Don't haul energy miles
					if (Game.map.getRoomLinearDistance(target.room.name, mem.sR) > 3) {
						targetStuff -= targetEnergy
						targetEnergy = 0
					}


					for (var fetcherName of fetchers) {
						if (Game.creeps[fetcherName] && Game.creeps[fetcherName].mem.f && Game.creeps[fetcherName].mem.fT == target.id) {
							let diff = Game.creeps[fetcherName].carryCapacity - Game.creeps[fetcherName].getStoreUsedCapacity();
							targetStuff -= diff
							// Not _quite_ right
							targetEnergy -= diff
							if (targetStuff <= 0) break;
						}
					}

					if (targetStuff <= 0) continue;

					// Avoid nasties. This only avoids them at target selection time. I guess that could be an issue.
					if (Game.rooms[target.pos.roomName].dangerous) {
						// Maybe a tad brave
						// Should look at ignoreInvaders property and filter out invaders if it's set
						// Main place this causes problems is strongholds with neutralised invaders
						if (creep.mem.role != "lootFetcher" || creep.mem.targetRoom != target.pos.roomName) {							
							var hostiles = Game.rooms[target.pos.roomName].getAllHostileCreepsWithBodyParts([ATTACK,RANGED_ATTACK], true);

							if (hostiles.length > 0 && target.pos.findFirstInRange(hostiles, 5)) {
								continue
							}
						}
					}

					range = range || creep.pos.getWorldRangeToPos(target.pos)
					if (range > maxRange) {
						continue
					}

					let score = targetEnergy;

					if (isTombStone) {
						score += Math.max(1000, 10000 / target.ticksToDecay)
					}

					if (Game.rooms[creep.mem.sR] && Game.rooms[creep.mem.sR].storage) {
						// Don't worry about energy so much if we are a looter
						// This just removes quantity from the equation
						if (creep.mem.targetRoom && creep.mem.role == "lootFetcher") {
							score /= 100000;
						}

						for (let resourceType in target.store) {
							if (resourceType == RESOURCE_ENERGY) continue;

							let mod = 2;
							if (COMMODITIES[resourceType] && !RECIPES[resourceType]) {
								if (Memory.marketInfo && Memory.marketInfo.energyPrice && Memory.marketInfo.avgEValues && Memory.marketInfo.avgEValues[resourceType]) {
									mod = (Memory.marketInfo.avgEValues[resourceType] / Memory.marketInfo.energyPrice);
								}
								else {									
									mod = Math.pow(2, ((COMMODITIES[resourceType].level || 0) + 1) * 3);
								}

								if (creep.room.name == target.room.name) {
									if (creep.ticksToLive < 500 && COMMODITIES[resourceType].level) {
										score = -Infinity
									}
									else if (creep.ticksToLive < 250 && (!target.room.controller || !target.room.controller.my)) {
										score = -Infinity
									}
								}
								else {									
									if (creep.ticksToLive < 1000 && COMMODITIES[resourceType].level) {
										score = -Infinity
									}
									else if (creep.ticksToLive < 500 && (!target.room.controller || !target.room.controller.my)) {
										score = -Infinity
									}
								}
							}
							else if (RECIPES[resourceType]) {
								// eh, a bit of a hack
								mod = 1 + Math.pow(resourceType.length, 1.5)
							} 
							else if (Memory.season5 && resourceType === RESOURCE_THORIUM) {
								if (creep.ticksToLive < 250) {
									score = -Infinity
								} 
								else {
									mod *= 10	
								}
								
							}




							score += Math.min(creep.store.getCapacity(), target.store[resourceType]) * mod;
						}
					}

					if (creep.mem.targetRoom && target.room.name == creep.mem.targetRoom) {
						score *= 10;
					}

					score -= (range * range) / 10


					if (score > bestScore) {
						finalTarget = target;
						bestScore = score;
					}
				}


				if (finalTarget !== undefined) {
					mem.fT = finalTarget.id;

					// if (Game.rooms[mem.sR].lootRooms.includes(finalTarget.room.name)) {
					// 	mem.l = 1;
					// }

					delete mem.fct;
				}

				// We failed, no good targets so update our good rooms as these may be out-of-date.
				let changedfR = false;
				if (!mem.fT) {
					let newRooms
					if (creep.getNumOfBodyPart(MOVE) > creep.body.length / 4 && creep.ticksToLive > 1000) {
						// Fat haulers don't do loot rooms
						newRooms = _.clone(Game.rooms[mem.sR].goodRooms)

						for (let lootRoom of Game.rooms[mem.sR].lootRooms) {
							if (safeRoute.getSafeRouteCost(lootRoom, mem.sR) * 4 < creep.ticksToLive / 50) {
								newRooms.push(lootRoom)
							}
						}						
					}
					else {
						newRooms = _.clone(Game.rooms[mem.sR].goodRooms)
					}

					for (let newRoom of newRooms) {
						if (!mem.fR.includes(newRoom)) {
							mem.fR.push(newRoom)
							changedfR = true;
						}
					}
				}

				if (!mem.fT && !changedfR) {
					if (creep.ticksToLive < 1000 && 
						(Game.cpu.bucket > 8250 || (global.anySmallHaulers && Game.cpu.bucket > 2000)) && 
						Memory.rooms[creep.mem.sR].spawnUtilization > 0.8 && 
						(!global.fetcherTargetCounts || !global.fetcherTargetCounts[creep.room.name] || Math.max(2, global.fetcherTargetCounts[creep.room.name]) >= 0.8 * (creep.room.mem.ownedCreeps["fetcher"] || []).length)) {

						creep.renew = 1;
						return this.runRenewer(creep, false)
					}
					else {
						mem.fct = Game.time + 10;
					}
				}

				/*if (!changedfR) {
					if (finalTarget == undefined && filteredCandidatesAnyPos.length > 0) {
						// Go for the highest value one
						var id = undefined;
						var maxVal = 0;
						for (var i = 0; i < filteredCandidatesAnyPos.length; i++) {
							if (filteredCandidatesAnyValue[i] > maxVal) {
								maxVal = filteredCandidatesAnyValue[i];
								id = filteredCandidatesAnyId[i];
							}
						}
						mem.fT = id;
					}
					else {
						// Don't constantly ping fetch target grabs. At most every 10 ticks
						mem.fct = Game.time + 10;
					}
				}*/

				// var e1 = Game.cpu.getUsed()
				// console.log(creep.name, creep.room.name, e1 - s1)


			}


			if (mem.fT !== undefined) {
				var fT = Game.getObjectById(mem.fT);
				if (!fT) {
					mem.fT = undefined;
					return;
				}

				// Path has probably failed. Try picking a new target
				// if (mem.l && Game.time >= mem.fct && Game.time - mem.pIncompleteTick < 10) {
				// 	mem.fT = undefined;
				// 	return;
				// }

				// Dropped resource
				if (fT.amount !== undefined) {

					if (!creep.pos.isNearToPos(fT.pos)) {
						creep.cachedMoveTo(fT, 1, moveOptions);					
					}
					else if (creep.pickup(fT) == OK) {
						let structs = fT.pos.lookFor(LOOK_STRUCTURES)

						for (let struct of structs) {
							if (struct.structureType == STRUCTURE_CONTAINER && struct.store.getUsedCapacity()) {
								mem.fT = struct.id
								break;
							}
						}

						// No container
						if (mem.fT == fT.id) {
							mem.fT = undefined;
						}
					}
				}
				// Box
				else {

					// Empty
					if (fT.store.getUsedCapacity() == 0 && creep.room.lookForAt(LOOK_CREEPS, fT.pos).length == 0) {
						mem.fT = undefined;
					}
					// Not empty
					else {
						if (!creep.pos.isNearTo(fT)) {
							creep.cachedMoveTo(fT, 1, moveOptions);
							if (mem.pIncompleteTick && mem.pIncompleteTick >= Game.time - 1 && Math.random() < 0.1) {
								mem.fT = undefined;
							}
						}
						else {
							var lookDropped = creep.room.lookForAt(LOOK_RESOURCES, fT.pos)
							if (lookDropped.length > 0 && lookDropped[0].amount > 50) {
								creep.pickup(lookDropped[0]);
								if (lookDropped[0].amount < carryCapacity - usedCapacity) {
									mem.withdrawNextTick = true;
								}
							}
							else {
								var pickupAmount = fT.store.getUsedCapacity();
								// Fill us up!
								if (pickupAmount >= carryCapacity - usedCapacity) {
									let pickupResult = creep.withdrawFirst(fT);
									if (pickupResult == ERR_NOT_IN_RANGE) {
										console.log("Weirdness in fetcher. Not in range post range check")
										creep.cachedMoveTo(fT, 1, moveOptions);
									}
									else {
										delete mem.fct
										mem.fT = undefined;
										if (creep.getStoreUsedCapacity() == carryCapacity) {
											return this.runFetcher(creep)
										}

									}
								}
								// Thingy isn't enough to fill.
								// First check for other things nearby.
								// If there's nothing nearby, wait for it to be filled if it is being filled.
								// Otherwise, grab now.
								else {
									let foundNearby = false;

									/*let nearbyTargetsDropped = creep.pos.findInRange(FIND_DROPPED_RESOURCES, 1);
									if (nearbyTargetsDropped.length > 0) {
										creep.withdrawFirst(fT);
										mem.fT = nearbyTargetsDropped[0].id;
										foundNearby = true;
									}

									if (!foundNearby) {
										let nearbyTargetsTombstones = creep.pos.findInRange(FIND_TOMBSTONES, 1);
										if (nearbyTargetsTombstones.length > 0) {
											creep.withdrawFirst(fT);
											mem.fT = nearbyTargetsTombstones[0].id;
											foundNearby = true;
										}
									}*/

									if (!foundNearby) {
										var lookCreeps = creep.room.lookForAt(LOOK_CREEPS, fT.pos)

										// console.log(creep, creep.pos, lookCreeps, lookCreeps ? lookCreeps[0].mem.container : undefined, mem.fT)


										if (lookCreeps.length > 0 && 
											 lookCreeps[0].mem &&
											(lookCreeps[0].mem.container || lookCreeps[0].mem.targetContainer) == mem.fT &&
											 lookCreeps[0].mem.hSource &&
											(lookCreeps[0].mem.role == "harvester" || 
											 lookCreeps[0].mem.role == "bHarvester" || 
											 // lookCreeps[0].mem.role == "doubleHarvester" || 
											 lookCreeps[0].mem.role == "centralHarvester" || 
											 lookCreeps[0].mem.role == "keeperHarvester" || 
											 lookCreeps[0].mem.role == "keeperHarvester2" ||
											 lookCreeps[0].mem.role == "miner")) {

											// Nap time!
											let source = Game.getObjectById(lookCreeps[0].mem.hSource);

											// Grab floor stuff. 
											var target = creep.pos.findFirstInRange(FIND_DROPPED_RESOURCES, 1)
											// var target = creep.pos.findFirstInRange(FIND_DROPPED_RESOURCES, 1)
											if (target) {
												var ret = creep.pickup(target);
												if (ret == OK) {
													usedCapacity += target.amount
												}
											}

											// Grab tombstone stuff (I don't think I can do both this and floor in one tick)
											if (!target) {												
												target = creep.pos.findFirstInRange(FIND_TOMBSTONES, 1);
												if (target) {
													var ret = creep.withdrawFirst(target);
													if (ret == OK) {
														let amount 
														for (let resourceType in target.store) {
															if (target.store[resourceType] > 0 && resourceType != RESOURCE_ENERGY) {
																amount = target.store[resourceType];
															}
														}
														if (target.store[RESOURCE_ENERGY]) {
															amount = target.store[RESOURCE_ENERGY];
														}

														usedCapacity += amount
													}
												}
											}


											// I'm going to be lazy here and assume we're getting energy.
											// If we're mining this means we'll wake too soon, which is fine from the TTL perspective
											// Just a bit wasteful from the CPU perspective
											// var numWork = lookCreeps[0].getNumOfBodyPart(WORK) // Don't care about active
											let hpt = (lookCreeps[0].mem.hpt || lookCreeps[0].getBoostModifiedHarvest() * 2)

											let freeCapacity = (carryCapacity - usedCapacity)
											var diff = freeCapacity - pickupAmount;

											let sleepTicks = Math.ceil(diff / hpt);

											// Source doesn't have enough energy. Going to have to take a regen.
											if (source.energy < diff) {
												sleepTicks += Math.max(0, (source.ticksToRegeneration || 0) - source.energy / hpt);
											}

											// If the other guy is going to bite the dust, don't bother waiting for the new one to turn up.
											sleepTicks = Math.min(sleepTicks, lookCreeps[0].ticksToLive + 1)

											// Grab now. He'll fill it if he harvests more so he won't harvest more...
											if (hpt > fT.storeCapacity - fT.store.getUsedCapacity()) {
												sleepTicks = 0;
											}


											// console.log(sleepTicks, creep.carryCapacity, usedCapacity, pickupAmount, diff, numWork)
											// console.log(creep.name, creep.room.name, "Sleeping for", sleepTicks, "ticks")

											// Harvester knows travel time to home already - if we're going to perish before we get 
											// home we want to leave early (ie. don't set wT here). 1.1 margin for slowness
											if (sleepTicks > 0) {												
												// Fetchers waiting, slow spawning a bit but not like... a lot
												// Memory.rooms[creep.mem.sR].supressFetchers = Math.max(Memory.rooms[creep.mem.sR].supressFetchers, 0)
												// Memory.rooms[creep.mem.sR].supressFetchers = Math.min(200, Math.max(0, Memory.rooms[creep.mem.sR].supressFetchers) + sleepTicks / 4)

												let timeMod = (creep.getNumOfBodyPart(MOVE) >= creep.body.length / 2 ? 1.1 : 2.2)
												var travelTime = lookCreeps[0].mem.travelDistance * timeMod;


												if (sleepTicks < creep.ticksToLive - travelTime) {
													if (Game.cpu.bucket < 9990) mem.wT = Game.time + Math.ceil(sleepTicks)
													Game.rooms[mem.sR].mem.supressFetchers = Math.min(200, Math.max((Game.rooms[mem.sR].mem.supressFetchers || 0), 0) + Math.round(sleepTicks / 2));
												}
												else {
													let time = Math.round(creep.ticksToLive - travelTime);
													if (time > 0) {
														if (Game.cpu.bucket < 9990) mem.wT = Game.time + time;
														Game.rooms[mem.sR].mem.supressFetchers = Math.min(200, Math.max((Game.rooms[mem.sR].mem.supressFetchers || 0), 0) + Math.round(time / 2));
													}
												}
											}

										}
										// console.log(creep, mem.wT, lookCreeps)
										if (mem.wT == undefined || Game.time >= mem.wT) {

											let pickupResult = creep.withdrawFirst(fT);
											delete mem.wT

											if (pickupResult == ERR_NOT_IN_RANGE) {
												console.log("Weirdness in fetcher. Not in range post range check")
												creep.cachedMoveTo(fT, 1, moveOptions);
											}
											else {
												delete mem.fct
												mem.fT = undefined;
												if (creep.getStoreUsedCapacity() == carryCapacity) {
													return this.runFetcher(creep)
												}
											}
										}

									}
								}
							}
						}
					}
				}
			}
			else {
				if (creep.mem.targetRoom) {
					delete creep.mem.targetRoom
				}
				else {					
					if (Game.cpu.bucket < 9000) {
						mem.wT = Game.time + 10;
					}
					Game.rooms[mem.sR].mem.supressFetchers = Math.min(200, Math.max((Game.rooms[mem.sR].mem.supressFetchers || 0), 0) + 10);
				}
			}

		}
		else {
			if (creep.room.name != mem.sR) {
				delete mem.dTgt;
				if (Game.rooms[mem.sR] && Game.rooms[mem.sR].storage) {
					creep.cachedMoveTo(Game.rooms[mem.sR].storage, 1, moveOptions);
				}
				else if (Game.rooms[mem.sR] && Game.rooms[mem.sR].find(FIND_MY_SPAWNS)[0]) {
					creep.cachedMoveTo(Game.rooms[mem.sR].find(FIND_MY_SPAWNS)[0], 1, moveOptions);
				}
				else {
					creep.cachedMoveTo(new RoomPosition(25, 25, mem.sR), 3, moveOptions);
				}
			}
			else {
				moveOptions.maxRooms = 1
				if (mem.dTgt == undefined) {
					var fetchers = Memory.rooms[mem.sR].ownedCreeps["fetcher"]

					var hasMinerals = carry.energy - usedCapacity;

					var potentialTargets = [];
					let spawnTarget = false
					if (hasMinerals) {
						if (creep.room.storage) {
							potentialTargets = [creep.room.storage]
						}
						else {
							creep.dropMinerals()
						}
					}
					else {
						var skipStorage = false;

						if (!creep.room.storage || !creep.room.storage.my || !creep.room.storage.isActive() || creep.room.effectiveLevel < 7 || Math.random() < 0.1) {
							potentialTargets = creep.room.find(FIND_STRUCTURES, {
								filter: (structure) => {
									if (roomAI.isDropoffPoint(structure) && structure.structureType == STRUCTURE_CONTAINER) {
										if (structure.store.getUsedCapacity() < structure.storeCapacity - carry.energy) {
											return true;
										}
									}
									if (!hasMinerals && structure.structureType == STRUCTURE_SPAWN && creep.room.effectiveLevel < 3) {
										if (structure.energy < structure.energyCapacity) {
											return true;
										}
									}
									return false;
								}
							});
							// if (potentialTargets.length == 0 && !hasMinerals) {
							// 	potentialTargets = creep.room.find2(FIND_MY_CREEPS, {
							// 		filter: (otherCreep) => {
							// 			return ((otherCreep.mem.role == "upgrader" || otherCreep.mem.role == "builder") && otherCreep.carry.enery < otherCreep.carryCapacity)
							// 		}
							// 	});
							// }
							if (potentialTargets.length == 0 && (!creep.room.storage || !creep.room.storage.my || !creep.room.storage.isActive())) {
								potentialTargets = _.filter(creep.room.containers, (structure) => (roomAI.isDropoffPoint(structure) && structure.store.getUsedCapacity() < structure.storeCapacity));

								if (potentialTargets.length == 0) {
									potentialTargets = [creep.room.find(FIND_MY_SPAWNS)];
									spawnTarget = true
								}
							}
						}


						// console.log(potentialTargets)
						if (potentialTargets.length == 0 && creep.room.storage && creep.room.storage.my && creep.room.storage.isActive()) {
							if (hasMinerals) {
								if (creep.room.storage.store.getUsedCapacity() < creep.room.storage.storeCapacity) {
									potentialTargets = [creep.room.storage];
								}
							}
							else {
								potentialTargets = creep.room.find(FIND_MY_STRUCTURES, {
									filter: (structure) => {
										if (structure.structureType == STRUCTURE_STORAGE && structure.isActive()) {
											if (structure.store.getUsedCapacity() < structure.storeCapacity) {
												return true;
											}
										}
										if (!hasMinerals && 
											structure.structureType == STRUCTURE_LINK && 
											structure.isActive()) {

											if (roomAI.isDropoffPoint(structure) && 
												!roomAI.isHarvesterLink(structure) && 
												structure.energy == 0) {
												return true;
											}
											if (roomAI.isHarvesterLink(structure)) {
												if (creep.store[RESOURCE_ENERGY] <= LINK_CAPACITY * 2 && 
													(structure.energy + creep.store[RESOURCE_ENERGY] < LINK_CAPACITY * 0.8)) { // || (structure.cooldown && structure.cooldown < creep.pos.getRangeToRoomObject(structure)))) {
													return true;
												} 
											}
											// Edge links. Built in high traffic areas so try to keep it to creeps that are local
											else if (creep.pos.inRangeToPos(structure.pos, 3) && 
													!roomAI.isEnergyEndPoint(structure) && !roomAI.isEnergyStartPoint(structure) && 
													structure.energy + creep.store[RESOURCE_ENERGY] <= LINK_CAPACITY) {
												return true;
											}
										}
										if (!hasMinerals && structure.structureType == STRUCTURE_POWER_SPAWN && (structure.energy < structure.energyCapacity)) {
											return true;
										}

										return false;
									}
								});
							}
						}
						// console.log(potentialTargets)
					}

					var filteredCandidates = [];

					for (var target of potentialTargets) {
						let targetCapacity;
						if (target.structureType) {
							if (target.structureType == STRUCTURE_STORAGE || target.structureType == STRUCTURE_CONTAINER || target.structureType == STRUCTURE_TERMINAL) {
								targetCapacity = target.storeCapacity - target.store.getUsedCapacity();
							}
							else if (target.structureType == STRUCTURE_LINK) {
								// I know this is wrong, but we want to offload at links if we can.
								if (target.cooldown < creep.pos.getRangeToRoomObject(target) && !roomAI.isEnergyStartPoint(target)) {
									// targetCapacity = target.energyCapacity;
									targetCapacity = creep.carryCapacity;
								}
								else {
									// targetCapacity = target.energyCapacity - target.energy;
									targetCapacity = creep.carryCapacity - target.energy;
								}
							}
							else if (target) {
								targetCapacity = target.energyCapacity - target.energy;
							}
							for (var otherFetcherName of fetchers) {
								if (Game.creeps[otherFetcherName] && Game.creeps[otherFetcherName].mem.dTgt == target.id) {

									targetCapacity -= Game.creeps[otherFetcherName].getStoreUsedCapacity();
								}
							}
						}
						else if (target.carryCapacity) {
							targetCapacity = target.carryCapacity - target.energy;
						}

						// if (creep.room.name == "W3N5") {
						// 	console.log(target, targetCapacity)
						// }

						if (targetCapacity >= carry.energy || (potentialTargets.length == 1 && !creep.room.storage) || (target.structureType && target.structureType == STRUCTURE_SPAWN && target.room.effectiveLevel < 3)) {
							filteredCandidates.push(target);
						}
					}

					if (filteredCandidates.length == 0) {
						if (creep.room.storage && creep.room.storage.isActive() && creep.room.storage.store.getUsedCapacity() < 0.95 * creep.room.storage.storeCapacity) {
							filteredCandidates = [creep.room.storage]
						}
						if (filteredCandidates.length == 0 && !hasMinerals) {
							filteredCandidates = creep.room.find(FIND_STRUCTURES, {
								filter: (structure) => {
									if (structure.structureType == STRUCTURE_CONTAINER) {
										if (roomAI.isDropoffPoint(structure) && structure.store.getFreeCapacity(RESOURCE_ENERGY)) {
											return true;
										}
									}
									else if (structure.structureType != STRUCTURE_LINK) {
										return structure.store && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
									}
									return false
								}
							});
						}

					}

					// if (creep.room.name == "W3N5") {
					// 	console.log("fetcher filteredCandidates", filteredCandidates)
					// 	console.log("fetcher potentialTargets", potentialTargets)
					// }

					if (filteredCandidates.length > 0) {
						if (filteredCandidates.length == 1) {
							target = filteredCandidates[0];
						}
						else {
							let minContainer = Infinity;
							// Go empties container first
							for (let target of filteredCandidates) {
								if (target.structureType == STRUCTURE_CONTAINER) {
									// Spawn battery containers need at least 100 before considering elsewhere
									let amount = Math.max(roomAI.isInSpawnBattery(target) ? 0 : 100, target.store.getUsedCapacity())
									minContainer = Math.min(minContainer, amount);
								}
							}

							if (minContainer < Infinity) {								
								for (let target of _.clone(filteredCandidates)) {
									if (target.structureType == STRUCTURE_CONTAINER) {
										let amount = Math.max(roomAI.isInSpawnBattery(target) ? 0 : 100, target.store.getUsedCapacity())
										if (amount > minContainer) {
											_.pull(filteredCandidates, target)
										}
									}
								}
							}
							if (filteredCandidates.length == 1) {
								target = filteredCandidates[0];
							}
							else {
								target = creep.pos.findClosestByPath(filteredCandidates, {"ignoreCreeps" : true, "plainCost": 2, "swampCost": 10, "range": 1});
							}
						}
						if (target) {
							mem.dTgt = target.id;
							delete mem.path;
							delete mem.pTX;
							delete mem.pTY;
							delete mem.pTgtRoom;
							delete mem.pO;
						}
					}
					else {
						if (potentialTargets.length && ((potentialTargets[0].structureType && potentialTargets[0].structureType == STRUCTURE_SPAWN) || spawnTarget) && !creep.pos.inRangeToPos(potentialTargets[0].pos, 10)) {
							creep.cachedMoveTo(potentialTargets[0], 10, moveOptions)
						}
						else {
							if (Game.cpu.bucket < 9000) {
								mem.wT = Game.time + 10;
							}

							delete creep.mem.path
						}


						Game.rooms[mem.sR].mem.supressFetchers = Math.min(200, Math.max((Game.rooms[mem.sR].mem.supressFetchers || 0), 0) + 10);

					}
				}

				if(mem.dTgt != undefined) {
					var target = Game.getObjectById(mem.dTgt);
					if (target) {
						// Target is full. Stand off.
						// This check is surprisingly fucking expensive. I guess this is due to store object being fucky.
						if (creep.room.effectiveLevel < 4 && ((target.energyCapacity || target.storeCapacity) || 0) - ((target.energy || (target.store && target.store.energy)) || 0) <= 0) {
							if (Game.cpu.bucket < 9000) {
								creep.mem.wT = Game.time + 5;
							}
							if (creep.pos.inRangeToPos(target.pos, 2)) {
								creep.move(Math.floor(Math.random() * 8) + 1)
							}
							else {
								creep.cachedMoveTo(target, 10, moveOptions);
							}

							Game.rooms[mem.sR].mem.supressFetchers = Math.min(200, Math.max((Game.rooms[mem.sR].mem.supressFetchers || 0), 0) + 5);


							// delete mem.path;
							// delete mem.pTX;
							// delete mem.pTY;
							// delete mem.pTgtRoom;
							// delete mem.pO;
							if (!target.structureType || target.structureType != STRUCTURE_SPAWN || Math.random() < 0.1) {
								delete mem.dTgt
							}
						}
						else {
							if (!creep.pos.isNearToRoomObject(target)) {
								creep.cachedMoveTo(target, 1, moveOptions);
							}
							else {
								let ret = creep.transferFirst(target);
								// Accounting done in proto.creep
								mem.dTgt = undefined
								if (ret == OK && creep.getStoreUsedCapacity() == 0 && creep.carryCapacity) {
									return this.runFetcher(creep)
								}
							}
						}
					}
					else {
						mem.dTgt = undefined;
					}
				}
				// Well we're in the spawn room, nowhere to drop though. I think the only way this happens is if everywhere is full.
				// Tell the room we don't want any more haulers for a while please!
				else {
					Game.rooms[mem.sR].mem.supressFetchers = Math.min(200, Math.max((Game.rooms[mem.sR].mem.supressFetchers || 0), 0) + 1);
				}
			}
		}

		if (Game.cpu.bucket > 6000 || (creep.room.keeperRoom && Game.cpu.bucket > 2000)) {
			if (usedCapacity != creep.carryCapacity) {
				var target = creep.pos.findFirstInRange(FIND_DROPPED_RESOURCES, 1)
				// var target = creep.pos.findFirstInRange(FIND_DROPPED_RESOURCES, 1)
				if (target) {
					var ret = creep.pickup(target);
					// We've changed weight. Path will be invalid now.
					if (ret == OK) {
						mem.path = undefined
					}
				}
				else {
					var target = creep.pos.findFirstInRange(FIND_TOMBSTONES, 1);
					if (target) {
						var ret = creep.withdrawFirst(target);
						// We've changed weight. Path will be invalid now.
						if (ret == OK) {
							mem.path = undefined
						}
					}
					else {
						var target = creep.pos.findFirstInRange(FIND_RUINS, 1);
						if (target) {
							var ret = creep.withdrawFirst(target);
							// We've changed weight. Path will be invalid now.
							if (ret == OK) {
								mem.path = undefined
							}
						}
					}
				}
			}
		}

		// if (Game.cpu.bucket > 2000) {
			if (carry.energy > 0 && !global._creepStoreUsedCapacityInvalid[creep.id] && creep.room.controller && creep.room.controller.my && creep.room.energyAvailable != creep.room.energyCapacityAvailable) {
				var target = creep.pos.findFirstInRange(FIND_MY_STRUCTURES, 1, {
					filter: function(struct) {
						return (struct.structureType == STRUCTURE_EXTENSION ||
								struct.structureType == STRUCTURE_SPAWN ||
								struct.structureType == STRUCTURE_LAB ||
								struct.structureType == STRUCTURE_TOWER) &&
								struct.energy < struct.energyCapacity;
					}
				});
				if (target) {
					if (creep.transfer(target, RESOURCE_ENERGY) == OK) {
						let delta = Math.min(creep.carry[RESOURCE_ENERGY], target.energyCapacity - target.energy);
						Game.haulerTransferredEnergy += delta
						creep.room.haulerTransferredEnergy += delta
					}
				}
			}
		// }

		// Let other stuff deal with the spawn room.
		if (((Game.cpu.bucket > 2000 || Math.random() < 0.5) && (Game.cpu.bucket > 1000 || Math.random() < 0.5)) &&
			/*(creep.room.name != mem.sR || Game.cpu.bucket > 8000) &&*/ carry.energy > 0 &&
			(creep.hasBodyPart(WORK) || Math.random() < 0.1)) {

			let lookRange = 0;

			let targets
			if (creep.hasBodyPart(WORK)) {				
				if (Game.cpu.bucket > 9000) lookRange = 3
				else if (Game.cpu.bucket > 8000) lookRange = 2
				else if (Game.cpu.bucket > 7000) lookRange = 1
				targets = creep.room.lookForAtArea(LOOK_STRUCTURES, 
												   Math.max(1, creep.pos.y-lookRange),
												   Math.max(1, creep.pos.x-lookRange),
												   Math.min(48, creep.pos.y+lookRange),
												   Math.min(48, creep.pos.x+lookRange), true);

				for (var target of targets) {
					var structure = target.structure
					if (structure.structureType == STRUCTURE_ROAD && structure.hits <= structure.hitsMax - 300) {
						 creep.repair(structure);
						 break
					}
				}
			}

			if (!targets || lookRange != 0) {
				targets = creep.room.lookForAtArea(LOOK_STRUCTURES, creep.pos.y, creep.pos.x, creep.pos.y, creep.pos.x, true);
			}

			for (var target of targets) {
				var structure = target.structure
				if (structure.structureType == STRUCTURE_ROAD && 
					structure.hits <= structure.hitsMax * 0.5 && 
					structure.pos.x == creep.pos.x && 
					structure.pos.y == creep.pos.y) {
					global.flaggedRoads = global.flaggedRoads || {};
					global.flaggedRoads[creep.room.name] = global.flaggedRoads[creep.room.name] || new Set();
					if (!global.flaggedRoads[creep.room.name].has(structure.id)) {
						global.flaggedRoads[creep.room.name].add(structure.id)
					}

					break;
				}
			}
		}
	},



	runSeasonFetcher: function(creep, secondCall) {
		if (Memory.season2) {
			return this.runSeason2Fetcher(creep, secondCall)
		}

		if (Memory.season3) {
			throw(new Error("Season fetcher running on season 3"))
		}

		let cpu = Game.cpu.getUsed()
		creep.valuableCreepExtraHate();


		// Whatever we were going to do, do it next tick.
		if (creep.fatigue) return

		var mem = creep.mem
		if (creep.civilianSpookedSK(true)) {
			delete mem.fT;
			delete mem.dTgt
			return;
		}

		if (mem.wT !== undefined && Game.time < mem.wT) {
			return;
		}

		let moveOptions;
		if (creep.room.dangerous || creep.hits != creep.hitsMax) {
			moveOptions = {"avoidEnemyRooms" : 1, "avoidHostiles" : 2, "maxDT" : 1.5, "minKD" : -0.5, "ignoreKeepers": (creep.room.name == mem.targetRoom && mem.f) ? 1 : undefined};
		}
		else {
			moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.5, "minKD" : -0.5, "noRePathOnOptsChange": 1, "ignoreKeepers": (creep.room.name == mem.targetRoom && mem.f) ? 1 : undefined};
		}

		if (!secondCall) {			
			if (creep.getStoreUsedCapacity() == 0) {
				creep.mem.f = 1
				delete creep.mem.dTgt
				delete creep.mem.dP
			}
			else {
				creep.mem.f = 0
				delete creep.mem.fT
				delete creep.mem.fP
			}
		}


		Memory.stats.creepCPUs["seasonFetcherStartup"] = (Memory.stats.creepCPUs["seasonFetcherStartup"] || 0) + Game.cpu.getUsed() - cpu;
		cpu = Game.cpu.getUsed()

		if (creep.mem.f) {
			let loopStart
			let loopEnd 
			let urgent
			let urgency
			let noPullFromStorage
			let storeCap

			// Find closest, storage or drop. Try to keep the bucket full.
			if (!creep.mem.fT) {			
				storeCap = creep.store.getCapacity()

				loopStart = 0
				loopEnd = Math.min(Math.ceil(creep.ticksToLive / 50) + 1, constants.MAX_SEASON_SCORE_RANGE_HAULER + 3)
				noPullFromStorage = false
				if (Memory.rooms[creep.room.name].seasonDropOffAvailable) {
					// loopStart = 0
					urgent = true
					// Lower is less urgent (low bucket, can travel far before it caps out)
					urgency = (Memory.rooms[creep.room.name].dropOffBucket + Memory.rooms[creep.room.name].expectedBucket) * 0.5 / 20000
					// console.log(creep, "a")
				}
				// If we're not doing a storage-collector direct run, seek fresh deposits
				else if (Memory.rooms[creep.room.name].closestDropOff && 
						(!Memory.rooms[Memory.rooms[creep.room.name].closestDropOff].seasonDropOffAvailable || Memory.rooms[Memory.rooms[creep.room.name].closestDropOff].expectedBucket < 10000)) {
					noPullFromStorage = true
					urgency = 0
					// console.log(creep, "b")
				}
				else {
					// console.log(creep, "c")
					urgent = false
					urgency = 0
					// Just one iteration, max range. Collect stuff
					// loopStart = constants.MAX_SEASON_SCORE_RANGE_HAULER
					// loopEnd = constants.MAX_SEASON_SCORE_RANGE_HAULER
				}
			}

			if (!creep.mem.fT) {
				let rangeStep = 1; //Game.cpu.bucket < 5000 ? 2 : 1
				let checkedContainers = new Set(); 
				let bannedRooms = new Set(); 
				global.inTickObject.allSeasonFetchers = global.inTickObject.allSeasonFetchers || _.filter(Game.creeps, (creep) => creep.mem && (creep.mem.role == 'seasonFetcher'))

				for (let rangeIteration = loopStart; rangeIteration <= loopEnd && !creep.mem.fT; rangeIteration += rangeStep) {
					let containerMaxRange = rangeIteration;

					// Want a curve that starts the same, ends the same, but is lower in the middle
					let norm = rangeIteration / ((loopEnd - loopStart) || 1);
					// let nonUrgentStorageRange = rangeIteration * Math.pow(norm, 0.75)
					let urgencyBasedStorageRange = rangeIteration * Math.pow(norm, Math.max(1, 2.5 - 1.5 * urgency))


					// let strorageMaxRange = urgent ? rangeIteration : nonUrgentStorageRange;
					let strorageMaxRange = urgencyBasedStorageRange - 3;

					//console.log("cont max range", containerMaxRange, "storage max range", strorageMaxRange, "urgency", urgency)


					if (!creep.mem.fT && rangeIteration == loopStart) {
						let target = creep.pos.findClosestByRange(FIND_TOMBSTONES, {
							filter: (structure) => {
								return structure.store[RESOURCE_SCORE];
							}
						});

						if (!target) {
							target = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
								filter: (dropped) => {
									return dropped.resourceType == RESOURCE_SCORE && dropped.amount > creep.pos.getRangeToPos(dropped.pos);
								}
							});
						}

						if (target) {
							creep.mem.fT = target.id;
							creep.mem.fP = {x: target.pos.x, y: target.pos.y, roomName: target.pos.roomName};
							creep.mem.fetchedFromStorage = 0
						}
					}
					if (!creep.mem.fT) {

						let posIdLookup = new Map();
						let allContainerPos = []

						// Ok, lets be a bit CPU wasteful
						for (let roomName of Memory.scoreContainerRooms) {
							if (!Memory.rooms[roomName]) {
								continue
							}
							if (bannedRooms.has(roomName)) {
								continue
							}

							let dist = safeRoute.getSafeRouteCost(roomName, creep.room.name, false, false, Math.ceil(containerMaxRange))
							if (Game.time - (global.incompletePaths[creep.room.name + roomName] || 0) < 1000) {
								dist *= 1.25
							}
							else if (Game.time - (global.incompletePaths[creep.room.name + roomName] || 0) < 10000) {
								dist *= 1.1
							}

							if (dist > containerMaxRange) {
								continue
							}

							if (Memory.rooms[roomName].owner && Memory.rooms[roomName].owner != util.getMyName()) {
								bannedRooms.add(roomName)
								continue
							}
							if (!Memory.rooms[roomName].scoreContainers) {
								bannedRooms.add(roomName)
								continue
							}
							if (Memory.rooms[roomName].skLairsX && !Memory.usedRemotes.includes(roomName)) {
								bannedRooms.add(roomName)
								continue
							}


							for (let scoreResourceData of Memory.rooms[roomName].scoreContainers) {
								if (checkedContainers.has(scoreResourceData.id)) {
									continue
								}
								// We've got loads of time to grab it.
								if (scoreResourceData.decayTick - Game.time > 1000 && dist > containerMaxRange - 1) {
									continue
								}
								else if (scoreResourceData.decayTick - Game.time > 2000 && dist > containerMaxRange - 1.5) {
									continue
								}
								else if (scoreResourceData.decayTick - Game.time > 3000 && dist > containerMaxRange - 2) {
									continue
								}
								else if (scoreResourceData.decayTick - Game.time > 4000 && dist > containerMaxRange - 2.5) {
									continue
								}

								checkedContainers.add(scoreResourceData.id)

								let range = creep.pos.getWorldRangeToPos(scoreResourceData.pos)

								if (range >= scoreResourceData.decayTick - Game.time) continue
								if (range >= creep.ticksToLive * 0.45) continue

								let amount = scoreResourceData.amount
								for (let otherFetcher of global.inTickObject.allSeasonFetchers) {
									if (otherFetcher.mem.f && otherFetcher.mem.fT === scoreResourceData.id) {
										amount -= otherFetcher.carryCapacity
									}
								}
								if (amount < storeCap) {
									if (dist > containerMaxRange * amount / storeCap) {
										continue
									}
								}

								if (amount > 0) {
									let pos = new RoomPosition(scoreResourceData.pos.x, scoreResourceData.pos.y, roomName)
									allContainerPos.push(pos)
									posIdLookup[pos] = scoreResourceData.id
								}
							}
						}

						// console.log(JSON.stringify(allContainerPos))

						let targetPos 
						if (allContainerPos.length == 1) {
							targetPos = allContainerPos[0];
						}
						else if (allContainerPos.length) {
							// A bit of swamp cost as we'll need to return probably
							let innerCPU = Game.cpu.getUsed()
							if (containerMaxRange < 5 + Game.cpu.bucket / 2000) {
								targetPos = creep.pos.findClosestByWorldPath(allContainerPos, {"ignoreCreeps" : true, "ignoreRoads": true, "plainCost": 1, "swampCost": 2, "maxOps": 50000, "range": 1, "maxCost": Math.round(creep.ticksToLive * 0.45)});
							}
							
							if (!targetPos) {
								console.log(creep, creep.pos, "Season fetcher failed A findClosestByPath", targetPos, JSON.stringify(allContainerPos))
								targetPos = creep.pos.findClosestPosByWorldRange(allContainerPos);
							}
							Memory.stats.creepCPUs["seasonFetcherFindFT_FCBWP_A"] = (Memory.stats.creepCPUs["seasonFetcherFindFT_FCBWP_A"] || 0) + Game.cpu.getUsed() - innerCPU;
						}

						// console.log(targetPos)

						if (targetPos) {
							creep.mem.fT = posIdLookup[targetPos]
							creep.mem.fP = {x: targetPos.x, y: targetPos.y, roomName: targetPos.roomName}
							creep.mem.fetchedFromStorage = 0
						}
					}

					if (!creep.mem.fT && Memory.anySeasonDropOffAvailable && Memory.season1 && Memory.useAllyContainer) {
						let dealRoom = Game.rooms["E24S7"]
						if (dealRoom) {
							let pos = new RoomPosition(9, 27, dealRoom.name)

							let container

							let structs = pos.lookFor(LOOK_STRUCTURES)
							for (let struct of structs) {
								if (struct.structureType == STRUCTURE_CONTAINER) {
									container = struct;
									break
								}
							}
							if (container) {
								// One creep at a time
								for (let otherFetcher of global.inTickObject.allSeasonFetchers) {
									if (otherFetcher.mem.f && otherFetcher.mem.fT === container.id) {
										container = undefined
									}
								}
							}

							if (container) {						
								if (container.store[RESOURCE_SCORE] >= creep.store.getCapacity()) {
									creep.mem.fP = {x: container.pos.x, y: container.pos.y, roomName: container.pos.roomName}
									creep.mem.fT = container.id
								}
							}
						}
					}

					// Storages
					if (!creep.mem.fT && Memory.anySeasonDropOffAvailable && !noPullFromStorage && strorageMaxRange >= 0) {
						let storages = []
						for (let testRoom of Game.myRooms) {
							if (!testRoom.storage || (testRoom.storage.store[RESOURCE_SCORE] || 0) < storeCap) continue

							let dist = safeRoute.getSafeRouteCost(testRoom.name, creep.room.name, false, false, Math.ceil(strorageMaxRange))

							if (Game.time - (global.incompletePaths[creep.room.name + testRoom.name] || 0) < 1000) {
								dist *= 1.25
							}
							else if (Game.time - (global.incompletePaths[creep.room.name + testRoom.name] || 0) < 10000) {
								dist *= 1.1
							}


							if (dist > strorageMaxRange) continue

							let range = creep.pos.getWorldRangeToPos(testRoom.storage.pos)
							if (range >= creep.ticksToLive * 0.45) continue
							storages.push(testRoom.storage)
						}

						// Terminals are next to storage. Hardly seems worth the effort to consider them separately
						// if (storages.length == 0) {					
						// 	for (let testRoom of Game.myRooms) {
						// 		if (!testRoom.terminal || (testRoom.terminal.store[RESOURCE_SCORE] || 0) < storeCap) continue

						// 		let dist = safeRoute.getSafeRouteCost(testRoom.name, creep.room.name, false, false, Math.ceil(strorageMaxRange))
						// 		if (dist > strorageMaxRange) continue

						// 		if (Game.time - (global.incompletePaths[creep.room.name + testRoom.name] || 0) < 1000) {
						// 			dist *= 1.25
						// 		}
						// 		else if (Game.time - (global.incompletePaths[creep.room.name + testRoom.name] || 0) < 10000) {
						// 			dist *= 1.1
						// 		}

						// 		let range = creep.pos.getWorldRangeToPos(testRoom.terminal.pos)
						// 		if (range >= creep.ticksToLive * 0.5) continue
						// 		storages.push(testRoom.terminal)
						// 	}
						// }

						let target 
						if (storages.length == 1) {
							target = storages[0];
						}
						else if (storages.length) {
							let innerCPU = Game.cpu.getUsed()
							if (strorageMaxRange < 5 + Game.cpu.bucket / 2000) {
								target = creep.pos.findClosestByWorldPath(storages, {"ignoreCreeps" : true, "ignoreRoads": true, "plainCost": 1, "swampCost": 2, "maxOps": 50000, "range": 1, "maxCost": Math.round(creep.ticksToLive * 0.45)});
							}
							if (!target) {
								console.log(creep, creep.pos, "Season fetcher failed B findClosestByPath", target, storages)
								target = creep.pos.findClosestObjectByWorldRange(storages);
							}
							Memory.stats.creepCPUs["seasonFetcherFindFT_FCBWP_B"] = (Memory.stats.creepCPUs["seasonFetcherFindFT_FCBWP_B"] || 0) + Game.cpu.getUsed() - innerCPU;
						}

						if (target) {
							creep.mem.fT = target.id
							creep.mem.fP = {x: target.pos.x, y: target.pos.y, roomName: target.pos.roomName}
							creep.mem.fetchedFromStorage = 1
						}
					}

				}
			}


			Memory.stats.creepCPUs["seasonFetcherFindFT"] = (Memory.stats.creepCPUs["seasonFetcherFindFT"] || 0) + Game.cpu.getUsed() - cpu;
			cpu = Game.cpu.getUsed()



			if (creep.mem.fT) {
				// Not sure why this happens
				if (!creep.mem.fP || !creep.mem.fP.roomName) {
					console.log(creep, "has fT but no fP")
					delete creep.mem.fT
					delete creep.mem.fP
					return
				}

				if ((Memory.enableVisuals || Memory.forceSaveMemory) && creep.mem.fP) {
					Game.map.visual.text("🚚", creep.pos, {fontSize: 5})
					Game.map.visual.line(creep.pos, new RoomPosition(creep.mem.fP.x, creep.mem.fP.y, creep.mem.fP.roomName), {color: "#ff0000"})
				}


				let target
				if (Game.rooms[creep.mem.fP.roomName]) {
					target = Game.getObjectById(creep.mem.fT)
					if (!target) {
						delete creep.mem.fT
						delete creep.mem.fP
						if (!secondCall) return this.runSeasonFetcher(creep, true)
					}
				}

				if (!creep.pos.isNearToPos(creep.mem.fP)) {
					creep.cachedMoveTo(creep.mem.fP, 1, moveOptions)
					// return
				}
				else {					
					// Can drop then want to immediately pick up again. For reasons
					if (secondCall && target.structureType) {
						return
					}

					if (creep.withdrawAndUpdateCarry(target, RESOURCE_SCORE) == OK) {
						// Assume max carry 'cos lazy
						if (target.structureType == STRUCTURE_CONTAINER && creep.room.name == "E24S7" && Memory.useAllyContainer) {
							Memory.takenFromAllyContainer = Memory.takenFromAllyContainer || {}
							Memory.takenFromAllyContainer["Xarabydun"] = Memory.takenFromAllyContainer["Xarabydun"] || 0
							Memory.takenFromAllyContainer["Xarabydun"] += creep.store.getCapacity()
						}

						delete creep.mem.fT
						delete creep.mem.fP
						creep.mem.f = 0
						if (!secondCall) return this.runSeasonFetcher(creep, true)
					}
					else {
						console.log("runSeasonFetcher withdraw failed", creep, creep.pos)
						// if (creep.store.getCapacity() == 0) {
						// 	changeCreepRole(creep, "fetcher")
						// 	return this.runFetcher(creep)
						// }
						delete creep.mem.fT
						delete creep.mem.fP
					}
				}

			}
			// Nothing to gather, become a hauler
			else {

				if (creep.ticksToLive > 300 || (creep.room.controller && creep.room.controller.my)) {
					let collector = creep.room.find(FIND_SCORE_COLLECTORS)[0]
					if (collector && creep.pos.inRangeToPos(collector.pos, 5)) {
						creep.uncachedMoveTo(collector, 6, {flee: 1})
					}
					else {						
						changeCreepRole(creep, "fetcher")
						return this.runFetcher(creep)
					}
				}
				else if (Game.cpu.bucket > 9000) {
					let collector = creep.room.find(FIND_SCORE_COLLECTORS)[0]
					if (collector && creep.pos.inRangeToPos(collector.pos, 5)) {
						creep.uncachedMoveTo(collector, 6, {flee: 1})
					}
					else {						
						changeCreepRole(creep, "recycler")
						return this.runRecycler(creep)
					}
				}
				else if (!secondCall) {
					creep.suicide()
				}
			}

			Memory.stats.creepCPUs["seasonFetcherWithFT"] = (Memory.stats.creepCPUs["seasonFetcherWithFT"] || 0) + Game.cpu.getUsed() - cpu;
			cpu = Game.cpu.getUsed()


		}
		else {
			let rescan = false;
			let oldDTgt
			if (Game.getObjectById(creep.mem.dTgt) && Game.getObjectById(creep.mem.dTgt).structureType && Math.random() < 0.025) {
				oldDTgt = creep.mem.dTgt
				delete creep.mem.dTgt
				rescan = true
			}

			if (creep.room.name == "E20S20" || creep.room.name == "E20S10" || creep.room.name == "E30S10" || creep.room.name == "E30S0" || creep.room.name == "E30N0") {
				let containers = creep.room.containers
				for (let container of containers) {
					if (container.store.getFreeCapacity() >= creep.getStoreUsedCapacity()) {
						creep.mem.dTgt = container.id
						creep.mem.dP = {x: container.pos.x, y: container.pos.y, roomName: container.pos.roomName}
						break
					}
				}
			}

			// let loopStart = constants.MAX_SEASON_SCORE_RANGE_HAULER
			// let loopEnd = constants.MAX_SEASON_SCORE_RANGE_HAULER
			for (let pass = 0; pass < 3 && !creep.mem.dTgt; pass++) {
				if (!creep.mem.dTgt) {
					global.inTickObject.allSeasonFetchers = global.inTickObject.allSeasonFetchers || _.filter(Game.creeps, (creep) => creep.mem && (creep.mem.role == 'seasonFetcher'))

					let availableDropRooms = []
					let contestedDropRooms = []				
					for (let dropRoomName of Memory.seasonalDropRooms) {
						if (!Memory.rooms[dropRoomName] || !Memory.rooms[dropRoomName].seasonDropOffAvailable) continue
						if (Game.rooms[dropRoomName] && Game.rooms[dropRoomName].dangerous) continue
						if (Memory.rooms[dropRoomName].DT > 1) continue

						if ((pass < 2 && Math.random() < 0.75) && (dropRoomName == "E20S20" || dropRoomName == "E20S10" || dropRoomName == "E30S10" || dropRoomName == "E30S0" || dropRoomName == "E30N0")) {
							continue
						}

						let dist = safeRoute.getSafeRouteCost(creep.room.name, dropRoomName, false, false, constants.MAX_SEASON_SCORE_RANGE_HAULER)

						if (dist > constants.MAX_SEASON_SCORE_RANGE_HAULER) {
							continue
						}

						let dropPos = Memory.rooms[dropRoomName].dropOffPos

						let range = creep.pos.getWorldRangeToPos(dropPos)

						if (range >= creep.ticksToLive || (pass == 0 && range > 300)) continue

						let bucket = Memory.rooms[dropRoomName].dropOffBucket


						for (let otherFetcher of global.inTickObject.allSeasonFetchers) {
							// console.log(creep.mem.dTgt, JSON.stringify(otherFetcher.mem.dP), JSON.stringify(dropPos), otherFetcher.getStoreUsedCapacity())
							if (otherFetcher.mem.dTgt && otherFetcher.mem.dP && otherFetcher.mem.dP.x == dropPos.x && otherFetcher.mem.dP.y == dropPos.y && otherFetcher.mem.dP.roomName == dropRoomName) {
								bucket -= otherFetcher.getStoreUsedCapacity()
							}
						}

						// Bit of a hack. It does it itself when it is visible. Should move to roomAI
						if (!Game.rooms[dropRoomName]) {
							Memory.rooms[dropRoomName].expectedBucket = bucket
						}

						bucket += Math.min(300, range) * SCORE_COLLECTOR_SINK

						console.log("Expected bucket", dropRoomName, bucket, Memory.rooms[dropRoomName].dropOffBucket)

						// If rescanning be pessimistic. Still not 100% sure rescanning is a good concept anyway
						let mod = 0
						if (rescan) {
							mod = 5000
						}
						if (bucket >= mod + creep.getStoreUsedCapacity()) {
							availableDropRooms.push(dropRoomName)
						}
						else if (bucket >= mod + 0) {
							contestedDropRooms.push(dropRoomName)
						}
					}

					if (!availableDropRooms.length && contestedDropRooms.length) {
						for (let dropRoomName of contestedDropRooms) {
							let bucket = Memory.rooms[dropRoomName].dropOffBucket
							let dropPos = Memory.rooms[dropRoomName].dropOffPos

							// If there's anyone further away than me, kill their target and steal it
							for (let otherFetcher of global.inTickObject.allSeasonFetchers) {
								// console.log(creep.mem.dTgt, JSON.stringify(otherFetcher.mem.dP), JSON.stringify(dropPos), otherFetcher.getStoreUsedCapacity())
								if (otherFetcher.mem.dTgt &&
									otherFetcher.mem.dP && 
									otherFetcher.mem.dP.x == dropPos.x && 
									otherFetcher.mem.dP.y == dropPos.y && 
									otherFetcher.mem.dP.roomName == dropRoomName &&
									otherFetcher.pos.getWorldRangeToPos(dropPos) > 1.5 * creep.pos.getWorldRangeToPos(dropPos) &&
									otherFetcher.getStoreUsedCapacity() == creep.getStoreUsedCapacity()) {
							
									creep.mem.dTgt = otherFetcher.mem.dTgt
									creep.mem.dP = {x: dropPos.x, y: dropPos.y, roomName: dropRoomName}

									// You're on your own buddy
									delete otherFetcher.mem.dTgt
									delete otherFetcher.mem.dP

									console.log(creep, "stealing drop off slot from", otherFetcher)

									availableDropRooms.push(dropRoomName)
									break
								}
							}

							if (availableDropRooms.length) {
								break
							}
						}
					}

					if (availableDropRooms.length && !creep.mem.dTgt) {
						let posIdLookup = new Set();
						let dropPoints = []

						for (let dropRoomName of availableDropRooms) {
							let dropPos = new RoomPosition(Memory.rooms[dropRoomName].dropOffPos.x, Memory.rooms[dropRoomName].dropOffPos.y, Memory.rooms[dropRoomName].dropOffPos.roomName)
							dropPoints.push(dropPos)
							posIdLookup[dropPos] = Memory.rooms[dropRoomName].dropOffId
						}

						let targetPos
						if (dropPoints.length == 1) {
							targetPos = dropPoints[0];
						}
						else if (dropPoints.length) {
							targetPos = creep.pos.findClosestByWorldPath(dropPoints, {"ignoreCreeps" : true, "ignoreRoads": true, "plainCost": 1, "swampCost": 5, "maxOps": 50000, "range": 1, "maxCost": creep.ticksToLive});
							if (!targetPos) {
								console.log(creep, creep.pos, "Season fetcher failed C findClosestByPath", targetPos, dropPoints)
								targetPos = creep.pos.findClosestObjectByWorldRange(dropPoints);
							}
						}

						if (targetPos) {
							Memory.combatManager.requestedMissions[global.MISSION_ROOM_ANTICAMP][targetPos.roomName] = Game.time;
							creep.mem.dTgt = posIdLookup[targetPos]
							creep.mem.dP = {x: targetPos.x, y: targetPos.y, roomName: targetPos.roomName}
						}
					}
				}
				if (!creep.mem.dTgt && oldDTgt) {
					creep.mem.dTgt = oldDTgt
				}
				if (!creep.mem.dTgt && !creep.mem.fetchedFromStorage) {
					let storages = []
					for (let testRoom of Game.myRooms) {
						if (!testRoom.storage) continue

						let dist = safeRoute.getSafeRouteCost(testRoom.name, creep.room.name, false, false, constants.MAX_SEASON_SCORE_RANGE_HAULER)
						if (dist > constants.MAX_SEASON_SCORE_RANGE_HAULER) continue

						let range = creep.pos.getWorldRangeToPos(testRoom.storage.pos)
						if (range >= creep.ticksToLive) continue

						storages.push(testRoom.storage)
					}

					if (storages.length == 0) {
						for (let testRoom of Game.myRooms) {
							if (!testRoom.storage) continue
								
							let dist = safeRoute.getSafeRouteCost(testRoom.name, creep.room.name, false, false, constants.MAX_SEASON_SCORE_RANGE_HAULER)
							if (dist > constants.MAX_SEASON_SCORE_RANGE_HAULER) continue

							storages.push(testRoom.storage)
						}
						if (storages.length > 1) {
							storages = [creep.pos.findClosestObjectByWorldRange(storages)]
						}
					}
					if (storages.length == 0) {
						for (let testRoom of Game.myRooms) {
							if (!testRoom.storage) continue
							storages.push(testRoom.storage)
						}
						storages = [creep.pos.findClosestObjectByWorldRange(storages)]
					}

					let target 

					if (storages.length == 1) {
						target = storages[0];
					}
					else if (storages.length) {
						target = creep.pos.findClosestByWorldPath(storages, {"ignoreCreeps" : true, "ignoreRoads": true, "plainCost": 1, "swampCost": 5, "maxOps": 50000, "range": 1, "maxCost": creep.ticksToLive});
						if (!target) {
							console.log(creep, creep.pos, "Season fetcher failed D findClosestByPath", target, storages)
							target = creep.pos.findClosestObjectByWorldRange(storages);
						}
					}

					if (target) {
						creep.mem.dTgt = target.id
						// creep.mem.dP = target.pos
						creep.mem.dP = {x: target.pos.x, y: target.pos.y, roomName: target.pos.roomName}
					}
				}
			}

			Memory.stats.creepCPUs["seasonFetcherFindDT"] = (Memory.stats.creepCPUs["seasonFetcherFindDT"] || 0) + Game.cpu.getUsed() - cpu;
			cpu = Game.cpu.getUsed()

			if (creep.mem.dTgt) {
				if (!creep.mem.dP || !creep.mem.dP.roomName) {
					delete creep.mem.dTgt
					delete creep.mem.dP
					console.log(creep, "has dTgt but no dP")
					return
				}

				if ((Memory.enableVisuals || Memory.forceSaveMemory) && creep.mem.dP) {
					Game.map.visual.text("🚚", creep.pos, {fontSize: 5})
					Game.map.visual.line(creep.pos, new RoomPosition(creep.mem.dP.x, creep.mem.dP.y, creep.mem.dP.roomName), {color: "#0000ff"})
				}

				let target
				if (Game.rooms[creep.mem.dP.roomName]) {
					target = Game.getObjectById(creep.mem.dTgt)
					if (!target) {
						delete creep.mem.dTgt
						delete creep.mem.dP
						if (!secondCall) return this.runSeasonFetcher(creep, true)
					}
				}

				if (!creep.pos.isNearToPos(creep.mem.dP)) {
					creep.cachedMoveTo(creep.mem.dP, 1, moveOptions)
				}
				else {
					if (creep.transferAndUpdateCarry(target, RESOURCE_SCORE) == OK) {
						delete creep.mem.dTgt
						delete creep.mem.dP
						creep.mem.f = 1
						if (!secondCall) return this.runSeasonFetcher(creep, true)
					}
					else {
						console.log("runSeasonFetcher transfer failed", creep, creep.pos)
					}
				}
			}
			Memory.stats.creepCPUs["seasonFetcherWithDT"] = (Memory.stats.creepCPUs["seasonFetcherWithDT"] || 0) + Game.cpu.getUsed() - cpu;
			cpu = Game.cpu.getUsed()

		}

		if (creep.getStoreUsedCapacity() != creep.carryCapacity) {
			var target = creep.pos.findInRange(FIND_DROPPED_RESOURCES, 1, {
				filter: (resource) => {return resource.resourceType == RESOURCE_SCORE && resource.amount > 0}
			})[0];
			if (target) {
				var ret = creep.pickup(target);
				// We've changed weight. Path will be invalid now.
				if (ret == OK && creep.getStoreUsedCapacity() - creep.carryCapacity >= 50) {
					mem.path = undefined
				}
			}
			else {
				var target = creep.pos.findInRange(FIND_TOMBSTONES, 1, {
					filter: (tombStone) => {return tombStone.store[RESOURCE_SCORE] > 0 }
				})[0];
				if (target) {
					var ret = creep.withdraw(target, RESOURCE_SCORE);
					// We've changed weight. Path will be invalid now.
					if (ret == OK && creep.getStoreUsedCapacity() - creep.carryCapacity >= 50) {
						mem.path = undefined
					}
				}
			}
		}
		Memory.stats.creepCPUs["seasonFetcherFinal"] = (Memory.stats.creepCPUs["seasonFetcherFinal"] || 0) + Game.cpu.getUsed() - cpu;

	},



	runSeason2Fetcher: function(creep, secondCall) {
		let cpu = Game.cpu.getUsed()
		creep.valuableCreepExtraHate();


		// Whatever we were going to do, do it next tick.
		if (creep.fatigue) return

		var mem = creep.mem
		// if (creep.civilianSpookedSK(true)) {
		// 	if (Math.random() < 0.5 && mem.fT) {
		// 		mem.failedTarget = mem.fT
		// 	}
		// 	delete mem.fT;
		// 	delete mem.fP
		// 	delete mem.fTime
		// 	delete mem.dTgt
		// 	return;
		// }

		if (Game.time % 101 == 23 && Memory.rooms[creep.room.name].DT > 0.5 && creep.room.dangerous && creep.room.controller && creep.room.controller.owner && creep.room.controller.owner.username == "Cub") {
			let structs = creep.pos.lookFor(LOOK_STRUCTURES)
			for (let struct of structs) {
				if (struct.structureType == STRUCTURE_RAMPART && !struct.isPublic) {
					console.log("--------------------------", creep, "wants to suicide as stuck in ramparts")
					creep.suicide()
					return
				}
			}
		}



		if (mem.wT !== undefined && Game.time < mem.wT) {
			return;
		}

		let moveOptions;
		if (creep.room.dangerous || creep.hits != creep.hitsMax) {
			moveOptions = {"avoidEnemyRooms" : 1, "avoidHostiles" : 2, "maxDT" : 1.5, "minKD" : -0.5, "ignoreKeepers": (creep.room.name == mem.targetRoom && mem.f) ? 1 : undefined};
		}
		else {
			moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.5, "minKD" : -0.5, "noRePathOnOptsChange": 1, "ignoreKeepers": (creep.room.name == mem.targetRoom && mem.f) ? 1 : undefined};
		}

		if (!secondCall) {			
			if (creep.getStoreUsedCapacity() == 0) {
				creep.mem.f = 1
				delete creep.mem.dTgt
				delete creep.mem.dP
			}
			else {
				creep.mem.f = 0
				delete creep.mem.fT
				delete creep.mem.fP
			}
		}


		Memory.stats.creepCPUs["seasonFetcherStartup"] = (Memory.stats.creepCPUs["seasonFetcherStartup"] || 0) + Game.cpu.getUsed() - cpu;
		cpu = Game.cpu.getUsed()

		if (creep.mem.f) {
			let loopStart
			let loopEnd 
			let urgent
			let urgency
			let storeCap

			// Oh. Won't reach it/get back
			if (creep.mem.fT && creep.mem.path && Math.random() < 0.1) {
				let distToTarget = Math.max(creep.mem.path.length, creep.pos.getWorldRangeToPos(creep.mem.fP))

				if (distToTarget * 2 > creep.ticksToLive) {
					console.log(creep, creep.pos, "refind fT a")
					delete creep.mem.fT
					delete creep.mem.fP
					delete creep.mem.fTime
				}
				else if (creep.mem.fTime && creep.mem.fTime - Game.time < 2 * Math.min(creep.ticksToLive, distToTarget)) {
					console.log(creep, creep.pos, "refind fT b")
					delete creep.mem.fT
					delete creep.mem.fP
					delete creep.mem.fTime
				}
				else if (Math.random() < 0.1 && Game.time - (creep.mem.pIncompleteTick || 0) < 10 && (!creep.mem.path || creep.mem.path.length < 3) && distToTarget > 50) {
					console.log(creep, creep.pos, "refind fT c")
					creep.mem.failedTarget = creep.mem.fT
					delete creep.mem.fT
					delete creep.mem.fP
					delete creep.mem.fTime
					delete creep.mem.pIncompleteTick
				}
			} 


			// Find closest, storage or drop. Try to keep the bucket full.
			if (!creep.mem.fT) {			
				storeCap = creep.store.getCapacity()

				loopStart = 0
				loopEnd = Math.min(Math.ceil(creep.ticksToLive / 100) + 1, constants.MAX_SEASON_SCORE_RANGE_HAULER + 3)
				urgent = false
				urgency = 0
			}

			if (!creep.mem.fT) {
				let rangeStep = 1; //Game.cpu.bucket < 5000 ? 2 : 1
				let checkedContainers = new Set(); 
				let bannedRooms = new Set(); 
				global.inTickObject.allSeasonFetchers = global.inTickObject.allSeasonFetchers || _.filter(Game.creeps, (creep) => creep.mem && (creep.mem.role == 'seasonFetcher'))

				let safeRouteCosts = new Map();

				// Originally two pass collecting ones I need first. Now only one pass
				for (let pass = 1; pass < 2; pass++) {
					for (let rangeIteration = loopStart; rangeIteration <= loopEnd && !creep.mem.fT; rangeIteration += rangeStep) {
						let containerMaxRange = rangeIteration;

						// Want a curve that starts the same, ends the same, but is lower in the middle
						// let norm = rangeIteration / ((loopEnd - loopStart) || 1);

						if (!creep.mem.fT && rangeIteration == loopStart) {
							let target = creep.pos.findClosestByRange(FIND_TOMBSTONES, {
								filter: (structure) => {
									return _.intersection(Object.keys(structure.store), SYMBOLS).length;
								}
							});

							if (!target) {
								target = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
									filter: (dropped) => {
										return dropped.amount > creep.pos.getRangeToPos(dropped.pos) && SYMBOLS.includes(dropped.resourceType);
									}
								});
							}

							if (target) {
								creep.mem.fT = target.id;
								creep.mem.fP = {x: target.pos.x, y: target.pos.y, roomName: target.pos.roomName};
							}
						}
						if (!creep.mem.fT) {
							let posIdLookup = new Map();
							let posTimeLookup = new Map();
							let allContainerPos = []

							// Ok, lets be a bit CPU wasteful
							for (let roomName of Memory.scoreContainerRooms) {
								if (!Memory.rooms[roomName]) {
									continue
								}
								if (bannedRooms.has(roomName)) {
									continue
								}
								if (Memory.rooms[roomName].owner && Memory.rooms[roomName].owner != util.getMyName()) {
									bannedRooms.add(roomName)
									continue
								}
								if (!Memory.rooms[roomName].scoreContainers) {
									bannedRooms.add(roomName)
									continue
								}

								let dist
								if (safeRouteCosts[roomName]) {
									dist = safeRouteCosts[roomName]
								}
								else {
									dist = safeRoute.getSafeRouteCost(roomName, creep.room.name, false, false, Math.ceil(containerMaxRange))
									if (dist < Infinity) {
										safeRouteCosts[roomName] = dist;
									}
								}

								if (Game.time - (global.incompletePaths[creep.room.name + roomName] || 0) < 1000) {
									dist *= 1.25
								}
								else if (Game.time - (global.incompletePaths[creep.room.name + roomName] || 0) < 10000) {
									dist *= 1.1
								}

								if (dist > containerMaxRange) {
									continue
								}

								if (rangeIteration != loopEnd && Memory.rooms[roomName].skLairsX && !Memory.usedRemotes.includes(roomName)) {
									// bannedRooms.add(roomName)
									continue
								}

								let sectorCoords = util.getSectorCoords(roomName)
								let highway = (sectorCoords.x == 0 || sectorCoords.y == 0)

								for (let scoreResourceData of Memory.rooms[roomName].scoreContainers) {
									if (checkedContainers.has(scoreResourceData.id)) {
										continue
									}

									if (scoreResourceData.id == creep.mem.failedTarget) {
										continue
									}

									// We've got loads of time to grab it.
									if (rangeIteration != loopEnd) {										
										if (scoreResourceData.decayTick - Game.time > 1000 && dist > containerMaxRange - 1) {
											continue
										}
										else if (scoreResourceData.decayTick - Game.time > 2000 && dist > containerMaxRange - 2) {
											continue
										}
										else if (scoreResourceData.decayTick - Game.time > 3000 && dist > containerMaxRange - 3) {
											continue
										}
										else if (scoreResourceData.decayTick - Game.time > 4000 && dist > containerMaxRange - 4) {
											continue
										}
									}

									if (pass == 0 && 
										!Memory.myDecoders.includes(scoreResourceData.resourceType) && 
										!Memory.allyDecoders.includes(scoreResourceData.resourceType) && 
										!Memory.friendDecoders.includes(scoreResourceData.resourceType) && 
										!Memory.stealingDecoders.includes(scoreResourceData.resourceType)) {
										continue
									}

									if (highway && !scoreResourceData.reachable && util.getCentreRoomForRoomPos(creep.pos) != util.getCentreRoomForRoomPos(new RoomPosition(scoreResourceData.pos.x, scoreResourceData.pos.y, scoreResourceData.pos.roomName))) {										
										continue
										// if (Game.time - (creep.mem.pIncompleteTick || 0) < 100) {
										// 	continue
										// }
										// else {
										// 	let roomCoords = util.getRoomCoords(roomName)
										// 	let testRoom = util.getRoomNameFromCoords({x : roomCoords.x + 1, y : roomCoords.y})

										// 	if (!util.isRoomAccessible(testRoom)) {
										// 		continue
										// 	}

										// 	testRoom = util.getRoomNameFromCoords({x : roomCoords.x - 1, y : roomCoords.y})
										// 	if (!util.isRoomAccessible(testRoom)) {
										// 		continue
										// 	}

										// 	testRoom = util.getRoomNameFromCoords({x : roomCoords.x, y : roomCoords.y + 1})
										// 	if (!util.isRoomAccessible(testRoom)) {
										// 		continue
										// 	}

										// 	testRoom = util.getRoomNameFromCoords({x : roomCoords.x, y : roomCoords.y - 1})
										// 	if (!util.isRoomAccessible(testRoom)) {
										// 		continue
										// 	}
										// }
									}



									checkedContainers.add(scoreResourceData.id)

									let range = creep.pos.getWorldRangeToPos(scoreResourceData.pos)

									if (rangeIteration == loopEnd) {
										if (range >= (scoreResourceData.decayTick - Game.time)) continue
									}
									else {										
										if (range >= (scoreResourceData.decayTick - Game.time) * 0.9) continue
									}

									if (range >= creep.ticksToLive * 0.4) continue

									let amount = scoreResourceData.amount
									for (let otherFetcher of global.inTickObject.allSeasonFetchers) {
										if (otherFetcher.mem.f && otherFetcher.mem.fT === scoreResourceData.id) {
											amount -= otherFetcher.carryCapacity
										}
									}

									for (let playerName in Memory.allyHaulerTargets) {
										for (let haulerTargetId in Memory.allyHaulerTargets[playerName]) {
											if (haulerTargetId == scoreResourceData.id) {
												amount -= Memory.allyHaulerTargets[playerName][haulerTargetId]
											}
										}
									}

									// if (amount < storeCap && rangeIteration != loopEnd) {
									// 	if (dist > containerMaxRange * amount / storeCap) {
									// 		continue
									// 	}
									// }

									if (amount > 0) {
										let pos = new RoomPosition(scoreResourceData.pos.x, scoreResourceData.pos.y, roomName)
										allContainerPos.push(pos)
										posIdLookup[pos] = scoreResourceData.id
										posTimeLookup[pos] = scoreResourceData.decayTick
									}
								}
							}

							// console.log(JSON.stringify(allContainerPos))

							let targetPos 
							if (allContainerPos.length == 1) {
								targetPos = allContainerPos[0];
							}
							else if (allContainerPos.length) {
								// A bit of swamp cost as we'll need to return probably
								let innerCPU = Game.cpu.getUsed()
								if (containerMaxRange < 5 + Game.cpu.bucket / 2000) {
									targetPos = creep.pos.findClosestByWorldPath(allContainerPos, {"ignoreCreeps" : true, "ignoreRoads": true, "plainCost": 1, "swampCost": 2, "maxOps": 50000, "range": 1, "maxCost": Math.round(creep.ticksToLive * 0.4)});
								}
								
								if (!targetPos) {
									console.log(creep, creep.pos, "Season fetcher failed A findClosestByPath", targetPos, JSON.stringify(allContainerPos))
									targetPos = creep.pos.findClosestPosByWorldRange(allContainerPos);
								}
								Memory.stats.creepCPUs["seasonFetcherFindFT_FCBWP_A"] = (Memory.stats.creepCPUs["seasonFetcherFindFT_FCBWP_A"] || 0) + Game.cpu.getUsed() - innerCPU;
							}

							// console.log(targetPos)

							if (targetPos) {
								creep.mem.fT = posIdLookup[targetPos]
								if (posTimeLookup[targetPos]) {
									creep.mem.fTime = posTimeLookup[targetPos]
								}
								else {
									delete creep.mem.fTime
								}
								creep.mem.fP = {x: targetPos.x, y: targetPos.y, roomName: targetPos.roomName}
							}
						}
					}
				}
			}


			Memory.stats.creepCPUs["seasonFetcherFindFT"] = (Memory.stats.creepCPUs["seasonFetcherFindFT"] || 0) + Game.cpu.getUsed() - cpu;
			cpu = Game.cpu.getUsed()



			if (creep.mem.fT) {
				// Not sure why this happens
				if (!creep.mem.fP || !creep.mem.fP.roomName) {
					console.log(creep, "has fT but no fP")
					delete creep.mem.fT
					delete creep.mem.fP
					delete creep.mem.fTime
					return
				}

				if ((Memory.enableVisuals || Memory.forceSaveMemory) && creep.mem.fP) {
					Game.map.visual.text("🚚", creep.pos, {fontSize: 5})
					Game.map.visual.line(creep.pos, new RoomPosition(creep.mem.fP.x, creep.mem.fP.y, creep.mem.fP.roomName), {color: "#ff0000"})
				}


				let target
				if (Game.rooms[creep.mem.fP.roomName]) {
					target = Game.getObjectById(creep.mem.fT)

					// let sectorCoords = util.getSectorCoords(creep.mem.fP.roomName)
					// if (sectorCoords.x == 0 || sectorCoords.y == 0) {
					// 	if (Game.time - (creep.mem.pIncompleteTick || 0) < 100) {
					// 		delete creep.mem.fT
					// 		delete creep.mem.fP
					// 		if (!secondCall) return this.runSeasonFetcher(creep, true)
					// 		return
					// 	}
					// }


					if (!target) {
						delete creep.mem.fT
						delete creep.mem.fP
						delete creep.mem.fTime
						if (!secondCall) return this.runSeasonFetcher(creep, true)
					}
				}

				if (!creep.pos.isNearToPos(creep.mem.fP)) {
					creep.cachedMoveTo(creep.mem.fP, 1, moveOptions)
					// return
				}
				else {					
					// Can drop then want to immediately pick up again. For reasons
					if (secondCall && target.structureType) {
						return
					}

					let ret
					if (target.store) {
						let symbol = _.intersection(Object.keys(target.store), SYMBOLS)[0]
						creep.pickingUp = symbol
						ret = creep.withdrawAndUpdateCarry(target, symbol)
					}
					else {
						creep.pickingUp = target.resourceType
						ret = creep.pickup(target)
					}

					if (ret == OK) {
						delete creep.mem.fT
						delete creep.mem.fP
						delete creep.mem.fTime
						creep.mem.f = 0
						if (!secondCall) return this.runSeasonFetcher(creep, true)
					}
					else {
						console.log("runSeasonFetcher withdraw failed", creep, creep.pos, ret)
						// if (!secondCall && !creep.store.getCapacity()) {
						// 	creep.mem.f = 0
						// 	return this.runSeasonFetcher(creep, true)
						// }

						delete creep.mem.fT
						delete creep.mem.fP
						delete creep.mem.fTime
					}
				}

			}
			// Nothing to gather, become a hauler
			else {

				if (creep.ticksToLive > 300 || (creep.room.controller && creep.room.controller.my)) {
					if (creep.room.controller && creep.room.controller.my) {
						creep.mem.sR = creep.room.name
					}
					else {
						if (creep.room.terminal && creep.pos.inRangeToPos(creep.room.terminal.pos, 10)) {
							creep.uncachedMoveTo(creep.room.terminal, 10, {maxRooms: 1, flee: 1})
							return
						}
						let closestRoom
						let minDist = Infinity
						for (let room of Game.myRooms) {
							let dist = safeRoute.getSafeRouteCost(creep.room.name, room.name)
							if (dist < minDist) {
								closestRoom = room.name
								minDist = dist
							}
						}

						if (closestRoom) {
							creep.mem.sR = closestRoom
						}
					}
					changeCreepRole(creep, "fetcher")				
					return this.runFetcher(creep)
				}
				else if (Game.cpu.bucket > 9000) {
					changeCreepRole(creep, "recycler")
					return this.runRecycler(creep)
				}
				else if (!secondCall) {
					creep.suicide()
				}
			}

			Memory.stats.creepCPUs["seasonFetcherWithFT"] = (Memory.stats.creepCPUs["seasonFetcherWithFT"] || 0) + Game.cpu.getUsed() - cpu;
			cpu = Game.cpu.getUsed()


		}
		else {
			let rescan = false;
			let oldDTgt
			if (Game.getObjectById(creep.mem.dTgt) && Game.getObjectById(creep.mem.dTgt).structureType && Math.random() < 0.025) {
				oldDTgt = creep.mem.dTgt
				delete creep.mem.dTgt
				rescan = true
			}

			// let loopStart = constants.MAX_SEASON_SCORE_RANGE_HAULER
			// let loopEnd = constants.MAX_SEASON_SCORE_RANGE_HAULER

			// Ideally this would be biased toward whoever owns the decoder
			// and possibly even looking ahead at future pickups
			if (!creep.mem.dTgt) {
				let storages = []
				for (let testRoom of Game.myRooms) {
					if (!testRoom.storage) continue
					if (testRoom.mem.attackScore) continue
					if (testRoom.DT > 0.5) continue

					let dist = safeRoute.getSafeRouteCost(testRoom.name, creep.room.name, false, false, constants.MAX_SEASON_SCORE_RANGE_HAULER)
					if (dist > constants.MAX_SEASON_SCORE_RANGE_HAULER) continue

					let range = creep.pos.getWorldRangeToPos(testRoom.storage.pos)
					// console.log(creep.pos, testRoom.storage.pos, range)
					if (range >= creep.ticksToLive) continue

					storages.push(testRoom.storage)
				}

				for (let allyRoomName of Memory.allyRoomNames) {
					if (!Memory.rooms[allyRoomName]) continue
					if (!Memory.rooms[allyRoomName].hasStorage) continue
					if (!Memory.rooms[allyRoomName].hasTerminal) continue
					if (Memory.rooms[allyRoomName].DT > 1) continue

					if (Memory.allyRoomsUnderAttack && 
						Memory.allyRoomsUnderAttack[Memory.rooms[allyRoomName].owner] &&
						Memory.allyRoomsUnderAttack[Memory.rooms[allyRoomName].owner][allyRoomName]) {
						continue
					}

					let dist = safeRoute.getSafeRouteCost(allyRoomName, creep.room.name, false, false, constants.MAX_SEASON_SCORE_RANGE_HAULER)
					// console.log(creep.pos, allyRoomName, dist)
					if (dist > constants.MAX_SEASON_SCORE_RANGE_HAULER) continue

					let terminalPos = new RoomPosition(Memory.rooms[allyRoomName].terminalPos.x, Memory.rooms[allyRoomName].terminalPos.y, allyRoomName)

					let range = creep.pos.getWorldRangeToPos(terminalPos)
					// console.log(creep.pos, storagePos, range)
					if (range >= creep.ticksToLive) continue

					storages.push({id: Memory.rooms[allyRoomName].terminalId, pos: terminalPos})
				}

				let symbol = creep.pickingUp || _.intersection(Object.keys(creep.store), SYMBOLS)[0]
				if (Memory.currentMBSymbols.includes(symbol)) {
					for (let friendRoomName of Memory.friendRoomNames) {
						if (!Memory.rooms[friendRoomName]) continue
						if (!Memory.rooms[friendRoomName].hasStorage) continue
						if (!Memory.rooms[friendRoomName].hasTerminal) continue

						let dist = safeRoute.getSafeRouteCost(friendRoomName, creep.room.name, false, false, constants.MAX_SEASON_SCORE_RANGE_HAULER)
						// console.log(creep.pos, allyRoomName, dist)
						if (dist > constants.MAX_SEASON_SCORE_RANGE_HAULER) continue

						let terminalPos = new RoomPosition(Memory.rooms[friendRoomName].terminalPos.x, Memory.rooms[friendRoomName].terminalPos.y, friendRoomName)

						let range = creep.pos.getWorldRangeToPos(terminalPos)
						// console.log(creep.pos, storagePos, range)
						if (range >= creep.ticksToLive) continue

						storages.push({id: Memory.rooms[friendRoomName].terminalId, pos: terminalPos})
					}
				}


				if (storages.length == 0) {
					for (let testRoom of Game.myRooms) {
						if (!testRoom.storage) continue
							
						let dist = safeRoute.getSafeRouteCost(testRoom.name, creep.room.name, false, false, constants.MAX_SEASON_SCORE_RANGE_HAULER)
						if (dist > constants.MAX_SEASON_SCORE_RANGE_HAULER) continue

						storages.push(testRoom.storage)
					}

					for (let allyRoomName of Memory.allyRoomNames) {
						if (!Memory.rooms[allyRoomName]) continue
						if (!Memory.rooms[allyRoomName].hasStorage) continue
						if (!Memory.rooms[allyRoomName].hasTerminal) continue
						if (Memory.rooms[allyRoomName].DT > 1) continue

						if (Memory.allyRoomsUnderAttack && 
							Memory.allyRoomsUnderAttack[Memory.rooms[allyRoomName].owner] &&
							Memory.allyRoomsUnderAttack[Memory.rooms[allyRoomName].owner][allyRoomName]) {
							continue
						}


						let dist = safeRoute.getSafeRouteCost(allyRoomName, creep.room.name, false, false, constants.MAX_SEASON_SCORE_RANGE_HAULER)
						if (dist > constants.MAX_SEASON_SCORE_RANGE_HAULER) continue

						let terminalPos = new RoomPosition(Memory.rooms[allyRoomName].terminalPos.x, Memory.rooms[allyRoomName].terminalPos.y, allyRoomName)

						storages.push({id: Memory.rooms[allyRoomName].terminalId, pos: terminalPos})
					}


					if (storages.length > 1) {
						storages = [creep.pos.findClosestObjectByWorldRange(storages)]
					}
				}

				if (storages.length == 0) {
					for (let testRoom of Game.myRooms) {
						if (!testRoom.storage) continue
						storages.push(testRoom.storage)
					}

					for (let allyRoomName of Memory.allyRoomNames) {
						if (!Memory.rooms[allyRoomName]) continue
						if (!Memory.rooms[allyRoomName].hasStorage) continue
						if (!Memory.rooms[allyRoomName].hasTerminal) continue

						let terminalPos = new RoomPosition(Memory.rooms[allyRoomName].terminalPos.x, Memory.rooms[allyRoomName].terminalPos.y, allyRoomName)

						storages.push({id: Memory.rooms[allyRoomName].terminalId, pos: terminalPos})
					}

					if (storages.length > 1) {
						storages = [creep.pos.findClosestObjectByWorldRange(storages)]
					}
				}

				let target 

				if (storages.length == 1) {
					target = storages[0];
				}
				else if (storages.length) {
					target = creep.pos.findClosestByWorldPath(storages, {"ignoreCreeps" : true, "ignoreRoads": false, "plainCost": 1, "swampCost": 5, "maxOps": 50000, "range": 1, "maxCost": creep.ticksToLive});
					if (!target) {
						console.log(creep, creep.pos, "Season fetcher failed D findClosestByPath", target, storages)
						target = creep.pos.findClosestObjectByWorldRange(storages);
					}
				}

				if (target) {
					creep.mem.dTgt = target.id
					// creep.mem.dP = target.pos
					creep.mem.dP = {x: target.pos.x, y: target.pos.y, roomName: target.pos.roomName}
				}
			}

			Memory.stats.creepCPUs["seasonFetcherFindDT"] = (Memory.stats.creepCPUs["seasonFetcherFindDT"] || 0) + Game.cpu.getUsed() - cpu;
			cpu = Game.cpu.getUsed()

			if (creep.mem.dTgt) {
				if (!creep.mem.dP || !creep.mem.dP.roomName) {
					delete creep.mem.dTgt
					delete creep.mem.dP
					console.log(creep, "has dTgt but no dP")
					return
				}

				if ((Memory.enableVisuals || Memory.forceSaveMemory) && creep.mem.dP) {
					Game.map.visual.text("🚚", creep.pos, {fontSize: 5})
					Game.map.visual.line(creep.pos, new RoomPosition(creep.mem.dP.x, creep.mem.dP.y, creep.mem.dP.roomName), {color: "#0000ff"})
				}

				let target
				if (Game.rooms[creep.mem.dP.roomName]) {
					let symbol = _.intersection(Object.keys(creep.store), SYMBOLS)[0]

					if (Memory.rooms[creep.mem.dP.roomName].decoderType == symbol && Game.rooms[creep.mem.dP.roomName].controller.level == 8) {
						let decoder = Game.rooms[creep.mem.dP.roomName].find(FIND_SYMBOL_DECODERS)[0]
						// Double check
						if (decoder && decoder.scoreMultiplier == CONTROLLER_LEVEL_SCORE_MULTIPLIERS[8]) {	
							creep.mem.dTgt = decoder.id
							creep.mem.dP = decoder.pos
						}
						else {
							console.log("Weird shortcut decoder")
						}
					}

					target = Game.getObjectById(creep.mem.dTgt)
					if (!target) {
						console.log("Drop target disappeared???")
						delete creep.mem.dTgt
						delete creep.mem.dP
						if (!secondCall) return this.runSeasonFetcher(creep, true)
					}
				}

				if (!creep.pos.isNearToPos(creep.mem.dP)) {
					creep.cachedMoveTo(creep.mem.dP, 1, moveOptions)
				}
				else {
					let symbol = _.intersection(Object.keys(creep.store), SYMBOLS)[0]

					let amount = creep.store[symbol]
					if (creep.transferAndUpdateCarry(target, symbol) == OK) {
						Memory.stats.collectedScoreAmount = (Memory.stats.collectedScoreAmount || 0) + amount
						delete creep.mem.dTgt
						delete creep.mem.dP
						creep.mem.f = 1
						if (!secondCall) return this.runSeasonFetcher(creep, true)
					}
					else {
						if (target.structureType == STRUCTURE_STORAGE && target.store.getFreeCapacity() == 0 && creep.room.terminal) {
							creep.mem.dTgt = creep.room.terminal.id
							creep.mem.dP = creep.room.terminal.pos
						}
						else if (target.structureType == STRUCTURE_TERMINAL && target.store.getFreeCapacity() == 0 && creep.room.storage) {
							creep.mem.dTgt = creep.room.storage.id
							creep.mem.dP = creep.room.storage.pos
						}
						else {
							if (Math.random() < 0.5) {								
								creep.mem.dTgt = creep.room.terminal.id
								creep.mem.dP = creep.room.terminal.pos
							}
							else {
								creep.mem.dTgt = creep.room.storage.id
								creep.mem.dP = creep.room.storage.pos
							}
						}
						console.log("runSeasonFetcher transfer failed", creep, creep.pos)
					}
				}
			}
			Memory.stats.creepCPUs["seasonFetcherWithDT"] = (Memory.stats.creepCPUs["seasonFetcherWithDT"] || 0) + Game.cpu.getUsed() - cpu;
			cpu = Game.cpu.getUsed()

		}

		if (creep.getStoreUsedCapacity() != creep.carryCapacity) {
			var target = creep.pos.findInRange(FIND_DROPPED_RESOURCES, 1, {
				filter: (resource) => {return SYMBOLS.includes(resource.resourceType) && resource.amount > 0}
			})[0];
			if (target) {
				var ret = creep.pickup(target);
				// We've changed weight. Path will be invalid now.
				if (ret == OK && creep.getStoreUsedCapacity() - creep.carryCapacity >= 50) {
					mem.path = undefined
				}
			}
			else {
				var target = creep.pos.findInRange(FIND_TOMBSTONES, 1, {
					filter: (tombStone) => {return _.intersection(Object.keys(tombStone.store), SYMBOLS).length > 0 }
				})[0];
				if (target) {
					let symbol = _.intersection(Object.keys(target.store), SYMBOLS)[0]

					var ret = creep.withdraw(target, symbol);
					// We've changed weight. Path will be invalid now.
					if (ret == OK && creep.getStoreUsedCapacity() - creep.carryCapacity >= 50) {
						mem.path = undefined
					}
				}
			}
		}
		Memory.stats.creepCPUs["seasonFetcherFinal"] = (Memory.stats.creepCPUs["seasonFetcherFinal"] || 0) + Game.cpu.getUsed() - cpu;

	},


	runReserver: function(creep) {
		if (creep.civilianSpookedSK()) {
			return;
		}

		if (!creep.mem.targetRoom) {
			// TODO: This
			// creep.mem.targetRoom = _.sample()
		}


		let moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.25, "minKD" : -0.5};


		if (creep.mem.targetRoom == creep.room.name) {
			if (!creep.pos.isNearTo(creep.room.controller)) {
				creep.cachedMoveTo(creep.room.controller, 1, moveOptions);
			}
			else {
				let ret = creep.reserveController(creep.room.controller);
				if (ret == ERR_INVALID_TARGET) {
					// Ah, I've claimed it. Interesting
					if (!creep.room.controller.my) {
						ret = creep.attackController(creep.room.controller);
					}
					else {
						changeCreepRole(creep, "recycler");
						return;
					}
				}
				if (Game.time % 200 == 0) {
					let signString = Memory.botArena && !Memory.season ? "\uD83D\uDC2F" : "\uD83D\uDC2F Warning: fully automated murder zone \uD83D\uDC2F"
					creep.signController(creep.room.controller, signString)
				}
			}
		}
		else if (Game.rooms[creep.mem.targetRoom]) {
			creep.cachedMoveTo(Game.rooms[creep.mem.targetRoom].controller, 1, moveOptions);
		}
		else {
			if (Memory.rooms[creep.mem.targetRoom]) {
				creep.cachedMoveTo(new RoomPosition(Memory.rooms[creep.mem.targetRoom].conX, Memory.rooms[creep.mem.targetRoom].conY, creep.mem.targetRoom), 1, moveOptions);
			}
			else {
				creep.cachedMoveTo(new RoomPosition(25, 25, creep.mem.targetRoom), 20, moveOptions);
			}
		}
	},

	runClaimer: function(creep) {
		if (Game.rooms[creep.mem.targetRoom] && Game.rooms[creep.mem.targetRoom].controller.my) {
			changeCreepRole(creep, "recycler");
			return;

		}
		else if (creep.mem.targetRoom == creep.room.name && !util.isEdgeOfRoom(creep.pos)) {
			var ret = creep.claimController(creep.room.controller)
			if (ret == ERR_INVALID_TARGET) {
				if (!creep.room.controller.my) {
					ret = creep.attackController(creep.room.controller);
					return
				}
				else {
					console.log("WTF, claimer attacking controller in", creep.room.name)
				}
			}
			if(ret == ERR_NOT_IN_RANGE) {
				creep.cachedMoveTo(creep.room.controller, 1, {"avoidEnemyRooms" : 1, "maxRooms": 1});
			}
			else if (ret == OK) {
				creep.room.mem.claimTick = Game.time;
				creep.signController(creep.room.controller, "\uD83D\uDC2F")
				changeCreepRole(creep, "recycler");
				return;
			}
		}
		else {
			let moveOptions;
			if (creep.room.dangerous) {
				moveOptions = {"avoidEnemyRooms" : 1, "avoidHostiles" : 2, "maxDT" : 1.25, "minKD" : -0.5};
			}
			else {
				moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.25, "minKD" : -0.5};
			}

			if (Memory.rooms[creep.mem.targetRoom]) {
				creep.cachedMoveTo(new RoomPosition(Memory.rooms[creep.mem.targetRoom].conX, Memory.rooms[creep.mem.targetRoom].conY, creep.mem.targetRoom), 1, moveOptions);
			}
			else {
				creep.cachedMoveTo(new RoomPosition(25, 25, creep.mem.targetRoom), 20, moveOptions);
			}

		}
	},


	runControllerAttacker: function(creep) {
		let fail = false;
		if (Game.rooms[creep.mem.targetRoom] && (Game.rooms[creep.mem.targetRoom].controller.upgradeBlocked || 0) > creep.ticksToLive) {
			fail = true;
		}
		else if (Game.rooms[creep.mem.targetRoom] && (Game.rooms[creep.mem.targetRoom].controller.safeMode || 0) > creep.ticksToLive) {
			fail = true;
		}
		else if (Game.rooms[creep.mem.targetRoom] && !Game.rooms[creep.mem.targetRoom].controller.owner) {
			fail = true;
		}

		if (fail || creep.mem.targetRoom == creep.room.name) {
			if (!fail && !creep.pos.isNearTo(creep.room.controller)) {
				creep.cachedMoveTo(creep.room.controller, 1, {"avoidEnemyRooms" : 1});//, "avoidLocalCreeps" : creep.pos.getRangeTo(creep.room.controller) <= 2  ? 1 : 0});
			}
			else {
				creep.mem.teamNames = creep.mem.teamNames || [creep.name]
				let numReady = 0;
				let minTTL = Infinity;
				if (!fail) {

					for (let teamName of creep.mem.teamNames) {
						// Well, he doesn't exist. Probably dead.
						if (!Game.creeps[teamName]) {
							numReady++
						}
						else {
							if (Game.creeps[teamName].ticksToLive < minTTL) {
								minTTL = Game.creeps[teamName].ticksToLive;
							}
							if (Game.creeps[teamName].pos.isNearTo(creep.room.controller)) {
								// He's gonna blow anyway, so hit it.
								if (Game.creeps[teamName].ticksToLive <= 2) {
									numReady = creep.mem.teamNames.length;
									break;
								}
								else {
									numReady++;
								}
							}
						}
					}

					if (creep.room.controller.level > 1 && creep.room.controller.ticksToDowngrade < minTTL) {
						numReady = 0;
					}
				}

				if (numReady == creep.mem.teamNames.length || fail || creep.ticksToLive <= 2) {
					let ret = fail ? -999 : creep.attackController(creep.room.controller)
					if (fail || ret == OK) {
						if (!fail) {
							let signString = Memory.botArena && !Memory.season ? "\uD83D\uDC2F" : "\uD83D\uDC2F Fully automated murder zone \uD83D\uDC2F"
							creep.signController(creep.room.controller, signString)
						}
						// console.log(creep.mem.targetRoom);
						delete creep.mem.targetRoom;
						for (var roomName of Memory.rooms[creep.mem.sR].goodRooms) {
							if (Game.rooms[roomName]) {
								var room = Game.rooms[roomName];

								if (!room.controller || room.controller.my) continue
								if (room.controller.reservation && (room.controller.reservation.username != util.getMyName())) continue
								if (room.mem.DT > 0.5 || room.dangerous > 1) continue
								if (room.controller.owner) continue

								// Ok, we want a reserver there.
								var reservers = Memory.rooms[creep.mem.sR].ownedCreeps["reserver"] || [];
								var alreadyTaken = false;
								for (var reserverName of reservers) {
									var otherCreep = Game.creeps[reserverName]
									if (otherCreep && otherCreep.mem.targetRoom == roomName) {
										alreadyTaken = true;
										break;
									}
								}

								if (!alreadyTaken) {
									creep.mem.targetRoom = roomName;
									console.log("Changing to reserver", creep.mem.role, creep.room.name)
									changeCreepRole(creep, "reserver")
									return this.runReserver(creep);
								}
							}
						}
						// console.log(creep.mem.targetRoom);
						if (!creep.mem.targetRoom) {
							// console.log("Recycle")
							changeCreepRole(creep, "recycler")
							return;
						}
					}
				}
			}
		}
		else {
			if (Memory.rooms[creep.mem.targetRoom]) {
				creep.cachedMoveTo(new RoomPosition(Memory.rooms[creep.mem.targetRoom].conX, Memory.rooms[creep.mem.targetRoom].conY, creep.mem.targetRoom), 1, {"avoidEnemyRooms" : 1});
			}
			else {
				creep.cachedMoveTo(new RoomPosition(25, 25, creep.mem.targetRoom), 20, {"avoidEnemyRooms" : 1});
			}

		}
	},

	runHeavyControllerAttacker: function(creep) {
		// if (creep.renew && !creep.ramparter) {
		// 	return this.runRenewer(creep);
		// }

		if (!creep.mem.ID) {
			creep.mem.role = "recycler"
			return
		}

		if (creep.getBoosts()) {
			return;
		}

		delete creep.mem.engaged

		let ccr = function() {
			if (creep.ticksToLive >= CREEP_CLAIM_LIFE_TIME / 2) {
				changeCreepRole(creep, "recycler")
			}
			else if (creep.hasBodypart(RANGED_ATTACK)) {
				changeCreepRole(creep, "ranged")
			}
			else if (creep.hasBodypart(HEAL)) {
				changeCreepRole(creep, "healer")
			}
			else {
				changeCreepRole(creep, "recycler")
			}
		}

		if (creep.mem.path && creep.ticksToLive < creep.mem.path.length) {
			ccr();
			return;
		}
		else if (Game.rooms[creep.mem.targetRoom] && (Game.rooms[creep.mem.targetRoom].controller.upgradeBlocked || 0) > creep.ticksToLive) {
			ccr();
			return;
		}
		else if (Game.rooms[creep.mem.targetRoom] && (Game.rooms[creep.mem.targetRoom].controller.safeMode || 0) > creep.ticksToLive) {
			ccr();
			return;
		}
		else if (Game.rooms[creep.mem.targetRoom] && !Game.rooms[creep.mem.targetRoom].controller.owner) {
			ccr();
			return;
		}

		if (creep.hasBodypart(RANGED_ATTACK)) {
			assaulterRangedAttack(creep)
		}

		let allInTargetOrSetupRoom = 1;

		creep.mem.team = creep.mem.team || [creep.name]

		for (var teamCreepName of creep.mem.team) {
			let teamCreep = Game.creeps[teamCreepName];
			if (!teamCreep) continue;

			if (teamCreep.room.name != teamCreep.mem.targetRoom && teamCreep.room.name != teamCreep.mem.setupRoom) {
				allInTargetOrSetupRoom = 0;
			}
		}


		let attackedController = 0;

		if (allInTargetOrSetupRoom || creep.mem.pastAllInTargetOrSetupRoom) {
			let anyClose = 0;
			let allClose = 1;

			// If any creeps are in position break the snake and mob around the controller
			for (var teamCreepName of creep.mem.team) {
				let teamCreep = Game.creeps[teamCreepName];
				if (!teamCreep) continue;

				teamCreep.mem.pastAllInTargetOrSetupRoom = 1;

				if (teamCreep.room.name == teamCreep.mem.targetRoom && teamCreep.pos.isNearTo(creep.room.controller)) {
					anyClose = 1;			
				}
				else {
					allClose = 0;
				}
			}

			if (allClose) {
				// These shouldn't happen but might
				creep.cancelOrder("heal")
				creep.cancelOrder("rangedHeal")
				let ret = creep.attackController(creep.room.controller)
				if (ret == OK) {
					attackedController = 1;
					creep.signController(creep.room.controller, "\uD83D\uDC2F")

					ccr();
					return;
				}
			}
			else if (anyClose) {
				creep.cachedMoveTo(creep.room.controller, 1, {"avoidEnemyRooms" : 1, "avoidHostiles": 1});
			}
			else if (!creep.moveOrdersGiven) {
				// if (Game.rooms[creep.mem.targetRoom]) {
				// 	snakeAI.moveSnake(creep.mem.team, Game.rooms[creep.mem.targetRoom].controller.pos, {"avoidEnemyRooms" : 1, "avoidHostiles": 1}, 1, false)
				// }
				// else {
					snakeAI.moveSnake(creep.mem.team, new RoomPosition(Memory.rooms[creep.mem.targetRoom].conX, Memory.rooms[creep.mem.targetRoom].conY, creep.mem.targetRoom), {"avoidEnemyRooms" : 1, "avoidHostiles": 1}, 1, false)
				// }
			}
		}
		else if (!creep.moveOrdersGiven) {
			if (creep.mem.team.length > 1 || !Game.rooms[creep.mem.targetRoom]) {
				snakeAI.moveSnake(creep.mem.team, new RoomPosition(25, 25, creep.mem.setupRoom), {"avoidEnemyRooms" : 1, "avoidHostiles": 1}, 15, false);
			}
			else {
				creep.uncachedMoveTo(Game.rooms[creep.mem.targetRoom].controller, 1, {"avoidEnemyRooms" : 1, "avoidHostiles": 1})
			}
		}

		// Simultanous with heal...
		// TODO: team healing
		if (!attackedController) {
			if (creep.hasBodypart(HEAL)) {
				creep.heal(creep)
			}
		}
	},


	runControllerRescuer: function(creep) {
		// Huh.
		if (!creep.mem.targetRoom) {
			changeCreepRole(creep, "upgrader");
			return;
		}

		if (creep.room.name != creep.mem.targetRoom) {
			if (creep.getStoreUsedCapacity() < creep.carryCapacity && creep.room.storage) {
				var ret = creep.withdraw(creep.room.storage, RESOURCE_ENERGY)
				if (ret == ERR_NOT_IN_RANGE) {
					creep.uncachedMoveTo(creep.room.storage, 1)
				}
			}
			else {
				let targetPos;
				if (Game.rooms[creep.mem.targetRoom]) {
					targetPos = Game.rooms[creep.mem.targetRoom].controller;
				}
				else {
					targetPos = new RoomPosition(25, 25, creep.mem.targetRoom);
				}
				creep.cachedMoveTo(targetPos, 15, {"avoidEnemyRooms" : 1});
			}

			return;
		}
		else if (creep.room.controller.my && creep.getStoreUsedCapacity()) {
			if (!creep.pos.inRangeTo(creep.room.controller, 3)) {
				creep.uncachedMoveTo(creep.room.controller, 3, {"avoidEnemyRooms" : 1});
			}
			else {
				creep.upgradeController(creep.room.controller);
			}
		}
		else {
			changeCreepRole(creep, "pioneer");
			return;
		}
	},


	// Do everything, but in a single room
	runPioneer: function(creep) {
		// Get the boosts!
		if ((creep.room.effectiveLevel || 0) > 6 && creep.getBoosts()) {
			return;
		}

		let moveOptions;
		if (creep.room.dangerous) {
			moveOptions = {"avoidEnemyRooms" : 1, "avoidHostiles" : 2, "maxDT" : 1.25, "minKD" : -0.5};
		}
		else {
			moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.25, "minKD" : -0.5, "noRePathOnOptsChange": 1};
		}


		// Huh.
		if (!creep.mem.targetRoom) {
			creep.mem.targetRoom = _.sample(Memory.rooms[creep.mem.sR].childRooms);
		}


		if (creep.room.name != creep.mem.targetRoom && !creep.mem.fT && !creep.mem.workTarget) {
			if (creep.getStoreUsedCapacity() < creep.carryCapacity && creep.room.storage && creep.room.storage.store.energy > 10000 && (Memory.rooms[creep.room.name].fullyConnected === undefined ? true : Memory.rooms[creep.room.name].fullyConnected)) {
				var ret = creep.withdraw(creep.room.storage, RESOURCE_ENERGY)
				if (ret == ERR_NOT_IN_RANGE) {
					creep.uncachedMoveTo(creep.room.storage, 1, moveOptions)
				}
			}
			else {
				var targetPos = new RoomPosition(25, 25, creep.mem.targetRoom);
				var roomPos = util.getRoomPos(creep.room.name)
				// if (roomPos.x >= 2) {
				// 	creep.cachedMoveTo(new RoomPosition(25, 25, "W0N78"), 20)
				// }
				// else {
					creep.cachedMoveTo(targetPos, 15, moveOptions);
				// }



				if (creep.hits != creep.hitsMax && creep.hasActiveBodypart(HEAL)) {
					creep.heal(creep)
				}
			}

			return;
		}

		// Let the target room know they have a pioneer. This can then be used to supress builders
		if (creep.room.name == creep.mem.targetRoom) {
			Memory.rooms[creep.room.name].ownedCreeps = Memory.rooms[creep.room.name].ownedCreeps || {}
			Memory.rooms[creep.room.name].ownedCreeps["pioneer"] = Memory.rooms[creep.room.name].ownedCreeps["pioneer"] || []
			if (!Memory.rooms[creep.room.name].ownedCreeps["pioneer"].includes(creep.name)) {
				Memory.rooms[creep.room.name].ownedCreeps["pioneer"].push(creep.name)
			}
		}

		if (creep.hits != creep.hitsMax && creep.hasActiveBodypart(HEAL)) {
			creep.heal(creep)
			return
		}


		/*if (creep.hasActiveBodypart(ATTACK) || creep.hasActiveBodypart(RANGED_ATTACK)) {
			// Find bad men and kill them.
			var hardTarget = creep.pos.findClosestByRange(FIND_HOSTILE_CREEPS, {
				filter: (object) => {
					return object.hasActiveBodypart(ATTACK) || object.hasActiveBodypart(RANGED_ATTACK) || object.hasActiveBodypart(HEAL);
				}
			});

			var softTarget;
			if (!hardTarget) {
				softTarget = creep.pos.findClosestByRange(creep.room.getAllHostileCreepsAndPowerCreeps());
			}

			var attackTarget = hardTarget || softTarget;

			if (creep.pos.getRangeTo(attackTarget) > 8) {
				attackTarget = undefined;
			}

			if (creep.hits > 0.75 * creep.hitsMax && attackTarget) {
				creep.uncachedMoveTo(attackTarget, 0);
				if (creep.pos.isNearTo(attackTarget)) {
					creep.attack(attackTarget)
				}
				else if (creep.hits != creep.hitsMax && creep.hasActiveBodypart(HEAL)) {
					creep.heal(creep)
				}
				else if (creep.hasActiveBodypart(HEAL)) {
					var healFriend = creep.pos.findClosestByRange(FIND_MY_CREEPS, {
						filter: (object) => {
							return object.hits != object.hitsMax
						}
					});
					if (healFriend) {
						if (creep.pos.isNearTo(healFriend)) {
							creep.heal(healFriend);
						}
						else {
							creep.rangedHeal(healFriend)
						}
					}
				}
				return;
			}
			else if (attackTarget) {
				var result = PathFinder.search(creep.pos, {pos: attackTarget.pos, range: 5}, {flee: true});
				creep.moveByPath(result.path);
				if (creep.hasActiveBodypart(HEAL)) creep.heal(creep)
				return;
			}

			if (creep.hasActiveBodypart(HEAL)) {
				// No bad men! First... heal
				if (creep.hits != creep.hitsMax) {
					creep.heal(creep)
					return;
				}
				var healFriend = creep.pos.findClosestByRange(FIND_MY_CREEPS, {
					filter: (object) => {
						return object.hits != object.hitsMax
					}
				});

				if (healFriend) {
					creep.uncachedMoveTo(healFriend, 0);
					if (creep.pos.isNearTo(healFriend)) {
						creep.heal(healFriend);
					}
					else {
						creep.rangedHeal(healFriend)
					}
					return;
				}
			}
		}*/

		// Now, do useful shit. Order of business
		// 1) Fill towers
		// 2) Build any construction sites
		// 3) Upgrade controller
		if (!creep.mem.f && creep.getStoreUsedCapacity() == 0) {
			creep.mem.f = 1;
			creep.mem.fT = undefined;
			creep.mem.workTarget = undefined;
		}
		if (creep.mem.f && creep.getStoreUsedCapacity() >= creep.carryCapacity) {
			creep.mem.f = 0;
			creep.mem.fT = undefined;
			creep.mem.workTarget = undefined;
		}

		if (creep.mem.f) {
			if (creep.room.storage && creep.room.storage.store.energy > 10000) {
				var ret = creep.withdraw(creep.room.storage, RESOURCE_ENERGY)
				if (ret == ERR_NOT_IN_RANGE) {
					creep.uncachedMoveTo(creep.room.storage, 1, moveOptions)
				}
			}
			else if (creep.room.terminal && creep.room.terminal.store.energy > 10000) {
				var ret = creep.withdraw(creep.room.terminal, RESOURCE_ENERGY)
				if (ret == ERR_NOT_IN_RANGE) {
					creep.uncachedMoveTo(creep.room.terminal, 1, moveOptions)
				}
			}
			else {
				if (creep.room.name === creep.mem.targetRoom) {
					// Transfer ownership
					if (creep.mem.sR != creep.room.name) {						
						_.pull(Memory.rooms[creep.mem.sR].ownedCreeps["pioneer"], creep.name)
						creep.mem.sR = creep.room.name
						creep.room.mem.ownedCreeps = creep.room.mem.ownedCreeps || {}
						creep.room.mem.ownedCreeps["pioneer"] = creep.room.mem.ownedCreeps["pioneer"] || []
						if (!creep.room.mem.ownedCreeps["pioneer"].includes(creep.name)) {
							creep.room.mem.ownedCreeps["pioneer"].push(creep.name)
						}
					}
					moveOptions.maxRooms = 1;
				}

				if (Math.random() < 0.02) {
					delete creep.mem.fT
				}

				var opportunisticSource = creep.pos.findFirstInRange(FIND_SOURCES, 1, {
					filter: (object) => {
						if (object.energy == 0) return false;
						return true
					}
				});

				if (opportunisticSource) {
					creep.harvest(opportunisticSource)
				}


				let droppedResource;
				let ruin
				let tombstone

				droppedResource = creep.pos.findFirstInRange(FIND_DROPPED_RESOURCES, 3, {
					filter: (object) => {
						return object.resourceType == RESOURCE_ENERGY && object.amount > 100;
					}
				});

				if (creep.mem.ally && !creep.room.mem.owner && !creep.room.find(FIND_CONSTRUCTION_SITES).length) {
					droppedResource = undefined
				}

				if (droppedResource) {
					var ret = creep.pickup(droppedResource)
					if (ret == ERR_NOT_IN_RANGE) {
						creep.uncachedMoveTo(droppedResource, 1, moveOptions)
					}
				}
				else {		
					ruin = creep.pos.findFirstInRange(FIND_RUINS, 3, {
						filter: (object) => {
							return object.store.getUsedCapacity(RESOURCE_ENERGY);
						}
					});

					if (ruin) {
						var ret = creep.withdraw(ruin, RESOURCE_ENERGY)
						if (ret == ERR_NOT_IN_RANGE) {
							creep.uncachedMoveTo(ruin, 1, moveOptions)
						}
					}
				}
				if (!droppedResource && !ruin) {				
					tombstone = creep.pos.findFirstInRange(FIND_TOMBSTONES, 3, {
						filter: (object) => {
							return object.store.getUsedCapacity(RESOURCE_ENERGY);
						}
					});

					if (tombstone) {
						var ret = creep.withdraw(tombstone, RESOURCE_ENERGY)
						if (ret == ERR_NOT_IN_RANGE) {
							creep.uncachedMoveTo(tombstone, 1, moveOptions)
						}
					}
				}

				let possibleTargets = []

				if (!droppedResource && !ruin && !tombstone) {
					let allDroppedResources = creep.room.find(FIND_DROPPED_RESOURCES, {
						filter: (object) => {
							return object.resourceType == RESOURCE_ENERGY && object.amount >= creep.carryCapacity;
						}
					});

					if (creep.mem.ally && !creep.room.mem.owner && !creep.room.find(FIND_CONSTRUCTION_SITES).length) {
						allDroppedResources = []
					}


					let allRuins = creep.room.find(FIND_RUINS, {
						filter: (object) => {
							return object.store.getUsedCapacity(RESOURCE_ENERGY) >= creep.carryCapacity;
						}
					});

					let allTombstones = creep.room.find(FIND_TOMBSTONES, {
						filter: (object) => {
							return object.store.getUsedCapacity(RESOURCE_ENERGY) >= creep.carryCapacity;
						}
					});

					let allContainers = _.filter(creep.room.containers, (container) => {
						return container.store.getUsedCapacity(RESOURCE_ENERGY) >= creep.carryCapacity * 2;
					});

					// We'll have fetchers doing the legwork for us
					possibleTargets = allDroppedResources.concat(allRuins).concat(allTombstones).concat(allContainers);

					if (possibleTargets.length) {
						let closest = creep.pos.findClosestByRange(possibleTargets)
						creep.mem.fT = closest.id;

						if (!creep.pos.isNearTo(closest)) {
							creep.uncachedMoveTo(closest, 1, moveOptions)				
						}
						else if (closest.amount) {
							creep.pickup(closest)
						}
						else {
							creep.withdraw(closest, RESOURCE_ENERGY)
						}
						delete creep.mem.fT
					}
				}

				if (possibleTargets.length == 0 && !droppedResource && !ruin && !tombstone) {
					let retargetNextTick = false;
					if (!creep.mem.fT) {
						let source = creep.pos.findClosestByRange(FIND_SOURCES, {
							filter: (object) => {
								if (object.energy == 0 && (object.ticksToRegeneration || Infinity) > creep.pos.getRangeTo(object.pos)) return false;

								for (let otherCreep of creep.room.find(FIND_MY_CREEPS)) {
									if ((otherCreep.mem.role == "pioneer" || otherCreep.mem.role == "intershardPioneer" || otherCreep.mem.role == "harvester") && (otherCreep.mem.fT == object.id || otherCreep.mem.hSource == object.id)) {
										return false;
									}
								}
								return true;
							}
						});

						if (source) {
							creep.mem.fT = source.id
						}

						if (!source) {
							source = creep.pos.findClosestByRange(FIND_SOURCES, {
								filter: (object) => {
									if (object.energy == 0 && (object.ticksToRegeneration || Infinity) > creep.pos.getRangeTo(object.pos)) return false;

									let numMinePoints = object.pos.countAccessibleTiles()

									let cnt = 0
									for (let otherCreep of creep.room.find(FIND_MY_CREEPS)) {
										if ((otherCreep.mem.role == "pioneer" || otherCreep.mem.role == "intershardPioneer" || otherCreep.mem.role == "harvester") && (otherCreep.mem.fT == object.id || otherCreep.mem.hSource == object.id)) {
											cnt++
											if (cnt >= numMinePoints) {
												return false
											}
										}
									}

									return true;
								}
							});	
							if (source) {
								creep.mem.fT = source.id
							}
						}

						if (!source) {
							source = creep.pos.findClosestByRange(FIND_SOURCES, {
								filter: (object) => {
									if (object.energy == 0 && (object.ticksToRegeneration || Infinity) > creep.pos.getRangeTo(object.pos)) return false;
									return true;
								}
							});	
							if (source) {
								creep.mem.fT = source.id
								retargetNextTick = true
							}
						}

						if (source && creep.room.controller.owner && !creep.room.controller.my) {
							source = undefined
						}
					}

					if (creep.mem.fT) {
						let target = Game.getObjectById(creep.mem.fT)
						if (!target) {
							creep.mem.fT = undefined;
						}
						else if (!creep.pos.isNearTo(target)) {
							creep.uncachedMoveTo(target, 1, moveOptions)
						}
						else if (target.amount) {
							creep.pickup(target)
						}
						else if (target.energyCapacity) {							
							var ret = creep.harvest(target)
							if (ret == ERR_NOT_ENOUGH_RESOURCES) {
								creep.mem.fT = undefined;
							}
						}
						else {
							creep.withdraw(target, RESOURCE_ENERGY)
						}
						if (retargetNextTick) {
							delete creep.mem.fT
						}
					}
					else {
						droppedResource = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
							filter: (object) => {
								return object.resourceType == RESOURCE_ENERGY;
							}
						});

						if (droppedResource) {
							var ret = creep.pickup(droppedResource)
							if (ret == ERR_NOT_IN_RANGE) {
								creep.uncachedMoveTo(droppedResource, 1, moveOptions)
							}
						}
					}
				}
			}
		}
		else {
			if (creep.room.name === creep.mem.targetRoom) {
				moveOptions.maxRooms = 1;
			}

			// Not 100% sure why I have this. It failed a botarena before I added creep.room.name !== creep.mem.targetRoom
			// As they just sat there doing nothing in the target room after being damaged
			if (creep.room.name !== creep.mem.targetRoom && (creep.hits < creep.hitsMax - 100 || !creep.hasActiveBodypart(WORK))) {
				creep.cachedMoveTo(new RoomPosition(25, 25, creep.mem.targetRoom), 15, moveOptions);
			}
			else {
				let towers = creep.room.getTowers();

				towers = _.filter(towers, (tower) => {
					return tower.energy < tower.energyCapacity * .8 || tower.hits != tower.hitsMax;
				});

				if (towers.length > 0) {
					if (!creep.mem.towerTarget || !Game.getObjectById(creep.mem.towerTarget)) {
						creep.mem.towerTarget = creep.pos.findClosestByRange(towers).id;
					}
					else {
						let target = Game.getObjectById(creep.mem.towerTarget);
						if (target && target.energy < target.energyCapacity) {
							var ret = creep.transfer(target, RESOURCE_ENERGY)
							if (ret == ERR_NOT_IN_RANGE) {
								creep.uncachedMoveTo(target, 1, moveOptions)
							}
							else {
								creep.mem.towerTarget = undefined;
							}
						}
						else if (target && target.hits != target.hitsMax) {
							var ret = creep.repair(target)
							if (ret == ERR_NOT_IN_RANGE) {
								creep.uncachedMoveTo(target, 3, moveOptions)
							}
							else {
								creep.mem.towerTarget = undefined;
							}
						}
					}
				}
				else {
					if (!creep.mem.workTarget || Math.random() < 0.05 || Game.getObjectById(creep.mem.workTarget) == creep.room.controller) {
						let target;
						for (let rampart of creep.room.find(FIND_MY_STRUCTURES, {filter: (s) => (s.structureType == STRUCTURE_RAMPART)})) {
							if (rampart.hits < 10000) {
								target = rampart;
								break;
							}
						}

						if (creep.mem.ally && !creep.room.mem.owner) {
							for (let container of creep.room.containers) {
								if (container.hits < container.hitsMax * 0.5 || (container.hits < container.hitsMax * 0.75 && creep.pos.inRangeToPos(container.pos, 3))) {
									target = container
									break
								}
							}

						}


						if (creep.room.controller && ((creep.room.controller.ticksToDowngrade < CONTROLLER_DOWNGRADE[creep.room.controller.level] * 0.6 || creep.room.controller.progress / creep.room.controller.progressTotal > 1) && (creep.room.controller.upgradeBlocked || 0) < 10)) {
							target = creep.room.controller
						}


						if (!target) {
							var targets;
							if (creep.mem.ally) {
								targets = creep.room.find(FIND_CONSTRUCTION_SITES);
								targets = _.filter(targets, (target) => (target.my || target.owner.username == creep.mem.ally));
							}
							else {
								targets = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
							}

							if (targets.length == 0) {
								creep.room.mem.triggerRebuild = 1;
								if (creep.room.mem.triggerRebuildCooldown) {
									creep.room.mem.triggerRebuildCooldown--
								}
							}
							var rampartTargets = _.filter(targets, (target) => (target.structureType == STRUCTURE_RAMPART));
							var towerTargets = _.filter(targets, (target) => (target.structureType == STRUCTURE_TOWER));
							var spawnTargets = _.filter(targets, (target) => (target.structureType == STRUCTURE_SPAWN));

							if (rampartTargets.length > 0) {
								target = creep.pos.findClosestByRange(rampartTargets);
							}
							else if (towerTargets.length > 0) {
								let maxProgress = 0;
								for (let tower of towerTargets) {
									if (tower.progress > maxProgress) {
										target = tower;
										maxProgress = tower.progress;
									}
								}
								if (!target) {
									target = creep.pos.findClosestByRange(towerTargets);
								}
							}
							else if (creep.room.controller && creep.room.controller.progress > creep.room.controller.progressTotal) {
								target = creep.room.controller;
							}
							else if (spawnTargets.length > 0 && creep.room.spawns.length < 1) {
								let maxProgress = 0;
								for (let spawn of spawnTargets) {
									if (spawn.progress > maxProgress) {
										target = spawn;
										maxProgress = spawn.progress;
									}
								}
								if (!target) {
									target = creep.pos.findClosestByRange(spawnTargets);
								}
							}
							else if (creep.room.controller && creep.room.controller.ticksToDowngrade < CONTROLLER_DOWNGRADE[creep.room.controller.level] * 0.75 && creep.room.controller.my) {
								target = creep.room.controller;
							}
							else if (spawnTargets.length > 0) {
								let maxProgress = 0;
								for (let spawn of spawnTargets) {
									if (spawn.progress > maxProgress) {
										target = spawn;
										maxProgress = spawn.progress;
									}
								}
								if (!target) {
									target = creep.pos.findClosestByRange(spawnTargets);
								}
							}
							else {
								let maxProgress = 0;
								let bestTarget;
								for (let testTarget of targets) {
									// Grab high progress items
									if (testTarget.progress / testTarget.progressTotal > 0.25 && testTarget.progress > 500 && testTarget.progress > maxProgress) {
										maxProgress = testTarget.progress;
										bestTarget = testTarget;
									}
								}
								if (!bestTarget) {
									bestTarget = creep.pos.findClosestByRange(targets);
								}

								// console.log(creep, targets, bestTarget)

								target = bestTarget
							}
						}

						if (creep.room.controller && creep.room.controller.level == 1 || !target || (creep.room.controller.ticksToDowngrade < 1000 && (creep.room.controller.upgradeBlocked || 0 < 10))) {
							if (creep.room.controller.level == 8) {
								// Feck.
								changeCreepRole(creep, "repairer")
								return;
							}
							else if (creep.room.controller.my) {
								creep.mem.workTarget = creep.room.controller.id;
							}
						}
						if (target) {
							creep.mem.workTarget = target.id;
						}
					}

					if (creep.mem.workTarget) {
						let target = Game.getObjectById(creep.mem.workTarget)
						if (!target) {
							creep.mem.workTarget = undefined
						}
						else if (Game.rooms[creep.mem.targetRoom] && target == Game.rooms[creep.mem.targetRoom].controller) {
							if ((Game.rooms[creep.mem.targetRoom].controller.upgradeBlocked || 0) > 10) {
								creep.mem.workTarget = undefined
							}
							else {
								var ret = creep.upgradeController(target)
								if (ret == ERR_NOT_IN_RANGE) {
									creep.uncachedMoveTo(target, 3, moveOptions)
								}
								else if (ret != OK) {
									creep.mem.workTarget = undefined
								}
							}
						}
						else if (target.hits) {
							var ret = creep.repair(target)
							if (ret == ERR_NOT_IN_RANGE) {
								creep.uncachedMoveTo(target, 3, moveOptions)
							}
							else if (ret != OK) {
								creep.mem.workTarget = undefined
							}
						}
						else {
							var ret = creep.build(target)
							if (creep.pos.isEqualToPos(target.pos)) {
								creep.move(Math.ceil(Math.random() * 8))
							}
							if (ret == ERR_NOT_IN_RANGE) {
								creep.uncachedMoveTo(target, 3, moveOptions)
							}
							// A bit brutal
							else if (ret == ERR_RCL_NOT_ENOUGH) {
								target.remove();
							}
							else if (ret != OK) {
								creep.mem.workTarget = undefined
							}
						}
					}
					else if (creep.mem.ally && !creep.room.mem.owner) {
						let found = false
						for (let container of creep.room.containers) {
							if (container.hits < container.hitsMax * 0.8 || (container.hits < container.hitsMax && creep.pos.inRangeToPos(container.pos, 3))) {
								found = true;
								if (creep.pos.inRangeToPos(container.pos, 3)) {
									creep.repair(container)
								}
								else {
									creep.cachedMoveTo(container, 3, moveOptions)
								}
								break
							}
						}
						if (!found) {
							for (let container of creep.room.containers) {
								if (container.store.getFreeCapacity()) {
									found = true;
									if (creep.pos.isNearToPos(container.pos)) {
										creep.transfer(container, RESOURCE_ENERGY)
									}
									else {
										creep.cachedMoveTo(container, 1, moveOptions)
									}
									break
								}
							}
						}
						if (!found) {
							creep.drop(RESOURCE_ENERGY)
						}
					}
				}
			}

		}

		if (creep.mem.f || (!creep.mem.ally || creep.room.mem.owner)) {
			creep.grabBonusEnergy(50);
		}
	},

	repairerBuilderGetEnergy(creep, moveOptions) {
		// if (creep.mem.targetBoosts && creep.room.effectiveLevel >= 6 && creep.room.labs)

		if (!creep.mem.fT) {
			let target
			if (creep.room.dangerous && creep.room.storage) {
				target = creep.room.storage
			}
			else if (!creep.room.keeperRoom || Memory.rooms[creep.mem.sR].keeperHarvestRooms.includes(creep.room.name)) {
				target = creep.pos.findClosestByRange(FIND_STRUCTURES, {
					filter: (structure) => {
						if ((structure.structureType == STRUCTURE_CONTAINER || (structure.structureType == STRUCTURE_STORAGE && structure.my)) &&
							 (structure.structureType == STRUCTURE_STORAGE || !roomAI.isInSpawnBattery(structure) || (structure.room.effectiveLevel < 4 || structure.room.mem.supressFetchers > 10)) &&
							 (structure._energy === undefined ? structure.store[RESOURCE_ENERGY] : structure._energy) > (creep.room.effectiveLevel >= 4 ? creep.carryCapacity : creep.carryCapacity / 4)) {
							return true;
						}
						if (structure.structureType == STRUCTURE_FACTORY && structure.my && structure.store[RESOURCE_ENERGY] > 20000) {
							return true;
						}
						if ((structure.structureType == STRUCTURE_LINK && structure.my && !roomAI.isDropoffPoint(structure) && !roomAI.isEnergyEndPoint(structure)) && structure.energy > creep.carryCapacity) {
							return true;
						}
						return false;
					}
				});
			}

			if (target) {
				creep.mem.fT = target.id
			}
			else /*if (creep.room.effectiveLevel === undefined || !roomAI.hasSpawnBatteryContainers(creep.room))*/ {
				// A bit of a CPU hog... no locking here.
				if (!creep.room.dangerous && (creep.room.mem.supressFetchers || 0) <= 0) {
					target = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
						filter: (resource) => {
							resource._energy = resource._energy || resource.energy
							if (resource._energy >= creep.carryCapacity) {
								return true;
							}
							return false;
						}
					});

					if (target) {
						creep.mem.fT = target.id;
						target._energy -= creep.carryCapacity
						if(creep.pickup(target) == ERR_NOT_IN_RANGE) {
							creep.uncachedMoveTo(target, 1, moveOptions)
						}
						return
					}
				}

				target = creep.pos.findClosestByRange(FIND_MY_SPAWNS, {
					filter: (structure) => {
						if (structure.energy == structure.energyCapacity) {
							return true;
						}
						return false;
					}
				});

				if (target) {
					creep.mem.fT = target.id;
					let ret = creep.withdraw(target, RESOURCE_ENERGY)
					if(ret == ERR_NOT_IN_RANGE) {
						creep.uncachedMoveTo(target, 1, moveOptions)
					}
					else if (ret == OK || ret == ERR_NOT_ENOUGH_RESOURCES) {
						delete creep.mem.fT
					}

					return
				}
			}
		}

		if (creep.mem.fT) {
			let target = Game.getObjectById(creep.mem.fT)

			if (target) {
				if (!creep.pos.isNearToPos(target.pos)) {
					if (target.amount) {
						target._energy = target._energy || target.energy
						target._energy -= creep.carryCapacity
					}
					else {
						target._energy = target._energy || target.store[RESOURCE_ENERGY]
						target._energy -= creep.carryCapacity
					}
					creep.cachedMoveTo(target, 1, moveOptions);
				}
				else {
					let ret;
					if (target.amount) {
						target._energy = target._energy || target.energy
						target._energy -= creep.carryCapacity
						ret = creep.pickup(target);
						if (ret == OK) {
							global._creepStoreUsedCapacity[creep.id] = Math.min(creep.carryCapacity, creep.getStoreUsedCapacity() + target.amount)

							if (creep.getStoreUsedCapacity() == creep.carryCapacity) {
								if (creep.mem.role == "builder") {
									delete creep.mem.fT
									return this.runBuilder(creep)
								}
								else if (creep.mem.role == "repairer") {
									delete creep.mem.fT
									return this.runRepairer(creep)
								}
							}
						}
					}
					else {
						target._energy = target._energy || target.store[RESOURCE_ENERGY]
						target._energy -= creep.carryCapacity

					 	ret = creep.withdrawAndUpdateCarry(target, RESOURCE_ENERGY);
						if (ret == OK) {
							// global._creepStoreUsedCapacity[creep.id] = Math.min(creep.carryCapacity, (global._creepStoreUsedCapacity[creep.id] || 0) + target.store[RESOURCE_ENERGY])

							if (creep.getStoreUsedCapacity() == creep.carryCapacity) {
								if (creep.mem.role == "builder") {
									delete creep.mem.fT
									return this.runBuilder(creep, true)
								}
								else if (creep.mem.role == "repairer") {
									delete creep.mem.fT
									return this.runRepairer(creep, true)
								}
							}

						}
					}
					if (ret == OK || ret == ERR_NOT_ENOUGH_RESOURCES) {
						delete creep.mem.fT
					}
				}
			}
			else {
				delete creep.mem.fT
			}
		}
		else {
			let bestSource
			let bestScore = Infinity

			if (!creep.room.keeperRoom && (!creep.room.mem.reservedBy || creep.room.mem.reservedBy == util.getMyName())) {				
				for (let source of creep.room.find(FIND_SOURCES_ACTIVE)) {
					// Don't mine the damn centre rooms!
					if (Memory.season5 && !creep.room.controller) {
						continue
					}


					let score = creep.pos.getRangeToPos(source.pos)

					if (score > bestScore) {
						continue
					}
					// Already next to it.
					else if (score == 1) {
						bestSource = source
						break
					}

					let numNeighbourCreeps = source.pos.findInRange(FIND_MY_CREEPS, 1).length
					let valid = numNeighbourCreeps == 0 || source.pos.countAccessibleTiles() - numNeighbourCreeps > 0
					
					if (valid) {
						bestSource = source
						bestScore = score;
						break
					}
				}
			}

			if (bestSource) {				
				if (creep.harvest(bestSource) == ERR_NOT_IN_RANGE) {
					creep.uncachedMoveTo(bestSource, 1, moveOptions)
				}
			}
			else {
				if (Game.rooms[creep.mem.sR] && Game.rooms[creep.mem.sR].storage) {
					creep.cachedMoveTo(Game.rooms[creep.mem.sR].storage, 1, moveOptions);
				}
				else {
					creep.cachedMoveTo(new RoomPosition(25, 25, creep.mem.sR), 10, moveOptions);
				}
			}
		}
	},


	runRepairer: function(creep, recursiveCall = false) {
		if (creep.mem.wT !== undefined && Game.time < creep.mem.wT) {
			return;
		}

		// Get the boosts!
		if (creep.getBoosts()) {
			return;
		}

		let moveOptions;
		if ((creep.room.dangerous && creep.pos.findFirstInRange(creep.room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK], false), 20)) || creep.hits != creep.hitsMax) {
			moveOptions = {"avoidEnemyRooms" : 1,
						   "avoidHostiles" : 1,
						   // "avoidHostiles" : (creep.room.controller && creep.room.controller.my ? 1 : 1),
						   "rampartFocus" : ((creep.room.controller && creep.room.controller.my) ? 1 : undefined),
						   "maxDT" : 1.25,
						   "minKD" : -0.5};
		}
		else {
			moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.25, "minKD" : -0.5};
		}


		if (!creep.mem.f && creep.getStoreUsedCapacity() == 0) {
			// if (creep.mem.ticksToLive < 50) {
			// 	changeCreepRole(creep, "recycler")
			// 	return this.runRecycler(creep)
			// }
			// else {
			if (creep.mem.econSupport) {
				if (creep.civilianSpookedSK()) {
					return
				}
				if (creep.room.name != creep.mem.targetRoom) {
					creep.cachedMoveTo(new RoomPosition(25, 25, creep.mem.targetRoom), 20, moveOptions)
					return
				}
				delete creep.mem.econSupport
			}

			creep.mem.f = 1;
			creep.mem.rTgt = undefined;
			creep.mem.fT = undefined;
			// }
		}
		if (creep.mem.f && creep.getStoreUsedCapacity() > creep.carryCapacity * 0.66) {
			creep.mem.f = 0;
			creep.mem.fT = undefined;
		}

		if (creep.civilianSpookedSK()) {
			creep.mem.rTgt = undefined;
			creep.mem.fT = undefined;
			return;
		}


		if (Math.random() < 0.02 && creep.mem.origRole == "builder" && creep.room.find(FIND_MY_CONSTRUCTION_SITES).length && !recursiveCall) {
			if (creep.room.dangerous == 2 || (creep.room.mem.attackScore || 0) > 0) {				
				let valuableStructure = 0;
				for (let constructionSite of creep.room.find(FIND_MY_CONSTRUCTION_SITES)) {
					if (constructionSite.structureType == STRUCTURE_TOWER || constructionSite.structureType == STRUCTURE_SPAWN) {
						valuableStructure = 1;
						break;
					}
				}
				if (valuableStructure) {				
					changeCreepRole(creep, "builder");
					return this.runBuilder(creep);
				}
			}
			else {
				changeCreepRole(creep, "builder");
				return this.runBuilder(creep);
			}
		}


		if (creep.ticksToLive < 50 && creep.room.name == creep.mem.sR && creep.hasBoost()) {
			let res = this.attempToUnBoost(creep)
			if (res) {
				return
			}
		}

		let repairedThisTick

		if(creep.mem.f) {
		 	if (!recursiveCall) this.repairerBuilderGetEnergy(creep, moveOptions)
		}
		else {
			// Make sure we repair what's under attack
			if (creep.room.dangerous && Math.random() < 0.1) {
				delete creep.mem.rTgt
			}
			var repairTargetObj = Game.getObjectById(creep.mem.rTgt);

			let numWork = creep.getNumOfBodyPart(WORK);

			if (creep.mem.rTgt == undefined || 
				repairTargetObj == undefined || 
				repairTargetObj.hits == repairTargetObj.hitsMax || 
				// (repairTargetObj.hits >= repairTargetObj.hitsMax - numWork * 100 * .9 && (repairTargetObj.hits == repairTargetObj.hitsMax || creep.pos.inRangeToPos(repairTargetObj.pos, 3))) || 
				(repairTargetObj.hitsMax <= 50000 && repairTargetObj.currentlyRepairing)) {
				creep.mem.rTgt = undefined;
				if (creep.room.name == creep.mem.sR && !creep.room.dangerous) {
					let rampartConstructionSites = creep.room.find(FIND_MY_CONSTRUCTION_SITES, {
						filter: (site) => {
							return site.structureType == STRUCTURE_RAMPART;
						}
					});

					if (rampartConstructionSites.length > 0) {
						creep.mem.rTgt = creep.pos.findClosestByRange(rampartConstructionSites).id;
						repairTargetObj = Game.getObjectById(creep.mem.rTgt)

						if (!creep.pos.inRangeTo(repairTargetObj, 3)) {
							let rampWith1Hit = creep.pos.findFirstInRange(FIND_MY_STRUCTURES, 3, {						
								filter: (sturct) => {
									return sturct.structureType == STRUCTURE_RAMPART && sturct.hits == 1;
								}
							})

							if (rampWith1Hit) {
								creep.repair(rampWith1Hit)
								repairedThisTick = 1
							}

						}
					}
				}
				if (creep.mem.rTgt == undefined) {
					var repTarget = roomAI.getRepairPriority(Game.rooms[creep.mem.sR], 
															 false, 
															 repairTargetObj && repairTargetObj.hits >= repairTargetObj.hitsMax - numWork * 100 * .9, 
															 creep.hasBoost(),
															 creep).target;
					if (repTarget != undefined) {
						creep.mem.rTgt = repTarget.id;
						repairTargetObj = Game.getObjectById(creep.mem.rTgt)
					}
					else {
						delete creep.mem.rTgt
						repairTargetObj = undefined;
					}
				}
			}
			if (!repairTargetObj) {
				// console.log(creep.name, creep.room.name, "No rep target")
				if (Math.random() < 0.5 && Game.rooms[creep.mem.sR] && Game.rooms[creep.mem.sR].controller.level < 8) {
					if (Math.random() < 0.25 && !recursiveCall) {
						if (!creep.mem.origRole) creep.mem.origRole = creep.mem.role;
						changeCreepRole(creep, "upgrader")
						return this.runUpgrader(creep)
					}
					else {
						creep.mem.wT = Game.time + Math.round(11 - Game.cpu.bucket / 1000);
						return
					}
				}
				else {
					if (Math.random() < 0.25) {
						if (!creep.mem.origRole) creep.mem.origRole = creep.mem.role;
						changeCreepRole(creep, "builder")
						Memory.rooms[creep.mem.sR].triggerRebuild = 1;
						if (Memory.rooms[creep.mem.sR].triggerRebuildCooldown) {
							Memory.rooms[creep.mem.sR].triggerRebuildCooldown--
						}
						
						// Don't run builder, give it a tick to trigger a rebuild.
						return ;//this.runBuilder(creep)
					}
					else {
						// changeCreepRole(creep, "recycler")						
						// creep.mem.wT = Game.time + Math.round(11 - Game.cpu.bucket / 1000);;
						return this.runRecycler(creep)
					}
				}
			}

			if (creep.ticksToLive < 50 && creep.room.name == creep.mem.sR && creep.hasBoost()) {
				let res = this.attempToUnBoost(creep)

				if (!repairedThisTick && creep.pos.inRangeTo(repairTargetObj, 3)) {
					let repResult;
					if (repairTargetObj.progressTotal) {
						repResult = creep.build(repairTargetObj);
					}
					else {
						repResult = creep.repair(repairTargetObj);
					}

					if (repResult != OK) {
						creep.mem.rTgt = undefined;
					}
					else {
						repairedThisTick = 1
					}
				}
				else if (!res) {
					creep.cachedMoveTo(repairTargetObj, creep.room.name == repairTargetObj.room.name ? 3 : 1, moveOptions);
				}
			}
			else if (!creep.pos.inRangeTo(repairTargetObj, 3)) {
				creep.cachedMoveTo(repairTargetObj, creep.room.name == repairTargetObj.room.name ? 3 : 1, moveOptions);
			}
			else if (!repairedThisTick) {
				let repResult;
				if (repairTargetObj.progressTotal) {
					repResult = creep.build(repairTargetObj);
				}
				else {
					repResult = creep.repair(repairTargetObj);
					repairTargetObj.currentlyRepairing = 1 
				}

				if (repResult != OK) {
					creep.mem.rTgt = undefined;
				}
				else {
					delete creep.mem.path
					repairedThisTick = 1
				}
			}
		}

		creep.grabBonusEnergy();

		// We're allowed to repair roads under our feet only.
		if (!repairedThisTick && creep.getStoreUsedCapacity() > 0) {
			var targets = creep.pos.lookFor(LOOK_STRUCTURES);

			for (var target of targets) {
				if (target.structureType == STRUCTURE_ROAD && target.hits <= target.hitsMax - 300) {
					creep.repair(target);
					global.flaggedRoads = global.flaggedRoads || {};
					global.flaggedRoads[creep.room.name] = global.flaggedRoads[creep.room.name] || new Set();
					if (!global.flaggedRoads[creep.room.name].has(target.id)) {
						global.flaggedRoads[creep.room.name].add(target.id)
					}

					break;
				}
			}
		}
	},

	runBuilder: function(creep, recursiveCall = false) {
		if (creep.mem.wT !== undefined && Game.time < creep.mem.wT) {
			return;
		}
		// Get the boosts!
		if (creep.getBoosts()) {
			return;
		}

		let moveOptions;
		if (creep.room.dangerous || creep.hits != creep.hitsMax) {
			moveOptions = {"avoidEnemyRooms" : 1, "avoidHostiles" : 1, "maxDT" : 1.25, "minKD" : -0.5};
		}
		else {
			moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.25, "minKD" : -0.5};
		}

		if (!creep.mem.f && creep.getStoreUsedCapacity() == 0) {
			// if (creep.mem.ticksToLive < 50) {
			// 	changeCreepRole(creep, "recycler")
			// 	return this.runRecycler(creep)
			// }
			// else {
				creep.mem.f = 1;
				creep.mem.bTgt = undefined
				creep.mem.path = undefined;
			// }
		}

		if (creep.mem.f && creep.getStoreUsedCapacity() >= 2 * creep.carryCapacity / 3) {
			creep.mem.f = 0;
			creep.mem.path = undefined;
		}

		let mem = creep.mem;

		if (creep.civilianSpookedSK()) {
			creep.mem.rTgt = undefined;
			creep.mem.fT = undefined;
			return;
		}

		if ((creep.room.dangerous == 2 || (creep.room.mem.attackScore || 0) > 0) && creep.room.controller && creep.room.controller.my) {
			let valuableStructure = 0;
			for (let constructionSite of creep.room.find(FIND_MY_CONSTRUCTION_SITES)) {
				if (constructionSite.structureType == STRUCTURE_TOWER || constructionSite.structureType == STRUCTURE_SPAWN) {
					valuableStructure = 1;
					break;
				}
			}
			if (!valuableStructure) {				
				if (!creep.mem.origRole) creep.mem.origRole = creep.mem.role;
				changeCreepRole(creep, "repairer");
				return this.runRepairer(creep, true);
			}
		}

		if (creep.ticksToLive < 50 && creep.room.name == creep.mem.sR && creep.hasBoost()) {
			let res = this.attempToUnBoost(creep)
			if (res) {
				return
			}
		}


		if(creep.mem.f) {
			if (!recursiveCall) this.repairerBuilderGetEnergy(creep, moveOptions)
		}
		else {
			if (creep.mem.bTgt == undefined) {

				var targets = [];
				let room = Game.rooms[creep.mem.sR];
				for (var roomName of _.uniq(room.buildRooms.concat(room.goodRooms))) {
					if (Game.rooms[roomName]) {
						targets = targets.concat(Game.rooms[roomName].find(FIND_MY_CONSTRUCTION_SITES));
					}
				}
				if (creep.mem.targetRoom) {
					if (Game.rooms[creep.mem.targetRoom]) {
						targets = targets.concat(Game.rooms[creep.mem.targetRoom].find(FIND_MY_CONSTRUCTION_SITES));
					}
				}


				if (targets.length) {
					let towers = []
					let ramparts = []
					let localRoads = []
					for (let target of targets) {
						if (target.structureType == STRUCTURE_SPAWN) {
							creep.mem.bTgt = target.id
							break;
						}
						if (target.structureType == STRUCTURE_TOWER) { 
							towers.push(target)
						}
						else if (target.structureType == STRUCTURE_RAMPART) {
							ramparts.push(target)
						}
						// In remotes we want to do roads before anything else. Not true in home room
						else if (target.structureType == STRUCTURE_ROAD && target.room.name == creep.room.name && creep.room.name != creep.mem.sR) {
							localRoads.push(target)
						}
					}

					if (!creep.mem.bTgt) {
						if (towers.length > 0) {
							creep.mem.bTgt = towers[0].id
						}
						else {
							if (ramparts.length > 0) {
								creep.mem.bTgt = creep.pos.findClosestObjectByWorldRange(ramparts).id;
							}
							else if (localRoads.length > 0) {
								creep.mem.bTgt = creep.pos.findClosestByRange(localRoads).id;
							}
							else {
								let maxProgress = 0;
								let bestTarget;
								for (let target of targets) {
									// Grab high progress items
									if (target.progress / target.progressTotal > 0.25 && target.progress > 500 && target.progress > maxProgress) {
										maxProgress = target.progress;
										bestTarget = target;
									}
								}

								if (!bestTarget) {
									bestTarget = creep.pos.findClosestObjectByWorldRange(targets);
								}
								// Fook, we're standing on it. Move in a random direction.
								if (bestTarget && creep.pos.getRangeTo(bestTarget) == 0) {
									bestTarget = undefined;
									creep.move(Math.round(0.5 + Math.random() * 8));
								}
								else if (!bestTarget) {
									bestTarget = targets[0];
								}

								if (bestTarget) {
									creep.mem.bTgt = bestTarget.id;
								}
							}
						}
					}

				}
				else {
					Memory.rooms[mem.sR].triggerRebuild = 1;
					if (Memory.rooms[mem.sR].triggerRebuildCooldown) {
						Memory.rooms[mem.sR].triggerRebuildCooldown--
					}

					if (Math.random() < 0.1) {
						if (Math.random() < 0.25 && Game.rooms[creep.mem.sR] && Game.rooms[creep.mem.sR].level < 8) {
							if (!creep.mem.origRole) creep.mem.origRole = creep.mem.role;
							changeCreepRole(creep, "upgrader");
							return;
						}
						else {
							if (!creep.mem.origRole) creep.mem.origRole = creep.mem.role;
							changeCreepRole(creep, "repairer");
							return;
						}						
					}
				}
			}

			if (creep.mem.bTgt) {
				var target = Game.getObjectById(creep.mem.bTgt);
				// Annoying that target can be define but it's room may not be.
				if (target && target.room) {
					if (creep.room.name != target.room.name) {
						creep.cachedMoveTo(target, 1, moveOptions);
					}
					else if (!creep.pos.inRangeToPos(target.pos, 3)) {
						creep.cachedMoveTo(target, 3, moveOptions);
					}
					else {
						var ret = creep.build(target)
						if(ret == ERR_NOT_IN_RANGE) {
							creep.cachedMoveTo(target, 3, moveOptions);
						}
						else if (ret == ERR_RCL_NOT_ENOUGH) {
							target.remove();
						}
						else if (ret == ERR_INVALID_TARGET) {
							if (target.progress == 0) target.remove();
						}
						else if (ret != OK) {
							creep.mem.bTgt = undefined;
						}
						else {
							delete creep.mem.path
						}
					}
				}
				else {
					creep.mem.bTgt = undefined;
				}
			}
			else {
				if (creep.mem.origRole == "upgrader" && creep.room.controller && creep.room.controller.my && creep.room.controller.level <= 3) {
					changeCreepRole(creep, "upgrader");
					return
				}
				creep.mem.wT = Game.time + Math.round(11 - Game.cpu.bucket / 1000);;
			}

		}

		// We're allowed to repair roads under our feet only.
		// var targets = creep.pos.lookFor(LOOK_STRUCTURES);

		// for (var target of targets) {
		// 	if (target.structureType == STRUCTURE_ROAD && target.hits <= target.hitsMax - 300) {
		// 		creep.repair(target);
		// 		global.flaggedRoads = global.flaggedRoads || {};
		// 		global.flaggedRoads[creep.room.name] = global.flaggedRoads[creep.room.name] || new Set();
		// 		if (!global.flaggedRoads[creep.room.name].has(target.id)) {
		// 			global.flaggedRoads[creep.room.name].add(target.id)
		// 		}

		// 		break;
		// 	}
		// }


		creep.grabBonusEnergy();
	},


	runDismantler: function(creep) {
		if (creep.civilianSpookedSK()) {
			return;
		}

		if (!creep.mem.target) {
			let sR = Game.rooms[creep.mem.sR];
			let rooms = sR.goodRooms.concat(sR.buildRooms);

			if (creep.mem.role != "coreDismantler") {
				rooms = rooms.concat(sR.lootRooms)
			}

			if (creep.mem.targetRoom) {
				rooms.push(creep.mem.targetRoom)
			}

			rooms = _.uniq(rooms);

			let targets = [];

			if (creep.mem.role == "coreDismantler") {
				for (let roomName of rooms) {
					if (Game.rooms[roomName]) {
						let room = Game.rooms[roomName];
						targets = targets.concat(room.find(FIND_HOSTILE_STRUCTURES, {
							filter: (structure) => {
								return structure.structureType === STRUCTURE_INVADER_CORE
							}
						}));
					}
				}
			}

			if (!targets.length) {				
				for (let roomName of rooms) {
					if (Game.rooms[roomName]) {
						let room = Game.rooms[roomName];

						if (!room.isMyRoom()) {							
							let lootStructures = []

							if (room.storage && room.storage.store.getUsedCapacity()) {
								lootStructures.push(room.storage)
							}

							if (room.terminal && room.terminal.store.getUsedCapacity()) {
								lootStructures.push(room.terminal)
							}

							if (room.factory && room.factory.store.getUsedCapacity()) {
								lootStructures.push(room.factory)
							}

							for (let structure of lootStructures) {
								let otherStructs = structure.pos.lookFor(LOOK_STRUCTURES);
								for (let otherStructure of otherStructs) {
									if (otherStructure.structureType == STRUCTURE_RAMPART && !otherStructure.my && !otherStructure.isPublic) {
										targets = targets.concat(otherStructure)
									}
								}
							}
						}
					}
				}
			}


			if (!targets.length) {				
				for (let roomName of rooms) {
					if (Game.rooms[roomName]) {
						let room = Game.rooms[roomName];
						targets = targets.concat(room.find(FIND_STRUCTURES, {
							filter: (structure) => {
								// Randomly return false so we don't overcrowd a single target
								return Math.random() > 0.5 && structure.structureType == STRUCTURE_WALL && structure.hits;
							}
						}));
						targets = targets.concat(room.find(FIND_HOSTILE_STRUCTURES, {
							filter: (structure) => {
								// Randomly return false so we don't overcrowd a single target
								if (Math.random() < 0.5) return false;
								return structure.structureType != STRUCTURE_CONTROLLER &&
									   (structure.structureType != STRUCTURE_STORAGE || structure.store.getUsedCapacity() == 0) &&
									   (structure.structureType != STRUCTURE_FACTORY || structure.store.getUsedCapacity() == 0) &&
									   structure.structureType != STRUCTURE_KEEPER_LAIR &&
									   (creep.mem.role != "dismantler" || structure.structureType != STRUCTURE_INVADER_CORE) && 
									   (structure.structureType != STRUCTURE_TERMINAL || structure.store.getUsedCapacity() == 0);
							}
						}));
					}
				}
			}

			if (!targets.length && creep.mem.role == "dismantler") {
				targets = targets.concat(creep.room.find(FIND_HOSTILE_STRUCTURES, {
					filter: (structure) => {
						// Randomly return false so we don't overcrowd a single target
						if (Math.random() < 0.5) return false;
						return structure.structureType != STRUCTURE_CONTROLLER &&
							   (structure.structureType != STRUCTURE_STORAGE || structure.store.getUsedCapacity() == 0) &&
							   (structure.structureType != STRUCTURE_FACTORY || structure.store.getUsedCapacity() == 0) &&
							   structure.structureType != STRUCTURE_KEEPER_LAIR &&
							   (creep.mem.role != "dismantler" || structure.structureType != STRUCTURE_INVADER_CORE) && 
							   (structure.structureType != STRUCTURE_TERMINAL || structure.store.getUsedCapacity() == 0);
					}
				}));
			}

			if (targets.length) {
				let target = creep.pos.findClosestByRange(targets);
				if (!target) {
					target = creep.pos.findClosestByWorldRange(targets);
				}
				if (target) {
					creep.mem.target = target.id;
				}
				else {
					creep.mem.target = targets[0].id;
				}
			}
			else if (creep.mem.role == "coreDismantler") {
				if (creep.room.invaderCore) {
					creep.mem.target = creep.room.invaderCore.id
				}
				else {				
					let highestReserveTicksToEnd = 0
					let bestRoom

					// Go to rooms we can't see to see if there's a core there
					for (let roomName of rooms) {
						if (!Memory.rooms[roomName]) continue
						if (Memory.rooms[roomName].reservedBy != "Invader") continue
						if (Memory.rooms[roomName].DT > 1) continue
						if (Game.rooms[roomName] && !Game.rooms[roomName].invaderCore) continue
						if (Game.rooms[roomName] && Game.rooms[roomName].dangerous) continue

						if (Memory.rooms[roomName].reserveTicksToEnd > highestReserveTicksToEnd) {
							bestRoom = roomName
							highestReserveTicksToEnd = Memory.rooms[roomName].reserveTicksToEnd
						}

					}
					if (bestRoom) {						
						creep.uncachedMoveTo(new RoomPosition(25, 25, bestRoom), 23, {"avoidEnemyRooms" : 1})
						return
					}
					for (let roomName of rooms) {
						if (!Game.rooms[roomName]) {
							creep.uncachedMoveTo(new RoomPosition(25, 25, roomName), 23, {"avoidEnemyRooms" : 1})
							return
						}
					}

					// Go to neighbours of my rooms and clear them if they have invader cores in them.
					// This should slow down spread
					let bestOtherRoom


					for (let roomName of rooms) {
						let otherRoomNames = Object.values(Game.map.describeExits(roomName))
						for (let otherRoomName of otherRoomNames) {
							if (!Memory.rooms[otherRoomName]) continue
							if (Memory.rooms[otherRoomName].reservedBy != "Invader") continue
							if (Memory.rooms[otherRoomName].DT > 1) continue
							if (Game.rooms[otherRoomName] && !Game.rooms[otherRoomName].invaderCore) continue
							if (Game.rooms[otherRoomName] && Game.rooms[otherRoomName].dangerous) continue

							if (Memory.rooms[otherRoomName].reserveTicksToEnd > highestReserveTicksToEnd) {
								bestOtherRoom = otherRoomName
								highestReserveTicksToEnd = Memory.rooms[otherRoomName].reserveTicksToEnd
							}

						}
					}
					if (bestOtherRoom) {
						creep.uncachedMoveTo(new RoomPosition(25, 25, bestOtherRoom), 23, {"avoidEnemyRooms" : 1})
						return						
					}

					// This one is heavy. Go trash nearby invader cores
					if (Game.cpu.bucket > 9990) {
						for (let roomName in Memory.rooms) {
							if (Memory.rooms[roomName].reservedBy != "Invader") continue
							if (Memory.rooms[roomName].DT > 1) continue
							if (Game.rooms[roomName] && !Game.rooms[roomName].invaderCore) continue
							if (Game.rooms[roomName] && Game.rooms[roomName].dangerous) continue
							if (Game.map.getRoomLinearDistance(creep.room.name, roomName) > 2) continue

							if (Memory.rooms[roomName].reserveTicksToEnd > highestReserveTicksToEnd) {
								bestOtherRoom = roomName
								highestReserveTicksToEnd = highestReserveTicksToEnd
							}
						}
					}

					if (bestOtherRoom) {
						creep.uncachedMoveTo(new RoomPosition(25, 25, bestOtherRoom), 23, {"avoidEnemyRooms" : 1})
						return						
					}

				}

			}
			/*else {
				// Done!
				changeCreepRole(creep, "harvester");
				return this.runHarvester();
			}*/
		}

		if (creep.mem.target) {
			let target = Game.getObjectById(creep.mem.target);
			let moveOptions = {avoidEnemyRooms: 1, maxRooms: target && target.room.name == creep.room.name ? 1 : undefined}
			if (target) {
				if (creep.hasBodypart(WORK)) {					
					if(creep.dismantle(target) == ERR_NOT_IN_RANGE) {
						creep.uncachedMoveTo(target, 1, moveOptions);
						if (creep.mem.pIncompleteTick == Game.time) {
							delete creep.mem.target
						}
					}
				}
				else if (creep.hasBodypart(ATTACK)) {					
					if(creep.attack(target) == ERR_NOT_IN_RANGE) {
						creep.uncachedMoveTo(target, 1, moveOptions);
						if (creep.mem.pIncompleteTick == Game.time) {
							delete creep.mem.target
						}
					}
				}
			}
			else {
				delete creep.mem.target
			}
		}
	},


	runUpgrader: function(creep, secondCall) {
		// Get the boosts!
		if (creep.getBoosts()) {
			return;
		}
		if (creep.ticksToLive < 100 && creep.hasBoost()) {
			changeCreepRole(creep, "recycler");
			creep.upgradeController(creep.room.controller)
			creep.drop(RESOURCE_ENERGY)
			return
		}

		if (!creep.mem.f && creep.getStoreUsedCapacity() <= (creep.getActiveBodyparts(WORK) * (creep.mem.link ? 3 : 1)) && !secondCall) {
			creep.mem.f = 1;
			creep.mem.path = undefined;
		}
		// else if (creep.mem.f && creep.carry.energy > (creep.getActiveBodyparts(WORK) * (creep.mem.link ? 2 : 1)) && !secondCall) {
		// 	creep.mem.f = 0;
		// 	creep.mem.fT = undefined;
		// 	creep.mem.path = undefined;
		// }

		/*if (creep.pos.roomName != creep.mem.sR) {
			creep.uncachedMoveTo(new RoomPosition(25, 25, creep.mem.sR), 2);
			return;
		}*/

		let sR = Game.rooms[creep.mem.targetRoom] || Game.rooms[creep.mem.sR];
		let controller = sR.controller;

		if (controller && (!controller.sign || (controller.sign.username != "Screeps" && controller.sign.username != util.getMyName()))) {
			if (creep.signController(controller, "\uD83D\uDC2F") == ERR_NOT_IN_RANGE) {
				creep.uncachedMoveTo(controller, 1);
				return
			}
		}

		if ((!controller || sR.effectiveLevel < 4) &&
			sR.find(FIND_MY_CONSTRUCTION_SITES).length &&
			creep.getNumOfBodyPart(WORK) < creep.getNumOfBodyPart(CARRY) * 4 &&
			(!controller || !controller.my || (controller.ticksToDowngrade > 1000 && controller.ticksToDowngrade > CONTROLLER_DOWNGRADE[controller.level] * 0.95))) {
			if (!creep.mem.origRole) creep.mem.origRole = "upgrader"
			changeCreepRole(creep, "builder")
			return this.runBuilder(creep);
		}

		if (creep.mem.origRole == "builder" && sR.find(FIND_MY_CONSTRUCTION_SITES).length) {
			changeCreepRole(creep, "builder")
			return this.runBuilder(creep)
		}
		if ((creep.mem.origRole == "repairer" || creep.mem.origRole == "builder") && Math.random() < 0.01) {
			let repTarget = roomAI.getRepairPriority(sR, false, false).target;

			if (repTarget) {
				creep.mem.rTgt = repTarget.id;
				changeCreepRole(creep, "repairer")
				return this.runRepairer(creep)
			}
		}

		if(creep.mem.f) {
		 	if (!creep.mem.fT) {
		 		let target;
		 		if (creep.mem.link && Game.getObjectById(creep.mem.link)) {
		 			// if (Game.getObjectById(creep.mem.link).energy > 0) {
		 				target = Game.getObjectById(creep.mem.link)
		 			// }
		 		}
		 		/*else if (creep.mem.container && Game.getObjectById(creep.mem.container)) {
		 			// if (Game.getObjectById(creep.mem.container).store[RESOURCE_ENERGY] > 0) {
		 				target = Game.getObjectById(creep.mem.container)
		 			// }
		 		}*/
		 		else {
					target = controller.pos.findClosestByRange(controller.pos.findInRange(FIND_MY_STRUCTURES, 3), {
						filter: (structure) => {
							if (structure.structureType == STRUCTURE_LINK && structure.energy > 0 && roomAI.isEnergyEndPoint(structure) && !roomAI.isInSpawnBattery(structure)) {
								return true;
							}
							return false;
						}
					});
		 		}

				if (target) {
					creep.mem.link = target.id;
				}
				else {
					target = controller.pos.findClosestByRange(controller.pos.findInRange(FIND_STRUCTURES, 3), {
						filter: (structure) => {
							if ((structure.structureType == STRUCTURE_CONTAINER && roomAI.isEnergyEndPoint(structure))) {
								return true;
							}
							if ((structure.structureType == STRUCTURE_TERMINAL || structure.structureType == STRUCTURE_STORAGE) && structure.store[RESOURCE_ENERGY] > 100000) {
								return true;
							}
							return false;
						}
					});

					// It's not a link
					if (target) {
						creep.mem.link = target.id;
					}
					else {						
						target = controller.pos.findClosestByRange(FIND_STRUCTURES, {
							filter: (structure) => {
								if ((structure.structureType == STRUCTURE_CONTAINER || structure.structureType == STRUCTURE_STORAGE) && (sR.effectiveLevel > 3 || structure.store[RESOURCE_ENERGY] > 0 || (structure.expectedEnergy || 0) > 0)) {
									return true;
								}
								return false;
							}
						});
					}
				}


				if (target) {
					creep.mem.fT = target.id;
				}
				else if (!creep.mem.link) {
					if (creep.room.name == creep.mem.sR) {
						target = creep.pos.findClosestByRange(FIND_MY_SPAWNS, {
							filter: (structure) => {
								if (structure.energy > 0) {
									return true;
								}
								return false;
							}
						});
					}
					else {
						target = sR.find(FIND_MY_SPAWNS)[0];
					}
					if (target) {
						creep.mem.fT = target.id;
					}
				}
				else {
					creep.mem.fT = creep.mem.link
				}
			}



			if (creep.mem.fT) {
				var target = Game.getObjectById(creep.mem.fT)

				if (target && !creep.pos.isNearToPos(target.pos)) {
					// First try to grab from other creeps
					let grabbed = 0
					let assumeContainerHasEnergy = 1
					if ((Game.cpu.bucket > 9100 || Memory.season5) && creep.pos.inRangeToPos(controller.pos, 3)) {						
						let otherCreeps = creep.pos.findInRange(FIND_MY_CREEPS, 1, {filter: (c) => {return c.mem.role == "upgrader" && c != creep}})

						assumeContainerHasEnergy = otherCreeps.length == 0 || (creep.store.getUsedCapacity(RESOURCE_ENERGY) < creep.getNumOfBodyPart(WORK) && target.store && target.store.getUsedCapacity(RESOURCE_ENERGY)) ? 1 : 0



						if (grabbed < creep.getNumOfBodyPart(WORK)) {
							for (let otherCreep of otherCreeps) {
								if (otherCreep.hasBeenGrabbed) continue
								let amount = Math.min(creep.store.getFreeCapacity() - grabbed, otherCreep.store[RESOURCE_ENERGY] - otherCreep.getNumOfBodyPart(WORK) * 2)

								if (amount > 0) {
									otherCreep.hasBeenGrabbed = 1
									otherCreep.transfer(creep, RESOURCE_ENERGY, amount)
									grabbed += amount
								}

								if (grabbed >= creep.store.getFreeCapacity()) {
									break
								}
							}
						}
					}

					if (assumeContainerHasEnergy && grabbed < creep.getNumOfBodyPart(WORK)) {
						creep.mem.f = 1;
						// Pick a slot around the fetch target.
						// Avoid roads. Get as close to the controller as possible.
						var bestPos = target;
						var bestScore = 0;

						let roomTerrain = Game.map.getRoomTerrain(sR.name)

						var iDir = Math.random() > 0.5 ? -1 : 1;
						for (var _i = -1; _i <= 1; _i++) {
							var i = _i * iDir;

							var jDir = Math.random() > 0.5 ? -1 : 1;
							for (var _j = -1; _j <= 1; _j++) {
								var j = _j * jDir;

								var score = -Infinity;
								if (!(roomTerrain.get(target.pos.x + i, target.pos.y + j) & TERRAIN_MASK_WALL)) {
									var currentCreeps = sR.lookForAt(LOOK_CREEPS, target.pos.x + i, target.pos.y + j);
									if (currentCreeps.length) continue;

									score = 0;

									var currentStructures  = sR.lookForAt(LOOK_STRUCTURES, target.pos.x + i, target.pos.y + j);
									for (var structure of currentStructures) {
										if (structure.structureType == STRUCTURE_ROAD) {
											score -= 1;
										}
										else if (structure.structureType == STRUCTURE_CONTAINER) {
											score += 1;
										}
										else if (structure.structureType != STRUCTURE_RAMPART) {
											score = -Infinity;
											break;
										}
									}
								}

								let pos = new RoomPosition(target.pos.x + i, target.pos.y + j, sR.name)
								score += pos.getRangeTo(controller) / 5;

								if (score > bestScore) {
									bestScore = score;
									bestPos = pos;
									if (bestScore == 2) break;
								}
							}
						}

						if (creep.pos.getRangeTo(bestPos) > 3) {
							creep.cachedMoveTo(bestPos, (bestPos == target ? 1 : 0), {"noRePathOnOptsChange": 1});
						}
						else {
							creep.cachedMoveTo(bestPos, (bestPos == target ? 1 : 0), {"avoidLocalCreeps" : 0.2, "noRePathOnOptsChange": 1});
						}
					}
				}
				else if (target) {
					let ret = creep.withdraw(target, RESOURCE_ENERGY)
					if (ret == OK) {
						creep.mem.fT = undefined;
						creep.mem.f = undefined;
						creep.mem.path = undefined;
						this.runUpgrader(creep, true)
					}
					else if (ret == ERR_NOT_ENOUGH_RESOURCES) {
						if (sR.effectiveLevel < 4 && !sR.storage && 
							controller.ticksToDowngrade > CONTROLLER_DOWNGRADE[controller.level] * 0.95) {

							sR.mem.upgradersStarved = Math.min(Math.max(1, sR.mem.upgradersStarved + Math.floor(creep.room.effectiveLevel / 2)), 200);

							var numConstructionSites = sR.find(FIND_MY_CONSTRUCTION_SITES).length;
							if (numConstructionSites > 0 && 
								creep.getNumOfBodyPart(WORK) < creep.getNumOfBodyPart(CARRY) * 4 &&
								(Math.random() < 0.01 || sR.effectiveLevel == 2)) {
								if (!creep.mem.origRole) creep.mem.origRole = "upgrader"
								changeCreepRole(creep, "builder")
								return
							}
						}
						else if (sR.effectiveLevel < 8) {
							sR.mem.upgradersStarved = Math.min(Math.max(1, sR.mem.upgradersStarved + Math.floor(creep.room.effectiveLevel / 2)), 200);
						}

						creep.mem.fT = undefined;
						creep.mem.f = undefined;
						creep.mem.path = undefined;
					}
				}
				else {
					delete creep.mem.fT;
				}
			}
		}


		if(!creep.mem.f || ((Game.cpu.bucket > 9000 || (Memory.season5 && creep.room.effectiveLevel < 8)) && creep.pos.inRangeToPos(controller.pos, 3))) {
			let ret = creep.upgradeController(controller)
			if (ret == ERR_NOT_IN_RANGE) {
				creep.cachedMoveTo(controller, 3);
			}
			else if (ret == OK && (Game.cpu.bucket > 9000 || (Memory.season5 && creep.room.effectiveLevel < 8)) && creep.room.effectiveLevel >= 3) {
				let currentTarget = Game.getObjectById(creep.mem.fT)
				// Keep pulling out of link/container so they can be refilled ASAP
				if ((currentTarget && 
					creep.pos.isNearToPos(currentTarget.pos) && 
					currentTarget.store[RESOURCE_ENERGY]) || 
					(currentTarget = creep.pos.findFirstInRange(FIND_STRUCTURES, 1, {
					filter: (structure) => {
						return (structure.structureType == STRUCTURE_CONTAINER || 
								structure.structureType == STRUCTURE_STORAGE || 
								structure.structureType == STRUCTURE_LINK) && 
								(structure.store[RESOURCE_ENERGY] > 0)}}))) {


					creep.mem.f = 1;
				}
				delete creep.mem.path

				// We're allowed to move to the controller if doing so would not put us on a road and keep us next to the link
				// This is pretty brainless code
				if (currentTarget && !creep.pos.inRangeToPos(controller.pos, 1)) {
					let direction = creep.pos.getDirectionTo(controller.pos)
					let newPos = creep.pos.getPosInDirection(direction)
					let structs = newPos.lookFor(LOOK_STRUCTURES)

					let structFail = false
					for (let struct of structs) {
						if (struct.structureType != STRUCTURE_CONTAINER && struct.structureType != STRUCTURE_RAMPART) {
							structFail = true
							break
						}
					}

					if (!structFail && newPos.lookFor(LOOK_CREEPS).length == 0 && newPos.inRangeToPos(currentTarget.pos, 1)) {
						if (!(Game.map.getRoomTerrain(creep.room.name).get(newPos.x, newPos.y) & TERRAIN_MASK_WALL)) {							
							//console.log("Upgrader simple move", newPos, direction)
							creep.move(direction)
						}
					}
				}
			}

			if ((Game.cpu.bucket > 9000 || (Memory.season5 && creep.room.effectiveLevel < 8)) && creep.pos.inRangeToPos(controller.pos, 3)) {			
				let target = creep.pos.findFirstInRange(FIND_STRUCTURES, 2, {
											filter: (structure) => {
												return (structure.structureType == STRUCTURE_CONTAINER || 
														structure.structureType == STRUCTURE_LINK)}})

				if (target) {					
					let grabbed = 0
					let bms = creep.pos.findInRange(FIND_MY_CREEPS, 1, {filter: (c) => {return (c.mem.role == "baseManager" || c.mem.role == "fetcher" || c.mem.role == "transporter") && c.mem.dTgt === target.id && !c.pos.isNearToPos(target.pos)}})

					for (let otherCreep of bms) {
						if (otherCreep.hasTransferred) continue
						let amount = Math.min(creep.store.getFreeCapacity() - grabbed, otherCreep.store[RESOURCE_ENERGY])

						if (amount > 0) {
							otherCreep.hasTransferred = 1
							otherCreep.transfer(creep, RESOURCE_ENERGY, amount)
							grabbed += amount
						}
					}
				}
			}
		}

		if (sR.storage && sR.storage.store[RESOURCE_ENERGY] < 5000 / (sR.upgradeFocus ? 2 : 1) &&
			!sR.mem.claimToUnclaimRoom &&
			(!controller || !controller.my || controller.ticksToDowngrade > CONTROLLER_DOWNGRADE[controller.level] / 2) &&
			(!controller || !controller.my || controller.progress < controller.progressTotal)) {
			return changeCreepRole(creep, "recycler");
		}

		if (Game.cpu.bucket > 6000) {
			if (creep.getStoreUsedCapacity() != creep.carryCapacity) {
				var target = creep.pos.findFirstInRange(FIND_DROPPED_RESOURCES, 1)
				if (target) {
					if (target.resourceType == RESOURCE_ENERGY) {
						var ret = creep.pickup(target);
						// We've changed weight. Path will be invalid now.
						if (ret == OK) {
							creep.mem.path = undefined
						}
					}
				}
			}
		}
	},


	runSpawnBatterySitter : function(creep) {
		if (creep.mem.inP == undefined) {
			var sitters = creep.room.mem.ownedCreeps["sbs"] || []
			var spawnBatteryCentre = roomAI.getSpawnBatteryCentre(creep.room.name);
			var p = [new RoomPosition(spawnBatteryCentre.x + 1, spawnBatteryCentre.y + 1, spawnBatteryCentre.roomName),
					 new RoomPosition(spawnBatteryCentre.x + 1, spawnBatteryCentre.y - 1, spawnBatteryCentre.roomName),
					 new RoomPosition(spawnBatteryCentre.x - 1, spawnBatteryCentre.y + 1, spawnBatteryCentre.roomName),
					 new RoomPosition(spawnBatteryCentre.x - 1, spawnBatteryCentre.y - 1, spawnBatteryCentre.roomName)]

			var pValid = [true, true, true, true]

			for (var sitterName of sitters) {
				if (sitterName == creep.name) continue
				if (Game.creeps[sitterName]) {
					var targetCreep = Game.creeps[sitterName]
					for (var i=0; i < 4; i++) {
						if ((targetCreep.mem.targetPosition && targetCreep.mem.targetPosition.x == p[i].x && targetCreep.mem.targetPosition.y == p[i].y) ||
							(targetCreep.mem.inP && targetCreep.pos.x == p[i].x && targetCreep.pos.y == p[i].y)) {
							pValid[i] = false;
							// console.log(i, targetCreep.name)
						}
					}
				}
			}

			// console.log(pValid)

			var targetPos = undefined;
			for (var i=0; i < 4; i++) {
				if (pValid[i]) {
					targetPos = p[i]
					break;
				}
			}
			if (targetPos) {
				creep.mem.targetPosition = targetPos;
			}
			else {
				throw(new Error("No target pos for battery sitter"))
			}

			if (creep.mem.targetPosition) {//creep.pos.x == creep.mem.targetPosition.x && creep.pos.y == creep.mem.targetPosition.y) {
				// Wipe memory

				var spawnBatteryCentre = roomAI.getSpawnBatteryCentre(creep.room.name);
				if (creep.pos.x == spawnBatteryCentre.x - 1 && creep.pos.y == spawnBatteryCentre.y - 1) {
					Memory.creeps[creep.name] = {role: "sbs", sR: creep.room.name}
					creep.mem.inP = 0;
				}
				else if (creep.pos.x == spawnBatteryCentre.x + 1 && creep.pos.y == spawnBatteryCentre.y - 1) {
					Memory.creeps[creep.name] = {role: "sbs", sR: creep.room.name}
					creep.mem.inP = 1;
				}
				else if (creep.pos.x == spawnBatteryCentre.x + 1 && creep.pos.y == spawnBatteryCentre.y + 1) {
					Memory.creeps[creep.name] = {role: "sbs", sR: creep.room.name}
					creep.mem.inP = 2;
				}
				else if (creep.pos.x == spawnBatteryCentre.x - 1 && creep.pos.y == spawnBatteryCentre.y + 1) {
					Memory.creeps[creep.name] = {role: "sbs", sR: creep.room.name}
					creep.mem.inP = 3;
				}
				else {
					creep.cachedMoveTo(new RoomPosition(creep.mem.targetPosition.x, creep.mem.targetPosition.y, creep.room.name), 0)
				}
			}
		}

		// This could have micro optimisation maybe - rather than look we could use a global cache
		else {
			if (creep.room.energyAvailable == creep.room.energyCapacityAvailable) {
				return;
			}
			if (creep.mem.wT !== undefined && Game.time < creep.mem.wT) {
				return;
			}

			function findEnergyTarget(room, x, y) {
				var structures = room.lookForAt(LOOK_STRUCTURES, x, y);
				for (var structure of structures) {
					if (structure.structureType == STRUCTURE_EXTENSION || structure.structureType == STRUCTURE_SPAWN) {
						return structure;
					}
				}
				return null;
			}

			let acted = false;

			if (creep.getStoreUsedCapacity() == 0) {
				var spawnBatteryCentre = roomAI.getSpawnBatteryCentre(creep.room.name);
				var withdrawn = false;
				let lookLink = creep.room.lookForAt(LOOK_STRUCTURES, spawnBatteryCentre);
				if (lookLink.length > 0) {
					var link;
					for (var test in lookLink) {
						if (lookLink[test].structureType == STRUCTURE_LINK) {
							link = lookLink[test];
							break;
						}
					}
					if (link) {
						if ((link.expectedEnergy || 0) + link.energy > 0) {
							creep.withdraw(link, RESOURCE_ENERGY);
							acted = true;
							withdrawn = true;
						}
						link.expectedEnergy = (link.expectedEnergy || 0) - creep.carryCapacity
					}
					// var link = lookLink[0];
				}
				// If we have extensions/spawns that need filling, grab from container
				if (!withdrawn) {
					// Check for empties
					// Look up mostly
					var t;
					if (creep.mem.inP == 0 || creep.mem.inP == 1) {
						t = findEnergyTarget(creep.room, creep.pos.x - 1, creep.pos.y - 1);

						if (!t || (t.energy + (t.expectedEnergy || 0) >= t.energyCapacity)) t = findEnergyTarget(creep.room, creep.pos.x, creep.pos.y - 1);
						if (!t || (t.energy + (t.expectedEnergy || 0) >= t.energyCapacity)) t = findEnergyTarget(creep.room, creep.pos.x + 1, creep.pos.y - 1);
						if (!t || (t.energy + (t.expectedEnergy || 0) >= t.energyCapacity)) t = findEnergyTarget(creep.room, creep.pos.x - 1, creep.pos.y);
						if (!t || (t.energy + (t.expectedEnergy || 0) >= t.energyCapacity)) t = findEnergyTarget(creep.room, creep.pos.x + 1, creep.pos.y);
						if (!t || (t.energy + (t.expectedEnergy || 0) >= t.energyCapacity)) t = findEnergyTarget(creep.room, creep.pos.x, creep.pos.y + 1);
					}
					// Look down mostly
					else if (creep.mem.inP == 2 || creep.mem.inP == 3) {
						t = findEnergyTarget(creep.room, creep.pos.x - 1, creep.pos.y + 1);

						if (!t || (t.energy + (t.expectedEnergy || 0) >= t.energyCapacity)) t = findEnergyTarget(creep.room, creep.pos.x, creep.pos.y + 1);
						if (!t || (t.energy + (t.expectedEnergy || 0) >= t.energyCapacity)) t = findEnergyTarget(creep.room, creep.pos.x + 1, creep.pos.y + 1);
						if (!t || (t.energy + (t.expectedEnergy || 0) >= t.energyCapacity)) t = findEnergyTarget(creep.room, creep.pos.x - 1, creep.pos.y);
						if (!t || (t.energy + (t.expectedEnergy || 0) >= t.energyCapacity)) t = findEnergyTarget(creep.room, creep.pos.x + 1, creep.pos.y);
						if (!t || (t.energy + (t.expectedEnergy || 0) >= t.energyCapacity)) t = findEnergyTarget(creep.room, creep.pos.x, creep.pos.y - 1);
					}

					// Somebody needs energy. Grab some and mark it
					if (t && (t.energy + (t.expectedEnergy || 0) < t.energyCapacity)) {
						var containerX;
						var containerY = spawnBatteryCentre.y
						if (creep.mem.inP == 0 || creep.mem.inP == 3) {
							containerX = spawnBatteryCentre.x - 2
						}
						else if (creep.mem.inP == 1 || creep.mem.inP == 2) {
							containerX = spawnBatteryCentre.x + 2
						}
						var lookContainer = creep.room.lookForAt(LOOK_STRUCTURES, containerX, containerY);
						for (var i = 0; i < lookContainer.length; i++) {
							if (lookContainer[i].structureType == STRUCTURE_CONTAINER) {
								var container = lookContainer[i]
								if ((container.expectedEnergy || 0) + container.store[RESOURCE_ENERGY] > 0) {
									container.expectedEnergy = (container.expectedEnergy || 0) - creep.carryCapacity
									creep.withdraw(container, RESOURCE_ENERGY);
									acted = true;
									t.expectedEnergy = (t.expectedEnergy || 0) + creep.carryCapacity;
									withdrawn = true;
								}
								break;
							}
						}
					}
				}
			}
			// We have stuff! Where to dump it?
			else {
				var t;
				let extensionIds;
				if (creep.mem.inP == 0) {
					extensionIds = roomAI.getSpawnBatteryTopLeftExtensionIDs(creep.room.name)
				}
				else if (creep.mem.inP == 1) {
					extensionIds = roomAI.getSpawnBatteryTopRightExtensionIDs(creep.room.name)
				}
				else if (creep.mem.inP == 2) {
					extensionIds = roomAI.getSpawnBatteryBottomRightExtensionIDs(creep.room.name)
				}
				else if (creep.mem.inP == 3) {
					extensionIds = roomAI.getSpawnBatteryBottomLeftExtensionIDs(creep.room.name)
				}

				for (let id of extensionIds) {
					t = Game.getObjectById(id);
					if (t && (t.energy + (t.expectedEnergy || 0) < t.energyCapacity)) {
						break;
					}
				}
				// console.log(t, t[0].pos, t[0].energy, (t[0].expectedEnergy || 0), t[0].energyCapacity)

				// Somebody needs energy. Give them what they want
				if (t && t.energy + (t.expectedEnergy || 0) < t.energyCapacity) {
					t.expectedEnergy = (t.expectedEnergy || 0) + creep.getStoreUsedCapacity();

					// console.log(t, t[0], t[0].pos)
					var ret = creep.transfer(t, RESOURCE_ENERGY)
					acted = true;
					// console.log(ret)
				}
				// Try the container
				else {
					var spawnBatteryCentre = roomAI.getSpawnBatteryCentre(creep.room.name);
					var containerX;
					var containerY = spawnBatteryCentre.y
					if (creep.mem.inP == 0 || creep.mem.inP == 3) {
						containerX = spawnBatteryCentre.x - 2
					}
					else if (creep.mem.inP == 1 || creep.mem.inP == 2) {
						containerX = spawnBatteryCentre.x + 2
					}
					var lookContainer = creep.room.lookForAt(LOOK_STRUCTURES, containerX, containerY);
					for (var i = 0; i < lookContainer.length; i++) {
						if (lookContainer[i].structureType == STRUCTURE_CONTAINER) {
							var container = lookContainer[i]
							container.expectedEnergy = (container.expectedEnergy || 0) + creep.getStoreUsedCapacity()
							if (container.store[RESOURCE_ENERGY] < container.storeCapacity - creep.carryCapacity) {
								creep.transfer(container, RESOURCE_ENERGY)
								acted = true;
							}
							break;
						}
					}
				}
			}


			if (!acted) {
				let heavy = Game.time - (creep.room.mem.spawningHeavyMission || -2000) < 2000
				if (!heavy) {
				// Bigger waits on bigger rooms.
					creep.mem.wT = Game.time + creep.room.controller.level;
				}
			}
		}

		creep.grabBonusEnergy();
	},

	runAdvLabManager: function(creep) {
		if (creep.pos.roomName != creep.mem.sR) {
			creep.cachedMoveTo(new RoomPosition(25, 25, creep.mem.sR), 20);
			return;
		}

		if (creep.mem.wT != undefined && Game.time < creep.mem.wT) {
			return;
		}
		// Oooh shit.
		if (!creep.room.terminal && !creep.room.storage) {
			return;
		}

		// Multiple... let the oldest win. Youngest goes to lab tech.
		// Can happen with renew or pre-spawning
		if ((Memory.rooms[creep.mem.sR].ownedCreeps["advLabManager"] || []).length > 1) {
			let oldestTTL = -Infinity
			for (let creepName of Memory.rooms[creep.mem.sR].ownedCreeps["advLabManager"]) {
				let creep = Game.creeps[creepName]
				if (!creep) continue

				oldestTTL = Math.max(oldestTTL, creep.ticksToLive)
			}

			if (creep.ticksToLive < oldestTTL) {
				changeCreepRole(creep, "labTech")
				creep.mem.noLabTechDeliveries = 1
				return this.runLabTech(creep)
			}
		}

		if (creep.ticksToLive < 20) {
			if (creep.store.getUsedCapacity() == 0) {
				return creep.suicide();
			}
			else {
				let dropTarget = creep.room.storage || creep.room.terminal
				if (!creep.pos.isNearToPos(dropTarget.pos)) {
					creep.cachedMoveTo(dropTarget.pos, 1, {maxRooms: 1})
					return
				}
				else {
					creep.transfer(dropTarget, Object.keys(creep.store)[0])
					return
				}
			}
		}

		let targetCompound = creep.room.mem.targetCompound

		if (!targetCompound) {
			creep.mem.resourceCarry = Object.keys(creep.store)[0]
			delete Memory.rooms[creep.mem.sR].advManagedLabs
			console.log(creep, "Lab manager room has no target compound")
			return this.runRecycler(creep)
			// return this.runLabTech(creep)
		}

		if (creep.room.effectiveLevel < 7 || creep.room.labs.length < 6 || (Game.time - (creep.room.mem.boostsRequestedTime || -2000) < 2000)) {
			creep.mem.resourceCarry = Object.keys(creep.store)[0]
			delete Memory.rooms[creep.mem.sR].advManagedLabs
			return this.runLabTech(creep)
		}

		// Fuck it, we're not actually faster like this
		if (REACTION_TIME[targetCompound] < (creep.room.effectiveLevel == 8 ? 20 : 10)) {
			creep.mem.resourceCarry = Object.keys(creep.store)[0]
			delete Memory.rooms[creep.mem.sR].advManagedLabs
			return this.runLabTech(creep)
		}
		
		for (let lab of creep.room.labs) {
			if (lab.effects && lab.effects.length) {
				creep.mem.resourceCarry = Object.keys(creep.store)[0]
				delete Memory.rooms[creep.mem.sR].advManagedLabs
				return this.runLabTech(creep)
			}
		}

		if (!creep.mem.labs) {
			creep.mem.labs = [[],[]]

			let regularSourceLabs = _.filter(creep.room.labs, (lab) => ((lab.pos.x == creep.room.mem.labPositionX 	&& lab.pos.y == creep.room.mem.labPositionY) ||
										                		        (lab.pos.x == creep.room.mem.labPositionX - 1 && lab.pos.y == creep.room.mem.labPositionY - 1)));

			if (regularSourceLabs.length == 2) {
				creep.mem.labs[0].push(regularSourceLabs[0].id)
				creep.mem.labs[0].push(regularSourceLabs[1].id)
			}
			else {
				delete creep.mem.labs
				delete Memory.rooms[creep.mem.sR].advManagedLabs
				console.log(regularSourceLabs)
				throw new Error("Lab manager labs are weird #1")
			}


			let altSourceLabs = _.filter(creep.room.labs, (lab) => ((lab.pos.x == creep.room.mem.labPositionX 	&& lab.pos.y == creep.room.mem.labPositionY + 1) ||
										                 			(lab.pos.x == creep.room.mem.labPositionX - 1 && lab.pos.y == creep.room.mem.labPositionY + 1)));

			if (altSourceLabs.length == 2) {
				creep.mem.labs[1].push(altSourceLabs[0].id)
				creep.mem.labs[1].push(altSourceLabs[1].id)
			}
			else {
				delete creep.mem.labs
				delete Memory.rooms[creep.mem.sR].advManagedLabs
				console.log(altSourceLabs)
				throw new Error("Lab manager labs are weird #2")
			}
		}

		let regularSourceLab1 = Game.getObjectById(creep.mem.labs[0][0])
		let regularSourceLab2 = Game.getObjectById(creep.mem.labs[0][1])
		let altSourceLab1 = Game.getObjectById(creep.mem.labs[1][0])
		let altSourceLab2 = Game.getObjectById(creep.mem.labs[1][1])

		creep.room.mem.managedLabs = [regularSourceLab1.id, regularSourceLab2.id, altSourceLab1.id, altSourceLab2.id]

		// Someone has been unboosting in here, or we're converting to a lower cooldown thing. Either way, lab tech is fine.
		if (regularSourceLab1.cooldown > REACTION_TIME[targetCompound] || regularSourceLab2.cooldown > REACTION_TIME[targetCompound] || altSourceLab1.cooldown > REACTION_TIME[targetCompound] || altSourceLab2.cooldown > REACTION_TIME[targetCompound]) {
			creep.mem.resourceCarry = Object.keys(creep.store)[0]
			delete Memory.rooms[creep.mem.sR].advManagedLabs
			return this.runLabTech(creep)
		}

		Memory.rooms[creep.mem.sR].advManagedLabs = Game.time
		let reagent1 = RECIPES[targetCompound][0]
		let reagent2 = RECIPES[targetCompound][1]

		let maxAmount = (creep.room.effectiveLevel == 8 ? 16 : 8) * LAB_REACTION_AMOUNT

		let cleanTarget
		// Clean out the labs
		if (regularSourceLab1.mineralAmount >= maxAmount) {
			cleanTarget = regularSourceLab1
		}
		else if (regularSourceLab2.mineralAmount >= maxAmount) {
			cleanTarget = regularSourceLab2
		}
		else if (altSourceLab1.mineralAmount >= maxAmount) {
			cleanTarget = altSourceLab1
		}
		else if (altSourceLab2.mineralAmount >= maxAmount) {
			cleanTarget = altSourceLab2
		}

		if (cleanTarget || creep.mem.full) {
			// Techs handle emptying the manager
			if (creep.store.getFreeCapacity() == 0) {
				creep.mem.noLabTechDeliveries = 1

				let dropTarget = creep.room.storage || creep.room.terminal
				if (!creep.pos.isNearToPos(dropTarget.pos)) {
					creep.cachedMoveTo(dropTarget.pos, 1, {maxRooms: 1})
					return
				}
				else {
					let largestResourceAmount = 0
					let largestResource
					for (let resource in creep.store) {
						if (creep.store[resource] > largestResourceAmount) {
							largestResourceAmount = creep.store[resource]
							largestResource = resource
						}
					}
					creep.transfer(dropTarget, largestResource)
					return
				}
			}
			else if (cleanTarget) {
				creep.mem.noLabTechDeliveries = 1

				if (!creep.pos.isNearToPos(cleanTarget.pos)) {
					creep.cachedMoveTo(cleanTarget.pos, 1, {maxRooms: 1})
					return
				}
				else {
					creep.withdraw(cleanTarget, cleanTarget.mineralType)
					return
				}
			}
		}

		delete creep.mem.noLabTechDeliveries
		delete creep.mem.full

		let currentOfReagent1 = creep.store[reagent1] || 0
		let currentOfReagent2 = creep.store[reagent2] || 0

		// If more than 50% of our space is with non-reagents call lab tech to empty us.
		if (creep.store.getUsedCapacity() - currentOfReagent1 - currentOfReagent2 > 0.5 * creep.store.getCapacity()) {
			creep.mem.needsEmpty = 1
		}
		else {
			delete creep.mem.needsEmpty	
		}

		// if (currentOfReagent1 == 0 && currentOfReagent2 == 0)

		let minRequired = (creep.room.effectiveLevel == 8 ? 8 : 4) * LAB_REACTION_AMOUNT

		// Get new reagents. This is now handled by techs
		if ((Memory.rooms[creep.mem.sR].ownedCreeps["labTech"] || []).length == 0 && (currentOfReagent1 < minRequired || currentOfReagent2 < minRequired)) {
			let target
			let resourceToTake

			// Don't carry shit that ain't reagents
			for (let resource in creep.store) {
				if (resource != reagent1 && resource != reagent2) {
					target = creep.room.storage || creep.room.terminal

					if (!creep.pos.isNearToPos(target.pos)) {
						creep.cachedMoveTo(target.pos, 1, {maxRooms: 1})
						return
					}
					else {
						creep.transfer(target, resource, creep.store[resource])
						return
					}
				}
			}

			// Make sure labs are empty
			if (regularSourceLab1.mineralAmount && regularSourceLab1.mineralType != reagent1 && regularSourceLab1.mineralType != reagent2) {
				target = regularSourceLab1
				resourceToTake = regularSourceLab1.mineralType
			}
			else if (regularSourceLab2.mineralAmount && regularSourceLab2.mineralType != reagent1 && regularSourceLab2.mineralType != reagent2) {
				target = regularSourceLab2
				resourceToTake = regularSourceLab2.mineralType
			}
			else if (altSourceLab1.mineralAmount && altSourceLab1.mineralType != reagent1 && altSourceLab1.mineralType != reagent2) {
				target = altSourceLab1
				resourceToTake = altSourceLab1.mineralType
			}
			else if (altSourceLab2.mineralAmount && altSourceLab2.mineralType != reagent1 && altSourceLab2.mineralType != reagent2) {
				target = altSourceLab2
				resourceToTake = altSourceLab2.mineralType
			}


			if (target) {
				if (!creep.pos.isNearToPos(target.pos)) {
					creep.cachedMoveTo(target.pos, 1, {maxRooms: 1})
					return
				}
				else {
					creep.withdraw(target, resourceToTake)
					return
				}
			}


			let halfCap = Math.round(creep.store.getCapacity() * 0.5)
			if (currentOfReagent1 < minRequired) {
				// for (let lab of creep.room.labs) {
				// 	if (lab.mineralType == reagent1) {
				// 		target = lab
				// 		resourceToTake = reagent1
				// 		break;
				// 	}
				// }

				if (!target) {					
					if (creep.room.storage && creep.room.storage.store[reagent1] >= halfCap) {
						target = creep.room.storage
						resourceToTake = reagent1
					}
					else if (creep.room.terminal && creep.room.terminal.store[reagent1] >= halfCap) {
						target = creep.room.terminal
						resourceToTake = reagent1
					}
				}
			}
			else if (currentOfReagent2 < minRequired) {
				// for (let lab of creep.room.labs) {
				// 	if (lab.mineralType == reagent2) {
				// 		target = lab
				// 		resourceToTake = reagent2
				// 		break;
				// 	}
				// }

				if (!target) {					
					if (creep.room.storage && creep.room.storage.store[reagent2] >= halfCap) {
						target = creep.room.storage
						resourceToTake = reagent2
					}
					else if (creep.room.terminal && creep.room.terminal.store[reagent2] >= halfCap) {
						target = creep.room.terminal
						resourceToTake = reagent2
					}
				}
			}

			if (target) {				
				if (!creep.pos.isNearToPos(target.pos)) {
					creep.cachedMoveTo(target.pos, 1, {maxRooms: 1})
					return
				}
				else {
					for (let resource in creep.store) {
						if (resource != reagent1 && resource != reagent2) {
							creep.transfer(target, resource, creep.store[resource])		
							return
						}
					}
					creep.withdraw(target, resourceToTake, Math.min(target.store[resourceToTake], Math.min(creep.store.getFreeCapacity(), halfCap)))
					return
				}
			}
		}

		// Need to decide which are sources and which are not
		if (regularSourceLab1.cooldown !== regularSourceLab2.cooldown) {
			// delete Memory.rooms[creep.mem.sR].advManagedLabs
			if (Math.random() < 0.1) console.log(creep.name, creep.room.name, "Regular source lab cooldowns aren't equal")
			// return
		}
		if (altSourceLab1.cooldown !== altSourceLab2.cooldown) {
			// delete Memory.rooms[creep.mem.sR].advManagedLabs
			if (Math.random() < 0.1) console.log(creep.name, creep.room.name, "Alternative source lab cooldowns aren't equal")
			// return
		}

		let sourceLab1
		let sourceLab2

		let targetLab1
		let targetLab2

		if (regularSourceLab1.cooldown <= altSourceLab1.cooldown) {
			sourceLab1 = altSourceLab1
			sourceLab2 = altSourceLab2

			targetLab1 = regularSourceLab1
			targetLab2 = regularSourceLab2
		}
		else {
			sourceLab1 = regularSourceLab1
			sourceLab2 = regularSourceLab2

			targetLab1 = altSourceLab1
			targetLab2 = altSourceLab2
		}

		// console.log(sourceLab1, sourceLab2)
		// console.log(regularSourceLab1.cooldown, altSourceLab1.cooldown)

		let withdrawTarget;
		let transferTarget;
		let resourceToWithdraw
		let resourceToTransfer
		if (targetLab1.mineralAmount && targetLab1.mineralType != creep.room.mem.targetCompound) {
			withdrawTarget = targetLab1;
			resourceToWithdraw = targetLab1.mineralType
		}
		if (targetLab2.mineralAmount && targetLab2.mineralType != creep.room.mem.targetCompound) {
			withdrawTarget = targetLab2;
			resourceToWithdraw = targetLab2.mineralType
		}
		else if (sourceLab1.mineralAmount && sourceLab1.mineralType != reagent1) {
			withdrawTarget = sourceLab1;
			resourceToWithdraw = sourceLab1.mineralType
		}
		else if (sourceLab2.mineralAmount && sourceLab2.mineralType != reagent2) {
			withdrawTarget = sourceLab2;
			resourceToWithdraw = sourceLab2.mineralType
		}

		if ((!sourceLab1.mineralAmount || (sourceLab1.mineralAmount < Math.min(minRequired) && sourceLab1.mineralType == reagent1)) && currentOfReagent1) {
			transferTarget = sourceLab1
			resourceToTransfer = reagent1
		}
		else if ((!sourceLab2.mineralAmount || (sourceLab2.mineralAmount < Math.min(minRequired) && sourceLab2.mineralType == reagent1)) && currentOfReagent2) {
			transferTarget = sourceLab2
			resourceToTransfer = reagent2
		}

		// if (creep.room.name == "E18S8") console.log(withdrawTarget, resourceToWithdraw, transferTarget, resourceToTransfer)

		let moving = 0
		if (transferTarget) {
			if (!creep.pos.isNearToPos(transferTarget.pos)) {
				creep.cachedMoveTo(transferTarget.pos, 1, {maxRooms: 1})
				moving = 1
			}
			else {
				let ret = creep.transfer(transferTarget, resourceToTransfer, Math.min(creep.store[resourceToTransfer], minRequired))
				if (ret != OK && ret != ERR_NOT_ENOUGH_RESOURCES) {
					console.log(ret)
					delete Memory.rooms[creep.mem.sR].advManagedLabs
					throw new Error("Transfer failed on lab")
				}
			}
		}

		if (withdrawTarget)  {
			if (!creep.pos.isNearToPos(withdrawTarget.pos)) {
				if (!moving) {
					creep.cachedMoveTo(withdrawTarget.pos, 1, {maxRooms: 1})
					return
				}
			}
			else {
				let ret = creep.withdraw(withdrawTarget, resourceToWithdraw)		
				if (ret != OK ) {
					if (ret == ERR_FULL) {
						if (Object.keys(creep.store).length <= 2 || (Memory.rooms[creep.mem.sR].ownedCreeps["labTech"] || []).length == 0) {
							creep.mem.full = 1
						}
					}
					else {						
						console.log(ret)
						delete Memory.rooms[creep.mem.sR].advManagedLabs
						throw new Error("Withdraw failed on lab")
					}
				}
			}
		}

		if (moving) {
			return
		}
		else {
			creep.cachedMoveTo(new RoomPosition(Memory.rooms[creep.room.name].labPositionX - 1, Memory.rooms[creep.room.name].labPositionY, creep.room.name), 0, {maxRooms: 1})
		}
	},


	runLabTech: function(creep, secondCall) {
		if (creep.pos.roomName != creep.mem.sR) {
			creep.cachedMoveTo(new RoomPosition(25, 25, creep.mem.sR), 20);
			return;
		}

		if (creep.mem.wT != undefined && Game.time < creep.mem.wT) {
			return;
		}

		if (!secondCall) {
			let usedCapacity = creep.getStoreUsedCapacity();
			if (usedCapacity !== 0) {
				creep.mem.f = 0;
				creep.mem.fT = undefined;
			}
			else if (!creep.mem.f && usedCapacity == 0) {
				creep.mem.f = 1;
				creep.mem.dTgt = undefined;
				creep.mem.resourceCarry = undefined;
			}

			if (usedCapacity == 0 && creep.ticksToLive < 20) {
				return creep.suicide();
			}

			// Oooh shit.
			if (!creep.room.terminal && !creep.room.storage) {
				return;
			}
		}

		if(creep.mem.f) {
			if (creep.room.dangerous && Math.random() < 0.2) {
				delete creep.mem.fT
			}
			if (creep.mem.fT == undefined) {
				// Find stuff on the floor
				let droppedStuff = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
					filter: (resource) => {
						return resource.resourceType != RESOURCE_ENERGY;
					}
				});

				if (droppedStuff) {
					if (!creep.room.dangerous || droppedStuff.pos.findFirstInRange(creep.room.labs, 1)) {
						creep.mem.fT = droppedStuff.id;
						creep.mem.resourceCarry = droppedStuff.resourceType;
						delete creep.mem.maxCarry
					}
				}

				let labs
				if (!creep.mem.fT) {
				 	labs = _.clone(creep.room.labs);
					labs.sort(function(a, b) {
						let aScore = a.mineralAmount;
						let bScore = b.mineralAmount;

						let labMemoryA = creep.room.mem.labMemory[a.id];
						let labMemoryB = creep.room.mem.labMemory[b.id];

						if (labMemoryA && labMemoryA.lockedForBoosts) {
							aScore -= LAB_MINERAL_CAPACITY
						}
						if (labMemoryB && labMemoryB.lockedForBoosts) {
							bScore -= LAB_MINERAL_CAPACITY
						}

						return bScore - aScore
					})
				}

				// Empty anything that's wrong
				if (!creep.mem.fT) {
					for (let lab of labs) {
						if ((creep.room.mem.advManagedLabs || 0) >= Game.time - 1 && creep.room.mem.managedLabs.includes(lab.id)) continue
						if (creep.room.mem.labMemory[lab.id] && lab.mineralAmount > 0 && lab.mineralType != creep.room.mem.labMemory[lab.id].targetMineral && !creep.room.mem.labMemory[lab.id].pickupLab) {
							creep.mem.fT = lab.id;
							creep.mem.resourceCarry = lab.mineralType;
							delete creep.mem.maxCarry
							break;
						}
					}
				}

				// Fill 'em with energy
				if (!creep.mem.fT) {
					for (let lab of labs) {
						if (lab.energy < LAB_ENERGY_CAPACITY * 0.25) {
							creep.mem.fT = creep.room.storage.id;
							creep.mem.resourceCarry = RESOURCE_ENERGY;
							delete creep.mem.maxCarry
							break;
						}
					}
				}

				function fillLabs() {
					if ((creep.room.mem.advManagedLabs || 0) >= Game.time - 1) {
						return
					}
					// Nothing is wrong in the labs. Now check to try and fill them.
					for (let labIdx in labs) {
						// Go backwards so that we fill emptiest first
						let lab = labs[labs.length - labIdx - 1];
						let labMemory = creep.room.mem.labMemory[lab.id];
						if (labMemory && labMemory.targetMineral) {
							// If it's something we drop to, and we have stuff to drop, drop it.
							let storeAmount = (creep.room.storage.store[labMemory.targetMineral] || 0);
							let termAmount = (creep.room.terminal.store[labMemory.targetMineral] || 0);

							if (labMemory.lockedForBoosts) {
								// Some boosts don't need too much stocking
								let lowUsageBoost = util.isHarvestBoost(labMemory.targetMineral) || util.isRepairBoost(labMemory.targetMineral) || util.isMoveBoost(labMemory.targetMineral);

								if ((storeAmount || termAmount) && lab.mineralAmount + (lab.expectedMineral || 0) + (lowUsageBoost ? creep.carryCapacity : 0) < (labMemory.maxAmount || LAB_MINERAL_CAPACITY)) {
									creep.mem.fT = storeAmount ? creep.room.storage.id : creep.room.terminal.id;
									creep.mem.resourceCarry = labMemory.targetMineral;
									// if (labMemory.maxAmount && labMemory.maxAmount != LAB_MINERAL_CAPACITY) {
									// }

									break;
								}
							}
							else if (labMemory.dropOffLab) {								
								let sourceLabAmount = creep.carryCapacity;
								if (creep.room.mem.targetCompound) {
									if (REACTION_TIME[creep.room.mem.targetCompound] == 5) {
										sourceLabAmount *= 1.5;
									}
									else if (REACTION_TIME[creep.room.mem.targetCompound] == 10) {
										sourceLabAmount *= 1.1;
									}
									else if (REACTION_TIME[creep.room.mem.targetCompound] > 50) {
										sourceLabAmount *= 0.5;
									}
								}

								if ((lab.mineralAmount + (lab.expectedMineral || 0) <= sourceLabAmount) && storeAmount + termAmount > 0) {
									creep.mem.fT = storeAmount ? creep.room.storage.id : creep.room.terminal.id;
									creep.mem.resourceCarry = labMemory.targetMineral;
									delete creep.mem.maxCarry
									break;
								}
							}

						}
					}
				}

				function emptyLabs() {
					if ((creep.room.mem.advManagedLabs || 0) >= Game.time - 1 && creep.room.mem.targetCompound) {
						let reagent1 = RECIPES[creep.room.mem.targetCompound][0]
						let reagent2 = RECIPES[creep.room.mem.targetCompound][1]

						let allowed = [reagent1, reagent2, creep.room.mem.targetCompound]
						let reagents = [reagent1, reagent2]
						
						for (let lab of labs) {
							let labMemory = creep.room.mem.labMemory[lab.id];
							// if (labMemory && (lab.mineralAmount >= creep.carryCapacity * .45 || (lab.mineralAmount && (!allowed.includes(lab.mineralType) || !creep.room.mem.managedLabs.includes(lab.id)))) && !labMemory.dropOffLab && !labMemory.lockedForBoosts) {
							if (labMemory && 
								(lab.mineralAmount >= creep.carryCapacity * .45 || (lab.mineralAmount && (!allowed.includes(lab.mineralType) || (!creep.room.mem.managedLabs.includes(lab.id) && reagents.includes(lab.mineralType))))) && 
									!labMemory.dropOffLab && 
									!labMemory.lockedForBoosts) {
								creep.mem.fT = lab.id;
								creep.mem.resourceCarry = lab.mineralType;
								delete creep.mem.maxCarry
								break;
							}
						}

					}
					else {						
						// Nothing to fill. Try emptying. Do it from fullest first.
						for (let lab of labs) {
							let labMemory = creep.room.mem.labMemory[lab.id];
							if (labMemory && (lab.mineralAmount >= creep.carryCapacity * .45 || (lab.mineralAmount && lab.mineralType != creep.room.mem.targetCompound)) && !labMemory.dropOffLab && !labMemory.lockedForBoosts) {
								creep.mem.fT = lab.id;
								creep.mem.resourceCarry = lab.mineralType;
								delete creep.mem.maxCarry
								break;
							}
						}
					}
				}


				// If we're closer to the labs, empty, otherwise fill
				// This should mean we get use out of both trips: there and back again.
				if (!creep.mem.fT) {
					let labDist = creep.pos.getRangeToXY(creep.room.mem.labPositionX, creep.room.mem.labPositionY)
					let storeDist = creep.pos.getRangeToXY(creep.room.mem.storageBatteryX, creep.room.mem.storageBatteryY)

					if (labDist < storeDist) {
						emptyLabs()
					}
					else {
						fillLabs();
					}

					if (!creep.mem.fT) {
						if (labDist < storeDist) {
							fillLabs()
						}
						else {
							emptyLabs();
						}
					}

					if (!creep.mem.fT && (creep.room.mem.advManagedLabs || 0) >= Game.time - 10) {
						let advLabManager
						if (creep.room.mem.ownedCreeps["advLabManager"] && creep.room.mem.ownedCreeps["advLabManager"].length) {
							advLabManager = Game.creeps[creep.room.mem.ownedCreeps["advLabManager"][0]]
						}


						function emptyAdvLabManager(nearStorage) {
							if (!creep.room.mem.ownedCreeps["advLabManager"] || !creep.room.mem.ownedCreeps["advLabManager"].length) return
							let advLabManager = Game.creeps[creep.room.mem.ownedCreeps["advLabManager"][0]]

							if (!advLabManager) return

							let targetCompound = creep.room.mem.targetCompound

							if (!targetCompound) return

							let reagent1 = RECIPES[targetCompound][0]
							let reagent2 = RECIPES[targetCompound][1]

							let halfCap = advLabManager.store.getCapacity() / 2


							for (let resource in advLabManager.store) {
								if ((resource != reagent1 && resource != reagent2) || advLabManager.store[resource] > halfCap * 1.5) {
									// Don't bother to make the trip if it's just a smidgen
									// Possibly we shouldn't bother to make the trip at all if we're near storage.
									if (nearStorage && !advLabManager.mem.needsEmpty && advLabManager.store[resource] < halfCap / 4 && advLabManager.store.getFreeCapacity() > halfCap / 4) {
										continue
									}
									creep.mem.fT = advLabManager.id
									creep.mem.resourceCarry = resource
									return
								}
							}
						}

						function fillAdvLabManager(nearStorage) {
							if (!creep.room.mem.ownedCreeps["advLabManager"] || !creep.room.mem.ownedCreeps["advLabManager"].length) return
							let advLabManager = Game.creeps[creep.room.mem.ownedCreeps["advLabManager"][0]]

							if (!advLabManager) return

							if (advLabManager.mem.noLabTechDeliveries) return

							let freeCap = advLabManager.store.getFreeCapacity()

							// Worst case: filling 40 into two source labs, only using 10, and having to pick up 30 from each.
							// then 5 from each new source lab. Let it have 70 cap free for this.
							if (!freeCap || freeCap <= 70) return

							let targetCompound = creep.room.mem.targetCompound

							if (!targetCompound) return

							let reagent1 = RECIPES[targetCompound][0]
							let reagent2 = RECIPES[targetCompound][1]

							let halfCap = advLabManager.store.getCapacity() / 2

							// If we're near the labs by the time we get back we're going to have consumed some
							// Trouble is maxCarry is set here, so we'll carry a tiny amount back.
							// let mod = nearStorage ? .75 : .9
							let mod = .75

							function testReagent(reagent) {
								if (advLabManager.store[reagent] < halfCap * mod) {
									if (creep.room.storage.store[reagent] >= halfCap - advLabManager.store[reagent]) {
										creep.mem.fT = creep.room.storage.id
										creep.mem.resourceCarry = reagent
										creep.mem.maxCarry = Math.min(halfCap - advLabManager.store[reagent], freeCap - 70)
										return 1
									}
									else if (creep.room.terminal.store[reagent] >= halfCap - advLabManager.store[reagent]) {
										creep.mem.fT = creep.room.terminal.id
										creep.mem.resourceCarry = reagent
										creep.mem.maxCarry = Math.min(halfCap - advLabManager.store[reagent], freeCap - 70)
										return 1
									}
								}
								return 0
							}

							if ((advLabManager.store[reagent1] || 0) <= (advLabManager.store[reagent2] || 0)) {								
								if (testReagent(reagent1)) {
									return
								}
								if (testReagent(reagent2)) {
									return
								}
							}
							else {								
								if (testReagent(reagent2)) {
									return
								}
								if (testReagent(reagent1)) {
									return
								}
							}
						}

						// if (creep.room.name == "E18S8") console.log(creep.mem.fT, labDist, storeDist)


						if (labDist < storeDist || (advLabManager && advLabManager.mem.needsEmpty)) {
							emptyAdvLabManager(false);
						}
						else {
							fillAdvLabManager(true)
						}

						if (!creep.mem.fT) {							
							if (labDist < storeDist) {
								fillAdvLabManager(false)
							}
							else {
								emptyAdvLabManager(true);
							}
						}
					}
				}


				// Fill 'em with energy but to a higher threshold
				if (!creep.mem.fT) {
					for (let lab of labs) {
						if (lab.energy < LAB_ENERGY_CAPACITY * 0.75) {
							creep.mem.fT = creep.room.storage.id;
							creep.mem.resourceCarry = RESOURCE_ENERGY;
							delete creep.mem.maxCarry
							break;
						}
					}
				}


				// Sometimes our containers get stuff in them. That's annoying, clear it out
				// A bit pricey to run every pass. 
				if (Math.random() < 0.05 || (creep.room.labs.length == 0 && Math.random() < 0.5)) {
					if (!creep.mem.fT) {
						let containers = creep.room.containers;
						for (let container of containers) {
							for (let resource in container.store) {
								if (resource == RESOURCE_ENERGY) continue
								if (container.store[resource]) {
									if (!roomAI.isInSpawnBattery(container)) continue
									creep.mem.fT = container.id;
									creep.mem.resourceCarry = resource;
									delete creep.mem.maxCarry
									break;
								}
							}
							if (creep.mem.fT) {
								break;
							}
						}
					}

					// All containers
					if (Math.random() < 0.05) {					
						if (!creep.mem.fT) {
							let containers = creep.room.containers;
							for (let container of containers) {
								for (let resource in container.store) {
									if (resource == RESOURCE_ENERGY) continue
									if (container.store[resource]) {
										creep.mem.fT = container.id;
										creep.mem.resourceCarry = resource;
										delete creep.mem.maxCarry
										break;
									}
								}
								if (creep.mem.fT) {
									break;
								}
							}
						}
					}
				}

				// If any lab has less than LAB_BOOST_MINERAL and we don't have any more, empty it out.
				if (!creep.mem.fT) {
					for (let lab of labs) {
						// let labMemory = creep.room.mem.labMemory[lab.id];
						// if (!labMemory) continue;
						if (!lab.mineralAmount) continue
						let storeAmount = (creep.room.storage.store[lab.mineralType] || 0);
						let termAmount = (creep.room.terminal.store[lab.mineralType] || 0);

						if (lab.mineralAmount < LAB_BOOST_MINERAL && storeAmount + termAmount < LAB_BOOST_MINERAL) {
							creep.mem.fT = lab.id;
							creep.mem.resourceCarry = lab.mineralType;
							delete creep.mem.maxCarry
							break;
						}
					}
				}


			}
			if(creep.mem.fT) {
				var target = Game.getObjectById(creep.mem.fT)
				if (target) {
					if (!creep.pos.isNearToPos(target.pos)) {
						creep.cachedMoveTo(target, 1, {maxRooms: 1});
						if (creep.mem.mS > 5) {
							creep.mem.fT = undefined;
						}
					}
					else if (!secondCall) {
						let ret;
						if (target.amount !== undefined) {
							ret = creep.pickup(target)
						}
						else if (target.body) {
							ret = target.transfer(creep, creep.mem.resourceCarry);
						}
						else {
							ret = creep.withdrawAndUpdateCarry(target, creep.mem.resourceCarry, creep.mem.maxCarry);	

						}

						if (ret != OK) {
							creep.mem.fT = undefined;
						}
						else if (!secondCall) {
							creep.mem.fT = undefined
							creep.mem.f = 0
							if (target.structureType == STRUCTURE_LAB && (creep.room.mem.advManagedLabs || 0) < Game.time - 1 && target.store[creep.mem.resourceCarry] < creep.store.getFreeCapacity()) {
								// Empty other labs
								for (let lab of creep.room.labs) {
									let labMemory = creep.room.mem.labMemory[lab.id];
									if (labMemory && lab.mineralAmount && lab.mineralType == creep.mem.resourceCarry && !labMemory.dropOffLab && !labMemory.lockedForBoosts) {
										creep.mem.fT = lab.id;
										creep.mem.f = 1
										break;
									}
								}
							}
							delete creep.mem.maxCarry
							return this.runLabTech(creep, true);
						}
					}
				}
				else {
					creep.mem.f = 0;
					creep.mem.fT = undefined;
				}
			}
			else {
				if (Game.cpu.bucket > 9250 && Memory.rooms[creep.mem.sR].ownedCreeps["labTech"] && Memory.rooms[creep.mem.sR].ownedCreeps["labTech"].length == 1) {
					if (Game.rooms[creep.mem.sR].labs.length) {
						if (creep.room.mem.targetCompound || (Game.time - (creep.room.mem.boostsRequestedTime || -2000) < 2000)) {						
							creep.renew = 1;
							return this.runRenewer(creep, false)
						}
					}
					else {
						changeCreepRole(creep, "fetcher")
						return this.runFetcher(creep)	
					}
				}
				else {
					delete creep.mem.path
					creep.mem.wT = Game.time + 10;
				}
			}
		}
		else {
			let target = Game.getObjectById(creep.mem.dTgt)
			if (creep.mem.dTgt == undefined || !target) {
				delete creep.mem.dTgt
				// Shit, we're carrying stuff. Where does it go?
				let labs = _.clone(creep.room.labs);
				// This is the reverse sort from the above. We want to fill emptiest first

				// Try labs first.
				if (creep.mem.resourceCarry == RESOURCE_ENERGY) {
					labs.sort(function(a, b) {return a.energy - b.energy})
					for (let lab of labs) {
						if (lab.energy <= LAB_ENERGY_CAPACITY * 0.75) {
							creep.mem.dTgt = lab.id;
							break;
						}
					}
				}
				else {
					if ((creep.room.mem.advManagedLabs || 0) >= Game.time - 10 && creep.room.mem.targetCompound) {
						if (creep.room.mem.ownedCreeps["advLabManager"] && creep.room.mem.ownedCreeps["advLabManager"].length) {
							let advLabManager = Game.creeps[creep.room.mem.ownedCreeps["advLabManager"][0]]
							if (advLabManager) {
								let targetCompound = creep.room.mem.targetCompound
								let reagent1 = RECIPES[targetCompound][0]
								let reagent2 = RECIPES[targetCompound][1]

								let halfCap = advLabManager.store.getCapacity() / 2

								if ((creep.mem.resourceCarry == reagent1 && advLabManager.store[reagent1] <= halfCap - creep.store[creep.mem.resourceCarry]) || 
									(creep.mem.resourceCarry == reagent2 && advLabManager.store[reagent2] <= halfCap - creep.store[creep.mem.resourceCarry])) {
									creep.mem.dTgt = advLabManager.id;
								}

								// if (creep.room.name == "E18S8") console.log(advLabManager, reagent1, reagent2, reagent2)

							}
						}
					}
					// labs.sort(function(a, b) {return a.mineralAmount - b.mineralAmount})

					else if (!creep.mem.dTgt) {						
						let filteredLabs = _.filter(labs, function(lab) { 
							let labMemory = creep.room.mem.labMemory[lab.id];
							// This lab has an issue. Don't drop there, we'll sort that out once we've got rid of this.
							if (lab.mineralAmount > 0 && lab.mineralType != labMemory.targetMineral) return false

							return labMemory && lab.mineralAmount < lab.mineralCapacity && labMemory.dropOffLab && labMemory.targetMineral == creep.mem.resourceCarry; 
						})

						let bestMineralAmount = Infinity
						for (let lab of filteredLabs) {
							if (lab.mineralAmount < bestMineralAmount) {
								bestMineralAmount = lab.mineralAmount
								creep.mem.dTgt = lab.id;
							}
						}
					}
				}

				// No labs want our stuff? Ok, dump it in the terminal
				if (!creep.mem.dTgt) {
					creep.mem.dTgt = creep.room.storage.id;
				}

				target = Game.getObjectById(creep.mem.dTgt)
			}
			// else {
				// let target = Game.getObjectById(creep.mem.dTgt)
				if (!creep.pos.isNearToPos(target.pos)) {
					creep.cachedMoveTo(target, 1, {maxRooms: 1});
					if (creep.mem.mS > 5) {
						creep.mem.fT = undefined;
					}
					// Targets of opportunity
					if (creep.carry[creep.mem.resourceCarry] && creep.carry[creep.mem.resourceCarry] < creep.carryCapacity) {
						let otherLabs = _.filter(creep.room.labs, function(lab) { return lab.mineralAmount > 0 &&
																						 lab.mineralAmount <= creep.carryCapacity - creep.carry[creep.mem.resourceCarry] &&
																						 lab.mineralType == creep.mem.resourceCarry &&
																						 creep.room.mem.labMemory[lab.id].pickupLab &&
																						 creep.pos.isNearToPos(lab.pos); });

						// console.log(creep, otherLabs)
						creep.withdraw(_.sample(otherLabs), creep.mem.resourceCarry)
					}

					if (creep.mem.mS > 5) {
						creep.mem.fT = undefined;
					}
				}
				else if (!secondCall) {
					// Things can sometimes get out of phase (eg. if we lose memory due to a reset)
					if (!creep.store[creep.mem.resourceCarry]) {
						delete creep.mem.resourceCarry
					}
					creep.mem.resourceCarry = creep.mem.resourceCarry || Object.keys(creep.store)[0]
					let ret
					if (target.body) {
						ret = creep.transfer(target, creep.mem.resourceCarry, Math.min(target.store.getFreeCapacity() - 70, creep.store[creep.mem.resourceCarry]));
					}
					else {
						ret = creep.transfer(target, creep.mem.resourceCarry)
					}
				
					if (ret != OK) {
						creep.mem.dTgt = undefined;
					}
					else {
						delete creep.mem.maxCarry
					}
				}

				if (creep.mem.resourceCarry == RESOURCE_ENERGY) {
					target.expectedEnergy = (target.expectedEnergy || 0) + creep.carry[RESOURCE_ENERGY];
				}
				else {
					target.expectedMineral = (target.expectedMineral || 0) + creep.carry[creep.mem.resourceCarry];
				}
				// Doesn't work with partial transfers. Resourcecarry gets screwed up
				// else if (!secondCall) {
			 //		creep.mem.f = 1;
			 //		creep.mem.dTgt = undefined;
				// 	return this.runLabTech(creep, true);
				// }
			// }
		}
	},


	runPowerShuffler: function(creep, secondCall = false) {
		if (creep.pos.roomName != creep.mem.sR) {
			creep.cachedMoveTo(new RoomPosition(25, 25, creep.mem.sR), 20);
			return;
		}

		if ((creep.mem.wT != undefined && Game.time < creep.mem.wT) && creep.ticksToLive < 1450) {
			return;
		}

		if (!creep.mem.psStoreDist) {
			if (creep.room.powerSpawn && creep.room.storage) {
				creep.mem.psStoreDist = Math.max(4, creep.room.powerSpawn.pos.getRangeToPos(creep.room.storage.pos) * 1.75)
				if (Memory.season3) {
					// I don't care if we use a few more intents, I want 100% uptime.
					creep.mem.psStoreDist *= 2
				}
			}
		}
		

		if ((!creep.room.powerSpawn || (creep.room.powerSpawn.power > creep.mem.psStoreDist && !(creep.room.powerSpawn.effects || []).length)) && !creep.getStoreUsedCapacity()) {
			if (creep.room.powerSpawn) {
				if (!(creep.room.powerSpawn.effects || []).length) {
					if (!Memory.season3) {
						creep.mem.wT = Game.time + creep.room.powerSpawn.power - creep.mem.psStoreDist;
					}
				}
				delete creep.mem.path
			}
			if (!Memory.season3) {
				return;
			}
		}
		else if (!creep.getStoreUsedCapacity()) {
			creep.mem.f = 1;
		}
		else {
			creep.mem.f = 0	
		}

		if(creep.mem.f) {
			if (creep.room.processingPower) {				
				if ((creep.room.storage.store[RESOURCE_POWER] || 0) >= 50) {				
					var ret = creep.withdrawAndUpdateCarry(creep.room.storage, RESOURCE_POWER);
					if (ret == ERR_NOT_IN_RANGE) {
						creep.cachedMoveTo(creep.room.storage, 1);
					}
					else if (ret == OK) {
						delete creep.mem.path
						creep.mem.f = 0;
						if (!secondCall) {
							this.runPowerShuffler(creep, true)
						}						
					}
				}
				else if (creep.room.terminal && (creep.room.terminal.store[RESOURCE_POWER] || 0) >= 50) {				
					var ret = creep.withdrawAndUpdateCarry(creep.room.terminal, RESOURCE_POWER);
					if (ret == ERR_NOT_IN_RANGE) {
						creep.cachedMoveTo(creep.room.terminal, 1);
					}
					else if (ret == OK) {
						delete creep.mem.path
						creep.mem.f = 0;
						if (!secondCall) {
							this.runPowerShuffler(creep, true)
						}
					}
				}
			}
			else {
				delete creep.mem.path
			}
		}
		else {
			var ret = creep.transferAndUpdateCarry(creep.room.powerSpawn, RESOURCE_POWER);
			if (ret == ERR_NOT_IN_RANGE) {
				creep.cachedMoveTo(creep.room.powerSpawn, 1);
			}
			else if (ret == OK) {
				if (!(creep.room.powerSpawn.effects || []).length) {
					if (!Memory.season3) {
						creep.mem.wT = Game.time + Math.min(creep.store[RESOURCE_POWER], creep.room.powerSpawn.powerCapacity) - creep.mem.psStoreDist
					}
				}
				creep.mem.f = 1;
				delete creep.mem.path
			}
		}
	},

	runSeason2TerminalTransporter: function(creep, secondCall) {
		creep.mem.destRoom = creep.mem.destRoom || creep.mem.sR
		
		let destMem = Memory.rooms[creep.mem.destRoom]

		let targetMem = Memory.rooms[creep.mem.targetRoom]
		let targetPlayer = Memory.rooms[creep.mem.targetRoom].owner

		if (targetMem.owner == "Montblanc" && Memory.modifiedOutgoingTradeLedger["Montblanc"] && creep.store.getUsedCapacity()) {
			creep.say(Memory.modifiedOutgoingTradeLedger["Montblanc"][Object.keys(creep.store)[0]], true)
		}

		var targets = creep.room.lookForAtArea(LOOK_STRUCTURES, Math.max(1, creep.pos.y),Math.max(1, creep.pos.x),Math.min(48, creep.pos.y),Math.min(48, creep.pos.x), true);

		for (let target of targets) {
			var structure = target.structure
			if (structure.structureType == STRUCTURE_ROAD) {
				global.flaggedRoads = global.flaggedRoads || {};
				global.flaggedRoads[creep.room.name] = global.flaggedRoads[creep.room.name] || new Set();
				if (!global.flaggedRoads[creep.room.name].has(structure.id)) {
					global.flaggedRoads[creep.room.name].add(structure.id)
				}

				break;
			}
		}

		let resource = Object.keys(creep.store)[0]
		if (!resource && !secondCall && !creep.mem.bidirectional && creep.mem.destRoom == creep.mem.targetRoom) {
			creep.mem.destRoom = creep.mem.sR;
			return this.runSeason2TerminalTransporter(creep, true)
		}

		if (!resource && creep.room.controller && creep.room.controller.owner && creep.room.controller.owner.username == "psy372" && creep.mem.destRoom != creep.room.name) {
			creep.mem.destRoom = creep.room.name
			return
		}
		if (!resource && !secondCall && creep.room.name == creep.mem.sR && creep.mem.destRoom != creep.mem.sR && targetPlayer == "Montblanc") {
			creep.mem.role = "recycler"
			creep.mem.destRoom = creep.room.name
			return
		}

		// if (!resource && !secondCall && creep.mem.path && creep.mem.path.length > creep.ticksToLive) {
		// 	creep.suicide()
		// 	return
		// }

		// Move to destination
		if (creep.pos.roomName != creep.mem.destRoom) {
			let terminalPos

			if (Game.rooms[creep.mem.destRoom]) {
				terminalPos = Game.rooms[creep.mem.destRoom].terminal.pos
			}
			else if (destMem && destMem.terminalPos) {
				terminalPos = new RoomPosition(destMem.terminalPos.x, destMem.terminalPos.y, creep.mem.destRoom)
			}
			else if (destMem && destMem.trmX) {
				terminalPos = new RoomPosition(destMem.trmX, destMem.trmY, creep.mem.destRoom)
			}
			else {
				throw(new Error("No terminal in dest room"))
			}

			if (Memory.rooms[creep.mem.destRoom].owner == "psy372") {
				if (Game.rooms[creep.mem.destRoom]) {
					terminalPos = Game.rooms[creep.mem.destRoom].storage.pos
				}
				else if (destMem && destMem.storagePos) {
					terminalPos = new RoomPosition(destMem.storagePos.x, destMem.storagePos.y, creep.mem.destRoom)
				}
				else if (destMem && destMem.storX) {
					terminalPos = new RoomPosition(destMem.storX, destMem.storY, creep.mem.destRoom)
				}
				else {
					throw(new Error("No storage in dest room"))
				}
			}

			// Direct should give us a full path
			creep.cachedMoveTo(terminalPos, 1, {direct: Game.time - (creep.mem.pIncompleteTick || 0) < 100 ? 0 : 1, avoidEnemyRooms: 1});

			let tooFar = creep.mem.path && creep.mem.path.length * 2 >= creep.ticksToLive

			// Double checking here
			tooFar = tooFar || Game.map.getRoomLinearDistance(creep.room.name, creep.mem.destRoom) * 100 >= creep.ticksToLive

			if (tooFar && creep.room.controller && creep.room.controller.my) {
				if (secondCall) {
					creep.cancelOrder("withdraw")
				}
				else if (creep.getStoreUsedCapacity()) {
					if (creep.pos.isNearToPos(creep.room.storage)) {
						creep.transfer(creep.room.storage, Object.keys(creep.store)[0])
					}
					else if (creep.pos.isNearToPos(creep.room.terminal)) {
						creep.transfer(creep.room.terminal, Object.keys(creep.store)[0])
					}
				}
				changeCreepRole(creep, "recycler")
				return
			}

			return;
		}


		let target
		// Shouldn't need the last one, but just in case
		if (resource == creep.room.mem.decoderType && Memory.dropsPlanned[creep.room.mem.decoderType] > Game.time && creep.room.controller.level == 8 && targetPlayer != "psy372") {
			target = creep.room.find(FIND_SYMBOL_DECODERS)[0]
		}
		else {
			target = targetPlayer == "psy372" ? creep.room.storage : creep.room.terminal
		}

		// In dest room
		if (!creep.pos.isNearToPos(target.pos)) {
			creep.cachedMoveTo(target.pos, 1, {maxRooms: 1});
			return
		}

		if (secondCall) return

		if (resource) {
			if (resource == creep.room.mem.decoderType && Memory.dropsPlanned[creep.room.mem.decoderType] > Game.time && targetPlayer != "psy372") {
				if (creep.transfer(creep.room.find(FIND_SYMBOL_DECODERS)[0], resource) != OK) {
					throw(new Error("Transfer error"))
				}
				creep.mem.destRoom = creep.mem.sR;
				return this.runSeason2TerminalTransporter(creep, true)
			}

			if (creep.transfer(target, resource) != OK) {
				throw(new Error("Transfer error"))
			}

			if (!creep.mem.bidirectional && creep.room.name == creep.mem.targetRoom) {
				creep.mem.destRoom = creep.mem.sR;
				return this.runSeason2TerminalTransporter(creep, true)
			}

			return
		}

		if (creep.room.controller.my) {
			// Try minerals first
			if (creep.mem.minerals && targetPlayer == "Cub") {
				let requests = Memory.allyResourceRequests[targetPlayer]

				// if (Game.time < 1678886 + 50000 && targetPlayer == "Cub") {
				// 	requests["XZH2O"] = 30000	
				// }

				for (let resourceType in requests) {
					if (requests <= creep.store.getCapacity()) {
						continue
					}
					if (creep.room.terminal.store[resourceType]) {
						creep.withdrawAndUpdateCarry(creep.room.terminal, resourceType)
						creep.mem.destRoom = creep.mem.targetRoom;
						return this.runSeason2TerminalTransporter(creep, true)
					}
				}
			}

			let orderedSymbols;
			let candidateSymbols
			if (targetPlayer == "Cub") {
				candidateSymbols = _.shuffle(Object.values(Memory.allySymbols[targetPlayer]))
			}
			else if (targetPlayer == "Montblanc") { 
				candidateSymbols = _.shuffle(Object.values(Memory.friendInfo[targetPlayer]))
				orderedSymbols = util.getSeasonOrderedSymbols()
			}
			else if (targetPlayer == "psy372") { 
				candidateSymbols = []

				for (let symbol of Memory.tradeSell) {
					if (Memory.seasonTradeInfo[targetPlayer].buy.includes(symbol)) {
						candidateSymbols.push(symbol)
					}
				}

				let returnSymbols = []
				for (let symbol of Memory.tradeBuy) {
					if (Memory.seasonTradeInfo[targetPlayer].sell.includes(symbol)) {
						returnSymbols.push(symbol)
					}
				}

				if (returnSymbols.length == 0 || candidateSymbols.length == 0) {
					console.log("No symbols to trade", candidateSymbols, returnSymbols)
					changeCreepRole(creep, "recycler")
					return this.runRecycler(creep)
				}
			}
			else {
				candidateSymbols = []
			}


			for (let pass = 0; pass < 2; pass++) {				
				for (let symbol of candidateSymbols) {

					if (targetPlayer != "psy372" && Memory.myDecoders.includes(symbol)) {
						/*if (targetPlayer == "Cub") {
							console.log("I have symbol but am sending it to cub", symbol)
						}
						else {*/
							continue
						//}
					}

					// if (symbol == RESOURCE_SYMBOL_HETH) {
					// 	console.log("Not moving heth")
					// 	continue
					// }
					if (targetPlayer == "Montblanc") {
						if (!Memory.currentMBSymbols.includes(symbol)) {
							continue
						}
					}


					if (pass == 0 && Memory.modifiedOutgoingTradeLedger[targetPlayer] && Memory.modifiedOutgoingTradeLedger[targetPlayer][symbol] > 100000) {
						continue
					}
					if (pass == 0 && targetPlayer == "Montblanc" && Memory.stats.globalResources[symbol] < 100000 && orderedSymbols.indexOf(symbol) < constants.SEASON2_MAX_X_HOARD) {
						continue
					}

					if (creep.room.storage.store[symbol] && creep.room.storage.store[symbol] >= creep.store.getCapacity() && creep.pos.isNearToPos(creep.room.storage.pos)) {
						creep.withdrawAndUpdateCarry(creep.room.storage, symbol)
						creep.mem.destRoom = creep.mem.targetRoom;
						if (creep.ticksToLive > 100) {
							return this.runSeason2TerminalTransporter(creep, true)
						}
						return
					}
					else if (creep.room.terminal.store[symbol] && creep.room.terminal.store[symbol] >= creep.store.getCapacity()) {
						creep.withdrawAndUpdateCarry(creep.room.terminal, symbol)
						creep.mem.destRoom = creep.mem.targetRoom;
						if (creep.ticksToLive > 100) {
							return this.runSeason2TerminalTransporter(creep, true)
						}
						return
					}
				}
			}


			if (creep.mem.energy && Memory.terminalNetworkFreeEnergy > 1e6) {
				if (creep.room.terminal.store[RESOURCE_ENERGY]) {
					creep.withdrawAndUpdateCarry(creep.room.terminal, RESOURCE_ENERGY)
					creep.mem.destRoom = creep.mem.targetRoom;
					return this.runSeason2TerminalTransporter(creep, true)
				}
			}




			if (creep.mem.bidirectional) {				
				creep.mem.destRoom = creep.mem.targetRoom;
				return this.runSeason2TerminalTransporter(creep, true)
			}
		}
		else {
			// Only get here if we're bidirectional

			for (let pass = (targetPlayer == "Cub" ? 0 : 1); pass < 2; pass++) {
				let minAmount = pass == 0 ? creep.store.getCapacity() : 1
				if (targetPlayer == "Cub") {
					let allySymbols = _.shuffle(Object.values(Memory.allySymbols[targetPlayer] || Memory.friendInfo[targetPlayer] || {}))

					let targetSymbols = _.clone(Memory.myDecoders)
					if (creep.mem.destRoom == "W17N6") {
						targetSymbols = targetSymbols.concat(Memory.currentMBSymbols)
						targetSymbols = _.shuffle(targetSymbols)
					}

					for (let symbol of targetSymbols) {
						// if (allySymbols.includes(symbol)) continue

						if (creep.room.terminal.store[symbol] >= minAmount) {
							creep.withdrawAndUpdateCarry(creep.room.terminal, symbol)
							creep.mem.destRoom = creep.mem.sR;
							return this.runSeason2TerminalTransporter(creep, true)
						}
					}
				}
				else if (targetPlayer == "psy372") {
					let candidateSymbols = []

					for (let symbol of Memory.tradeBuy) {
						if (Memory.seasonTradeInfo[targetPlayer].sell.includes(symbol)) {
							candidateSymbols.push(symbol)
						}
					}

					for (let symbol of candidateSymbols) {
						// if (allySymbols.includes(symbol)) continue

						if (creep.room.storage.store[symbol] >= minAmount) {
							if (creep.withdrawAndUpdateCarry(creep.room.storage, symbol) == OK) {							
								creep.mem.destRoom = creep.mem.sR;
								return
								// return this.runSeason2TerminalTransporter(creep, true)
							}
						}
					}
				}			

				if (creep.mem.minerals) {
					for (let resource of global.targetMinerals) {
						let amount = (Memory.stats.globalResources[resource] || 0)

						let targetAmount = Game.myRooms.length * (targetPlayer == "Cub" ? 6000 : 15000)

						let requests = Memory.allyResourceRequests[targetPlayer]

						if (amount < targetAmount && !requests[resource] && creep.room.terminal.store[resource] >= minAmount) {
							creep.withdrawAndUpdateCarry(creep.room.terminal, resource)
							creep.mem.destRoom = creep.mem.sR;
							return this.runSeason2TerminalTransporter(creep, true)
						}
					}
				}
				if (targetPlayer == "Cub") {				
					if (Memory.terminalNetworkFreeEnergy < 6e6) {						
						if (creep.room.terminal.store[RESOURCE_BATTERY] >= minAmount) {
							creep.withdrawAndUpdateCarry(creep.room.terminal, RESOURCE_BATTERY)
							creep.mem.destRoom = creep.mem.sR;
							return this.runSeason2TerminalTransporter(creep, true)					
						}
						else if (creep.room.storage.store[RESOURCE_ENERGY] > 300000) {
							creep.withdrawAndUpdateCarry(creep.room.terminal, RESOURCE_ENERGY)
							creep.mem.destRoom = creep.mem.sR;
							return this.runSeason2TerminalTransporter(creep, true)
						}
					}

					if (pass == 1) {						
						Memory.terminalShuffleRoomLastEmpty = Memory.terminalShuffleRoomLastEmpty || {}
						Memory.terminalShuffleRoomLastEmpty[creep.room.name] = Game.time
					}

				}
			}



			creep.mem.destRoom = creep.mem.sR;
			return this.runSeason2TerminalTransporter(creep, true)

		}
	},

	runSeason2ScoreShuffler: function(creep, secondCall) {
		if ((Memory.stats.globalResources[Memory.rooms[creep.mem.targetRoom].decoderType] || 0) < 200000) {
			Memory.dropsPlanned[Memory.rooms[creep.mem.targetRoom].decoderType] = Game.time + creep.ticksToLive
		}

		if ((Memory.enableVisuals || Memory.forceSaveMemory)) {
			Game.map.visual.text("💰", creep.pos, {fontSize: 5})
		}

		if (Game.time % 101 == 23 && Memory.rooms[creep.room.name].DT > 0.5 && creep.room.dangerous && creep.room.controller && creep.room.controller.owner && creep.room.controller.owner.username == "Cub") {
			let structs = creep.pos.lookFor(LOOK_STRUCTURES)
			for (let struct of structs) {
				if (struct.structureType == STRUCTURE_RAMPART && !struct.isPublic) {
					console.log("--------------------------", creep, "wants to suicide as stuck in ramparts")
					creep.suicide();
					return
				}
			}
		}


		if (creep.pos.roomName != creep.mem.targetRoom || util.isEdgeOfRoom(creep.pos)) {
			creep.cachedMoveTo(new RoomPosition(25, 25, creep.mem.targetRoom), 22);
			return;
		}

		if ((creep.mem.wT != undefined && Game.time < creep.mem.wT)) {
			return;
		}


		if (!secondCall) {			
			if (!_.sum(creep.carry)) {
				creep.mem.f = 1;
			}
			else {
				creep.mem.f = 0	
			}
		}

		if(creep.mem.f) {
			// Take care for ledgers
			if (creep.room.controller.my) {
				let totalAmount = creep.room.getCurrentOfResource(creep.room.mem.decoderType)

				for (let playerName in Memory.incomingTradeLedger) {
					totalAmount -= Math.max(0, (Memory.incomingTradeLedger[playerName][creep.room.mem.decoderType] || 0))
				}

				totalAmount -= creep.store.getCapacity()
				if (totalAmount < 0) {
					delete creep.mem.path
					return
				}
			}
			else if (Memory.allySymbolAmount[creep.room.controller.owner.username] !== undefined) {
				let totalAmount = Memory.allySymbolAmount[creep.room.controller.owner.username][creep.room.mem.decoderType]

				totalAmount -= creep.store.getCapacity()
				if (totalAmount < 0 && !secondCall) {
					creep.suicide()
					return
				}
			}
			else if (Memory.modifiedOutgoingTradeLedger[creep.room.controller.owner.username][creep.room.mem.decoderType]) {
				let totalAmount = Memory.modifiedOutgoingTradeLedger[creep.room.controller.owner.username][creep.room.mem.decoderType]

				creep.say(totalAmount, true)

				totalAmount -= creep.store.getCapacity()
				if (totalAmount < 0 && !secondCall) {
					creep.suicide()
					return
				}
			}


			// Don't want floor drops in rooms that aren't mine
			if (creep.ticksToLive < 100 && !secondCall && !creep.room.controller.my) {
				creep.suicide()
			}
			if (creep.room.storage && creep.room.storage.store[creep.room.mem.decoderType]) {				
				var ret = creep.withdrawAndUpdateCarry(creep.room.storage, creep.room.mem.decoderType);
				if (ret == ERR_NOT_IN_RANGE) {
					creep.cachedMoveTo(creep.room.storage, 1, {maxRooms: 1});
				}
				else if (ret == OK) {
					creep.mem.f = 0;
					if (!secondCall) return this.runSeason2ScoreShuffler(creep, true)
				}
			}
			else if (creep.room.terminal && creep.room.terminal.store[creep.room.mem.decoderType]) {				
				var ret = creep.withdrawAndUpdateCarry(creep.room.terminal, creep.room.mem.decoderType);
				if (ret == ERR_NOT_IN_RANGE) {
					creep.cachedMoveTo(creep.room.terminal, 1, {maxRooms: 1});
				}
				else if (ret == OK) {
					creep.mem.f = 0;
					if (!secondCall) return this.runSeason2ScoreShuffler(creep, true)
				}
			}
			else {
				delete creep.mem.path
				if (Memory.modifiedOutgoingTradeLedger[creep.room.controller.owner.username] && 
					(Memory.modifiedOutgoingTradeLedger[creep.room.controller.owner.username][creep.room.mem.decoderType] || 0) > 0) {
					creep.say(Memory.modifiedOutgoingTradeLedger[creep.room.controller.owner.username][creep.room.mem.decoderType] + "?", true)
				}
			}
		}
		else {
			let decoder = creep.room.find(FIND_SYMBOL_DECODERS)[0]
			var ret = creep.transferAndUpdateCarry(decoder, creep.room.mem.decoderType);
			if (ret == ERR_NOT_IN_RANGE) {
				creep.cachedMoveTo(decoder, 1, {maxRooms: 1});
			}
			else if (ret == OK) {
				creep.mem.f = 1;
				if (!secondCall) return this.runSeason2ScoreShuffler(creep, true)
			}
		}
	},

	runSeason2ContainerManager: function(creep) {
		if (creep.pos.roomName != creep.mem.targetRoom || util.isEdgeOfRoom(creep.pos)) {
			creep.cachedMoveTo(new RoomPosition(25, 25, creep.mem.targetRoom), 22);
			return;
		}

		if (creep.store.getFreeCapacity() == 0) {
			creep.mem.f = 0
			creep.mem.t = 0
		}
		else if (creep.store.getUsedCapacity() == 0) {
			creep.mem.f = 1
		}

		if (creep.mem.f) {
			for (let resource of creep.room.find(FIND_DROPPED_RESOURCES)) {
				if (resource.resourceType == RESOURCE_ENERGY && resource.amount > 100) {
					if (!creep.pos.isNearToPos(resource.pos)) {
						creep.uncachedMoveTo(resource.pos, 1, {maxRooms: 1, avoidCombatEdges: 1})
						return
					}
					else {
						creep.pickup(resource)
						return
					}
				}
			}
			if (!creep.mem.t) {
				creep.mem.t = creep.pos.findClosestByRange(creep.room.constructedWalls).id
			}
			let target = Game.getObjectById(creep.mem.t)
			if (!creep.pos.isNearToPos(target.pos)) {
				creep.uncachedMoveTo(target.pos, 1, {maxRooms: 1, avoidCombatEdges: 1})
				return
			}
			creep.dismantle(target)
			return
		}
		else { 
			let sites = creep.room.find(FIND_MY_CONSTRUCTION_SITES)

			if (sites.length) {
				if (!creep.pos.inRangeToPos(sites[0].pos, 1)) {
					creep.uncachedMoveTo(sites[0].pos, 1, {maxRooms: 1, avoidCombatEdges: 1})
					//return
				}
				creep.build(sites[0])
				return
			}

			let containers = creep.room.containers
			for (let div = 8; div >= 1; div >>= 1) {				
				for (let container of containers) {
					if (container.hits < container.hitsMax / div) {
						if (!creep.pos.inRangeToPos(container.pos, 0)) {
							creep.uncachedMoveTo(container.pos, 0, {maxRooms: 1, avoidCombatEdges: 1})
							//return
						}
						creep.repair(container)
						return
					}
				}
			}
			creep.uncachedMoveTo(creep.pos.findClosestByRange(creep.room.containers), 0, {maxRooms: 1, avoidCombatEdges: 1})

		}
	},
	runSeason2ContainerShuffler: function(creep, secondCall) {
		if (creep.mem.f && (creep.getStoreUsedCapacity() == creep.store.getCapacity() || creep.ticksToLive < 200)) {
			if (!creep.getStoreUsedCapacity()) {
				creep.suicide()
				return
			}
			creep.mem.f = 0
		}
		else if (!creep.mem.f && creep.getStoreUsedCapacity() == 0) {
			creep.mem.f = 1
			if (creep.ticksToLive < 400) {
				changeCreepRole(creep, "recycler")
				return
			}
		}

		if (creep.mem.f) {
			if (creep.pos.roomName != creep.mem.targetRoom) {
				creep.cachedMoveTo(new RoomPosition(25, 25, creep.mem.targetRoom), 22);
				return;
			}
			for (let resource of creep.room.find(FIND_DROPPED_RESOURCES)) {
				if (creep.pos.inRangeToPos(resource.pos, resource.amount) && SYMBOLS.includes(resource.resourceType)) {
					if (!creep.pos.isNearToPos(resource.pos)) {
						creep.cachedMoveTo(resource.pos, 1, {maxRooms: 1})
						return
					}
					else {
						creep.pickup(resource)
						if (!secondCall) {
							this.runSeason2ContainerShuffler(creep, true)
						}
						return
					}
				}
			}
			for (let tombstone of creep.room.find(FIND_TOMBSTONES)) {
				if (tombstone.store.getUsedCapacity()) {
					if (!creep.pos.isNearToPos(tombstone.pos)) {
						creep.cachedMoveTo(tombstone.pos, 1, {maxRooms: 1})
						return
					}
					else {
						creep.withdrawAndUpdateCarry(tombstone, Object.keys(tombstone.store)[0])
						if (!secondCall) {
							this.runSeason2ContainerShuffler(creep, true)
						}
						return
					}
				}
			}
			for (let container of creep.room.containers) {
				if (container.store.getUsedCapacity()) {
					if (!creep.pos.isNearToPos(container.pos)) {
						creep.cachedMoveTo(container.pos, 1, {maxRooms: 1})
						return
					}
					else {
						let resourceType = Object.keys(container.store)[0]
						if (creep.withdrawAndUpdateCarry(container, resourceType) == OK) {
							if (SYMBOLS.includes(resourceType)) {
								if (creep.mem.targetRoom === "W19S10") {
									Memory.stats.W15S15DonatedScore = (Memory.stats.W15S15DonatedScore || 0) + Math.min(creep.store.getFreeCapacity(), container.store[Object.keys(container.store)[0]])
									container.store[Object.keys(container.store)[0]] -= Math.min(creep.store.getFreeCapacity(), container.store[Object.keys(container.store)[0]])

									if (Memory.stats.W15S15DonatedScore && !Memory.W15S15FirstDonationTime) {
										Memory.W15S15FirstDonationTime = Game.time
									}
								}
								else if (creep.mem.targetRoom == "W8N20") {
									Memory.stats.W5N25DonatedScore = (Memory.stats.W5N25DonatedScore || 0) + Math.min(creep.store.getFreeCapacity(), container.store[Object.keys(container.store)[0]])
									container.store[Object.keys(container.store)[0]] -= Math.min(creep.store.getFreeCapacity(), container.store[Object.keys(container.store)[0]])
									if (Memory.stats.W5N25DonatedScore && !Memory.W5N25FirstDonationTime) {
										Memory.W5N25FirstDonationTime = Game.time
									}
								}
							}
							else if (resourceType != RESOURCE_ENERGY) {
								if (creep.mem.targetRoom == "W8N20") {
									Memory.stats.W5N25DonatedMinerals = (Memory.stats.W5N25DonatedMinerals || 0) + Math.min(creep.store.getFreeCapacity(), container.store[Object.keys(container.store)[0]])
									container.store[Object.keys(container.store)[0]] -= Math.min(creep.store.getFreeCapacity(), container.store[Object.keys(container.store)[0]])
								}
							}

						}
						if (!secondCall) {
							this.runSeason2ContainerShuffler(creep, true)
						}
						return
					}
				}
			}
			if (creep.room.containers.length) {
				creep.cachedMoveTo(creep.pos.findClosestByRange(creep.room.containers), 0, {maxRooms: 1, avoidCombatEdges: 1});
			}
			else {
				creep.cachedMoveTo(new RoomPosition(25, 25, creep.mem.targetRoom), 22, {maxRooms: 1, avoidCombatEdges: 1});
			}
			return
		}
		else { 
			let target
			if (Game.rooms[creep.mem.sR].terminal) {
				target = Game.rooms[creep.mem.sR].terminal
			}
			else {
				target = Game.rooms[creep.mem.sR].storage
			}
			if (!creep.pos.isNearToPos(target.pos)) {
				creep.cachedMoveTo(target.pos, 1)
			}
			else {
				creep.transferAndUpdateCarry(target, Object.keys(creep.store)[0])
				if (!secondCall) {
					this.runSeason2ContainerShuffler(creep, true)
				}
				return
			}
		}
	},

	runSeason2Imposter : function(creep) {
		if (creep.getBoosts()) {
			return
		}
		creep.heal(creep)

		if (creep.room.name != creep.mem.targetRoom || util.isEdgeOfRoom(creep.pos)) {
			creep.uncachedMoveTo(new RoomPosition(25, 25, creep.mem.targetRoom), 22, {})
			return
		}

		// if (!creep.room.factory) {
		// 	return this.runRanged(creep)	
		// }
			
		let combatMoveOptions = {"avoidCombatEdges" : 1, "maxRooms": 1};


		let decoder = creep.room.find(FIND_SYMBOL_DECODERS)[0]
		if (creep.store.getUsedCapacity()) {
			if (creep.pos.isNearToPos(decoder.pos)) {
				creep.transfer(decoder, decoder.resourceType)
			}
			else {
				creep.uncachedMoveTo(decoder, 1, combatMoveOptions)
			}
		}
		else {
			if (!creep.room.factory.store[decoder.resourceType] && creep.mem.backupTargetRoom) {
				creep.mem.targetRoom = creep.mem.backupTargetRoom
				delete creep.mem.backupTargetRoom
				this.runSeason2Imposter(creep)
			}
			if (creep.pos.isNearToPos(creep.room.factory.pos)) {
				creep.withdraw(creep.room.factory, decoder.resourceType)
			}
			else {
				creep.uncachedMoveTo(creep.room.factory, 1, combatMoveOptions)
			}
		}
	},



	runSeason3TradeTransporter: function(creep, secondCall) {
		creep.mem.destRoom = creep.mem.destRoom || creep.mem.sR
		
		let destMem = Memory.rooms[creep.mem.destRoom]

		let targetMem = Memory.rooms[creep.mem.targetRoom]

		let resource = Object.keys(creep.store)[0]
		if (!resource && !secondCall && !creep.mem.bidirectional && creep.mem.destRoom == creep.mem.targetRoom) {
			creep.mem.destRoom = creep.mem.sR;
			return this.runSeason2TerminalTransporter(creep, true)
		}

		if (!resource && !secondCall && creep.room.name == creep.mem.sR && creep.mem.destRoom != creep.mem.sR) {
			creep.mem.role = "recycler"
			creep.mem.destRoom = creep.room.name
			return
		}

		// Move to destination
		if (creep.pos.roomName != creep.mem.destRoom) {
			let terminalPos

			if (Game.rooms[creep.mem.destRoom]) {
				terminalPos = Game.rooms[creep.mem.destRoom].terminal.pos
			}
			else if (destMem && destMem.terminalPos) {
				terminalPos = new RoomPosition(destMem.terminalPos.x, destMem.terminalPos.y, creep.mem.destRoom)
			}
			else if (destMem && destMem.trmX) {
				terminalPos = new RoomPosition(destMem.trmX, destMem.trmY, creep.mem.destRoom)
			}
			else {
				throw(new Error("No terminal in dest room"))
			}

			creep.cachedMoveTo(terminalPos, 1, {avoidEnemyRooms: 1});

			let tooFar = creep.mem.path && creep.mem.path.length * 2 >= creep.ticksToLive

			// Double checking here
			tooFar = tooFar || Game.map.getRoomLinearDistance(creep.room.name, creep.mem.destRoom) * 100 >= creep.ticksToLive

			if (tooFar && creep.room.controller && creep.room.controller.my) {
				if (secondCall) {
					creep.cancelOrder("withdraw")
				}
				else if (creep.getStoreUsedCapacity()) {
					if (creep.pos.isNearToPos(creep.room.storage)) {
						creep.transfer(creep.room.storage, Object.keys(creep.store)[0])
					}
					else if (creep.pos.isNearToPos(creep.room.terminal)) {
						creep.transfer(creep.room.terminal, Object.keys(creep.store)[0])
					}
				}
				changeCreepRole(creep, "recycler")
				return
			}

			return;
		}


		let target = creep.room.controller.my ? creep.room.terminal	: creep.room.terminal

		// In dest room
		if (!creep.pos.isNearToPos(target.pos)) {
			creep.cachedMoveTo(target.pos, 1, {maxRooms: 1});
			return
		}

		if (secondCall) return

		if (resource) {
			if (creep.transfer(target, resource) != OK) {
				throw(new Error("Transfer error"))
			}

			if (!creep.mem.travelTime) {
				creep.mem.travelTime = CREEP_LIFE_TIME - creep.ticksToLive
			}

			if (!creep.mem.bidirectional && creep.room.name == creep.mem.targetRoom) {
				creep.mem.destRoom = creep.mem.sR;
				return this.runSeason2TerminalTransporter(creep, true)
			}

			return
		}

		if (creep.room.controller.my) {
			if (creep.ticksToLive > (creep.mem.travelTime || 100)) {
				let resource = creep.mem.myTransportResource

				creep.withdrawAndUpdateCarry(creep.room.terminal, resource)
				creep.mem.destRoom = creep.mem.targetRoom;
				return this.runSeason2TerminalTransporter(creep, true)			
			}
			else {
				changeCreepRole(creep, "recycler")
			}
		}
		else {
			if (creep.ticksToLive > (creep.mem.travelTime || 100)) {
				let resource = creep.mem.myReverseTransportResource

				creep.withdrawAndUpdateCarry(creep.room.terminal, resource)
				creep.mem.destRoom = creep.mem.sR;
				return this.runSeason2TerminalTransporter(creep, true)			
			}
			else {
				changeCreepRole(creep, "recycler")
			}
		}
	},

	runSeason4Scorer :function(creep) {
		if ((creep.mem.giveUp && !creep.room.dangerous) || creep.ticksToLive < 600 + creep.body.length * 3) {
			changeCreepRole(creep, "recycler")
			return this.runRecycler(creep)
		}

		creep.valuableCreepExtraHate(100)

		if (!creep.store.getUsedCapacity()) {
			if (creep.room.name == creep.mem.sR && creep.room.terminal) {
				if (creep.room.terminal.store[creep.mem.resource]) {
					if (!creep.pos.isNearToPos(creep.room.terminal.pos)) {
						creep.cachedMoveTo(creep.room.terminal.pos, 1, {maxRooms: 1})
					}
					else {
						creep.withdraw(creep.room.terminal, creep.mem.resource)
					}
				}
				if (creep.ticksToLive > CREEP_LIFE_TIME - 100 && !creep.room.transferred && creep.room.terminal.store[creep.mem.resource] < creep.store.getCapacity()) {
					// Transfer to fill
					for (let room of _.shuffle(Game.myRooms)) {
						if (room.terminal && !room.transferred && !room.terminal.cooldown) {
							let amount = creep.store.getFreeCapacity() - creep.room.terminal.store[creep.mem.resource]

							if (room.terminal.store[creep.mem.resource] >= amount) {
								let cost = Game.market.calcTransactionCost(amount, room.name, creep.room.name)
								console.log(room.name, "sending", amount, creep.mem.resource, "to", creep.room.name)

								room.terminal.send(creep.mem.resource, amount, creep.room.name)
								global.inTickObject.energyExpenditures["terminalSeason4"]  = (global.inTickObject.energyExpenditures["terminalSeason4"] || 0) + cost

								room.transferred = 1
								creep.room.transferred = 1
								break
							}							
						}
					}

					// Transfer anything you've got
					if (!creep.room.transferred) {
						for (let room of _.shuffle(Game.myRooms)) {
							if (room.terminal && !room.transferred && !room.terminal.cooldown) {
								let amount = Math.min(creep.store.getFreeCapacity(), room.terminal.store[creep.mem.resource])

								if (amount) {
									let cost = Game.market.calcTransactionCost(amount, room.name, creep.room.name)
									console.log(room.name, "sending", amount, creep.mem.resource, "to", creep.room.name)

									room.terminal.send(creep.mem.resource, amount, creep.room.name)
									global.inTickObject.energyExpenditures["terminalSeason4"]  = (global.inTickObject.energyExpenditures["terminalSeason4"] || 0) + cost

									room.transferred = 1
									creep.room.transferred = 1
									break
								}							
							}
						}
					}
				}
			}
			else {
				changeCreepRole(creep, "recycler")
				return this.runRecycler(creep)
			}
		}
		else {			
			if (creep.room.dangerous == 2) {
				creep.uncachedMoveTo(new RoomPosition(25, 25, creep.mem.sR), 20, {"avoidEnemyRooms": 1, "avoidHostiles": 1, "maxDT" : 1.5, "minKD" : -0.5})
				creep.mem.giveUp = 1;
			}
			else {				
				let myResource = Object.keys(creep.store)[0];
				let convoyCreep = creep.room.find(FIND_HOSTILE_CREEPS, {filter: (h) => {return h.owner.username == "Screeps" && Object.keys(h.store)[0] == myResource && h.store.getFreeCapacity()}})[0]
				if (convoyCreep) {
					if (!creep.pos.isNearToPos(convoyCreep.pos)) {
						creep.uncachedMoveTo(convoyCreep.pos, 1, {"avoidEnemyRooms": 1, "maxDT" : 1.5, "minKD" : -0.5, "avoidLocalCreeps" : 1})
					}
					else {
						let err = creep.transfer(convoyCreep, myResource)
						if (err != OK) {
							console.log("runSeason4Scorer TRANSFER ERROR", err)
							changeCreepRole(creep, "recycler")
							return this.runRecycler(creep)
						}
					}
				}
				else if (creep.room.name != creep.mem.targetRoom || util.isEdgeOfRoom(creep.pos)) {
					creep.uncachedMoveTo(new RoomPosition(25, 25, creep.mem.targetRoom), 20, {"avoidEnemyRooms": 1, "maxDT" : 1.5, "minKD" : -0.5})
				}
			}

		}

		skirmisherRangedAttackAndHeal(creep, undefined, undefined)

	},	

	runSeason5ScoreTransport: function(creep) {
		if (!creep.mem.f && creep.getStoreUsedCapacity() == 0) {
			creep.mem.f = 1;
			creep.mem.dTgt = undefined;
		}
		if (creep.mem.f && creep.getStoreUsedCapacity() > (2 * creep.carryCapacity) / 3) {
			creep.mem.f = 0;
			creep.mem.fT = undefined;
		}

		creep.valuableCreepExtraHate(1000);


		if (creep.civilianSpookedSK()) {
			return;
		}

		if (creep.mem.f) {
			if (creep.ticksToLive < 1200) {
				changeCreepRole(creep, "fetcher")
				return this.runFetcher(creep)
			}
	 		if (creep.mem.sR != creep.room.name) {
	 			if (Game.rooms[creep.mem.sR] && Game.rooms[creep.mem.sR].terminal) {
	 				creep.cachedMoveTo(Game.rooms[creep.mem.sR].terminal, 1);
	 			}
	 			else {
					creep.cachedMoveTo(new RoomPosition(25, 25, creep.mem.sR), 20);
	 			}
			}
			else {
				let target;
				if (creep.room.terminal) {
					target = creep.room.terminal;
				}

				if (target) {
					if (creep.store.getCapacity() == 100) {
						if (creep.withdraw(target, RESOURCE_THORIUM, Math.min(target.store.getUsedCapacity(RESOURCE_THORIUM), creep.store.getFreeCapacity(RESOURCE_THORIUM), 99)) == ERR_NOT_IN_RANGE) {
							creep.cachedMoveTo(target, 1);
						}
					} else {					
						if (creep.withdraw(target, RESOURCE_THORIUM, Math.min(target.store.getUsedCapacity(RESOURCE_THORIUM), creep.store.getFreeCapacity(RESOURCE_THORIUM), 999)) == ERR_NOT_IN_RANGE) {
							creep.cachedMoveTo(target, 1);
						}
					}
				}
			}
		}
		else {
			let moveOptions;
			if (creep.room.dangerous) {
				moveOptions = {"avoidEnemyRooms" : 1, "avoidHostiles" : 2, "maxDT" : 1.25, "minKD" : -0.5};
			}
			else {
				moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.25, "minKD" : -0.5};
			}

			if (creep.mem.targetRoom != creep.room.name) {
	 			creep.cachedMoveTo(new RoomPosition(Memory.rooms[creep.mem.targetRoom].reactorPos.x, Memory.rooms[creep.mem.targetRoom].reactorPos.y, creep.mem.targetRoom), 1, moveOptions);
			}
			else {
				let target = creep.room.find(FIND_REACTORS)[0]

				if (target) {
					creep.mem.dTgt = target.id
					var ret = creep.transfer(target, RESOURCE_THORIUM)
					if(ret == ERR_NOT_IN_RANGE) {
						creep.cachedMoveTo(target, 1, moveOptions);
					}
				}
				else {
					console.log("NO TARGET FOR THORIUM DROPOFF")
				}
			}
		}

	},	

	runSeason5ReactorClaimer: function(creep) {
		if (creep.mem.targetRoom == creep.room.name && !util.isEdgeOfRoom(creep.pos)) {
			let reactor = creep.room.find(FIND_REACTORS)[0]
			var ret = creep.claimReactor(reactor)
			if (ret == ERR_INVALID_TARGET) {
				console.log("WTF, invalid reactor in", creep.room.name)				
			}
			if(ret == ERR_NOT_IN_RANGE) {
				creep.cachedMoveTo(reactor, 1, {"avoidEnemyRooms" : 1, "maxRooms": 1});
			}
			else if (ret == OK) {
				return;
			}
		}
		else {
			let moveOptions;
			if (creep.room.dangerous) {
				moveOptions = {"avoidEnemyRooms" : 1, "avoidHostiles" : 2, "maxDT" : 1.25, "minKD" : -0.5};
			}
			else {
				moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.25, "minKD" : -0.5};
			}

			if (Memory.rooms[creep.mem.targetRoom]) {
				creep.cachedMoveTo(new RoomPosition(Memory.rooms[creep.mem.targetRoom].reactorPos.x, Memory.rooms[creep.mem.targetRoom].reactorPos.y, creep.mem.targetRoom), 1, moveOptions);
			}
			else {
				creep.cachedMoveTo(new RoomPosition(25, 25, creep.mem.targetRoom), 20, moveOptions);
			}

		}
	},

	runSafeModeGenerator: function(creep) {
		let moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.5, "minKD" : -0.5};

		if (!creep.carry[RESOURCE_GHODIUM]) {
			creep.mem.f = 1;
		}

		if (creep.pos.roomName != creep.mem.sR && creep.mem.f) {
			creep.cachedMoveTo(new RoomPosition(25, 25, creep.mem.sR), 20, moveOptions);
			return;
		}
		if (creep.pos.roomName != (creep.mem.targetRoom || creep.mem.sR) && !creep.mem.f) {
			creep.cachedMoveTo(new RoomPosition(25, 25,  (creep.mem.targetRoom || creep.mem.sR)), 20, moveOptions);
			return;
		}



		if(creep.mem.f) {
			var ret = creep.withdraw(creep.room.terminal, RESOURCE_GHODIUM, 1000);
			if (ret == ERR_NOT_IN_RANGE) {
				creep.cachedMoveTo(creep.room.terminal, 1, moveOptions);
			}
			else if (ret == OK) {
				creep.mem.f = 0;
			}
		}
		else {
			var ret = creep.generateSafeMode(creep.room.controller);
			if (ret == ERR_NOT_IN_RANGE) {
				creep.cachedMoveTo(creep.room.controller, 1, moveOptions);
			}
			else if (ret == OK) {
				changeCreepRole(creep, "fetcher")
				// return this.runFetcher(creep);
				return;
			}
		}

	},


	runBaseManager: function(creep, secondCall, endOfDelivery) {
		if (creep.pos.roomName != creep.mem.sR) {
			creep.cachedMoveTo(new RoomPosition(25, 25, creep.mem.sR), 20);
			return;
		}

		// if (creep.room.name == "W6N83") console.log("A", creep.name, creep.store.getUsedCapacity(), creep.mem.fT)
		if (!creep.mem.fT && (creep.getStoreUsedCapacity() == 0 || endOfDelivery)) {
			creep.mem.f = 1;
			creep.mem.dTgt = undefined;
		}
		if (creep.mem.f && creep.getStoreUsedCapacity() >= creep.carryCapacity * 0.75) {
			creep.mem.f = 0;
			creep.mem.fT = undefined;
		}

		let moveOptions;

		if (creep.room.dangerous) {
			moveOptions = {"maxRooms" : 1, "avoidHostiles" : 10};
		}
		else {
			moveOptions = {"maxRooms" : 1};
		}

		// if (creep.room.name == "W6N83") console.log("C", creep.name, creep.store.getUsedCapacity(), creep.mem.fT)


		if(creep.mem.f) {
			if (!creep.mem.fT || Math.random() < 0.01) {
				if (((creep.mem.wT != undefined && Game.time < creep.mem.wT) || creep.mem.f == 2) && !creep.room.dangerous) {
					let target = creep.pos.findClosestByRange(FIND_TOMBSTONES, {
						filter: (structure) => {
							return structure.store[RESOURCE_ENERGY] > creep.pos.getRangeToPos(structure.pos) * Memory.stats.yieldPerCPU * global.INTENT_CPU_COST;
						}
					});

				 	if (!target) {
						target = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
							filter: (dropped) => {
								return dropped.resourceType == RESOURCE_ENERGY && dropped.amount > creep.pos.getRangeToPos(dropped.pos) * Memory.stats.yieldPerCPU * global.INTENT_CPU_COST;
							}
						});
				 	}
					if (!target) {
						target = creep.pos.findClosestByRange(creep.room.containers, {
							filter: (structure) => {
								return structure.store[RESOURCE_ENERGY] > creep.pos.getRangeToPos(structure.pos) * Memory.stats.yieldPerCPU * global.INTENT_CPU_COST && roomAI.isSourceContainer(structure);
							}
						});
					}

					if (target) {
						creep.mem.fT = target.id;
					}
				}
				else {
					/*var target = creep.pos.findClosestByRange(FIND_MY_STRUCTURES, {
						filter: (structure) => {
							// FIND_MY_STRUCTURES
							// if (roomAI.isDropoffPoint(structure) || roomAI.isSourceContainer(structure)) {
							// 	return false;
							// }

							// Try to keep a 5:1 ratio between terminal and storage in terms of picking
							if (structure.structureType == STRUCTURE_STORAGE && structure.room.terminal) {
								if (structure.store[RESOURCE_ENERGY] > structure.room.terminal.store[RESOURCE_ENERGY] * 5) {
									return true;
								}
							}
							else if (structure.structureType == STRUCTURE_STORAGE) {
								return (structure.store[RESOURCE_ENERGY] > 0)
							}
							if (structure.structureType == STRUCTURE_TERMINAL && structure.room.storage) {
								if (structure.store[RESOURCE_ENERGY] * 5 > structure.room.storage.store[RESOURCE_ENERGY]) {
									return true;
								}
							}

							return false;
						}
					});*/

					let targets = [];
					if (creep.room.storage) {						
						if (creep.room.terminal) {
							if (creep.room.factory && creep.room.factory.store[RESOURCE_ENERGY] > 20000) {
								targets.push(creep.room.factory)
							}
							else if (creep.room.storage.store[RESOURCE_ENERGY] > creep.room.terminal.store[RESOURCE_ENERGY] * 5) {
								targets.push(creep.room.storage)
							}
							else {
								targets.push(creep.room.terminal)	
							}
						}
						else if (creep.room.storage.store[RESOURCE_ENERGY] > 0) {
							targets.push(creep.room.storage)
						}
					}

					let target = creep.pos.findClosestByRange(targets);

					if (!target) {
						target = creep.pos.findClosestByRange(FIND_STRUCTURES, {
							filter: (structure) => {
								if (roomAI.isSourceContainer(structure)) {
									return false;
								}
								if (roomAI.isDropoffPoint(structure) && !roomAI.isInSpawnBattery(structure)) {
									return false;
								}
								if (structure.structureType == STRUCTURE_CONTAINER && 
									structure.store[RESOURCE_ENERGY] > (creep.carryCapacity - creep.getStoreUsedCapacity()) / 2) {
									return true;
								}
								if (structure.structureType == STRUCTURE_LINK && !roomAI.isEnergyEndPoint(structure) && !roomAI.isEnergyStartPoint(structure) && structure.energy > 0) {
									return true;
								}
								return false;
							}
						});
					}
				 	if (!target && !creep.room.dangerous) {
						target = creep.pos.findClosestByRange(FIND_TOMBSTONES, {
							filter: (structure) => {
								return structure.store[RESOURCE_ENERGY] > 0;
							}
						});
				 	}
				 	if (!target && !creep.room.dangerous) {
						target = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
							filter: (resource) => {
								return resource.resourceType == RESOURCE_ENERGY;
							}
						});
				 	}
				 	if (!target && !creep.room.dangerous) {
						target = creep.pos.findClosestByRange(creep.room.containers, {
							filter: (structure) => {
								return structure.store[RESOURCE_ENERGY] > 0 && roomAI.isSourceContainer(structure);
							}
						});
				 	}

					if (target) {
						creep.mem.fT = target.id;
					}
					else {
						// Nowhere to pick up. Nap.
						if ((Game.cpu.bucket > 8250 || (global.anySmallHaulers && Game.cpu.bucket > 2000)) && Memory.rooms[creep.mem.sR].spawnUtilization > 0.8 && Memory.rooms[creep.mem.sR].ownedCreeps["baseManager"] && Memory.rooms[creep.mem.sR].ownedCreeps["baseManager"].length == 1) {
							creep.renew = 1;
							return this.runRenewer(creep, false)
						}
						else {
							let heavy = Game.time - (creep.room.mem.spawningHeavyMission || -2000) < 2000
							if (!heavy) {
								creep.mem.wT = Game.time + 10
							}
						}
					}
				}
			}

			if(creep.mem.fT) {
				var target = Game.getObjectById(creep.mem.fT)

				if (!target) {
					creep.mem.fT = undefined;
					if (!secondCall) this.runBaseManager(creep, true, false)
				}
				else {
					if (!creep.pos.isNearToRoomObject(target)) {
						creep.cachedMoveTo(target, 1, moveOptions);
						if (creep.mem.mS > 5) {
							// if (creep.room.name == "W6N83") console.log(creep.name, "stuck")
							creep.mem.fT = undefined;
						}

					}
					else if (!secondCall) {
						let ret;
						if (target.resourceType && target.resourceType == RESOURCE_ENERGY) {
							ret = creep.pickupAndUpdateCarry(target);
						}
						else {
							ret = creep.withdrawAndUpdateCarry(target, RESOURCE_ENERGY);
						}

						if (ret != OK) {
							// if (creep.room.name == "W6N83") console.log(creep.name, ret)
							creep.mem.fT = undefined;
							if (!secondCall) {
								this.runBaseManager(creep, true, false)
							}
						} else {
							if (!secondCall) {
								this.runBaseManager(creep, true, false)
							}
						}
					}
				}
			}
			else {
				creep.mem.f = 1;
			}
		}
		else {
			if (creep.mem.wT != undefined && Game.time < creep.mem.wT) {
				delete creep.mem.path
				return;
			}

			if (!creep.mem.dTgt) {
				delete creep.mem.path
				var targets = roomAI.getEnergyPriorityTargets(creep.room);
				var target = creep.pos.findClosestByRange(targets);

				if (target) {
					creep.mem.dTgt = target.id
				}
			}

			if (creep.mem.dTgt) {
				var target = Game.getObjectById(creep.mem.dTgt);
				if (!target || (target.energyCapacity && target.energy == target.energyCapacity)) {
					delete creep.mem.path
					delete creep.mem.pTX
					delete creep.mem.pTY
					delete creep.mem.pTgtRoom
					creep.mem.dTgt = undefined;
					return
				}

				// var targetEnergy
				// if (target.energy != undefined) targetEnergy = target.energy
				// else							targetEnergy = target.store[RESOURCE_ENERGY]

				target.expectedEnergy = creep.getStoreUsedCapacity() + (target.expectedEnergy || 0)

				if (!creep.pos.isNearTo(target)) {
					var moveRet = creep.cachedMoveTo(target, 1, moveOptions);
					// var moveRet = creep.moveTo(target, {visualizePathStyle: {stroke: '#ffffff'}, ignoreCreeps: (creep.mem.mS % 20) < 3, range: 1})

					// Maybe fill others?
					// if (target.structureType == STRUCTURE_EXTENSION) {

					// }

					// It's possible a harvester extension is unreachable.
					if (moveRet == ERR_NO_PATH || creep.mem.mS >= (2 + (Math.random() < 0.5 ? 1 : 0))) {
						creep.mem.dTgt = undefined;
						delete creep.mem.path
					}

					if (creep.mem.mS > 5) {
						creep.mem.dTgt = undefined;
						delete creep.mem.path
					}

					// Fill one, fill any
					if (target.structureType == STRUCTURE_EXTENSION) {
						if (creep.pos.x > 0 && creep.pos.x < 49 && creep.pos.y > 0 && creep.pos.y < 49) {
							var closeTarget = creep.pos.findFirstInRange(FIND_MY_STRUCTURES, 1, {
								filter: function(struct) {
									return struct.structureType == STRUCTURE_EXTENSION && struct.energy < struct.energyCapacity;
								}
							});
							if (closeTarget) {
								if (creep.transfer(closeTarget, RESOURCE_ENERGY) == OK) {
									let delta = Math.min(creep.carry[RESOURCE_ENERGY], closeTarget.energyCapacity - closeTarget.energy);
									// Game.haulerTransferredEnergy += delta
									// creep.room.haulerTransferredEnergy += delta
								}
							}
						}
					}
				}
				else if (!secondCall) {
					let willNotComplete = creep.getStoreUsedCapacity() > target.energyCapacity - target.energy
					let ret = creep.transferAndUpdateCarry(target, RESOURCE_ENERGY);
					if (ret == OK) {
						if (willNotComplete) {
							var targets = roomAI.getEnergyPriorityTargets(creep.room);
							var newTarget = creep.pos.findClosestByRange(targets);

							/*if (newTarget.structure.structureType == STRUCTURE_CONTAINER && !creep.room.mem.ownedCreeps["upgrader"].length) {
								creep.mem.dTgt = undefined;
							}
							else*/ if (newTarget) {
								creep.mem.dTgt = newTarget.id;
								newTarget.expectedEnergy = creep.getStoreUsedCapacity() + (newTarget.expectedEnergy || 0)

								// var moveRet = creep.moveTo(newTarget, {visualizePathStyle: {stroke: '#ffffff'}, ignoreCreeps: (creep.mem.mS % 20) < 3, range: 1});
								var moveRet = creep.cachedMoveTo(newTarget, 1, moveOptions);
								if (moveRet == ERR_NO_PATH) {
									creep.mem.dTgt = undefined;
									delete creep.mem.path
								}
							}
							else if (!roomAI.isEnergyEndPoint(target)) {									
								creep.mem.dTgt = undefined;
								delete creep.mem.path
								creep.mem.f = 2;
							}
						}
						// Unless there's been a collision we can now move back to spawn. Collisions will be rare and should only cause momentary confusion...
						else {
							this.runBaseManager(creep, true, true)
						}
					}
					else {
						creep.mem.dTgt = undefined
						delete creep.mem.path
					}
				}
			}
			// Nowhere to drop. Nap.
			else {
				if (creep.getStoreUsedCapacity() == creep.carryCapacity) {
					if (Game.cpu.bucket > 9250 && Memory.rooms[creep.mem.sR].ownedCreeps["baseManager"] && Memory.rooms[creep.mem.sR].ownedCreeps["baseManager"].length == 1) {
						creep.renew = 1;
						return this.runRenewer(creep, false)
					}
					else {
						let heavy = Game.time - (creep.room.mem.spawningHeavyMission || -2000) < 2000
						if (!heavy && creep.room.controller.level == 8) {
							delete creep.mem.path
							creep.mem.wT = Game.time + 10
						}
					}
				}
				else if (creep.getStoreUsedCapacity() <= creep.carryCapacity / 2) {
					creep.mem.f = 2;
				}
			}
		}

		if (creep.getStoreUsedCapacity() != creep.carryCapacity) {
			if (creep.room.storage && creep.pos.isNearToPos(creep.room.storage.pos)) {
				let ret = creep.withdraw(creep.room.storage, RESOURCE_ENERGY);
				// We've changed weight. Path will be invalid now.
				if (ret == OK && creep.getStoreUsedCapacity() - creep.carryCapacity >= 50) {
					creep.mem.path = undefined
				}
			}
		}


		creep.grabBonusEnergy();
	},

	runStorageSitter: function(creep, noMineralRun) {
		if (creep.pos.roomName != creep.mem.sR) {
			creep.cachedMoveTo(new RoomPosition(25, 25, creep.mem.sR), 20);
			return;
		}
		if (creep.pos.x != creep.room.mem.storageBatteryX || creep.pos.y != creep.room.mem.storageBatteryY) {
			creep.cachedMoveTo(new RoomPosition(creep.room.mem.storageBatteryX, creep.room.mem.storageBatteryY, creep.mem.sR), 0);
			return;
		}

		if (creep.mem.wT != undefined && Game.time < creep.mem.wT) {
			return;
		}

		if (creep.mem.pTX) {
			delete creep.mem.pTX
			delete creep.mem.pTY
			delete creep.mem.pTgtRoom
			delete creep.mem.pO
			delete creep.mem.path
			delete creep.mem.mS
			delete creep.mem.lP
		}

		let usedCapacity = creep.getStoreUsedCapacity()

		// But it won't set a fT if it comes back into here.
		if (usedCapacity == 0 && !noMineralRun) {
			creep.mem.f = 1;
			creep.mem.dTgt = undefined;
			creep.mem.mR = 0;

			// console.log("A", creep.name, creep.room.storage, creep.room.terminal)

			if (creep.room.storage && creep.room.terminal && creep.ticksToLive > 5) {
				// wT is set when I find there's nothing useful to do with energy
				// Trigger a mineral run no matter what after that
				if (Game.time == creep.mem.wT) {
					creep.mem.mR = 1;
					creep.mem.fT = undefined
				}
				else {					
					if (creep.room.storage.store[RESOURCE_ENERGY] > 200000 && creep.room.terminal.store[RESOURCE_ENERGY] > 30000) {
						if (creep.room.energyCapacity == creep.room.energyCapacityAvailable) {
							if (Math.random() < 0.9) {
								creep.mem.mR = 1;
								creep.mem.fT = undefined
							}
						}
						else {
							if (Math.random() < 0.5) {
								creep.mem.mR = 1;
								creep.mem.fT = undefined
							}
						}
					}
					else {
						if (creep.room.energyCapacity == creep.room.energyCapacityAvailable) {
							if (Math.random() < 0.5) {
								creep.mem.mR = 1;
								creep.mem.fT = undefined
							}
						}
						else {
							if (Math.random() < 0.2) {
								creep.mem.mR = 1;
								creep.mem.fT = undefined
							}
						}
					}
				}
			}

		}

		if (creep.mem.f && usedCapacity > 0) {
			creep.mem.f = 0;
			// creep.mem.fT = undefined;
		}
		if (creep.mem.mR && creep.carry.energy > 0 && !creep.mem.factoryTarget) {
			creep.mem.mR = 0;
			creep.mem.fT = undefined;
		}
		if (!creep.mem.mR && creep.carry.energy != usedCapacity) {
			creep.mem.mR = 1;
			creep.mem.f = 0;
			creep.mem.fT = undefined;
		}

		let acted = false;

		if(creep.mem.f) {
			// if (creep.room.name == "W2S36") console.log(creep, creep.mem.mineralRun)
			if (creep.mem.mR) {
				if (creep.mem.fT == undefined) {
					let target = undefined;


					let factoryResources = {};
					if (creep.room.factory) {
						if (creep.room.mem.factoryTarget) {
							for (let key in COMMODITIES[creep.room.mem.factoryTarget].components) {
								factoryResources[key] = COMMODITIES[creep.room.mem.factoryTarget].components[key];
							}
						}
						if (creep.room.mem.factoryTargetPower) {
							for (let key in COMMODITIES[creep.room.mem.factoryTargetPower].components) {
								factoryResources[key] = Math.max((factoryResources[key] || 0), COMMODITIES[creep.room.mem.factoryTargetPower].components[key]);
							}
						}
						if (creep.room.factory.store.getFreeCapacity() > 1000) {
							for (let i = 1; i <= 5; i++) {								
								for (var resourceType in factoryResources) {
									if (creep.room.factory.store.getUsedCapacity(resourceType) < factoryResources[resourceType] * i) {
										let storageAmount = creep.room.storage ? creep.room.storage.store.getUsedCapacity(resourceType) : 0;
										let terminalAmount = creep.room.terminal ? creep.room.terminal.store.getUsedCapacity(resourceType) : 0;

										if (terminalAmount || storageAmount) {								
											if (terminalAmount <= 5 * storageAmount) {
												target = creep.room.storage;
											}
											else {
												target = creep.room.terminal;
											}
											creep.mem.fT = target.id
											creep.mem.resourceCarry = resourceType
											creep.mem.factoryTarget = 1
											i = 6;
											break;
										}
									}
								}
							}
						}
						// if (creep.room.name == "W2S36") console.log(creep, JSON.stringify(factoryResources), creep.mem.resourceCarry, creep.mem.factoryTarget, creep.mem.fT)
					}

					// if (creep.room.name == "W2S36") console.log(creep, JSON.stringify(factoryResources))



					if (!target) {
						let fillNuker;
						if (creep.room.controller && creep.room.controller.my && creep.room.controller.level == 8 && intelAI.getMaxHate() > 10000 && (!Memory.season || (Memory.enabledNukers || []).includes(creep.room.name))) {
							let nuker = creep.room.nuker;
							if (nuker) {
								if (nuker.ghodium < nuker.ghodiumCapacity) {
									fillNuker = true;
								}
							}
						}

						let terminalFull = creep.room.terminal && creep.room.terminal.store.getUsedCapacity() > 250000
						for (let step = 0; step < 2; step++) {							
							for (var resourceType of (step == 0 ? RESOURCES_ALL : RESOURCES_ALL.slice().reverse())) {
								if (resourceType == RESOURCE_ENERGY) continue;
								// console.log(resourceType, creep.room.terminal.store[resourceType], creep.room.storage.store[resourceType])

								// Remember to duplicate below!!!

								// If something can be made, don't store so much. We want lots of base minerals as often
								// NPCs trade them in big spikes. Need a gap so that we don't swap between them all the time.
								var minInTerminal = resourceType.length > 1 ? 2000 : (terminalFull ? 8000 : 13000);
								var maxInTerminal = resourceType.length > 1 ? (terminalFull ? 4000 : 6000) : (terminalFull ? 14000 : 18000);


								let maxInFactory;
								if (step == 1 || (COMMODITIES[resourceType] && COMMODITIES[resourceType].components.length > 2)) {
									maxInFactory = 0;
								}
								else {
									maxInFactory = 3000;
								}

								if (fillNuker && resourceType == RESOURCE_GHODIUM) {
									if (creep.room.factory && (creep.room.factory.store[resourceType] || 0) > maxInFactory && !factoryResources[resourceType]) {
										target = creep.room.factory;
									}
									else if ((creep.room.terminal.store[RESOURCE_GHODIUM] || 0) > 0) {
										target = creep.room.terminal;
									}
									else if ((creep.room.storage.store[RESOURCE_GHODIUM] || 0) > 0) {
										target = creep.room.storage;
									}
								}
								else {
									if (creep.room.factory && (creep.room.factory.store[resourceType] || 0) > maxInFactory && !factoryResources[resourceType]) {
										target = creep.room.factory;
									}
									else if ((creep.room.terminal.store[resourceType] || 0) < minInTerminal && creep.room.storage.store[resourceType]) {
										target = creep.room.storage
									}
									else if ((creep.room.terminal.store[resourceType] || 0) > maxInTerminal) {
										target = creep.room.terminal
									}
								}


								if(target) {
									step = 2;
									creep.mem.fT = target.id
									creep.mem.resourceCarry = resourceType
									break;
								}
							}
						}
					}
					if (!target) {
						creep.mem.mR = 0;
						return this.runStorageSitter(creep, true);

						// creep.mem.wT = Game.time + 2
					}
				}
				if(creep.mem.fT) {
					var target = Game.getObjectById(creep.mem.fT)
					var ret = creep.withdraw(target, creep.mem.resourceCarry)
					if (ret != OK) {
						creep.mem.fT = undefined;
					}
				}
			}
			else {
				// TODO: This seems... overcomplicated if the only targets are terminal/storage/factory.
				let targets = creep.room.getStorageBatteryStructures()

				var maxPriority = 0;
				var priorityEnergy = undefined;

				for(var structureIdx in targets) {
					var structure = targets[structureIdx];
					if (structure) {
						var priority = roomAI.getEnergyPriorityForStructure(structure);
						if (priority > maxPriority) {
							maxPriority = priority;
							priorityEnergy = structure;
						}
					}
				}

				let target;
				if (priorityEnergy) {
					let sourceTargets = _.filter(targets, function(structure) {
						if (structure == priorityEnergy) {
							return false
						}
						// Try to keep a 5:1 ratio between terminal and storage in terms of picking
						if (structure.structureType == STRUCTURE_STORAGE && structure.room.terminal) {
							if (structure.store[RESOURCE_ENERGY] > structure.room.terminal.store[RESOURCE_ENERGY] * 5) {
								return true;
							}
						}
						else if (structure.structureType == STRUCTURE_STORAGE) {
							return (structure.store[RESOURCE_ENERGY] > 0)
						}
						if (structure.structureType == STRUCTURE_TERMINAL && structure.room.storage) {
							if (structure.store[RESOURCE_ENERGY] * 5 > structure.room.storage.store[RESOURCE_ENERGY]) {
								return true;
							}
						}
						if (structure.structureType == STRUCTURE_FACTORY && structure.room.storage && (structure.store[RESOURCE_ENERGY] > 800)) {
							if (!creep.room.mem.factoryTarget || !Object.keys(COMMODITIES[creep.room.mem.factoryTarget].components).includes(RESOURCE_ENERGY)) {
								return true;
							}
						}
						if (structure.structureType == STRUCTURE_LINK && roomAI.getEnergyPriorityForStructure(structure) < 0) {
						// if (structure.structureType == STRUCTURE_LINK && structure.room.effectiveLevel == 8) {
							if (structure.energy) {
							// if (structure.energy && structure.room.energyCapacityAvailable == structure.room.energyAvailable) {
								return true;
							}
						}
						return false;
					});

					
					if (sourceTargets.length == 1) {
						target = sourceTargets[0];
					}
					else {
						target = _.sample(sourceTargets)
					}
				}

				if (target) {
					creep.mem.fT = target.id
					acted = true;
					ret = creep.withdraw(target, RESOURCE_ENERGY);
				}
				else {
					let heavy = Game.time - (creep.room.mem.spawningHeavyMission || -2000) < 2000
					if (!heavy && !creep.room.upgradeFocus) {
						creep.mem.wT = Game.time + 20 - Math.round((Game.cpu.bucket + Memory.stats.avgBucket) / 1000)
					}
				}
			}
		}
		else {
			if (creep.mem.mR) {
				let target = undefined

				let factoryResources = {}
				if (creep.room.factory) {
					if (creep.room.mem.factoryTarget) {
						for (let key in COMMODITIES[creep.room.mem.factoryTarget].components) {
							factoryResources[key] = COMMODITIES[creep.room.mem.factoryTarget].components[key];
						}
					}
					if (creep.room.mem.factoryTargetPower) {
						for (let key in COMMODITIES[creep.room.mem.factoryTargetPower].components) {
							factoryResources[key] = Math.max((factoryResources[key] || 0), COMMODITIES[creep.room.mem.factoryTargetPower].components[key]);
						}
					}
				}


				for (var resourceType in factoryResources) {
					if (creep.mem.resourceCarry == resourceType && creep.room.factory.store.getUsedCapacity(resourceType) < factoryResources[resourceType] * 5) {
						target = creep.room.factory
						break;
					}
				}

				if (!target) {			
					if (creep.room.controller && creep.room.controller.my && creep.room.controller.level == 8 && creep.mem.resourceCarry == RESOURCE_GHODIUM && intelAI.getMaxHate() > 10000 && (!Memory.season || (Memory.enabledNukers || []).includes(creep.room.name))) {
						let nuker = creep.room.nuker;
						if (nuker && nuker.ghodium < nuker.ghodiumCapacity) {
							target = nuker;
						}
					}
				}

				if (!target) {
					let terminalFull = creep.room.terminal && creep.room.terminal.store.getUsedCapacity() > 250000

					// See above
					var minInTerminal = creep.mem.resourceCarry && creep.mem.resourceCarry.length > 1 ? 2000 : (terminalFull ? 8000 : 13000);
					var maxInTerminal = creep.mem.resourceCarry && creep.mem.resourceCarry.length > 1 ? (terminalFull ? 4000 : 6000) : (terminalFull ? 14000 : 18000);


					if (creep.room.terminal && (creep.room.terminal.store[creep.mem.resourceCarry] || 0) < minInTerminal) {
						target = creep.room.terminal
					}
					else {
						target = creep.room.storage
					}
					// console.log(creep, creep.mem.resourceCarry,  (creep.room.terminal.store[creep.mem.resourceCarry] || 0), minInTerminal, target)
				}

				if (target) {
					var ret = creep.transferFirst(target);
					// var ret = creep.transferFirst(target);
					if (ret == ERR_INVALID_TARGET || ret == ERR_FULL || ret == ERR_NOT_ENOUGH_RESOURCES) {
						console.log("!!------ STORAGE SITTER ISSUE 1", creep.name, creep.room.name, ret, creep.mem.resourceCarry, target)
						if (target == creep.room.terminal) {
							ret = creep.transferFirst(creep.room.storage);
						}
						else {
							ret = creep.transferFirst(creep.room.terminal);
						}
					}
					else if (ret == OK) {
						creep.mem.factoryTarget = undefined;
						creep.mem.resourceCarry = undefined;
					}
					else {
						console.log("!!------ STORAGE SITTER ISSUE 2", creep.name, creep.room.name, ret, creep.mem.resourceCarry, target)
					}
				}
				else {
					let heavy = Game.time - (creep.room.mem.spawningHeavyMission || -2000) < 2000
					if (!heavy && !creep.room.upgradeFocus) {
						creep.mem.wT = Game.time + 10 - Math.round(Game.cpu.bucket / 1000)
					}
				}

			}
			else {
				// Todo, use lookforat - faster.
				var targets = creep.room.getStorageBatteryStructures();

				var maxPriority = 0;
				var priorityEnergy = undefined;

				for(var structureIdx in targets) {
					var structure = targets[structureIdx];
					if (structure) {
						var priority = roomAI.getEnergyPriorityForStructure(structure);
						if (priority > maxPriority) {
							maxPriority = priority;
							priorityEnergy = structure;
						}
					}
				}

				if (!priorityEnergy || priorityEnergy.id == creep.mem.fT) {
					creep.mem.wT = Game.time + 10 - Math.round(Game.cpu.bucket / 1000)

					if (Math.random() < 0.5) {
						delete creep.mem.fT
					}
				}
				else {
					priorityEnergy.expectedEnergy = creep.carry.energy + (priorityEnergy.expectedEnergy || 0)

					acted = true;
					creep.transfer(priorityEnergy, RESOURCE_ENERGY);
				}
			}
		}

		if (!creep.mem.mR && !acted) {
			creep.grabBonusEnergy();
		}
	},


	// TODO: Finish up
	runLootFetcher: function(creep) {
		if (!creep.mem.f && creep.getStoreUsedCapacity() == 0) {
			creep.mem.f = 1;
			creep.mem.dTgt = undefined;
		}
		if (creep.mem.f && creep.getStoreUsedCapacity() == 0) {
			creep.mem.f = 0;
			creep.mem.fT = undefined;
		}

		if (creep.mem.f) {
			if (creep.mem.fT && Game.getObjectById(creep.mem.fT)) {

			}
	 		else if (Game.rooms[creep.mem.targetRoom]) {

	 		}
	 		else {
				creep.cachedMoveTo(new RoomPosition(25, 25, creep.mem.targetRoom), 20);
			}
		}
		else {
			let moveOptions;
			if (creep.room.dangerous) {
				moveOptions = {"avoidEnemyRooms" : 1, "avoidHostiles" : 2, "maxDT" : 1.5, "minKD" : -0.5};
			}
			else {
				moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.5, "minKD" : -0.5};
			}

			if (creep.mem.sR != creep.room.name) {
	 			if (Game.rooms[creep.mem.sR] && Game.rooms[creep.mem.sR].storage) {
	 				creep.cachedMoveTo(Game.rooms[creep.mem.sR].storage, 1, moveOptions);
	 			}
	 			else {
					creep.cachedMoveTo(new RoomPosition(25, 25, creep.mem.sR), 20, moveOptions);
	 			}
			}
			else {
				var target = creep.room.storage;
				if(target) {
					var ret = creep.transferFirst(target)
					if(ret == ERR_NOT_IN_RANGE) {
						creep.cachedMoveTo(target, 1);
					}
				}
				else {
					// Eh wtf.
					if (creep.room.controller && creep.room.controller.my) {						
						changeCreepRole(creep, "fetcher");
					}
					return this.runFetcher(creep)
				}
			}
		}
	},

	runTransporter: function(creep) {
		if (!creep.mem.f && creep.getStoreUsedCapacity() == 0) {
			creep.mem.f = 1;
			creep.mem.dTgt = undefined;
		}
		if (creep.mem.f && creep.getStoreUsedCapacity() > (2 * creep.carryCapacity) / 3) {
			creep.mem.f = 0;
			creep.mem.fT = undefined;
		}

		if (creep.mem.f) {
			if (creep.ticksToLive < (creep.mem.timeToDest || 100)) {
				if (creep.room.controller && creep.room.controller.my) {
					creep.mem.sR = creep.room.name;
				}

				changeCreepRole(creep, "recycler")
				//if (creep.mem.ID)
				return this.runRecycler(creep)
			}
	 		if (creep.mem.sR != creep.room.name) {
	 			if (Game.rooms[creep.mem.sR] && Game.rooms[creep.mem.sR].storage) {
	 				creep.cachedMoveTo(Game.rooms[creep.mem.sR].storage, 1);
	 			}
	 			else {
					creep.cachedMoveTo(new RoomPosition(25, 25, creep.mem.sR), 20);
	 			}
			}
			else {
				var target;
				if (creep.room.terminal && creep.room.terminal.store[RESOURCE_ENERGY]) {
					target = creep.room.terminal;
				}
				if (creep.room.storage && (!target || creep.pos.inRangeToPos(creep.room.storage.pos, 1)) && creep.room.storage.store[RESOURCE_ENERGY]) {
					target = creep.room.storage;
				}

				if (target) {
					if (creep.withdraw(target, RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
						creep.cachedMoveTo(target, 1);
					}
				}
			}
		}
		else {
			let moveOptions;
			if (creep.room.dangerous) {
				moveOptions = {"avoidEnemyRooms" : 1, "avoidHostiles" : 2, "maxDT" : 1.25, "minKD" : -0.5};
			}
			else {
				moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.25, "minKD" : -0.5};
			}

			if (creep.mem.targetRoom != creep.room.name) {
	 			if (Game.rooms[creep.mem.targetRoom] && Game.rooms[creep.mem.targetRoom].storage) {
	 				creep.cachedMoveTo(Game.rooms[creep.mem.targetRoom].storage, 1, moveOptions);
	 			}
	 			else if (Game.rooms[creep.mem.targetRoom] && Game.rooms[creep.mem.targetRoom].containers.length) {
	 				creep.cachedMoveTo(Game.rooms[creep.mem.targetRoom].containers[0], 1, moveOptions);
	 			}
	 			else {
					creep.cachedMoveTo(new RoomPosition(25, 25, creep.mem.targetRoom), 20, moveOptions);
	 			}
			}
			else {
				var target = Game.getObjectById(creep.mem.dTgt)

				if (!target /*&& creep.room.storage*/) {
					let potentialTargets = creep.room.find(FIND_STRUCTURES, {
						filter: (structure) => {
							if ((roomAI.isDropoffPoint(structure) || !structure.room.controller.my) && structure.structureType == STRUCTURE_CONTAINER) {
								if (structure.store.getUsedCapacity() < structure.storeCapacity - creep.carry.energy) {
									return true;
								}
							}
							if (structure.structureType == STRUCTURE_STORAGE) {
								return true;
							}
							return false;
						}
					});

					target = _.sample(potentialTargets)
				}

				if (!target /*&& creep.room.storage*/) {
					let potentialTargets = creep.room.find(FIND_STRUCTURES, {
						filter: (structure) => {
							if ((roomAI.isDropoffPoint(structure) || !structure.room.controller.my) && structure.structureType == STRUCTURE_CONTAINER) {
								if (structure.store.getFreeCapacity() > 0) {
									return true;
								}
							}
							if (structure.structureType == STRUCTURE_STORAGE) {
								return true;
							}
							return false;
						}
					});

					target = _.sample(potentialTargets)
				}

				if (!target) {			
					for (let otherCreep of creep.room.find(FIND_MY_CREEPS)) {
						if (otherCreep.mem.role == "pioneer" || otherCreep.mem.role == "intershardPioneer") {
							target = otherCreep
							break
						}
					}
				}

				if (!target) {
					target = creep.room.spawns[0]
				}

				if (!target) {			
					for (let otherCreep of creep.room.find(FIND_MY_CREEPS)) {
						if (otherCreep.mem.role == "upgrader" || otherCreep.mem.role == "repairer"  || otherCreep.mem.role == "builder") {
							target = otherCreep
							break
						}
					}
				}

				if (target) {
					creep.mem.dTgt = target.id
					var ret = creep.transfer(target, RESOURCE_ENERGY)
					if(ret == ERR_NOT_IN_RANGE) {
						creep.cachedMoveTo(target, 1);
					}
					else if (ret == OK || target == creep.room.spawns[0]) {
						// Should live long enough to go back and return comfortably
						// But actually, this is shit. Just recycle.
						/*if (creep.ticksToLive > 3 * (1500 - creep.ticksToLive) && creep.mem.role != "isTransporter") {
							creep.mem.f = 1;
							// It's all lies
							creep.carry.energy = 0;
							return this.runTransporter(creep)
						}
						else*/ 
						if (creep.mem.timeToDest === undefined) {
							creep.mem.timeToDest = CREEP_LIFE_TIME - creep.ticksToLive
						}

						if (creep.mem.timeToDest < (Memory.season5 ? 272 : 140)) {

						}						
						else if (creep.mem.role == "unclaimTransporter") {
							if (creep.ticksToLive < 200) {
								changeCreepRole(creep, "recycler")
								return this.runRecycler(creep)
							}
						}
						else {						
							if (creep.room.controller && creep.room.controller.my) {
								creep.mem.sR = creep.room.name;
								if ((creep.room.mem.spawnUtilization > 0.7 + Math.random() * 0.1 || (creep.room.mem.ownedCreeps["fetcher"] || []).length < 2) && 
									!creep.room.mem.smallHaulers && !creep.room.mem.mediumHaulers && !creep.room.mem.verySmallHaulers &&
									(global.fetcherTargetCounts && global.fetcherTargetCounts[creep.room.name] && Math.max(2, global.fetcherTargetCounts[creep.room.name]) > (creep.room.mem.ownedCreeps["fetcher"] || []).length) &&
									(!creep.room.mem.notEnoughEnergyToSpawn || Math.random() < 0.5)) {
									changeCreepRole(creep, "fetcher");
								}
								else if (creep.room.spawns.length) {
									creep.mem.sR = creep.room.name;
									// if (Memory.season && creep.room.storage) {
									// 	changeCreepRole(creep, "seasonFetcher");	
									// }
									// else {
										changeCreepRole(creep, "recycler");	
									// }
								}
							}
							// return //this.runFetcher(creep)
						}

						if (ret != OK && Math.random() < 0.2) {
							delete creep.mem.dTgt
						}
					}
					else {
						delete creep.mem.dTgt	
					}
				}
				else if (creep.mem.role != "unclaimTransporter") {
					if (creep.room.controller && creep.room.controller.my) {
						creep.mem.sR = creep.room.name;
						if (creep.room.effectiveLevel >= 4 &&
							(creep.room.mem.spawnUtilization > 0.7 + Math.random() * 0.1 || (creep.room.mem.ownedCreeps["fetcher"] || []).length < 2) && 
							!creep.room.mem.smallHaulers && !creep.room.mem.mediumHaulers && !creep.room.mem.verySmallHaulers &&
							 (global.fetcherTargetCounts && global.fetcherTargetCounts[creep.room.name] && Math.max(2, global.fetcherTargetCounts[creep.room.name]) > (creep.room.mem.ownedCreeps["fetcher"] || []).length) &&
							 (!creep.room.mem.notEnoughEnergyToSpawn || Math.random() < 0.5)) {
							changeCreepRole(creep, "fetcher");
						}
						else if (creep.room.spawns.length) {
							// if (Memory.season && creep.room.storage) {
							// 	changeCreepRole(creep, "seasonFetcher");	
							// }
							// else {
								changeCreepRole(creep, "recycler");	
							// }
						}
					}
					return //this.runFetcher(creep)
				}
			}
		}

		creep.grabBonusEnergy()
	},


	runHeavyTransporter: function(creep) {
		let moveOptions;
		if (creep.room.dangerous) {
			moveOptions = {"avoidEnemyRooms" : 1, "avoidHostiles" : 2, "maxDT" : 1.5, "minKD" : -0.5};
		}
		else {
			moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.5, "minKD" : -0.5};
		}

		if (creep.mem.targetRoom != creep.room.name) {
	 		if (Game.rooms[creep.mem.targetRoom] && Game.rooms[creep.mem.targetRoom].storage) {
	 			creep.cachedMoveTo(Game.rooms[creep.mem.targetRoom].storage, 1, moveOptions);
	 		}
	 		else {
				creep.cachedMoveTo(new RoomPosition(25, 25, creep.mem.targetRoom), 20, moveOptions);
	 		}
		}
		else {
			var target = creep.room.terminal || creep.room.storage;
			if(target) {
				var ret = creep.transferFirst(target)
				if(ret == ERR_NOT_IN_RANGE) {
					creep.cachedMoveTo(target, 1);
				}
				else if (ret == OK) {
					if (creep.room.controller && creep.room.controller.my) {
						creep.mem.sR = creep.room.name;
						changeCreepRole(creep, "recycler");	
					}
				}
			}
			else {
				if (creep.room.controller && creep.room.controller.my) {						
					creep.mem.sR = creep.room.name;
					changeCreepRole(creep, "recycler");	
				}
			}
		}

		if (creep.room.dangerous || creep.hits != creep.hitsMax) {
			creep.heal(creep)
		}
	},

	runDepositMiner(creep) {
		// We don't even move. Wild.
		let depositPos = new RoomPosition(creep.mem.target.x, creep.mem.target.y, creep.mem.target.roomName);

		creep.valuableCreepExtraHate();

		if (!Game.rooms[depositPos.roomName]) return

		let depositObj = depositPos.lookFor(LOOK_DEPOSITS)[0];

		if (depositObj && depositObj.cooldown && depositObj.cooldown < 3 && creep.room.name == depositPos.roomName && creep.pos.isNearToPos(depositPos)) {
			creep.mem.hpt = creep.mem.hpt || creep.getBoostModifiedHarvest() * HARVEST_DEPOSIT_POWER / HARVEST_POWER

			// No space, try to pass off to a neighbour so we can harvest when the time comes
			if (creep.store.getFreeCapacity() < creep.mem.hpt) {
				for (let teamName of creep.mem.teamCreepNames) {
					if (!Game.creeps[teamName]) continue
					if (!creep.pos.isNearToPos(Game.creeps[teamName].pos)) continue

					Game.creeps[teamName].mem.hpt = Game.creeps[teamName].mem.hpt || Game.creeps[teamName].getBoostModifiedHarvest() * HARVEST_DEPOSIT_POWER / HARVEST_POWER

					if (Game.creeps[teamName].store.getFreeCapacity() >= Game.creeps[teamName].mem.hpt * 2) {
						creep.transferFirst(Game.creeps[teamName], Math.min(creep.store.getUsedCapacity(), Game.creeps[teamName].store.getFreeCapacity() - Game.creeps[teamName].mem.hpt))
						break
					}
				}
			}
		}

		// Cycle my buddies, if we're all ready, hit
		if (depositObj && !depositObj.cooldown && creep.room.name == depositPos.roomName && creep.pos.isNearToPos(depositPos)) {
			let numReady = 0;
			let numNotReady = 0;
			let force = 0
			for (let teamName of creep.mem.teamCreepNames) {
				// All that can harvest
				if (Game.creeps[teamName] && 
					Game.creeps[teamName].room.name == depositPos.roomName && 
					Game.creeps[teamName].pos.isNearToPos(depositPos) &&
					Game.creeps[teamName].getNumOfBodyPart(WORK) && 
					Game.creeps[teamName].store.getFreeCapacity() >= (Game.creeps[teamName].mem.hpt || Game.creeps[teamName].getBoostModifiedHarvest() * HARVEST_DEPOSIT_POWER / HARVEST_POWER)) {
					numReady++;
				}
				// All the guys who aren't in position yet.
				else if (Game.creeps[teamName] && !Game.creeps[teamName].spawning && Game.creeps[teamName].store.getFreeCapacity() && Game.creeps[teamName].role == "depositMiner") {
					if (Game.creeps[teamName].pos.getWorldRangeToPos(depositPos) < depositObj.lastCooldown / 2) {
						numNotReady++;
					}
				}

				if (Game.creeps[teamName] && Game.creeps[teamName].ticksToLive == 1) {
					force = 1
				}
			}

			// Hit it!
			if ((force || numNotReady == 0 || numReady == depositPos.countAccessibleTiles() || depositObj.lastCooldown < 20) && creep.store.getFreeCapacity() >= (creep.mem.hpt || creep.getBoostModifiedHarvest() * HARVEST_DEPOSIT_POWER / HARVEST_POWER)) {
				creep.harvest(depositObj)

				creep.mem.hpt = creep.mem.hpt || creep.getBoostModifiedHarvest() * HARVEST_DEPOSIT_POWER / HARVEST_POWER

				if (creep.store.getFreeCapacity() >= creep.mem.hpt) {					
					Memory.commoditiesManager.depositStats.harvested[depositObj.depositType] += (1 - constants.DEPOSIT_STATS_ALPHA) * creep.mem.hpt
					creep.mem.harvested = 1;
				}
			}
		}
	},

	runDepositTug(creep) {
		let moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.5, "minKD" : -0.5};
		let buddy = Game.creeps[creep.mem.pairedName];

		if (creep.mem.tugJobDone) {
			// if (Memory.stats.yieldPerCPU != 0 || creep.room.name != creep.mem.sR || !creep.pos.findFirstInRange(FIND_MY_SPAWNS, 5)) {
				return this.runRecycler(creep)
			// }
			// else {
			// 	creep.mem.readyToTug = 1
			// 	delete creep.mem.path
			// 	return
			// }
		}

		if (!buddy || buddy.spawning) {
			if (Math.random() < 0.05) {
				creep.move(Math.ceil(Math.random() * 8))
			}
		}
		else if (creep.pos.isNearToRoomObject(buddy) || util.isEdgeOfRoom(creep.pos) || util.isEdgeOfRoom(buddy.pos)) {
			let depositPos = new RoomPosition(creep.mem.target.x, creep.mem.target.y, creep.mem.target.roomName);

			// Budy wants boosts
			if (buddy.getBoosts()) {
				let boost = Object.keys(buddy.mem.targetBoosts)[0]
				for (let lab of buddy.room.labs) {
					if (!buddy.room.mem.labMemory || !buddy.room.mem.labMemory[lab.id]) continue;

					if (util.isSameBoostType(lab.mineralType, boost) && buddy.room.mem.labMemory[lab.id].lockedForBoosts) {
						if (creep.pos.isNearToPos(lab.pos)) {
							snakeAI.moveSnake([creep.name, creep.mem.pairedName], buddy.pos, moveOptions, 0, false, false)
							// console.log(creep, creep.room, "moving to swap with miner")
						}
						else {
							snakeAI.moveSnake([creep.name, creep.mem.pairedName], lab.pos, moveOptions, 1, false, false)
							// console.log(creep, creep.room, "moving to boost miner")
						}
						break;
					}
				}
			}
			// We're done here. Go recycle.
			else if (creep.room.name == depositPos.roomName && buddy.pos.isNearToPos(depositPos)) {
				// Actually, wait around and haul shit home first
				creep.mem.tugJobDone = 1
				creep.mem.travelRoom = creep.room.name
				creep.mem.travelTime = CREEP_LIFE_TIME - creep.ticksToLive

				if (creep.hasBodypart(CARRY)) {					
					creep.mem.origRole = creep.mem.role

					creep.mem.target = JSON.parse(JSON.stringify(buddy.mem.target))

					changeCreepRole(creep, "depositFetcher")
					return this.runDepositFetcher(creep)
				}
				//changeCreepRole(creep, "recycler")
				return this.runRecycler(creep)
			}
			else if (creep.room.name == depositPos.roomName && creep.pos.isNearToPos(depositPos)) {
				// Got to pull it into to the last step. Do that with a swap
				snakeAI.moveSnake([creep.name, creep.mem.pairedName], buddy.pos, moveOptions, 0, false, false)
			}
			else {
				// console.log(creep, buddy)
				snakeAI.moveSnake([creep.name, creep.mem.pairedName], depositPos, moveOptions, 1, false, false)
			}
		}
		else {
			creep.uncachedMoveTo(buddy, 1)
		}
	},	

	runDepositFetcher(creep) {
		if (creep.mem.wT) {
			if (Game.time >= creep.mem.wT) {
				creep.mem.wT = undefined;
			}
			else {
				return;
			}
		}

		let usedCap = creep.getStoreUsedCapacity();

		if (usedCap && creep.room.dangerous && creep.hits != creep.hitsMax) {
			creep.mem.f = 0
		}
		else if (!creep.mem.f && usedCap == 0) {
			creep.mem.f = 1;
		}
		else if (creep.mem.f && usedCap) {
			if (usedCap == creep.carryCapacity || creep.ticksToLive < (creep.mem.minReturnTime || 0) * 1.2) {
				creep.mem.f = 0;
			}
		}

		if (creep.mem.f) {
			let target = creep.mem.target;

			if (creep.room.name != target.roomName) {
				creep.cachedMoveTo(new RoomPosition(target.x, target.y, target.roomName), 4);

				if (creep.mem.path && creep.mem.path.length * 2 > creep.ticksToLive) {
					delete creep.movedThisTick
					delete creep.mem.ID
					changeCreepRole(creep, "fetcher");
					return this.runFetcher(creep)
				}
			}
			else {
				creep.mem.minReturnTime = creep.mem.minReturnTime || (CREEP_LIFE_TIME - creep.ticksToLive) + 25
				var droppedResouce = creep.pos.findClosestByRange(FIND_DROPPED_RESOURCES, {
					filter: (resource) => {
						return resource.resourceType !== RESOURCE_ENERGY;
					}
				});

				if (droppedResouce) {
					if (creep.pos.isNearToRoomObject(droppedResouce)) {
						creep.pickup(droppedResouce)
					}
					else {
						creep.uncachedMoveTo(droppedResouce, 1)
					}
					return 
				}


				let tombstone = creep.pos.findClosestByRange(FIND_TOMBSTONES, {
					filter: (stone) => {
						return stone.store.getUsedCapacity() > 0 && stone.store.getUsedCapacity() != stone.store[RESOURCE_ENERGY];
					}
				});

				if (tombstone) {
					if (creep.pos.isNearToRoomObject(tombstone)) {
						creep.withdrawFirst(tombstone)
					}
					else {
						creep.uncachedMoveTo(tombstone, 1)
					}
					return
				}

				// let miners = creep.room.find(FIND_MY_CREEPS, {
				// 	filter: (otherCreep) => {return otherCreep.mem.role == "depositMiner"}
				// });
				let roomCreeps = _.groupBy(creep.room.find(FIND_MY_CREEPS), function(c) {return c.mem.role});

				for (let otherFetcher of roomCreeps["depositFetcher"]) {
					if (otherFetcher.mem.f && otherFetcher.getStoreUsedCapacity() > creep.getStoreUsedCapacity()) {
						creep.cachedMoveTo(new RoomPosition(target.x, target.y, target.roomName), 4);
						return
					}
				}

				let targetMiners = creep.pos.findInRange(roomCreeps["depositMiner"], 1, {filter: (otherCreep) => {return otherCreep.getStoreUsedCapacity() > 0}});
				if (targetMiners.length) {
					for (let targetMiner of targetMiners) {
						targetMiner.transferFirst(creep)
					}
					return
				}

				let targetMiner = creep.pos.findClosestByRange(roomCreeps["depositMiner"], {filter: (otherCreep) => {return otherCreep.getStoreUsedCapacity() > otherCreep.store.getCapacity() - (otherCreep.mem.hpt || 0)}});
				
				if (!targetMiner) {
					targetMiner = creep.pos.findClosestByRange(roomCreeps["depositMiner"], {filter: (otherCreep) => {return otherCreep.getStoreUsedCapacity() > 0}});
				}

				if (targetMiner) {
					if (creep.pos.isNearToRoomObject(targetMiner)) {
						targetMiner.transferFirst(creep)
					}
					else {
						creep.uncachedMoveTo(targetMiner, 1, {avoidLocalCreeps: 1})
					}
				}
				else {
					let targetPos = new RoomPosition(target.x, target.y, target.roomName);
					if (creep.pos.isNearToPos(targetPos)) {
						creep.move(Math.ceil(Math.random() * 8))
					}
					else {
						let pos = new RoomPosition(target.x, target.y, target.roomName);
						if (!creep.pos.inRangeToPos(pos, 4)) {
							creep.cachedMoveTo(pos, 4);
						}
						else {
							let minCooldown = Infinity
							let deposits = creep.room.find(FIND_DEPOSITS)

							for (let deposit of deposits) {
								minCooldown = Math.min(minCooldown, deposit.cooldown)
								// if (minCooldown >= creep.ticksToLive) {
								// 	changeCreepRole(creep, "fetcher");
								// 	creep.mem.f = 0;
								// 	return this.runFetcher(creep)
								// }
							}
							creep.mem.wT = Math.min(Game.time + 10, Game.time + minCooldown)
						}
					}
				}
			}
		}
		else {
			if (creep.mem.dropRoom && creep.mem.sR != creep.mem.dropRoom) {
				_.pull(Memory.rooms[creep.mem.sR].ownedCreeps[creep.mem.role], creep.name)
				creep.mem.sR = creep.mem.dropRoom
				Memory.rooms[creep.mem.sR].ownedCreeps[creep.mem.role] = Memory.rooms[creep.mem.sR].ownedCreeps[creep.mem.role] || [];
				
				Memory.rooms[creep.mem.sR].ownedCreeps[creep.mem.role].push(creep.name)
			}
			if (creep.room.name != creep.mem.sR) {
				if (!creep.mem.notMakingItHome) {					
					if (Game.rooms[creep.mem.sR] && Game.rooms[creep.mem.sR].storage) {
						creep.cachedMoveTo(Game.rooms[creep.mem.sR].storage, 1);
					}
					else {
						creep.cachedMoveTo(new RoomPosition(25, 25, creep.mem.sR), 20);
					}
				}
				// Not going to make it home. Become a tombstone. 
				if (creep.mem.notMakingItHome || (creep.mem.path && creep.mem.path.length > creep.ticksToLive * 1.2 && creep.room.name == creep.mem.target.roomName)) {
					for (let otherCreep of creep.room.find(FIND_MY_CREEPS)) {
						if (otherCreep == creep) continue
						if (otherCreep.mem.role == creep.mem.role) {
							creep.suicide();
							break;
						}
					}
					if (!creep.mem.notMakingItHome) {
						creep.mem.notMakingItHome = creep.mem.path.length
						delete creep.mem.path
					}
				}
			}
			else {
				if (creep.mem.dTgt == undefined) {
					var dTgt = creep.pos.findClosestByPath(FIND_STRUCTURES, {
						filter: (structure) => {
							if ((structure.structureType == STRUCTURE_STORAGE || structure.structureType == STRUCTURE_TERMINAL)
								 && structure.store.getUsedCapacity() < structure.storeCapacity) {
								return true;
							}
							return false;
						}
					});

					if (!dTgt) {
						dTgt = creep.pos.findClosestByRange(FIND_STRUCTURES, {
							filter: (structure) => {
								if ((structure.structureType == STRUCTURE_STORAGE || structure.structureType == STRUCTURE_TERMINAL)
									 && structure.store.getUsedCapacity() < structure.storeCapacity) {
									return true;
								}
								return false;
							}
						});				
					}

					creep.mem.dTgt = dTgt.id
				}

				if (creep.mem.dTgt != undefined) {
					var target = Game.getObjectById(creep.mem.dTgt);
					var ret = creep.transferFirst(target);
					if(ret == ERR_NOT_IN_RANGE) {
						creep.cachedMoveTo(target, 1);
					}
					else if (ret == OK) {
						creep.mem.dTgt = undefined
						if (creep.mem.origRole == "depositTug" && Memory.stats.yieldPerCPU !== 0) {
							changeCreepRole(creep, "recycler")
							return this.runRecycler(creep)
						}
					}
					else {
						creep.mem.dTgt = undefined
					}
				}
			}
		}
	},	

	runDepositTroll(creep) {
		if (!creep.mem.reachedTargetRoom) {
			if (creep.room.name == creep.mem.targetRoom) {
				creep.mem.reachedTargetRoom = 1;		
			}
			creep.uncachedMoveTo(new RoomPosition(25, 25, creep.mem.targetRoom), 23, {avoidEnemyRooms: 1})
			return
		}

		if (util.isEdgeOfRoom(creep.pos)) {
			for (let room of Game.myRooms) {
				if (Game.map.getRoomLinearDistance(room.name, creep.room.name) < 9) {
					console.log("Deposit troll coming close to friendly rooms", creep.room.name)
					creep.suicide();
					return
				}
			}
		}

		let deposits = creep.room.find(FIND_DEPOSITS)

		for (let deposit of deposits) {
			if (deposit.cooldown < 0.99 * DEPOSIT_DECAY_TIME) {
				if (!creep.pos.isNearToPos(deposit.pos)) {
					creep.uncachedMoveTo(deposit, 1, {maxRooms: 1})
				}
				else {
					creep.harvest(deposit)
				}
				return
			}
		}

		// No deposits, move on
		let newRoomName = Game.map.describeExits(creep.room.name)[creep.mem.exitDir]
		creep.uncachedMoveTo(new RoomPosition(25, 25, newRoomName), 23, {avoidEnemyRooms: 1})

	},



	runSeasonWallDestroyer(creep) {
		creep.valuableCreepExtraHate();

		let targetRoomMem = Memory.rooms[creep.mem.targetRoom]

		// if (!Game.rooms[creep.mem.targetRoom]) {
		// 	if (creep.hasBodypart(MOVE)) {
		// 		if (targetRoomMem && targetRoomMem.dismantleWallPos) {
		// 			let pos = new RoomPosition(targetRoomMem.dismantleWallPos.x, targetRoomMem.dismantleWallPos.y, targetRoomMem.dismantleWallPos.roomName)
		// 			creep.uncachedMoveTo(pos, 1, {avoidEnemyRooms: 1})
		// 		}
		// 		else {
		// 			creep.uncachedMoveTo(new RoomPosition(25, 25, creep.mem.targetRoom), 22, {avoidEnemyRooms: 1})	
		// 		}
		// 	}
		// 	return
		// }

		let target
		if (Memory.season1) {
			target = Game.getObjectById(targetRoomMem.seasonWallsToRemove[targetRoomMem.seasonWallsToRemove.length - 1])
		}
		else {
			// There's a slight "which side are we on" issue
			if (Game.rooms[creep.mem.targetRoom]) {
				let walls = []		
				for (let wallId of targetRoomMem.seasonWallsToRemove) {
					walls.push(Game.getObjectById(wallId))
				}
				target = creep.pos.findClosestByRange(walls)
				if (target && creep.pos.isNearToPos(target.pos)) {
					targetRoomMem.dismantleWallPos = target.pos
				}
			}
			else {
				target = Game.getObjectById(targetRoomMem.seasonWallsToRemove[0])
			}
		}

		if (target) {
			let buddy = Game.creeps[creep.mem.pairedName];
			/*if ((creep.hits != creep.hitsMax || (buddy && buddy.hits != buddy.hitsMax)) && creep.hasBodypart(MOVE)) {
				let hostile = creep.findClosestByRange(creep.room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK]))
				if (hostile) {
					creep.uncachedMoveTo(hostile, 5, {flee: 1})
				}
			}
			else*/ if (creep.dismantle(target) == OK) {
				if (!creep.mem.ticksToArrival) {
					creep.mem.ticksToArrival = CREEP_LIFE_TIME - creep.ticksToLive
				}
			}
			/*else {
				if (creep.hasBodypart(MOVE) && !creep.pos.isNearToPos(target.pos)) {
					creep.uncachedMoveTo(target.pos, 1, {maxRooms:1, avoidEnemyRooms: 1})
				}
			}*/
		}
	},

	runSeasonWallGuard(creep) {
		creep.valuableCreepExtraHate();
		skirmisherRangedAttackAndHeal(creep, undefined, undefined)

		creep.mem.targetPos = Game.flags.QZAR_RANGED.pos
		creep.mem.targetRange = 0

		let flags = creep.pos.lookFor(LOOK_FLAGS);
		if (!flags[0] || flags[0].name != "QZAR_RANGED") {
			return
		}


	},
	runSeasonWallBuilderD(creep) {
		creep.valuableCreepExtraHate();

		creep.mem.targetPos = Game.flags.QZAR_DISMANTLE.pos
		creep.mem.targetRange = 0

		let flags = creep.pos.lookFor(LOOK_FLAGS);
		if (!flags[0] || flags[0].name != "QZAR_DISMANTLE") {
			return
		}

		let walls = creep.pos.findInRange(creep.room.constructedWalls, 1)
		for (let wall of walls) {
			if (wall.hits > 100e6) {
				creep.dismantle(wall)
				return
			}
		}
		console.log("Anti-qzar no wall to dismantle")
	},

	runSeasonWallBuilderR(creep) {
		creep.mem.targetPos = Game.flags.QZAR_REPAIR.pos
		creep.mem.targetRange = 0

		let flags = creep.pos.lookFor(LOOK_FLAGS);
		if (!flags[0] || flags[0].name != "QZAR_REPAIR") {
			return
		}

		// if (creep.store.getUsedCapacity()) {
		// 	creep.repair
		// }

		let pickedAmount = 0

		let drops = creep.pos.findInRange(FIND_DROPPED_RESOURCES, 1)
		for (let drop of drops) {
			if (drop.resourceType == RESOURCE_ENERGY) {
				creep.pickup(drop)
				pickedAmount += drop.amount
				break
			}
		}

		if (pickedAmount < creep.store.getCapacity()) {			
			let otherCreeps = creep.pos.findInRange(FIND_MY_CREEPS, 1)
			for (let otherCreep of otherCreeps) {
				if (otherCreep.mem.role == "seasonWallBuilderD" && otherCreep.store[RESOURCE_ENERGY]) {
					otherCreep.transfer(creep, RESOURCE_ENERGY)
				}
			}
		}

		if (!creep.store[RESOURCE_ENERGY]) {
			return
		}

		let minHits = Infinity
		let targetWall
		// A bit faster to use find structs as it uses look for at area
		let walls = creep.pos.findInRange(FIND_STRUCTURES, 3)

		for (let pass = 1; pass < 5; pass++) {			
			for (let wall of creep.pos.findInRange(FIND_STRUCTURES, 3)) {
				if (wall.structureType == STRUCTURE_WALL && wall.hits < minHits) {
					if (!creep.room.find(FIND_HOSTILE_CREEPS).length || wall.pos.findFirstInRange(FIND_HOSTILE_CREEPS, pass)) {
						let flags = wall.pos.lookFor(LOOK_FLAGS)
						let ignore = false;
						for (let flag of flags) {
							if (flag.name.startsWith("QZAR_IGNORE")) {
								ignore  = true
								break
							}
						}

						if (!ignore) {							
							targetWall = wall
							minHits = targetWall.hits
						}
					}
				}
			}
			if (targetWall) {
				break
			}
		}

		if (targetWall) {
			if (Math.random() < 0.001) {
				console.log("Anti-qzar wall hits", targetWall.hits)
			}
			creep.repair(targetWall)
		}
	},

	runSeasonTug(creep) {
		let moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.5, "minKD" : -0.5};
		let buddy = Game.creeps[creep.mem.pairedName];


		if (!buddy || buddy.spawning) {
			if (creep.mem.boostedPair && Game.time <= (creep.mem.maxRenewTime || Infinity)) {
				return this.runRenewer(creep, false)
			}
			if (Math.random() < 0.05) {
				creep.move(Math.ceil(Math.random() * 8))
			}
		}
		else if (creep.getBoosts()) {
			return
		}
		else if (creep.pos.isNearToRoomObject(buddy) || util.isEdgeOfRoom(creep.pos) || util.isEdgeOfRoom(buddy.pos)) {
			if (buddy && buddy.hits < buddy.hitsMax * 0.8 && creep.hasBodypart(HEAL)) {
				if (creep.pos.isNearToPos(buddy.pos)) {
					creep.heal(buddy)
				}
				else {
					creep.rangedHeal(buddy)
				}
				creep.healOrdersGiven = 1
				moveOptions.flee = 1
				snakeAI.moveSnake([creep.name, creep.mem.pairedName], creep.pos.findClosestByRange(creep.room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK])), moveOptions, 10, false, false)
				return
			}
			if (creep.hits < creep.hitsMax * 0.8 && creep.hasBodypart(HEAL)) {
				creep.heal(creep)
				creep.healOrdersGiven = 1
				moveOptions.flee = 1
				snakeAI.moveSnake([creep.name, creep.mem.pairedName], creep.pos.findClosestByRange(creep.room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK])), moveOptions, 10, false, false)
				return
			}
			if (creep.hasBodypart(HEAL)) {				
				if (buddy && buddy.pos.findFirstInRange(FIND_HOSTILE_CREEPS, 3)) {				
					if (creep.pos.isNearToPos(buddy.pos)) {
						creep.heal(buddy)
					}
					else {
						creep.rangedHeal(buddy)
					}
				}
				else if (buddy.hits != buddy.hitsMax) {
					creep.heal(creep)
				}
				else {
					creep.heal(creep)
				}
			}


			let targetRoomMem = Memory.rooms[creep.mem.targetRoom]

			let targetPos
			let targetRange

			if (buddy && buddy.mem.targetRange !== undefined) {
				targetRange = buddy.mem.targetRange
			}
			else {
				targetRange = 1
			}

			if (buddy && buddy.mem.targetPos) {
				targetPos = new RoomPosition(buddy.mem.targetPos.x, buddy.mem.targetPos.y, buddy.mem.targetPos.roomName)
			}
			// There's a slight "which side are we on" issue
			else if (Game.rooms[creep.mem.targetRoom]) {		
				let walls = []		
				for (let wallId of targetRoomMem.seasonWallsToRemove) {
					let obj = Game.getObjectById(wallId);
					if (obj) {
						walls.push(obj)
					}
				}
				if (creep.room.name == creep.mem.targetRoom && walls.length) {
					targetPos = (creep.pos.findClosestByPath(walls) || creep.pos.findClosestByWorldRange(walls)).pos
				}
				else {
					let cloststWall = creep.pos.findClosestByWorldRange(walls)
					if (cloststWall) {
						targetPos = cloststWall.pos
					}
					else {
						targetPos = targetRoomMem.dismantleWallPos
					}
				}
			}
			else {
				targetPos = targetRoomMem.dismantleWallPos
			}

			// moveOptions.direct = targetPos.roomName == "W9S10"
			// Buddy wants boosts
			if (buddy.getBoosts()) {
				let boost = Object.keys(buddy.mem.targetBoosts)[0]
				for (let lab of buddy.room.labs) {
					if (!buddy.room.mem.labMemory || !buddy.room.mem.labMemory[lab.id]) continue;

					if (util.isSameBoostType(lab.mineralType, boost) && buddy.room.mem.labMemory[lab.id].lockedForBoosts) {
						if (creep.pos.isNearToPos(lab.pos)) {
							snakeAI.moveSnake([creep.name, creep.mem.pairedName], buddy.pos, moveOptions, 0, false, false)
							// console.log(creep, creep.room, "moving to swap with miner")
						}
						else {
							snakeAI.moveSnake([creep.name, creep.mem.pairedName], lab.pos, moveOptions, 1, false, false)
							// console.log(creep, creep.room, "moving to boost miner")
						}
						break;
					}
				}
			}
			// We're done here. Go recycle.
			else if ((creep.room.name == targetPos.roomName && buddy.pos.inRangeToPos(targetPos, targetRange)) || creep.mem.returningToUnboost || (targetRoomMem.seasonWallsToRemove && targetRoomMem.seasonWallsToRemove.length == 0)) {
				let canUnboost = false
				if (buddy.hasBoost()) {
					let homeRoom = Game.rooms[creep.mem.sR]
					let lab = homeRoom.getUnboostLab(creep)

					if (lab) {
						let threshold = 300

						canUnboost = (buddy.mem.ticksToArrival || 0) <= threshold
						let unboostWorthIt = true
						// Not spent enough at the coalface just yet.
						if (buddy.ticksToLive > threshold) {
							unboostWorthIt = false
						}
						if (Memory.rooms[targetPos.roomName].seasonDropOffAvailable || (targetRoomMem.seasonWallsToRemove && targetRoomMem.seasonWallsToRemove.length == 0)) {
							unboostWorthIt = true
						}
						
						if (creep.mem.returningToUnboost || 
							targetRoomMem.seasonDropOffAvailable || 
							(targetRoomMem.seasonWallsToRemove && targetRoomMem.seasonWallsToRemove.length == 0) || 
							(unboostWorthIt && Math.min(creep.ticksToLive, buddy.ticksToLive) < Math.max(buddy.mem.ticksToArrival + 50, buddy.mem.ticksToArrival * 1.1)) &&
							Math.min(creep.ticksToLive, buddy.ticksToLive) >= buddy.mem.ticksToArrival) {
							creep.mem.returningToUnboost = 1
							if (buddy.pos.isNearToPos(lab.pos)) {
								if (lab.unboostCreep(buddy) == OK) {
									buddy.suicide();
								}
								global._creepHasBoost = global._creepHasBoost || {};
								global._creepHasBoost[buddy.id] = false;
								changeCreepRole(creep, "recycler")
								return this.runRecycler(creep)
							}
							else if (!creep.pos.isNearToPos(lab.pos)) {
								snakeAI.moveSnake([creep.name, creep.mem.pairedName], lab.pos, moveOptions, 1, false, false)
							}
							else {
								snakeAI.moveSnake([creep.name, creep.mem.pairedName], buddy.pos, moveOptions, 0, false, false)
							}


							homeRoom.mem.attemptingToUnBoostRick = Game.time;
						}

					}
				}
				if (!canUnboost && !creep.hasBodypart(HEAL)) {
					if (creep.hasBodypart(CARRY)) {
						let dropped = creep.room.find(FIND_DROPPED_RESOURCES)[0]
						// if (Memory.rooms[creep.mem.sR].lootRooms.includes(creep.room.name) && dropped && dropped.amount >= 2000) {
						// 	changeCreepRole(creep, "lootFetcher")
						// 	return this.runFetcher(creep)
						// }
						// else {
							changeCreepRole(creep, "seasonFetcher")
							return this.runSeasonFetcher(creep)
						// }
					}
					else {					
						changeCreepRole(creep, "recycler")
						return this.runRecycler(creep)
					}
				}
				// else {
					// if (buddy.hits < buddy.hitsMax * 0.9 && creep.pos.isNearToPos(buddy.pos)) {
					// 	let hostile = creep.pos.findClosestByRange(creep.room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK]))
					// 	if (hostile) {
					// 		creep.uncachedMoveTo(hostile, 5, {flee: 1})
					// 	}
					// }
				// }


			}
			else if (creep.room.name == targetPos.roomName && creep.pos.inRangeToPos(targetPos, targetRange)) {
				// Got to pull it into to the last step. Do that with a swap
				// if (buddy.hasBodypart(MOVE)) {
				// 	creep.uncachedMoveTo(buddy.pos, targetRange, moveOptions)
				// }
				// else {
					snakeAI.moveSnake([creep.name, creep.mem.pairedName], buddy.pos, moveOptions, 0, false, false)
				// }
			}
			else {
				// if (buddy.hasBodypart(MOVE)) {
				// 	creep.uncachedMoveTo(targetPos, targetRange, moveOptions)
				// }
				// else {
				// console.log(creep, buddy)
					snakeAI.moveSnake([creep.name, creep.mem.pairedName], targetPos, moveOptions, targetRange, false, false)
				// }
			}
		}
		else {
			creep.uncachedMoveTo(buddy, 1)
		}
	},	

	runSquisher: function(creep) {
		if (creep.room.name != creep.mem.targetRoom || util.isEdgeOfRoom(creep.pos)) {
			creep.uncachedMoveTo(new RoomPosition(25, 25, creep.mem.targetRoom), 20);
			return
		}

		let site = creep.pos.findClosestByRange(FIND_HOSTILE_CONSTRUCTION_SITES)

		if (creep.pos.getRangeToPos(site.pos) == 0) {
			creep.uncachedMoveTo(site, 0, {maxRooms: 1, flee: 1})

		}
		else {
			creep.uncachedMoveTo(site, 0, {maxRooms: 1})
		}


	},



	runChildMiner(creep) {
		// We don't even move. Wild.
		let targetPos = new RoomPosition(creep.mem.target.x, creep.mem.target.y, creep.mem.target.roomName);

		creep.valuableCreepExtraHate();

		if (!Game.rooms[targetPos.roomName]) {
			return
		}

		let container = creep.pos.findFirstInRange(creep.room.containers, 1)

		if (!container) {
			let farContainer = creep.pos.findFirstInRange(creep.room.containers, 2)
			if (!farContainer) {
				return
			}
			let neighbours = creep.pos.findInRange(FIND_MY_CREEPS, 1).filter(c => c.mem.role == "childMiner" && c.pos.isNearToPos(farContainer.pos))

			if (!neighbours.length) {
				return
			}
			if (creep.getStoreUsedCapacity()) {
				let extractor = creep.room.extractor

				if (!extractor || extractor.cooldown) {
					let bestNeighbour
					let bestNeighbourCarry = -Infinity
					for (let neighbour of neighbours) {
						if (neighbour.store.getFreeCapacity() > bestNeighbourCarry) {
							bestNeighbour = neighbour
							bestNeighbourCarry = neighbour.store.getFreeCapacity()
						}				
					}

					if (bestNeighbour) {
						creep.transferFirst(bestNeighbour)							

					}
				}
			}

			if (farContainer.store.getFreeCapacity() < creep.mem.teamCreepNames.length * creep.getBoostModifiedHarvest() * HARVEST_MINERAL_POWER / HARVEST_POWER) {
				return
			}			
		} 
		else {
			if (!container || container.store.getFreeCapacity() < creep.mem.teamCreepNames.length * creep.getBoostModifiedHarvest() * HARVEST_MINERAL_POWER / HARVEST_POWER) {
				return
			}

			if (creep.getStoreUsedCapacity()) {
				creep.transferFirst(container)
			}
		}

		if (creep.ticksToLive <= 2) {
			creep.suicide();
			return
		}

		let extractor = creep.room.extractor
		if (!extractor || creep.pos.inRangeToPos(extractor.pos) || extractor.cooldown) {
			return
		}

		if (creep.ticksToLive <= (extractor.cooldown || 0) + 1) {
			creep.suicide();
			return
		}


		let mineral = extractor.pos.findFirstInRange(FIND_MINERALS, 0)

		if (mineral && !creep.store.getUsedCapacity()) {
			creep.harvest(mineral)	
			if (global.fetcherTargetCounts && global.fetcherTargetCounts[creep.room.name]) {
				delete global.fetcherTargetCounts[creep.room.name]	
			}
			
		}
	},

	runChildMinerTug(creep) {
		let moveOptions = {"avoidEnemyRooms" : 1, "maxDT" : 1.5, "minKD" : -0.5};
		let buddy = Game.creeps[creep.mem.pairedName];

		if (creep.mem.tugJobDone) {			
			if (!buddy || !buddy.hasBoost() || creep.mem.travelTime > 200) {
				if (creep.mem.returningHome && buddy) {
					buddy.suicide()
				}
				return this.runRecycler(creep)
			} 

			if (buddy.ticksToLive < creep.mem.travelTime * 1.15 || creep.mem.returningHome) {
				creep.mem.returningHome = 1
				let lab = Game.rooms[creep.mem.sR].getUnboostLab(buddy)
				if (lab) {
					if (creep.pos.isNearToPos(lab.pos)) {					
						snakeAI.moveSnake([creep.name, creep.mem.pairedName], buddy.pos, moveOptions, 0, false, false)
					}
					else {
						snakeAI.moveSnake([creep.name, creep.mem.pairedName], lab.pos, moveOptions, 1, false, false)
					}

					if (buddy.pos.isNearToPos(lab.pos)) {
						this.attempToUnBoost(buddy)
					}
				}
			}


			if (!creep.mem.returningHome && buddy && !buddy.pos.inRangeToPos(buddy.mem.target, 1)) {
				delete creep.mem.tugJobDone
			}
			else {
				return	
			}

			//creep.mem.sR = creep.room.name
			
		}

		if (!buddy || buddy.spawning) {
			if (buddy && buddy.spawning) {
				creep.cachedMoveTo(buddy, 1)
			}
			else if (Math.random() < 0.05) {
				creep.move(Math.ceil(Math.random() * 8))
			}
		}
		else if (creep.pos.isNearToRoomObject(buddy) || util.isEdgeOfRoom(creep.pos) || util.isEdgeOfRoom(buddy.pos)) {
			// TODO: Recycle/unboost if the mineral is done.
			// Can't write it now as can't test next attempt.


			let mineralPos = new RoomPosition(creep.mem.target.x, creep.mem.target.y, creep.mem.target.roomName);

			let targetRoom = Game.rooms[creep.mem.target.roomName]

			if (!targetRoom) {
				console.log("childMinerTug can't see target room", creep.mem.target.roomName)
				return
			}

			let possibleContainers = mineralPos.findInRange(targetRoom.containers.filter(c => roomAI.isSourceContainer(c)), 2)

			if (!possibleContainers.length || !targetRoom.extractor) {
				return
			}

			 			
			let posIsTaken = false
			let actualTargetPos
			let roomTerrain = Game.map.getRoomTerrain(targetRoom.name)

			let validSpaces = []
			for (let pass = 0; pass < 4 && !actualTargetPos; pass++) {
				if (pass >= 2) {
					posIsTaken = true
				}
				for (let i = -1; i <= 1; i++) {
					if (targetRoom.extractor.pos.x + i <= 0 || targetRoom.extractor.pos.x + i >= 49) {
						continue
					}
					for (let j = -1; j <= 1; j++) {
						if (targetRoom.extractor.pos.y + j <= 0 || targetRoom.extractor.pos.y + j >= 49) {
							continue
						}

						if (roomTerrain.get(targetRoom.extractor.pos.x + i, targetRoom.extractor.pos.y + j) & TERRAIN_MASK_WALL) {
							continue
						}


						let testPos = new RoomPosition(targetRoom.extractor.pos.x + i, targetRoom.extractor.pos.y + j, targetRoom.name)
						for (let container of possibleContainers) {
							if (testPos.inRangeToPos(targetRoom.extractor.pos, 1)) {
								let fail = false
								for (let space of validSpaces) {
									if (space.isEqualToPos(testPos)) {
										fail = true
										break
									}
								}
								if (fail) {
									continue
								}

								if (pass == 0 && testPos.inRangeToPos(container.pos, 1)) {
									validSpaces.push(testPos)
								}
								if (pass <= 1) {
									let fail = false
									for (let creep of targetRoom.lookForAt(LOOK_CREEPS, testPos.x, testPos.y)) {
										if (creep.mem.role == "childMiner" && creep != buddy) {
											fail = true
											break
										}
									}
									if (fail) {
										continue
									}
								}
								if (pass % 2 == 0 && testPos.inRangeToPos(container.pos, 1)) {
									actualTargetPos = testPos
									break
								} else if (testPos.findInRange(validSpaces, 1).length != testPos.findInRange(validSpaces, 0).length) {
									actualTargetPos = testPos
									break								
								}
							}						
						}
					}
				}

				if (posIsTaken && creep.room == targetRoom && creep.pos.inRangeToPos(actualTargetPos, 3)) {
					return
				}
			}

			

			// Buddy wants boosts
			if (buddy.getBoosts()) {
				let boost = Object.keys(buddy.mem.targetBoosts)[0]
				for (let lab of buddy.room.labs) {
					if (!buddy.room.mem.labMemory || !buddy.room.mem.labMemory[lab.id]) continue;

					if (util.isSameBoostType(lab.mineralType, boost) && buddy.room.mem.labMemory[lab.id].lockedForBoosts) {
						if (creep.pos.isNearToPos(lab.pos)) {
							snakeAI.moveSnake([creep.name, creep.mem.pairedName], buddy.pos, moveOptions, 0, false, false)
							//console.log(creep, creep.room, "moving to swap with miner")
						}
						else {
							snakeAI.moveSnake([creep.name, creep.mem.pairedName], lab.pos, moveOptions, 1, false, false)
							//console.log(creep, creep.room, "moving to boost miner")
						}
						break;
					}
				}
			}
			// We're done here. Go recycle.
			else if (creep.room.name == mineralPos.roomName && buddy.pos.isEqualToPos(actualTargetPos)) {
				// Actually, wait around and haul shit home first
				creep.mem.tugJobDone = 1
				creep.mem.travelRoom = creep.room.name
				creep.mem.travelTime = creep.mem.travelTime || Math.min(CREEP_LIFE_TIME - creep.ticksToLive, CREEP_LIFE_TIME - buddy.ticksToLive)

				if (!buddy || !buddy.hasBoost()) {
					creep.mem.sR = creep.room.name
					return this.runRecycler(creep)
				} 
				//creep.mem.sR = creep.room.name

				//return this.runRecycler(creep)
			}
			else if (creep.room.name == mineralPos.roomName && creep.pos.isEqualToPos(actualTargetPos)) {
				// Got to pull it into to the last step. Do that with a swap
				snakeAI.moveSnake([creep.name, creep.mem.pairedName], buddy.pos, moveOptions, 0, false, false)
			}
			else {
				// console.log(creep, buddy)
				snakeAI.moveSnake([creep.name, creep.mem.pairedName], actualTargetPos, moveOptions, 0, false, false)
			}
		}
		else {
			creep.uncachedMoveTo(buddy, 1)
		}
	},	



	runRecycler: function(creep) {
		if (creep.mem.role == "recycler" && !creep.hasActiveBodypart(MOVE)) {
			creep.suicide();
			return
		}


		// Spawner location
		// Todo, better reuse. Got to include stuckness
		if (creep.room.name != creep.mem.sR) {
			creep.uncachedMoveTo(new RoomPosition(25, 25, creep.mem.sR), 20);
		}
		else {
			if (!creep.room.dangerous && creep.ticksToLive <= CREEP_LIFE_TIME / 2 && creep.hasBoost()) {
				let res = this.attempToUnBoost(creep)
				if (res) {
					return;
				}
			}
			if (!creep.mem.recycleSpawn) {
				var spawns = creep.room.find(FIND_MY_SPAWNS);
				for (var spawn of spawns) {
					var structures = creep.room.lookForAtArea(LOOK_STRUCTURES, spawn.pos.y - 1, spawn.pos.x - 1, spawn.pos.y + 1, spawn.pos.x + 1, true);
					structures = _.filter(structures, (o) => o.structure.structureType == STRUCTURE_CONTAINER);
					if (structures.length > 0) {
						creep.mem.recycleSpawn = spawn.id;
						creep.mem.recycleLocation = structures[0].structure.pos;
						break;
					}
				}
				// var spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS, {filter: (spawn) => {
				// 	var structures = creep.room.lookForAtArea(LOOK_STRUCTURES, spawn.pos.y - 1, spawn.pos.x - 1, spawn.pos.y + 1, spawn.pos.x + 1, true);
				// 	structures = _.filter(structures, (o) => o.structure.structureType == STRUCTURE_CONTAINER);
				// 	return structures.length > 0
				// }});

				// if (spawn) {
				// 	creep.mem.recycleSpawn = spawn.id;
				// 	var structures = creep.room.lookForAtArea(LOOK_STRUCTURES, spawn.pos.y - 1, spawn.pos.x - 1, spawn.pos.y + 1, spawn.pos.x + 1, true);
				// 	structures = _.filter(structures, (o) => o.structure.structureType == STRUCTURE_CONTAINER);
				// 	creep.mem.recycleLocation = structures[0].structure.pos;
				// }

				if (!creep.mem.recycleSpawn && spawns.length > 0) {
					creep.mem.recycleSpawn = spawns[0].id;
				}
			}

			if (!creep.mem.recycleSpawn || (!creep.mem.recycleLocation && creep.hasBoost())) {
				// Don't suicide these. Just do something else
				if (creep.hasBoost()) {
					if (creep.getNumOfBodyPart(RANGED_ATTACK) && creep.getNumOfBodyPart(RANGED_ATTACK) > creep.getNumOfBodyPart(ATTACK)) {
						changeCreepRole(creep, "ranged")
					}
					else if (creep.getNumOfBodyPart(ATTACK)) {
						changeCreepRole(creep, "tank")	
					}
					else if (creep.getNumOfBodyPart(HEAL)) {
						changeCreepRole(creep, "healer")	
					}
					else if (creep.getNumOfBodyPart(WORK) && creep.getNumOfBodyPart(CARRY) && creep.mem.targetRoom) {
						changeCreepRole(creep, "pioneer")	
					}
					else if (creep.getNumOfBodyPart(WORK)) {
						changeCreepRole(creep, "harvester")		
					}
					else if (creep.getNumOfBodyPart(CARRY)) {
						changeCreepRole(creep, "fetcher")		
					}
					else {
						// Really don't know what to do with it
						creep.suicide();	
					}
				}
				else {
					creep.suicide();
				}
			}
			else if (creep.mem.recycleLocation) {
				if (creep.pos.x == creep.mem.recycleLocation.x && creep.pos.y == creep.mem.recycleLocation.y) {
					Game.getObjectById(creep.mem.recycleSpawn).recycleCreep(creep);
				}
				else {
					creep.uncachedMoveTo(new RoomPosition(creep.mem.recycleLocation.x, creep.mem.recycleLocation.y, creep.mem.recycleLocation.roomName), 0, {maxRooms: 1});
				}
			}
			else {
				var spawn = Game.getObjectById(creep.mem.recycleSpawn)
				if (spawn.recycleCreep(creep) == ERR_NOT_IN_RANGE) {
					creep.uncachedMoveTo(spawn, 1, {maxRooms: 1});
				}
			}
		}

		if (creep.mem.canCombat === undefined) {
			creep.mem.canCombat = creep.hasBodypart(ATTACK) || creep.hasBodypart(RANGED_ATTACK) || creep.hasBodypart(HEAL)
		}

		if (creep.mem.canCombat) {			
			let attacked = 0;
			if (creep.hasActiveBodypart(RANGED_ATTACK)) {
				var targets = creep.pos.findInRange(creep.room.getAllHostileCreepsAndPowerCreeps(), 3);

				if (Memory.swc) {
					targets = _.filter(targets, (targetCreep) => (global.whiteList.indexOf(targetCreep.owner.username) == -1));
				}
				else if (Memory.season) {
					targets = _.filter(targets, (targetCreep) => (!scouting.isPlayerMediumWhiteListed(targetCreep.owner.username)));
					targets = _.filter(targets, (targetCreep) => (!scouting.isPlayerSoftWhiteListed(targetCreep.owner.username) || creep.hits != creep.hitsMax))// || targetCreep.hasBodypart(ATTACK) || targetCreep.hasBodypart(RANGED_ATTACK) || targetCreep.hasBodypart(HEAL) || targetCreep.hasBodypart(CLAIM)));					
				}

				var useMassDamage = 0;
				var massDamage = 0;
				for (var i in targets) {
					if (creep.pos.getRangeTo(targets[i]) == 3) {
						massDamage += 1;
					}
					else if (creep.pos.getRangeTo(targets[i]) == 2) {
						massDamage += 4;
					}
					else if (creep.pos.getRangeTo(targets[i]) == 1) {
						useMassDamage = 1;
						massDamage += 10;
					}
					if (useMassDamage || massDamage > 13) {
						break;
					}
				}
				//
				if(useMassDamage || massDamage > 13) {
					creep.rangedMassAttack();
				}
				else {
					creep.rangedAttack(targets[0]);
				}
			}
			else if (creep.hasActiveBodypart(ATTACK)) {
				let target = creep.pos.findFirstInRange(creep.room.getAllHostileCreepsAndPowerCreeps(), 1);

				if (target) {
					if (Memory.swc && global.whiteList.includes(target.owner.username)) {
						target = undefined
					}
					else if (Memory.season && scouting.isPlayerMediumWhiteListed(target.owner.username)) {
						target = undefined
					}
					else if (Memory.season && scouting.isPlayerSoftWhiteListed(target.owner.username) && creep.hits == creep.hitsMax) {// && !target.hasBodypart(ATTACK) && !target.hasBodypart(RANGED_ATTACK) && !target.hasBodypart(HEAL) && !target.hasBodypart(CLAIM)) {
						target = undefined
					}
				}

				if (target) {
					creep.attack(target)
					attacked = 1;
				}
			}

			if (!attacked && (creep.hits < creep.hitsMax || creep.room.dangerous || creep.room.isEnemyRoom()) && creep.hasActiveBodypart(HEAL)) {
				creep.heal(creep);
			}
		}
	},

	runRenewer: function(creep, allowIfOperated = false) {
		if (creep.mem.maxRenewTime && Game.time > creep.mem.maxRenewTime) {
			return this.runRecycler(creep)
		}

		if ((CREEP_LIFE_TIME - creep.ticksToLive) >= Math.floor(600 / creep.body.length) && !creep.hasBoost()) {

			if (creep.room.controller && creep.room.controller.my && creep.mem.role != "fetcher" && creep.mem.role != "baseManager" && creep.mem.role != "labTech") {
				creep.room.mem.requestRenew = Game.time;
			}
			let spawn = creep.pos.findClosestByRange(FIND_MY_SPAWNS, {filter: (s) => {return (!s.spawning || s.spawning.remainingTime < creep.pos.getRangeToPos(s.pos)) &&
																							  (allowIfOperated || !s.effects || !s.effects.length || !s.spawnUsed)}})
			if (spawn) {
				if (!creep.pos.isNearTo(spawn)) {
					creep.cachedMoveTo(spawn, spawn.spawning && spawn.spawning.remainingTime !== undefined ? 2 : 1);
				}
				else {
					let numSpawns = creep.room.spawns.length
					let ret
					if (numSpawns > 1 || !spawn.spawnUsed) {
						ret = spawn.renewCreep(creep)
					}

					if (!spawn.spawnUsed) {
						spawn.spawnUsed = true
						const alpha = Math.exp(-1/(((6000 / 3.)) * numSpawns))
						spawn.room.mem.spawnUtilization = Math.min(1, alpha * (spawn.room.mem.spawnUtilization || 0) + (1 - alpha) * (ret == OK ? 2 : 1));

						if (ret == OK) {
							let ticksLived = CREEP_LIFE_TIME - creep.ticksToLive
							let ticksRenewed = Math.floor(600 / creep.body.length)

							creep.mem.c = creep.mem.c * (1 - ticksRenewed / ticksLived)
						}

					}
				}
			}
			else if (Math.random() < 0.1 && !util.isNearEdgeOfRoom(creep.pos, 2)) {
				creep.move(Math.floor(Math.random() * 8 + 1))
			}
		}
		else if (Math.random() < 0.1 && !util.isNearEdgeOfRoom(creep.pos, 2)) {
			creep.move(Math.floor(Math.random() * 8 + 1))
		}
	},

	attempToUnBoost: function(creep) {
		let bestLab = creep.room.getUnboostLab(creep)

		if (!bestLab)  {
			return false;
		}
		else if (!creep.pos.isNearTo(bestLab)) {
			creep.uncachedMoveTo(bestLab, 1, {maxRooms: 1});
		}
		else {
			if (bestLab.unboostCreep(creep) == OK) {				
				global._creepHasBoost = global._creepHasBoost || {};
				global._creepHasBoost[creep.id] = false;
			}
		}

		creep.room.mem.attemptingToUnBoostRick = Game.time;

		return true;
	},

	runMover: function(creep) {
		creep.moveTo(new RoomPosition(creep.mem.targetX, creep.mem.targetY, creep.mem.targetRoom));
	},


	runPowerRangerCheck: function(creep) {
		var instance = Memory.powerRangers[creep.mem.teamIdx]
		if (!instance || !instance.creeps.includes(creep.name)) {
			console.log("Orphaned power ranger detected!", creep.name, creep.mem.role, creep.room.name, creep.mem.sR);
			Memory.combatManager.idlePool.push(creep.name);
			if (creep.mem.role.includes("Tank")) {
				creep.mem.role = "tank";
			}
			if (creep.mem.role.includes("Guard")) {
				creep.mem.role = "ranged";
			}
			if (creep.mem.role.includes("Healer")) {
				creep.mem.role = "healer";
			}
			// creep.mem.role = "recycler"
		}
	},

	runCreeps() {
/*		let c = 0;

	 	let a = Game.cpu.getUsed(); 
	 	for (let creepName in Game.creeps) {
	 		c += Game.creeps[creepName].mem.pTX + Game.creeps[creepName].mem.pTY; 	
	 	} 
	 	console.log(".mem", Game.cpu.getUsed() - a);

	 	a = Game.cpu.getUsed(); 
	 	for (let creepName in Game.creeps) {
	 		Game.creeps[creepName].mem.pTX; 	
	 	} 
	 	console.log(".mem", Game.cpu.getUsed() - a);

	 	a = Game.cpu.getUsed(); 
	 	for (let creepName in Game.creeps) {
	 		c += Game.creeps[creepName].mem.pTX + Game.creeps[creepName].mem.pTY; 	
	 	} 
	 	console.log(".mem", Game.cpu.getUsed() - a);

	 	a = Game.cpu.getUsed(); 
	 	for (let creepName in Game.creeps) {
	 		Game.creeps[creepName].mem.pTX; 	
	 	} 
	 	console.log(".mem", Game.cpu.getUsed() - a);

		a = Game.cpu.getUsed(); 
		for (let creepName in Game.creeps) {
			c += Memory.creeps[Game.creeps[creepName].name].pTX + Memory.creeps[Game.creeps[creepName].name].pTY;  
		}
		console.log("Memory.", Game.cpu.getUsed() - a);
	 	

		a = Game.cpu.getUsed(); 
		for (let creepName in Game.creeps) {
			Memory.creeps[Game.creeps[creepName].name].pTX;  
		}
		console.log("Memory.", Game.cpu.getUsed() - a);
		console.log(c)
*/
		let t = Game.cpu.getUsed();

		const profileCreeps = 0
		let creepCount = 0;
		let ramparterList = [];
		let moonList = [];
		let assaulterList = [];
		let snakeList = [];
		let regularList = [];
		let healerList = [];

		global.creepData = global.creepData || {};

		// let cpuTest = 0;
		// let cpuTestCount = 0;

		for(var name in Game.creeps) {
			let creep = Game.creeps[name];
			
			creepCount++;
			if (creep.spawning) {
				if (creep.shouldBoost()) {
					creep.requestAvailableBoosts();
				}
				continue;
			}

			let mem = creep.mem
			if (creep.ramparter) {
				ramparterList.push(creep)
			}
			else if (creep.moon) {
				moonList.push(creep)
			}
			else if (creep.mem.formationCreeps) {
				assaulterList.push(creep)
			}
			else if (creep.mem.pairIdx !== undefined) {
				snakeList.push(creep)
			}
			else if (mem.role == "healer") {
				healerList.push(creep)
			}
			else {
				regularList.push(creep)
			}

			if (!mem.bC && creep.id) {
				creep.notifyWhenAttacked(false)
				mem.bC = util.getECostForCreep(creep);
				mem.c = 0;

				Memory.stats.spawnCosts[mem.role] = (Memory.stats.spawnCosts[mem.role] || 0) + mem.bC;
			}
			global.creepData[creep.name] = global.creepData[creep.name] || {}

			global.creepData[creep.name].ttl = creep.ticksToLive
			global.creepData[creep.name].roomName = creep.room.name

			// mem.ttl = creep.ticksToLive;
			// TODO: Remove this?
			// mem.rN = creep.room.name;
		}

		Memory.stats.creepCount = creepCount;

		ramparterList = _.sortBy(ramparterList, function(creep) {
			// Trying to be cheap here. We assume that boost > not boost, but don't check boost type
			// let boosted = false;
			// if (creep.mem.targetBoosts && Object.keys(creep.mem.targetBoosts).length > 0) {
			// 	boosted = creep.hasBoost();
			// }
			let damage = creep.getBoostModifiedAttack() + creep.getBoostModifiedRangedAttack()

			return -creep.body.length - (creep.mem.forceRamparter ? 1 : 0) - (1500 - creep.ticksToLive) / 1500 - damage;
		});

		moonList = _.sortBy(moonList, function(creep) {
			return creep.ticksToLive;
		})

		Memory.stats.profiler["creepSetup"] = Game.cpu.getUsed() - t

		t = Game.cpu.getUsed();

		// global.testCPU = 0;

		// global.creepRamparterPhase = 1
		global.creepRamparterData = {}
		if (Game.cpu.bucket < 2000) {
			for (let creep of ramparterList) {
				if (creep.hasActiveBodypart(ATTACK)) {
					this.runLowBucket(creep);
				}
			}
			for (let creep of ramparterList) {
				if (!creep.hasActiveBodypart(ATTACK)) {
					this.runLowBucket(creep);
				}
			}
			// global.creepRamparterPhase = 0

			for (let creep of assaulterList) {
				this.runLowBucket(creep);
			}

			for (let creep of moonList) {
				this.runLowBucket(creep);
			}

			for (let creep of snakeList) {
				this.runLowBucket(creep);
			}

			for (let creep of regularList) {
				this.runLowBucket(creep);
			}

			for (let creep of healerList) {
				this.runLowBucket(creep);
			}

			global.creepReplayPhase = 1
			for (let creepName of (_.clone(global.inTickObject.replayCreep) || [])) {
				// It has but we're repathing
				Game.creeps[creepName].movedThisTick = 0
				if (Game.creeps[creepName].ramparter) {
					// global.creepRamparterPhase = 1
				}
				this.runLowBucket(Game.creeps[creepName]);
				// global.creepRamparterPhase =  0
			}
			global.creepReplayPhase = 0
		}
		else {
			for (let creep of ramparterList) {
				if (creep.hasActiveBodypart(ATTACK)) {
					this.run(creep);
				}
			}
			for (let creep of ramparterList) {
				if (!creep.hasActiveBodypart(ATTACK)) {
					this.run(creep);
				}
			}
			// global.creepRamparterPhase = 0

			for (let creep of assaulterList) {
				this.run(creep);
			}

			for (let creep of moonList) {
				this.run(creep);
			}

			for (let creep of snakeList) {
				this.run(creep);
			}

			for (let creep of regularList) {
				this.run(creep);
			}

			for (let creep of healerList) {
				this.run(creep);
			}

			global.creepReplayPhase = 1
			for (let creepName of (_.clone(global.inTickObject.replayCreep) || [])) {
				// It has but we're repathing
				Game.creeps[creepName].movedThisTick = 0
				if (Game.creeps[creepName].ramparter) {
					// global.creepRamparterPhase = 1
				}
				this.run(Game.creeps[creepName]);
				// global.creepRamparterPhase =  0
			}
			global.creepReplayPhase = 0
		}
		Memory.stats.profiler["actualCreeps"] = Game.cpu.getUsed() - t

		// console.log((Memory.stats.profiler["actualCreeps"] - global.testCPU) / Object.keys(Game.creeps).length)

	},

	attemptCreepRecovery(creep) {
		let mem = creep.mem;

		if (creep.room.highway) {
			for (let shardName of global.activeShards) {
				let isMemory = interShardMemoryManager.getMem(shardName)

				if (isMemory && isMemory.creepData && isMemory.creepData[creep.name] && isMemory.creepData[creep.name].m) {
					Memory.creeps[creep.name] = isMemory.creepData[creep.name].m
					delete Memory.creeps[creep.name].pIncompleteTick
					delete Memory.creeps[creep.name].path

					global.inTickObject.reRanCreep = global.inTickObject.reRanCreep || {}

					if (!global.inTickObject.reRanCreep[creep.name]) {
						global.inTickObject.reRanCreep[creep.name] = 1
						return this.run(creep)
					}
				}
			}
		}
		else {
			console.log("Creep spawned with no or unrecognised role...", mem.role, creep.name)
			mem.sR = creep.room.name						
			if (creep.name.startsWith("f")) {
				console.log("going to call it a fetcher")
				mem.role = "fetcher"
			}
			else if (creep.name.startsWith("h") && creep.hasBodypart(WORK)) {
				console.log("going to call it a harvester")
				mem.role = "harvester"
			}
			else if (creep.name.startsWith("bh") && creep.hasBodypart(WORK)) {
				console.log("going to call it a bharvester")
				mem.role = "bHarvester"
			}
			else if (creep.name.startsWith("bm")) {
				console.log("going to call it a base manager")
				mem.role = "baseManager"
			}
			else if (creep.name.startsWith("b") && creep.hasBodypart(WORK)) {
				console.log("going to call it a builder")
				mem.role = "builder"
			}
			else if (creep.name.startsWith("r") && creep.hasBodypart(WORK)) {
				console.log("going to call it a repairer")
				mem.role = "repairer"
			}
			else if (creep.name.startsWith("r") && creep.hasBodypart(CLAIM)) {
				console.log("going to call it a reserver")
				mem.role = "reserver"
				mem.targetRoom = _.sample(Game.rooms[mem.sR].goodRooms)
			}
			else if (creep.name.startsWith("kg") && creep.hasBodypart(ATTACK)) {
				console.log("going to call it a keeper guard")
				mem.role = "keeperGuard2"
			}
			else if (creep.name.startsWith("sbs")) {
				console.log("going to call it a sbs")
				mem.role = "sbs"
			}
			else if (creep.name.startsWith("ss")) {
				console.log("going to call it a storageSitter")
				mem.role = "ss"
			}
			else if (creep.name.startsWith("u")) {
				console.log("going to call it an upgrader")
				mem.role = "upgrader"
			}
			else {
				console.log("recycling", mem.role, creep.name)
				mem.role = "recycler"
			}
		}
	},


	// Bucket is always <2000 when this is called.
	runLowBucket: function(creep) {
		try {
			let mem = Memory.creeps[creep.name];

			if (creep.ticksToLive < 1400 && mem.c / (1500 - creep.ticksToLive) > 1) {
				// 50% < 2000, 75% < 1000.
				// Used to check `hasBoost` but that's atually quite expensive if they don't have it. 
				// Cheap way
				if (!creep.assaulter && !creep.room.dangerous && !creep.hasBoost() && mem.role != "soloKeeperMiner" && (Math.random() < 0.5 || (Game.cpu.bucket < 1000 && Math.random() < 0.5))) {
					if (creep.pos.x != 0 && creep.pos.y != 0 && creep.pos.x != 49 && creep.pos.y != 49) {
						if (Math.random() < 0.1) {
							console.log("Skipping tick for expensive creep", creep.name, creep.room.name, Math.round(mem.c / (1500 - creep.ticksToLive)));
						}
						return;
					}
				}
				// If we've lived more than 100 ticks and we're averaging more than 10 CPU a tick, death to me.
				if (mem.c / (1500 - creep.ticksToLive) > 10 && !creep.assaulter && !creep.hasBoost()) {
					console.log("Suiciding expensive CPU", creep.name, creep.pos, creep.ticksToLive, mem.c / (1500 - creep.ticksToLive))
					creep.suicide();
					return
				}
			}


			if (global.anyNukes) {
				if (mem.role != "sbs" && mem.role != "ss") {
					if (creep.room.mem.nukeLandTime !== undefined) {
						if (creep.room.mem.nukeLandTime - Game.time < 50 && creep.ticksToLive > creep.room.mem.nukeLandTime - Game.time) {
							creep.moveTo(creep.pos.findClosestByRange(FIND_EXIT), {ignoreCreeps: true});
							return
						}
					}
				}
			}

			

			let cpuStart = Game.cpu.getUsed();

			switch (mem.role) {
				case 'dummy':
					this.dummyCreep()
					break
				case 'bHarvester':
					if (Game.cpu.bucket > 1000 || Math.random() > 0.5) {
						if (Game.cpu.bucket > 750 && cpuStart < 300) {
							this.runBoostedHarvester(creep);
						}
					}
					break;
				case 'harvester':
				case "centralHarvester":
				case "keeperHarvester2":
					if (Game.cpu.bucket > 1000 || Math.random() > 0.5) {
						if (Game.cpu.bucket > 750 && cpuStart < 300) {
							this.runHarvester(creep);
						}
					}
					break;
				case "doubleHarvester":
					if (Game.cpu.bucket > 1000 || Math.random() > 0.5) {
						if (Game.cpu.bucket > 750 && cpuStart < 300) {
							this.runDoubleHarvester(creep);
						}
					}
					break;
				case 'miner':
					if (Game.cpu.bucket > 1000 || Math.random() > 0.75) {
						if (Game.cpu.bucket > 750 && cpuStart < 300) {
							this.runMiner(creep);
						}
					}
					break;
				case 'season5ThoriumMiner':
					if (Game.cpu.bucket > 1000 || Math.random() > 0.75) {
						if (Game.cpu.bucket > 750 && cpuStart < 300) {
							this.runSeason5ThoriumMiner(creep);
						}
					}
					break;
				case 'season5UnclaimEmptier':
					if (Game.cpu.bucket > 1000 || Math.random() > 0.75) {
						if (Game.cpu.bucket > 750 && cpuStart < 300) {
							this.runSeason5UnclaimEmptier(creep);
						}
					}
					break;					
				case "season5ReactorClaimer":
					this.runSeason5ReactorClaimer(creep)
					break
				case 'lootFetcher':
				case 'fetcher':
					if (Game.cpu.bucket > 1000 || Math.random() > 0.5) {
						this.runFetcher(creep);
						// this.runOldFetcher(creep);
					}
					break;
				case 'powerFetcher':
					this.runPowerFetcher(creep);
					break;
				case 'opHauler':
					if (Game.cpu.bucket > 1000 || Math.random() > 0.5) {
						this.runOpHauler(creep);
					}
					break;
				// case 'keeperGuard1':
				// 	this.runKeeperGuard1(creep);
				// 	break;
				case 'keeperGuard2':
					this.runKeeperGuard2(creep);
					break;
				case 'soloKeeperMiner':
					this.runSoloKeeperMiner(creep);
					break;
				case 'soloCentreMiner':
					if (Game.cpu.bucket > 1000 || Math.random() > 0.75) {
						if (Game.cpu.bucket > 750 && cpuStart < 300) {
							this.runSoloCentreMiner(creep);
						}
					}
					break;
				case 'reserver':
					if (Game.cpu.bucket > 1000 || Math.random() > 0.5) {
						if (Game.cpu.bucket > 750 && cpuStart < 300) {
							this.runReserver(creep);
						}
					}
					break;
				case 'claimer':
					this.runClaimer(creep);
					break;
				case 'controllerAttacker':
					this.runControllerAttacker(creep);
					break;
				case 'heavyControllerAttacker':
					this.runHeavyControllerAttacker(creep);
					break;
				case 'controllerRescuer':
					this.runControllerRescuer(creep);
					break;
				case 'upgrader':
					if (Game.cpu.bucket > 1000 || Math.random() > 0.75) {
						if (Game.cpu.bucket > 750 && cpuStart < 300) {
							this.runUpgrader(creep);
						}
					}
					break;
				case 'builder':
					if (Game.cpu.bucket > 1000 || Math.random() > 0.75) {
						this.runBuilder(creep);
					}
					break;
				case 'repairer':
					if ((creep.room.defcon || 5) < 5 || Game.cpu.bucket > 1000 || Math.random() > 0.5) {
						this.runRepairer(creep);
					}
					break;
				case 'defender':
					this.runDefender(creep);
					break;
				case 'recycler':
					// if (Game.cpu.bucket > 1500 || Math.random() > 0.5) {
					// 	if (Game.cpu.bucket > 1000 || Math.random() > 0.5) {
							this.runRecycler(creep);
					// 	}
					// }
					break;
				case 'sbs':
					if ((creep.room.defcon || 5) < 5 || Game.cpu.bucket > 1000 || Math.random() > 0.75) {
						this.runSpawnBatterySitter(creep);
					}
					break;
				case 'ss':
				case 'storageSitter':
					if ((creep.room.defcon || 5) < 5 || Game.cpu.bucket > 1000 || Math.random() > 0.75) {
						this.runStorageSitter(creep);
					}
					break;
				case 'baseManager':
					if ((creep.room.defcon || 5) < 5 || Game.cpu.bucket > 1000 || Math.random() > 0.75) {
						this.runBaseManager(creep);
					}
					break;
				case 'labTech':
					if (Game.cpu.bucket > 1000 || Math.random() > 0.5) {
						this.runLabTech(creep);
					}
					break;
				case 'advLabManager':
					if (Game.cpu.bucket > 1000 || Math.random() > 0.5) {
						this.runAdvLabManager(creep);
					}
					break;
				case 'season2TerminalTransporter':
					if (Game.cpu.bucket > 1000 || Math.random() > 0.5) {
						this.runSeason2TerminalTransporter(creep);
					}
					break;
				case 'season2ScoreShuffler':
					if (Game.cpu.bucket > 1000 || Math.random() > 0.5) {
						this.runSeason2ScoreShuffler(creep);
					}
					break;
				case 'season2ContainerManager':
					if (Game.cpu.bucket > 1000 || Math.random() > 0.5) {
						this.runSeason2ContainerManager(creep);
					}
					break;
				case 'season2ContainerShuffler':
					if (Game.cpu.bucket > 1000 || Math.random() > 0.5) {
						this.runSeason2ContainerShuffler(creep);
					}
					break;
				case 'season2Imposter':
					this.runSeason2Imposter(creep);
					break;		
				case 'season3TradeTransporter':
					this.runSeason3TradeTransporter(creep);
					break;
				case 'season4Scorer':
					this.runSeason4Scorer(creep);
					break;
				case 'season5ScoreTransport':
					this.runSeason5ScoreTransport(creep);
					break;
				case 'powerShuffler':
					if (Game.cpu.bucket > 1500 || Math.random() > 0.5 || Memory.season3) {
						if (Game.cpu.bucket > 1000 || Math.random() > 0.5 || Memory.season3) {
							this.runPowerShuffler(creep);
						}
					}
					break;
				case 'safeModeGenerator':
					if (Game.cpu.bucket > 1000 || Math.random() > 0.75) {
						this.runSafeModeGenerator(creep);
					}
					break;
				case 'scout':
					this.runScout(creep);
					break;
				case 'powerScout':
					this.runPowerScout(creep);
					break;
				case 'portalScout':
					this.runPortalScout(creep);
					break;
				case 'intershardScout':
					this.runIntershardCivilian(creep, this.runScout);
					break;
				case 'intershardClaimer':
					this.runIntershardCivilian(creep, this.runClaimer);
					break;
				case 'intershardPioneer':
					this.runIntershardCivilian(creep, this.runPioneer);
					break;
				case 'isRecycler':
					this.runIntershardCivilian(creep, this.runRecycler);
					break;
				case 'intershardRepairer':
					if ((creep.room.defcon || 5) < 5 || Game.cpu.bucket > 1000 || Math.random() > 0.5) {
						this.runIntershardCivilian(creep, this.runRepairer);
					}
					break;
				case 'isUpgrader':
					if (Game.cpu.bucket > 1000 || Math.random() > 0.75) {
						if (Game.cpu.bucket > 750 && cpuStart < 300) {
							this.runIntershardCivilian(creep, this.runUpgrader);
						}
					}
					break;
				case 'isTransporter':
					if (Game.cpu.bucket > 1500 || Math.random() > 0.5) {
						if (Game.cpu.bucket > 1000 || Math.random() > 0.5) {
							this.runIntershardCivilian(creep, this.runTransporter);
						}
					}
					break;
				case 'isHeavyTransport':
					this.runIntershardCivilian(creep, this.runHeavyTransporter);
					break;
				case 'intershardSMG':
					if (Game.cpu.bucket > 1000 || Math.random() > 0.5) {
						this.runIntershardCivilian(creep, this.runSafeModeGenerator);
					}
					break;
				case 'antiScout':
					this.runAntiScout(creep);
					break;
				case 'testTransporter':
				case 'observer':
					this.runCreepObserver(creep);
					break;
				case 'boostGrabber':
					this.runBoostGrabber(creep);
					break;
				case 'roadTransporter':
				case 'transporter':
					if (Game.cpu.bucket > 1000 || Math.random() > 0.5) {
						this.runTransporter(creep);
					}
					break;
				case 'deconstructor':
				case 'strongholdDeconstructor':
					if (creep.assaulter) {
						this.runCloseCombatAssaulter(creep)
					}
					else {
						this.runDeconstructor(creep);
					}
					break;
				case 'dismantler':
				case 'coreDismantler':
					this.runDismantler(creep);
					break;
				case 'allyPioneer':
				case 'pioneer':
					this.runPioneer(creep);
					break;
				case 'edgeBouncer':
					this.runEdgeBouncer(creep);
					break;
				case 'depositMiner':
					// These things are super low CPU
					// if (Game.cpu.bucket > 1500 || Math.random() > 0.5) {
					// 	if (Game.cpu.bucket > 1000 || Math.random() > 0.5) {
							this.runDepositMiner(creep);
					// 	}
					// }
					break;
				case 'depositTug':
					if (Game.cpu.bucket > 1500 || Math.random() > 0.5) {
						if (Game.cpu.bucket > 1000 || Math.random() > 0.5) {
							this.runDepositTug(creep);
						}
					}
					break;
				case 'depositFetcher':
					if (Game.cpu.bucket > 1500 || Math.random() > 0.5) {
						if (Game.cpu.bucket > 1000 || Math.random() > 0.5) {
							this.runDepositFetcher(creep);
						}
					}
					break;
				case 'depositTroll':
					if (Game.cpu.bucket > 1500 || Math.random() > 0.5) {
						if (Game.cpu.bucket > 1000 || Math.random() > 0.5) {
							this.runDepositTroll(creep);
						}
					}
					break;
				case 'seasonWallGuard':
					this.runSeasonWallGuard(creep);
					break;
				case 'seasonWallBuilderD':
					this.runSeasonWallBuilderD(creep);
					break;
				case 'seasonWallBuilderR':
					this.runSeasonWallBuilderR(creep);
					break;
				case 'seasonWallDestroyer':
					this.runSeasonWallDestroyer(creep);
					break;
				case 'seasonTug':
					this.runSeasonTug(creep);
					break;
				case 'seasonFetcher':
					this.runSeasonFetcher(creep);
					break;
				case 'childMinerTug':
					this.runChildMinerTug(creep);
					break;
				case 'childMiner':
					this.runChildMiner(creep);
					break;
				case 'intershardRanged':
					this.runIntershardCombat(creep, "ranged");
					break;
				case 'intershardPairedHealer':
					this.runIntershardCombat(creep, "pairedHealer");
					break;
				case 'intershardPairedTank':
					this.runIntershardCombat(creep, "tank");
					break;
				case 'newPowerTank':
					this.runPowerTank(creep);
					break;
				case 'newPowerHealer':
					this.runPowerHealer(creep);
					break;
				case 'pairedPowerTank':
					this.runPairedPowerTank(creep);
					break;
				case 'pairedPowerHealer':
					this.runPairedPowerHealer(creep);
					break;
				case 'squisher':
					this.runSquisher(creep);
					break;
				case 'raiderClose':
				case 'raiderRoaming':
				case 'raiderHauler':
					this.runSeasonRaider(creep);
					break;
				default:
					if (mem.role) {						
						if(mem.role.startsWith('healer')) {
							this.runHealer(creep);
						}
						else if(mem.role.startsWith('ranged')) {
							if (creep.assaulter) {
								this.runRangedAssaulter(creep);
							}
							else {
								this.runRanged(creep);	
							}
						}
						else if(mem.role.startsWith('tank')) {
							if (creep.assaulter) {
								this.runCloseCombatAssaulter(creep)
							}
							else {
								this.runTank(creep);
							}
						}
						else if(mem.role.startsWith('powerHealer') || mem.role.startsWith('powerTank') || mem.role.startsWith('powerGuard')) {
							this.runPowerRangerCheck(creep);
						}
					}
					else {
						this.attemptCreepRecovery(creep)
					}
					break;
			}
			// console.log(creep.name, Game.cpu.getUsed())

			let cpu = Game.cpu.getUsed() - cpuStart

			if (global.anyNukes) {				
				if (mem.role != "sbs" && mem.role != "ss") {
					if (mem.pTgtRoom &&
							 Game.rooms[mem.pTgtRoom] &&
							 Game.rooms[mem.pTgtRoom].mem.nukeLandTime &&
							 creep.room.name != mem.pTgtRoom &&
							 Game.rooms[mem.pTgtRoom].mem.nukeLandTime - Game.time < 50 &&
							 Game.rooms[mem.pTgtRoom].mem.nukeLandTime - Game.time > -2 &&
							 Game.rooms[mem.pTgtRoom].controller &&
							 Game.rooms[mem.pTgtRoom].controller.my) {
						creep.moveTo(new RoomPosition(25, 25, creep.room.name), {range: 20, ignoreCreeps: true});
						return
					}
				}
			}


			// global.testCPU += cpu;



			// creep.say(Math.round(cpu * 1000))

			// Is string concat expensive? Probably
			if (Game.time % 10 == 0) {				
				let cpuHash = mem.role + (creep.assaulter ? "ass" : "") + (creep.ramparter ? "ramp" : "") + (creep.moon ? "moon" : "") + (creep.renew ? "renew" : "");
				Memory.stats.creepCPUs[cpuHash] = (Memory.stats.creepCPUs[cpuHash] || 0) + cpu * 10;
			}

			mem.c = Math.round((mem.c + cpu) * 1000) / 1000;

			// if (Game.cpu.bucket < 3000 && Game.time % 50 == 0 && creep.ticksToLive < 1400 && creep.mem.c / (1500 - creep.ticksToLive) > 3) {
			// 	console.log("Creep " + creep.name + ": " + Game.time + " " + (creep.mem.c / (1500 - creep.ticksToLive)).toPrecision(4) + " " + JSON.stringify(creep.mem) + " (" + Game.cpu.bucket + ")")
			// }

		}
		catch(e) {
			console.log("Error on creep!", creep.name, creep.pos);
			console.log(e);
			console.log(e.stack);
			creep.say("ERROR!")
		}
	},

	// Bucket is always >2000 when this is called.
	run: function(creep) {
		try {
			let mem = Memory.creeps[creep.name];

			if (global.anyNukes) {
				if (mem.role != "sbs" && mem.role != "ss") {
					if (creep.room.mem.nukeLandTime !== undefined) {
						if (creep.room.mem.nukeLandTime - Game.time < 50 && creep.ticksToLive > creep.room.mem.nukeLandTime - Game.time) {
							creep.moveTo(creep.pos.findClosestByRange(FIND_EXIT), {ignoreCreeps: true});
							return
						}
					}
				}
			}			

			let cpuStart = Game.cpu.getUsed();

			switch (mem.role) {
				case 'dummy':
					this.dummyCreep()
					break
				case 'bHarvester':
					this.runBoostedHarvester(creep);
					break;
				case 'harvester':
				case "centralHarvester":
				case "keeperHarvester2":
					// Often overbuilt so skipping isn't so bad
					if (cpuStart < 300) {
						this.runHarvester(creep);
					}
					break;
				case "doubleHarvester":
					// Often overbuilt so skipping isn't so bad
					if (cpuStart < 300) {
						this.runDoubleHarvester(creep);
					}
					break;
				case 'miner':
					// Dominated by cooldown so skipping isn't so bad
					if (cpuStart < 300) {
						this.runMiner(creep);
					}
					break;
				case 'season5ThoriumMiner':
					this.runSeason5ThoriumMiner(creep);
					break;
				case 'season5UnclaimEmptier':
					this.runSeason5UnclaimEmptier(creep);
					break;					
				case "season5ReactorClaimer":
					this.runSeason5ReactorClaimer(creep)
					break;					
				case 'lootFetcher':
				case 'fetcher':
					// Can call expensive pathfinding
					if (cpuStart < 300) {
						this.runFetcher(creep);
						// this.runOldFetcher(creep);
					}
					break;
				case 'powerFetcher':
					// Can call expensive pathfinding
					if (cpuStart < 300) {
						this.runPowerFetcher(creep);
					}
					break;
				case 'opHauler':
					this.runOpHauler(creep);
					break;
				// case 'keeperGuard1':
				// 	this.runKeeperGuard1(creep);
				// 	break;
				case 'keeperGuard2':
					this.runKeeperGuard2(creep);
					break;
				case 'soloKeeperMiner':
					this.runSoloKeeperMiner(creep);
					break;
				case 'soloCentreMiner':
					this.runSoloCentreMiner(creep);
					break;
				case 'reserver':
					this.runReserver(creep);
					break;
				case 'claimer':
					this.runClaimer(creep);
					break;
				case 'controllerAttacker':
					this.runControllerAttacker(creep);
					break;
				case 'heavyControllerAttacker':
					this.runHeavyControllerAttacker(creep);
					break;
				case 'controllerRescuer':
					this.runControllerRescuer(creep);
					break;
				case 'upgrader':
					this.runUpgrader(creep);
					break;
				case 'builder':
					this.runBuilder(creep);
					break;
				case 'repairer':
					this.runRepairer(creep);
					break;
				case 'defender':
					this.runDefender(creep);
					break;
				case 'recycler':
					this.runRecycler(creep);
					break;
				case 'spawnBatterySitter':
				case 'sbs':
					if ((creep.room.defcon || 5) < 5 || Game.cpu.bucket > 3000 || Math.random() > 0.25) {
						this.runSpawnBatterySitter(creep);
					}
					break;
				case 'ss':
				case 'storageSitter':
					this.runStorageSitter(creep);
					break;
				case 'baseManager':
					this.runBaseManager(creep);
					break;
				case 'labTech':
					this.runLabTech(creep);
					break;
				case 'advLabManager':
					this.runAdvLabManager(creep);
					break;
				case 'powerShuffler':
					if (Game.cpu.bucket > 3000 || Math.random() > 0.25) {
						this.runPowerShuffler(creep);
					}
					break;
				case 'season2TerminalTransporter':
					this.runSeason2TerminalTransporter(creep);
					break;
				case 'season2ScoreShuffler':
					this.runSeason2ScoreShuffler(creep);
					break;
				case 'season2ContainerManager':
					this.runSeason2ContainerManager(creep);
					break;
				case 'season2ContainerShuffler':
					this.runSeason2ContainerShuffler(creep);
					break;
				case 'season2Imposter':
					this.runSeason2Imposter(creep);
					break;
				case 'season3TradeTransporter':
					this.runSeason3TradeTransporter(creep);
					break;
				case 'season4Scorer':
					this.runSeason4Scorer(creep);
					break;			
				case 'season5ScoreTransport':
					this.runSeason5ScoreTransport(creep);
					break;
				case 'safeModeGenerator':
					if (Game.cpu.bucket > 3000 || Math.random() > 0.25) {
						this.runSafeModeGenerator(creep);
					}
					break;
				case 'scout':
					this.runScout(creep);
					break;
				case 'powerScout':
					this.runPowerScout(creep);
					break;					
				case 'portalScout':
					this.runPortalScout(creep);
					break;
				case 'intershardScout':
					this.runIntershardCivilian(creep, this.runScout);
					break;
				case 'intershardClaimer':
					this.runIntershardCivilian(creep, this.runClaimer);
					break;
				case 'intershardPioneer':
					this.runIntershardCivilian(creep, this.runPioneer);
					break;
				case 'isRecycler':
					this.runIntershardCivilian(creep, this.runRecycler);
					break;
				case 'intershardRepairer':
					this.runIntershardCivilian(creep, this.runRepairer);
					break;
				case 'isUpgrader':
					this.runIntershardCivilian(creep, this.runUpgrader);
					break;
				case 'isTransporter':
					this.runIntershardCivilian(creep, this.runTransporter);
					break;
				case 'isHeavyTransport':
					this.runIntershardCivilian(creep, this.runHeavyTransporter);
					break;
				case 'intershardSMG':
					this.runIntershardCivilian(creep, this.runSafeModeGenerator);
					break;
				case 'antiScout':
					this.runAntiScout(creep);
					break;
				case 'testTransporter':
				case 'observer':
					this.runCreepObserver(creep);
					break;
				case 'boostGrabber':
					this.runBoostGrabber(creep);
					break;
				case 'roadTransporter':
				case 'transporter':
					this.runTransporter(creep);
					break;
				case 'deconstructor':
				case 'strongholdDeconstructor':
					if (creep.assaulter) {
						this.runCloseCombatAssaulter(creep)
					}
					else {
						this.runDeconstructor(creep);
					}
					break;
				case 'dismantler':
				case 'coreDismantler':
					this.runDismantler(creep);
					break;
				case 'allyPioneer':
				case 'pioneer':
					this.runPioneer(creep);
					break;
				case 'edgeBouncer':
					this.runEdgeBouncer(creep);
					break;
				case 'depositMiner':
					this.runDepositMiner(creep);
					break;
				case 'depositTug':
					this.runDepositTug(creep);
					break;
				case 'depositFetcher':
					this.runDepositFetcher(creep);
					break;
				case 'depositTroll':
					this.runDepositTroll(creep);
					break;
				case 'seasonWallGuard':
					this.runSeasonWallGuard(creep);
					break;
				case 'seasonWallBuilderD':
					this.runSeasonWallBuilderD(creep);
					break;
				case 'seasonWallBuilderR':
					this.runSeasonWallBuilderR(creep);
					break;
				case 'seasonWallDestroyer':
					this.runSeasonWallDestroyer(creep);
					break;
				case 'seasonTug':
					this.runSeasonTug(creep);
					break;
				case 'seasonFetcher':
					this.runSeasonFetcher(creep);
					break;
				case 'childMinerTug':
					this.runChildMinerTug(creep);
					break;
				case 'childMiner':
					this.runChildMiner(creep);
					break;
				case 'intershardRanged':
					this.runIntershardCombat(creep, "ranged");
					break;
				case 'intershardPairedHealer':
					this.runIntershardCombat(creep, "pairedHealer");
					break;
				case 'intershardPairedTank':
					this.runIntershardCombat(creep, "tank");
					break;
				case 'newPowerTank':
					this.runPowerTank(creep);
					break;
				case 'newPowerHealer':
					this.runPowerHealer(creep);
					break;
				case 'pairedPowerTank':
					this.runPairedPowerTank(creep);
					break;
				case 'pairedPowerHealer':
					this.runPairedPowerHealer(creep);
					break;
				case 'squisher':
					this.runSquisher(creep);
					break;					
				case 'raiderClose':
				case 'raiderRoaming':
				case 'raiderHauler':
					this.runSeasonRaider(creep);
					break;
				default:
					if (mem.role) {						
						if(mem.role.startsWith('healer')) {
							this.runHealer(creep);
						}
						else if(mem.role.startsWith('ranged')) {
							if (creep.assaulter) {
								this.runRangedAssaulter(creep);
							}
							else {
								this.runRanged(creep);	
							}
						}
						else if(mem.role.startsWith('tank')) {
							if (creep.assaulter) {
								this.runCloseCombatAssaulter(creep)
							}
							else {
								this.runTank(creep);
							}
						}
						else if(mem.role.startsWith('powerHealer') || mem.role.startsWith('powerTank') || mem.role.startsWith('powerGuard')) {
							this.runPowerRangerCheck(creep);
						}
					}
					else {
						this.attemptCreepRecovery(creep);
					}
					break;
			}
			// console.log(creep.name, Game.cpu.getUsed())

			let cpu = Game.cpu.getUsed() - cpuStart

			if (global.anyNukes) {				
				if (mem.role != "sbs" && mem.role != "ss") {
					if (mem.pTgtRoom &&
							 Game.rooms[mem.pTgtRoom] &&
							 Game.rooms[mem.pTgtRoom].mem.nukeLandTime &&
							 creep.room.name != mem.pTgtRoom &&
							 Game.rooms[mem.pTgtRoom].mem.nukeLandTime - Game.time < 50 &&
							 Game.rooms[mem.pTgtRoom].mem.nukeLandTime - Game.time > -2 &&
							 Game.rooms[mem.pTgtRoom].controller &&
							 Game.rooms[mem.pTgtRoom].controller.my) {
						creep.mem.pIncompleteTick = Game.time
						creep.moveTo(new RoomPosition(25, 25, creep.room.name), {range: 20, ignoreCreeps: true, maxRooms: 1});
						return
					}
				}
			}


			// global.testCPU += cpu;



			// creep.say(Math.round(cpu * 1000))

			// Is string concat expensive? Probably
			if (Game.time % 10 == 0) {				
				let cpuHash = mem.role + (creep.assaulter ? "ass" : "") + (creep.ramparter ? "ramp" : "") + (creep.moon ? "moon" : "") + (creep.renew ? "renew" : "");
				Memory.stats.creepCPUs[cpuHash] = (Memory.stats.creepCPUs[cpuHash] || 0) + cpu * 10;
			}

			mem.c = Math.round((mem.c + cpu) * 1000) / 1000;

			// creep.say()

			// if (Game.cpu.bucket < 3000 && Game.time % 50 == 0 && creep.ticksToLive < 1400 && creep.mem.c / (1500 - creep.ticksToLive) > 3) {
			// 	console.log("Creep " + creep.name + ": " + Game.time + " " + (creep.mem.c / (1500 - creep.ticksToLive)).toPrecision(4) + " " + JSON.stringify(creep.mem) + " (" + Game.cpu.bucket + ")")
			// }

		}
		catch(e) {
			console.log("Error on creep!", creep.name, creep.pos);
			console.log(e);
			console.log(e.stack);
			creep.say("ERROR!")
		}
	},
};

module.exports = creepAI;