"use strict";

// This has to be your default public segment
const segmentID = 98;

const requestTypes = {
	NO_HARASS: 0,
	ATTACK_PLAYER: 1,
}

let requestOjb = {
	type: -1,
	data: {},
	startTick: -1,
	endTick: -1,
}


let diplomacy = {
	// Call at start of tick. Maybe it doesn't need to be. The default I've written doesn't...
	startOfTick() {
		Memory.diplomacyData = Memory.diplomacyData || {};
		Memory.diplomacyData.myRequests = Memory.diplomacyData.myRequests || []
		Memory.diplomacyData.myConfirmed = Memory.diplomacyData.myConfirmed || []
	},

	// Returns an array of expired requests
	expireOldRequests() {
		let expiredRequests = []
		for (let request of _.clone(Memory.diplomacyData.myConfirmed)) {
			if (Game.time > request.endTick) {
				expiredRequests.push(request)
				_.pull(Memory.diplomacyData.myConfirmed, request)
			}
		}

		return expiredRequests
	},

	postRequest(request) {
		if (request.type < 0 || request.startTick < 0 || request.endTick < 0) {
			console.log(JSON.stringify(request))
			throw(new Error("Request with dodgy args"))
		}

		let stringified = JSON.stringify(request)

		for (let existingRequest of Memory.diplomacyData.myRequests) {
			if (JSON.stringify(existingRequest) == stringified) {
				console.log(JSON.stringify(request))
				throw(new Error("Duplicate request"))
			}
		}

		Memory.diplomacyData.myRequests.push(request)
	},


	// Returns true if other person's request accepted, false otherwise. 
	testRequest(request) {



	},

	// This sets foreign segments. Maybe you set them yourself for some other reason
	// Up to you to fix that.
	checkForOffers(playerList) {
		if (!playerList.length) return;

		// Only work 10% of the time
		if (Game.time % (10 * playerList.length) >= playerList.length) return

		let currentPlayerName = playerList[Game.time % playerList.length];

		if (RawMemory.foreignSegment && RawMemory.foreignSegment.username == currentPlayerName) {
			let segmentObj = JSON.parse(RawMemory.foreignSegment.data);

			let playerRequests = segmentObj.requests;
			let playerConfirmed = segmentObj.confirmed;

			for (let request of playerRequests) {
				if (this.testRequest(request)) {
					Memory.diplomacyData.myConfirmed.push(request)
				}
			}


		

		}
		else {
			console.log("Diplomacy either has no segment or has the wrong name?", currentPlayerName)
		}
		
		let nextPlayerName = playerList[(Game.time + 1) % playerList.length];

		RawMemory.setActiveForeignSegment(nextPlayerName)
	},


	tick() {
		// Maybe we want to consider reoffering them?
		let expiredRequests = this.expireOldRequests()

		// Check and decide on other people's offers.
		this.checkForOffers()

		// Do something.
		// let newRequest = _.clone(requestObj)
		// newRequest.type = requestTypes.NO_HARASS
		// newRequest.data = {myRooms: xyz, yourRooms: abc}
		// newRequest.startTick = 12321
		// newRequest.endTick = 12321
		// this.postRequest(request)
	},



	// Call at end of tick
	endOfTick() {
		// Memory.requestedSegments is my thing... this segment aliases with some other rare ones so... yeah. You probably don't need it.
		if (!Memory.requestedSegments[9] && Object.keys(RawMemory.segments).length < 10) {			
			RawMemory.segments[segmentID] = JSON.stringify({requests: Memory.diplomacyData.myRequests, confirmed: Memory.diplomacyData.myConfirmed})

			// If you're already setting public segements somewhere this will overwrite that. You should
			// fix that yourself because I can't fix it for you.
			RawMemory.setDefaultPublicSegment(segmentID);
			RawMemory.setPublicSegments([segmentID]);
		}
	},
}



module.exports = diplomacy;