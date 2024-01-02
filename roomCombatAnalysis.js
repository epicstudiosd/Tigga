"use strict";

let util = require("util")


const alphaRMAAtRangeOne = Math.exp(-(1/(100.)))
const alphaRangedShootsAtClosest = Math.exp(-(1/(100.)))

// The aim is to predict what the other side will do
var roomCombatAnalysis = {
	analyse(room) {

		global.inTickObject.roomCombatAnalysis = global.inTickObject.roomCombatAnalysis || {}

		// Done it already!
		if (global.inTickObject.roomCombatAnalysis[room.name]) {
			return
		}

		global.inTickObject.roomCombatAnalysis[room.name] = {}
		global.roomCombatAnalysis = global.roomCombatAnalysis || {}

		Memory.playerCombatAnalysis = Memory.playerCombatAnalysis || {};

		this.analyseRangedAttacks(room)
	},

	processEvents(room) {
		let eventLog = room.getEventLog()
		global.inTickObject.roomCombatAnalysis[room.name].attackEvents = []
		for (let event of eventLog) {
			if (event.event == EVENT_ATTACK) {
				global.inTickObject.roomCombatAnalysis[room.name].attackEvents.push(event)
			}
		}
	},

	getAttackEvents(room) {
		if (global.inTickObject.roomCombatAnalysis[room.name].attackEvents) {
			return global.inTickObject.roomCombatAnalysis[room.name].attackEvents
		}
		else {
			this.processEvents(room);
		}

		return global.inTickObject.roomCombatAnalysis[room.name].attackEvents
	},

	analyseRangedAttacks(room) {
		if (global.roomCombatAnalysis[room.name] && global.roomCombatAnalysis[room.name].tick == Game.time - 1) {
			let anyInfo = Object.keys(global.roomCombatAnalysis[room.name].hostileRMAAtRangeOne).length || Object.keys(global.roomCombatAnalysis[room.name].hostileClosestCreep).length

			if (anyInfo) {				
				// Lazy parse
				let attackEvents = this.getAttackEvents(room);

				let lastTickData = global.roomCombatAnalysis[room.name]
				let meleeEvents = []
				let rangedEvents = []
				for (let event of attackEvents) {
					if (Game.getObjectById(event.objectId) && Game.getObjectById(event.objectId).structureType) continue
						
					if (event.data.attackType == EVENT_ATTACK_TYPE_RANGED || event.data.attackType == EVENT_ATTACK_TYPE_RANGED_MASS) {
						rangedEvents.push(event)
					}
					else if (event.data.attackType == EVENT_ATTACK_TYPE_MELEE) {
						meleeEvents.push(event)
					}
				}

				// Range 1 RMA
				for (let rangedEvent of rangedEvents) {
					let owner = lastTickData.hostileRMAAtRangeOne[rangedEvent.objectId]
					if (owner) {
						Memory.playerCombatAnalysis[owner] = Memory.playerCombatAnalysis[owner] || {}
						Memory.playerCombatAnalysis[owner].chanceRMAAtRangeOne = alphaRMAAtRangeOne * (Memory.playerCombatAnalysis[owner].chanceRMAAtRangeOne || 0.5) + (1 - alphaRMAAtRangeOne) * (rangedEvent.data.attackType == EVENT_ATTACK_TYPE_RANGED_MASS ? 1 : 0)
					}
				}

				// Ranged attack at closest
				for (let rangedEvent of rangedEvents) {
					// Ignore these.
					if (rangedEvent.data.attackType == EVENT_ATTACK_TYPE_RANGED_MASS) {
						continue
					}
					let data = lastTickData.hostileClosestCreep[rangedEvent.objectId];
					if (!data) continue
					let owner = data.o
					if (!owner) continue
					let shotAtClosest = 0;
					if (rangedEvent.data.targetId == data.t) {
						shotAtClosest = 1;
					}

					Memory.playerCombatAnalysis[owner] = Memory.playerCombatAnalysis[owner] || {}
					Memory.playerCombatAnalysis[owner].rangedShootsAtClosest = alphaRangedShootsAtClosest * (Memory.playerCombatAnalysis[owner].rangedShootsAtClosest || 0) + (1 - alphaRangedShootsAtClosest) * shotAtClosest
				}

				for (let rangedEvent of rangedEvents) {
					// Ignore these.
					if (rangedEvent.data.attackType == EVENT_ATTACK_TYPE_RANGED_MASS) {
						continue
					}
					let data = lastTickData.hostileFirstCreep[rangedEvent.objectId];
					if (!data) continue
					let owner = data.o
					if (!owner) continue
					let shotAtFirst = 0;
					if (rangedEvent.data.targetId == data.t) {
						shotAtFirst = 1;
					}

					Memory.playerCombatAnalysis[owner] = Memory.playerCombatAnalysis[owner] || {}
					Memory.playerCombatAnalysis[owner].rangedShootsAtFirst = alphaRangedShootsAtClosest * (Memory.playerCombatAnalysis[owner].rangedShootsAtFirst || 0) + (1 - alphaRangedShootsAtClosest) * shotAtFirst
				}

				// Strongholds
				// if ((room.mem.towerShootsAtStrongholdMax || 0) > 0.99 && lastTickData.strongholdLogicTargetId) {
				// 	for (let rangedEvent of rangedEvents) {
				// 		let shotAtStrongholdTarget = (rangedEvent.data.targetId == lastTickData.strongholdLogicTargetId)
						
				// 		room.mem.creepsShootAtStrongholdMax = alphaRangedActsAsStronghold * (room.mem.creepsShootAtStrongholdMax || 0) + (1 - alphaRangedActsAsStronghold) * (shotAtStrongholdTarget ? 1 : 0)
				// 	}
				// }

				// Attack at closest
				for (let meleeEvent of meleeEvents) {
					let data = lastTickData.hostileClosestCreep[meleeEvent.objectId];
					if (!data) continue
					if (data.r > 1) continue
					let owner = data.o
					if (!owner) continue
					let attacksClosest = 0;
					if (meleeEvent.data.targetId == data.t) {
						attacksClosest = 1;
					}

					Memory.playerCombatAnalysis[owner] = Memory.playerCombatAnalysis[owner] || {}
					Memory.playerCombatAnalysis[owner].attacksClosest = alphaRangedShootsAtClosest * (Memory.playerCombatAnalysis[owner].attacksClosest || 0) + (1 - alphaRangedShootsAtClosest) * attacksClosest
				}
			}
		}


		let newData = {tick: Game.time}
		// Don't I want active only? More expensive to get, but cheaper to analyse
		let allMyCombatCreeps = room.getAllFriendlyCreepsWithBodyParts([ATTACK, RANGED_ATTACK, HEAL], false)

		newData.hostileRMAAtRangeOne = {}
		newData.hostileClosestCreep = {}
		newData.hostileFirstCreep = {}

		if (allMyCombatCreeps.length) {			
			let hostileAttackCreeps = room.getAllHostileCreepsWithBodyParts([ATTACK], false)
			let hostileRangedCreeps = room.getAllHostileCreepsWithBodyParts([RANGED_ATTACK], false)
			for (let creep of hostileRangedCreeps) {
				// Do they RMA at range 1?
				if (creep.pos.findFirstInRange(allMyCombatCreeps, 1)) {
					newData.hostileRMAAtRangeOne[creep.id] = creep.owner.username
				}
				let firstCreep = creep.pos.findFirstInRange(allMyCombatCreeps, 3)

				if (firstCreep) {					
					let closestCreep = creep.pos.findClosestByRange(allMyCombatCreeps)
					let range = closestCreep.pos.getRangeToPos(creep.pos)
					if (range <= 3) {
						newData.hostileClosestCreep[creep.id] = {o: creep.owner.username, t: closestCreep.id, r: range}
					}

					newData.hostileFirstCreep[creep.id] = {o: creep.owner.username, t: firstCreep.id}
				}

			}
			for (let creep of hostileAttackCreeps) {
				if (newData.hostileClosestCreep[creep.id]) continue
				let closestCreep = creep.pos.findClosestByRange(allMyCombatCreeps)
				if (closestCreep.pos.isNearToPos(creep.pos)) {
					newData.hostileClosestCreep[creep.id] = {o: creep.owner.username, t: closestCreep.id, r: 1}
				}
			}
		}

		// if (global.defenseAnalysis && global.defenseAnalysis[room.name] && global.defenseAnalysis[room.name].strongholdLogicTargetId) {
		// 	newData.strongholdLogicTargetId = global.defenseAnalysis[room.name].strongholdLogicTargetId
		// }


		global.roomCombatAnalysis[room.name] = newData
	},

	analyseHeals(room, healEvents) {

	},

}


module.exports = roomCombatAnalysis;
