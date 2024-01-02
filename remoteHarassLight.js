"use strict";

const RemoteHarassMission = require('remoteHarass')

class RemoteHarassLightMission extends RemoteHarassMission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.type = MISSION_REMOTE_HARASS_LIGHT;

		// Do this before we make our mission active.
		super(memory, sourceRoomName, targetRoomName, createNew, priority);

		// if (createNew) console.log(sourceRoomName, targetRoomName, this.isActive())

		if (createNew && this.isActive()) {
			// Be sure
			memory.type = MISSION_REMOTE_HARASS_LIGHT;

			// Want to be able to bounce.
			if (memory.harassRooms.length <= 1) {
				console.log("Single room light harass", sourceRoomName, targetRoomName)
				// memory.fTick = Game.time;
				this.missionComplete(true);
			}
		}
	}

	tick() {
		super.tick();

		// These are hacks to overwrite the defaults.
		// If light harass is being bounced it's not bad: they've spent on defending.
		if (this.memory.bouncedCount) {
			this.memory.bouncedCount = 0;
		}

		// Don't escalate it hard.
		if (this.memory.e > 0) {
			this.memory.e = 0;
		}
	}
}

module.exports = RemoteHarassLightMission