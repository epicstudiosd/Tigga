"use strict";

const RoomAssaultMission = require('roomAssault')

class RoomAssaultMission3x3 extends RoomAssaultMission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.squadSize = 9;
		memory.mask = [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1],[0,2],[1,2],[2,2]];

		memory.type = memory.type || MISSION_ROOM_ASSAULT_LARGE;

		super(memory, sourceRoomName, targetRoomName, createNew, priority);
	}
}

module.exports = RoomAssaultMission3x3