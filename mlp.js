"use strict";

const constants = require("constants")

function init(_inputSize, _layerSizes, _outputSize, mem) {
	let weights = [];
	let bias = [];

	for (let i = 0; i <= _layerSizes.length; i++) {
		let inputSize;
		let outputSize;
		if (i == 0) {
			inputSize = _inputSize
		}
		else {
			inputSize = _layerSizes[i-1];
		}

		if (i == _layerSizes.length) {
			outputSize = _outputSize;
		}
		else {
			outputSize = _layerSizes[i];
		}

		weights[i] = [];
		bias[i] = [];
		// Row major
		for (let m = 0; m < outputSize; m++) {
			weights[i][m] = [];
			bias[i][m] = (2 * Math.random() - 1) / outputSize;
			for (let k = 0; k < inputSize; k++) {
				weights[i][m][k] = 2 * (2 * Math.random() - 1) / Math.sqrt(0.5 * (inputSize + outputSize));
			}
		}
	}

	mem.weights = weights;
	mem.bias = bias;
}

function fprop(_input, mem, exampleId) {
	let weights = mem.weights;
	let bias = mem.bias;
	let trainingData = [_.clone(_input)];

	let input = _input;
	let output;

	let layerId = 0;
	for (; layerId < weights.length; layerId++) {
		let layerWeights = weights[layerId];
		let layerBias = bias[layerId];

		let M = layerWeights.length;
		let K = input.length;

		output = [];

		// GEMM
		// Row major
		for (let m = 0; m < M; m++) {
			output[m] = layerBias[m];
			for (let k = 0; k < K; k++) {
				output[m] += layerWeights[m][k] * input[k];
			}
		}

		// Activation
		if (layerId != weights.length - 1) {
			for (let m = 0; m < M; m++) {
				output[m] = Math.tanh(output[m])
			}
		}

		// For bprop
		trainingData.push(_.clone(output));

		input = output;
	}

	// Softmax
	let outputSize = weights[layerId-1].length

	let max = _.max(output)

	for (let m = 0; m < outputSize; m++) {
		output[m] = Math.exp(output[m] - max);
	}

	let sum = _.sum(output)
	for (let m = 0; m < outputSize; m++) {
		output[m] = output[m] / sum;
	}

	trainingData.push(_.clone(output));
	mem.trainingData = mem.trainingData || {};
	mem.trainingData[exampleId] = trainingData

	return output;
}

const alphaCorrectness = Math.exp(-(1/(1000.)))

function bprop(realOutput, model, trainingData, learningRate) {
	let weights = model.weights;
	let bias = model.bias;

	let layerId = weights.length;
	let outputSize = realOutput.length


	// Error
	let error = []
	for (let m = 0; m < outputSize; m++) {
		error[m] = realOutput[m] - trainingData[layerId + 1][m];
	}

	let correct = 0;
	let maxPred = _.max(trainingData[layerId + 1]);
	for (let m = 0; m < outputSize; m++) {
		if (realOutput[m] == 1) {
			if (trainingData[layerId + 1][m] == maxPred) {
				correct = 1;
			}
			break;
		}
	}

	model.realTrials = (model.realTrials || 0) + 1
	model.trials = alphaCorrectness * (model.trials || 0) + (1 - alphaCorrectness) * 1;
	model.numCorrect = alphaCorrectness * (model.numCorrect || 0) + (1 - alphaCorrectness) * correct;
	model.accuracy = model.numCorrect / model.trials;


	let gradOutput = error;
	let gradInput = [];
	// Softmax
	let sum = 0;
	for (let m = 0; m < outputSize; m++) {
		sum += gradOutput[m] * trainingData[layerId + 1][m];
	}

	for (let m = 0; m < outputSize; m++) {
		gradInput[m] = trainingData[layerId + 1][m] * (gradOutput[m] - sum);
	}

	gradOutput = gradInput

	layerId--;

	for (; layerId >= 0; layerId--) {
		let layerWeights = weights[layerId]
		let layerBias = bias[layerId]
		let M = layerWeights[0].length;
		let K = gradOutput.length;

		gradInput = [];

		// Activation
		if (layerId != weights.length - 1) {
			for (let m = 0; m < M; m++) {
				let tanh = Math.tanh(gradOutput[m])
				gradOutput[m] = 1 - tanh * tanh;
			}
		}

		// Gradient wrt output
		for (let m = 0; m < M; m++) {
			gradInput[m] = 0;
			for (let k = 0; k < K; k++) {
				// console.log(m, k, gradInput, layerWeights[k], gradOutput)
				gradInput[m] += layerWeights[k][m] * gradOutput[k];
			}
		}

		// Gradient wrt weights with apply.
		for (let m = 0; m < gradOutput.length; m++) {
			for (let n = 0; n < trainingData[layerId].length; n++) {
				layerWeights[m][n] += learningRate * gradOutput[m] * trainingData[layerId][n]
			}
		}

		// Gradient wrt bias with apply.
		for (let m = 0; m < gradOutput.length; m++) {
			layerBias[m] += learningRate * gradOutput[m]
		}

		gradOutput = gradInput;
	}

	return
}

var mlp = {
	run : function(input, lastTickResult, signature, exampleId, mode) {
		Memory.mlps = Memory.mlps || {}
		if (mode == constants.NEURAL_NETWORK_PAIRED_ATTACKERS) {
			Memory.mlps[mode] = Memory.mlps[mode] || {};

			// Can I just do 1?
			if (Memory.mlps[mode][signature] && Game.time - (Memory.mlps[mode][signature].lastTouched || 0) > 10) {
				delete Memory.mlps[mode][signature].trainingData
			}

			// console.log(lastTickResult);

			if (!Memory.mlps[mode][signature] || !Memory.mlps[mode][signature].weights) {
				Memory.mlps[mode][signature] = {};
				init(3, [4,], 2, Memory.mlps[mode][signature]);
			}
			else if (lastTickResult && Memory.mlps[mode][signature].trainingData && Memory.mlps[mode][signature].trainingData[exampleId]) {
				bprop(lastTickResult, Memory.mlps[mode][signature], Memory.mlps[mode][signature].trainingData[exampleId], constants.NEURAL_NETWORK_PAIRED_ATTACKERS_LEARNING_RATE);
			}

			Memory.mlps[mode][signature].lastTouched = Game.time;

			// Either used or now invalid
			if (Memory.mlps[mode][signature].trainingData && Memory.mlps[mode][signature].trainingData[exampleId]) {
				delete Memory.mlps[mode][signature].trainingData[exampleId]
			}

			if (input) {
				// Normalize. Input is %, lets make it in the -1 to 1 range.
				for (let i = 0; i < input.length; i++) {
					input[i] *= 2;
					input[i] -= 1;
				}

				let out = fprop(input, Memory.mlps[mode][signature], exampleId)
				// console.log(out);
				return out;
			}

		}
	},
}


module.exports = mlp;
