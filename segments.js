"use strict";


var segments = {
	forceSegmentActive : function(segmentId) {
		if (Memory.requestedSegments.indexOf(segmentId) == -1) {
			if (!Memory.requestedSegments[9] || Math.random() < 0.25) {
				Memory.requestedSegments[9] = segmentId;
			}
		}
	},

	// Global caching doesn't work well without ivm.
	loadSegmentData : function(segmentId) {
		if (segmentId != segmentId || segmentId === undefined || segmentId === null) {
			throw(new Error("Bad segment passed to loadSegmentData"))
		}
		global.segmentData = global.segmentData || {};

		if (!global.segmentData[segmentId]) {
			if (RawMemory.segments[segmentId] !== undefined) {
				global.segmentData[segmentId] = JSON.parse(RawMemory.segments[segmentId] || "{}");
				Memory.requestedSegments[9] = 0; // Hmph, I'd rather delete it but the engine doesnt like that. 0 is not a valid value.
			}
			else if (Memory.requestedSegments.indexOf(segmentId) == -1) {
				if (!Memory.requestedSegments[9] || Math.random() < 0.25) {
					Memory.requestedSegments[9] = segmentId;
				}
			}
		}

		return global.segmentData[segmentId];
	},

	writeAndLockSegment : function(segmentId, segmentData) {
		Memory.readOnlySegments = Memory.readOnlySegments || {};
		Memory.readOnlySegments[segmentId] = 1;

		if (RawMemory.segments[segmentId] === undefined) {
			console.log("Trying to write to an unloaded segment", segmentId)
			throw "Trying to write to an unloaded segment";
		}
		else {
			RawMemory.segments[segmentId] = JSON.stringify(segmentData);
		}
	},

	storeSegments : function() {
		let data = global.segmentData || {};
		Memory.readOnlySegments = Memory.readOnlySegments || {};
		for (let segmentId in data) {
			// Read only segments can't be modified.
			if (!Memory.readOnlySegments[segmentId] && segmentId in RawMemory.segments) {
				RawMemory.segments[segmentId] = JSON.stringify(global.segmentData[segmentId]);
			}
		}
	},
}

module.exports = segments;