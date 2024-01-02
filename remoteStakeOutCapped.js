"use strict";

const RemoteStakeOutMission = require('remoteStakeOut')


class RemoteStakeOutCappedMission extends RemoteStakeOutMission {
	constructor(memory, sourceRoomName, targetRoomName, maxEscalation, createNew, priority) {
		memory.type = MISSION_REMOTE_STAKEOUT_CAPPED;
		super(memory, sourceRoomName, targetRoomName, createNew, priority);
		memory.type = MISSION_REMOTE_STAKEOUT_CAPPED;

		if (createNew && this.isActive()) {
			memory.type = MISSION_REMOTE_STAKEOUT_CAPPED;
			memory.maxE = maxEscalation
		}
	}
	requestSpawns() {
		this.memory.roome = this.memory.roome || {};

		for (var roomName of this.memory.harassRooms) {
			if (!this.memory.roome[roomName]) {
				let effectiveRCL = Memory.rooms[this.memory.targetRoomName].nonLocalCombatCreeps ? 8 : Memory.rooms[this.memory.targetRoomName].rcl

				this.memory.roome[roomName] = Math.floor(Game.rooms[this.memory.sourceRoomName].effectiveLevel / 3 + effectiveRCL / 3);
			}
			else {
				this.memory.roome[roomName] = Math.min(this.memory.maxE, this.memory.roome[roomName])
			}
		}

			
		super.requestSpawns();
	}

}

module.exports = RemoteStakeOutCappedMission