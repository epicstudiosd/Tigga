"use strict";

const RoomLowEAssaultMission = require('roomLowEAssault')

class RoomLowEAssaultMission2x2 extends RoomLowEAssaultMission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.squadSize = 4;
		memory.mask = [[0,0],[1,0],[0,1],[1,1]];

		memory.type = memory.type || MISSION_ROOM_LOW_ENERGY_ASSAULT;

		super(memory, sourceRoomName, targetRoomName, createNew, priority);
	}
}

module.exports = RoomLowEAssaultMission2x2