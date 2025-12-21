const React = require('react');

function HelmetProvider({ children }) {
	return React.createElement(React.Fragment, null, children);
}

function Helmet(_props) {
	return null;
}

class HelmetData {
	context = {};
}

module.exports = { HelmetProvider, Helmet, HelmetData };
module.exports.default = module.exports;


