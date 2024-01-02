"use strict";

const RemoteRamboDefenseMission = require('remoteRamboDefense')

// Mission id != 0 means active mission, otherwise it's inactive
class ChildRemoteRamboDefenseMission extends RemoteRamboDefenseMission {
	constructor(memory, sourceRoomName, childRoomName, protectRoomNames, createNew, priority) {
		memory.type = memory.type || MISSION_REMOTE_CHILD_RAMBO_DEFENSE;
		memory.childRoomName = childRoomName;

		super(memory, sourceRoomName, protectRoomNames, createNew, priority);
	}
}

module.exports = ChildRemoteRamboDefenseMission