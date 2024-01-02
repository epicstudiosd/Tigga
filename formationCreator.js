"use strict";
let util = require('util');
let safeRoute = require('safeRoute');
let roomIntel = require('roomIntel');
var intelAI = require('intelAI');

const constants = require('constants');

const utf15 = require('./utf15');
const Codec = utf15.Codec;

var formationCreator = {
	getRoomRouteDangerous(parentRoomName, setupRoomName, mem, extraCreepDamage) {
		let roomIsDangerous = mem.DT > 0.2 || (extraCreepDamage && mem.hostileBoostedCreeps);

		if (mem.twrX) {
			for (let towerIdx in mem.twrX.length) {
				if (mem.twrE[towerIdx] >= 10) {
					roomIsDangerous = true;
					break;
				}
			}
		}

		// It's easy to think it's not dangerous when it is! Be safe! Be sure!
		let routeIsDangerous = (Game.rooms[setupRoomName] && Game.rooms[setupRoomName].dangerous) || (Memory.rooms[setupRoomName] && Memory.rooms[setupRoomName].DT > 1)
		let routeIsVeryDangerous = false;

		let route = safeRoute.findSafeRoute(parentRoomName, setupRoomName);
		if (route != ERR_NO_PATH) {
			for (let step of route) {
				let pathRoomName = step.room;
				if (Memory.rooms[pathRoomName] && Memory.rooms[pathRoomName].DT > 1.8) {
					routeIsDangerous = true;
					routeIsVeryDangerous = true;
					break;
				}
				if (Memory.rooms[pathRoomName] && Memory.rooms[pathRoomName].DT > 1.1) {
					routeIsDangerous = true;
				}
				if (Game.rooms[pathRoomName] && Game.rooms[pathRoomName].dangerous) {
					routeIsDangerous = true;
				}

			}
		}

		return {roomIsDangerous: roomIsDangerous, routeIsDangerous: routeIsDangerous, routeIsVeryDangerous: routeIsVeryDangerous}
	},

	getFormationAssaultSpawnPlan(parentRoom,
								 targetRoomName,
								 setupRoomName,
								 escalation,
								 closeCombat,
								 minHealPerTower,
								 maxHealPerTower,
								 maxAccountedForEnemyAttack,
								 maxAccountedForEnemyRanged,
								 expensiveBoosts,
								 restrictBoosts,
								 squadSize,
								 cornerNibble,
								 logging,
								 numWaves,
								 firstLaunch,
								 supporting,
								 drain,
								 allowControllerRaid,
								 powerMod,
								 minHeal,
								 buildForHold) {
		if (!closeCombat) {
			expensiveBoosts = false;
		}

		minHeal = minHeal || 0

		if (Memory.debugAssaultSpawning) {
			console.log("Formation assault args",	
						escalation,
						closeCombat,
						minHealPerTower,
						maxHealPerTower,
						maxAccountedForEnemyAttack,
						maxAccountedForEnemyRanged,
						powerMod,
						numWaves)
		}


		let returnObject = {squadHeal: 0, roles: [], bodies: [], boosts: [], formation: [], formationPos: [], closeCombat: closeCombat};

		var spawns = parentRoom.find2(FIND_MY_SPAWNS);
		let mem = Memory.rooms[targetRoomName];
		// Oh. Crap.
		if (spawns.length == 0) {
			if (Memory.debugAssaultSpawning) {
				console.log("Plan failed no spawns")
			}
			return;
		}

		let realNumTowers = mem.twrX ? mem.twrX.length : 0;
		let maxTowerDamage = mem.maxTowerDamage || (600 * realNumTowers);

		// Can happen...
		if (maxHealPerTower < minHealPerTower) {
			maxHealPerTower = minHealPerTower
		}

		let edgeWalls = false;
		let edgeWallsLow = false;
		let exits = Game.map.describeExits(targetRoomName);

		if (realNumTowers) {
			for (let exitDir in exits) {
				if (exits[exitDir] == setupRoomName) {
					let idx = Math.round((parseInt(exitDir) - 1) / 2);

					// Hmmm, could go after the controller.
					if (mem.controllerNearlyExposedToEdge[exitDir] && !mem.controllerExposedToEdge[exitDir] && (mem.maxControllerDefenseHits || 0) > 1e6 && squadSize == 4 && mem.pathTowerDamageToControllerByEdge2x2 && allowControllerRaid) {
						// Take a bit more than the controller says we should
						maxTowerDamage = maxTowerDamage * 0.5 + 0.5 * Math.max(mem.pathTowerDamageToControllerByEdge2x2[exitDir], mem.towerDamageAtController);
					}
					// Edge walls
					else if ((exitDir == LEFT && mem.eWallsL) ||
							(exitDir == RIGHT && mem.eWallsR) ||
							(exitDir == TOP && mem.eWallsT) ||
							(exitDir == BOTTOM && mem.eWallsB)) {
						edgeWalls = true;

						let towerDamage = 0;

						if (exitDir == LEFT) {
							for (let towerX of mem.twrX) {
								towerDamage += util.getTowerDamageForDist(towerX - 1)
							}
						}
						else if (exitDir == RIGHT) {
							for (let towerX of mem.twrX) {
								towerDamage += util.getTowerDamageForDist(48 - towerX)
							}
						}
						else if (exitDir == TOP) {
							for (let towerY of mem.twrY) {
								towerDamage += util.getTowerDamageForDist(towerY - 1)
							}
						}
						else if (exitDir == BOTTOM) {
							for (let towerY of mem.twrY) {
								towerDamage += util.getTowerDamageForDist(48 - towerY)
							}
						}

						towerDamage *= closeCombat ? 2 : (4 / 3)

						// If the towers are fookin miles away don't worry.
						if (towerDamage < maxTowerDamage) {
							let lowestWall = mem.lowestOuterWall || Infinity;
							let mod = closeCombat ? 2 : 1;
							if (lowestWall < 0.25e6 * mod) {
								maxTowerDamage = maxTowerDamage;
								// Assume we can push on from here.
								edgeWallsLow = false;
							}
							else if (lowestWall < 0.5e6 * mod) {
								maxTowerDamage = 0.5 * (1.75 * maxTowerDamage + 0.25 * towerDamage);
							}
							else if (lowestWall < 0.75e6 * mod) {
								maxTowerDamage = 0.5 * (1.5 * maxTowerDamage + 0.5 * towerDamage);
							}
							else if (lowestWall < 1e6 * mod) {
								maxTowerDamage = 0.5 * (maxTowerDamage + towerDamage);
							}
							else {
								maxTowerDamage = 0.5 * (0.5 * maxTowerDamage + 1.5 * towerDamage);
							}
						}
						else {
							maxTowerDamage = towerDamage;
						}
					}
					else if (mem.maxTowerDamageAtOuterWallByEdge && mem.lowestOuterWallByEdge) {
						let t1 = 2e6 / ((mem.advBlkDmg || 0) * 3 + 1)
						let t2 = 1e6 / ((mem.advBlkDmg || 0) * 3 + 1)
						// Not going to break through this wave.
						if (mem.lowestOuterWallByEdge[idx] > t1) {
							maxTowerDamage = mem.maxTowerDamageAtOuterWallByEdge[idx];
						}
						else if (mem.lowestOuterWallByEdge[idx] > t2) {
							maxTowerDamage = 0.5 * (mem.maxTowerDamage + mem.maxTowerDamageAtOuterWallByEdge[idx]);
						}
					}
					else {
						if (mem.lowestOuterWall !== undefined && mem.maxTowerDamageAtOuterWall !== undefined) {
							// Not going to break through this wave.
							if (mem.lowestOuterWall > 5e6) {
								maxTowerDamage = mem.maxTowerDamageAtOuterWall;
							}
							else if (mem.lowestOuterWall > 3e6) {
								maxTowerDamage = 0.5 * (mem.maxTowerDamage + mem.maxTowerDamageAtOuterWall);
							}
						}
					}


					break;
				}
			}
		}



		let extraCreepDamageClose = 0;
		let extraCreepDamageRanged = 0;

		let hostilesPush = Game.time - (mem.hostilesPushTest || 0) < 20000 || mem.hostilesPushOut

		let accountedForCreepAttack = mem.creepAttack;

		// Just sort it out myself. Means it's still deploying.
		// The above sets a few things, but this is the important one to override.
		if (mem.invCT !== undefined && realNumTowers === 0) {
			console.log("Unspawned invader core override")
			switch (mem.invCL) {
				case 1:
					realNumTowers = 1;
					break;
				case 2:
					realNumTowers = 2;
					accountedForCreepAttack = 1;
					extraCreepDamageClose = 15 * ATTACK_POWER;
					break;
				case 3:
					realNumTowers = 3;
					accountedForCreepAttack = 2;
					extraCreepDamageClose = 2 * 25 * ATTACK_POWER;
					break;
				case 4:
					realNumTowers = 4;
					accountedForCreepAttack = 2;
					accountedForCreepRanged = 2;
					extraCreepDamageClose = 2 * 25 * ATTACK_POWER * 3;
					extraCreepDamageRanged = 2 * 25 * RANGED_ATTACK_POWER * 3;
					break;
				case 5:
					realNumTowers = 6;
					accountedForCreepAttack = 1;
					extraCreepDamageClose = 44 * ATTACK_POWER * 4;
					extraCreepDamageRanged = 3 * 44 * RANGED_ATTACK_POWER * 4
					break;
			}

			maxTowerDamage = 600 * realNumTowers;
		}
		else {			
			if (mem.creepCombatPartsAttack && (closeCombat || edgeWalls || hostilesPush || cornerNibble)) {
				// Attack shouldn't get close unless I let it and I shouldn't have to worry about more than three of them.
				// This fails a bit if they have different types of attack.
				if (mem.creepAttack && mem.creepAttack > maxAccountedForEnemyAttack) {
					accountedForCreepAttack = maxAccountedForEnemyAttack;
					extraCreepDamageClose += (mem.bestCreepCombatPartsAttack || 0) * maxAccountedForEnemyAttack * ATTACK_POWER;
				}
				else {
					extraCreepDamageClose += mem.creepCombatPartsAttack * ATTACK_POWER;
				}
			}
			if (mem.creepCombatPartsRanged) {
				// extraCreepDamageRanged = mem.creepCombatPartsRanged * RANGED_ATTACK_POWER * 1.125;
				if (mem.creepRanged && mem.creepRanged > maxAccountedForEnemyRanged) {
					extraCreepDamageRanged += mem.creepCombatPartsRanged * (maxAccountedForEnemyRanged / mem.creepRanged) * RANGED_ATTACK_POWER;
				}
				else {
					extraCreepDamageRanged += mem.creepCombatPartsRanged * RANGED_ATTACK_POWER;
				}
			}

		}

		maxTowerDamage *= powerMod

		if (mem.meanActiveTowers !== undefined && !mem.invCL) {
			maxTowerDamage *= (0.75 * realNumTowers + 0.25 * mem.meanActiveTowers) / realNumTowers;
		}



		// Fuck that. Just avoid them.
		let tooMuchAttack = false;
		if (!cornerNibble && extraCreepDamageClose + maxTowerDamage > (expensiveBoosts ? 5000 : (restrictBoosts ? 1250 : 5000))) {
			tooMuchAttack = true;

			if (!edgeWalls) {
				// No point in trying to tank the damage.
				expensiveBoosts = false;
			}
			if (hostilesPush || edgeWalls) {
				if (closeCombat && !edgeWalls) {
					extraCreepDamageClose /= (1.5 * Math.max(1, accountedForCreepAttack));
				}
				else {
					extraCreepDamageClose /= Math.max(1, accountedForCreepAttack);
				}
			}
			else {
				extraCreepDamageClose /= (2 * Math.max(1, accountedForCreepAttack));
			}
		}



		// console.log(extraCreepDamageClose, extraCreepDamageRanged)

		// .8 because attack shouldn't get close unless I let it. 1.25 due to RMA
		let extraCreepDamage = extraCreepDamageClose * 0.8 + extraCreepDamageRanged * (mem.invCL ? 1.1 : 1.25);

		// Really, we shouldn't let them be landing a lot of hits on us. We should be able to retreat.
		// This isn't so true when there's a T3 death mob there.
		if (!mem.hostileBoostedCreeps) {
			extraCreepDamage *= 0.5;
		}

		var formationCreepNames = []

		let healPower = HEAL_POWER;
		let healBoost;
		let rangedBoost;

		let moveBoost;
		let toughBoost;
		let toughBoostSingle;
		let toughBoostSingleEdgeWall;
		let toughBoostSmall;
		let toughBoostMedium;
		let toughBoostCorner;
		let moveScale = 1;
		let healScale = 1;

		let danger = this.getRoomRouteDangerous(parentRoom.name, setupRoomName, mem, extraCreepDamage);

		let roomIsDangerous = danger.roomIsDangerous;
		let routeIsDangerous = danger.routeIsDangerous;
		let routeIsVeryDangerous = danger.routeIsVeryDangerous;



		if (!roomIsDangerous && !routeIsDangerous) {
			restrictBoosts = true;
		}

		// Been having problems with unboosted attacks against rooms that aren't really as down as they should be
		// We don't want to burn boosts on rooms that are properly dead, but if they're sending combat creeps in
		// themselves then we need to be able to deal with them.
		// At the time of writing I'm halfing extraCreepDamage above if there aren't hostile boosted creeps.
		// I guess this kinda counteracts that.
		// if (restrictBoosts && realNumTowers == 0) {
		// 	if (roomIsDangerous || routeIsDangerous) {
		// 		extraCreepDamage *= 2;
		// 	}
		// 	extraCreepDamage *= Math.max(1, mem.DT);
		// }

		// Start to need a bit of extra padding
		if (maxTowerDamage > 3000) {
			maxTowerDamage += (maxTowerDamage - 3000)
		}

		let minDamagePerTower;
		let maxDamagePerTower;
		let meanDamagePerTower = maxTowerDamage / realNumTowers

		let damagePerTowerRanged = extraCreepDamageRanged / realNumTowers + meanDamagePerTower;
		let damagePerTowerClose = extraCreepDamageClose / realNumTowers + meanDamagePerTower;
		if (realNumTowers > 0) {
			minDamagePerTower = extraCreepDamage / realNumTowers + meanDamagePerTower;

			// Part of why we're overbuilt is to deal with this.
			let modifiedExtraCreepDamage = extraCreepDamage - 0.5 * realNumTowers * (maxHealPerTower - minHealPerTower) * meanDamagePerTower / 600
			modifiedExtraCreepDamage = Math.max(0, modifiedExtraCreepDamage);

			maxDamagePerTower = modifiedExtraCreepDamage / realNumTowers + meanDamagePerTower;
		}
		else {
			meanDamagePerTower = 1;
			minDamagePerTower = extraCreepDamage;
			maxDamagePerTower = extraCreepDamage;
		}

		if (minHeal) {
			damagePerTowerRanged = Math.max(minHeal, damagePerTowerRanged)
			damagePerTowerClose = Math.max(minHeal, damagePerTowerClose)
			minDamagePerTower = Math.max(minHeal, minDamagePerTower)
			maxDamagePerTower = Math.max(minHeal, maxDamagePerTower)

			maxTowerDamage = minHeal
		}



		let effectiveTowerCountMin = Math.max(1, realNumTowers) * minDamagePerTower / 600;
		let effectiveTowerCountMax = Math.max(1, realNumTowers) * maxDamagePerTower / 600;

		let effectiveTowerCountRanged = Math.max(1, realNumTowers) * damagePerTowerRanged / 600;
		let effectiveTowerCountClose = Math.max(1, realNumTowers) * damagePerTowerClose / 600;


		if (mem.invCL && !restrictBoosts) {
			console.log(parentRoom, effectiveTowerCountMin, effectiveTowerCountMax, effectiveTowerCountRanged, effectiveTowerCountClose, minHealPerTower, maxHealPerTower, extraCreepDamageRanged, extraCreepDamageClose, powerMod)
			console.log(maxAccountedForEnemyAttack, maxAccountedForEnemyRanged)
		}

		effectiveTowerCountMin *= (1 + escalation / 10);
		effectiveTowerCountMin = Math.max(0.5, effectiveTowerCountMin);

		effectiveTowerCountMax *= (1 + escalation / 10);
		effectiveTowerCountMax = Math.max(0.5, effectiveTowerCountMax);

		effectiveTowerCountRanged *= (1 + escalation / 10);
		effectiveTowerCountRanged = Math.max(0.5, effectiveTowerCountRanged);

		effectiveTowerCountClose *= (1 + escalation / 10);
		effectiveTowerCountClose = Math.max(0.5, effectiveTowerCountClose);



		let max;
		if (squadSize == 4 || squadSize == 9) {			
			if(cornerNibble) {
				max = 9;
			}
			else {
				max = 8;
			}
		}
		else if (squadSize == 6) {
			// Getting three heals on a creep requires swapping. Technically I have 3/2 healing.
			// Swapping means that if the edge creeps are picked on the healing is delayed.
			// Ranged heal runs at 1/3 efficiency, so I could say 2.333/2 healing. Just raise
			// the incoming damage by 1.2x...
			effectiveTowerCountMin *= 1.2
			effectiveTowerCountMax *= 1.2
			effectiveTowerCountRanged *= 1.2
			effectiveTowerCountClose *= 1.2

			max = 10;
		}

		// Can't do beyond this. I guess we'll drop heals.
		if (effectiveTowerCountMin > max) {
			effectiveTowerCountMin = max;
		}
		if (effectiveTowerCountMax > max) {
			effectiveTowerCountMax = max;
		}
		if (effectiveTowerCountRanged > max) {
			effectiveTowerCountRanged = max;
		}
		if (effectiveTowerCountClose > max) {
			effectiveTowerCountClose = max;
		}

		let maxTotalCombatParts = squadSize * 23;

		// Energy costs prevent us from using MOVE boosts properly at RCL 7.
		// We could use tough boosts, but really we should save them for the proper RCL 8 attacks.
		// We also don't want to use boosts unless we're doing a proper assault.
		let canMoveScale2 = true;
		let canMoveScale3 = true;
		if (!restrictBoosts) {
			// All this is a bit off if we've got a corner nibble
			/*let numFront
			let numBack

			if (cornerNibble) {
				numFront = 1;
				numBack = squadSize - 1;
			}
			else {
				numFront = squadSize / 2
				numBack = squadSize / 2
			}*/


			if (parentRoom.effectiveLevel == 8 && expensiveBoosts) {
				toughBoost = parentRoom.getAvailableBoost(util.isToughBoost, 15 * squadSize * LAB_BOOST_MINERAL * numWaves, undefined, numWaves > 1, firstLaunch);
				if (toughBoost == RESOURCE_CATALYZED_GHODIUM_ALKALIDE) {
					healScale = 1 / 0.35;
				}
			}
			else if (parentRoom.effectiveLevel == 7 && expensiveBoosts) {
				toughBoost = parentRoom.getAvailableBoost(util.isToughBoost, squadSize * 14 * LAB_BOOST_MINERAL * numWaves, undefined, numWaves > 1, firstLaunch);
				if (toughBoost == RESOURCE_GHODIUM_ALKALIDE) {
					healScale = 1 / 0.55;
				}
			}

			// Gah. Darn edge walls.
			if (toughBoost && edgeWalls && closeCombat) {
				healScale /= 2;
			}

			// Didn't do wot I thought
			if (parentRoom.effectiveLevel == 8 && !toughBoost) {
				// toughBoostSingle = parentRoom.getAvailableBoost(util.isToughBoost, squadSize * LAB_BOOST_MINERAL);
			}
			if (parentRoom.effectiveLevel == 8 && edgeWalls) {
				// toughBoostSingleEdgeWall = parentRoom.getAvailableBoost(util.isToughBoost, squadSize * LAB_BOOST_MINERAL);
			}

			if (parentRoom.effectiveLevel == 8) {
				toughBoostCorner = parentRoom.getAvailableBoost(util.isToughBoost, 20 * LAB_BOOST_MINERAL, undefined, numWaves > 1, firstLaunch);
				toughBoostMedium = parentRoom.getAvailableBoost(util.isToughBoost, squadSize * 5 * LAB_BOOST_MINERAL, undefined, numWaves > 1, firstLaunch);
				toughBoostSmall = parentRoom.getAvailableBoost(util.isToughBoost, (squadSize / 2) * 3 * LAB_BOOST_MINERAL, undefined, numWaves > 1, firstLaunch);
			}

			let moveBoost1 = parentRoom.getAvailableBoost(util.isMoveBoost, squadSize * 16 * LAB_BOOST_MINERAL * numWaves, undefined, numWaves > 1, firstLaunch);
			let moveBoost2 = parentRoom.getAvailableBoost(util.isMoveBoost, squadSize * 13 * LAB_BOOST_MINERAL * numWaves, undefined, numWaves > 1, firstLaunch);
			let moveBoost3 = parentRoom.getAvailableBoost(util.isMoveBoost, squadSize * 10 * LAB_BOOST_MINERAL * numWaves, undefined, numWaves > 1, firstLaunch);

			let maxHeals;
			if (moveBoost3 && util.getBoostTier(moveBoost3) == 3) {
				moveBoost = moveBoost3;
				moveScale = 4;
				maxHeals = 40 - (toughBoostSingle ? 1 : 0) - (closeCombat ? 0 : 17);
			}
			else if (moveBoost2 && util.getBoostTier(moveBoost2) == 2) {
				moveBoost = moveBoost2;
				moveScale = 3;
				maxHeals = 36 - (toughBoostSingle ? 1 : 0) - (closeCombat ? 0 : 15);
			}
			else if (moveBoost1 && util.getBoostTier(moveBoost1) == 1) {
				moveBoost = moveBoost1;
				moveScale = 2;
				maxHeals = 33 - (toughBoostSingle ? 1 : 0) - (closeCombat ? 0 : 14);
			}
			// Kinda lying when not close combat. Capped heals at 23. Fairly arbitrary.
			else {
				// Can be defined and pass through the above
				moveBoost = undefined;
				if (closeCombat) {
					maxHeals = Math.min(MAX_CREEP_SIZE / 2, Math.floor(parentRoom.energyCapacityAvailable / 300));
				}
				else {
					// This is wrong.
					maxHeals = Math.min((MAX_CREEP_SIZE - 8) / 2, Math.floor((parentRoom.energyCapacityAvailable - 800) / 300))
				}
			}

			maxTotalCombatParts = squadSize * ((moveScale == 4 ? 40 : (moveScale == 3 ? 37 : (moveScale == 2 ? 33 : 25))) - 5)

			// Assume it's 24 or higher
			if (expensiveBoosts) {
				maxHeals = Math.min(maxHeals, effectiveTowerCountMax * maxHealPerTower / ((squadSize / (closeCombat ? 2 : 1)) * 24 * healScale));
			}
			else {
				maxHeals = Math.min(maxHeals, effectiveTowerCountMin * minHealPerTower / ((squadSize / (closeCombat ? 2 : 1)) * 24));
			}

			if (parentRoom.effectiveLevel == 7) {
				maxHeals = 19 - (toughBoostSingle ? 1 : 0) - (closeCombat ? 0 : 7);
			}


			healBoost = parentRoom.getAvailableBoost(util.isHealBoost, maxHeals * (squadSize / (closeCombat ? 2 : 1)) * LAB_BOOST_MINERAL * numWaves, undefined, numWaves > 1, firstLaunch);

			if (!healBoost) {
				// Assume it's 36 or higher
				if (expensiveBoosts) {
					maxHeals = Math.min(maxHeals, effectiveTowerCountMax * maxHealPerTower / ((squadSize / (closeCombat ? 2 : 1)) * 36 * healScale));
				}
				else {
					maxHeals = Math.min(maxHeals, effectiveTowerCountMin * minHealPerTower / ((squadSize / (closeCombat ? 2 : 1)) * 36));
				}

				healBoost = parentRoom.getAvailableBoost(util.isHealBoost, maxHeals * (squadSize / (closeCombat ? 2 : 1)) * LAB_BOOST_MINERAL * numWaves, undefined, numWaves > 1, firstLaunch);

				if (healBoost && BOOSTS[HEAL][healBoost][HEAL] == 2) {
					healBoost = undefined;
				}
			}
			if (!healBoost) {
				// Assume it's 48 or higher
				if (expensiveBoosts) {
					maxHeals = Math.min(maxHeals, effectiveTowerCountMax * maxHealPerTower / ((squadSize / (closeCombat ? 2 : 1)) * 48 * healScale));
				}
				else {
					maxHeals = Math.min(maxHeals, effectiveTowerCountMin * minHealPerTower / ((squadSize / (closeCombat ? 2 : 1)) * 48));
				}

				healBoost = parentRoom.getAvailableBoost(util.isHealBoost, maxHeals * (squadSize / (closeCombat ? 2 : 1)) * LAB_BOOST_MINERAL * numWaves, undefined, numWaves > 1, firstLaunch);

				if (healBoost && BOOSTS[HEAL][healBoost][HEAL] != 4) {
					healBoost = undefined;
				}
			}

			// Not great numbers
			rangedBoost = parentRoom.getAvailableBoost(util.isRangedBoost, Math.round(maxTotalCombatParts * LAB_BOOST_MINERAL * 0.5 * numWaves), undefined, numWaves > 1, firstLaunch);
			// console.log(parentRoom, squadSize, maxTotalCombatParts, rangedBoost, util.isRangedBoost)

			if (healBoost) {
				healPower *= BOOSTS[HEAL][healBoost][HEAL];
			}
		}


		if (mem.invCL && !restrictBoosts) {
			console.log(moveBoost, rangedBoost, healBoost)
		}



		if (Memory.debugAssaultSpawning) {
			console.log("boosts", moveBoost, healBoost, rangedBoost, toughBoost)
		}

		// Lets not mix big boosts and little boosts.
		if (firstLaunch) {
			// Don't mess around
			if (((mem.numAttacksFailed || 0) > 2 || intelAI.strugglingToKillRooms(mem.owner) >= 10) && !supporting) {
				if (healPower == 48) {
					if (moveScale != 4) {
						if (Memory.debugAssaultSpawning) {
							console.log("Plan failed first launch #1")
						}

						return;
					}
					if (!closeCombat && (!rangedBoost || BOOSTS[RANGED_ATTACK][rangedBoost]["rangedAttack"] != 4)){
						if (Memory.debugAssaultSpawning) {
							console.log("Plan failed first launch #2")
						}

						return;
					}
				}
			}
		}

		function getNumHealerT3ToughForRangedDamageEffectiveTowerCount(towerCount) {
			let tDelta = 100 * healScale - 100
			let diff = towerCount * 600 - 5000
			return Math.max(0, Math.ceil(diff / tDelta))
		}

		let guardCount = 0;
		let proposedExtraCCRanged = 1;

		if (closeCombat) {
			returnObject.directional = true;
			let attackBoost;
			let dismantleBoost;

			let useAttackParts;

			if (buildForHold) {
				useAttackParts = 1;
			}
			else if (restrictBoosts) {
				useAttackParts = (Math.random() < 0.25);
			}
			else {
				dismantleBoost = parentRoom.getAvailableBoost(util.isDismantleBoost, Math.round(maxTotalCombatParts * 0.25) * LAB_BOOST_MINERAL * numWaves, undefined, numWaves > 1, firstLaunch);
				attackBoost = parentRoom.getAvailableBoost(util.isAttackBoost, Math.round(maxTotalCombatParts * 0.25) * LAB_BOOST_MINERAL * numWaves, undefined, numWaves > 1, firstLaunch);

				let dismantleTier = util.getBoostTier(dismantleBoost);
				let attackTier = util.getBoostTier(attackBoost);

				useAttackParts = (attackTier > dismantleTier + 1);
			}

			// Enemy room isn't fighting back, don't do attack parts
			if (!buildForHold && !roomIsDangerous && !routeIsDangerous) {
				useAttackParts = 0;
			}

			if (hostilesPush) {
				useAttackParts = 1;
			}


			if (firstLaunch) {
				if (healPower == 48) {
					if (useAttackParts && (!attackBoost || BOOSTS[ATTACK][attackBoost][ATTACK] <= 2)) {
						if (Memory.debugAssaultSpawning) {
							console.log("Plan failed first launch #3")
						}

						return;
					}
					else if (!useAttackParts && (!dismantleBoost || BOOSTS[WORK][dismantleBoost]["dismantle"] <= 1)) {
						if (Memory.debugAssaultSpawning) {
							console.log("Plan failed first launch #4")
						}

						return;
					}
				}
				else if (healPower == 36) {
					if (!attackBoost) {
						if (Memory.debugAssaultSpawning) {
							console.log("Plan failed first launch #5")
						}

						return;
					}
				}
				else if (useAttackParts && attackBoost && BOOSTS[ATTACK][attackBoost][ATTACK] == 4) {
					if (healPower <= 24) {
						if (Memory.debugAssaultSpawning) {
							console.log("Plan failed first launch #6")
						}
						return;
					}
				}
				else if (useAttackParts && attackBoost && BOOSTS[ATTACK][attackBoost][ATTACK] >= 3) {
					if (healPower <= 12) {
						if (Memory.debugAssaultSpawning) {
							console.log("Plan failed first launch #7")
						}
						return;
					}
				}
				else if (!useAttackParts && dismantleBoost && BOOSTS[WORK][dismantleBoost]["dismantle"] >= 3) {
					if (healPower <= 12) {
						if (Memory.debugAssaultSpawning) {
							console.log("Plan failed first launch #8")
						}
						return;
					}
				}

				if (((mem.numAttacksFailed || 0) > 2 || intelAI.strugglingToKillRooms(mem.owner) >= 10) && !supporting) {
					if (healPower == 48) {
						if (moveScale != 4){
							if (Memory.debugAssaultSpawning) {
								console.log("Plan failed first launch #9")
							}
							return;
						}
						if (!attackBoost || BOOSTS[ATTACK][attackBoost][ATTACK] != 4) {
							if (Memory.debugAssaultSpawning) {
								console.log("Plan failed first launch #10")
							}
							return;
						}
					}
				}
			}

			// Don't fuck about
			if (roomIsDangerous && parentRoom.effectiveLevel == 8 && mem.rcl == 8 && ((mem.numAttacksFailed || 0) + (mem.numAttacksFizzled || 0) >= 10 || intelAI.strugglingToKillRooms(mem.owner) >= 50)) {
				if (healPower < 48) {
					if (Memory.debugAssaultSpawning) {
						console.log("Plan failed DFA #1")
					}

					return;
				}
				if (useAttackParts && (!attackBoost || BOOSTS[ATTACK][attackBoost][ATTACK] != 4)) {
					if (Memory.debugAssaultSpawning) {
						console.log("Plan failed DFA #2")
					}
					return
				}
				if (!useAttackParts && (!dismantleBoost || BOOSTS[WORK][dismantleBoost]["dismantle"] != 4)) {
					if (Memory.debugAssaultSpawning) {
						console.log("Plan failed DFA #3")
					}
					return
				}
				if (moveScale != 4) {
					if (Memory.debugAssaultSpawning) {
						console.log("Plan failed DFA #4")
					}

					return;
				}
			}


			// Nibbler test.
			// At first we can only do square nibblers. This means we need a position where one corner is exposed to the enemy
			// This only works if we have visibility into the room as we only store rampart/wall IDs

			// console.log(Game.rooms[targetRoomName],
			// 			roomIsDangerous,
			// 			parentRoom.energyCapacityAvailable >= 40 * 250 + 10 * 50,
			// 			(attackBoost || dismantleBoost),
			// 			mem.advBlkDmg,
			// 			mem.markedBuildings,
			// 			mem.markedBuildings ? mem.markedBuildings.length : 0,
			// 			squadSize,
			// 			Game.shard.name)

			if (false &&
				Game.rooms[targetRoomName] &&
				roomIsDangerous &&
				parentRoom.energyCapacityAvailable >= 40 * 250 + 10 * 50 &&
				mem.advBlkDmg > 0.2 &&
				mem.markedBuildings &&
				Object.keys(mem.markedBuildings).length > 0 &&
				squadSize == 4 &&
				global.roomAssaultCounts[targetRoomName].nibbleCount == 0) {

				let nibblerToughBoost
				let nibblerMoveBoost
				let nibblerHealBoost
				let nibblerRangedBoost
				let nibblerAttackBoost
				let nibblerDismantleBoost

				let nibblerHealScale = 1;
				let nibblerHealPower = HEAL_POWER;
				let canNibbleMoveScale2 = true;
				let canNibbleMoveScale3 = true;

				let nibblerUseAttackParts;

				if (!restrictBoosts) {
					if (parentRoom.effectiveLevel == 8) {
						nibblerToughBoost = parentRoom.getAvailableBoost(util.isToughBoost, 100 * LAB_BOOST_MINERAL);
						if (nibblerToughBoost == RESOURCE_CATALYZED_GHODIUM_ALKALIDE) {
							nibblerHealScale = 1 / 0.3;
						}
					}
					else if (parentRoom.effectiveLevel == 7) {
						nibblerToughBoost = parentRoom.getAvailableBoost(util.isToughBoost, 100 * LAB_BOOST_MINERAL);
						if (nibblerToughBoost == RESOURCE_GHODIUM_ALKALIDE) {
							nibblerHealScale = 1 / 0.5;
						}
					}

					nibblerMoveBoost = parentRoom.getAvailableBoost(util.isMoveBoost, 5 * 17 * LAB_BOOST_MINERAL);
					nibblerHealBoost = parentRoom.getAvailableBoost(util.isHealBoost, 4 * 40 * LAB_BOOST_MINERAL);

					nibblerRangedBoost = parentRoom.getAvailableBoost(util.isRangedBoost, 40 * LAB_BOOST_MINERAL);
					nibblerAttackBoost = parentRoom.getAvailableBoost(util.isAttackBoost, 40 * LAB_BOOST_MINERAL);
					nibblerDismantleBoost = parentRoom.getAvailableBoost(util.isDismantleBoost, 40 * LAB_BOOST_MINERAL);


					if (nibblerHealBoost) {
						nibblerHealPower *= BOOSTS[HEAL][nibblerHealBoost][HEAL];
					}
				}

				nibblerUseAttackParts = util.getBoostTier(nibblerAttackBoost) > util.getBoostTier(nibblerDismantleBoost) + 1;


				let nibbler2x2Possible = false;
				let nibblerTTPossible = false;
				let nibblerTRPossible = false;
				let nibblerTBPossible = false;
				let nibblerTLPossible = false;
				let nibblerXPossible = false;
				// Firstly we need to be able to deal with the best attack creep the enemy has to offer
				// added to their ranged damage.
				let nibblerDamage = effectiveTowerCountRanged * minHealPerTower + (mem.bestCreepCombatPartsAttack || 0) * ATTACK_POWER;

				let nibblerMoveScale = util.getBoostTier(nibblerMoveBoost) + 1;
				let parts = MAX_CREEP_SIZE - (nibblerMoveScale == 4 ? 10 : (nibblerMoveScale == 3 ? 13 : (nibblerMoveScale == 2 ? 17 : 25)));

				let maxNumTough = Math.floor(Math.min(15, 0.4 * parts) / 1.05);
				let noToughHealing = 3 * parts * nibblerHealPower;

				let totalHealing = noToughHealing;
				if (totalHealing < maxNumTough * 100) {
					totalHealing *= nibblerHealScale
				}
				else {
					totalHealing += maxNumTough * 100 * nibblerHealScale -  maxNumTough * 100;
				}

				if (totalHealing > nibblerDamage) {
					let mask2x2 = [[0,0],[1,0],[0,1],[1,1]];

					let possiblePositions = roomIntel.getNibblerPositionsWithVisibility(targetRoomName, mask2x2, constants.MASK_SHAPE_2x2, true);
					nibbler2x2Possible = possiblePositions.length > 0;

					let maskTT = [[0,0],[-1,1],[0,1],[1,1]];

					possiblePositions = roomIntel.getNibblerPositionsWithVisibility(targetRoomName, maskTT, constants.MASK_SHAPE_TT, true);
					nibblerTTPossible = possiblePositions.length > 0;

					let maskTR = [[0,0],[-1,1],[-1,0],[-1,-1]];

					possiblePositions = roomIntel.getNibblerPositionsWithVisibility(targetRoomName, maskTR, constants.MASK_SHAPE_TR, true);
					nibblerTRPossible = possiblePositions.length > 0;

					let maskTB = [[0,0],[-1,-1],[0,-1],[1,-1]];

					possiblePositions = roomIntel.getNibblerPositionsWithVisibility(targetRoomName, maskTB, constants.MASK_SHAPE_TB, true);
					nibblerTBPossible = possiblePositions.length > 0;

					let maskTL = [[0,0],[1,1],[1,0],[1,-1]];

					possiblePositions = roomIntel.getNibblerPositionsWithVisibility(targetRoomName, maskTL, constants.MASK_SHAPE_TL, true);
					nibblerTLPossible = possiblePositions.length > 0;

					let maskX = [[0,0],[-1,1],[0,1],[1,1],[0,2]];

					possiblePositions = roomIntel.getNibblerPositionsWithVisibility(targetRoomName, maskX, constants.MASK_SHAPE_X, true);
					nibblerXPossible = possiblePositions.length > 0;
				}

				console.log("Nibbletest", targetRoomName, nibbler2x2Possible, nibblerTTPossible, nibblerTRPossible, nibblerTBPossible, nibblerTLPossible, nibblerXPossible)
				Game.notify("Nibbletest " + targetRoomName + " " + nibbler2x2Possible + " " + nibblerTTPossible + " " + nibblerTRPossible + " " + nibblerTBPossible + " " + nibblerTLPossible + " " + nibblerXPossible)
				console.log("Nibbletest " + nibblerDamage + " " + totalHealing + " " + noToughHealing + " " + nibblerHealScale)
				Game.notify("Nibbletest " + nibblerDamage + " " + totalHealing + " " + noToughHealing + " " + nibblerHealScale)
				console.log("Nibbletest " + nibblerMoveBoost + " " + nibblerHealBoost)
				Game.notify("Nibbletest " + nibblerMoveBoost + " " + nibblerHealBoost)

				let nibblerTPossible = nibblerTTPossible || nibblerTRPossible || nibblerTBPossible || nibblerTLPossible;

				// Nibbles!
				if (false && (nibbler2x2Possible || nibblerTPossible || nibblerXPossible)) {
					let nibbleMode;

					if (nibbler2x2Possible) {
						nibbleMode = constants.MASK_SHAPE_2x2;
					}
					else if (nibblerTTPossible) {
						nibbleMode = constants.MASK_SHAPE_TT;
					}
					else if (nibblerTRPossible) {
						nibbleMode = constants.MASK_SHAPE_TR;
					}
					else if (nibblerTBPossible) {
						nibbleMode = constants.MASK_SHAPE_TB;
					}
					else if (nibblerTLPossible) {
						nibbleMode = constants.MASK_SHAPE_TL;
					}
					else if (nibblerXPossible) {
						nibbleMode = constants.MASK_SHAPE_X;
					}

					// TODO: Right now we won't use X. Use it when T fails due to the mod.

					let numNibblesTough = 0;
					// Over two ticks we want the tough to be able to take 2 heal then 3 heal.
					let mod;
					if (nibbleMode == constants.MASK_SHAPE_2x2) {
						mod = 1.2;
					}
					else if (nibbleMode == constants.MASK_SHAPE_TT || nibbleMode == constants.MASK_SHAPE_TR || nibbleMode == constants.MASK_SHAPE_TB || nibbleMode == constants.MASK_SHAPE_TL) {
						mod = 1.25;
					}
					else if (nibbleMode == constants.MASK_SHAPE_X) {
						mod = 1.05;
					}

					if (noToughHealing < nibblerDamage * mod && nibblerToughBoost) {
						let extraHealingNeeded = nibblerDamage * mod - noToughHealing;
						let delta = 100 / nibblerHealScale - 100;
						numNibblesTough = extraHealingNeeded / delta;
					}

					if (numNibblesTough <= 15 && numNibblesTough < parts * 0.4) {
						// We could put ranged on the healers. But lets not. We've had problems attacking so go in hard.
						returnObject.squadHeal = totalHealing;
						returnObject.nibbler = 1;
						returnObject.nibbleShape = constants.nibbleMode;

						let numMove = MAX_CREEP_SIZE - parts;

						let numDismantle = 0;
						let numAttack = 0;

						if (nibblerUseAttackParts) {
							numAttack = parts - numNibblesTough;
						}
						else {
							numDismantle = parts - numNibblesTough;
						}

						let body = [];
						let boosts = {};

						for (var i = 0; i < Math.floor(numMove / 2); i++) {
							body.push(MOVE)
							if (nibblerMoveBoost) {
								boosts[nibblerMoveBoost] = (boosts[nibblerMoveBoost] || 0) + 1;
							}
						}

						for (var i = 0; i < parts; i++) {
							body.push(HEAL);
						}
						if (nibblerHealBoost) boosts[nibblerHealBoost] = parts;

						for (var i = 0; i < Math.ceil(numMove / 2) - 1; i++) {
							body.push(MOVE)
							if (nibblerMoveBoost) {
								boosts[nibblerMoveBoost] = (boosts[nibblerMoveBoost] || 0) + 1;
							}
						}

						body.push(MOVE)
						if (moveScale == 4) {
							boosts[nibblerMoveBoost] = (boosts[nibblerMoveBoost] || 0) + 1;
						}

						for (var i = 0; i < 3; i++) {
							returnObject.roles.push("ranged");
							returnObject.bodies.push(body);
							returnObject.boosts.push(boosts);
							returnObject.formation.push(true);
							returnObject.formationPos.push(returnObject.formationPos.length);
						}


						body = [];
						boosts = {};

						for (var i = 0; i < numNibblesTough; i++) {
							body.push(TOUGH)
							boosts[nibblerToughBoost] = (boosts[nibblerToughBoost] || 0) + 1;
						}

						for (var i = 0; i < numDismantle; i++) {
							body.push(WORK)
							boosts[nibblerDismantleBoost] = (boosts[nibblerDismantleBoost] || 0) + 1;
						}

						for (var i = 0; i < numAttack; i++) {
							body.push(ATTACK)
							boosts[nibblerAttackBoost] = (boosts[nibblerAttackBoost] || 0) + 1;
						}

						for (var i = 0; i < numMove; i++) {
							body.push(MOVE)
							if (nibblerMoveBoost && (moveScale == 4 || i < numMove - 1)) {
								boosts[nibblerMoveBoost] = (boosts[nibblerMoveBoost] || 0) + 1;
							}
						}

						for (var i = 0; i < 1; i++) {
							if (numAttack) {
								returnObject.roles.push("tank");
							}
							else {
								returnObject.roles.push("deconstructor");
							}
							returnObject.bodies.push(body);
							returnObject.boosts.push(boosts);
							returnObject.formationPos.push(returnObject.formationPos.length);
							returnObject.formation.push(true);
						}



						return returnObject;
					}
				}
			}



			// if (rangedBoost || (((useAttackParts && !attackBoost) || (!useAttackParts && !dismantleBoost)) && !rangedBoost)) {
				let wallCountRatio = (mem.numWalls || 0) / ((mem.numWalls || 0) + (mem.numRamps || 0) + 1e-9);
				let mostlyWalls = (0.5 + 0.5 * Math.random()) * (mem.wallHP || 0) * wallCountRatio > (0.5 + 0.5 * Math.random()) * (mem.rampHP || 0) * (1 - wallCountRatio);

				proposedExtraCCRanged = Math.max(1, Math.ceil(((mem.exposedCreeps || 0) * 2 +
															   (mostlyWalls ? 0 : 1) * parentRoom.effectiveLevel +
															   (tooMuchAttack ? 1 : 0) * 10 +
															   ((!edgeWalls && mem.hostilesPushOut) ? -5 : 0) +
															   ((!edgeWalls && (Game.time - mem.hostilesPushTest || 0) < 1500) ? -5 : 0) +
															   (roomIntel.getSwampRatio(targetRoomName) * 4) +
															   (mem.advBlkDmg || 0) * 20 +
															   (mem.notOnWall || 0) * 10)))
			// }

			let doesHealMoveComboWork = false;


			if (toughBoost == RESOURCE_CATALYZED_GHODIUM_ALKALIDE) {
				function canDoTowerCount(moveScale, effectiveTowerCount, effectiveTowerCountRanged, healPower, maxHealPerTower, minHealPerTower) {
					let parts = MAX_CREEP_SIZE - (moveScale == 4 ? 10 : (moveScale == 3 ? 13 : (moveScale == 2 ? 17 : 25)))
					let healParts = parts - Math.ceil(getNumHealerT3ToughForRangedDamageEffectiveTowerCount(effectiveTowerCountRanged))

					return (2 * healParts * healPower * healScale) > effectiveTowerCount * maxHealPerTower && (2 * healParts * healPower) > effectiveTowerCountRanged * minHealPerTower
				}

				doesHealMoveComboWork = canDoTowerCount(moveScale, effectiveTowerCountMax, effectiveTowerCountRanged, healPower, maxHealPerTower, minHealPerTower)
			}
			// Fixed function laziness.
			else if (toughBoost == RESOURCE_GHODIUM_ALKALIDE) {
				if (healPower == 36) {
					if (effectiveTowerCountMax >= 2.75 && effectiveTowerCountMax <= 3 && moveScale >= 3) {
						doesHealMoveComboWork = true;
					}
				}
			}

			if (logging) {
				console.log(roomIsDangerous, edgeWalls, edgeWallsLow, parentRoom.energyCapacityAvailable, effectiveTowerCountMax, moveScale, toughBoost, healBoost, attackBoost, doesHealMoveComboWork)
			}

			let useBoost;
			let numRanged = 0;
			let extraRA = 0;
			if (buildForHold) {
				if (parentRoom.energyCapacityAvailable < 40 * 250 + 10 * 50 || !doesHealMoveComboWork || moveScale != 4) {
					return;
				}

				let numMoveHealer = 10
				let numToughHealer = 5;
				let numHealHealer = 35;

				let numMoveClose = 10;
				let numToughClose = 10;
				let numRangedClose = 0;
				let numAttackClose = 30;

				returnObject.squadHeal = 2 * numHealHealer * healPower * healScale;

				let body = [];
				let boosts = {};

				for (var i = 0; i < numToughHealer; i++) {
					body.push(TOUGH)
					boosts[toughBoost] = (boosts[toughBoost] || 0) + 1;
				}

				for (var i = 0; i < numHealHealer; i++) {
					body.push(HEAL);
					if (healBoost) {
						boosts[healBoost] = (boosts[healBoost] || 0) + 1;
					}
				}

				for (var i = 0; i < numMoveHealer; i++) {
					body.push(MOVE)
					if (moveBoost) {
						boosts[moveBoost] = (boosts[moveBoost] || 0) + 1;
					}
				}

				for (var i = 0; i < 2; i++) {
					returnObject.roles.push("healer");
					returnObject.bodies.push(body);
					returnObject.boosts.push(boosts);
					returnObject.formation.push(true);
					returnObject.formationPos.push(returnObject.formationPos.length);
				}

				body = [];
				boosts = {};

				for (var i = 0; i < numToughClose; i++) {
					body.push(TOUGH)
					boosts[toughBoost] = (boosts[toughBoost] || 0) + 1;
				}

				for (var i = 0; i < numAttackClose; i++) {
					body.push(ATTACK)
					boosts[attackBoost] = (boosts[attackBoost] || 0) + 1;
				}

				for (var i = 0; i < numRangedClose; i++) {
					body.push(RANGED_ATTACK)
					if (rangedBoost) {
						boosts[rangedBoost] = (boosts[rangedBoost] || 0) + 1;
					}
				}

				for (var i = 0; i < numMoveClose; i++) {
					body.push(MOVE)
					if (moveBoost && (moveScale == 4 || i < numMoveClose - 1)) {
						boosts[moveBoost] = (boosts[moveBoost] || 0) + 1;
					}
				}


				for (var i = 0; i < 2; i++) {
					returnObject.roles.push("tank");

					returnObject.bodies.push(body);
					returnObject.boosts.push(boosts);
					returnObject.formationPos.push(returnObject.formationPos.length);
					returnObject.formation.push(true);
				}
			}
			else if (roomIsDangerous && parentRoom.energyCapacityAvailable >= 40 * 250 + 10 * 50 && doesHealMoveComboWork && toughBoost && (attackBoost || dismantleBoost)) {
				useBoost = true;
				// Ok, we can get 40 heals and 10 move energy-wise, so we can any body we want here.
				// We want it to be bad-ass as we only have two healers.

				// 10/12/16/25 => 50/48/48/50
				let numMove = moveScale == 4 ? 10 : (moveScale == 3 ? 13 : (moveScale == 2 ? 17 : 25))
				let numParts = MAX_CREEP_SIZE - numMove;

				let numToughHealer = 0;
				let numToughClose = 0;
				let numHeal;

				// We do better by just mashing the heal button.
				numToughHealer = getNumHealerT3ToughForRangedDamageEffectiveTowerCount(effectiveTowerCountMax);

				// Pretty much get a free heal every other tick with two creeps healing. We don't need tough!
				if (edgeWalls && !edgeWallsLow) {
					numToughHealer = Math.round(numToughHealer / 4);
				}

				let numToughCloseMin = Math.ceil((minHealPerTower * effectiveTowerCountMin) / (100 * healScale));
				let numToughCloseMax = Math.ceil((maxHealPerTower * effectiveTowerCountMax) / (100 * healScale));

				numToughClose = Math.round((numToughCloseMin + numToughCloseMax) * 0.5);

				// That's too much man!
				if (numToughClose > 15) {
					// Huh, ok, do that then
					if (numToughCloseMin <= 15) {
						numToughClose = numToughCloseMin;
					}
					// Give up
					else {
						numToughClose = 0;
						healScale = 1;
					}
				}

				let numHealBoosts;

				let targetNumHeal = Math.max(Math.ceil(maxHealPerTower * effectiveTowerCountMax / (2 * healPower * healScale)),
											 Math.ceil(minHealPerTower * effectiveTowerCountRanged / (2 * healPower * healScale)),
											 Math.ceil(minHealPerTower * effectiveTowerCountClose / (2 * healPower * healScale)))

				// Don't fuck about with heals if we're going to be wanting tough boost
				if (toughBoost && numToughClose) {
					targetNumHeal = Math.round(targetNumHeal * 1.5)
				}

				numHeal = Math.min(numParts - numToughHealer, targetNumHeal);
				extraRA = Math.min(numParts - numToughHealer - numHeal, 10);

				if (proposedExtraCCRanged >= 15) {
					extraRA = Math.round(extraRA / 2)
				}
				if (edgeWalls && !edgeWallsLow) {
					extraRA = Math.round(extraRA / 4);
				}
				// Close combat teams are a bit weak to getting their heal sniped out. Turn "extra RA" into other goodness
				else {
					if (toughBoost) {					
						let swap = Math.floor(extraRA / 3)
						extraRA -= 2 * swap;

						numHeal += swap
						numToughHealer += swap
					}
					else {
						let swap = Math.floor(extraRA / 2)
						extraRA -= swap;

						numHeal += swap
					}
				}


				numHealBoosts = numHeal;
				numHeal += numParts - numToughHealer - numHeal - extraRA;

				if (logging) {
					console.log(effectiveTowerCountMax, effectiveTowerCountMin, effectiveTowerCountRanged, effectiveTowerCountClose)
				}
				let testTowerCount = Math.max(effectiveTowerCountMax, effectiveTowerCountMin, effectiveTowerCountRanged, effectiveTowerCountClose)
				if (testTowerCount > 5) {
					numHealBoosts = numHeal;
				}
				else {
					numHealBoosts = Math.round((numHealBoosts + numHeal) / 2);
				}

				// TODO: This is wrong. Doens't take into account the fact that the bonus heal is unboosted
				returnObject.squadHeal = 2 * numHeal * healPower;

				let body = [];
				let boosts = {};

				for (var i = 0; i < extraRA; i++) {
					body.push(RANGED_ATTACK)
					if (rangedBoost) {
						boosts[rangedBoost] = (boosts[rangedBoost] || 0) + 1;
					}
				}

				for (var i = 0; i < Math.floor(numToughHealer / 2); i++) {
					body.push(TOUGH)
					boosts[toughBoost] = (boosts[toughBoost] || 0) + 1;
				}

				for (var i = 0; i < Math.floor(numMove / 2); i++) {
					body.push(MOVE)
					if (moveBoost) {
						boosts[moveBoost] = (boosts[moveBoost] || 0) + 1;
					}
				}

				for (var i = 0; i < Math.ceil(numToughHealer / 2); i++) {
					body.push(TOUGH)
					boosts[toughBoost] = (boosts[toughBoost] || 0) + 1;
				}

				for (var i = 0; i < numHeal; i++) {
					body.push(HEAL);
					if (healBoost) {
						boosts[healBoost] = (boosts[healBoost] || 0) + 1;
						if (boosts[healBoost] > numHealBoosts) {
							boosts[healBoost] = numHealBoosts;
						}
					}
				}

				for (var i = 0; i < Math.ceil(numMove / 2) - 1; i++) {
					body.push(MOVE)
					if (moveBoost) {
						boosts[moveBoost] = (boosts[moveBoost] || 0) + 1;
					}
				}

				body.push(MOVE)
				if (moveScale == 4) {
					boosts[moveBoost] = (boosts[moveBoost] || 0) + 1;
				}

				for (var i = 0; i < 2; i++) {
					returnObject.roles.push("ranged");
					returnObject.bodies.push(body);
					returnObject.boosts.push(boosts);
					returnObject.formation.push(true);
					returnObject.formationPos.push(returnObject.formationPos.length);
				}

				let numDismantle = 0;
				let numAttack = 0;

				numRanged = Math.round(Math.min(proposedExtraCCRanged / 2, numParts - numToughClose - 5));

				if (useAttackParts) {
					numAttack = numParts - numToughClose - numRanged;
				}
				else {
					numDismantle = numParts - numToughClose - numRanged;
				}

				body = [];
				boosts = {};

				for (var i = 0; i < Math.floor(numToughClose * .9); i++) {
					body.push(TOUGH)
					boosts[toughBoost] = (boosts[toughBoost] || 0) + 1;
				}

				for (var i = 0; i < numRanged; i++) {
					body.push(RANGED_ATTACK)
					if (rangedBoost) {
						boosts[rangedBoost] = (boosts[rangedBoost] || 0) + 1;
					}
				}

				for (var i = 0; i < Math.ceil(numToughClose * .1); i++) {
					body.push(TOUGH)
					boosts[toughBoost] = (boosts[toughBoost] || 0) + 1;
				}

				for (var i = 0; i < numDismantle; i++) {
					body.push(WORK)
					boosts[dismantleBoost] = (boosts[dismantleBoost] || 0) + 1;
				}

				for (var i = 0; i < numAttack; i++) {
					body.push(ATTACK)
					boosts[attackBoost] = (boosts[attackBoost] || 0) + 1;
				}


				for (var i = 0; i < numMove; i++) {
					body.push(MOVE)
					if (moveBoost && (moveScale == 4 || i < numMove - 1)) {
						boosts[moveBoost] = (boosts[moveBoost] || 0) + 1;
					}
				}


				for (var i = 0; i < 2; i++) {
					if (numAttack) {
						returnObject.roles.push("tank");
					}
					else {
						returnObject.roles.push("deconstructor");
					}
					returnObject.bodies.push(body);
					returnObject.boosts.push(boosts);
					returnObject.formationPos.push(returnObject.formationPos.length);
					returnObject.formation.push(true);
				}
			}
			// Hardcoded RCL 7
			else if (roomIsDangerous && parentRoom.energyCapacityAvailable == 5600 && doesHealMoveComboWork && toughBoost && attackBoost) {
				useBoost = true;

				// 10/12/16/25 => 50/48/48/50
				let numMoveHealer = 11
				let numToughHealer = 14;
				let numHealHealer = 19;

				let numMoveClose = 13;
				let numToughClose = 14;
				let numRangedClose = Math.min(10, proposedExtraCCRanged);
				let numAttackClose = 23 - numRangedClose;

				returnObject.squadHeal = 2 * numHealHealer * healPower * healScale;

				let body = [];
				let boosts = {};

				for (var i = 0; i < numToughHealer; i++) {
					body.push(TOUGH)
					boosts[toughBoost] = (boosts[toughBoost] || 0) + 1;
				}

				for (var i = 0; i < Math.floor(numMoveHealer / 2); i++) {
					body.push(MOVE)
					if (moveBoost) {
						boosts[moveBoost] = (boosts[moveBoost] || 0) + 1;
					}
				}

				for (var i = 0; i < numHealHealer; i++) {
					body.push(HEAL);
					if (healBoost) {
						boosts[healBoost] = (boosts[healBoost] || 0) + 1;
					}
				}

				for (var i = 0; i < Math.ceil(numMoveHealer / 2); i++) {
					body.push(MOVE)
					if (moveBoost) {
						boosts[moveBoost] = (boosts[moveBoost] || 0) + 1;
					}
				}

				for (var i = 0; i < 2; i++) {
					returnObject.roles.push("ranged");
					returnObject.bodies.push(body);
					returnObject.boosts.push(boosts);
					returnObject.formation.push(true);
					returnObject.formationPos.push(returnObject.formationPos.length);
				}

				body = [];
				boosts = {};

				for (var i = 0; i < numToughClose; i++) {
					body.push(TOUGH)
					boosts[toughBoost] = (boosts[toughBoost] || 0) + 1;
				}

				for (var i = 0; i < numAttackClose; i++) {
					body.push(ATTACK)
					boosts[attackBoost] = (boosts[attackBoost] || 0) + 1;
				}

				for (var i = 0; i < numRangedClose; i++) {
					body.push(RANGED_ATTACK)
					if (rangedBoost) {
						boosts[rangedBoost] = (boosts[rangedBoost] || 0) + 1;
					}
				}

				for (var i = 0; i < numMoveClose; i++) {
					body.push(MOVE)
					if (moveBoost && (moveScale == 4 || i < numMoveClose - 1)) {
						boosts[moveBoost] = (boosts[moveBoost] || 0) + 1;
					}
				}


				for (var i = 0; i < 2; i++) {
					returnObject.roles.push("tank");

					returnObject.bodies.push(body);
					returnObject.boosts.push(boosts);
					returnObject.formationPos.push(returnObject.formationPos.length);
					returnObject.formation.push(true);
				}
			}
			else {
				let maxDeconCount = Math.min(Math.floor(parentRoom.energyCapacityAvailable / (1 * 100 + 1 * 50)), Math.floor(MAX_CREEP_SIZE / 2));
				let maxAttackCount = Math.min(Math.floor(parentRoom.energyCapacityAvailable / (1 * 80 + 1 * 50)), Math.floor(MAX_CREEP_SIZE / 2));

				let requiredHealsPerCreepBoosted;
				let requiredHealsPerCreepCheap;
				if (realNumTowers > 0) {
					requiredHealsPerCreepBoosted = Math.ceil(minHealPerTower * effectiveTowerCountMin / (2 * healPower));
					requiredHealsPerCreepCheap = Math.ceil(maxHealPerTower * effectiveTowerCountMax / (2 * 12));

					// There are towers, but they're not fighting back
					if (!roomIsDangerous) {
						requiredHealsPerCreepBoosted = Math.round(requiredHealsPerCreepBoosted / 2);
						requiredHealsPerCreepCheap = Math.round(requiredHealsPerCreepCheap / 2);
					}

					if (requiredHealsPerCreepBoosted < 2) {
						requiredHealsPerCreepBoosted = 2;
					}
					if (requiredHealsPerCreepCheap < 2) {
						requiredHealsPerCreepCheap = 2;
					}
				}
				else {
					requiredHealsPerCreepBoosted = 2;
					requiredHealsPerCreepCheap = 2;
				}


				let requiredHealsPerCreep;

				// Ok, we can do it on the cheap
				if (!healBoost || (parentRoom.energyCapacityAvailable - 300 * requiredHealsPerCreepCheap >= 0 && requiredHealsPerCreepCheap <= MAX_CREEP_SIZE / 2)) {
					useBoost = false;
					requiredHealsPerCreep = requiredHealsPerCreepCheap;
					healPower = 12;
				}
				else if (!restrictBoosts) {
					useBoost = true;
					requiredHealsPerCreep = requiredHealsPerCreepBoosted;
				}

				if (!useBoost) {
					toughBoostSingle = undefined;
				}

				let canMeleeUseMoveBoost = false;
				let numMeleeMove = Math.min(25, useAttackParts ? maxAttackCount : maxDeconCount);
				let numMeleeParts = numMeleeMove;
				let numMeleeRangedParts = 0;

				// This is a bit lazy. Move boosts are only going to be available at RCL 8 or maybe RCL 7, and so should be doable in the worst
				// case.
				if (useBoost && parentRoom.energyCapacityAvailable >= 40 * BODYPART_COST[useAttackParts ? ATTACK : WORK] + 10 * BODYPART_COST[MOVE])  {
					canMeleeUseMoveBoost = true;

					numMeleeMove = moveScale == 4 ? 10 : (moveScale == 3 ? 13 : (moveScale == 2 ? 17 : 25))
					numMeleeParts = moveScale == 4 ? 40 : (moveScale == 3 ? 37 : (moveScale == 2 ? 33 : 25))
				}

				// This is all pretty hacked up. If we're not using move boosts we take quite a different path
				// to if we are using move boosts.
				let canHealerUseMoveBoost = false;
				let canAttackerUseRanged = false;
				let maxAttackerRanged = 35;
				let numHealerMove;
				let numHealerParts;

				// Lazy. Basically, only RCL 8.
				if (useBoost && parentRoom.energyCapacityAvailable >= 40 * BODYPART_COST[HEAL] + 10 * BODYPART_COST[MOVE])  {
					canHealerUseMoveBoost = true;

					numHealerMove = moveScale == 4 ? 10 : (moveScale == 3 ? 13 : (moveScale == 2 ? 17 : 25))
					numHealerParts = moveScale == 4 ? 40 : (moveScale == 3 ? 37 : (moveScale == 2 ? 33 : 25))
				}
				if (useBoost && parentRoom.energyCapacityAvailable >= (40 - maxAttackerRanged) * BODYPART_COST[ATTACK] + maxAttackerRanged * BODYPART_COST[RANGED_ATTACK] + 10 * BODYPART_COST[MOVE])  {
					canAttackerUseRanged = true;

					numMeleeRangedParts = Math.max(1, Math.min(maxAttackerRanged, proposedExtraCCRanged, numMeleeParts - 5));
					numMeleeParts -= numMeleeRangedParts;
				}

				if (toughBoostSingle) {
					numMeleeParts -= 1;
					numHealerParts -= 1;
				}

				// We only progress if we could launch the attack without move boosts. This isn't great.
				let spareHealEnergy = parentRoom.energyCapacityAvailable - 300 * requiredHealsPerCreep;
				let spareHealBodySize = MAX_CREEP_SIZE - 2 * requiredHealsPerCreep;

				if (((canHealerUseMoveBoost && numHealerParts * (toughBoostSingle ? 1.05 : 1) >= requiredHealsPerCreep) || (spareHealEnergy >= 0 && spareHealBodySize >= 0)) &&
					((!useAttackParts && maxDeconCount >= 3) || (useAttackParts && maxAttackCount >= 3))) {
					// Heals up to maxHealPerTower
					let extraHealsNeeded = Math.max(0, Math.ceil(maxHealPerTower * effectiveTowerCountMax / (2 * healPower) - requiredHealsPerCreep));

					let numHealerHeals;
					let extraCarry;

					if (canHealerUseMoveBoost) {
						// We don't have to check energy in this branch - we already checked that we can do 40H+10M, so we can do anything.
						numHealerHeals = Math.min(numHealerParts, requiredHealsPerCreep + extraHealsNeeded);

						let numSpareParts = numHealerParts - numHealerHeals;

						// If we're unable to push into CC then skip the extra RA if we can downgrade heal and save $$$
						if ((mem.advBlkDmg > 0.7 || tooMuchAttack) && numSpareParts && healBoost) {
							for (let i = 1; i < util.getBoostTier(healBoost); i++) {
								let healBoostCheck;
								let testFunc;
								if (i == 1) {
									healBoostCheck = RESOURCE_LEMERGIUM_OXIDE;
									testFunc = function(boost) {return boost == RESOURCE_LEMERGIUM_OXIDE}
								}
								else {
									healBoostCheck = RESOURCE_LEMERGIUM_ALKALIDE;
									testFunc = function(boost) {return boost == RESOURCE_LEMERGIUM_ALKALIDE}
								}

								let healPowerCheck = HEAL_POWER * BOOSTS[HEAL][healBoostCheck][HEAL];

								let requiredHealsPerCreepCheck = Math.ceil(minHealPerTower * effectiveTowerCountMin / (2 * healPowerCheck));
								let extraHealsNeededCheck = Math.max(0, Math.ceil(maxHealPerTower * effectiveTowerCountMax / (2 * healPowerCheck) - requiredHealsPerCreepCheck));
								let numHealerHealsCheck = Math.min(numHealerParts, requiredHealsPerCreepCheck + extraHealsNeededCheck);

								let healBoostCheck2 = parentRoom.getAvailableBoost(util.isHealBoost, numHealerHealsCheck * 2 * LAB_BOOST_MINERAL * numWaves, testFunc, numWaves > 1, firstLaunch);

								if (healBoostCheck2 && numHealerHealsCheck > 0) {
									requiredHealsPerCreep = requiredHealsPerCreepCheck
									extraHealsNeeded = extraHealsNeededCheck;
									healPower = healPowerCheck;
									healBoost = healBoostCheck;
									numHealerHeals = numHealerHealsCheck;

									numSpareParts = numHealerParts - numHealerHeals
									break;
								}
							}
						}

						// if (toughBoost) {

						// }
						// else {
						extraRA = numSpareParts;
						// }
						extraCarry = 0;
					}
					else {
						let extraHeals = Math.min(Math.floor(spareHealEnergy / 300), Math.floor(spareHealBodySize / 2), extraHealsNeeded);

						returnObject.squadHeal = 2 * (requiredHealsPerCreep + extraHeals) * healPower;

						spareHealEnergy -= extraHeals * 300;
						spareHealBodySize -= extraHeals * 2;

						extraRA = Math.min(Math.floor(spareHealEnergy / 200), Math.floor(spareHealBodySize / 2));

						spareHealEnergy -= extraRA * (BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE]);
						spareHealBodySize -= extraRA * 2;

						extraCarry = Math.min(Math.floor(spareHealEnergy / BODYPART_COST[CARRY]), Math.floor(spareHealBodySize));

						numHealerMove = extraRA + requiredHealsPerCreep + extraHeals;
						numHealerHeals = requiredHealsPerCreep + extraHeals;
					}

					let attackerTough = 0;

					let actualHealPower = 2 * numHealerHeals * healPower;
					// Life is complicated. There are breakpoints that'd be nice to reach that aren't really the base of my calculation.
					// If we can push a bit to make those breakpoints, then do that.
					if (extraRA > 0 && (canHealerUseMoveBoost || spareHealEnergy >= extraRA * (BODYPART_COST[HEAL] - BODYPART_COST[RANGED_ATTACK]))) {
						for (let i = 0; i < 3; i++) {
							let actualIncomingDamageTest = i * (mem.bestCreepCombatPartsAttack || 0) * ATTACK_POWER + extraCreepDamageRanged + maxTowerDamage

							if (actualHealPower <= actualIncomingDamageTest && actualHealPower + 2 * extraRA * healPower >= actualIncomingDamageTest) {
								let diff = Math.ceil((actualIncomingDamageTest - actualHealPower) / (2 * healPower));
								if (diff <= extraRA) {
									extraRA -= diff;
									numHealerHeals += diff;
									actualHealPower = 2 * numHealerHeals * healPower;
								}
							}
						}
					}

					if (toughBoostSmall && !toughBoostSingle) {
						// How have we worked out here. Should we try pushing on a little extra tough? Allow up to three.

						let smallToughScale = 1;
						if (toughBoostSmall == RESOURCE_CATALYZED_GHODIUM_ALKALIDE) {
							smallToughScale = 1 / 0.3;
						}
						else if (toughBoostSmall == RESOURCE_GHODIUM_ALKALIDE) {
							smallToughScale = 1 / 0.5;
						}
						else {
							smallToughScale = 1 / 0.7;
						}


						// One tough part increases our actual heal power by the extra hitpoints of the tough part
						let extraHealPerAttackerTough = 100 * smallToughScale - 100;

						// This is the most damage we think we're going to take.
						for (let i = 0; i < 3; i++) {
							let actualIncomingDamageTest = i * (mem.bestCreepCombatPartsAttack || 0) * ATTACK_POWER * (hostilesPush ? 2 : 1) + extraCreepDamageRanged + maxTowerDamage

							if (actualHealPower <= actualIncomingDamageTest && actualHealPower + 3 * extraHealPerAttackerTough >= actualIncomingDamageTest) {
								attackerTough = Math.max(attackerTough, Math.ceil((actualIncomingDamageTest - actualHealPower) / extraHealPerAttackerTough));
							}
						}
					}

					if (numMeleeParts > attackerTough) {
						numMeleeParts -= attackerTough;
					}
					else {
						attackerTough = 0;
					}

					var bodyH = [];
					var bodyD = [];
					let boostsH = {};
					let boostsA = {};
					let boostsD = {};

					if (toughBoostSingle) {
						bodyD.push(TOUGH)
						boostsD[toughBoostSingle] = (boostsD[toughBoostSingle] || 0) + 1;
					}
					else {
						for (var i = 0; i < attackerTough; i++) {
							bodyD.push(TOUGH)
							boostsD[toughBoostSmall] = (boostsD[toughBoostSmall] || 0) + 1;
						}
					}


					if (useAttackParts) {
						for (var i = 0; i < numMeleeParts; i++) {
							bodyD.push(ATTACK)
							if (attackBoost) {
								boostsD[attackBoost] = (boostsD[attackBoost] || 0) + 1;
							}
						}
					}
					else {
						for (var i = 0; i < numMeleeParts; i++) {
							bodyD.push(WORK)
							if (dismantleBoost) {
								boostsD[dismantleBoost] = (boostsD[dismantleBoost] || 0) + 1;
							}
						}
					}

					for (var i = 0; i < numMeleeRangedParts; i++) {
						bodyD.push(RANGED_ATTACK)
						if (rangedBoost) {
							boostsD[rangedBoost] = (boostsD[rangedBoost] || 0) + 1;
						}
					}
					for (var i = 0; i < numMeleeMove; i++) {
						bodyD.push(MOVE)
						if (moveBoost && useBoost) {
							if (i < numMeleeMove - 1 || moveScale == 4) {
								boostsD[moveBoost] = (boostsD[moveBoost] || 0) + 1;
							}
						}
					}

					if (toughBoostSingle) {
						bodyH.push(TOUGH)
						boostsH[toughBoostSingle] = (boostsH[toughBoostSingle] || 0) + 1;
					}

					for (var i = 0; i < extraCarry; i++) {
						bodyH.push(MOVE)
					}
					for (var i = 0; i < extraRA; i++) {
						bodyH.push(RANGED_ATTACK)
						if (rangedBoost) {
							boostsH[rangedBoost] = (boostsH[rangedBoost] || 0) + 1;
						}
					}
					for (var i = 0; i < Math.floor(numHealerMove / 2); i++) {
						bodyH.push(MOVE)
						if (moveBoost && useBoost && canHealerUseMoveBoost) {
							boostsH[moveBoost] = (boostsH[moveBoost] || 0) + 1;
						}
					}
					for (var i = 0; i < numHealerHeals; i++) {
						bodyH.push(HEAL)
						if (healBoost && useBoost) {
							boostsH[healBoost] = (boostsH[healBoost] || 0) + 1;
						}
					}
					for (var i = 0; i < Math.ceil(numHealerMove / 2) - 1; i++) {
						bodyH.push(MOVE)
						if (moveBoost && useBoost && canHealerUseMoveBoost) {
							boostsH[moveBoost] = (boostsH[moveBoost] || 0) + 1;
						}
					}


					bodyH.push(MOVE);
					if (moveBoost && useBoost && canHealerUseMoveBoost && moveScale == 4) {
						boostsH[moveBoost] = (boostsH[moveBoost] || 0) + 1;
					}

					for (var i = 0; i < 2; i++) {
						returnObject.roles.push("ranged");
						returnObject.bodies.push(bodyH);
						returnObject.boosts.push(boostsH);
						returnObject.formation.push(true);
						returnObject.formationPos.push(returnObject.formationPos.length);
					}
					for (var i = 0; i < 2; i++) {
						if (useAttackParts) {
							returnObject.roles.push("tank");
						}
						else {
							returnObject.roles.push("deconstructor");
						}
						returnObject.bodies.push(bodyD);
						returnObject.boosts.push(boostsD);
						returnObject.formation.push(true);
						returnObject.formationPos.push(returnObject.formationPos.length);
					}
				}
				else {
					if (Memory.debugAssaultSpawning) {
						console.log("closeCombat spawn request failed #1")
					}

					return;
				}
			}

			if (!useAttackParts) {
				guardCount += 1;
			}
		}
		else {
			if (firstLaunch && (!mem.invCL || mem.invCL == 5)) {
				if (healPower == 48) {
					if (!rangedBoost || BOOSTS[RANGED_ATTACK][rangedBoost]["rangedAttack"] < 3){
						if (Memory.debugAssaultSpawning) {
							console.log("Plan failed first launch #11")
						}

						return;
					}
				}
				else if (healPower == 36) {
					if (!rangedBoost || BOOSTS[RANGED_ATTACK][rangedBoost]["rangedAttack"] < 2){
						if (Memory.debugAssaultSpawning) {
							console.log("Plan failed first launch #12")
						}

						return;
					}
				}
				else if (healPower == 24 && !rangedBoost && numWaves > 1) {
					if (Memory.debugAssaultSpawning) {
						console.log("Plan failed first launch #13")
					}
					return;
				}
				else if (rangedBoost && BOOSTS[RANGED_ATTACK][rangedBoost]["rangedAttack"] == 4) {
					if (healPower < 36) {
						if (Memory.debugAssaultSpawning) {
							console.log("Plan failed first launch #14")
						}
						return;
					}
				}
				else if (rangedBoost && BOOSTS[RANGED_ATTACK][rangedBoost]["rangedAttack"] == 3) {
					if (healPower < 24) {
						if (Memory.debugAssaultSpawning) {
							console.log("Plan failed first launch #15")
						}
						return;
					}
				}
				else if (rangedBoost && healPower == 12 && numWaves > 1) {
					if (Memory.debugAssaultSpawning) {
						console.log("Plan failed first launch #16")
					}
					return;
				}
			}

			// Two paths here: regular creeps and mega-creeps. Regular don't use boosted move/tough, mega uses top tier boosts as much as possible.
			// On the whole we don't want to mess about combining good boosts with bad/unboosted, so make sure we have everything.
			let doesHealMoveComboWork = false;

			if (toughBoost == RESOURCE_CATALYZED_GHODIUM_ALKALIDE) {
				function canDoTowerCount(moveScale, effectiveTowerCount, effectiveTowerCountRanged, healPower, maxHealPerTower, minHealPerTower) {
					let parts = MAX_CREEP_SIZE - (moveScale == 4 ? 10 : (moveScale == 3 ? 13 : (moveScale == 2 ? 17 : 25)))
					let healParts = parts - Math.ceil(getNumHealerT3ToughForRangedDamageEffectiveTowerCount(effectiveTowerCountRanged)) - 10

					return (4 * healParts * healPower * healScale) > effectiveTowerCountRanged * maxHealPerTower
				}

				doesHealMoveComboWork = false; //canDoTowerCount(moveScale, effectiveTowerCountMax, effectiveTowerCountRanged, healPower, maxHealPerTower, minHealPerTower)
			}
			/*else if (toughBoost == RESOURCE_GHODIUM_ALKALIDE) {
				if (healPower == 48) {
					if (effectiveTowerCountMax <= 3.5 && moveScale >= 2) {
						doesHealMoveComboWork = true;
					}
					if (effectiveTowerCountMax <= 2.5) {
						doesHealMoveComboWork = true;
					}
				}
				else if (healPower == 36) {
					if (effectiveTowerCountMax <= 3 && moveScale >= 2) {
						doesHealMoveComboWork = true;
					}
					else if (effectiveTowerCountMax <= 2) {
						doesHealMoveComboWork = true;
					}
				}
			}*/

			// Disable tough boosted ranged for now until I fix it.
			doesHealMoveComboWork = false

			if (logging) {
				console.log("Ranged assault test", parentRoom.energyCapacityAvailable, 40 * 250 + 10 * 50, restrictBoosts, moveBoost, toughBoost, rangedBoost, healPower)
			}

			// THIS IS NEVER CALLED AS doesHealMoveComboWork = false ABOVE!!!!!!!!!!!!!!!!
			if (roomIsDangerous && parentRoom.energyCapacityAvailable >= 40 * 250 + 10 * 50 && doesHealMoveComboWork && toughBoost && rangedBoost) {
				// Ok, we can get 40 heals and 10 move, so we can get anything!

				// 10/12/16/25 => 50/48/48/50
				let numMove = moveScale == 4 ? 10 : (moveScale == 3 ? 13 : (moveScale == 2 ? 17 : 25))
				let numParts = moveScale == 4 ? 40 : (moveScale == 3 ? 37 : (moveScale == 2 ? 33 : 25))

				let minRA = 10;
				let numTough = 0;
				let numHeals;
				let numRA;

				numTough = Math.ceil((maxHealPerTower * effectiveTowerCountMax) / (100 * healScale));
				numHeals = Math.min(numParts - numTough - minRA, Math.ceil(maxHealPerTower * effectiveTowerCountMax / (4 * healPower * healScale)));
				numRA = numParts - numTough - numHeals;

				let shifted = edgeWalls ? 0 : Math.min(numRA - 1, Math.floor(numHeals / 2));

				if (mem.advBlkDmg > 0.25 && !edgeWalls) {
					shifted = Math.min(numRA - 1, Math.round(shifted * 1.5));
				}

				let numHealFront = numHeals - shifted;
				let numHealBack = numHeals + shifted;

				let numRAFront = numRA + shifted;
				let numRABack = numRA - shifted;

				if (edgeWalls && !edgeWallsLow) {
					let newRABack = Math.round(numRABack / 2);
					numHealBack += numRABack - newRABack;
					numRABack = newRABack;
				}

				let numToughFront = numTough;
				let numToughBack = numTough;

				if (edgeWalls && !edgeWallsLow) {
					numToughBack = Math.round(numToughBack / 2);
					numHealBack += numTough - numToughBack;
				}


				returnObject.squadHeal = 2 * (numHealFront + numHealBack) * healPower;

				if (numHealFront != numHealBack || numRAFront != numRABack || numToughFront != numToughBack) {
					returnObject.directional = true;
				}

				let body = [];
				let boosts = {};


				for (var i = 0; i < numToughBack; i++) {
					body.push(TOUGH)
					boosts[toughBoost] = (boosts[toughBoost] || 0) + 1;
				}

				for (var i = 0; i < numRABack; i++) {
					body.push(RANGED_ATTACK)
					boosts[rangedBoost] = (boosts[rangedBoost] || 0) + 1;
				}

				for (var i = 0; i < numMove - 1; i++) {
					body.push(MOVE)
					if (moveBoost) {
						boosts[moveBoost] = (boosts[moveBoost] || 0) + 1;
					}
				}

				for (var i = 0; i < numHealBack; i++) {
					body.push(HEAL)
					boosts[healBoost] = (boosts[healBoost] || 0) + 1;
				}

				body.push(MOVE);
				if (moveBoost) {
					boosts[moveBoost] = (boosts[moveBoost] || 0) + 1;
				}

				for (var i = 0; i < 2; i++) {
					returnObject.roles.push("ranged");
					returnObject.bodies.push(body);
					returnObject.boosts.push(boosts);
					returnObject.formation.push(true);
					returnObject.formationPos.push(returnObject.formationPos.length);
				}

				body = [];
				boosts = {};

				for (var i = 0; i < numToughFront; i++) {
					body.push(TOUGH)
					boosts[toughBoost] = (boosts[toughBoost] || 0) + 1;
				}

				for (var i = 0; i < numRAFront; i++) {
					body.push(RANGED_ATTACK)
					boosts[rangedBoost] = (boosts[rangedBoost] || 0) + 1;
				}

				for (var i = 0; i < numMove - 1; i++) {
					body.push(MOVE)
					if (moveBoost) {
						boosts[moveBoost] = (boosts[moveBoost] || 0) + 1;
					}
				}

				for (var i = 0; i < numHealFront; i++) {
					body.push(HEAL)
					boosts[healBoost] = (boosts[healBoost] || 0) + 1;
				}

				body.push(MOVE);
				if (moveBoost) {
					boosts[moveBoost] = (boosts[moveBoost] || 0) + 1;
				}

				for (var i = 0; i < 2; i++) {
					returnObject.roles.push("ranged");
					returnObject.bodies.push(body);
					returnObject.boosts.push(boosts);
					returnObject.formation.push(true);
					returnObject.formationPos.push(returnObject.formationPos.length);
				}



			}
			else {
				// We need healing. If we can get maxHealPerTower without boosting, do that.
				let requiredHealsPerCreepBoosted;
				let requiredHealsPerCreepCheap;
				if (realNumTowers > 0 || minHeal) {
					requiredHealsPerCreepBoosted = Math.ceil(minHealPerTower * effectiveTowerCountMin / (squadSize * healPower));
					requiredHealsPerCreepCheap = Math.ceil(maxHealPerTower * effectiveTowerCountMax / (squadSize * 12));

					// There are towers, but they're not fighting back
					if (!roomIsDangerous) {
						requiredHealsPerCreepBoosted = Math.round(requiredHealsPerCreepBoosted / 2);
						requiredHealsPerCreepCheap = Math.round(requiredHealsPerCreepCheap / 2);
					}
					requiredHealsPerCreepBoosted = Math.max(2, requiredHealsPerCreepBoosted);
					requiredHealsPerCreepCheap = Math.max(2, requiredHealsPerCreepCheap);

				}
				else {
					requiredHealsPerCreepBoosted = 2;
					requiredHealsPerCreepCheap = 2;
				}

				if (Memory.debugAssaultSpawning) {
					console.log("assault spawn rhpc", requiredHealsPerCreepBoosted, minHealPerTower, effectiveTowerCountMin, squadSize * healPower)
				}



				let requiredRAPerCreep;

				if (parentRoom.effectiveLevel < 7) {
					requiredRAPerCreep = 4;
				}
				else if (parentRoom.effectiveLevel == 7) {
					requiredRAPerCreep = 7;
				}
				else {
					if (moveScale == 2) {
						requiredRAPerCreep = 11;
					}
					else if (moveScale == 3) {
						requiredRAPerCreep = 12;
					}
					else if (moveScale == 4) {
						requiredRAPerCreep = 13;
					}
					else {
						requiredRAPerCreep = 10;
					}
					// Ok, well, it's not like we can build any better!
					if (moveScale == 4 && healPower == 4 * HEAL_POWER && rangedBoost && BOOSTS[RANGED_ATTACK][rangedBoost]["rangedAttack"] == 4) {
						requiredRAPerCreep = Math.round(requiredRAPerCreep / 2);
					}
				}

				let requiredHealsPerCreep;
				let useBoost = !restrictBoosts;
				// Ok, we can do it on the cheap
				// Not sure why 9 is required here
				if (squadSize == 9 || (parentRoom.energyCapacityAvailable - 300 * requiredHealsPerCreepCheap - 200 * requiredRAPerCreep >= 0 && requiredHealsPerCreepCheap <= Math.round(MAX_CREEP_SIZE / 2))) {
					healBoost = undefined;
					healPower = 12;
					requiredHealsPerCreep = requiredHealsPerCreepCheap;
				}
				else {
					requiredHealsPerCreep = requiredHealsPerCreepBoosted;
				}

				let canUseMoveBoostFull = false;

				let numMove = requiredHealsPerCreep + requiredRAPerCreep;
				let numParts = requiredHealsPerCreep + requiredRAPerCreep;

				let movePartsForMoveScale = moveScale == 4 ? 10 : (moveScale == 3 ? 13 : (moveScale == 2 ? 17 : 25))

				if (useBoost && parentRoom.energyCapacityAvailable >= (MAX_CREEP_SIZE - movePartsForMoveScale) * BODYPART_COST[HEAL] + movePartsForMoveScale * BODYPART_COST[MOVE])  {
					canUseMoveBoostFull = true;

					numMove = movePartsForMoveScale
					numParts = MAX_CREEP_SIZE - movePartsForMoveScale;
				}
				else {
					if (parentRoom.effectiveLevel < 7) {
						requiredRAPerCreep = 4;
					}
					else if (parentRoom.effectiveLevel == 7) {
						requiredRAPerCreep = 7;
					}
					else {
						requiredRAPerCreep = 10
					}

					// If towers are constantly shooting we don't have to do so much damage
					if (drain) {
						requiredRAPerCreep = Math.round(requiredRAPerCreep / (1 + (mem.towerShoots || 0)))
					}

					numMove = requiredHealsPerCreep + requiredRAPerCreep;
					numParts = requiredHealsPerCreep + requiredRAPerCreep;
				}



				if (!useBoost) {
					toughBoostSingle = undefined;
				}

				if (toughBoostSingle) {
					numParts -= 1;
				}

				// This is for not move boosted
				let spareEnergy = parentRoom.energyCapacityAvailable - 300 * requiredHealsPerCreep - 200 * requiredRAPerCreep;
				let spareBodySize = MAX_CREEP_SIZE - 2 * numParts;

				if (Memory.debugAssaultSpawning) {
					console.log("assault spawn info bawtgjh", requiredHealsPerCreep, requiredRAPerCreep, spareEnergy, spareBodySize)
				}

				// canUseMoveBoostFull is only true if we can do max heal with the moveboost number of move parts (ie. top tier room)
				// This means I don't need to worry about shifted moving the energy around badly.
				if (useBoost && canUseMoveBoostFull && (numParts - requiredRAPerCreep) * (toughBoostSingle ? 1.05 : 1) >= requiredHealsPerCreep) {
					let numHeals = Math.min(numParts - requiredRAPerCreep, requiredHealsPerCreep);
					let numRA = requiredRAPerCreep;

					let numHealFront;
					let numHealBack;

					let numRAFront;
					let numRABack;

					let numToughFront;
					let numToughBack;


					if (cornerNibble) {
						if (toughBoostCorner) {
							numHeals = Math.ceil(Math.max(requiredHealsPerCreep * BOOSTS[TOUGH][toughBoostCorner]["damage"], minHealPerTower * effectiveTowerCountRanged / (2 * healPower)));
						}
						else {
							numHeals = Math.ceil(minHealPerTower * effectiveTowerCountRanged / (2 * healPower));	
						}

						// All the heals on the back
						numHealFront = 0;
						numHealBack = numHeals

						// This is the guy who is meant to get hit
						numToughFront = toughBoostCorner ? Math.ceil(minHealPerTower * effectiveTowerCountMin * BOOSTS[TOUGH][toughBoostCorner]["damage"] / 100) : 0
						numToughBack = 0;

						numRAFront = MAX_CREEP_SIZE - movePartsForMoveScale - numToughFront;
						numRABack = MAX_CREEP_SIZE - movePartsForMoveScale - numHeals

						returnObject.squadHeal = (squadSize - 1) * numHealBack * healPower
					}
					else {
						if ((mem.invCL || 0) == 5 || Memory.debugAssaultSpawning) {
							console.log("assault spawn info aiohfef", minHealPerTower, maxHealPerTower, maxAccountedForEnemyAttack, maxAccountedForEnemyRanged, powerMod, effectiveTowerCountMin, effectiveTowerCountMax, numHeals, numRA)
						}

						let shifted = edgeWalls ? 0 : Math.min(numHeals, numRA, Math.floor(numHeals / 2));

						if ((mem.advBlkDmg > 0.25 && !edgeWalls) || mem.invCL) {
							if (mem.invCL) {
								shifted = Math.min(numRA, numHeals, Math.round(shifted * 2));
							}
							else {
								shifted = Math.min(numRA, numHeals, Math.round(shifted * 1.5));
							}
								
							// TODO: Change this to cover all mega-assaults
							if ((mem.towerShootsAtStrongholdMax || 0) > (mem.invCL ? 0.9 : 0.9999)) {
								shifted = Math.min(numRA, numHeals);
							}
							else if ((mem.towerShootsAtClosest || 0) > (mem.invCL ? 0.9 : 0.9999)) {
								shifted = Math.min(numRA, numHeals);
							}
						}


						numHealFront = numHeals - shifted;
						numHealBack = numHeals + shifted;

						numRAFront = numRA + shifted;
						numRABack = numRA - shifted;

						numToughFront = 0;
						numToughBack = 0;

						let mediumToughScale = 1;
						let mediumToughHitAborb = 100;
						if (toughBoostMedium) {						
							if (toughBoostMedium == RESOURCE_CATALYZED_GHODIUM_ALKALIDE) {
								mediumToughScale = 1 / 0.3;
							}
							else if (toughBoostMedium == RESOURCE_GHODIUM_ALKALIDE) {
								mediumToughScale = 1 / 0.5;
							}
							else {
								mediumToughScale = 1 / 0.7;
							}
						}

						mediumToughHitAborb = (mediumToughScale - 1) * 100; 

						let avgDamage = (effectiveTowerCountMin * minHealPerTower + effectiveTowerCountMax * maxHealPerTower) / 2;

						// Kinda cheating.
						let allowToughBack = !mem.invCL || mem.invCL != 5

						// Game.notify(toughBoostMedium + "_" + mediumToughHitAborb + "_" + avgDamage)
						// console.log(toughBoostMedium + "_" + mediumToughHitAborb + "_" + avgDamage)
						// Game.notify(numHealBack + "_" + numRABack + "_" + numToughBack)
						// console.log(numHealBack + "_" + numRABack + "_" + numToughBack)
						// Game.notify(numHealFront + "_" + numRAFront + "_" + numToughFront)
						// console.log(numHealFront + "_" + numRAFront + "_" + numToughFront)
						// Game.notify(avgDamage - numToughBack * mediumToughHitAborb > MAX_CREEP_SIZE * 100 * 0.3)
						// console.log(avgDamage - numToughBack * mediumToughHitAborb > MAX_CREEP_SIZE * 100 * 0.3)
						// Game.notify(avgDamage - numToughFront * mediumToughHitAborb > MAX_CREEP_SIZE * 100 * 0.3)
						// console.log(avgDamage - numToughFront * mediumToughHitAborb > MAX_CREEP_SIZE * 100 * 0.3)

						while (numHealBack + numRABack + numToughBack < numParts) {
							if (allowToughBack && toughBoostMedium && numToughBack < 5 && avgDamage - numToughBack * mediumToughHitAborb > MAX_CREEP_SIZE * 100 * 0.3) {
								numToughBack++
							}
							else if ((numHealBack + numHealFront) / 2 < Math.ceil(maxHealPerTower * effectiveTowerCountMax / (squadSize * healPower)) && numHealBack + numRABack + numToughBack < numParts) {
								numHealBack++;
							}
							else if (numHealBack + numRABack + numToughBack < numParts) {
								numRABack++;
							}
						}

						while (numHealFront + numRAFront + numToughFront < numParts) {
							if (toughBoostMedium && numToughFront < 5 && avgDamage - numToughFront * mediumToughHitAborb > MAX_CREEP_SIZE * 100 * 0.3) {
								numToughFront++
							}
							else {							
								if (numHealFront + numRAFront + numToughFront < numParts) {
									numRAFront++;
								}
								if (numHealFront + numRAFront + numToughFront < numParts) {
									numRAFront++;
								}
								if ((numHealBack + numHealFront) / 2 < Math.ceil(maxHealPerTower * effectiveTowerCountMax / (squadSize * healPower)) && numHealFront + numRAFront + numToughFront < numParts) {
									numHealFront++;
								}
							}
						}
						returnObject.squadHeal = (squadSize / 2) * (numHealBack + numHealFront) * healPower

						if (toughBoostSingleEdgeWall) {
							numRAFront -= 1;
						}

					}
					if (numHealFront != numHealBack || numRAFront != numRABack || numToughFront != numToughBack) {
						returnObject.directional = true;
					}


					let body = [];
					let boosts = {};

					if (toughBoostSingle) {
						body.push(TOUGH)
						boosts[toughBoostSingle] = 1;
					}

					for (var i = 0; i < Math.floor(numToughBack / 2); i++) {
						body.push(TOUGH)
					}

					for (var i = 0; i < numRABack; i++) {
						body.push(RANGED_ATTACK)
					}

					if (rangedBoost) {
						boosts[rangedBoost] = numRABack;
					}

					for (var i = 0; i < Math.ceil(numToughBack / 2); i++) {
						body.push(TOUGH)
					}

					// for (var i = 0; i < Math.floor((numMove - 2) / 2); i++) {
					// 	body.push(MOVE)
					// }

					// for (var i = 0; i < Math.floor(numToughBack / 2); i++) {
					// 	body.push(TOUGH)
					// }

					// for (var i = 0; i < Math.ceil((numMove - 2) / 2); i++) {
					// 	body.push(MOVE)
					// }
					for (var i = 0; i < numMove - 2; i++) {
						body.push(MOVE)
					}

					// for (var i = 0; i < Math.ceil(numToughBack / 4); i++) {
						// body.push(TOUGH)
					// }


					if (toughBoostMedium) {
						boosts[toughBoostMedium] = numToughBack;
					}

					if (moveBoost) {
						boosts[moveBoost] = numMove - ((moveScale == 2 || moveScale == 3) ? 1 : 0);
					}

					for (var i = 0; i < numHealBack; i++) {
						body.push(HEAL)
					}
					if (healBoost) {
						boosts[healBoost] = numHealBack;
					}

					body.push(MOVE)
					body.push(MOVE)

					for (var i = 0; i < (cornerNibble ? squadSize - 1 : squadSize / 2); i++) {
						returnObject.roles.push("ranged");
						returnObject.bodies.push(body);
						returnObject.boosts.push(boosts);
						returnObject.formation.push(true);
						returnObject.formationPos.push(returnObject.formationPos.length);
					}

					body = [];
					boosts = {};

					if (toughBoostSingle) {
						body.push(TOUGH)
						boosts[toughBoostSingle] = 1;
					}
					else if (toughBoostSingleEdgeWall) {
						body.push(TOUGH)
						boosts[toughBoostSingleEdgeWall] = 1;
					}


					for (var i = 0; i < Math.floor(numToughFront / 2); i++) {
						body.push(TOUGH)
					}

					for (var i = 0; i < numRAFront; i++) {
						body.push(RANGED_ATTACK)
					}

					for (var i = 0; i < Math.ceil(numToughFront / 2); i++) {
						body.push(TOUGH)
					}

					if (rangedBoost) {
						boosts[rangedBoost] = numRAFront;
					}

					// for (var i = 0; i < Math.floor((numMove - 2) / 2); i++) {
					// 	body.push(MOVE)
					// }

					// for (var i = 0; i < Math.floor(numToughFront / 4); i++) {
					// 	body.push(TOUGH)
					// }

					// for (var i = 0; i < Math.ceil((numMove - 2) / 2); i++) {
					// 	body.push(MOVE)
					// }

					for (var i = 0; i < numMove - 2; i++) {
						body.push(MOVE)
					}

					// for (var i = 0; i < Math.ceil(numToughFront / 4); i++) {
					// 	body.push(TOUGH)
					// }

					if (toughBoostMedium) {
						boosts[toughBoostMedium] = numToughFront;
					}

					if (moveBoost) {
						boosts[moveBoost] = numMove - ((moveScale == 2 || moveScale == 3) ? 1 : 0);
					}

					for (var i = 0; i < numHealFront; i++) {
						body.push(HEAL)
					}
					if (healBoost) {
						boosts[healBoost] = numHealFront;
					}

					body.push(MOVE)
					body.push(MOVE)

					for (var i = 0; i < (cornerNibble ? 1 : squadSize / 2); i++) {
						returnObject.roles.push("ranged");
						returnObject.bodies.push(body);
						returnObject.boosts.push(boosts);
						returnObject.formation.push(true);
						returnObject.formationPos.push(returnObject.formationPos.length);
					}
				}
				else if (useBoost && moveBoost && !canUseMoveBoostFull) {
					// Build the creep using loops. I'd prefer a closed form solution like the other two.
					// This builder can fail, but if it fails, the one below would fail as well.
					let creepSize = 0;
					let creepCost;

					let lastNumMove = 0;
					let lastNumRanged = 0;
					let lastNumHeal = 0;
					let lastNumTough = 0;

					let numMove = 0;
					let numRanged = 0;
					let numHeal = 0;
					let numTough = 0;

					while (1) {
						let creepCost = numMove * BODYPART_COST[MOVE] + numHeal * BODYPART_COST[HEAL] + numRanged * BODYPART_COST[RANGED_ATTACK];
						let creepParts = numMove + numHeal + numRanged;
						if (creepCost > parentRoom.energyCapacityAvailable || creepParts > MAX_CREEP_SIZE) {
							numMove = lastNumMove;
							numRanged = lastNumRanged;
							numHeal = lastNumHeal;
							numTough = lastNumTough;
							break;
						}
						lastNumMove = numMove;
						lastNumRanged = numRanged;
						lastNumHeal = numHeal;
						lastNumTough = numTough;

						if (numRanged + numHeal + numTough >= numMove * moveScale) {
							numMove++;
						}
						else if (numHeal < requiredHealsPerCreep) {
							numHeal++;
						}
						else if (numRanged < requiredRAPerCreep) {
							numRanged++;
						}
						else {
							break;
						}
					}

					// Ok, we should have the required parts if not, terminate
					if (numHeal < requiredHealsPerCreep || numRanged < requiredRAPerCreep) {
						if (Memory.debugAssaultSpawning) {
							console.log("regular spawn request failed")
						}

						if (logging || Memory.debugAssaultSpawning) console.log("regular spawn request failed", squadSize, spareEnergy, spareBodySize, requiredHealsPerCreep, escalation)
						return;
					}

					// Woohoo. Now add extras.
					let numHealFront = numHeal;
					let numHealBack = numHeal;

					let numRAFront = numRanged;
					let numRABack = numRanged;

					let numMoveFront = numMove;
					let numMoveBack = numMove;

					let numToughFront = numTough;
					let numToughBack = numTough;

					// We don't need tough to increase our heal per sec, we need it to reduce TTK.

					lastNumMove = numMove;
					lastNumRanged = numRanged;
					lastNumHeal = numHeal;
					lastNumTough = numTough;

					let mediumToughScale = 1;
					let mediumToughHitAborb = 100;
					if (toughBoostMedium) {						
						if (toughBoostMedium == RESOURCE_CATALYZED_GHODIUM_ALKALIDE) {
							mediumToughScale = 1 / 0.3;
						}
						else if (toughBoostMedium == RESOURCE_GHODIUM_ALKALIDE) {
							mediumToughScale = 1 / 0.5;
						}
						else {
							mediumToughScale = 1 / 0.7;
						}
					}

					mediumToughHitAborb = (mediumToughScale - 1) * 100; 
					let avgDamage = (effectiveTowerCountMin * minHealPerTower + effectiveTowerCountMax * maxHealPerTower) / 2;


					while (1) {
						let creepCost = numMoveBack * BODYPART_COST[MOVE] + numHealBack * BODYPART_COST[HEAL] + numRABack * BODYPART_COST[RANGED_ATTACK] + numToughBack * BODYPART_COST[TOUGH];
						let creepParts = numMoveBack + numHealBack + numRABack + numToughBack;
						if (creepCost > parentRoom.energyCapacityAvailable || creepParts > MAX_CREEP_SIZE) {
							numMoveBack = lastNumMove;
							numRABack = lastNumRanged;
							numHealBack = lastNumHeal;
							numToughBack = lastNumTough;							
							break;
						}
						lastNumMove = numMoveBack;
						lastNumRanged = numRABack;
						lastNumHeal = numHealBack;
						lastNumTough = numToughBack;

						if (numRABack + numHealBack + numToughBack >= Math.round(numMoveBack * moveScale)) {
							returnObject.directional = 1
							numMoveBack++;
						}
						// Try to keep max damage to half creep body size.
						else if (toughBoostMedium && numToughBack < 5 && avgDamage - numToughBack * mediumToughHitAborb > MAX_CREEP_SIZE * 100 * 0.3) {
							returnObject.directional = 1
							numToughBack++
						}
						else {
							returnObject.directional = 1
							numHealBack++;
						}

					}

					// Couldn't get more heal on the back. Try ranged then tough if we have too many move parts.
					while (numMoveBack / moveScale > numRABack + numHealBack + numToughBack && creepParts < MAX_CREEP_SIZE) {
						let creepCost = numMoveBack * BODYPART_COST[MOVE] + numHealBack * BODYPART_COST[HEAL] + numRABack * BODYPART_COST[RANGED_ATTACK] + numToughBack * BODYPART_COST[TOUGH];
						if (creepCost + BODYPART_COST[RANGED_ATTACK] <= parentRoom.energyCapacityAvailable) {
							returnObject.directional = 1
							numRABack++;
						}
						else if (creepCost + BODYPART_COST[TOUGH] <= parentRoom.energyCapacityAvailable) {
							returnObject.directional = 1
							numToughBack++;
						}
						else {
							break;
						}
					}

					lastNumMove = numMove;
					lastNumRanged = numRanged;
					lastNumHeal = numHeal;
					lastNumTough = numTough;

					while (1) {
						let creepCost = numMoveFront * BODYPART_COST[MOVE] + numHealFront * BODYPART_COST[HEAL] + numRAFront * BODYPART_COST[RANGED_ATTACK] + numToughFront * BODYPART_COST[TOUGH];
						let creepParts = numMoveFront + numHealFront + numRAFront + numToughFront;
						if (creepCost > parentRoom.energyCapacityAvailable || creepParts > MAX_CREEP_SIZE) {
							numMoveFront = lastNumMove;
							numRAFront = lastNumRanged;
							numHealFront = lastNumHeal;
							numToughFront = lastNumTough;							
							break;
						}
						lastNumMove = numMoveFront;
						lastNumRanged = numRAFront;
						lastNumHeal = numHealFront;
						lastNumTough = numToughFront;

						if (numRAFront + numHealFront + numToughFront >= Math.round(numMoveFront * moveScale)) {
							returnObject.directional = 1
							numMoveFront++;
						}
						// Try to keep max damage to half creep body size.
						else if (toughBoostMedium && numToughFront < 5 && avgDamage - numToughFront * mediumToughHitAborb > MAX_CREEP_SIZE * 100 * 0.3) {
							returnObject.directional = 1
							numToughFront++
						}
						else {
							returnObject.directional = 1
							numRAFront++;
						}
					}

					// Couldn't get more ranged on the front. Try tough if we have too many move parts.
					while (numMoveFront / moveScale > numRAFront + numHealFront + numToughFront && creepParts < MAX_CREEP_SIZE) {
						let creepCost = numMoveFront * BODYPART_COST[MOVE] + numHealFront * BODYPART_COST[HEAL] + numRAFront * BODYPART_COST[RANGED_ATTACK] + numToughFront * BODYPART_COST[TOUGH];
						if (creepCost + BODYPART_COST[TOUGH] <= parentRoom.energyCapacityAvailable) {
						 	returnObject.directional = 1
							numToughFront++;
						}
						else {
							break;
						}
					}

					returnObject.squadHeal = (squadSize / 2) * (numHealBack + numHealFront) * healPower


					let body = [];
					let boosts = {};

					for (var i = 0; i < Math.ceil(numToughBack / 2); i++) {
						body.push(TOUGH)
					}

					for (var i = 0; i < numRABack; i++) {
						body.push(RANGED_ATTACK)
					}

					if (rangedBoost) {
						boosts[rangedBoost] = numRABack;
					}

					for (var i = 0; i < Math.floor(numToughBack / 2); i++) {
						body.push(TOUGH)
					}

					for (var i = 0; i < Math.floor((numMoveBack - 1) / 2); i++) {
						body.push(MOVE)
					}

					// for (var i = 0; i < Math.ceil(numToughBack / 3); i++) {
					// 	body.push(TOUGH)
					// }

					for (var i = 0; i < Math.ceil((numMoveBack - 1) / 2); i++) {
						body.push(MOVE)
					}

					if (toughBoostMedium) {
						boosts[toughBoostMedium] = numToughBack;
					}

					if (moveBoost) {
						boosts[moveBoost] = numMoveBack;
					}

					for (var i = 0; i < numHealBack; i++) {
						body.push(HEAL)
					}
					if (healBoost) {
						boosts[healBoost] = numHealBack;
					}

					body.push(MOVE)

					for (var i = 0; i < squadSize / 2; i++) {
						returnObject.roles.push("ranged");
						returnObject.bodies.push(body);
						returnObject.boosts.push(boosts);
						returnObject.formation.push(true);
						returnObject.formationPos.push(returnObject.formationPos.length);
					}

					body = [];
					boosts = {};

					for (var i = 0; i < Math.ceil(numToughFront / 2); i++) {
						body.push(TOUGH)
					}

					for (var i = 0; i < numRAFront; i++) {
						body.push(RANGED_ATTACK)
					}

					for (var i = 0; i < Math.floor(numToughFront / 2); i++) {
						body.push(TOUGH)
					}


					if (rangedBoost) {
						boosts[rangedBoost] = numRAFront;
					}

					for (var i = 0; i < Math.floor((numMoveFront - 1) / 2); i++) {
						body.push(MOVE)
					}

					// for (var i = 0; i < Math.ceil(numToughFront / 3); i++) {
					// 	body.push(TOUGH)
					// }

					for (var i = 0; i < Math.ceil((numMoveFront - 1) / 2); i++) {
						body.push(MOVE)
					}

					if (toughBoostMedium) {
						boosts[toughBoostMedium] = numToughFront;
					}

					if (moveBoost) {
						boosts[moveBoost] = numMoveFront;
					}

					for (var i = 0; i < numHealFront; i++) {
						body.push(HEAL)
					}
					if (healBoost) {
						boosts[healBoost] = numHealFront;
					}

					body.push(MOVE)

					for (var i = 0; i < squadSize / 2; i++) {
						returnObject.roles.push("ranged");
						returnObject.bodies.push(body);
						returnObject.boosts.push(boosts);
						returnObject.formation.push(true);
						returnObject.formationPos.push(returnObject.formationPos.length);
					}
				}
				else if (!canUseMoveBoostFull && spareEnergy >= 0 && spareBodySize >= 0) {
					// Heals up to maxHealPerTower
					let extraHealsNeededPerCreep = Math.max(0, Math.ceil(maxHealPerTower * effectiveTowerCountMax / (squadSize * healPower) - requiredHealsPerCreep));
					let extraHeals = 0;

					let spareHealEnergy = spareEnergy;
					let spareHealBodySize = spareBodySize;
					let spareRAEnergy = spareEnergy;
					let spareRABodySize = spareBodySize;

					let extraHealRA = 0;
					let extraRARA = 0;

					let extraHealCarry = 0;
					let extraRACarry = 0;

					if (extraHealsNeededPerCreep && squadSize == 4) {
						returnObject.directional = true;

						// *2 as split between two creeps not four
						extraHeals = Math.min(Math.floor(spareEnergy / 300), Math.floor(spareBodySize / 2), extraHealsNeededPerCreep * 2);

						returnObject.squadHeal = (4 * requiredHealsPerCreep + 2 * extraHeals) * healPower;

						spareHealEnergy -= extraHeals * 300;
						spareHealBodySize -= extraHeals * 2;

						extraRARA = Math.min(Math.floor(spareEnergy / 200), Math.floor(spareBodySize / 2));
						spareRAEnergy -= extraRARA * 200;
						spareRABodySize -= extraRARA * 2;

						extraHealRA = Math.min(Math.floor(spareHealEnergy / (BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE])), Math.floor(spareHealBodySize / 2));
						spareHealEnergy -= extraHealRA * (BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE]);
						spareHealBodySize -= extraHealRA * 2;

						extraHealCarry = Math.min(Math.floor(spareHealEnergy / BODYPART_COST[CARRY]), Math.floor(spareHealBodySize));
						spareHealEnergy -= extraHealCarry * BODYPART_COST[CARRY];
						spareHealBodySize -= extraHealCarry;

						extraRACarry = Math.min(Math.floor(spareRAEnergy / BODYPART_COST[CARRY]), Math.floor(spareRABodySize));
						spareRAEnergy -= extraRACarry * BODYPART_COST[CARRY];
						spareRABodySize -= extraRACarry;
					}
					else {
						extraHeals = Math.min(Math.floor(spareEnergy / 300), Math.floor(spareBodySize / 2), extraHealsNeededPerCreep);

						returnObject.squadHeal = squadSize * (requiredHealsPerCreep + extraHeals) * healPower;

						spareEnergy -= extraHeals * 300;
						spareBodySize -= extraHeals * 2;

						extraHealRA = Math.min(Math.floor(spareEnergy / 200), Math.floor(spareBodySize / 2));
						spareEnergy -= extraHealRA * 200;
						spareBodySize -= extraHealRA * 2;

						let extraCarry = Math.min(Math.floor(spareEnergy / BODYPART_COST[CARRY]), Math.floor(spareBodySize));
						spareEnergy -= extraCarry * BODYPART_COST[CARRY];
						spareBodySize -= extraCarry;

						extraHealCarry = extraCarry;
					}

					// console.log(requiredHealsPerCreep, requiredRAPerCreep, spareEnergy, spareBodySize, extraHeals, extraRA)

					// var maxCount = Math.min(Math.floor((parentRoom.energyCapacityAvailable - 300 * requiredHealsPerCreep) / (1 * 150 + 1 * 50)), Math.floor((MAX_CREEP_SIZE - 2 * requiredHealsPerCreep) / 2));

					let body = [];
					let boosts = {};

					for (var i = 0; i < extraHealCarry; i++) {
						body.push(MOVE)
					}

					for (var i = 0; i < requiredRAPerCreep + extraHealRA; i++) {
						body.push(RANGED_ATTACK)
						if (rangedBoost && useBoost) {
							boosts[rangedBoost] = (boosts[rangedBoost] || 0) + 1;
						}
					}

					for (var i = 0; i < requiredRAPerCreep + extraHealRA + requiredHealsPerCreep + extraHeals - 1; i++) {
						body.push(MOVE)
					}

					for (var i = 0; i < requiredHealsPerCreep + extraHeals; i++) {
						body.push(HEAL)
						if (healBoost && useBoost) {
							boosts[healBoost] = (boosts[healBoost] || 0) + 1;
						}
					}

					body.push(MOVE);

					// Weeeird
					if (body.length == 1) {
						console.log("WEIRDNESS IN FORMATION SPAWN PLAN!!!")
						console.log(extraHealCarry, requiredRAPerCreep, extraHealRA, requiredHealsPerCreep, extraHeals, spareEnergy, spareBodySize)
						console.log(maxHealPerTower, effectiveTowerCountMax, squadSize, healPower)
						Game.notify("WEIRDNESS IN FORMATION SPAWN PLAN!!!")
						Game.notify(extraHealCarry + " " + requiredRAPerCreep + " " + extraHealRA + " " + requiredHealsPerCreep + " " + extraHeals + " " + spareEnergy + " " + spareBodySize)
						Game.notify(maxHealPerTower + " " + effectiveTowerCountMax + " " + squadSize + " " + healPower + " " + extraCreepDamage)
						Game.notify(parentRoom.name + " " + targetRoomName)
					}

					for (var i = 0; i < (returnObject.directional ? 2 : squadSize); i++) {
						returnObject.roles.push("ranged");
						returnObject.bodies.push(body);
						returnObject.boosts.push(boosts);
						returnObject.formation.push(true);
						returnObject.formationPos.push(returnObject.formationPos.length);
					}

					if (returnObject.directional) {
						body = [];
						boosts = {};

						for (var i = 0; i < extraRACarry; i++) {
							body.push(MOVE)
						}

						for (var i = 0; i < requiredRAPerCreep + extraRARA; i++) {
							body.push(RANGED_ATTACK)
							if (rangedBoost && useBoost) {
								boosts[rangedBoost] = (boosts[rangedBoost] || 0) + 1;
							}
						}

						for (var i = 0; i < requiredRAPerCreep + extraRARA + requiredHealsPerCreep - 1; i++) {
							body.push(MOVE)
						}

						for (var i = 0; i < requiredHealsPerCreep; i++) {
							body.push(HEAL)
							if (healBoost && useBoost) {
								boosts[healBoost] = (boosts[healBoost] || 0) + 1;
							}
						}

						body.push(MOVE);

						for (var i = 0; i < 2; i++) {
							returnObject.roles.push("ranged");
							returnObject.bodies.push(body);
							returnObject.boosts.push(boosts);
							returnObject.formation.push(true);
							returnObject.formationPos.push(returnObject.formationPos.length);
						}
					}
				}
				else {
					if (Memory.debugAssaultSpawning || logging) {
						console.log("Plan failed regular spawn request failed")
						if (logging) console.log("regular spawn request failed", squadSize, spareEnergy, spareBodySize, requiredHealsPerCreep, escalation)
					}

					return;
				}
			}
		}

		// No main squad
		if (!returnObject.roles.length) {
			if (Memory.debugAssaultSpawning) {
				console.log("Plan failed returnObject.roles.length == 0")
			}

			return
		}

		if (closeCombat) {
			// Yeah, we're not really close combat any more
			if (proposedExtraCCRanged >= 30) {
				returnObject.closeCombat = 0	
			}
		}

		// No moons for ranged/heal
		if (!closeCombat || proposedExtraCCRanged > 15) {
			return returnObject;
		}

		let guardToughBoost = toughBoost || parentRoom.getAvailableBoost(util.isToughBoost, 12 * LAB_BOOST_MINERAL * (numWaves / 2));

		if (routeIsDangerous) {
			guardCount++
		}
		if (routeIsVeryDangerous && (!rangedBoost || !healBoost)) {
			guardCount++
		}
		if (roomIsDangerous && hostilesPush && guardToughBoost) {
			guardCount++
		}
		if (edgeWalls) {
			guardCount--;
		}

		if (parentRoom.effectiveLevel < 8) {
			guardCount--;
		}

		guardCount = Math.min(2, guardCount);

		if ((mem.invCL || 0)) {
			guardCount = 0
		}

		// Push guards on front to spawn first.
		if (guardCount > 0) {
			// In room extra firepower
			if (roomIsDangerous && hostilesPush && !edgeWalls) {			
				let damageTarget = maxTowerDamage * maxHealPerTower / TOWER_POWER_ATTACK

				let numToughNeeded = 0
				let numHealNeeded = 0
				let numRangedNeeded = 10
				if (guardToughBoost) {
					numToughNeeded = Math.ceil(damageTarget * BOOSTS[TOUGH][guardToughBoost]["damage"] / 100);
					if (healBoost) {
						numHealNeeded = Math.ceil(damageTarget * BOOSTS[TOUGH][guardToughBoost]["damage"] / (HEAL_POWER * BOOSTS[HEAL][healBoost][HEAL]));
					}
					else {
						numHealNeeded = Math.ceil(damageTarget * BOOSTS[TOUGH][guardToughBoost]["damage"] / HEAL_POWER);
					}
				}
				else {
					if (healBoost) {
						numHealNeeded = Math.ceil(damageTarget / (HEAL_POWER * BOOSTS[HEAL][healBoost][HEAL]));
					}
					else {
						numHealNeeded = Math.ceil(damageTarget / HEAL_POWER);
					}
				}

				let numActiveParts = (moveScale == 4 ? 40 : (moveScale == 3 ? 37 : (moveScale == 2 ? 33 : 25)));

				numRangedNeeded = Math.max(numRangedNeeded, numActiveParts - numHealNeeded - numToughNeeded);
				let numMoveNeeded = MAX_CREEP_SIZE - numActiveParts;
				let cost = numToughNeeded * BODYPART_COST[TOUGH] +
						   numHealNeeded * BODYPART_COST[HEAL] +
				 		   numRangedNeeded * BODYPART_COST[RANGED_ATTACK] +
						   numMoveNeeded * BODYPART_COST[MOVE];

				if (numToughNeeded + numHealNeeded + numRangedNeeded <= numActiveParts &&
					cost < parentRoom.energyCapacityAvailable &&
					numToughNeeded + numHealNeeded + numRangedNeeded + numMoveNeeded <= MAX_CREEP_SIZE) {
					let body = [];
					let boosts = {};

					for (var i = 0; i < numToughNeeded; i++) {
						body.push(TOUGH)
					}
					for (var i = 0; i < Math.floor(numRangedNeeded / 2); i++) {
						body.push(RANGED_ATTACK)
					}
					for (var i = 0; i < Math.floor(numMoveNeeded / 2); i++) {
						body.push(MOVE)
					}
					for (var i = 0; i < Math.ceil(numRangedNeeded / 2); i++) {
						body.push(RANGED_ATTACK)
					}
					for (var i = 0; i < Math.ceil(numMoveNeeded / 2); i++) {
						body.push(MOVE)
					}
					for (var i = 0; i < numHealNeeded; i++) {
						body.push(HEAL)
					}

					if (guardToughBoost) {
						boosts[guardToughBoost] = numToughNeeded;
					}
					if (moveBoost) {
						boosts[moveBoost] = numMoveNeeded - ((moveScale == 2 || moveScale == 3) ? 1 : 0);
					}
					if (rangedBoost) {
						boosts[rangedBoost] = numRangedNeeded;
					}
					if (healBoost) {
						boosts[healBoost] = numHealNeeded;
					}

					let count = guardCount;

					for (var i = 0; i < count; i++) {
						returnObject.roles.unshift("ranged");
						returnObject.bodies.unshift(body);
						returnObject.boosts.unshift(boosts);
						returnObject.formation.unshift(false);
						returnObject.formationPos.unshift(returnObject.formationPos.length);

						guardCount--;
					}
				}
				else {
					// Can't build a rambo to do it so probably the squad is tough enough
					guardCount = 0;
				}
			}

			// Meant to guard us from energy only people on the way.
			if (guardCount > 0) {
				let count = Math.min(Math.floor(parentRoom.energyCapacityAvailable / (2 * 150 + 3 * 50 + 1 * 250)), Math.floor(MAX_CREEP_SIZE / 6));

				let body = [];
				let boosts = {};

				for (var i = 0; i < count * 2; i++) {
					body.push(RANGED_ATTACK)
					if (routeIsVeryDangerous && rangedBoost) {
						boosts[rangedBoost] = (boosts[rangedBoost] || 0) + 1;
					}

				}
				for (var i = 0; i < count * 3 - 1; i++) {
					body.push(MOVE)
				}

				if (count == 8 && parentRoom.energyCapacityAvailable >= 8 * (2 * 150 + 3 * 50 + 250) + 300) {
					body.push(MOVE);
					body.push(HEAL);
				}

				for (var i = 0; i < count; i++) {
					body.push(HEAL)
					if (routeIsVeryDangerous && healBoost) {
						boosts[healBoost] = (boosts[healBoost] || 0) + 1;
					}
				}


				body.push(MOVE)

				// One for each room.
				for (var i = 0; i < guardCount; i++) {
					returnObject.roles.unshift("ranged");
					returnObject.bodies.unshift(body);
					returnObject.boosts.unshift(boosts);
					returnObject.formation.unshift(false);
					returnObject.formationPos.unshift(returnObject.formationPos.length);
				}
			}
		}

		return returnObject;
	},
};

module.exports = formationCreator;