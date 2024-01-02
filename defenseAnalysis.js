const alphaDeadRoom = Math.exp(-(1/(1000.)))
const alphaCreepDefending = Math.exp(-(1/(3000.)))

const alphaMeanTowers = Math.exp(-(1/(5000.)))

const alphaTargeting = Math.exp(-(1/(100.)))

const alphaFocus = Math.exp(-(1/(100.)))
const alphaHealers = Math.exp(-(1/(100.)))
const alphaLastTarget = Math.exp(-(1/(100.)))
const alphaShoots = Math.exp(-(1/(100.)))

const alphaRepair = Math.exp(-(1/(500.)))

const alphaTerm = Math.exp(-(1/(10000.)))

const alphaHeatmap = Math.exp(-(1/(1000.)))
const decayHeatmap = Math.pow(alphaHeatmap, 10);

const alphaBoostCost = Math.exp(-(1/(1000.)))

const alphaNonLocalDefense = Math.exp(-(1/(500.))) // Once every 10 ticks

const alphaRangedActsAsStronghold = Math.exp(-(1/(100.)))


const util = require("util")


var defenseAnalysis = {
	run(room) {
		if (room.defenseAnalysisComplete) return;

		global.defenseAnalysis = global.defenseAnalysis || {};
		global.defenseAnalysis[room.name] = global.defenseAnalysis[room.name] || {};

		let t = Game.cpu.getUsed();

		room.defenseAnalysisComplete = 1;

		if (room.mem.hostilesPushOut && Game.time - room.mem.hostilesPushOut > 3000 && Game.time - (room.mem.hostilesPushTest || 0) > 2000) {
			delete room.mem.hostilesPushOut
		}


		let eventLog = room.getEventLog();

		let attackEvents = [];
		let repairEvents = [];
		let healEvents = [];
		let transferEvents = [];

		for (let event of eventLog) {
			if (event.event == EVENT_ATTACK) {
				attackEvents.push(event)
			}
			else if (event.event == EVENT_REPAIR) {
				repairEvents.push(event)
			}
			else if (event.event == EVENT_HEAL) {
				healEvents.push(event)
			}	
			else if (event.event == EVENT_TRANSFER) {
				transferEvents.push(event)
			}
		}

		// None of these are valid for strongholds
		if (room.controller) {
			this.nonLocalDefenseSupportAnalysis(room)
			this.creepDefenseAnalysis(room, attackEvents);
			this.deadRoomAnalysis(room, attackEvents);	
			this.repairAnalysis(room, repairEvents);
			this.terminalAnalysis(room, transferEvents);
			this.guardPositionAnalyis(room);
			this.guardCostAnalysis(room);		
		}


		Memory.playerDefenseAnalysis = Memory.playerDefenseAnalysis || {};

		Memory.playerDefenseAnalysis[room.mem.owner] = Memory.playerDefenseAnalysis[room.mem.owner] || {};

		let playerAnal = Memory.playerDefenseAnalysis[room.mem.owner]

		// Use player-wide stats as default
		room.mem.towerShoots = room.mem.towerShoots || playerAnal.towerShoots || 1
		room.mem.towerShootsAttack = room.mem.towerShootsAttack || playerAnal.towerShootsAttack || 1
		room.mem.towerShootsAtHealers = room.mem.towerShootsAtHealers || playerAnal.towerShootsAtHealers || 0
		room.mem.towerShootsAtClosest = room.mem.towerShootsAtClosest || playerAnal.towerShootsAtClosest || 0
		room.mem.towerShootsAtFirst = room.mem.towerShootsAtFirst || playerAnal.towerShootsAtFirst || 0
		if (room.mem.invCL && room.mem.invCL >= 4) {
			room.mem.towerShootsAtStrongholdMax = room.mem.towerShootsAtStrongholdMax || 1
		}
		else {
			room.mem.towerShootsAtStrongholdMax = room.mem.towerShootsAtStrongholdMax || playerAnal.towerShootsAtStrongholdMax || 0
		}
		room.mem.towerShootsWithFocus = room.mem.towerShootsWithFocus || playerAnal.towerShootsWithFocus || 0
		room.mem.towerShootsAtLastTarget = room.mem.towerShootsAtLastTarget || playerAnal.towerShootsAtLastTarget || 0
		room.mem.towerShootsWhenCouldHeal = room.mem.towerShootsWhenCouldHeal || playerAnal.towerShootsWhenCouldHeal || 1


		this.towerAnalysis(room, attackEvents, repairEvents, healEvents);

		playerAnal.lastUpdated = Game.time;

		playerAnal.towerShoots = alphaShoots * (playerAnal.towerShoots || 1) + (1 - alphaShoots) * room.mem.towerShoots
		playerAnal.towerShootsAttack = alphaShoots * (playerAnal.towerShootsAttack || 1) + (1 - alphaShoots) * room.mem.towerShootsAttack
		playerAnal.towerShootsAtHealers = alphaHealers * (playerAnal.towerShootsAtHealers || 0) + (1 - alphaHealers) * room.mem.towerShootsAtHealers
		playerAnal.towerShootsAtClosest = alphaTargeting * (playerAnal.towerShootsAtClosest || 0) + (1 - alphaTargeting) * room.mem.towerShootsAtClosest
		playerAnal.towerShootsAtFirst = alphaTargeting * (playerAnal.towerShootsAtFirst || 0) + (1 - alphaTargeting) * room.mem.towerShootsAtFirst
		playerAnal.towerShootsAtStrongholdMax = alphaTargeting * (playerAnal.towerShootsAtStrongholdMax || 0) + (1 - alphaTargeting) * room.mem.towerShootsAtStrongholdMax
		playerAnal.towerShootsWithFocus = alphaFocus * (playerAnal.towerShootsWithFocus || 0) + (1 - alphaFocus) * room.mem.towerShootsWithFocus
		playerAnal.towerShootsAtLastTarget = alphaLastTarget * (playerAnal.towerShootsAtLastTarget || 0) + (1 - alphaLastTarget) * room.mem.towerShootsAtLastTarget
		playerAnal.towerShootsWhenCouldHeal = alphaShoots * (playerAnal.towerShootsWhenCouldHeal || 1) + (1 - alphaShoots) * room.mem.towerShootsWhenCouldHeal



		Memory.stats.profiler["defenseAnalysis" + room.name] = (Game.cpu.getUsed() - t)
	},

	nonLocalDefenseSupportAnalysis(room) {
		// Don't need to hit this too often
		if (Math.random() > 0.1) return;
		if (!room.memory.assaultReactionCreepsSpawned) return;

		// Look at all the creeps, figure out the % that are from this room.
		let defenseCreeps = room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK], true);

		// Err.
		if (defenseCreeps.length == 0) return;

		let localCount = 0;

		for (var defenseCreep of defenseCreeps) {
			if (room.memory.assaultReactionCreepsSpawned.includes(defenseCreep.id)) {
				localCount++;
			}
		}

		let localPercentage = localCount / defenseCreeps.length;

		room.memory.percentLocalDefense = (room.memory.percentLocalDefense || 1) * alphaNonLocalDefense + (1 - alphaNonLocalDefense) * localPercentage
	},

	creepDefenseAnalysis(room, attackEvents) {
		for (let event of attackEvents) {
			let sourceObject = Game.getObjectById(event.objectId);

			if (!sourceObject || sourceObject.my) continue;

			if (sourceObject.name) {
				room.memory.roomIsCreepDefending = (room.memory.roomIsCreepDefending || 1) * alphaCreepDefending + (1 - alphaCreepDefending);
				return
			}
		}
		room.memory.roomIsCreepDefending = (room.memory.roomIsCreepDefending || 1) * alphaCreepDefending
	},

	deadRoomAnalysis(room, attackEvents) {
		// Is anything attacking us
		for (let event of attackEvents) {
			let sourceObject = Game.getObjectById(event.objectId);

			if (!sourceObject || sourceObject.my) continue;

			room.memory.roomLastDefense = Game.time;
			room.memory.roomIsDefending = (room.memory.roomIsDefending || 1) * alphaDeadRoom + (1 - alphaDeadRoom);
			return
		}

		room.memory.roomIsDefending = (room.memory.roomIsDefending || 1) * alphaDeadRoom;
	},

	towerAnalysis(room, attackEvents, repairEvents, healEvents) {
		let activeTowers = _.filter(room.towers, (tower) => tower.isActive() && tower.energy >= TOWER_ENERGY_COST);

		let attackShots = [];
		let nonAttackShots = [];
		global.defenseAnalysis[room.name].roomTowerTarget = global.defenseAnalysis[room.name].roomTowerTarget || {};
		global.defenseAnalysis[room.name].roomHasHealableCreeps = global.defenseAnalysis[room.name].roomHasHealableCreeps || {};

		if ((room.memory.towerLastShot || 0) != Game.time - 2) {
			delete global.defenseAnalysis[room.name].strongholdLogicTargetId;
			delete global.defenseAnalysis[room.name].strongholdLogicTargetIds;
			delete global.defenseAnalysis[room.name].maxDamageCreepId;
			delete global.defenseAnalysis[room.name].closestCreeps;
			delete global.defenseAnalysis[room.name].firstCreep;
		}

		if (activeTowers.length > (room.memory.meanActiveTowers || 0)) {
			room.memory.meanActiveTowers = activeTowers.length
		}
		else {
			room.memory.meanActiveTowers = alphaMeanTowers * (room.memory.meanActiveTowers || room.towers.length) + (1 - alphaMeanTowers) * activeTowers.length
		}

		if (activeTowers.length == 0) return

		for (let event of attackEvents) {
			if (event.data.attackType != EVENT_ATTACK_TYPE_RANGED) continue;

			let sourceObject = Game.getObjectById(event.objectId);

			if (!sourceObject || !sourceObject.structureType || sourceObject.structureType != STRUCTURE_TOWER) continue;

			attackShots.push({src: sourceObject, dst: Game.getObjectById(event.data.targetId)});
		}
		for (let event of repairEvents.concat(healEvents)) {
			let sourceObject = Game.getObjectById(event.objectId);

			if (!sourceObject || !sourceObject.structureType || sourceObject.structureType != STRUCTURE_TOWER) continue;
			nonAttackShots.push({src: sourceObject, dst: Game.getObjectById(event.data.targetId)});
		}

		// Consider active?
		room.memory.towerShoots = alphaShoots * (room.memory.towerShoots || 1) + (1 - alphaShoots) * ((attackShots.length + nonAttackShots.length) / activeTowers.length)
		room.memory.towerShootsAttack = alphaShoots * (room.memory.towerShootsAttack || 1) + (1 - alphaShoots) * (attackShots.length / activeTowers.length)



		// Figure out if the creeps shot at the thing we said the stronghold should have shot at
		if (room.mem.invCL && (room.mem.towerShootsAtStrongholdMax || 0) > 0.99) {
			let myLastStrongholdLogicTargetId
			if ((room.memory.towerLastShot || 0) == Game.time - 2) {
				myLastStrongholdLogicTargetId = global.defenseAnalysis[room.name].strongholdLogicTargetId;
			}

			if (myLastStrongholdLogicTargetId) {
				let rangedEvents = [];
				for (let event of attackEvents) {
					let obj = Game.getObjectById(event.objectId)
					if (!obj) continue
					if (obj.my || obj.structureType || obj.owner.username != "Invader") continue
					if (event.data.attackType != EVENT_ATTACK_TYPE_RANGED) continue;

					rangedEvents.push(event)
				}
				for (let rangedEvent of rangedEvents) {
					let shotAtStrongholdTarget = (rangedEvent.data.targetId == myLastStrongholdLogicTargetId)

					// const.log(shotAtStrongholdTarget, myLastStrongholdLogicTargetId, JSON.stringify(rangedEvent))
						
					room.mem.creepsShootAtStrongholdMax = alphaRangedActsAsStronghold * (room.mem.creepsShootAtStrongholdMax || 0) + (1 - alphaRangedActsAsStronghold) * (shotAtStrongholdTarget ? 1 : 0)
				}
			}
		}


		// Look at edge shoots.
		if (attackShots.length != 0) {
			let myCreeps = room.find(FIND_MY_CREEPS);

			if (myCreeps.length) {
				global.defenseAnalysis[room.name].closestCreeps = global.defenseAnalysis[room.name].closestCreeps || {};

				let shots = attackShots.length;
				let shootsAtClosest = 1;
				let shootsAtFirst = 1;
				let shootsAtMax = 1;
				let shootsAtStrongholdMax = 1;
				let shootsWithFocus = 1;
				let shootsAtLastTarget = 0;
				let shootsAtHealers = 0;

				let myLastMaxDamageCreepId
				let myLastStrongholdLogicTargetId
				let myLastStrongholdLogicTargetIds
				if ((room.memory.towerLastShot || 0) == Game.time - 2) {
					myLastMaxDamageCreepId = global.defenseAnalysis[room.name].maxDamageCreepId;
					myLastStrongholdLogicTargetId = global.defenseAnalysis[room.name].strongholdLogicTargetId;
					myLastStrongholdLogicTargetIds = global.defenseAnalysis[room.name].strongholdLogicTargetIds;
				}

				let testDst;
				for (let shot of attackShots) {
					if (!testDst) {
						testDst = shot.dst;
					}
					else if (testDst != shot.dst) {
						shootsWithFocus = 0;
					}

					let targetCreep = shot.dst
					if (targetCreep && targetCreep.name) {
						if (targetCreep.hasBodypart(HEAL)) {
							shootsAtHealers += 1;
						}
						else {
							shootsAtHealers -= 1;	
						}

						if (myLastMaxDamageCreepId && targetCreep.id != myLastMaxDamageCreepId) {
							shootsAtMax = 0;
						}

						if (myLastStrongholdLogicTargetId && myLastStrongholdLogicTargetId != targetCreep.id) {
							if (room.memory.invCL >= 4) {
								Game.notify("Didn't shoot at stronghold max " + room.name + " " + Game.time + " expected " + myLastStrongholdLogicTargetId + " but shot " + targetCreep.id + " " + JSON.stringify(myLastStrongholdLogicTargetIds))
								console.log("Didn't shoot at stronghold max non-array", attackShots.length, "shot at", testDst.id, "targets", myLastStrongholdLogicTargetId, JSON.stringify(myLastStrongholdLogicTargetIds))
							}
							shootsAtStrongholdMax = 0;
						}
						// if (myLastStrongholdLogicTargetIds && myLastStrongholdLogicTargetIds[0] != targetCreep.id) {
						// 	if (room.memory.invCL == 5) {
						// 		console.log("Didn't shoot at stronghold max non-array", attackShots.length, "shot at", targetCreep.id, "target", myLastStrongholdLogicTargetIds[0])
						// 	}
						// }
						// if (myLastStrongholdLogicTargetIds && !myLastStrongholdLogicTargetIds.includes(targetCreep.id)) {
						// 	shootsAtStrongholdMax = 0;
						// }

						if ((room.memory.towerLastShot || 0) == Game.time - 2 && shot.src) {
							if (global.defenseAnalysis[room.name].closestCreeps[shot.src.id] != targetCreep.id) {
								shootsAtClosest = 0;
							}
							if (global.defenseAnalysis[room.name].firstCreep != targetCreep.id) {
								shootsAtFirst = 0;
							}
						}
					}



					if (shot.src) {
						room.memory.towerEnergyThreshold = Math.min((room.memory.towerEnergyThreshold || TOWER_CAPACITY), shot.src.energy)
					}
				}

				// If they shoot with focus and continued shooting the same target 
				if (shootsWithFocus && attackShots[0].dst) {
					if (global.defenseAnalysis[room.name].roomTowerTarget && attackShots[0].dst.id == global.defenseAnalysis[room.name].roomTowerTarget) {
						shootsAtLastTarget = 1;
					}
					global.defenseAnalysis[room.name].roomTowerTarget = attackShots[0].dst.id;
				}
				else {
					delete global.defenseAnalysis[room.name].roomTowerTarget;
				}

				shootsAtHealers /= activeTowers.length;
				room.memory.towerShootsAtHealers = alphaHealers * (room.memory.towerShootsAtHealers || 0) + (1 - alphaHealers) * shootsAtHealers
				room.memory.towerShootsWithFocus = alphaFocus * (room.memory.towerShootsWithFocus || 0) + (1 - alphaFocus) * shootsWithFocus

				// Only update if they shot.
				if ((room.memory.towerLastShot || 0) == Game.time - 2) {
					room.memory.towerShootsAtMax = alphaTargeting * (room.memory.towerShootsAtMax || 0) + (1 - alphaTargeting) * shootsAtMax
					room.memory.towerShootsAtStrongholdMax = alphaTargeting * (room.memory.towerShootsAtStrongholdMax || 0) + (1 - alphaTargeting) * shootsAtStrongholdMax

					if (room.memory.invCL == 5 && !shootsAtStrongholdMax) {
						console.log("Didn't shoot at stronghold max?", attackShots.length, "shot at", testDst.id, "targets", myLastStrongholdLogicTargetIds)

					}

					room.memory.towerShootsAtClosest = alphaTargeting * (room.memory.towerShootsAtClosest || 0) + (1 - alphaTargeting) * shootsAtClosest
					room.memory.towerShootsAtFirst = alphaTargeting * (room.memory.towerShootsAtFirst || 0) + (1 - alphaTargeting) * shootsAtFirst
					room.memory.towerShootsAtLastTarget = alphaLastTarget * (room.memory.towerShootsAtLastTarget || 0) + (1 - alphaLastTarget) * shootsAtLastTarget
				}

				room.memory.towerLastShot = Game.time - 1;

				// Make predictions for next tick
				for (let tower of activeTowers) {
					global.defenseAnalysis[room.name].closestCreeps[tower.id] = tower.pos.findClosestByRange(myCreeps).id
				}
				for (let tower of activeTowers) {
					global.defenseAnalysis[room.name].firstCreep = myCreeps[0].id
				}

				let mostDamageCreep;
				let mostDamage = 0
				for (let myCreep of myCreeps) {
					let damage = 0;
					for (let tower of activeTowers) {
						damage += util.getTowerDamageForDist(tower.pos.getRangeTo(myCreep.pos))
					}
					if (damage > mostDamage) {
						mostDamageCreep = myCreep;
						mostDamage = damage;
					}
				}

				if (mostDamageCreep) {
					global.defenseAnalysis[room.name].maxDamageCreepId = mostDamageCreep.id
				}

				// Copy-paste stronghold code ;)
				// let defenseCreeps = room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK], true);
				let defenseCreeps = room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, WORK], true);

				let myCreepsAndPowerCreeps = room.find(FIND_MY_POWER_CREEPS).concat(myCreeps)

				let strongholdTowers = _.clone(activeTowers)
				let strongholdDefenseCreeps = _.filter(defenseCreeps, defender => {
					if (room.memory.invCL && defender.owner.username != "Invader") {
						return false
					}
					if (defender.spawning) {
						return false
					}
					return true;
				})

				let ramparts = room.ramparts;

				let damagedDefenders = _.filter(strongholdDefenseCreeps, defender => {
					return defender.hits < defender.hitsMax
				})
				let damagedRoads = _.filter(room.roads, road => {
					return road.hits < road.hitsMax
				})

				if (strongholdTowers.length && (damagedDefenders.length || damagedRoads.length)) {
					// const protectedCreeps = _.filter(damagedDefenders, d => _.some(ramparts, {x: d.pos.x, y: d.pos.y}));
					const protectedCreeps = _.filter(damagedDefenders, d => _.some(ramparts, (rampart) => rampart.pos.x == d.pos.x && rampart.pos.y == d.pos.y));
					if(_.some(protectedCreeps)) {
						const tower = _.first(strongholdTowers);
						_.pull(strongholdTowers, tower);
					}
					else {						
						// const protectedRoads = _.filter(damagedRoads, r => _.some(ramparts, {x: r.pos.x, y: r.pos.y}));
						const protectedRoads = _.filter(damagedRoads, r => _.some(ramparts, (rampart) => rampart.pos.x == r.pos.x && rampart.pos.y == r.pos.y));
						if(_.some(protectedRoads)) {
							const tower = _.first(strongholdTowers);
							_.pull(strongholdTowers, tower);
						}
					}
				}

				const strongholdLogicTarget = _.max(myCreepsAndPowerCreeps, creep => {
					let damage = _.sum(strongholdTowers, tower => {
						let r = creep.pos.getRangeTo(tower);
						let amount = TOWER_POWER_ATTACK;
						if(r > TOWER_OPTIMAL_RANGE) {
							if(r > TOWER_FALLOFF_RANGE) {
							    r = TOWER_FALLOFF_RANGE;
							}
							amount -= amount * TOWER_FALLOFF * (r - TOWER_OPTIMAL_RANGE) / (TOWER_FALLOFF_RANGE - TOWER_OPTIMAL_RANGE);
						}
						[PWR_OPERATE_TOWER, PWR_DISRUPT_TOWER].forEach(power => {
							const effect = _.find(tower.effects, {power});
							if(effect /*&& effect.endTime > Game.time*/) {
							    amount *= POWER_INFO[power].effect[effect.level-1];
							}
						});
						return Math.floor(amount);
					});
					damage += _.sum(strongholdDefenseCreeps, defender => {
						let d = 0;
						let range = defender.pos.getRangeTo(creep);

						if (range <= 3) {
							let bcmp = defender.getBoostModifiedCombatParts(true, true, 0);

							if(_.some(defender.body, {type: RANGED_ATTACK})) {
								d += bcmp.numRanged * RANGED_ATTACK_POWER;
							}
							if(range <= 1 && _.some(defender.body, {type: ATTACK})) {
								d += bcmp.numAttack * ATTACK_POWER;
							}
						}

						return d;
					});

					return damage;
				});

				global.defenseAnalysis[room.name].strongholdLogicTargetId = strongholdLogicTarget.id

				/*const strongholdLogicDamages = _.map(myCreepsAndPowerCreeps, creep => {
					let damage = _.sum(strongholdTowers, tower => {
						let r = creep.pos.getRangeTo(tower);
						let amount = TOWER_POWER_ATTACK;
						if(r > TOWER_OPTIMAL_RANGE) {
							if(r > TOWER_FALLOFF_RANGE) {
							    r = TOWER_FALLOFF_RANGE;
							}
							amount -= amount * TOWER_FALLOFF * (r - TOWER_OPTIMAL_RANGE) / (TOWER_FALLOFF_RANGE - TOWER_OPTIMAL_RANGE);
						}
						[PWR_OPERATE_TOWER, PWR_DISRUPT_TOWER].forEach(power => {
							const effect = _.find(tower.effects, {power});
							if(effect) {
							    amount *= POWER_INFO[power].effect[effect.level-1];
							}
						});
						return Math.floor(amount);
					});
					damage += _.sum(strongholdDefenseCreeps, defender => {
						let d = 0;
						let range = defender.pos.getRangeTo(creep);

						if (range <= 3) {
							let bcmp = defender.getBoostModifiedCombatParts(true, true, 0);

							if(_.some(defender.body, {type: RANGED_ATTACK})) {
								d += bcmp.numRanged * RANGED_ATTACK_POWER;
							}
							if(range <= 1 && _.some(defender.body, {type: ATTACK})) {
								d += bcmp.numAttack * ATTACK_POWER;
							}
						}

						return d;
					});

					return damage;
				});

				let maxDamage = _.max(strongholdLogicDamages);

				let possibleTargets = []
				for (let i = 0; i < strongholdLogicDamages.length; i++) {
					if (strongholdLogicDamages[i] == maxDamage) {
						possibleTargets.push(myCreepsAndPowerCreeps[i].id)
					}
				}

				global.defenseAnalysis[room.name].strongholdLogicTargetIds = possibleTargets*/
			}
			
			// Do they ever attack if there's stuff to heal
			if (global.defenseAnalysis[room.name].roomHasHealableCreeps) {
				room.memory.towerShootsWhenCouldHeal = alphaShoots * (room.memory.towerShootsWhenCouldHeal || 1) + (1 - alphaShoots)
			}
			else {
				room.memory.towerShootsWhenCouldHeal = alphaShoots * (room.memory.towerShootsWhenCouldHeal || 1)
			}
		}
		else {
			if (global.defenseAnalysis[room.name].roomHasHealableCreeps) {
				room.memory.towerShootsWhenCouldHeal = alphaShoots * (room.memory.towerShootsWhenCouldHeal || 1)
			}
			delete global.defenseAnalysis[room.name].roomTowerTarget;
		}

		delete global.defenseAnalysis[room.name].roomHasHealableCreeps

		for (var hostileCreep of room.getAllHostileCreepsAndPowerCreeps()) {
			if (hostileCreep.hits != hostileCreep.hitsMax) {
				global.defenseAnalysis[room.name].roomHasHealableCreeps = 1;
				break
			}
		}
	},

	repairAnalysis(room, repairEvents) {
		let repairHits = 0;
		for (let event of repairEvents) {
			repairHits += event.data.amount;
		}

		room.memory.repairPerTick = alphaRepair * (room.memory.repairPerTick || 0) + (1 - alphaRepair) * repairHits;
	},

	terminalAnalysis(room, transferEvents) {
		if (!room.terminal) return;

		let currentEnergy = room.terminal.store[RESOURCE_ENERGY] || 0;

		// Source is event.objectId, dest is event.data.targetId 
		let creepDelta = 0;
		for (let event of transferEvents) {
			if (event.data.resourceType == RESOURCE_ENERGY) {
				// Transfer to the terminal
				if (Game.getObjectById(event.data.targetId) == room.terminal) {
					creepDelta += event.data.amount;
				}
				else if (Game.getObjectById(event.objectId) == room.terminal) {
					creepDelta -= event.data.amount;
				}
			}
		}

		global._roomLastTerminalE = global._roomLastTerminalE || {};
		global._roomLastTerminalE[room.name] = global._roomLastTerminalE[room.name] || {};

		if (global._roomLastTerminalE[room.name].e !== undefined && global._roomLastTerminalE[room.name].t == Game.time - 1) {			
			// Energy has been shipped in via the terminal
			if (currentEnergy - (global._roomLastTerminalE[room.name].e + creepDelta) >= 100) {
				room.memory.termEnergyInPerTick = alphaTerm * (room.memory.termEnergyInPerTick || 0) + (1 - alphaTerm) * (currentEnergy - (global._roomLastTerminalE[room.name].e + creepDelta));
			}
			else {
				room.memory.termEnergyInPerTick = alphaTerm * (room.memory.termEnergyInPerTick || 0);	
			}
		}
		else {
			global._roomLastTerminalE[room.name].e = currentEnergy
			global._roomLastTerminalE[room.name].t = Game.time
		}

	},

	guardPositionAnalyis(room) {
		let defenseCreeps = room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK], true);

		let defenseHeatMap;
		// Heat map is _not_ space efficient
		if (!room.memory.defenseHeatMap) {
			defenseHeatMap = []
			for (let i = 0; i < 50; i++) {
				defenseHeatMap.push([]);
				for (let j = 0; j < 50; j++) {
					defenseHeatMap[i].push(0);
				}
			}
			room.memory.defenseHeatMap = defenseHeatMap
		}
		else {
			defenseHeatMap = room.memory.defenseHeatMap;
			if (Math.random() < 0.1) {
				// Decay
				for (let i = 1; i < 49; i++) {
					for (let j = 1; j < 49; j++) {
						defenseHeatMap[i][j] *= decayHeatmap;
					}
				}
			}
			if (Math.random() < 0.01) {
				for (let i = 1; i < 49; i++) {
					for (let j = 1; j < 49; j++) {
						if (defenseHeatMap[i][j] < 1) {
							defenseHeatMap[i][j] = 0;
						}
					}
				}
			}
		}

		// Mostly care about defenses if we're limited by them
		let mod = 1
		if (Game.time - (room.memory.withdrawTick || 0) > 100 && room.memory.advBlkDmg < 0.2) {			
 			mod = 0.5
		}

		for (let defenseCreep of defenseCreeps) {
			let ramparted = 0;

			let structs = defenseCreep.pos.lookFor(LOOK_STRUCTURES);
			for (let struct of structs) {
				if (struct.structureType == STRUCTURE_RAMPART) {
					ramparted = 1;
					break;
				}
			}

			if (!ramparted) continue;

			let bodyParts = defenseCreep.getBoostModifiedCombatParts(true, true);
			let dmg = bodyParts.numAttack * ATTACK_POWER + bodyParts.numRanged * RANGED_ATTACK_POWER;

			dmg *= (1 - decayHeatmap) * mod

			defenseHeatMap[defenseCreep.pos.x][defenseCreep.pos.y] += dmg;
		}
	},

	guardCostAnalysis(room) {
		let defenseCreeps = room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true);

		let boostCost = 0

		for (let defenseCreep of defenseCreeps) {
			boostCost += defenseCreep.getCurrentBoostCost();
		}

		room.memory.defenseBoostCost = alphaBoostCost * (room.memory.defenseBoostCost || 0) + (1 - alphaBoostCost) * boostCost
	},

	getPredictedTowerActions(room) {
		let myCreeps = room.find(FIND_MY_CREEPS);

	},

	getPredictedTarget(room, tower) {
		global.inTickObject.getPredictedTarget = global.inTickObject.getPredictedTarget || {}
		if (global.inTickObject.getPredictedTarget[room.name][tower.id]) {
			return global.inTickObject.getPredictedTarget[room.name][tower.id];
		}

		return
	}
};

module.exports = defenseAnalysis;