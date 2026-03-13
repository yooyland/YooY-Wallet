// Minimal Android shim for react-native-worklets
// Native part is disabled on Android; provide safe fallbacks to avoid runtime crashes.
import React from 'react';

export class WorkletsError extends Error {}

export const ErrorBoundary = ({ children }) => {
	return children ?? null;
};

export const runOnJS = (fn) => {
	return (...args) => {
		if (typeof fn === 'function') {
			try { return fn(...args); } catch {}
		}
		return undefined;
	};
};

export const runOnUI = (fn) => {
	// No UI thread execution on this shim; simply return the function
	return fn;
};

export const isWorkletAvailable = () => false;

export default {
	WorkletsError,
	ErrorBoundary,
	runOnJS,
	runOnUI,
	isWorkletAvailable,
};


