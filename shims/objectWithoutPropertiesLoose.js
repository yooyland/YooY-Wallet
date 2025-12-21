function objectWithoutPropertiesLoose(source, excluded) {
	if (source == null) return {};
	var target = {};
	var sourceKeys = Object.keys(source);
	for (var i = 0; i < sourceKeys.length; i++) {
		var key = sourceKeys[i];
		if (excluded.indexOf(key) >= 0) continue;
		if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
		target[key] = source[key];
	}
	return target;
}
module.exports = objectWithoutPropertiesLoose;
module.exports.default = module.exports;


