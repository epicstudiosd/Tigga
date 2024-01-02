"use strict";



var util = require('util');
var safeRoute = require('safeRoute');
var combatManager = require('combatManager');
const roomAI = require('roomAI');
const roomIntel = require('roomIntel');
const roomDesignAI = require('roomDesignAI');
const segments = require('segments');
const constants = require('constants');
const pathCache = require('pathCache');
const mlp = require('mlp');
const scouting = require('scouting');
let PriorityQueue = require('pQueue');

let idleCreepManager = require('idleCreepManager');
let creepCreator = require('creepCreator');
let missionInfo = require('missionInfo');


function getTowerDamageForTarget(tower, threat) {
	let powerScale = 1
	for (let effect of (tower.effects || [])) {
		if (effect.power === PWR_DISRUPT_TOWER) {
			if (effect.ticksRemaining == 1) {
				powerScale *= (1 + POWER_INFO[effect.power].effect[effect.level-1]) / 2;
			}
			else {
				powerScale *= POWER_INFO[effect.power].effect[effect.level-1];
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

	return powerScale * util.getTowerDamageForDist(tower.pos.getRangeTo(threat))
}


function drawSafeZone(room) {
	if (false && Memory.visuals) {
		for (var x = 0; x < 49; x++) {
			for (var y = 0; y < 49; y++) {
				if (isInSafeZone(room, x, y)) {
					var colour = ((x + y) % 2 == 0) ? "#000000" : "#ffff00"
					room.visual.rect(x - 0.5, y - 0.5, 1, 1, {fill: colour, opacity: 0.1})
				}
			}
		}
	}
}

function isInSafeZone(room, x, y) {
	// 1 is inside the walls, 2 is on the wall, 0 is outside.

	let segementData;
	if (isNaN(50 + room.memory.ID % 45)) {
		console.log("Room has nan id", room, room.memory.ID)
	}
	else {
		segementData = segments.loadSegmentData(50 + room.memory.ID % 45);
	}


	if (segementData) {
		let floodedDesign = segementData[room.name].floodedDesign;
		if (floodedDesign && parseInt(floodedDesign[x][y]) === 1) {
			return true;
		}
	}


	return false;
}

// isInSafeZone = profiler.registerFN(isInSafeZone, 'isInSafeZone');


// Create a sorted list of ramaparts we want chaps to sit on.
function assignRampartPriorities(room, threats, etotalAttack, etotalRanged, etotalHeal) {
	let a = Game.cpu.getUsed();

	// figure out some details
	room.breached = false;
	if (room.controller.level >= 3) {		
		for (let threat of threats) {
			if (threat.owner.username == "Invader") continue

			// if (Memory.season2 && scouting.isPlayerMediumWhiteListed(threat.owner.username)) {
			// 	if (!threat.hasBodypart(ATTACK) && !threat.hasBodypart(RANGED_ATTACK) && !threat.hasBodypart(WORK)) {
			// 		continue
			// 	}
			// }


			if (isInSafeZone(room, threat.pos.x, threat.pos.y)) {
				room.memory.lastBreached = Game.time;
				delete room.memory.tmpBuildings
				room.breached = true;
				break;
			}
		}
	}

	console.log("ARP 1", Game.cpu.getUsed() - a);

	if (room.ramparts.length == 0) {
		return;
	}

	let treatAsBreached = room.breached || room.effectiveLevel < 3

	a = Game.cpu.getUsed();

	let ftotalAttack = 0;
	let ftotalRanged = 0;
	let ftotalHeal = 0;

	let meanX = 0;
	let meanY = 0;

	let myCombatCreeps = room.getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], true);
	let numDefenders = myCombatCreeps.length
	let numAttackDefenders = 0
	let numRangedDefenders = 0

	for (var friendlyCreep of myCombatCreeps) {
		if ((friendlyCreep.mem.ID === undefined || friendlyCreep.mem.ID === 0) && !friendlyCreep.mem.haveSnaked && friendlyCreep.ticksToLive > 5) {
			friendlyCreep.ramparter = 1;
		}

		var combatParts = friendlyCreep.getBoostModifiedCombatParts(true);
		ftotalAttack += combatParts.numAttack;
		ftotalRanged += combatParts.numRanged;

		if (friendlyCreep.combatSnake) {
			ftotalHeal += 0.25 * combatParts.numHeal;
		}
		else {
			ftotalHeal += 0.5 * combatParts.numHeal;
		}

		if (combatParts.numAttack) {
			numAttackDefenders += 1
		}
		if (combatParts.numRanged) {
			numRangedDefenders += 1
		}

		meanX += friendlyCreep.pos.x;
		meanY += friendlyCreep.pos.y;
	}

	if (numAttackDefenders > 2 * threats.length) {
		ftotalAttack = ftotalAttack * 2 * threats.length / numAttackDefenders
	}
	if (numRangedDefenders > 4 * threats.length) {
		ftotalRanged = ftotalRanged * 4 * threats.length / numRangedDefenders
	}

	let minX = 50
	let minY = 50
	let maxX = 0
	let maxY = 0

	for (let threat of threats) {
		meanX += threat.pos.x;
		meanY += threat.pos.y;

		minX = Math.min(minX, threat.pos.x)
		minY = Math.min(minY, threat.pos.y)

		maxX = Math.min(maxX, threat.pos.x)
		maxY = Math.min(maxY, threat.pos.y)
	}



	let myApproxCreeps = Math.max(1, numDefenders); 
	// let myApproxCreeps = Math.max(1, numDefenders * (treatAsBreached ? 1 : 0.5)); // We can retreat to the ramparts

	let friendlyCloseRangeThreat = ftotalAttack * ATTACK_POWER + ftotalRanged * RANGED_ATTACK_POWER * (1. + (Math.sqrt((threats.length || 1) - 1))) - etotalHeal * HEAL_POWER * .5;
	let friendlyLongRangeThreat = ftotalRanged * RANGED_ATTACK_POWER * (1. + (0.2 * Math.sqrt((threats.length || 1) - 1))) - etotalHeal * HEAL_POWER * .5;

	let enemyCloseRangeThreat = etotalAttack * ATTACK_POWER + etotalRanged * RANGED_ATTACK_POWER * (1. + (Math.sqrt((myApproxCreeps || 1) - 1))) - ftotalHeal * HEAL_POWER * .5;
	let enemyLongRangeThreat = etotalRanged * RANGED_ATTACK_POWER * (1. + (0.2 * Math.sqrt((myApproxCreeps || 1) - 1))) - ftotalHeal * HEAL_POWER * .5;


	if ((room.effectiveLevel || 0) >= 3 && Math.max(maxX - minX, maxY - minY) <= 6) {
		meanX = Math.round(meanX / (numDefenders + threats.length));
		meanY = Math.round(meanY / (numDefenders + threats.length));
		let towers = room.getMyActiveTowers();
		for (let tower of towers) {
			let range = tower.pos.getRangeTo(meanX, meanY);

			let powerScale = 1
			for (let effect of (tower.effects || [])) {
				if (effect.power === PWR_DISRUPT_TOWER) {
					if (effect.ticksRemaining == 1) {
						powerScale *= (1 + POWER_INFO[effect.power].effect[effect.level-1]) / 2;
					}
					else {
						powerScale *= POWER_INFO[effect.power].effect[effect.level-1];
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

			// Towers will tend to attack and not heal, and don't have 100% up time. Call it 7-2-1
			friendlyCloseRangeThreat += util.getTowerDamageForDist(range) * (treatAsBreached ? 0.7 : 0.35) * powerScale;
			friendlyLongRangeThreat += util.getTowerDamageForDist(range) * (treatAsBreached ? 0.7 : 0.35) * powerScale;

			enemyCloseRangeThreat -= util.getTowerHealForDist(range) * (treatAsBreached ? 0.2 : 0.1) * powerScale;
			enemyLongRangeThreat -= util.getTowerHealForDist(range) * (treatAsBreached ? 0.2 : 0.1) * powerScale;
		}
	}

	// console.log(room, enemyLongRangeThreat, enemyCloseRangeThreat, ftotalAttack, ftotalRanged, ftotalHeal, etotalAttack, etotalRanged, etotalHeal, myApproxCreeps, threats.length, meanX, meanY)

	let enemyMeleeAttack = enemyCloseRangeThreat - friendlyCloseRangeThreat * 0.125 > 0 && enemyCloseRangeThreat > 0;
	let enemyRangedAttack = etotalRanged > 0 && enemyLongRangeThreat - friendlyLongRangeThreat * 0.125 > 0 && enemyLongRangeThreat > 0;

	// console.log(room, enemyMeleeAttack, enemyRangedAttack)
	// console.log(room, etotalRanged)
	console.log("ARP 2", Game.cpu.getUsed() - a);
	a = Game.cpu.getUsed();

	let ignoreRamparts = enemyCloseRangeThreat + enemyLongRangeThreat - (friendlyCloseRangeThreat + friendlyLongRangeThreat) * 0.4 < 0;

	if (ignoreRamparts) {
		room.allowRoamingRamparters = true;
		// return;
	}
	let useAllRamparts = false && enemyCloseRangeThreat + enemyLongRangeThreat - (friendlyCloseRangeThreat + friendlyLongRangeThreat) * 0.6 < 0;
	console.log(room, enemyCloseRangeThreat, enemyLongRangeThreat, friendlyCloseRangeThreat, friendlyLongRangeThreat, ignoreRamparts, useAllRamparts)

	room.useAllRamparts = useAllRamparts;

	let runFullAlgo = (Game.cpu.bucket > 1000 || Math.random() > 0.5) && threats.length

	let ramparts

	if (runFullAlgo) {
		ramparts = _.filter(room.ramparts, (structure) => {
			var otherStructures = structure.pos.lookFor(LOOK_STRUCTURES);
			for (var otherStructure of otherStructures) {
				if (otherStructure.structureType != STRUCTURE_ROAD && otherStructure.structureType != STRUCTURE_CONTAINER && otherStructure.structureType != STRUCTURE_RAMPART) {
					return false;
				}
			}
			var constructionSites = structure.pos.lookFor(LOOK_CONSTRUCTION_SITES);
			for (var constructionSite of constructionSites) {
				if (constructionSite.structureType != STRUCTURE_ROAD && constructionSite.structureType != STRUCTURE_CONTAINER && constructionSite.structureType != STRUCTURE_RAMPART) {
					return false;
				}
			}

			return true;
		});
	}
	else {
		ramparts = room.ramparts
	}

	console.log("ARP 3", Game.cpu.getUsed() - a);
	a = Game.cpu.getUsed();


	let availableTankRamparts = [];
	let availableRangedRamparts = [];

	room.memory.oldRampartPrioritiesT = room.memory.oldRampartPrioritiesT || {};
	room.memory.oldRampartPrioritiesR = room.memory.oldRampartPrioritiesR || {};

	let segementData;
	if (!useAllRamparts) {
		if (isNaN(50 + room.memory.ID % 45)) {
			console.log("Room has nan id", room, room.memory.ID)
		}
		else {
			segementData = segments.loadSegmentData(50 + room.memory.ID % 45);
		}
		if (!segementData) {
			console.log("No segment data for room!", room)
			useAllRamparts = 1;
		}
	}

	let numActiveRangedRamparts = 0;
	let numActiveAttackRamparts = 0;

	// let rampartMaxHits = 0;

	// for (let rampart of ramparts) {
	// 	if (rampart.hits > rampartMaxHits) {
	// 		rampartMaxHits = rampart.hits;
	// 	}
	// }

	// Hack

	// 2 == border rampart
	// 1 == inside
	if (runFullAlgo) {
		for (let rampart of ramparts) {
			if (rampart.hits < 10000) continue
			let rampartValid = true;

			if (Memory.season2 && room.name == "W9S9") {
				if (rampart.pos.inRangeToPos(room.controller.pos, 3)) {
					rampartValid = false;
					continue
				}
			}


			if (!useAllRamparts) {
				if (segementData) {
					rampartValid = 0;
					let floodedDesign = segementData[room.name].floodedDesign;

					if (parseInt(floodedDesign[rampart.pos.x][rampart.pos.y]) >= 1) {
						rampartValid = 1;
					}
					else if (room.memory.nukeRamparts && room.memory.nukeRamparts.includes(rampart.pos.y * 50 + rampart.pos.x)) {
						rampartValid = 1;
					}
					else {
						for (let i = -1; i <= 1; i++) {
							if (rampart.pos.x + i < 0 || rampart.pos.x + i > 49) continue
							for (let j = -1; j <= 1; j++) {
								if (rampart.pos.y + j < 0 || rampart.pos.u + j > 49) continue

								if (parseInt(floodedDesign[rampart.pos.x + i][rampart.pos.y + j]) >= 1) {
									rampartValid = 1;
									break;
								}
							}
							if (rampartValid) {
								break;
							}
						}
					}
				}

				if (!rampartValid) {
					delete room.mem.oldRampartPrioritiesR[rampart.id] 
					delete room.mem.oldRampartPrioritiesT[rampart.id]

					continue
				}
			}


			let rangedDamage = 0;
			let tankDamage = 0;

			let canRanged = false;

			// If the enemy has no RA, don't move RA creeps onto ramparts
			// let them do normal kitey fighty.
			// Add a small mount of pos data as a tiebreaker.
			// let mod = 1
			// for (var target of threats) {
			// 	let range = rampart.pos.getRangeToRoomObject(target);
			// 	if (!target.hasBodypart(RANGED_ATTACK) && !target.hasBodypart(ATTACK) && !target.hasBodypart(WORK)) {
			// 		mod = 0.5;
			// 	}

			// 	if (range == 1) {
			// 		rangedDamage += (10000 + rampart.pos.x / 100 + rampart.pos.y / 10000) * mod
			// 		tankDamage += (30000 + rampart.pos.x / 100 + rampart.pos.y / 10000) * mod
			// 		canRanged = true;
			// 	}
			// 	else if (range == 2) {
			// 		rangedDamage += (4000 + rampart.pos.x / 100 + rampart.pos.y / 10000) * mod
			// 		canRanged = true;
			// 	}
			// 	else if (range == 3) {
			// 		rangedDamage += (1000 + rampart.pos.x / 100 + rampart.pos.y / 10000) * mod
			// 		canRanged = true;
			// 	}
			// }
			for (var target of threats) {
				if (rampart.pos.inRangeToPos(target.pos, 3)) {
					let range = rampart.pos.getRangeToPos(target.pos);

					let mod = 1
					canRanged = true
					if (!target.hasBodypart(RANGED_ATTACK) && !target.hasBodypart(ATTACK) && !target.hasBodypart(WORK)) {
						mod = 0.5;
					}
					if (range == 1) {
						rangedDamage += (10000 + rampart.pos.x / 100 + rampart.pos.y / 10000) * mod
						tankDamage += (30000 + rampart.pos.x / 100 + rampart.pos.y / 10000) * mod
					}
					else if (range == 2) {
						rangedDamage += (4000 + rampart.pos.x / 100 + rampart.pos.y / 10000) * mod
						canRanged = true;
					}
					else if (range == 3) {
						rangedDamage += (1000 + rampart.pos.x / 100 + rampart.pos.y / 10000) * mod
					}
				}

			}

			if ((!ignoreRamparts || canRanged) && enemyRangedAttack && !treatAsBreached) {
				for (var target of threats) {
					let range = rampart.pos.getRangeToRoomObject(target);
					rangedDamage += ((50 - range) + rampart.pos.x / 100 + rampart.pos.y / 10000);
				}
			}

			if (!canRanged && enemyMeleeAttack && !treatAsBreached && !ignoreRamparts) {
				for (var target of threats) {
					let range = rampart.pos.getRangeToRoomObject(target);
					tankDamage += ((50 - range) + rampart.pos.x / 100 + rampart.pos.y / 10000);
				}
			}


			// If we do less than 10 damage, we do 10 damage 'cos we'll RA not RMA
			if (rangedDamage >= 1000 && rangedDamage < 10000) {
				rangedDamage = 10000 + rampart.pos.x / 100 + rampart.pos.y / 10000;
			}

			if (enemyRangedAttack && threats.length == 0 && enemyLongRangeThreat && room.memory.DT > 0.5) {
				rangedDamage += 1e-2;
			}

			if (enemyMeleeAttack && threats.length == 0 && enemyCloseRangeThreat && room.memory.DT > 0.5) {
				tankDamage += 1e-2;
			}

			{
				let mod;

				if (treatAsBreached) {
					mod = 0.001;
				}
				// Decay priotrities near edge of room slower.
				else if (util.isNearEdgeOfRoom(rampart.pos, 5)) {
					if (util.isNearEdgeOfRoom(rampart.pos, 2)) {
						mod = 0.99
					}
					else if (util.isNearEdgeOfRoom(rampart.pos, 3)) {
						mod = 0.975
					}
					else if (util.isNearEdgeOfRoom(rampart.pos, 4)) {
						mod = 0.96
					}
					else {
						mod = 0.945;
					}
				}
				else {
					mod = 0.93;
				}

				// Nice in theory but was causing constant shuffling as the creeps are strictly ordered
				// and the "best" rampart kept changing
				// mod *= (0.8 + 0.4 * Math.random())

				// if (enemyRangedAttack) {
					rangedDamage = (1 - mod) * rangedDamage + (room.mem.oldRampartPrioritiesR[rampart.id] || 0) * mod;
				// }
				// if (enemyMeleeAttack) {
					tankDamage = (1 - mod) * tankDamage + (room.mem.oldRampartPrioritiesT[rampart.id] || 0) * mod;
				// }
			}

			room.mem.oldRampartPrioritiesR[rampart.id] = rangedDamage;
			room.mem.oldRampartPrioritiesT[rampart.id] = tankDamage;

			// let visual = new RoomVisual(room.name);

			if (rangedDamage > (ignoreRamparts ? 300 : 1e-3) || tankDamage > 1e-3) {
				// let mod = 1
				// mod *= 1 + (1 - rampart.hits / rampartMaxHits);

				rampart.rangedDamage = rangedDamage;
				rampart.tankDamage = tankDamage;

				if (rangedDamage > 400) numActiveRangedRamparts++;
				if (tankDamage > 400) numActiveAttackRamparts++;

				if (rangedDamage > (ignoreRamparts ? 300 : 1e-3)) {
					availableRangedRamparts.push(rampart)
					// visual.rect(rampart.pos.x - 0.25, rampart.pos.y - 0.25, 0.5, 0.5, {fill: "#0000ff", opacity: 0.5})
					// if (rampart.pos.x == 2) console.log(rampart.pos, rangedDamage)
				}
				if (tankDamage > 1e-3) {
					availableTankRamparts.push(rampart)
					// visual.rect(rampart.pos.x - 0.75, rampart.pos.y - 0.75, 0.5, 0.5, {fill: "#ff0000", opacity: 0.5})
					// if (rampart.pos.x == 2) console.log(rampart.pos, tankDamage)
				}
			}
		}
		console.log("ARP 4s", Game.cpu.getUsed() - a);
	}
	else {
		// Cheaper. Just use last.
		for (let rampart of ramparts) {
			if (rampart.hits < 10000) continue

			let rangedDamage = room.mem.oldRampartPrioritiesR[rampart.id] || 0;
			let tankDamage = room.mem.oldRampartPrioritiesT[rampart.id] || 0;

			if (rangedDamage > (ignoreRamparts ? 300 : 1e-3) || tankDamage > 1e-3) {

				room.mem.oldRampartPrioritiesR[rampart.id] *= .93;
				room.mem.oldRampartPrioritiesT[rampart.id] *= .93;

				// let mod = 1
				// mod *= 1 + (1 - rampart.hits / rampartMaxHits);

				rampart.rangedDamage = rangedDamage;
				rampart.tankDamage = tankDamage;

				if (rangedDamage > 400) numActiveRangedRamparts++;
				if (tankDamage > 400) numActiveAttackRamparts++;

				if (rangedDamage > (ignoreRamparts ? 300 : 1e-3)) {
					availableRangedRamparts.push(rampart)
					// visual.rect(rampart.pos.x - 0.25, rampart.pos.y - 0.25, 0.5, 0.5, {fill: "#0000ff", opacity: 0.5})
					// if (rampart.pos.x == 2) console.log(rampart.pos, rangedDamage)
				}
				if (tankDamage > 1e-3) {
					availableTankRamparts.push(rampart)
					// visual.rect(rampart.pos.x - 0.75, rampart.pos.y - 0.75, 0.5, 0.5, {fill: "#ff0000", opacity: 0.5})
					// if (rampart.pos.x == 2) console.log(rampart.pos, tankDamage)
				}
			}
		}
		console.log("ARP 4f", Game.cpu.getUsed() - a);
	}

	a = Game.cpu.getUsed();


	room.numActiveRangedRamparts = numActiveRangedRamparts;
	room.numActiveAttackRamparts = numActiveAttackRamparts;

	function compareRanged(rampart1, rampart2) {
		return rampart2.rangedDamage - rampart1.rangedDamage;

	}

	function compareTank(rampart1, rampart2) {
		return rampart2.tankDamage - rampart1.tankDamage
	}

	// availableRangedRamparts = _.sortBy(availableRangedRamparts, "id");
	// if (!ignoreRamparts) {		
		availableRangedRamparts.sort(compareRanged)

		room.bestRampartsRanged = _.clone(availableRangedRamparts);
	// }

	// availableTankRamparts = _.sortBy(availableTankRamparts, "id");
	availableTankRamparts.sort(compareTank)

	room.bestRampartsTank = _.clone(availableTankRamparts);

	console.log("ARP 5", Game.cpu.getUsed() - a);
	a = Game.cpu.getUsed();

}



function checkPressurePoints(room) {
	if (!room.breached) {
		let segementData = segments.loadSegmentData(50 + room.memory.ID % 45);

		if (segementData && segementData[room.name]) {
			let floodedDesign = segementData[room.name].floodedDesign;

			let ramparts = room.ramparts;

			global.roomRampartHits = global.roomRampartHits || {};
			global.roomRampartHits[room.name] = global.roomRampartHits[room.name] || {};

			Memory.roomPressurePoints = Memory.roomPressurePoints || {};
			Memory.roomPressurePoints[room.name] = Memory.roomPressurePoints[room.name] || {};

			global.maxDamageRampart = global.maxDamageRampart || {};
			global.maxDamageRampart[room.name] = undefined;

			let maxDamage = 0; 

			for (let rampart of ramparts) {
				// Don't build off tiles that are "outside". This prevents chained pressure points.
				// This is now checked at build time
				// if (parseInt(floodedDesign[rampart.pos.x][rampart.pos.y]) !== 0) {
					if (global.roomRampartHits[room.name][rampart.id] && global.roomRampartHits[room.name][rampart.id].time == Game.time - 1) {
						let damage = global.roomRampartHits[room.name][rampart.id].hits - rampart.hits

						if (damage > maxDamage) {
							global.maxDamageRampart[room.name] = rampart.id;
						}

						// Ignore nukes
						if (damage < 4e6) {							
							if (damage > 2 * RAMPART_DECAY_AMOUNT) {
								Memory.roomPressurePoints[room.name][rampart.id] = Memory.roomPressurePoints[room.name][rampart.id] || {}
								Memory.roomPressurePoints[room.name][rampart.id].t = Game.time
								Memory.roomPressurePoints[room.name][rampart.id].d = (Memory.roomPressurePoints[room.name][rampart.id].d || 0) + damage
							}
							// Can also repair
							else if (Memory.roomPressurePoints[room.name][rampart.id]) {
								Memory.roomPressurePoints[room.name][rampart.id].d += damage
							}
						}
					}

					global.roomRampartHits[room.name][rampart.id] = {hits: rampart.hits, time: Game.time};
				// }
			}
		}
	}
}




function runCivilianTowers(room) {
	room.mem.towerRepairSleep = room.mem.towerRepairSleep || 0
	if (room.mem.towerRepairSleep >= 0) {
		room.mem.towerRepairSleep -= 1;
	}

	let repairAllowed = room.mem.towerRepairSleep < 0 || Game.cpu.bucket > 9990

	if (room.dangerous || room.defcon < 5 || (Math.random() < 0.05 || repairAllowed)) {
		// var towers = room.getTowers();
		if (room.mem.towerRepairSleep < 0) {
			room.mem.towerRepairSleep = 5 + room.effectiveLevel * room.effectiveLevel * room.effectiveLevel + Math.round(10 * Math.random());
		}

		let towers = _.filter(room.towers, (tower) => (tower.energy >= 30))

		if (!towers.length) {
			return;
		}


		function filterHealTargets(creep) {
			if (room.dangerous) {
				if (creep.incomingDamageUB !== undefined) {
					if (creep.incomingDamageUB <= 0) {
						return false
					}
				}
				else {
					console.log("-------------- incomingDamageUB not defined on", creep, "in dangerous", room)
					if (creep.hits == creep.hitsMax) {
						return false
					}
				}

				if (creep.hasBodypart(ATTACK)) {
					return true
				}

				if (creep.hasBodypart(RANGED_ATTACK)) {
					return true
				}

				if (creep.hasBodypart(HEAL)) {
					return true
				}

				if (creep.mem.role == "repairer") {
					return true
				}

				// creep.pull is power creep check
				if (creep.pull) {
					return true
				}

				return false
			}
			else {
				return !creep.hasActiveBodypart(HEAL) || creep.hits < creep.hitsMax / 2;
			}
		}

		let healTargets

		if (room.dangerous) {
			// Injurable checks incomingDamageUB
			healTargets = _.filter(room.getMyInjurableCreeps(false), filterHealTargets);
		}
		else {
			healTargets = _.filter(room.getMyInjuredCreeps(), filterHealTargets);
		}

		if (healTargets.length == 0 && !repairAllowed) return


		let repStructures

		for(let tower of towers) {
			let injuredFriend = tower.pos.findClosestByRange(healTargets);

			if (injuredFriend && tower.energy > tower.energyCapacity * .5) {
				let ret = tower.heal(injuredFriend);
				// Ok, it's not repair, but this forces them active next tick
				room.mem.towerRepairSleep = -1

				if (ret == OK) {
					if (room.dangerous) {						
						injuredFriend.incomingDamageUB -= util.getTowerHealForDist(tower.pos.getRangeToPos(injuredFriend))
						if (injuredFriend.incomingDamageUB <= 0) {
							_.pull(healTargets, injuredFriend)
						}
					}
					else if (injuredFriend + util.getTowerHealForDist(tower.pos.getRangeToPos(injuredFriend)) >= injuredFriend.hitsMax) {
						_.pull(healTargets, injuredFriend)
					}
				}
			}
			else if (repairAllowed && tower.energy > tower.energyCapacity * .75) {
				if (!repStructures) {				
					if (roomDesignAI.getBuildings(room.name)) {
						repStructures = [];
						let buildings = roomDesignAI.getBuildings(room.name);
						if (room.mem.tmpBuildings) {
							buildings = buildings.concat(room.mem.tmpBuildings);
						}
						if (room.mem.pressureBuildings) {
							buildings = buildings.concat(room.mem.pressureBuildings);
						}

						for (let building of buildings) {
							let x = building.x !== undefined ? building.x : building.pos.x
							let y = building.y !== undefined ? building.y : building.pos.y
							repStructures = repStructures.concat(room.lookForAt(LOOK_STRUCTURES, x, y))
						}

						if (global.flaggedRoads &&
							global.flaggedRoads[room.name]) {

							for (let roadId of global.flaggedRoads[room.name]) {
								let obj = Game.getObjectById(roadId)
								if (obj) {
									repStructures.push(obj)
								}
							}
						}

						// console.log("Tower repair repStructures", room, repStructures)

					}
					else {
						repStructures = room.find(FIND_STRUCTURES);
					}

					repStructures = _.filter(repStructures,  
						function(structure) {
							let flagged;
							if (roomDesignAI.getBuildings(room.name)) {
								flagged = true;
							}
							else {
								let flags = structure.pos.lookFor(LOOK_FLAGS);
								flagged = structure.structureType == STRUCTURE_ROAD;
								for (let flag of flags) {
									if (!flag.name.startsWith(STRUCTURE_ROAD)) {
										flagged = true;
										break;
									}
								}
							}
							if (!flagged) return false;

							if (structure.structureType == STRUCTURE_RAMPART) {
								return structure.hits < 1000;
							}
							else if (structure.structureType == STRUCTURE_ROAD) {
								return structure.hits / structure.hitsMax < .15;
							}
							else if (structure.structureType == STRUCTURE_CONTAINER) {
								return structure.hits / structure.hitsMax < .1
							}
							else if (structure.hits) {
								// Somethings been doing nasty stuff. Try a rebuild.
								room.mem.triggerRebuild = 1;
								return structure.hits / structure.hitsMax < 0.95
							}
						}
					)

				}
				let target = tower.pos.findClosestByRange(repStructures)
				if (target) {
					target.towerRepair = true;
					room.mem.towerRepairSleep = -1;
					tower.repair(target);
					_.pull(repStructures, target)
				}
			}
		}
	}
}


const alphaSelfHeal = Math.exp(-(1/(100.)))


function analyseAttackers(room) {
	room.memory.threatLastHits = room.memory.threatLastHits || {};

	let eventLog = room.getEventLog();

	let healEvents = [];

	for (let event of eventLog) {
		if (event.event == EVENT_HEAL) {
			healEvents.push(event)
		}
	}

	let heals = []

	for (let event of healEvents) {
		if (event.data.healType != EVENT_HEAL_TYPE_MELEE) continue;

		let sourceObject = Game.getObjectById(event.objectId);

		if (!sourceObject || sourceObject.my) continue;

		let dstObject = Game.getObjectById(event.data.targetId);

		if (dstObject) {
			heals.push({src: sourceObject, dst: dstObject});
		}
	}

	/*try {
		// Ok. MACHINE LEARNING
		// We're going to train a network on pairs of creeps.
		// These creeps are one heal one not heal.
		let hostiles = room.getAllHostileCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL, WORK], false);

		for (let healer of hostiles) {
			if (healer.analyseAttackersPaired) continue;
			if (!healer.hasBodypart(HEAL)) continue;

			let others = healer.pos.findInRange(hostiles, 3)
			if (others.length == 2) {
				let pair = true;
				let pairedOther;
				for (let other of others) {
					if (healer == other) continue;
					if (healer.owner.username != other.owner.username) continue;
					if (other.hasBodypart(HEAL)) continue;
					pairedOther = other;
					if (other.pos.findInRange(hostiles, 3).length != 2) {
						pair = false;
						break;
					}
				}
				// Aha!
				if (healer && pairedOther) {
					healer.analyseAttackersPaired = 1;
					pairedOther.analyseAttackersPaired = 1;

					let sig = healer.getSignature() + pairedOther.getSignature();
					let exampleId = healer.id + pairedOther.id;
					sig += healer.owner.username;

					let input;
					if (healer.hits != healer.hitsMax || pairedOther.hits != pairedOther.hitsMax) {
						let towerDmg = 0;
						for (let tower of room.towers) {
							towerDmg += util.getTowerDamageForDist(tower.pos.getRangeTo(healer))
							towerDmg += util.getTowerDamageForDist(tower.pos.getRangeTo(pairedOther))
						}

						towerDmg /= 2;
						// Normalize to 0->1
						towerDmg -= 150 * room.towers.length;
						towerDmg /= 450;

						input = [healer.hits / healer.hitsMax, pairedOther.hits / pairedOther.hitsMax, towerDmg];
					}

					let lastTickResult;
					for (let heal of heals) {
						if (heal.src.id == healer.id) {
							if (heal.dst.id == pairedOther.id) {
								lastTickResult = [0, 1]
							}
							else if (heal.dst.id == healer.id) {
								lastTickResult = [1, 0]
							}
						}
					}

					let output = mlp.run(input, lastTickResult, sig, exampleId, constants.NEURAL_NETWORK_PAIRED_ATTACKERS);

					if (output) {
						let healAmount = healer.getActiveBoostModifiedHeal()

						healer.pairedHealMLPChance = output[0];
						healer.pairedHealMLPAmount = healAmount;

						pairedOther.pairedHealMLPChance = output[1];
						pairedOther.pairedHealMLPAmount = healAmount;
					}
				}
			}
		}
	}
	catch(e) {
		console.log("Error in mlp", room);
		console.log(e.stack);
	}*/



	let healersDefaultHealOthersFirst = {};
	let healersAlwaysHealSelfFirst = {};
	for (let heal of heals) {
		healersDefaultHealOthersFirst[heal.src.owner.username] = 1;
		healersAlwaysHealSelfFirst[heal.src.owner.username] = 0;
	}


	for (let heal of heals) {
		if (heal.src.id == heal.dst.id) {
			if (room.memory.threatLastHits[heal.src.id]) {
				// Healer self healed with other guys in range while being on max hits.
				if (room.memory.threatLastHits[heal.src.id] == heal.src.hitsMax && heal.src.pos.findInRange(room.getAllHostileCreepsAndPowerCreeps(), 3).length > 1) {
					healersDefaultHealOthersFirst[heal.src.owner.username] = 0;
				}
				// Healer self healed while other creeps in range while injured. This is to be expected some of the time
				// but if it's all of the time it's exploitable.
				else if (room.memory.threatLastHits[heal.src.id] != heal.src.hitsMax && heal.src.pos.findInRange(room.getAllHostileCreepsAndPowerCreeps(), 3).length > 1) {
					healersAlwaysHealSelfFirst[heal.src.owner.username] = 1;
				}
			}
		}
	}

	room.memory.healersDefaultHealOthersFirst = room.memory.healersDefaultHealOthersFirst || {};
	room.memory.healersAlwaysHealSelfFirst = room.memory.healersAlwaysHealSelfFirst || {}

	for (let owner in healersDefaultHealOthersFirst) {
		room.memory.healersDefaultHealOthersFirst[owner] = alphaSelfHeal * (room.memory.healersDefaultHealOthersFirst[owner] || 0.5) + (1 - alphaSelfHeal) * (healersDefaultHealOthersFirst[owner])
	}
	for (let owner in healersAlwaysHealSelfFirst) {
		room.memory.healersAlwaysHealSelfFirst[owner] = alphaSelfHeal * (room.memory.healersAlwaysHealSelfFirst[owner] || 0.5) + (1 - alphaSelfHeal) * (healersAlwaysHealSelfFirst[owner])
	}
}


var roomDefenseAI = {
	remoteDefense : function(room) {

		let protectionNotSpawned = 0;

		global.defenseRooms = global.defenseRooms || {};

		let protectRoomNames;
		if (Math.random() < 0.05 || !global.defenseRooms[room.name]) {
			let myPowerRooms = [];
			for(var powerRangerIdx in Memory.powerRangers) {
				if (Memory.powerRangers[powerRangerIdx] && Memory.powerRangers[powerRangerIdx].sR == this.name) {
					myPowerRooms.push(Memory.powerRangers[powerRangerIdx].targetRoom)
				}
			}

			protectRoomNames = [];

			// This is just a massive energy drain if somebody wants to fight.
			let exits = Game.map.describeExits(room.name);
			for (var exitID in exits) {

				if (Memory.rooms[exits[exitID]] && Memory.rooms[exits[exitID]].owner) continue;

				// Only defend if if we're rich rich rich (low priority offensive)
				if (!room.restrictOffensiveMissions(exits[exitID], false, true, false)) {
					protectRoomNames.push(exits[exitID]);
				}
			}

			for (let roomName of room.mem.depositRooms) {
				// Only defend it if we're harvesting it.
				let harvested = 0

				for (let mission of Memory.combatManager.currentMissions[MISSION_DEPOSIT_HARVEST]) {
					if (mission.ID && mission.targetRoomName == roomName) {
						harvested = 1
						break
					}
				}
				if (harvested) {
					protectRoomNames.push(roomName)
					continue
				}

				for (let mission of Memory.combatManager.currentMissions[MISSION_DEPOSIT_FARM]) {
					if (mission.ID) {
						for (let team of mission.teams) {
							if (team.targetRoom == roomName) {															
								harvested = 1
								break
							}
						}
					}
					if (harvested) {
						break
					}
				}

				if (harvested) {
					protectRoomNames.push(roomName)
				}
			}

			/*if (Memory.commoditiesManager && room.mem.depositRooms) {				
				for (let roomName of room.mem.depositRooms) {
					// if (Memory.commoditiesManager.extraDeposits && Object.keys(Memory.commoditiesManager.extraDeposits).includes(roomName)) {
					// 	protectRoomNames.push(roomName)
					// }
					// else {
					// 	if (Memory.commoditiesManager.sectors) {			
							// let centreRoom = util.getCentreRoomForRoomName(room.name);
							// if (Memory.commoditiesManager.sectors[centreRoom]) {
							// 	for (let depositID in  Memory.commoditiesManager.sectors[centreRoom].deposits) {
							// 		if (Memory.commoditiesManager.sectors[centreRoom].deposits[depositID].roomName == roomName) {
							// 			protectRoomNames.push(roomName)
							// 			break
							// 		}
							// 	}
							// }
						// }
					// }					
					}
				}
			}*/

			if (Memory.swc) {

				
			}

			protectRoomNames = _.uniq(protectRoomNames.concat(room.goodRooms.concat(room.protectRooms).concat(room.buildRooms).concat(myPowerRooms)));
			global.defenseRooms[room.name] = protectRoomNames;
		}
		else {
			protectRoomNames = global.defenseRooms[room.name];
		}


		if (Game.time % 128 == room.mem.ID % 128 && Game.time - (room.mem.lastSpawnToIdlePool || 0) > 1000 && !room.restrictDefensiveMissions(false, false)) {
			let keeperRoomsAtRisk = []
			let roomsAtRisk = []

			for (var protectRoomName of protectRoomNames) {
				var protectRoom = Game.rooms[protectRoomName];

				if (!protectRoom) continue

				// Self-protection is handled elsewhere
				if (protectRoom == room || (protectRoom && protectRoom.controller && protectRoom.controller.my)) continue;
				
				let targetGoal = INVADERS_ENERGY_GOAL * .7

				if (protectRoom.mem.hSnceLstInv &&
					protectRoom.mem.hSnceLstInv > targetGoal && 
					util.hasSectorGotAStronghold(protectRoom.name) && 
					!idleCreepManager.hasRoomGotIdleCreepAssigned(protectRoom.name) && 
					!missionInfo.hasActiveMissionsToRoom(protectRoom.name)) {

					if (protectRoom.keeperRoom || protectRoom.centreRoom) {
						keeperRoomsAtRisk.push(protectRoom)
					}
					else {
						roomsAtRisk.push(protectRoom)
					}

				}
			}

			if (roomsAtRisk.length) console.log(room, "rooms at risk", roomsAtRisk)
			if (keeperRoomsAtRisk.length) console.log(room, "keeper rooms at risk", keeperRoomsAtRisk)

			for (let roomAtRisk of _.shuffle(roomsAtRisk)) {
				// Later I go the more chance the prespawn does something, but the less chance it happens at all
				let targetGoal = (INVADERS_ENERGY_GOAL * (roomIntel.getEffectiveNumSources(roomAtRisk.name) == 2 ? 0.95 : 1.1))

				// Drop by 10% for every extra room at risk
				targetGoal = Math.max(INVADERS_ENERGY_GOAL * .7, targetGoal * (1.1 - 0.1 * roomsAtRisk.length))

				console.log(roomAtRisk, targetGoal, roomAtRisk.mem.hSnceLstInv)

				if (roomAtRisk.mem.hSnceLstInv > targetGoal && !roomAtRisk.mem.preSpawnedForInvaders) {				
					idleCreepManager.spawnToIdlePool(room, "defender", Math.min(1250, room.energyCapacityAvailable), roomAtRisk.name)

					roomAtRisk.mem.preSpawnedForInvaders = 1
					break;
				}
			}

			for (let roomAtRisk of _.shuffle(keeperRoomsAtRisk)) {
				let targetGoal = INVADERS_ENERGY_GOAL * (keeperRoomsAtRisk.length == 1 ? 0.8 : 0.7)

				console.log(roomAtRisk, targetGoal, roomAtRisk.mem.hSnceLstInv)

				if (roomAtRisk.mem.hSnceLstInv > targetGoal && !roomAtRisk.mem.preSpawnedForInvaders) {		
					idleCreepManager.spawnToIdlePool(room, "ranged", room.energyCapacityAvailable, roomAtRisk.name)

					roomAtRisk.mem.preSpawnedForInvaders = 1
					break;
				}
			}

		}

		for (var protectRoomName of protectRoomNames) {
			var protectRoom = Game.rooms[protectRoomName];

			// Self-protection is handled elsewhere
			if (protectRoom == room || (protectRoom && protectRoom.controller && protectRoom.controller.my)) continue;

			if (protectRoom) {
				if (protectRoom.hasHostiles) {
					var threats = protectRoom.find(FIND_HOSTILE_CREEPS, {
						filter: function(object) {
							if (object.owner.username == "Source Keeper") {
								return false;
							}
							if (object.owner.username == "Screeps") {
								return false
							}
							// There's a problem if somebody is moving from one of my rooms to another.
							// Because this is called before re-idling my creeps I spawn a new creep
							// rather than re-assigning the current creeps.
							// The solution is probably not this. It does what I need by delaying
							// a tick, but makes be vulnvernable to bouncing people (ish).
							if (util.isEdgeOfRoom(object.pos) && Math.random() < 0.9) {
								return false;
							}
							if (Memory.season2 && scouting.isPlayerMediumWhiteListed(object.owner.username)) {
								return false;
							}
							return true;
						}
					});

					threats = threats.concat(room.find(FIND_HOSTILE_POWER_CREEPS))

					if (Memory.swc === 1) {
						threats = _.filter(threats, (threat) => (!global.whiteList.includes(threat.owner.username)));
					}
					// else if (Memory.season) {
					// 	threats = _.filter(threats, (threat) => (!scouting.isPlayerMediumWhiteListed(threat.owner.username)));
					// }


					if (threats.length > 0) {
						// -1 is "won't spawn"
						// 0 is "don't need to spawn"
						// >0 is "spawning"
						let res = combatManager.requestDefenseMission(room, protectRoom);

						// console.log(room, protectRoom, "requestDefenseMission returned", res)

						if (!protectRoom.mem.owner) {
							if (res < 0) {
								protectionNotSpawned++;
							}
							if (res != 0) {
								// Run some analysis
								if (protectRoom.humanTargets && protectRoom.humanTargets.length) {
									let etotalAttack = 0
									let etotalRanged = 0
									let etotalHeal = 0
									let names = {}

									for (let humanTarget of protectRoom.humanTargets) {
										let bmcp = humanTarget.getBoostModifiedCombatParts(false, false)

										etotalAttack += bmcp.numAttack;
										etotalRanged += bmcp.numRanged;
										etotalHeal += bmcp.numHeal;
										names[humanTarget.owner.username] = 1
									}

									if (etotalAttack || etotalRanged) {									
										roomAI.cleanUpHarassTracking(protectRoom.name);
										protectRoom.mem.harassTracking = protectRoom.mem.harassTracking || [];

										// Weight light ones more as they're easier to kill and just as annoying
										let weight = Math.max(1, 0.5 * room.effectiveLevel / (etotalAttack + etotalRanged))
										if (!protectRoom.mem.harassTracking.length || protectRoom.mem.harassTracking[protectRoom.mem.harassTracking.length - 1].t < Game.time - 100) {
											console.log("harassTracking", weight, room.effectiveLevel, etotalAttack + etotalRanged)

											let owner = Object.keys(names).length == 1 ? Object.keys(names)[0] : null

											protectRoom.mem.harassTracking.push({t: Game.time, a: etotalAttack, r: etotalRanged, h: etotalHeal, w: weight, o: owner})

											if (protectRoom.mem.harassTracking.length >= 3) {		
												let num5k = 0;
												let num10k = 0;
												let num15k = 0;
												let num20k = 0;
												for (let harass of protectRoom.mem.harassTracking) {
													let timeDiff = Game.time - harass.t;
													if (timeDiff < 5000) {
														num5k += harass.w;
													}
													if (timeDiff < 10000) {
														num10k += harass.w;
													}
													if (timeDiff < 15000) {
														num15k += harass.w;
													}
													if (timeDiff < 20000) {
														num20k += harass.w;
													}
												}

												if (num5k >= 3 || num10k >= 5 || num15k >= 6 || num20k >= 7) {
													Memory.combatManager.requestedMissions[MISSION_PICKET] = Memory.combatManager.requestedMissions[MISSION_PICKET] || {}
													Memory.combatManager.requestedMissions[MISSION_PICKET][protectRoom.name] = Game.time;
												}
											}
										}
										else {
											let last = protectRoom.mem.harassTracking[protectRoom.mem.harassTracking.length - 1];

											protectRoom.mem.harassTracking[protectRoom.mem.harassTracking.length - 1] = {t: Game.time, a: Math.max(last.a, etotalAttack), r: Math.max(last.r, etotalRanged), h: Math.max(last.h, etotalHeal), w: Math.max(last.w, weight)};
										}
									}

								}
							}
						}
					}
				}
			}
			else if (Memory.rooms[protectRoomName] && !Memory.rooms[protectRoomName].owner) {
				if (Memory.rooms[protectRoomName].DT > 1.25) {
					if (!room.previousRoomDefenseNoSpawn) {
						room.previousRoomDefenseNoSpawn = 1;
					}
					else {
						room.previousRoomDefenseNoSpawn++;
					}
					protectionNotSpawned++;
				}
			}
		}

		if (protectionNotSpawned >= 2) {
			combatManager.requestRamboDefenseMission(room, protectRoomNames);
		}
	},

	// Hostiles is array of creeps we want to be safe from
	checkCreepSafety : function(room, pos, retreatRoom, hostiles) {
		if (!hostiles.length) return

		if ((this.roomStrength || 0) > 10) {
			if (!this.pos.findFirstInRange(hostiles, 6)) {
				return true
			}
		}

		let noneWithTTL = true

		for (let hostile of hostiles) {
			if (hostile.ticksToLive >= hostile.pos.getRangeToPos(pos)) {
				noneWithTTL = false
				break
			}
		}

		if (noneWithTTL) {
			return true
		}

		// if (!Game.cpu.getHeapStatistics) {
		// 	return false;
		// }
		const spacing = 10;
		const gridWidth = 5;

		let roomName = room.name;

		global.roomSafetyConnectivities = global.roomSafetyConnectivities || {};
		// let vis = new RoomVisual(room.name)

		if (!global.roomSafetyConnectivities[roomName]) {
			let roomTerrain = Game.map.getRoomTerrain(roomName);
			// Construct the connectivity map
			// TOP, RIGHT, BOTTOM, LEFT
			let safetyConnectivities = [];
			for (let i = 0; i < gridWidth; i++) {
				for (let j = 0; j < gridWidth; j++) {
					let c = 0;

					if (j > 0) {
						for (let k = 0; k <= spacing; k++) {
							if (!(roomTerrain.get(i * spacing + k, j * spacing) & TERRAIN_MASK_WALL)) {
								c |= 1;
								break;
							}
						}
					}
					if (i < 4) {
						for (let k = 0; k <= spacing; k++) {
							if (!(roomTerrain.get((i + 1) * spacing, j * spacing + k) & TERRAIN_MASK_WALL)) {
								c |= 2;
								break;
							}
						}
					}
					if (j < 4) {
						for (let k = 0; k <= spacing; k++) {
							if (!(roomTerrain.get(i * spacing + k, (j + 1) * spacing) & TERRAIN_MASK_WALL)) {
								c |= 4;
								break;
							}
						}
					}
					if (i > 0) {
						for (let k = 0; k <= spacing; k++) {
							if (!(roomTerrain.get(i * spacing, j * spacing + k) & TERRAIN_MASK_WALL)) {
								c |= 8;
								break;
							}
						}
					}


					safetyConnectivities[i + j * gridWidth] = c;


				}
			}
			global.roomSafetyConnectivities[roomName] = safetyConnectivities;
		}

		let creepNode = Math.floor(pos.x / spacing) + gridWidth * Math.floor(pos.y / spacing);

		global.roomSafetyMaps = global.roomSafetyMaps || {};
		global.roomSafetyMaps[roomName] = global.roomSafetyMaps[roomName] || {};
		global.roomSafetyMaps[roomName][retreatRoom.name] = global.roomSafetyMaps[roomName][retreatRoom.name] || [];

		if (global.roomSafetyMaps[roomName][retreatRoom.name][creepNode] !== undefined && global.roomSafetyMaps[roomName][retreatRoom.name][creepNode] !== null) {
			for (let hostile of hostiles) {
				let hostileNode = Math.floor(hostile.pos.x / spacing) + gridWidth * Math.floor(hostile.pos.y / spacing);

				if (hostileNode === creepNode) {
					return false;
				}

				// Not clear! Not clear!
				if ((global.roomSafetyMaps[roomName][retreatRoom.name][creepNode] & (1 << hostileNode)) == 0) {
					return false;
				}
				// Safe from this one
				else {
					continue;
				}
			}
		}



		function markNodes(sourceNode, costs) {
			const q = new PriorityQueue((a, b) => a[1] < b[1]);

			q.push([sourceNode, 0]);
			costs[sourceNode] = 0;

			let safetyConnectivities = global.roomSafetyConnectivities[roomName];

			while (!q.isEmpty()) {
				var u = q.pop();
				let node = u[0];
				let cost = u[1];

				let newNode;
				// top
				if (safetyConnectivities[u[0]] & 1) {
					newNode = node - gridWidth - 1;
					if (node % gridWidth != 0) {
						if (costs[newNode] > cost + 1) {
							q.push([newNode, cost + 1]);
							costs[newNode] = cost + 1;
						}
					}
					newNode += 1
					if (costs[newNode] > cost + 1) {
						q.push([newNode, cost + 1]);
						costs[newNode] = cost + 1;
					}
					if (node % gridWidth != gridWidth - 1) {
						newNode += 1
						if (costs[newNode] > cost + 1) {
							q.push([newNode, cost + 1]);
							costs[newNode] = cost + 1;
						}
					}
				}
				// right
				if (safetyConnectivities[u[0]] & 2) {
					newNode = node + 1 - gridWidth;
					if (node >= gridWidth) {
						if (costs[newNode] > cost + 1) {
							q.push([newNode, cost + 1]);
							costs[newNode] = cost + 1;
						}
					}
					newNode += gridWidth
					if (costs[newNode] > cost + 1) {
						q.push([newNode, cost + 1]);
						costs[newNode] = cost + 1;
					}
					if (node < gridWidth * (gridWidth - 1)) {
						newNode += gridWidth
						if (costs[newNode] > cost + 1) {
							q.push([newNode, cost + 1]);
							costs[newNode] = cost + 1;
						}
					}
				}
				// bottom
				if (safetyConnectivities[u[0]] & 4) {
					newNode = node + gridWidth - 1;
					if (node % gridWidth != 0) {
						if (costs[newNode] > cost + 1) {
							q.push([newNode, cost + 1]);
							costs[newNode] = cost + 1;
						}
					}
					newNode += 1
					if (costs[newNode] > cost + 1) {
						q.push([newNode, cost + 1]);
						costs[newNode] = cost + 1;
					}
					if (node % gridWidth != gridWidth - 1) {
						newNode += 1
						if (costs[newNode] > cost + 1) {
							q.push([newNode, cost + 1]);
							costs[newNode] = cost + 1;
						}
					}
				}
				// left
				if (safetyConnectivities[u[0]] & 8) {
					newNode = node - 1;
					if (node >= gridWidth) {
						if (costs[newNode] > cost + 1) {
							q.push([newNode, cost + 1]);
							costs[newNode] = cost + 1;
						}
					}
					newNode += gridWidth
					if (costs[newNode] > cost + 1) {
						q.push([newNode, cost + 1]);
						costs[newNode] = cost + 1;
					}
					if (node < gridWidth * (gridWidth - 1)) {
						newNode += gridWidth
						if (costs[newNode] > cost + 1) {
							q.push([newNode, cost + 1]);
							costs[newNode] = cost + 1;
						}
					}
				}
			}
		}

		// Still not sure whether we're safe. Populate the safety map

		// fromPos, toPos, targetRange, moveSpeed, avoidLocalCreeps, useCache, options
		let retreatCost = Math.ceil(pathCache.getPath(pos, new RoomPosition(25, 25, retreatRoom.name), 24, 0, false, false, {"trimPathToRoom" : 1}).path.length / spacing + 1);

		// console.log("computing creep safety retreat cost")

		// vis.text(retreatCost.toString(), pos.x, pos.y)

		// Safety margin.
		// We are making an assumption that all creeps in this grid cell have the same retreat cost, which isn't correct
		// Hopefully the safety margin should be good enough to cover most cases, as well as ranged attack danger
		// retreatCost += 1; //Math.round(gridWidth / 2.);

		// room.memory.safetyMap[retreatRoom.name][creepNode][hostileNode] = [];

		let costs = [];

		for (var i = 0; i < gridWidth * gridWidth; i++) {
			costs[i] = Infinity;
		}

		// Populates costs
		markNodes(creepNode, costs);

		global.roomSafetyMaps[roomName][retreatRoom.name][creepNode] = 0;
		for (var i = 0; i < gridWidth * gridWidth; i++) {
			// if (creepNode == 6) {
			// 	vis.text(costs[i].toString(), (i % 5) * 10 + 5, Math.floor(i / 5) * 10 + 5)
			// }

			// safe
			if (costs[i] >= retreatCost) {
				global.roomSafetyMaps[roomName][retreatRoom.name][creepNode] |= (1 << i);
			}
		}

		for (let hostile of hostiles) {
			let hostileNode = Math.floor(hostile.pos.x / spacing) + gridWidth * Math.floor(hostile.pos.y / spacing);

			if (hostileNode === creepNode) {
				return false;
			}

			// Not clear! Not clear!
			if ((global.roomSafetyMaps[roomName][retreatRoom.name][creepNode] & (1 << hostileNode)) == 0) {
				return false;
			}
			// Safe from this one
			else {
				continue;
			}
		}
		return true;
	},


	debugRoomSafety(room, retreatRoom, hostilePos) {
		if (Memory.debugRoomSafety) {		
			delete global.roomSafetyMaps
			let vis = new RoomVisual(room.name)

			let terrain = Game.map.getRoomTerrain(room.name)

			for (let i = 0; i < 50; i++) {
				for (let j = 0; j < 50; j++) {
					if (terrain.get(i, j) & TERRAIN_MASK_WALL) continue
					let safe = this.checkCreepSafety(room, new RoomPosition(i, j, room.name), retreatRoom, [{pos: hostilePos}])

					vis.rect(i, j, 1, 1, safe ? {fill: "#00ff00"} : {fill: "#ff0000"})

				}
			}

			Memory.debugRoomSafety--

			if (Memory.debugRoomSafety <= 0) {
				delete Memory.debugRoomSafety
			}
		}

	},


	localDefense : function(room) {
		// if (room.name == "E1N6" && Game.rooms["E2N6"]) {
		// 	this.debugRoomSafety(Game.rooms["E2N6"], room, new RoomPosition(47, 27, "E2N6"))
		// }
		// drawSafeZone(room);

		// Are there bad men?
		var threats = [];
		let invasion = true;

		if (room.hasHostiles) {
			threats = _.filter(room.getAllHostileCreepsAndPowerCreeps(), function(object) {
				var myCreepsClose = object.pos.findInRange(FIND_MY_CREEPS, 3)

				if (object.owner.username !== "Invader") {
					invasion = false;
				}
				else {
					return true
				}

				if (myCreepsClose.length > 0) {
					return true;
				}

				return !util.isEdgeOfRoom(object.pos) || Math.random() < 0.2 || object.hits < 0.5 * object.hitsMax || Memory.season2;
			})
			if (Memory.swc === 1) {
				threats = _.filter(threats, (threat) => (global.whiteList.indexOf(threat.owner.username) == -1));
			}
			else if (Memory.season2) {
				threats = _.filter(threats, (threat) => (!scouting.isPlayerHeavyWhiteListed(threat.owner.username)));
			}
		}


		let mem = room.mem;


		if (threats.length == 0) {
			if (Memory.season2 && !mem.attackScore && (room.mem.minOpenRampartTick || Math.random() < 0.001) && Game.time > (room.mem.minOpenRampartTick || 0)) {
				if (!room.mem.closeRamparts) {					
					for (let rampart of room.ramparts) {
						if (!rampart.isPublic) rampart.setPublic(true)
					}
					delete room.mem.minOpenRampartTick
				}
			}

			if (mem.attackScore) {
				let attackScoreDecay = 7500;

				if (mem.lastBreached && Game.time - mem.lastBreached < 30000) {
					attackScoreDecay /= 2;
				}
				if (mem.lastBreached && Game.time - mem.lastBreached < 10000) {
					attackScoreDecay /= 2;
				}
				if (room.effectiveLevel < room.controller.level) {
					attackScoreDecay /= 2;
				}

				mem.attackScore = Math.max(0, mem.attackScore - attackScoreDecay);
			}
			// mem.towerStratChangeTimer = Math.max(0, mem.towerStratChangeTimer - 1);
			// mem.currentTarget = null;
			// mem.currentTargetLastHits = 0;
			// mem.lastTargets = [];
			runCivilianTowers(room);
		}

		if ((Game.damagedRooms || 0) >= 2) {
			if (Memory.season2) {
				room.mem.minOpenRampartTick = Game.time + 90 + Math.round(Math.random() * 20)
				for (let rampart of room.ramparts) {
					if (rampart.isPublic) rampart.setPublic(false)
				}
			}
		}

		// Tower focus fire

		if (mem.turretSleep > 0) {
			mem.turretSleep--;
			if (threats.length > 0) {
				runCivilianTowers(room);
				if (Memory.season2) {
					room.mem.minOpenRampartTick = Game.time + 90 + Math.round(Math.random() * 20)
					for (let rampart of room.ramparts) {
						if (rampart.isPublic) rampart.setPublic(false)
					}
				}

			}
		}
		else if (threats.length > 0 && room.towers.length) {
			let a = Game.cpu.getUsed();

			mem.attackScore = mem.attackScore || 0;
			mem.towerStratChangeTimer = mem.towerStratChangeTimer || 0;

			const TOWER_MIN_ENERGY = 30

			// Always keep some energy. Makes other people's code twitchy
			let towers = _.filter(room.towers, (tower) => (tower.energy >= TOWER_MIN_ENERGY))

			mem.towerStrategy = mem.towerStrategy || constants.TOWER_STRATEGY_DAMAGE_TRACKING;

			let strategy = mem.towerStrategy;

			if (strategy == constants.TOWER_STRATEGY_RANDOM_CLOSEST || strategy == constants.TOWER_STRATEGY_RANDOM_HEAL_TRACKING || strategy == constants.TOWER_STRATEGY_RANDOM_MAX_DAMAGE) {
				if (Math.random() < 0.5) {
					strategy = constants.TOWER_STRATEGY_RANDOM;
				}
				else {
					if (strategy == constants.TOWER_STRATEGY_RANDOM_CLOSEST) 			strategy = constants.TOWER_STRATEGY_CLOSEST;
					else if (strategy == constants.TOWER_STRATEGY_RANDOM_HEAL_TRACKING) strategy = constants.TOWER_STRATEGY_HEAL_TRACKING;
					else if (strategy == constants.TOWER_STRATEGY_RANDOM_MAX_DAMAGE) 	strategy = constants.TOWER_STRATEGY_MAX_DAMAGE;
				}
			}

			let creepFarRange;
			let structureRange;

			switch(strategy) {
				case constants.TOWER_STRATEGY_DAMAGE_TRACKING_HYPER_PROTECTIVE:
					creepFarRange = 4;
					structureRange = 3;
					break;
				case constants.TOWER_STRATEGY_DAMAGE_TRACKING_PROTECTIVE:
					creepFarRange = 5;
					structureRange = 4;
					break;
				case constants.TOWER_STRATEGY_DAMAGE_TRACKING:
					creepFarRange = 6;
					structureRange = 5;
					break;
				case constants.TOWER_STRATEGY_DAMAGE_TRACKING_AGGRESSIVE:
					creepFarRange = 7;
					structureRange = 6;
					break;
				case constants.TOWER_STRATEGY_DAMAGE_TRACKING_HYPER_AGGRESSIVE:
					creepFarRange = 8;
					structureRange = 7;
					break;
				default:
					creepFarRange = 6;
					structureRange = 5;
					break;
			}

			let towerThreats = _.filter(room.getAllHostileCreepsAndPowerCreeps(), function(object) {
				// Always kill invaders
				if (object.owner.username == "Invader") {
					return true;
				}
				if (object.hits < 0.6 * object.hitsMax) {
					return true;
				}

				if (room.controller.safeMode && util.isNearEdgeOfRoom(object.pos, 3)) {
					return false
				}

				if (Memory.season2 && scouting.isPlayerMediumWhiteListed(object.owner.username)) {
					if (!object.hasBodypart(ATTACK) && !object.hasBodypart(RANGED_ATTACK) && !object.hasBodypart(WORK) && !object.hasBodypart(CLAIM)) {
						return false
					}
				}


				var myCreepClose = object.pos.findFirstInRange(FIND_MY_CREEPS, 3);

				if (myCreepClose) {
					return true;
				}

				if (util.isEdgeOfRoom(object.pos) && Math.random() < 0.8 && !Memory.season2) {
					let exits = Game.map.describeExits(room.name);
					let newPos;

					if (object.pos.x == 0) {
						newPos = new RoomPosition(49, object.pos.y, exits[LEFT])
					}
					else if (object.pos.y == 0) {
						newPos = new RoomPosition(object.pos.x, 49, exits[TOP])
					}
					else if (object.pos.x == 49) {
						newPos = new RoomPosition(9, object.pos.y, exits[RIGHT])
					}
					else if (object.pos.y == 49) {
						newPos = new RoomPosition(object.pos.x, 0, exits[BOTTOM])
					}

					if (Game.rooms[newPos.roomName] && newPos.findFirstInRange(FIND_MY_CREEPS, 3)) {
						return true;
					}

					return false;
				}

				var myCreepFar = object.pos.findFirstInRange(FIND_MY_CREEPS, creepFarRange);

				if (myCreepFar) {
					return true;
				}

				// If they're within x tiles of a wall or are on low hit points the towers can shoot them. Otherwise try to avoid it to save energy.
				var myStructure = object.pos.findFirstInRange(FIND_STRUCTURES, structureRange, {
					filter: (structure) => {
						return structure.structureType != STRUCTURE_CONTAINER && structure.structureType != STRUCTURE_ROAD
					}
				});


				return myStructure ? true : false;
			});

			if (Memory.swc === 1) {
				towerThreats = _.filter(towerThreats, (threat) => (global.whiteList.indexOf(threat.owner.username) == -1));
			}

			if (Memory.season2 && towerThreats.length) {
				if (room.storage) {
					for (let struct of room.storage.pos.lookFor(LOOK_STRUCTURES)) {
						if (struct.structureType == STRUCTURE_RAMPART && struct.isPublic) {
							room.mem.minOpenRampartTick = Game.time + 90 + Math.round(Math.random() * 20)
							struct.setPublic(false)
						}
					}
				}
				if (room.terminal) {
					for (let struct of room.terminal.pos.lookFor(LOOK_STRUCTURES)) {
						if (struct.structureType == STRUCTURE_RAMPART && struct.isPublic) {
							room.mem.minOpenRampartTick = Game.time + 90 + Math.round(Math.random() * 20)
							struct.setPublic(false)
						}
					}
				}
				if (room.factory) {
					for (let struct of room.factory.pos.lookFor(LOOK_STRUCTURES)) {
						if (struct.structureType == STRUCTURE_RAMPART && struct.isPublic) {
							room.mem.minOpenRampartTick = Game.time + 90 + Math.round(Math.random() * 20)
							struct.setPublic(false)
						}
					}
				}
				for (let lab of room.labs) {
					for (let struct of lab.pos.lookFor(LOOK_STRUCTURES)) {
						if (struct.structureType == STRUCTURE_RAMPART && struct.isPublic) {
							room.mem.minOpenRampartTick = Game.time + 90 + Math.round(Math.random() * 20)
							struct.setPublic(false)
						}
					}
				}
				for (let tower of room.towers) {
					for (let struct of tower.pos.lookFor(LOOK_STRUCTURES)) {
						if (struct.structureType == STRUCTURE_RAMPART && struct.isPublic) {
							room.mem.minOpenRampartTick = Game.time + 90 + Math.round(Math.random() * 20)
							struct.setPublic(false)
						}
					}
				}
				// for (let rampart of room.ramparts) {
				// 	if (rampart.isPublic) {
				// 		rampart.setPublic(false)
				// 	}
				// }
			}

			if (Memory.season2) {
				towerThreats = _.filter(towerThreats, (threat) => {
					if (!scouting.isPlayerSoftWhiteListed(threat.owner.username)) {
						return true
					}
					if (threat.hasBodypart(ATTACK) || threat.hasBodypart(RANGED_ATTACK) || threat.hasBodypart(WORK) || threat.hasBodypart(CLAIM)) {
						return true
					}
					return false
				});
			}

			if (Memory.season2 && towerThreats.length) {
				room.mem.minOpenRampartTick = Game.time + 90 + Math.round(Math.random() * 20)
				for (let rampart of room.ramparts) {
					if (rampart.isPublic) rampart.setPublic(false)
				}
			}
			else if (Memory.season2 && towerThreats.length == 0 && !mem.attackScore && (room.mem.minOpenRampartTick || Math.random() < 0.001) && Game.time > (room.mem.minOpenRampartTick || 0)) {
				if (!room.mem.closeRamparts) {					
					for (let rampart of room.ramparts) {
						if (!rampart.isPublic) rampart.setPublic(true)
					}
					delete room.mem.minOpenRampartTick
				}
			}



			if (strategy == constants.TOWER_STRATEGY_DAMAGE_TRACKING ||
				strategy == constants.TOWER_STRATEGY_DAMAGE_TRACKING_HYPER_PROTECTIVE ||
				strategy == constants.TOWER_STRATEGY_DAMAGE_TRACKING_PROTECTIVE ||
				strategy == constants.TOWER_STRATEGY_DAMAGE_TRACKING_AGGRESSIVE ||
				strategy == constants.TOWER_STRATEGY_DAMAGE_TRACKING_HYPER_AGGRESSIVE) {


				var damaging = mem.currentTarget &&
								Game.getObjectById(mem.currentTarget) &&
								Game.getObjectById(mem.currentTarget).room.name == room.name &&
								mem.currentTargetLastHits &&
								mem.currentTargetLastHits > Game.getObjectById(mem.currentTarget).hits + Game.getObjectById(mem.currentTarget).body.length * 2;

				// Don't change if we're damaging the other chap.
				// This should continue blasting them if they move out of range and we're still damaging.
				if (!damaging) {
					var potentialTargets = [];

					mem.lastTargets = mem.lastTargets || [];

					// Otherwise, find a new target and try to damage him
					for (let threat of towerThreats) {
						if (mem.lastTargets && !mem.lastTargets.includes(threat.id)) {
							potentialTargets.push(threat);
						}
					}

					let maxScore = 0;
					var currentNewTarget = null

					for(var threat of potentialTargets) {
						var score = 0;
						for(let tower of towers) {
							// score += util.getTowerDamageForDist(tower.pos.getRangeTo(threat));
							score += getTowerDamageForTarget(tower, threat);
						}

						// Focus healers if they heal others first.
						if (room.memory.healersDefaultHealOthersFirst &&
							room.memory.healersDefaultHealOthersFirst[threat.owner.username] &&
							room.memory.healersDefaultHealOthersFirst[threat.owner.username] > 0.8 &&
							threat.hits == threat.hitsMax &&
							threat.pos.findInRange(FIND_HOSTILE_CREEPS, 3).length > 1 &&
							threat.hasBodypart(HEAL)) {
							score *= 1.25;
						}

						score += 10 * (threat.hitsMax - threat.hits) / threat.body.length;

						if (score > maxScore) {
							maxScore = score;
							currentNewTarget = threat;
						}
					}

					if (currentNewTarget) {
						mem.currentTarget = currentNewTarget.id;
						mem.currentTargetLastHits = currentNewTarget.hits;
						mem.lastTargets.push(currentNewTarget.id);
					}
					// Nobody new to shoot. Loop back to the start and do boring stuff for some ticks
					else {
						let towerEnergy = 0;
						let towerEnergyMax = 0;

						for(let tower of towers) {
							towerEnergy += tower.energy;
							towerEnergyMax += tower.energyCapacity;
						}

						delete mem.lastTargets;
						delete mem.currentTarget;
						delete mem.currentTargetLastHits;
						if (towerThreats.length) mem.turretSleep = 2 + Math.round(Math.random() * 5) + Math.round(Math.min(5, towerEnergyMax / towerEnergy));
						runCivilianTowers(room);
					}
				}
				else {
					mem.towerStratChangeTimer -= 1;
				}

				if (mem.currentTarget && Game.getObjectById(mem.currentTarget) && Game.getObjectById(mem.currentTarget).room.name == room.name) {
					for(let tower of towers) {
						var targetCreep = Game.getObjectById(mem.currentTarget);
						// Don't all hit the crappy creeps.
						if (targetCreep.hitsMax == 100 && (targetCreep.expectedDamage || 0) >= 2 * targetCreep.hitsMax) {
							continue;
						}
						tower.attack(targetCreep);
						mem.towerStratChangeTimer += 1;
						targetCreep.expectedDamage = getTowerDamageForTarget(tower, targetCreep);
						mem.currentTargetLastHits = targetCreep.hits;
					}
				}
			}
			else if (strategy == constants.TOWER_STRATEGY_RANDOM) {
				for(let tower of towers) {
					tower.attack(_.sample(towerThreats));
				}
				mem.towerStratChangeTimer += 1;
			}
			else if (strategy == constants.TOWER_STRATEGY_CLOSEST) {
				for(let tower of towers) {
					tower.attack(tower.pos.findClosestByRange(towerThreats));
				}
				mem.towerStratChangeTimer += 1;
			}
			else if (strategy == constants.TOWER_STRATEGY_HEAL_TRACKING) {
				// If we're not doing 5 damage, don't shoot
				let maxDamage = 5;
				let maxDamageCreep;
				let maxDamageCreepNeighbours;
				let myCreeps = room.getAllFriendlyCreepsWithBodyParts([RANGED_ATTACK, ATTACK]);
				for (let threat of towerThreats) {
					let towerTestDamage = 0;
					for(let tower of towers) {
						if (tower.isActive() && tower.energy >= 100) {
							towerTestDamage += getTowerDamageForTarget(tower, threat);
						}
					}

					for (let myCreep of myCreeps) {
						let range = myCreep.pos.getRangeTo(threat);

						if (range <= 3) {
							let parts = myCreep.getBoostModifiedCombatParts(true, true);
							towerTestDamage += parts.numRanged * RANGED_ATTACK_POWER;
							if (range <= 1) {
								towerTestDamage += parts.numAttack * ATTACK_POWER;
							}
						}
					}

					let boostLevel = threat.getActiveToughBoostLevel();
					let modifier = 1;
					if (boostLevel == 2) modifier = 0.7;
					if (boostLevel == 3) modifier = 0.5;
					if (boostLevel == 4) modifier = 0.3;

					let threatNeighbours = [];

					for(let otherThreat of threats) {
						let range = otherThreat.pos.getRangeToRoomObject(threat)
						if (otherThreat.hasActiveBodypart(HEAL)) {
							if (range <= 1) {
								// Doesn't heal self.
								if (room.memory.healersDefaultHealOthersFirst &&
									room.memory.healersDefaultHealOthersFirst[threat.owner.username] &&
									room.memory.healersDefaultHealOthersFirst[threat.owner.username] > 0.8 &&
									threat.hits == threat.hitsMax &&
									otherThreat.id == threat.id &&
									Math.random() < 0.1 &&
									threat.pos.findInRange(room.getAllHostileCreepsAndPowerCreeps(), 3).length > 1) {
									continue;
								}

								towerTestDamage -= otherThreat.getActiveBoostModifiedHeal() * HEAL_POWER / modifier;
							}
							// Don't want to be exploited
							else if (range <= 2) {
								towerTestDamage -= otherThreat.getActiveBoostModifiedHeal() * (2 * HEAL_POWER + RANGED_HEAL_POWER) / (3 * modifier);
							}
							else if (range <= 3) {
								towerTestDamage -= otherThreat.getActiveBoostModifiedHeal() * (HEAL_POWER + RANGED_HEAL_POWER) / (2 * modifier);
							}
						}

						if (range == 1) {
							threatNeighbours.push(otherThreat)
						}
					}

					towerTestDamage += 5 * (threat.hitsMax - threat.hits) / threat.body.length;
					// If there's a chance we'll hit meaty parts push it.
					if (boostLevel == 1 && threat.hasActiveBodypart(HEAL)) {
						maxDamage *= 1.1;
					}

					console.log(room, "Healtracking", threat, towerTestDamage, maxDamage, maxDamageCreep)

					if (towerTestDamage > maxDamage) {
						maxDamage = towerTestDamage;
						maxDamageCreep = threat;
						maxDamageCreepNeighbours = threatNeighbours;
					}
				}
				if (maxDamageCreep) {
					let i = 0;
					for(let tower of towers) {
						// Try to distribute damage among a squad to make healers inefficient
						if (i == 0 && maxDamageCreepNeighbours.length && towers.length > 2) {
							tower.attack(_.sample(maxDamageCreepNeighbours));
						}
						else {
							tower.attack(maxDamageCreep);
						}
						i++;
					}
				}
				else {
					runCivilianTowers(room);
				}
				mem.towerStratChangeTimer += 1;
			}
			else if (strategy == constants.TOWER_STRATEGY_MAX_DAMAGE) {
				let maxDamage = 0;
				let maxDamageCreep;
				for (let threat of towerThreats) {
					let towerTestDamage = 0;
					for(let tower of towers) {
						if (tower.isActive() && tower.energy >= TOWER_MIN_ENERGY) {
							towerTestDamage += getTowerDamageForTarget(tower, threat);
						}
					}

					if (towerTestDamage > maxDamage) {
						maxDamage = towerTestDamage;
						maxDamageCreep = threat;
					}
				}
				if (maxDamageCreep) {
					for(let tower of towers) {
						tower.attack(maxDamageCreep);
					}
				}
				else {
					runCivilianTowers(room);
				}
				mem.towerStratChangeTimer += 1;
			}
			else if (strategy == constants.TOWER_STRATEGY_SLEEP) {
				runCivilianTowers(room);
				mem.towerStratChangeTimer += 1;
			}
			Memory.stats.profiler["roomTowers" + room.name] = Game.cpu.getUsed() - a;

		}

		// Is this attack a problem?
		if (threats.length > 0 || mem.attackScore > 5000 || mem.DT > 0.5) {
			if (Memory.season2) {
				threats = _.filter(threats, (threat) => {
					if (!scouting.isPlayerSoftWhiteListed(threat.owner.username)) {
						return true
					}
					if (threat.hasBodypart(ATTACK) || threat.hasBodypart(RANGED_ATTACK) || threat.hasBodypart(WORK) || threat.hasBodypart(CLAIM)) {
						return true
					}
					return false

				});
			}

			
			let towers = room.towers;

			if (!invasion && threats.length > 0) {
				let a = Game.cpu.getUsed();
				analyseAttackers(room);
				Memory.stats.profiler["analyseAttackers" + room.name] = Game.cpu.getUsed() - a;
			}

			// TODO: Change target when damaged
			// for (let tower of towers) {

			// }



			let actualThreats = [];
			let totalDangerParts = 0;
			let totalDamageParts = 0;
			let totalDamagePerTick= 0;

			let totalAttackPerTick = 0;
			let totalRangedPerTick = 0;
			let totalHealPerTick = 0;

			Memory.stats.hateCounter = Memory.stats.hateCounter || {};

			for (let threat of threats) {
				if (threat.owner.username != "Invader") {
					let dangerParts = threat.getBoostModifiedCombatParts(true);

					let mod = util.isEdgeOfRoom(threat.pos) ? 0.8 : 1;

					if (threat.ticksToLive < 200) {
						mod *= threat.ticksToLive / 200;
					}

					totalAttackPerTick += dangerParts.numAttack * mod;
					totalRangedPerTick += dangerParts.numRanged * mod;
					totalHealPerTick += dangerParts.numHeal * mod;

					let numDangerParts = (dangerParts.numAttack + dangerParts.numRanged + dangerParts.numWork) * mod;
					totalDamageParts += (dangerParts.numAttack + dangerParts.numRanged) * mod;

					let damagePerTick = (dangerParts.numAttack * ATTACK_POWER + dangerParts.numRanged * RANGED_ATTACK_POWER + dangerParts.numWork * DISMANTLE_POWER / 2) * mod;
					totalDamagePerTick += damagePerTick;

					if (numDangerParts) {
						actualThreats.push(threat);
						totalDangerParts += numDangerParts;

						Memory.stats.hateCounter[threat.owner.username] = (Memory.stats.hateCounter[threat.owner.username] || 0) + (damagePerTick * constants.HATE_PER_DPT);
					}
				}
			}

			const alpha = Math.exp(-(1/(300.)));
			if (mem.totalAttackPerTickAvg && mem.totalAttackPerTickAvg > 0.5 * totalAttackPerTick) {
				mem.totalAttackPerTickAvg = alpha * (mem.totalAttackPerTickAvg) + (1 - alpha) * (totalAttackPerTick || 0)
			}
			else {
				mem.totalAttackPerTickAvg = totalAttackPerTick;
			}

			if (mem.totalRangedPerTickAvg && mem.totalRangedPerTickAvg > 0.5 * totalRangedPerTick) {
				mem.totalRangedPerTickAvg = alpha * (mem.totalRangedPerTickAvg) + (1 - alpha) * (totalRangedPerTick || 0)
			}
			else {
				mem.totalRangedPerTickAvg = totalRangedPerTick;
			}

			if (mem.totalHealPerTickAvg && mem.totalHealPerTickAvg > 0.5 * totalHealPerTick) {
				mem.totalHealPerTickAvg = alpha * (mem.totalHealPerTickAvg) + (1 - alpha) * (totalHealPerTick || 0)
			}
			else {
				mem.totalHealPerTickAvg = totalHealPerTick;
			}

			if (actualThreats.length > 0 || towers.length == 0 || mem.DT > 0.5 || (mem.attackScore || 0) > 0) {

				// console.log("----")
				// console.log(Game.cpu.getUsed())
				// Don't rampart up for deconstruction attacks
				if ((room.controller.safeMode || 0) < 50) {
					if (totalDamageParts > 0 || mem.DT > 0.5) {
						let a = Game.cpu.getUsed();
						assignRampartPriorities(room, threats, mem.totalAttackPerTickAvg, mem.totalRangedPerTickAvg, mem.totalHealPerTickAvg);
						Memory.stats.profiler["assignRampartPriorities" + room.name] = Game.cpu.getUsed() - a;
						if (room.ramparts.length) {
							a = Game.cpu.getUsed();
							combatManager.moveCreepsToRamparts(room.name);
							Memory.stats.profiler["combatManager_moveCreepsToRamparts" + room.name] = Game.cpu.getUsed() - a;
							a = Game.cpu.getUsed();
							checkPressurePoints(room);
							Memory.stats.profiler["checkPressurePoints" + room.name] = Game.cpu.getUsed() - a;
						}
					}
					// console.log(Game.cpu.getUsed())
				}
				mem.attackScore = mem.attackScore || 0;
				mem.towerStratChangeTimer = mem.towerStratChangeTimer || 0;

				if (mem.attackScore < 3e6) {
					mem.attackScore += Math.max(0, totalDamagePerTick - towers.length * 50);
				}
				mem.towerStratChangeTimer += 1;
			}

			// Well this has been going on a long time and/or a lot of shots. Switch up the tower strategy.
			if (mem.towerStratChangeTimer > 30) {
				// Reset the timer.
				mem.towerStratChangeTimer = 0;
				let newStrategy;
				if (mem.hostileBoostedCreeps) {
					if (Math.random() < 0.9) {
						if (room.getStoredEnergy() < 10000) {
							newStrategy = _.sample(constants.TOWER_STRATEGIES_LOW_E_BOOSTED);
						}
						else {
							newStrategy = _.sample(constants.TOWER_STRATEGIES_BOOSTED);
						}
					}
					else {
						newStrategy = constants.TOWER_STRATEGY_SLEEP;
					}
				}
				else {
					if (room.getStoredEnergy() < 10000) {
						newStrategy = _.sample(constants.TOWER_STRATEGIES_LOW_E);
					}
					else {
						newStrategy = _.sample(constants.TOWER_STRATEGIES);
					}
				}

				console.log(room.name, "changing tower strategy to", newStrategy);
				mem.towerStrategy = newStrategy;
			}


			// console.log(Game.cpu.getUsed())


			if (mem.attackScore > 5000 || mem.DT > 0.5 || towers.length == 0) {
				let freeSpawn = 0
				for (let spawn of room.spawns) {
					if (!spawn.spawning) {
						freeSpawn = 1
						break
					}
				}
				if (freeSpawn && combatManager.requestDefenseMission(room, room) > 0) {
					console.log("Request defense spawning", room)
					// Ok, we're spawning defenders, lets lot let the attack score balloon too much
					mem.attackScore -= towers.length * 100;
				}
				else {
					console.log("Request defense not spawning", room)
				}

				// Call any children in
				try {
					let childNames = []
					childNames = childNames.concat(mem.ownedCreeps["rangedChildRoom"] || [])
					childNames = childNames.concat(mem.ownedCreeps["tankChildRoom"] || [])
					childNames = childNames.concat(mem.ownedCreeps["healerChildRoom"] || [])

					for (var childName of childNames) {
						let creep = Game.creeps[childName]
						if (!creep) continue
						creep.memory.targetRoom = room.name;
						creep.memory.ID = 0
						if (creep.room.name != room.name) {
							creep.forceMoveRooms = 1
						}
					}
				}
				catch(e) {
					console.log("Error in defense children call");
					console.log(e.stack);
				}


				if ((room.controller.safeMode || 0) < 300 && Game.myRooms.length > 1) {
					// This has been going on for a while. Find a neighbour and ask them for help
					// Note: we can bounce around neighbours a bit, but the combat manager
					// should prevent overspawn by aggregating.

					// An RCL 8 room has 300 ticks to neutralize a max boosted 30 ATTACK/10 TOUGH creep
					// I don't really like this. Needs to have a bit better analysis.
					let threshold = ((30 * 4 * 30) / 0.4);
					if (room.effectiveLevel == 8) {
						threshold *= 300;
					}
					else if (room.effectiveLevel == 7) {
						threshold *= 200;
					}
					else if (room.effectiveLevel >= 5) {
						threshold *= 66;
					}
					else if (room.effectiveLevel >= 3) {
						threshold *= 33;
					}
					else {
						threshold *= 10;
					}

					let powerCreepProblem = false
					for (let hostile of room.find(FIND_HOSTILE_POWER_CREEPS)) {
						if (hostile.powers[PWR_DISRUPT_SPAWN]) {
							powerCreepProblem = true
							break
						}
						if (hostile.powers[PWR_DISRUPT_TERMINAL]) {
							powerCreepProblem = true
							break
						}
					}


					if ((powerCreepProblem || (mem.attackScore > Math.min(threshold, 2.9e6) && room.effectiveLevel < 7)) && room.ramparts.length && room.effectiveLevel >= 3 && room.towers.length) {
						let friends = room.getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], false);

						// Put a limit on 3 creeps per hostile.
						if (friends.length < threats.length * 3 && friends.length < room.ramparts.length) {
						// if (friends.length < threats.length * 3 || friends.length < 10) {
							let bestNeighbour = undefined;
							let bestScore = 5
							for (let otherRoom of Game.myRooms) {
								if (otherRoom == room) continue;
								if (otherRoom.effectiveLevel < 4 || !otherRoom.storage) continue;
								if (otherRoom.restrictDefensiveMissions(false, true)) continue;


								// Don't spawn loads of crap. If they're weaker than us we don't want them to spam
								// us with low level stuff
								if (otherRoom.effectiveLevel <= 6 && otherRoom.effectiveLevel < room.effectiveLevel) {
									continue;
								}

								let score = safeRoute.getSafeRouteCost(otherRoom, room);
								score -= otherRoom.effectiveLevel;

								if (otherRoom.effectiveLevel < otherRoom.controller.level) {
									score += 1;
								}

								// console.log(otherRoom, score)
								if (score < bestScore) {
									bestScore = score;
									bestNeighbour = otherRoom;
								}
							}


							// HEEEELP!!!
							if (bestNeighbour) {
								// mem.attackScore = Math.max(300000, mem.attackScore - 200000);
								console.log(room, bestNeighbour)
								combatManager.requestDefenseMission(bestNeighbour, room);
							}
						}
					}

					// If it's been a while, ask for help. RCL 8s are hesitent to do this but 7s and below will quickly
					if (powerCreepProblem || Game.time - (mem.lastAttackScore0 || Infinity) > (room.effectiveLevel <= 7 ? 300 : 1500) || room.effectiveLevel < 7) {				
						if (powerCreepProblem || mem.attackScore > Math.min(threshold * 0.5, 2.9e6) || room.effectiveLevel < room.mem.maxRCL || room.effectiveLevel < 7 || (Game.time - (mem.lastAttackScore0 || Infinity) > 500)) {
							combatManager.requestHeavyRoomHold(room.name)
						}
					}
				}
			}

			// let a = Game.cpu.getUsed();

			if (!room.controller.safeMode && room.isAllowedSafeMode()) {
				// Ok, this bit is quite worrying - the safe mode trigger!
				if (room.effectiveLevel >= 4 || room.isCheapSafeMode()) {
					let penetrated = room.breached;
					
					if (penetrated) {
						mem.penetrated = (mem.penetrated || 0) + 1;

						if (mem.penetrated > 3) {
							Memory.stats.hateCounter = Memory.stats.hateCounter || {};
							for (let threat of threats) {
								Memory.stats.hateCounter[threat.owner.username] = Memory.stats.hateCounter[threat.owner.username] || 0;
								Memory.stats.hateCounter[threat.owner.username] += mem.attackScore / threats.length;
							}

							let inRangeOfStructures = false
							for (let threat of threats) {
								if (threat.pos.findFirstInRange(FIND_MY_STRUCTURES, 4, {filter: (s) => {return s.structureType != STRUCTURE_RAMPART}})) {
									inRangeOfStructures = true;
									break
								}
							}

							if (inRangeOfStructures) {		
								let ret = room.controller.activateSafeMode() 
								if (ret != OK) {
									if (Game.time % 10 == 0) console.log("SAFE MODE ACTIVATE FAILED", room.name)

									if (ret == ERR_BUSY && !room.controller.safeModeCooldown && !room.controller.upgradeBlocked && room.controller.safeModeAvailable && room.controller.ticksToDowngrade > CONTROLLER_DOWNGRADE[room.controller.level]/2 - CONTROLLER_DOWNGRADE_SAFEMODE_THRESHOLD + 10) {										
										for (let otherRoom of Game.myRooms) {
											// Sorry...
											if ((otherRoom.controller.safeMode || 0) > 1000 && room.controller.level > otherRoom.controller.level) {
												// otherRoom.memory.unclaimDueToSafeMode = 1
												console.log("Would unclaim", otherRoom, "to free up safe mode for ", room)
												break
											}
										}
									}

									room.defcon = 1;
									room.clearTerminal = 1;
								}
								else {
									console.log("SAFE MODE ACTIVATE", room.name);
									for (let threat of threats) {
										Memory.stats.hateCounter[threat.owner.username] += mem.attackScore * 1000 / threats.length;
									}
									mem.attackScore = 0;
									Memory.rooms[room.name].redesignRamparts = true;
									Memory.lastSafeModeTick = Game.time;
								}
							}
						}
					}
					if (!penetrated) {
						delete mem.penetrated;
					}
				}

				if (actualThreats.length > 0) {
					let spawns = room.find(FIND_MY_SPAWNS);
					let towers = room.towers;

					let anyDamaged = 0
					for (let spawn of spawns) {
						if (spawn.hits != spawn.hitsMax) {
							anyDamaged = 1
						}
					}
					for (let tower of towers) {
						if (tower.hits != tower.hitsMax) {
							anyDamaged = 1
						}
					}



					if (anyDamaged) {
						if (Memory.season2) {
							room.mem.minOpenRampartTick = Game.time + 90 + Math.round(Math.random() * 20)
							for (let rampart of room.ramparts) {
								if (rampart.isPublic) rampart.setPublic(false)
							}
						}

						let ret = room.controller.activateSafeMode() 
						if (ret != OK) {
							if (Game.time % 10 == 0) console.log("SAFE MODE ACTIVATE", room.name)

							if (ret == ERR_BUSY && !room.controller.safeModeCooldown && !room.controller.upgradeBlocked && room.controller.safeModeAvailable && room.controller.ticksToDowngrade > CONTROLLER_DOWNGRADE[room.controller.level]/2 - CONTROLLER_DOWNGRADE_SAFEMODE_THRESHOLD + 10) {										
								for (let otherRoom of Game.myRooms) {
									// Sorry...
									if ((otherRoom.controller.safeMode || 0) > 1000 && room.controller.level > otherRoom.controller.level) {
										// otherRoom.memory.unclaimDueToSafeMode = 1
										console.log("Would unclaim", otherRoom, "to free up safe mode for ", room)
										break
									}
								}
							}

							room.defcon = 1;
							room.clearTerminal = 1;
						}
						else {
							console.log("SAFE MODE ACTIVATE", room.name)
							for (let threat of actualThreats) {
								Memory.stats.hateCounter[threat.owner.username] += mem.attackScore * 1000 / actualThreats.length;
							}

							mem.attackScore = 0;
							Memory.lastSafeModeTick = Game.time;
						}
					}
				}
				// Claimer detection
				let claimers = room.controller.pos.findInRange(FIND_HOSTILE_CREEPS, 2, {filter: (c) => {return c.hasBodypart(CLAIM)}});

				if (claimers.length) {
					let roomTerrain = Game.map.getRoomTerrain(room.name)

					// Check controller adjancency
					let controllerAdjacency = 0;
					for (var i = -1; i <= 1; i++) {
						for (var j = -1; j <= 1; j++) {
							if (!(roomTerrain.get(room.controller.pos.x + i, room.controller.pos.y + j) & TERRAIN_MASK_WALL)) {
								let structs = room.lookForAt(LOOK_STRUCTURES, room.controller.pos.x + i, room.controller.pos.y + j);
								let blocked = 0;
								for (let struct of structs) {
									if (struct.structureType != STRUCTURE_CONTAINER && struct.structureType != STRUCTURE_ROAD) {
										blocked = 1;
									}
								}
								if (!blocked) {
									controllerAdjacency++;
								}
							}
						}
					}

					if (controllerAdjacency) {
						let numClaim = 0;
						for (let claimer of claimers) {
							numClaim += claimer.getNumOfBodyPart(CLAIM);
						}
						if (numClaim > 0) {
							if (room.controller.activateSafeMode() != OK) {
								if (Game.time % 10 == 0) console.log("SAFE MODE ACTIVATE", room.name)
								room.defcon = 1;
								room.clearTerminal = 1;
							}
							else {
								console.log("SAFE MODE ACTIVATE", room.name)
								for (let threat of claimers) {
									Memory.stats.hateCounter[threat.owner.username] += mem.attackScore * 1000 / claimers.length;
								}

								mem.attackScore = 0;
								Memory.lastSafeModeTick = Game.time;
							}
						}
					}
				}

				// TODO: Power creep detection in the same manner as claimer detection if I don't want power enabled
			}
			// Memory.stats.profiler["checkSafeMode" + room.name] = Game.cpu.getUsed() - a;

		}
		else {
			if (Math.random() < 1 / 1e5) {
				delete room.memory.healersDefaultHealOthersFirst
				delete room.memory.healersAlwaysHealSelfFirst
			}


			delete mem.totalAttackPerTickAvg;
			delete mem.totalRangedPerTickAvg;
			delete mem.totalHealPerTickAvg;
			delete mem.oldRampartPrioritiesT;
			delete mem.oldRampartPrioritiesR;
		}



		// Need this to figure out what we've done.
		if (threats.length) {
			room.memory.threatLastHits = {};
			for (let threat of threats) {
				room.memory.threatLastHits[threat.id] = threat.hits;
			}
		}
		else {
			delete room.memory.threatLastHits
		}
	},
};

module.exports = roomDefenseAI;