//parse bst file:
const fs = require('fs');

//Based on "Taming the BeaST":
// https://mirrors.concertpass.com/tex-archive/info/bibtex/tamethebeast/ttb_en.pdf
//and this VMS help file:
// https://mirror.math.princeton.edu/pub/CTAN/info/bibtex/bibtex.hlp

const VERBOSE = false;

function parseFile(filename) {
	const data = fs.readFileSync(filename, {encoding:'utf8'});
	return parse(data);
}

function parse(data) {
	if (VERBOSE) console.log(" ---- parsing starts ---- ");

	/*
	Expecting something like this: (not official, just my reading of the docs)
	NOTE: @string and @comment are not accounted for here yet:

	BIB = ENTRIES
	ENTRIES = IGNORED ENTRY ENTRIES
	        | IGNORED
	IGNORED = [^@]*
	ENTRY = [@] ENTRY_NAME [{] KEY COMMA_FIELDS COMMA? [}]
	      | [@] ENTRY_NAME [(] KEY COMMA_FIELDS COMMA? [)]
	ENTRY_NAME = [^\s{(]+
	KEY = [^\s{}()",]+
	COMMA = [\s]* [,] [\s*]
	COMMA_FIELDS = COMMA FIELD COMMA_VALUES
	             | empty
	FIELD = FIELD_NAME [\s]* [=] [\s]* FIELD_VALUE
	FIELD_NAME = [^\s"{}()=,]+
	FIELD_VALUE = [\d]+
	            | ["] QUOTED_VALUE ["]
	            | [{] BALANCED_VALUE [}]
	QUOTED_VALUE = [^{}"]*
	             | [^{}"]* [{] BALANCED_VALUE [}] [^{}"]*
	BALANCED_VALUE = [^{}]*
	               | [^{}]* [{] BALANCED_VALUE [}] [^{}]*
	*/



	const entries = {};

	const strings = {};

	let pos = 0;

	function skipWhitespace() {
		if (VERBOSE) console.log(`Skipping whitespace at '${data.substr(pos, 20)}...'`);
		while (pos < data.length && /\s/.test(data[pos])) ++pos;
		if (pos >= data.length) throw new Error("Ran out of data while skipping whitespace.");
	}

	function readUntil(regex, what) {
		if (VERBOSE) console.log(`reading until ${regex} at '${data.substr(pos, 20)}...'`);
		const begin = pos;
		while (pos < data.length && !regex.test(data[pos])) ++pos;
		if (pos >= data.length) throw new Error(`Ran out of data while reading ${what} until ${regex}.`);
		if (pos === begin) throw new Error(`Empty data reading ${what} until ${regex}.`);
		return data.substr(begin, pos - begin);
	}

	function readFieldValue() {
		if (VERBOSE) console.log(`reading field value at '${data.substr(pos, 20)}...'`);
		if (pos >= data.length) {
			throw new Error(`Expecting field value, but was at EOF.`);
		} else if (data[pos] === '"' || data[pos] === '{') {
			//quoted or braced field
			const quoted = (data[pos] === '"');
			let depth = (quoted ? 0 : 1);
			const begin = pos;
			pos += 1;
			while (true) {
				//read to next interesting character:
				while (pos < data.length && /[^{}"]/.test(data[pos])) ++pos;
				if (pos >= data.length) throw new Error("Ran out of data reading field value.");
				if (data[pos] === '{') {
					depth += 1;
					pos += 1;
				} else if (data[pos] === '}') {
					depth -= 1;
					if (depth < 0) throw new Error("Unbalanced '}' reading field value.");
					pos += 1;
					if (depth === 0 && !quoted) break;
				} else if (data[pos] === '"') {
					pos += 1;
					if (depth === 0 && quoted) break;
				}
			}
			return data.substr(begin, pos-begin);
		} else if (/[0-9]/.test(data[pos])) {
			//numeric field
			return readUntil(/[^0-9]/, "numeric field value");
		} else if (/[a-zA-Z]/.test(data[pos])) {
			//strings field
			//TODO: '#' as string joiner
			const string = readUntil(/[\s#"@%'(),={}]/, "string name").toLowerCase();
			if (!(string in strings)) throw new Error(`String '${string}' is undefined.`);
			return strings[string];
		} else {
			throw new Error(`Expecting field value, but first character was '${data[pos]}'.`);
		}
	}

	while (pos < data.length) {
		//skip until an '@' sign (start of entry):
		while (pos < data.length && data[pos] !== '@') pos += 1;
		if (pos === data.length) break;

		//read entry type (anything up until '{', '(', or whitespace):
		const type = readUntil(/[\s{(]/, "entry type");
		if (!(data[pos] === '(' || data[pos] === '{')) throw new Error("Entry name containing whitespace.");
		const close = (data[pos] === '(' ? ')' : '}');
		pos += 1;

		//TODO: deal with @comment

		//deal with @string:
		if (type.toLowerCase() === "@string") {
			skipWhitespace();
			const key = readUntil(/[\s{}()",]/, "string key").toLowerCase();
			skipWhitespace();
			if (data[pos] !== '=') throw new Error("String must have '=' after name.");
			pos += 1;
			skipWhitespace();
			const value = readFieldValue();
			strings[key] = value;
			continue;
		}

		//read entry key:
		skipWhitespace();
		const key = readUntil(/[\s{}()",]/, "entry key");
		skipWhitespace();

		const fields = {};

		//read entry fields:
		while (data[pos] === ',') {
			pos += 1;
			skipWhitespace();
			if (data[pos] === close) break;
			//field name:
			const name = readUntil(/[\s"{}()=,]/, "field name");
			skipWhitespace();
			if (data[pos] !== '=') throw new Error("Field must have '=' after name.");
			pos += 1;
			skipWhitespace();
			const value = readFieldValue();
			fields[name] = value;
			skipWhitespace();
		}

		if (data[pos] !== close) throw new Error(`Entry didn't end with ${close}.`);

		entries[key] = {key:key, type:type, fields:fields};
	}

	return entries;
}


//Clean up TeX-like value (ad-hoc):
function unTeXValue(value) {
	let clean = value;
	//strip quotes:
	if (clean[0] === '"' && clean[clean.length-1] === '"') clean = clean.substr(1, clean.length-2);

	//TODO: deal with TeX commands?
	if (/\\/.test(clean)) console.warn(`Not interpreting TeX command in '${value}'`)

	//ignore any remaining brackets:
	clean = clean.replace(/[{}]/g,'');
	return clean;
}

//Split 'authors' value into list of objects with {First, von, Last, Jr}
function splitAuthors(value) {
	//strip surrounding '{' or '"':
	if ( (value[0] === '"' && value[value.length-1] === '"')
	  || (value[0] === '{' && value[value.length-1] === '}') ) {
		value = value.substr(1, value.length-2);
	}

	//NOTE: I suspect that a brace-depth>0 'and' would not be a split, nor would a ','

	const authors = [];
	for (const author of value.split(/\s+and\s+/)) {
		const chunks = author.split(/\s*,\s*/);
		if (chunks.length === 1) {
			const words = chunks[0].split(/\s+/);
			let vonBegin = words.length-1;
			let vonEnd = words.length-1;
			for (let i = 0; i + 1 < words.length; ++i) {
				//really should be "first character at depth 0 or first special character at any depth"
				if (/[a-z]/.test(words[i][0])) {
					vonBegin = Math.min(vonBegin, i);
					vonEnd = i+1;
				}
			}
			authors.push({
				First:words.slice(0,vonBegin).join(''),
				von:words.slice(vonBegin,vonEnd).join(''),
				Last:words.slice(vonEnd,words.length).join(''),
				Jr:''
			});
		} else if (chunks.length === 2 || chunks.length === 3) {
			const words = chunks[0].split(/\s+/);
			let vonBegin = 0;
			let vonEnd = 0;
			for (let i = 0; i + 1 < words.length; ++i) {
				//really should be "first character at depth 0 or first special character at any depth"
				if (/[a-z]/.test(words[i][0])) {
					vonBegin = Math.min(vonBegin, i);
					vonEnd = i+1;
				}
			}
			authors.push({
				First:(chunks.length === 3 ? chunks[2] : chunks[1]),
				von:words.slice(vonBegin,vonEnd).join(''),
				Last:words.slice(vonEnd,words.length).join(''),
				Jr:(chunks.length === 3 ? chunks[1] : '')
			});
		} else {
			throw new Error(`Authors with more than two commas: "${value}"`)
		}
	}

	return authors;
}

module.exports = {
	parseFile,
	parse,
	unTeXValue,
	splitAuthors
};
