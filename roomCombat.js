"use strict";

let util = require("util")
let defenseAnalysis = require("defenseAnalysis")

var roomCombat = {
	runCreeps(room) {

	},

	getModifiedTowerDamageForPos(creep, room, pos, preHeal, advancing, anySwamp, nearbyHealMod) {
		let towers = room.towers;
		if (towers.length == 0) return 0

		defenseAnalysis.run(room)

		let damage = 0;
		let focusClosestMod = 1;

		nearbyHealMod = nearbyHealMod || 1

		// We assume uncertainty and go for a little of everything. It's possible all my detectors are at 100% which, I guess, is ok. 
		// Really I think I want to find a way of combining them without summing, but also without maxing. 
		// Or maybe max is fine? I dunno. Think about it when you read this.

		let threshold = preHeal ? 0.75 : 0.98
		let advancingMod = 1;

		if (advancing) {
			if (creep.mem.numFormationsInRoom > 2) {			
				// This isn't going to predict well when advancing, but if they've got this flaw I can also retreat pretty easily and having many formations can cover me.
				advancingMod = Math.min(0.1 + (creep.mem.numFormationsInRoom - 2) * 0.1, 0.4);
			}
			else {
				advancingMod = 0.1;
			}

			if (anySwamp) {
				advancingMod /= 5;
			}
		}

		let anyPrediction = 0;

		// Trust it less when damaged
		let damageMod = creep.hits / creep.hitsMax;

		
		let lastTowerTarget
		if (global.defenseAnalysis && global.defenseAnalysis[room.name] && global.defenseAnalysis[room.name].roomTowerTarget) {
			lastTowerTarget = Game.getObjectById(global.defenseAnalysis[room.name].roomTowerTarget)
		}


		// let strongholdPrediction = 0
		if ((Memory.rooms[pos.roomName].towerShootsAtStrongholdMax || 0) > threshold && global.defenseAnalysis && global.defenseAnalysis[room.name] && global.defenseAnalysis[room.name].strongholdLogicTargetId) {
			let obj = Game.getObjectById(global.defenseAnalysis[room.name].strongholdLogicTargetId)
			// We're not it, probably won't take damage.
			if (obj && creep && obj != creep) {
				// 0-1
				let reRanged = (Memory.rooms[pos.roomName].towerShootsAtStrongholdMax - threshold) / (1 - threshold);

				// 0.8 => 0.02
				// 0.9 => 0.18
				// 0.95 => 0.32
				// 0.99 => 0.4608
				if (Memory.rooms[pos.roomName].invCL) {
					damage *= (1 - (advancingMod * reRanged * reRanged * damageMod)) * .5;
				}
				else {
					damage *= 1 - advancingMod * 0.5 * reRanged * reRanged * damageMod;
				}
				anyPrediction = 1
				// strongholdPrediction = 1
			}
			// console.log(pos, damage)
		}


		// Shot last tick, will probably shoot the same again again. Doesn't use advancing mod as that doesn't matter to a repeat-shooter.
		if (!anyPrediction) {	
			if ((Memory.rooms[pos.roomName].towerShootsAtClosest || 0) > threshold) {
				let reRanged = (Memory.rooms[pos.roomName].towerShootsAtClosest - threshold) / (1 - threshold);
				focusClosestMod -= 0.5 * reRanged * reRanged * advancingMod * damageMod;
				anyPrediction = 1
			}

			let myCreeps = room.find(FIND_MY_CREEPS).concat(room.find(FIND_MY_POWER_CREEPS))

			for (let tower of towers) {
				if (tower.isActive() && tower.energy >= TOWER_ENERGY_COST && !tower.my) {
					let energyMod = (tower.energy >= 5 * TOWER_ENERGY_COST ? 1 : (tower.energy >= 2 * TOWER_ENERGY_COST ? 0.75 : 0.5))

					let powerScale = 1;
					for (let effect of (tower.effects || [])) {
						if (effect.power === PWR_DISRUPT_TOWER) {
							// Don't want to get caught out when the PC run out of ops, or something else.
							if (room.canPowerCreepDisruptTower || preHeal) {
								if (effect.ticksRemaining == 1) {
									powerScale *= (1 + POWER_INFO[effect.power].effect[effect.level-1]) / 2;
								}
								else {
									powerScale *= POWER_INFO[effect.power].effect[effect.level-1];
								}
							}
						}
						else if (effect.power === PWR_OPERATE_TOWER) {
							if (effect.ticksRemaining == 1) {
								powerScale *= (1 + POWER_INFO[effect.power].effect[effect.level-1]) / 2;
							}
							else {
								powerScale *= POWER_INFO[effect.power].effect[effect.level-1];
							}
						}
					}

					let towerDamage = util.getTowerDamageForDist(tower.pos.getRangeTo(pos)) * powerScale;
					damage += focusClosestMod * energyMod * towerDamage;

					let closest = tower.pos.findClosestByRange(myCreeps)
					if (closest == creep) {
						damage += (1 - focusClosestMod) * energyMod * towerDamage;
					}
				}
			}

			if (!anyPrediction) {		
				if ((Memory.rooms[pos.roomName].towerShootsAtLastTarget || 0) > threshold && lastTowerTarget) {
					let obj = lastTowerTarget
					// We're not it, probably won't take damage.
					if (obj && creep && obj != creep) {
						// 0-1
						let reRanged = (Memory.rooms[pos.roomName].towerShootsAtLastTarget - threshold) / (1 - threshold);

						// 0.8 => 0.02
						// 0.9 => 0.18
						// 0.95 => 0.32
						// 0.99 => 0.4608
						if (preHeal) {
							damage *= 1 - reRanged * reRanged * reRanged;
						}
						else {
							damage *= 1 - 0.25 * reRanged * reRanged;
						}
						anyPrediction = 1
					}
				}
			}
		}

		/*if ((Memory.rooms[pos.roomName].towerShootsAtStrongholdMax || 0) > threshold && 
			 global.defenseAnalysis && 
			 global.defenseAnalysis[room.name] && 
			 global.defenseAnalysis[room.name].strongholdLogicTargetIds && 
			 global.defenseAnalysis[room.name].strongholdLogicTargetIds.length && 
			 !global.defenseAnalysis[room.name].strongholdLogicTargetIds.includes(creep.id)) {
			// We're not in it, probably won't take damage.

			// let obj = Game.getObjectById(global.defenseAnalysis[room.name].strongholdLogicTargetId)
			// if (obj && creep && obj != creep) {
			// 0-1
			let reRanged = (Memory.rooms[pos.roomName].towerShootsAtStrongholdMax - threshold) / (1 - threshold);

			// 0.8 => 0.02
			// 0.9 => 0.18
			// 0.95 => 0.32
			// 0.99 => 0.4608
			if (Memory.rooms[pos.roomName].invCL) {
				damage *= 1 - advancingMod * reRanged * reRanged * damageMod;
			}
			else {
				damage *= 1 - advancingMod * 0.5 * reRanged * reRanged * damageMod;
			}
			// console.log(pos, damage)
		}*/

		// TODO: towerShootsAtMax

		// They don't shoot at all!

		// They can heal, they won't shoot
		if (global._roomHasHealableCreeps && global._roomHasHealableCreeps[pos.roomName] && Memory.rooms[pos.roomName].towerShootsWhenCouldHeal < (preHeal ? 1e-3 : 1e-6)) {
			damage *= 0.5;
			anyPrediction = 1
		}

		if (preHeal) {
			// Be a bit unpredictable. Don't want too much random, but a smidgen is ok.
			damage *= 0.99 + (0.02 * Math.random())
			// damage += -50 + 100 * Math.random()

			// If they're not shooting much we've still got UB as a factor
			// But we don't want to mess up healing due to non-tower damage
			if (Memory.rooms[pos.roomName].towerShootsAttack !== undefined) {
				// In a lot of cases this is going to be much lower.
				// Currenrtly fighting someone who seems to hit random targets
				// Chance of an individual creep being hit is fairly low.
				// Also... if somebody just got shot, don't do this
				if (!lastTowerTarget || !creep || creep != lastTowerTarget) {
					if (anyPrediction) {
						damage *= Math.min(1, Memory.rooms[pos.roomName].towerShootsAttack)
					}
					else {
						// Just because we haven't made a prediction doesn't mean there isn't one to be made so we don't want to assume random
						// At the same time if we can't predict it we kinda hope it's random so try to pay more attention to creep damage
						// when pre-healing. Sqrt deals with the "don't really know" part of this.
						damage *= Math.min(1, Memory.rooms[pos.roomName].towerShootsAttack / Math.sqrt(room.find(FIND_MY_CREEPS).length || 1))
					}
				}
			}
		}
		else {			
			if (Memory.rooms[pos.roomName].towerShootsAttack < 1e-6) {
				damage *= 0.5;
			}
			if (Memory.rooms[pos.roomName].towerShootsAttack < 1e-15) {
				damage *= 0.5;
			}
			if (Memory.rooms[pos.roomName].towerShootsAttack < 1e-30) {
				damage *= 0.5;
			}
		}
		// console.log(preHeal, pos, damage)

		return damage;
	},

	calcGroupIncomingDamage: function(testCreep, creepNames) {
		Memory.playerCombatAnalysis = Memory.playerCombatAnalysis || {}

		let hostileCombatCreeps
		let allMyCombatCreeps

		for (var groupCreepName of creepNames) {
			let groupCreep = Game.creeps[groupCreepName] || Game.powerCreeps[groupCreepName];

			if (!groupCreep || groupCreep.incomingDamageUB !== undefined) {
				continue;
			}

			if (!groupCreep.room.dangerous) {
				groupCreep.incomingDamageUB = 0;
				groupCreep.incomingDamagePredicted = 0;
				continue
			}



			let myStrctures = groupCreep.pos.lookFor(LOOK_STRUCTURES);

			let ramparted = false
			for (let structure of myStrctures) {
				if (structure.structureType == STRUCTURE_RAMPART) {
					ramparted = true;
					break
				}
			}
			if (ramparted) {
				groupCreep.incomingDamageUB = 0
				groupCreep.incomingDamagePredicted = 0
				continue
			}

			hostileCombatCreeps = hostileCombatCreeps || groupCreep.room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK], true)
			let myNearbyHostiles = groupCreep.pos.findInRange(hostileCombatCreeps, 3);

			if (groupCreep.ignoreInvaders) {
				myNearbyHostiles = _.filter(myNearbyHostiles, function(hostile) { return hostile.owner.username != "Invader" });
			}

			let closeHostiles = groupCreep.pos.findInRange(myNearbyHostiles, 1);

			let incomingDamageUB = 0;
			let incomingDamagePredicted = 0;
			if (myNearbyHostiles.length) {
				allMyCombatCreeps = allMyCombatCreeps || groupCreep.room.getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], false)
				for (let closeEnemy of myNearbyHostiles) {
					var ranged = closeEnemy.getActiveBoostModifiedRangedAttack();

					if (ranged) {					
						Memory.playerCombatAnalysis[closeEnemy.owner.username] = Memory.playerCombatAnalysis[closeEnemy.owner.username] || {}

						let shootsAtClosest = Memory.playerCombatAnalysis[closeEnemy.owner.username].rangedShootsAtClosest || 0

						let closestFriend 
						let baseRangedPredictedMod

						if (shootsAtClosest > 0.5) {
							closestFriend = closeEnemy.pos.findClosestByRange(allMyCombatCreeps)
							let isClosest = closestFriend === groupCreep
							baseRangedPredictedMod = (isClosest ? shootsAtClosest : (1 - shootsAtClosest))
						}
						else {
							baseRangedPredictedMod = 1;
						}


						if (Memory.rooms[groupCreep.room.name].towerShootsAtStrongholdMax > .99 && Memory.rooms[groupCreep.room.name].creepsShootAtStrongholdMax > .99) {
							if (global.defenseAnalysis && global.defenseAnalysis[groupCreep.room.name] && global.defenseAnalysis[groupCreep.room.name].strongholdLogicTargetId) {
								if (groupCreep.id != global.defenseAnalysis[groupCreep.room.name].strongholdLogicTargetId) {
									baseRangedPredictedMod *= 1 - Memory.rooms[groupCreep.room.name].creepsShootAtStrongholdMax
									// console.log("Not expecting ranged attack against", groupCreep)
								}
							}
						}

						if ((closestFriend && closestFriend.pos.getRangeToPos(closeEnemy.pos) == 1) || closeEnemy.pos.findFirstInRange(allMyCombatCreeps, 1)) {
							let range = groupCreep.pos.getRangeToPos(closeEnemy.pos);
							let chanceOfRMA = Memory.playerCombatAnalysis[closeEnemy.owner.username].chanceRMAAtRangeOne !== undefined ? Memory.playerCombatAnalysis[closeEnemy.owner.username].chanceRMAAtRangeOne : 1

							if (range <= 1) {
								incomingDamagePredicted += (10 * chanceOfRMA + RANGED_ATTACK_POWER * (1 - chanceOfRMA) * baseRangedPredictedMod) * ranged	
							}
							else if (range == 2) {
								// Annoyingly don't have constants for RMA at range 2 and 3
								incomingDamagePredicted += (4 * chanceOfRMA + RANGED_ATTACK_POWER * (1 - chanceOfRMA) * baseRangedPredictedMod) * ranged
							}
							else if (range == 3) {
								incomingDamagePredicted += (1 * chanceOfRMA + RANGED_ATTACK_POWER * (1 - chanceOfRMA) * baseRangedPredictedMod) * ranged
							}
						}
						else {
							incomingDamagePredicted += RANGED_ATTACK_POWER * ranged * baseRangedPredictedMod
						}
						incomingDamageUB += RANGED_ATTACK_POWER * ranged;

						groupCreep.nonTowerDamage = 1;
					}

				}
				for (let nearbyEnemy of closeHostiles) {
					var attack = nearbyEnemy.getActiveBoostModifiedAttack();

					if (attack) {
						Memory.playerCombatAnalysis[nearbyEnemy.owner.username] = Memory.playerCombatAnalysis[nearbyEnemy.owner.username] || {}
						let shootsAtClosest = Memory.playerCombatAnalysis[nearbyEnemy.owner.username].attacksClosest || 0

						let baseAttackPredictedMod
						if (shootsAtClosest > 0.5) {
							let closestFriend = nearbyEnemy.pos.findClosestByRange(allMyCombatCreeps)
							let isClosest = closestFriend === groupCreep
							baseAttackPredictedMod = (isClosest ? shootsAtClosest : (1 - shootsAtClosest))
						}
						else {
							baseAttackPredictedMod = 1;
						}

						incomingDamagePredicted += ATTACK_POWER * attack * baseAttackPredictedMod;
						incomingDamageUB += ATTACK_POWER * attack;
						groupCreep.nonTowerDamage = 1;
					}
				}
			}

			if (groupCreep.room.isEnemyRoom()) {
				let anyActiveTowers = 0
				for (let tower of groupCreep.room.towers) {
					if (tower.isActive() && tower.energy >= TOWER_ENERGY_COST && !tower.my) {
						groupCreep.mightTakeTowerDamage = 1
						anyActiveTowers = 1
						let powerScale = 1;
						for (let effect of (tower.effects || [])) {
							if (effect.power === PWR_DISRUPT_TOWER) {
								// Don't want to get caught out when the PC run out of ops, or something else.
								if (groupCreep.room.canPowerCreepDisruptTower) {
									if (effect.ticksRemaining == 1) {
										powerScale *= (1 + POWER_INFO[effect.power].effect[effect.level-1]) / 2;
									}
									else {
										powerScale *= POWER_INFO[effect.power].effect[effect.level-1];
									}
								}
							}
							else if (effect.power === PWR_OPERATE_TOWER) {
								if (effect.ticksRemaining == 1) {
									powerScale *= (1 + POWER_INFO[effect.power].effect[effect.level-1]) / 2;
								}
								else {
									powerScale *= POWER_INFO[effect.power].effect[effect.level-1];
								}
							}
						}

						incomingDamageUB += util.getTowerDamageForDist(tower.pos.getRangeTo(groupCreep.pos)) * powerScale;
					}
				}

				if (anyActiveTowers) {
					incomingDamagePredicted += this.getModifiedTowerDamageForPos(groupCreep, groupCreep.room, groupCreep.pos, 1, false, false)
				}
			}

			// If healers get hurt then we lose healing.
			// This is covered by priority below
			// let mod = 1 + 0.25 * groupCreep.getNumOfBodyPart(HEAL) / groupCreep.body.length
			// incomingDamageUB *= mod

			groupCreep.incomingDamageUB = incomingDamageUB;
			groupCreep.incomingDamagePredicted = incomingDamagePredicted;
		}		
	},

	calcGroupHealStatus(creepNames) {
		let numHealsBase
		let numHeals
		let numHealsActive = 0
		let mostLostHits = 0;
		let mostLostHitsCreep
		let totalLostHits = 0

		for (var groupCreepName of creepNames) {
			var groupCreep = Game.creeps[groupCreepName] || Game.powerCreeps[groupCreepName];

			if (groupCreep) {
				let lostHits = groupCreep.hitsMax - groupCreep.hits;

				if (lostHits) {					
					let toughBoostLevel = groupCreep.getToughBoostLevel(true);
					if (toughBoostLevel >= 2) {
						let numTough = groupCreep.getNumOfBodyPart(TOUGH);

						if (lostHits < numTough * 100) {
							if 		(toughBoostLevel == 4) lostHits /= 0.3;
							else if (toughBoostLevel == 3) lostHits /= 0.5;
							else if (toughBoostLevel == 2) lostHits /= 0.7;
						}
						else {
							if 		(toughBoostLevel == 4) lostHits += (numTough * 100) / 0.3 - numTough * 100;
							else if (toughBoostLevel == 3) lostHits += (numTough * 100) / 0.5 - numTough * 100;
							else if (toughBoostLevel == 2) lostHits += (numTough * 100) / 0.7 - numTough * 100;
						}
					}

					totalLostHits += lostHits;
					if (lostHits > mostLostHits) {
						mostLostHits = lostHits;
						mostLostHitsCreep = groupCreep;
					}
				}
			}
		}
		// if (creep.mem.directionalFormation) {
			numHealsBase = 0;
			numHeals = 0;
			for (var groupCreepName of creepNames) {
				var groupCreep = Game.creeps[groupCreepName] || Game.powerCreeps[groupCreepName];
				if (groupCreep) {
					let numCreepHeals = groupCreep.getBoostModifiedHeal();
					if (numCreepHeals > numHealsBase) {
						numHealsBase = numCreepHeals;
					}
					numHeals += numCreepHeals;

					numHealsActive += groupCreep.getActiveBoostModifiedHeal()
				}
			}
		// }
		// else {
		// 	numHealsBase = creep.getBoostModifiedHeal();
		// 	numHeals = numHealsBase * creepNames.length;
		// 	numHealsActive = numHealsBase * creepNames.length;
		// }
		// console.log(creep, numHeals, numHealsActive)

		let ret = {};
		ret.numHealsBase = numHealsBase;
		ret.numHeals = numHeals;
		ret.numHealsActive = numHealsActive;
		ret.mostLostHits = mostLostHits;
		ret.mostLostHitsCreep = mostLostHitsCreep;
		ret.totalLostHits = totalLostHits;

		return ret;
	},


	roomApplyHeal(testCreep, creepNames) {
		if (creepNames.length == 1) {
			return this.groupApplyHeal(testCreep, creepNames)
		}

		// let a = Game.cpu.getUsed();

		let partitions = []
		let touchedCreepNames = []

		function addToPartition(partition, creep) {
			partition.push(creep.name)
			touchedCreepNames.push(creep.name)
			for (let otherCreep of creep.pos.findInRange(FIND_MY_CREEPS, 3)) {
				let name = otherCreep.name
				if (!creepNames.includes(name)) continue
				if (partition.includes(name)) continue

				addToPartition(partition, otherCreep)
			}
		}

		for (let creepName of creepNames) {
			let creep = Game.creeps[creepName]
			if (!creep) continue
			if (touchedCreepNames.includes(creepName)) continue

			let partition = []
			addToPartition(partition, creep)

			partitions.push(partition)
		}

		// console.log("a", creepNames, Game.cpu.getUsed() - a)

		let intents = 0
		for (let partition of partitions) {
			intents += this.groupApplyHeal(Game.creeps[partition[0]], partition)
		}

		return intents


		// return this.groupApplyHeal(testCreep, creepNames)

	},

	groupApplyHeal(testCreep, creepNames) {
		let a = Game.cpu.getUsed();
		let healers = []
		for (var groupCreepName of creepNames) {
			if (Game.creeps[groupCreepName] && 
				!Game.creeps[groupCreepName].healOrdersGiven && 
				Game.creeps[groupCreepName].mem.role != "heavyControllerAttacker" && 
				Game.creeps[groupCreepName].mem.role != "soloKeeperMiner" && 
				Game.creeps[groupCreepName].mem.role != "keeperGuard2" && 
				Game.creeps[groupCreepName].mem.role != "seasonTug" && 
				!Game.creeps[groupCreepName].hasActiveBodypart(CLAIM) && 
				Game.creeps[groupCreepName].hasActiveBodypart(HEAL)) {
				healers.push(Game.creeps[groupCreepName])
			}
		}

		// console.log("b", creepNames, Game.cpu.getUsed() - a)
		// a = Game.cpu.getUsed();

		if (!healers.length) return 0

		let nonTowerDamage = 0;
		let intents = 0
		// Highest heals go first.
		if (healers.length > 1) {
			healers = _.sortBy(healers, function(healer) { return -healer.getActiveBoostModifiedHeal() })
		}

		// console.log("c", creepNames, Game.cpu.getUsed() - a)
		// a = Game.cpu.getUsed();
		
		if (testCreep.incomingDamageUB === undefined) {
			this.calcGroupIncomingDamage(testCreep, creepNames);
		}

		let incomingDamageUBCreeps;
		let incomingDamageUBDamages;
		let extraPriorities;

		// console.log("d", creepNames, Game.cpu.getUsed() - a)
		// a = Game.cpu.getUsed();

		// Nice and simple. Do we need to heal ourselves?
		if (creepNames.length == 1 && !Game.creeps[creepNames[0]].room.isMyRoom()) {
			let groupCreep = Game.creeps[creepNames[0]]

			if (groupCreep.hitsMax - groupCreep.hits) {
				if (!groupCreep.hasActiveBodypart(ATTACK)) {
					groupCreep.heal(groupCreep)
					return 1
				}
				incomingDamageUBCreeps = [groupCreep]
				incomingDamageUBDamages = [groupCreep.hitsMax - groupCreep.hits]
				extraPriorities = [0]

			}
			else {
				if (groupCreep.incomingDamageUB === undefined) {
					// Maybe this is due to a bad tower damage calculation?
					console.log("B Formation creep incomingDamageUB undefined when it shouldn't be", groupCreep, groupCreep.room, creepNames)
					this.calcGroupIncomingDamage(groupCreep, creepNames)
				}

				if (groupCreep.incomingDamageUB) {
					if (!groupCreep.hasActiveBodypart(ATTACK)) {
						groupCreep.heal(groupCreep)
						return 1
					}

					incomingDamageUBCreeps = [groupCreep]
					incomingDamageUBDamages = [groupCreep.incomingDamageUB]
					extraPriorities = [0]
				}
			}
		}
		else {
			incomingDamageUBCreeps = [];
			incomingDamageUBDamages = [];
			extraPriorities = [];
			for (var groupCreepName of creepNames) {
				var groupCreep = Game.creeps[groupCreepName] || Game.powerCreeps[groupCreepName];

				if (groupCreep) {
					let lostHits = groupCreep.hitsMax - groupCreep.hits;

					let toughBoostLevel
					if (lostHits) {
						toughBoostLevel = groupCreep.getToughBoostLevel(true);
						if (toughBoostLevel >= 2) {
							let numTough = groupCreep.getNumOfBodyPart(TOUGH);

							if (lostHits < numTough * 100) {
								if 		(toughBoostLevel == 4) lostHits /= 0.3;
								else if (toughBoostLevel == 3) lostHits /= 0.5;
								else if (toughBoostLevel == 2) lostHits /= 0.7;
							}
							else {
								if 		(toughBoostLevel == 4) lostHits += (numTough * 100) / 0.3 - numTough * 100;
								else if (toughBoostLevel == 3) lostHits += (numTough * 100) / 0.5 - numTough * 100;
								else if (toughBoostLevel == 2) lostHits += (numTough * 100) / 0.7 - numTough * 100;
							}
						}
					}

					if (groupCreep.incomingDamageUB === undefined) {
						// Maybe this is due to a bad tower damage calculation?
						console.log("Formation creep incomingDamageUB undefined when it shouldn't be", groupCreep, groupCreep.room, creepNames, groupCreep.incomingDamageUB)
						this.calcGroupIncomingDamage(groupCreep, creepNames)
					}


					// If it's going to get damaged more, heal more agressively.
					if (groupCreep.incomingDamageUB) {
						// Need 2x lost hits. This is because if predicted is lower than UB we subtract the lost
						// hits term on UB
						groupCreep.incomingDamagePredicted = (groupCreep.incomingDamagePredicted || 0) + lostHits * 2
						// extraPriority += lostHits * 0.5;
					}
					else {
						// Nothing happening, no need to carry on
						if (lostHits == 0) {
							groupCreep.incomingDamageUB = 0
							groupCreep.incomingDamagePredicted = 0
							continue
						}
						groupCreep.incomingDamagePredicted = (groupCreep.incomingDamagePredicted || 0) + lostHits * 2
					}
					groupCreep.incomingDamageUB = (groupCreep.incomingDamageUB || 0) + lostHits;


					// If it's going to get damaged more, heal a bit more agressively.
					/*if (groupCreep.incomingDamageUB) {
						extraPriority += lostHits;
						// extraPriority += lostHits * 0.5;
					}
					incomingDamageUB = (groupCreep.incomingDamageUB || 0) + lostHits;*/



					nonTowerDamage = nonTowerDamage || groupCreep.nonTowerDamage;

					if (nonTowerDamage && groupCreep.hasActiveBodypart(ATTACK)) {
						let maxEnemyReflect = 0;
						for (let otherCreep of groupCreep.pos.findInRange(groupCreep.room.getAllHostileCreepsWithBodyParts([ATTACK], true), 1)) {
							let ramparted = false;
							let structsOnCreep = otherCreep.pos.lookFor(LOOK_STRUCTURES);
							for (let structOnCreep of structsOnCreep) {
								if (structOnCreep.structureType == STRUCTURE_RAMPART) {
									ramparted = true;
									break;
								}
							}
							if (!ramparted) {
								let bmcp = otherCreep.getBoostModifiedCombatParts(true, true);
								let attack = bmcp.numAttack * ATTACK_POWER;
								if (attack > maxEnemyReflect) {
									maxEnemyReflect = attack;
								}
							}
						}
						groupCreep.incomingDamagePredicted += maxEnemyReflect;
						groupCreep.incomingDamageUB += maxEnemyReflect;
					}


					// We want to normalize these extras around zero. We have a incomingDamageUB + extraPriorty > 0 check later
					// with the assumption extraPriorty is close to -incomingDamageUB. 
					let extraPriority = 0
					if (groupCreep.incomingDamageUB) {
						// This is a bit more than just a tiebreak. 
						// Goes from 0 to 750
						extraPriority += ((groupCreep.ticksToLive - CREEP_LIFE_TIME / 2) / 2) * groupCreep.body.length / MAX_CREEP_SIZE

						// Healers first
						// Got to be a bit careful - if we're under tower fire everyone is going to take damage so we can't
						// push this too hard
						// At some point we need to top up guys with light damage but no heal parts (eg. 2x2 attack squads)
						// The random should deal with that.
						if (groupCreep.mightTakeTowerDamage) {
							// Goes from 0 to 600 (40 * (40 - 25))
							extraPriority += 40 * (groupCreep.getNumOfBodyPart(HEAL) - groupCreep.body.length / 2) * Math.random()

							if (toughBoostLevel === undefined) {
								toughBoostLevel = groupCreep.getToughBoostLevel(true);
							}
							if (toughBoostLevel > 1) {
								let fudgeHits = (0.75 * groupCreep.getHeadEffectiveMaxHitPoints() + 0.25 * groupCreep.getEffectiveMaxHitPoints())

								let fudge = Math.max(1.3, fudgeHits / (groupCreep.body.length * 100))

								extraPriority += 1500 * (fudge * fudge - 1) * groupCreep.body.length / MAX_CREEP_SIZE * Math.random()
							}
						}
						else {
							// Goes from 0 to 600 = (40 * (40 - 25))
							extraPriority += 40 * (groupCreep.getNumOfBodyPart(HEAL) - groupCreep.body.length / 2)

							// This isn't ideal as it doesn't well differentiate between creeps that use tough for extra hp
							// and those that need it to live.
							// For 10 T3 tough this works out as 1035
							// For 5 T3 tough this works out as 781
							// For 10 T3 tough with even head/mid split works out as 1002
							// For 6 T3 tough with even head/mid split works out as 570
							// For 1 T3 tough this works out as 143
							if (toughBoostLevel === undefined) {
								toughBoostLevel = groupCreep.getToughBoostLevel(true);
							}
							if (toughBoostLevel > 1) {
								let fudgeHits = (0.75 * groupCreep.getHeadEffectiveMaxHitPoints() + 0.25 * groupCreep.getEffectiveMaxHitPoints())

								let fudge = Math.max(1.3, fudgeHits / (groupCreep.body.length * 100))

								extraPriority += 1500 * (fudge * fudge - 1) * groupCreep.body.length / MAX_CREEP_SIZE
							}
						}

						// Scale extra priorty down if we're really not expecting to take much damage
						if (extraPriority > 0 && (groupCreep.incomingDamageUB || 0) + lostHits > 0) {
							extraPriority *= ((groupCreep.incomingDamagePredicted || 0) + lostHits) / ((groupCreep.incomingDamageUB || 0) + lostHits)
						}



						// Don't always heal the middle one.
						// if (creepNames.length == 9 && creepNames.indexOf(groupCreepName) == 4) {
						// 	incomingDamageUB *= 0.6;
						// }

						// Deprioritize. For making sure we don't overflow we use upper bound.
						// For picking healing target order we use predicted
						// This means we won't heal someone who is likely to take 1 damage from RMA
						// over someone who will take 10, just because they _might_ take 10.
						if (groupCreep.incomingDamagePredicted < groupCreep.incomingDamageUB) {
							extraPriority -= groupCreep.incomingDamageUB
							extraPriority += groupCreep.incomingDamagePredicted
							// extraPriority += lostHits
						}
					}

					// groupCreep.incomingDamageUB = incomingDamageUB


					incomingDamageUBCreeps.push(groupCreep);
					incomingDamageUBDamages.push(groupCreep.incomingDamageUB);
					extraPriorities.push(extraPriority);
				}
			}
		}


		// console.log("e", creepNames, Game.cpu.getUsed() - a)


		// Don't pre-heal one creep if there's not much difference from expected tower damage difference
		// if (maxincomingDamageUB - minincomingDamageUB < creep.room.towers.length * 31) {
		// 	maxincomingDamageUBCreep = undefined;
		// }




		// TODO: Maybe check towers and creeps before, rather than just doing on dangerous. For some reason expecetd damage not giving me creeps in neutral rooms
		if (_.some(incomingDamageUBDamages)) {
			// Two passes. 
			// First works mostly on predicted
			// Second works on upper bounds
			// This lets me get ranged heals on people with high predicted damage if the healer has no high predicted nearby
			for (let pass = 0; pass < 2; pass++) {
				for (var groupCreep of healers) {
					if (!groupCreep.healOrdersGiven) {
						let maxincomingDamageUBIdx = -1;
						let maxScore = -Infinity;
						let maxincomingDamageUBCreep;

						if (groupCreep.hasActiveBodypart(ATTACK) && groupCreep.pos.findFirstInRange(FIND_HOSTILE_CREEPS, 1)) {
							continue
						}

						// Find the most damaged creep in range
						for (let incomingDamageUBIdx in incomingDamageUBCreeps) {
							let damagedCreep = incomingDamageUBCreeps[incomingDamageUBIdx]

							if (!groupCreep.pos.isNearToPos(damagedCreep.pos)) {
								continue
							}

							let incomingDamageUB = incomingDamageUBDamages[incomingDamageUBIdx]
							let extraPriorty = extraPriorities[incomingDamageUBIdx]

							let score
							if (groupCreep.assaulter && groupCreep.mem.formationCreeps.includes(damagedCreep.name))  {
								// As bravery goes up we assume a more networked healing approach rather than individualistic
								let mod = Math.min(0.5, Math.max(0, (0.25 - 0.25 * (groupCreep.room.mem.formationBravery || 0) / 10)))

								// Heal our buddies first.
								score = (1 + mod) * (incomingDamageUB + extraPriorty)
							}
							else {
								score = incomingDamageUB + extraPriorty
							}

							// if (!groupCreep.pos.isNearToPos(incomingDamageUBCreeps[incomingDamageUBIdx].pos)) continue;
							// extraPriorty is often negative
							if (incomingDamageUB > 0 && (pass == 1 || incomingDamageUB + extraPriorty > 0) && score > maxScore) {
								maxincomingDamageUBIdx = incomingDamageUBIdx;
								maxScore = score
							}
						}


						// Find the guy who is going to take most damage
						maxincomingDamageUBCreep = incomingDamageUBCreeps[maxincomingDamageUBIdx];

						// if (groupCreep.room.name == "E26S4") {
						// 	console.log(incomingDamageUBDamages, extraPriorities, maxincomingDamageUBCreep, maxScore)
						// }

						// Heal
						if (maxincomingDamageUBCreep &&
							groupCreep.room.name == maxincomingDamageUBCreep.room.name &&
							groupCreep.pos.isNearToPos(maxincomingDamageUBCreep.pos)) {
							groupCreep.heal(maxincomingDamageUBCreep);
							groupCreep.healOrdersGiven = 1;

							let diff = groupCreep.getActiveBoostModifiedHeal() * HEAL_POWER
							incomingDamageUBCreeps[maxincomingDamageUBIdx].incomingDamageUB -= diff
							incomingDamageUBDamages[maxincomingDamageUBIdx] -= diff;

							intents++
							// Everyone is done
							if (intents == healers.length) {
								return intents
							}
						}
					}
				}

				// All heals first. Then move on to ranged heals
				for (var groupCreep of healers) {
					if (!groupCreep.healOrdersGiven) {
						if (groupCreep.hasActiveBodypart(ATTACK) && groupCreep.pos.findFirstInRange(FIND_HOSTILE_CREEPS, 1)) {
							continue
						}

						let allowRangedHeal = false
						let numRanged = groupCreep.getNumOfBodyPart(RANGED_ATTACK);
						if (groupCreep.getNumOfBodyPart(HEAL) > (pass == 0 ? 6 : 3) * numRanged) {
							allowRangedHeal = true;
						}
						else if (numRanged && pass == 1) {
							let nearbyCombatCreep = groupCreep.pos.findFirstInRange(groupCreep.room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], false), 3)
							if (!nearbyCombatCreep) {
								allowRangedHeal = true;
							}
						}

						if (!allowRangedHeal) {
							continue
						}


						let maxincomingDamageUBIdx = -1;
						let maxScore = -Infinity;
						let maxincomingDamageUBCreep;

						for (let incomingDamageUBIdx in incomingDamageUBCreeps) {
							let damagedCreep = incomingDamageUBCreeps[incomingDamageUBIdx]
							if (!groupCreep.pos.inRangeToPos(damagedCreep.pos, 3)) {
								continue
							}

							let incomingDamageUB = incomingDamageUBDamages[incomingDamageUBIdx]
							let extraPriorty = extraPriorities[incomingDamageUBIdx]

							let score = incomingDamageUB + extraPriorty

							// if (!groupCreep.pos.isNearToPos(incomingDamageUBCreeps[incomingDamageUBIdx].pos)) continue;

							if (incomingDamageUB > 0 && (pass == 1 || incomingDamageUB + extraPriorty > 0) && score > maxScore) {
								maxincomingDamageUBIdx = incomingDamageUBIdx;
								maxScore = score
							}
						}
						

						// let anyHostilesInRange = groupCreep.pos.findFirstInRange(groupCreep.room.getAllHostileCreepsWithBodyParts([RANGED_ATTACK], true), 3) || groupCreep.pos.findFirstInRange(groupCreep.room.getAllHostileCreepsWithBodyParts([ATTACK], true), 1);
						// let shouldUseRangedHeal = groupCreep.getNumOfBodyPart(HEAL) > 3 * groupCreep.getNumOfBodyPart(RANGED_ATTACK);

						maxincomingDamageUBCreep = incomingDamageUBCreeps[maxincomingDamageUBIdx];

						// if ((creep.mem.directionalFormation || (maxincomingDamageUB >= numHealsBase * ((creepNames.length == 9) ? 12 : 6) * 12)) &&
						if (maxincomingDamageUBCreep &&
							groupCreep.room.name == maxincomingDamageUBCreep.room.name &&
							groupCreep.pos.getRangeTo(maxincomingDamageUBCreep) > 1 &&
							groupCreep.pos.getRangeTo(maxincomingDamageUBCreep) <= 3) {
							groupCreep.rangedHeal(maxincomingDamageUBCreep);
							groupCreep.healOrdersGiven = 1;


							let diff = groupCreep.getActiveBoostModifiedHeal() * RANGED_HEAL_POWER

							incomingDamageUBCreeps[maxincomingDamageUBIdx].incomingDamageUB -= diff
							incomingDamageUBDamages[maxincomingDamageUBIdx] -= diff;

							intents++
							// Everyone is done
							if (intents == healers.length) {
								return intents
							}
						}
					}
				}
			}
		}

		if (testCreep.room.find(FIND_MY_CREEPS).length > creepNames.length) {		
			let nonGroupedCreeps = testCreep.room.find(FIND_MY_CREEPS, {filter: (otherCreep) => {return (otherCreep.hits != otherCreep.hitsMax || otherCreep.canBeAttacked()) && !creepNames.includes(otherCreep.name) }});

			if (nonGroupedCreeps.length) {			
				for (var groupCreep of healers) {
					if (!groupCreep.healOrdersGiven) {
						let otherCloseCreeps = groupCreep.pos.findInRange(nonGroupedCreeps, 1);
						let otherCloseHurtCreeps = _.filter(otherCloseCreeps, function(otherCreep) {return (otherCreep.hits != otherCreep.hitsMax) });

						if (otherCloseHurtCreeps.length) {
							groupCreep.heal(_.sample(otherCloseHurtCreeps))
							intents++
							continue
						}

						if (otherCloseCreeps.length) {
							groupCreep.heal(_.sample(otherCloseCreeps))
							intents++
							continue
						}

						// if (maxincomingDamageUB < 0) break

						let allowRangedHeal = false
						let numRanged = groupCreep.getNumOfBodyPart(RANGED_ATTACK);
						if (!numRanged) {
							allowRangedHeal = true;
						}
						else if (numRanged) {
							let nearbyCombatCreep = groupCreep.pos.findFirstInRange(groupCreep.room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], false), 3)
							if (!nearbyCombatCreep) {
								allowRangedHeal = true;
							}
						}

						if (!allowRangedHeal) {
							continue
						}
						
						let otherFarCreeps = groupCreep.pos.findInRange(nonGroupedCreeps, 3);
						if (!otherFarCreeps.length) continue

						let otherFarHurtCreeps = _.filter(otherFarCreeps, function(otherCreep) {return (otherCreep.hits != otherCreep.hitsMax) });

						if (otherFarHurtCreeps.length) {
							groupCreep.rangedHeal(_.sample(otherFarHurtCreeps))
							intents++
							continue
						}

						if (otherFarCreeps.length) {
							groupCreep.rangedHeal(_.sample(otherFarCreeps))
							intents++
							continue
						}
					}
				}
			}
		}

		return intents;
	}

};

module.exports = roomCombat;