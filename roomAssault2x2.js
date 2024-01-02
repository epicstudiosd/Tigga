"use strict";

const RoomAssaultMission = require('roomAssault')

class RoomAssaultMission2x2 extends RoomAssaultMission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.squadSize = 4;
		memory.mask = [[0,0],[1,0],[0,1],[1,1]];

		memory.type = memory.type || MISSION_ROOM_ASSAULT;

		super(memory, sourceRoomName, targetRoomName, createNew, priority);
	}
}


module.exports = RoomAssaultMission2x2