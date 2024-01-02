"use strict";

const RoomAssaultMission = require('roomAssault')

class RoomAssaultMissionSnake extends RoomAssaultMission {
	constructor(memory, sourceRoomName, targetRoomName, createNew, priority) {
		memory.squadSize = 2;
		memory.mask = [[0,0]];

		memory.type = memory.type || MISSION_ROOM_ASSAULT;

		super(memory, sourceRoomName, targetRoomName, createNew, priority);
	}
}


module.exports = RoomAssaultMissionSnake