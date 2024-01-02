"use strict";

const FormationAssault = require('formationAssault')

class RoomBlitz extends FormationAssault {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.squadSize = 6;
		memory.mask = [[0,0],[1,0],[0,1],[1,1],[0,2],[1,2]];

		memory.type = memory.type || MISSION_ROOM_BLITZ;

		super(memory, sourceRoomName, targetRoomName, createNew, priority);
	}


	getBestTarget(squadHeal, formationIdx) {
		if (!Game.flags["blitz_" + this.memory.targetRoomName]) {
			console.log("Looking for flag", "blitz_" + this.memory.targetRoomName)
			return
		}


		return Game.flags["blitz_" + this.memory.targetRoomName].pos;
	}


	tick() {
		let cpu = Game.cpu.getUsed()
		super.tick()
		Memory.stats.profiler["combatManagerTickFormationAssault"] += Game.cpu.getUsed() - cpu;

	}

	requestSpawns(restrictBoosts, refresh) {


		return ret;
	}	
}


module.exports = RoomBlitz